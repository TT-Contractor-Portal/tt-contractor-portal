const { createClient } = require("@supabase/supabase-js");
const OpenAI = require("openai");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const XLSX = require("xlsx");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function getFileBufferFromSignedUrl(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download file from storage: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function extractTextFromWorkbook(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetTexts = [];

  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return;

    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      blankrows: false,
      defval: "",
    });

    const sheetText = rows
      .map((row) =>
        Array.isArray(row)
          ? row
              .map((cell) => String(cell ?? "").trim())
              .filter(Boolean)
              .join(" | ")
          : ""
      )
      .filter(Boolean)
      .join("\n");

    if (sheetText) {
      sheetTexts.push(`Sheet: ${sheetName}\n${sheetText}`);
    }
  });

  return sheetTexts.join("\n\n");
}

async function extractTextFromFile(filePath, fileName) {
  const { data, error } = await supabase.storage
    .from("rams-files")
    .createSignedUrl(filePath, 60);

  if (error || !data?.signedUrl) {
    throw new Error(`Could not create signed URL for file: ${fileName || filePath}`);
  }

  const buffer = await getFileBufferFromSignedUrl(data.signedUrl);
  const lowerName = String(fileName || filePath || "").toLowerCase();

  if (lowerName.endsWith(".pdf")) {
    const parsed = await pdfParse(buffer);
    return parsed.text || "";
  }

  if (lowerName.endsWith(".docx")) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value || "";
  }

  if (lowerName.endsWith(".xls") || lowerName.endsWith(".xlsx")) {
    return extractTextFromWorkbook(buffer);
  }

  if (lowerName.endsWith(".doc")) {
    throw new Error(`Legacy .doc files are not yet supported for AI reading: ${fileName}`);
  }

  throw new Error(`Unsupported file type: ${fileName}`);
}

function safeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function dedupeDocuments(documents) {
  const seen = new Set();

  return documents.filter((doc) => {
    const key = `${doc.file_path}__${doc.file_name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function getDocumentsForReview(review) {
  const { data, error } = await supabase
    .from("rams_review_documents")
    .select("*")
    .eq("rams_review_id", review.id)
    .order("uploaded_at", { ascending: true });

  if (!error && Array.isArray(data) && data.length) {
    return dedupeDocuments(
      data.map((doc) => ({
        file_name: doc.file_name,
        file_path: doc.file_path,
        file_type: doc.file_type,
        document_role: doc.document_role || "supporting_document",
      }))
    );
  }

  if (review.file_path) {
    return [
      {
        file_name: review.file_name || review.uploaded_file_name || "Uploaded RAMS document",
        file_path: review.file_path,
        file_type: review.file_type || null,
        document_role: "primary_rams",
      },
    ];
  }

  return [];
}

async function extractTextFromDocuments(documents) {
  const extractedDocuments = [];
  const extractionErrors = [];

  for (const doc of documents) {
    try {
      const text = await extractTextFromFile(doc.file_path, doc.file_name);

      if (text && text.trim()) {
        extractedDocuments.push({
          ...doc,
          text: text.trim(),
        });
      } else {
        extractionErrors.push(`No readable text could be extracted from ${doc.file_name}`);
      }
    } catch (error) {
      extractionErrors.push(`${doc.file_name}: ${error.message}`);
    }
  }

  return {
    extractedDocuments,
    extractionErrors,
  };
}

function buildCombinedDocumentText(extractedDocuments) {
  return extractedDocuments
    .map((doc, index) => {
      const roleLabel = String(doc.document_role || "document").replace(/_/g, " ");
      return [
        `--- DOCUMENT ${index + 1} ---`,
        `File Name: ${doc.file_name || "Unknown"}`,
        `Document Role: ${roleLabel}`,
        `File Type: ${doc.file_type || "Unknown"}`,
        "",
        doc.text || "",
      ].join("\n");
    })
    .join("\n\n");
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        body: JSON.stringify({ error: "Method Not Allowed" }),
      };
    }

    const body = JSON.parse(event.body || "{}");
    const ramsReviewId = body.ramsReviewId;

    if (!ramsReviewId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing ramsReviewId" }),
      };
    }

    const { data: review, error: reviewError } = await supabase
      .from("rams_reviews")
      .select("*")
      .eq("id", ramsReviewId)
      .single();

    if (reviewError || !review) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "RAMS review not found" }),
      };
    }

    await supabase
      .from("rams_reviews")
      .update({
        ai_review_status: "processing",
        ai_error: null,
      })
      .eq("id", ramsReviewId);

    const documents = await getDocumentsForReview(review);

    if (!documents.length) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "No uploaded RAMS documents found on this record" }),
      };
    }

    const { extractedDocuments, extractionErrors } = await extractTextFromDocuments(documents);

    if (!extractedDocuments.length) {
      throw new Error(
        extractionErrors.length
          ? `No readable documents found. ${extractionErrors.join(" | ")}`
          : "No readable text could be extracted from the uploaded documents."
      );
    }

    const combinedDocumentText = buildCombinedDocumentText(extractedDocuments);

    if (!combinedDocumentText.trim()) {
      throw new Error("No readable text could be extracted from the uploaded documents.");
    }

    const hazards = safeArray(review.area_hazard_snapshot);
    const rules = safeArray(review.area_rule_snapshot);
    const ppe = safeArray(review.area_ppe_snapshot);
    const risks = safeArray(review.risks);
    const permits = safeArray(review.recommended_permits);
    const areas = safeArray(review.areas);

    const prompt = `
You are reviewing contractor RAMS documents for Timothy Taylor's brewery.

Your job is to:
1. Check the RAMS documents against the selected site areas and their saved site-specific hazards, rules and PPE.
2. Identify site-specific items that appear to be missing or not clearly addressed in the RAMS.
3. Identify job-based recommendations suggested by the task itself, even if they are not explicitly listed in the site rules.
4. Identify items that do appear to be covered clearly.
5. Suggest any additional risks likely relevant to the work.
6. Suggest any additional areas likely relevant to the work.
7. Return ONLY valid JSON matching the required schema.

Important rules:
- Do not invent Timothy Taylor site rules beyond those provided.
- Separate site-specific missing items from job-based recommendations.
- Be cautious and practical.
- If something is only likely missing, phrase it as "Not clearly addressed".
- Contractors may have provided more than one document. Consider the full set together.
- P1 General Work Permit is always required, but permit logic is not the main task here.

RAMS CONTEXT
Contractor: ${review.contractor_name || ""}
Job Title: ${review.job_title || ""}
Location: ${review.location || ""}
Selected Areas: ${JSON.stringify(areas)}
Selected Risks: ${JSON.stringify(risks)}
Recommended Permits: ${JSON.stringify(permits)}

SITE HAZARDS
${JSON.stringify(hazards)}

SITE RULES
${JSON.stringify(rules)}

SITE PPE
${JSON.stringify(ppe)}

DOCUMENT EXTRACTION NOTES
${extractionErrors.length ? extractionErrors.join(" | ") : "No extraction issues."}

RAMS DOCUMENT TEXT
${combinedDocumentText.slice(0, 90000)}
`;

    const response = await openai.responses.create({
      model: "gpt-4.1",
      input: [
        {
          role: "developer",
          content: [
            {
              type: "input_text",
              text: "Return strict JSON only. Do not include markdown fences.",
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: prompt,
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "rams_review_result",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              summary: { type: "string" },
              site_missing_items: {
                type: "array",
                items: { type: "string" },
              },
              job_recommendations: {
                type: "array",
                items: { type: "string" },
              },
              covered_items: {
                type: "array",
                items: { type: "string" },
              },
              detected_additional_risks: {
                type: "array",
                items: { type: "string" },
              },
              detected_additional_areas: {
                type: "array",
                items: { type: "string" },
              },
            },
            required: [
              "summary",
              "site_missing_items",
              "job_recommendations",
              "covered_items",
              "detected_additional_risks",
              "detected_additional_areas",
            ],
          },
        },
      },
    });

    const rawText = response.output_text || "{}";
    const parsed = JSON.parse(rawText);

    const extractedTextForStorage = combinedDocumentText.slice(0, 200000);

    const { error: updateError } = await supabase
      .from("rams_reviews")
      .update({
        extracted_text: extractedTextForStorage,
        ai_review_status: "completed",
        ai_review_completed_at: new Date().toISOString(),
        ai_site_missing_items: parsed.site_missing_items || [],
        ai_job_recommendations: parsed.job_recommendations || [],
        ai_covered_items: parsed.covered_items || [],
        ai_detected_additional_risks: parsed.detected_additional_risks || [],
        ai_detected_additional_areas: parsed.detected_additional_areas || [],
        ai_summary: parsed.summary || "",
        ai_raw_response: parsed,
        ai_error: extractionErrors.length ? extractionErrors.join(" | ") : null,
      })
      .eq("id", ramsReviewId);

    if (updateError) {
      throw new Error(updateError.message);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        message: "AI review completed",
        documentsProcessed: extractedDocuments.length,
        extractionWarnings: extractionErrors,
      }),
    };
  } catch (error) {
    let ramsReviewId = null;

    try {
      const body = JSON.parse(event.body || "{}");
      ramsReviewId = body.ramsReviewId;
    } catch (_) {}

    if (ramsReviewId) {
      await supabase
        .from("rams_reviews")
        .update({
          ai_review_status: "failed",
          ai_error: error.message || "Unknown AI review error",
        })
        .eq("id", ramsReviewId);
    }

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error.message || "Unknown server error",
      }),
    };
  }
};
