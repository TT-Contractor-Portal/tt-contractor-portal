const { createClient } = require("@supabase/supabase-js");
const OpenAI = require("openai");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");

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

async function extractTextFromFile(filePath, fileName) {
  const { data, error } = await supabase.storage
    .from("rams-files")
    .createSignedUrl(filePath, 60);

  if (error || !data?.signedUrl) {
    throw new Error("Could not create signed URL for RAMS file.");
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

  if (lowerName.endsWith(".doc")) {
    throw new Error("Legacy .doc files are not yet supported. Please upload PDF or DOCX.");
  }

  throw new Error("Unsupported file type. Please upload PDF or DOCX.");
}

function safeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
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

    if (!review.file_path || !review.file_name) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "No uploaded RAMS document found on this record" }),
      };
    }

    await supabase
      .from("rams_reviews")
      .update({
        ai_review_status: "processing",
        ai_error: null,
      })
      .eq("id", ramsReviewId);

    const extractedText = await extractTextFromFile(review.file_path, review.file_name);

    if (!extractedText || !extractedText.trim()) {
      throw new Error("No readable text could be extracted from the document.");
    }

    const hazards = safeArray(review.area_hazard_snapshot);
    const rules = safeArray(review.area_rule_snapshot);
    const ppe = safeArray(review.area_ppe_snapshot);
    const risks = safeArray(review.risks);
    const permits = safeArray(review.recommended_permits);
    const areas = safeArray(review.areas);

    const prompt = `
You are reviewing a contractor RAMS document for Timothy Taylor's brewery.

Your job is to:
1. Check the RAMS document against the selected site areas and their saved site-specific hazards, rules and PPE.
2. Identify site-specific items that appear to be missing or not clearly addressed in the RAMS.
3. Identify job-based recommendations suggested by the task itself, even if they are not explicitly listed in the site rules.
4. Identify items that do appear to be covered clearly.
5. Suggest any additional risks likely relevant to the work.
6. Return ONLY valid JSON matching the required schema.

Important rules:
- Do not invent Timothy Taylor site rules beyond those provided.
- Separate site-specific missing items from job-based recommendations.
- Be cautious and professional.
- If something is only likely missing, phrase it as "Not clearly addressed".
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

RAMS DOCUMENT TEXT
${extractedText.slice(0, 45000)}
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

    const { error: updateError } = await supabase
      .from("rams_reviews")
      .update({
        extracted_text: extractedText,
        ai_review_status: "completed",
        ai_review_completed_at: new Date().toISOString(),
        ai_site_missing_items: parsed.site_missing_items || [],
        ai_job_recommendations: parsed.job_recommendations || [],
        ai_covered_items: parsed.covered_items || [],
        ai_detected_additional_risks: parsed.detected_additional_risks || [],
        ai_detected_additional_areas: parsed.detected_additional_areas || [],
        ai_summary: parsed.summary || "",
        ai_raw_response: parsed,
        ai_error: null,
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
