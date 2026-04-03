console.log("review-results.js loaded");

// ==========================
// SUPABASE SETUP
// ==========================
const SUPABASE_URL = "https://rfcwfbdcdnjpaxwztvfr.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmY3dmYmRjZG5qcGF4d3p0dmZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzODQ5NzUsImV4cCI6MjA4OTk2MDk3NX0.9XLDNzgIXu5-i3oTvkYem3hTX2rgmF3D5vw40F8tNwQ";

const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let currentProfile = null;
let currentReview = null;

// ==========================
// AUTH / USER
// ==========================
async function loadUser() {
  const { data: sessionData, error: sessionError } = await client.auth.getSession();

  if (sessionError || !sessionData.session) {
    window.location.href = "/login.html";
    return false;
  }

  currentUser = sessionData.session.user;

  const { data: profile, error: profileError } = await client
    .from("user_profiles")
    .select("*")
    .eq("id", currentUser.id)
    .single();

  if (profileError || !profile) {
    alert("Profile not found.");
    window.location.href = "/login.html";
    return false;
  }

  if (profile.is_active === false) {
    alert("Your account has been deactivated. Please contact an administrator.");
    await client.auth.signOut();
    window.location.href = "/login.html";
    return false;
  }

  currentProfile = profile;

  const adminNavLink = document.getElementById("adminNavLink");
  if (profile.role === "admin" && adminNavLink) {
    adminNavLink.style.display = "block";
  }

  const canApprove = profile.role === "reviewer" || profile.role === "admin";

  const approveBtn = document.getElementById("approveBtn");
  const underReviewBtn = document.getElementById("underReviewBtn");
  const rejectBtn = document.getElementById("rejectBtn");
  const reviewerNotes = document.getElementById("reviewerNotes");

  if (!canApprove) {
    if (approveBtn) {
      approveBtn.disabled = true;
      approveBtn.textContent = "Approval requires Reviewer/Admin access";
    }
    if (underReviewBtn) underReviewBtn.disabled = true;
    if (rejectBtn) rejectBtn.disabled = true;
    if (reviewerNotes) reviewerNotes.disabled = true;
  }

  return true;
}

// ==========================
// HELPERS
// ==========================
function getIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("id");
}

function getFallbackSupabaseId() {
  const draft = typeof getDraftRamsReview === "function" ? getDraftRamsReview() : null;
  if (draft?.supabaseId) return draft.supabaseId;

  const current = typeof getCurrentRamsReview === "function" ? getCurrentRamsReview() : null;
  if (current?.supabaseId) return current.supabaseId;

  return null;
}

function formatDate(dateString) {
  if (!dateString) return "-";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-GB");
}

function formatDateTime(dateString) {
  if (!dateString) return "-";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-GB");
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value || "-";
}

function renderTags(id, items) {
  const el = document.getElementById(id);
  if (!el) return;

  if (!items || !items.length) {
    el.innerHTML = `<span class="tag muted">None</span>`;
    return;
  }

  el.innerHTML = items.map(i => `<span class="tag">${i}</span>`).join("");
}

function renderList(id, items) {
  const el = document.getElementById(id);
  if (!el) return;

  if (!items || !items.length) {
    el.innerHTML = `<li>None</li>`;
    return;
  }

  el.innerHTML = items.map(i => `<li>${i}</li>`).join("");
}

// ==========================
// LOAD REVIEW FROM SUPABASE
// ==========================
async function loadReviewFromSupabase(id) {
  const { data, error } = await client
    .from("rams_reviews")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    alert("Failed to load RAMS.");
    return null;
  }

  return {
    id: data.id,
    supabaseId: data.id,
    userId: data.user_id || null,
    contractorName: data.contractor_name || "",
    jobTitle: data.job_title || "",
    location: data.location || "",
    areas: data.areas || [],
    risks: data.risks || [],
    detectedAreas: data.detected_areas || [],
    detectedRisks: data.detected_risks || [],
    recommendedPermits: data.recommended_permits || [],
    uploadedFileName: data.uploaded_file_name || "",
    startDate: data.start_date || "",
    endDate: data.end_date || "",
    duration: data.duration || 1,
    durationUnit: data.duration_unit || "days",
    summary: data.summary || "",
    missingItems: data.missing_items || [],
    weakItems: data.weak_items || [],
    reviewer: data.approved_by_name || "",
    reviewerNotes: data.reviewer_notes || "",
    reviewDate: data.review_date || "",
    clash: !!data.clash,
    clashAcknowledged: false,
    status: data.status || "Under Review"
  };
}

// ==========================
// CLASH LOOKUP FROM SUPABASE
// ==========================
async function getClashingReviews(currentReview) {
  const { data, error } = await client
    .from("rams_reviews")
    .select("*")
    .eq("status", "Approved");

  if (error || !data) {
    console.warn("Could not load clash records from Supabase.");
    return [];
  }

  return data
    .filter(r => r.id !== currentReview.supabaseId)
    .filter(r => {
      const aStart = new Date(currentReview.startDate);
      const aEnd = new Date(currentReview.endDate || currentReview.startDate);
      const bStart = new Date(r.start_date);
      const bEnd = new Date(r.end_date || r.start_date);

      const overlap = aStart <= bEnd && bStart <= aEnd;
      if (!overlap) return false;

      const currentAreas = currentReview.areas || [];
      const otherAreas = Array.isArray(r.areas) ? r.areas : [];

      return currentAreas.some(area => otherAreas.includes(area));
    })
    .map(r => ({
      contractorName: r.contractor_name || "",
      areas: r.areas || [],
      startDate: r.start_date || "",
      endDate: r.end_date || "",
      reviewer: r.approved_by_name || "Unknown"
    }));
}

// ==========================
// RENDER
// ==========================
async function renderReview(review) {
  setText("resultStatus", review.status || "RAMS Review Result");
  setText("resultId", review.id || "-");
  setText("resultContractor", review.contractorName || "-");
  setText("resultJobTitle", review.jobTitle || "-");
  setText("resultLocation", review.location || "-");
  setText("resultStartDate", formatDate(review.startDate));
  setText("resultEndDate", formatDate(review.endDate));
  setText("resultReviewer", review.reviewer || "-");
  setText("resultReviewDate", formatDateTime(review.reviewDate));
  setText("resultSummary", review.summary || "-");
  setText("topbarSummary", `${review.contractorName || "-"} / ${review.jobTitle || "-"}`);

  const clashText = review.clash === true
    ? (review.clashAcknowledged ? "Yes" : "No")
    : "No clash detected";

  setText("resultClashAck", clashText);

  renderTags("resultAreas", review.areas);
  renderTags("resultRisks", review.risks);
  renderTags("resultDetectedAreas", review.detectedAreas);
  renderTags("resultDetectedRisks", review.detectedRisks);
  renderTags("resultPermits", review.recommendedPermits);

  renderList("resultMissingItems", review.missingItems);
  renderList("resultWeakItems", review.weakItems);

  const reviewerNotes = document.getElementById("reviewerNotes");
  if (reviewerNotes) {
    reviewerNotes.value = review.reviewerNotes || "";
  }

  const clashWarning = document.getElementById("clashWarning");
  const clashAcknowledgement = document.getElementById("clashAcknowledgement");
  const clashConfirm = document.getElementById("clashConfirm");
  const clashDetails = document.getElementById("clashDetails");
  const approveBtn = document.getElementById("approveBtn");

  if (review.clash === true) {
    if (clashWarning) clashWarning.style.display = "block";
    if (clashAcknowledgement) clashAcknowledgement.style.display = "block";
    if (clashConfirm) clashConfirm.checked = false;
    if (approveBtn && (currentProfile.role === "reviewer" || currentProfile.role === "admin")) {
      approveBtn.disabled = true;
    }

    const clashes = await getClashingReviews(review);

    if (clashDetails && clashes.length) {
      clashDetails.innerHTML = clashes.map(c => {
        return `
          <div style="margin-top:10px; padding:10px; background:#fff; border:1px solid #f1b0b0; border-radius:8px;">
            <strong>${c.contractorName || "-"}</strong><br>
            Area: ${(c.areas || []).join(", ") || "-"}<br>
            Dates: ${formatDate(c.startDate)} to ${formatDate(c.endDate)}<br>
            Approved by: ${c.reviewer || "Unknown"}
          </div>
        `;
      }).join("");
    } else if (clashDetails) {
      clashDetails.innerHTML = `<p>No other approved clashes found.</p>`;
    }
  } else {
    if (clashWarning) clashWarning.style.display = "none";
    if (clashAcknowledgement) clashAcknowledgement.style.display = "none";
    if (approveBtn && (currentProfile.role === "reviewer" || currentProfile.role === "admin")) {
      approveBtn.disabled = false;
    }
    if (clashDetails) clashDetails.innerHTML = "";
  }
}

async function recalculateSupabaseClashes() {
  const { data, error } = await client
    .from("rams_reviews")
    .select("*")
    .order("start_date", { ascending: true });

  if (error) {
    alert("Failed to recalculate clashes: " + error.message);
    return false;
  }

  const rows = data || [];
  const approvedRows = rows.filter(r => r.status === "Approved");

  const clashMap = {};
  approvedRows.forEach(r => {
    clashMap[r.id] = false;
  });

  for (let i = 0; i < approvedRows.length; i++) {
    for (let j = i + 1; j < approvedRows.length; j++) {
      const a = approvedRows[i];
      const b = approvedRows[j];

      const aStart = new Date(a.start_date);
      const aEnd = new Date(a.end_date || a.start_date);
      const bStart = new Date(b.start_date);
      const bEnd = new Date(b.end_date || b.start_date);

      const overlap = aStart <= bEnd && bStart <= aEnd;
      if (!overlap) continue;

      const aAreas = Array.isArray(a.areas) ? a.areas : [];
      const bAreas = Array.isArray(b.areas) ? b.areas : [];

      const sameArea = aAreas.some(area => bAreas.includes(area));
      if (!sameArea) continue;

      clashMap[a.id] = true;
      clashMap[b.id] = true;
    }
  }

  for (const row of rows) {
    const newClashValue = row.status === "Approved" ? !!clashMap[row.id] : false;

    const { error: updateError } = await client
      .from("rams_reviews")
      .update({ clash: newClashValue })
      .eq("id", row.id);

    if (updateError) {
      alert("Failed to update clash flags: " + updateError.message);
      return false;
    }
  }

  return true;
}

// ==========================
// UPDATE STATUS IN SUPABASE
// ==========================
async function updateStatus(status) {
  if (!currentReview?.supabaseId) {
    alert("No Supabase RAMS record found.");
    return;
  }

  const reviewerNotes = document.getElementById("reviewerNotes")?.value.trim() || "";
  const clashConfirm = document.getElementById("clashConfirm");

  if (currentReview.clash === true && status === "Approved") {
    if (!clashConfirm?.checked) {
      alert("You must confirm the clash has been reviewed and control measures are in place before approving.");
      return;
    }
  }

  const nowIso = new Date().toISOString();

  const updates = {
    status: status,
    reviewer_notes: reviewerNotes,
    review_date: nowIso,
    clash: !!currentReview.clash
  };

  if (status === "Approved") {
    updates.approved_by = currentUser.id;
    updates.approved_by_name = currentProfile.full_name || currentUser.email;
    updates.approved_at = nowIso;
  } else {
    updates.approved_by = null;
    updates.approved_by_name = null;
    updates.approved_at = null;
  }

  const { error } = await client
    .from("rams_reviews")
    .update(updates)
    .eq("id", currentReview.supabaseId);

  if (error) {
    alert("Update failed: " + error.message);
    return;
  }

  window.location.href = "/index.html";
}

// ==========================
// INIT
// ==========================
document.addEventListener("DOMContentLoaded", async () => {
  const ok = await loadUser();
  if (!ok) return;

  const idFromUrl = getIdFromUrl();
  const reviewId = idFromUrl || getFallbackSupabaseId();

  if (!reviewId) {
    alert("No RAMS found.");
    return;
  }

  currentReview = await loadReviewFromSupabase(reviewId);

  if (!currentReview) {
    alert("No RAMS found.");
    return;
  }

  await renderReview(currentReview);

  const clashConfirm = document.getElementById("clashConfirm");
  const approveBtn = document.getElementById("approveBtn");

  clashConfirm?.addEventListener("change", () => {
    if (!approveBtn) return;
    if (!(currentProfile.role === "reviewer" || currentProfile.role === "admin")) return;

    if (clashConfirm.checked) {
      approveBtn.disabled = false;
    } else if (currentReview.clash === true) {
      approveBtn.disabled = true;
    }
  });

  document.getElementById("approveBtn")?.addEventListener("click", async () => {
    await updateStatus("Approved");
  });

  document.getElementById("underReviewBtn")?.addEventListener("click", async () => {
    await updateStatus("Under Review");
  });

  document.getElementById("rejectBtn")?.addEventListener("click", async () => {
    await updateStatus("Rejected");
  });
});
