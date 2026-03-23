// js/review-results.js

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

function renderTags(containerId, items) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!items || !items.length) {
    container.innerHTML = `<span class="tag muted">None</span>`;
    return;
  }

  container.innerHTML = items
    .map(item => `<span class="tag">${item}</span>`)
    .join("");
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

document.addEventListener("DOMContentLoaded", () => {
  const review = getCurrentRamsReview();

  if (!review) {
    document.getElementById("resultStatus").textContent = "No RAMS review found";
    return;
  }

  document.getElementById("resultStatus").textContent = review.status || "RAMS Review Result";
  document.getElementById("resultId").textContent = review.id || "-";
  document.getElementById("resultContractor").textContent = review.contractorName || "-";
  document.getElementById("resultJobTitle").textContent = review.jobTitle || "-";
  document.getElementById("resultLocation").textContent = review.location || "-";
  document.getElementById("resultStartDate").textContent = formatDate(review.startDate);
  document.getElementById("resultEndDate").textContent = formatDate(review.endDate);
  document.getElementById("resultReviewer").textContent = review.reviewer || "-";
  document.getElementById("resultReviewDate").textContent = formatDateTime(review.reviewDate);
  document.getElementById("resultSummary").textContent = review.summary || "-";
  document.getElementById("resultClashAck").textContent = review.clashAcknowledged ? "Yes" : "No";

  renderTags("resultAreas", review.areas);
  renderTags("resultRisks", review.risks);
  renderTags("resultDetectedAreas", review.detectedAreas);
  renderTags("resultDetectedRisks", review.detectedRisks);
  renderTags("resultPermits", review.recommendedPermits);

  renderList("resultMissingItems", review.missingItems);
  renderList("resultWeakItems", review.weakItems);
});
