console.log("review-results.js loaded");

// ==========================
// SUPABASE SETUP
// ==========================
const SUPABASE_URL = "https://rfcwfbdcdnjpaxwztvfr.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmY3dmYmRjZG5qcGF4d3p0dmZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzODQ5NzUsImV4cCI6MjA4OTk2MDk3NX0.9XLDNzgIXu5-i3oTvkYem3hTX2rgmF3D5vw40F8tNwQ";

let client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let currentProfile = null;
let currentReview = null;

// ==========================
// AUTH
// ==========================
async function loadUser() {
  const { data: sessionData } = await client.auth.getSession();

  if (!sessionData.session) {
    window.location.href = "/login.html";
    return false;
  }

  currentUser = sessionData.session.user;

  const { data: profile } = await client
    .from("user_profiles")
    .select("*")
    .eq("id", currentUser.id)
    .single();

  currentProfile = profile;

  return true;
}

// ==========================
// LOAD FROM URL (THIS IS THE FIX)
// ==========================
function getIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("id");
}

async function loadReviewFromSupabase(id) {
  const { data, error } = await client
    .from("rams_reviews")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    alert("Failed to load RAMS");
    return null;
  }

  return {
    id: data.id,
    supabaseId: data.id,
    contractorName: data.contractor_name,
    jobTitle: data.job_title,
    location: data.location,
    areas: data.areas || [],
    risks: data.risks || [],
    detectedAreas: data.detected_areas || [],
    detectedRisks: data.detected_risks || [],
    recommendedPermits: data.recommended_permits || [],
    startDate: data.start_date,
    endDate: data.end_date,
    summary: data.summary,
    missingItems: data.missing_items || [],
    weakItems: data.weak_items || [],
    reviewer: data.approved_by_name || "",
    reviewDate: data.review_date,
    clash: data.clash || false,
    clashAcknowledged: false,
    status: data.status
  };
}

// ==========================
// RENDER
// ==========================
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

function renderReview(r) {
  setText("resultId", r.id);
  setText("resultContractor", r.contractorName);
  setText("resultJobTitle", r.jobTitle);
  setText("resultLocation", r.location);
  setText("resultStartDate", new Date(r.startDate).toLocaleDateString("en-GB"));
  setText("resultEndDate", new Date(r.endDate).toLocaleDateString("en-GB"));
  setText("resultReviewer", r.reviewer);
  setText("resultReviewDate", r.reviewDate);
  setText("resultSummary", r.summary);

  renderTags("resultAreas", r.areas);
  renderTags("resultRisks", r.risks);
  renderTags("resultDetectedAreas", r.detectedAreas);
  renderTags("resultDetectedRisks", r.detectedRisks);
  renderTags("resultPermits", r.recommendedPermits);

  renderList("resultMissingItems", r.missingItems);
  renderList("resultWeakItems", r.weakItems);
}

// ==========================
// UPDATE (THIS NOW WORKS)
// ==========================
async function updateStatus(status) {
  const notes = document.getElementById("reviewerNotes").value;

  const updates = {
    status,
    reviewer_notes: notes,
    review_date: new Date().toISOString(),
    approved_by: currentUser.id,
    approved_by_name: currentProfile.full_name || currentUser.email
  };

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

  const id = getIdFromUrl();

  if (id) {
    // ✅ OPENED FROM REGISTER
    currentReview = await loadReviewFromSupabase(id);
  } else {
    // ✅ OPENED FROM NEW RAMS FLOW
    currentReview = getDraftRamsReview() || getCurrentRamsReview();
  }

  if (!currentReview) {
    alert("No RAMS found");
    return;
  }

  renderReview(currentReview);

  document.getElementById("approveBtn").onclick = () => updateStatus("Approved");
  document.getElementById("underReviewBtn").onclick = () => updateStatus("Under Review");
  document.getElementById("rejectBtn").onclick = () => updateStatus("Rejected");
});
