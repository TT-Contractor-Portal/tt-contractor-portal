const { createClient } = require("@supabase/supabase-js");

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function buildJson(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  };
}

function hasReviewerAccess(profile) {
  if (!profile) return false;
  return ["reviewer", "admin"].includes(profile.role);
}

function normaliseAreas(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function datesOverlap(startA, endA, startB, endB) {
  return startA <= endB && startB <= endA;
}

async function getUserFromToken(authHeader) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { user: null, error: "Missing or invalid Authorization header" };
  }

  const token = authHeader.replace("Bearer ", "").trim();

  const supabaseAuth = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    {
      global: {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    }
  );

  const { data, error } = await supabaseAuth.auth.getUser(token);

  if (error || !data?.user) {
    return { user: null, error: "Unable to verify user session" };
  }

  return { user: data.user, error: null };
}

async function getUserProfile(userId) {
  const { data, error } = await supabaseAdmin
    .from("user_profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (error || !data) {
    return { profile: null, error: "User profile not found" };
  }

  return { profile: data, error: null };
}

async function recalculateAllClashes() {
  const { data, error } = await supabaseAdmin
    .from("rams_reviews")
    .select("id, status, start_date, end_date, areas, is_current_revision")
    .eq("is_current_revision", true)
    .order("start_date", { ascending: true });

  if (error) {
    throw new Error(`Failed to load RAMS for clash recalculation: ${error.message}`);
  }

  const rows = data || [];
  const approvedRows = rows.filter((row) => row.status === "Approved");

  const clashMap = {};
  rows.forEach((row) => {
    clashMap[row.id] = false;
  });

  for (let i = 0; i < approvedRows.length; i++) {
    for (let j = i + 1; j < approvedRows.length; j++) {
      const a = approvedRows[i];
      const b = approvedRows[j];

      const aStart = new Date(a.start_date);
      const aEnd = new Date(a.end_date || a.start_date);
      const bStart = new Date(b.start_date);
      const bEnd = new Date(b.end_date || b.start_date);

      if (
        Number.isNaN(aStart.getTime()) ||
        Number.isNaN(aEnd.getTime()) ||
        Number.isNaN(bStart.getTime()) ||
        Number.isNaN(bEnd.getTime())
      ) {
        continue;
      }

      if (!datesOverlap(aStart, aEnd, bStart, bEnd)) {
        continue;
      }

      const aAreas = normaliseAreas(a.areas);
      const bAreas = normaliseAreas(b.areas);

      const sameArea = aAreas.some((area) => bAreas.includes(area));
      if (!sameArea) {
        continue;
      }

      clashMap[a.id] = true;
      clashMap[b.id] = true;
    }
  }

  for (const row of rows) {
    const newClashValue = !!clashMap[row.id];

    const { error: updateError } = await supabaseAdmin
      .from("rams_reviews")
      .update({ clash: newClashValue })
      .eq("id", row.id);

    if (updateError) {
      throw new Error(`Failed to update clash flag for RAMS ${row.id}: ${updateError.message}`);
    }
  }
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return buildJson(405, { error: "Method Not Allowed" });
    }

    const { user, error: authError } = await getUserFromToken(
      event.headers.authorization || event.headers.Authorization
    );

    if (authError || !user) {
      return buildJson(401, { error: authError || "Not authenticated" });
    }

    const { profile, error: profileError } = await getUserProfile(user.id);

    if (profileError || !profile) {
      return buildJson(403, { error: profileError || "Profile not found" });
    }

    if (profile.is_active === false) {
      return buildJson(403, { error: "Your account has been deactivated." });
    }

    if (!hasReviewerAccess(profile)) {
      return buildJson(403, { error: "Reviewer or admin access is required." });
    }

    const body = JSON.parse(event.body || "{}");
    const reviewId = body.reviewId;
    const status = body.status;
    const reviewerNotes = (body.reviewerNotes || "").trim();
    const clashAcknowledged = body.clashAcknowledged === true;

    if (!reviewId) {
      return buildJson(400, { error: "Missing reviewId" });
    }

    if (!["Approved", "Under Review", "Rejected"].includes(status)) {
      return buildJson(400, { error: "Invalid status" });
    }

    const { data: review, error: reviewError } = await supabaseAdmin
      .from("rams_reviews")
      .select("*")
      .eq("id", reviewId)
      .single();

    if (reviewError || !review) {
      return buildJson(404, { error: "RAMS review not found" });
    }

    if (status === "Approved" && review.clash === true && !clashAcknowledged) {
      return buildJson(400, {
        error: "Clash acknowledgement is required before approval."
      });
    }

    const nowIso = new Date().toISOString();
    const isApproved = status === "Approved";
    const reviewerName = profile.full_name || user.email || "Reviewer";

    const updates = {
      status,
      review_outcome:
        status === "Approved"
          ? "acceptable"
          : status === "Rejected"
            ? "rejected"
            : "under_review",
      reviewer_notes: reviewerNotes,
      review_date: nowIso,
      reviewer: reviewerName,
      clash_acknowledged: clashAcknowledged
    };

    if (isApproved) {
      updates.approved_by = user.id;
      updates.approved_by_name = reviewerName;
      updates.approved_at = nowIso;
    } else {
      updates.approved_by = null;
      updates.approved_by_name = null;
      updates.approved_at = null;
    }

    const { error: updateError } = await supabaseAdmin
      .from("rams_reviews")
      .update(updates)
      .eq("id", reviewId);

    if (updateError) {
      return buildJson(500, { error: `Failed to update RAMS: ${updateError.message}` });
    }

    await recalculateAllClashes();

    return buildJson(200, {
      ok: true,
      message: `RAMS updated to ${status}`
    });
  } catch (error) {
    return buildJson(500, {
      error: error.message || "Unknown server error"
    });
  }
};
