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
  return {
    contractorName: "Ace Contractors Ltd",
    jobTitle: "Steam Line Modification",
    location: "Brewhouse",
    areas: ["Brewhouse", "Boiler House"],
    risks: ["Hot Work", "Working at Height"],
    detectedAreas: ["Utilities"],
    detectedRisks: ["Pressure Systems / Steam"],
    recommendedPermits: ["P1 General Work Permit", "P2 Hot Work Permit", "P4 Working at Height Permit"],
    startDate: "2026-03-24",
    endDate: "2026-03-24",
    clashAcknowledged: true,
    summary: "RAMS reviewed successfully. Additional controls should be confirmed before work starts.",
    missingItems: [
      "Emergency arrangements not clearly defined",
      "Named supervisor not identified"
    ],
    weakItems: [
      "PPE section is too generic",
      "Hot work controls do not mention fire watch"
    ]
  };
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

  const review = {
    id: generateRamsId(),
    contractorName: draft.contractorName,
    jobTitle: draft.jobTitle,
    location: draft.location,
    areas: draft.areas,
    risks: draft.risks,
    detectedAreas: draft.detectedAreas,
    detectedRisks: draft.detectedRisks,
    recommendedPermits: draft.recommendedPermits,
    startDate: draft.startDate,
    endDate: draft.endDate,
    clashAcknowledged: draft.clashAcknowledged,
    summary: draft.summary,
    missingItems: draft.missingItems,
    weakItems: draft.weakItems,
    reviewer: "Admin",
    reviewerNotes,
    status,
    reviewDate: new Date().toISOString()
  };

  const reviews = getRamsReviews();
  reviews.push(review);
  saveRamsReviews(reviews);
  saveCurrentRamsReview(review);

  console.log("Approve clicked");
  console.log("Saved review:", review);
  console.log("All reviews:", getRamsReviews());

  window.location.href = "/index.html";
}

document.addEventListener("DOMContentLoaded", () => {
  const currentReview = getCurrentRamsReview();
  const reviewToRender = currentReview || {
    ...getDraftReviewData(),
    id: "Preview Only",
    reviewer: "Admin",
    status: "Pending Review",
    reviewDate: new Date().toISOString()
  };

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
