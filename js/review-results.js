console.log("review-results.js loaded");

function formatDate(dateString) {
  if (!dateString) return "-";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString("en-GB");
}

function formatDateTime(dateString) {
  if (!dateString) return "-";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  return date.toLocaleString("en-GB");
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function renderTags(containerId, items) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!items || !items.length) {
    container.innerHTML = `<span class="tag muted">None</span>`;
    return;
  }

  container.innerHTML = items.map(item => `<span class="tag">${item}</span>`).join("");
}

function renderList(listId, items) {
  const list = document.getElementById(listId);
  if (!list) return;

  if (!items || !items.length) {
    list.innerHTML = `<li>None</li>`;
    return;
  }

  list.innerHTML = items.map(item => `<li>${item}</li>`).join("");
}

function getDraftReviewData() {
  return getDraftRamsReview();
}

function renderReview(review) {
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
  setText("resultClashAck", review.clashAcknowledged ? "Yes" : "No");

  renderTags("resultAreas", review.areas);
  renderTags("resultRisks", review.risks);
  renderTags("resultDetectedAreas", review.detectedAreas);
  renderTags("resultDetectedRisks", review.detectedRisks);
  renderTags("resultPermits", review.recommendedPermits);

  renderList("resultMissingItems", review.missingItems);
  renderList("resultWeakItems", review.weakItems);
}

function saveReviewWithStatus(status) {
  const draft = getDraftReviewData();
  const reviewerNotes = document.getElementById("reviewerNotes")?.value.trim() || "";

  if (!draft) {
    alert("No draft RAMS review found.");
    return;
  }

  const review = {
    id: draft.id || generateRamsId(),
    contractorName: draft.contractorName,
    jobTitle: draft.jobTitle,
    location: draft.location,
    areas: draft.areas || [],
    risks: draft.risks || [],
    detectedAreas: draft.detectedAreas || [],
    detectedRisks: draft.detectedRisks || [],
    recommendedPermits: draft.recommendedPermits || [],
    uploadedFileName: draft.uploadedFileName || "",
    startDate: draft.startDate,
    duration: draft.duration || 1,
    durationUnit: draft.durationUnit || "days",
    endDate: draft.endDate,
    clashAcknowledged: !!draft.clashAcknowledged,
    summary: draft.summary || "",
    missingItems: draft.missingItems || [],
    weakItems: draft.weakItems || [],
    reviewer: "Admin",
    reviewerNotes,
    status,
    reviewDate: new Date().toISOString()
  };

  const reviews = getRamsReviews();
  reviews.push(review);
  saveRamsReviews(reviews);
  saveCurrentRamsReview(review);
  clearDraftRamsReview();

  console.log("Review saved:", review);
  console.log("All reviews:", getRamsReviews());

  window.location.href = "/index.html";
}

document.addEventListener("DOMContentLoaded", () => {
  const currentReview = getCurrentRamsReview();
  const draftReview = getDraftReviewData();
  const reviewToRender = currentReview || draftReview;

  if (!reviewToRender) {
    console.warn("No current or draft RAMS review found");
    return;
  }

  renderReview(reviewToRender);

  document.getElementById("approveBtn")?.addEventListener("click", () => {
    saveReviewWithStatus("Approved");
  });

  document.getElementById("underReviewBtn")?.addEventListener("click", () => {
    saveReviewWithStatus("Under Review");
  });

  document.getElementById("rejectBtn")?.addEventListener("click", () => {
    saveReviewWithStatus("Rejected");
  });
});
