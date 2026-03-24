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
  let clashText = "No clash detected";

if (review.clash === true) {
  clashText = review.clashAcknowledged ? "Yes" : "No";
}

setText("resultClashAck", clashText);

  renderTags("resultAreas", review.areas);
  renderTags("resultRisks", review.risks);
  renderTags("resultDetectedAreas", review.detectedAreas);
  renderTags("resultDetectedRisks", review.detectedRisks);
  renderTags("resultPermits", review.recommendedPermits);

  renderList("resultMissingItems", review.missingItems);
  renderList("resultWeakItems", review.weakItems);

   setText("topbarSummary", `${review.contractorName || "-"} / ${review.jobTitle || "-"}`); 
  const clashWarning = document.getElementById("clashWarning");
const clashAcknowledgement = document.getElementById("clashAcknowledgement");
const clashConfirm = document.getElementById("clashConfirm");

if (review.clash === true) {
  if (clashWarning) clashWarning.style.display = "block";
  if (clashAcknowledgement) clashAcknowledgement.style.display = "block";
  if (clashConfirm) clashConfirm.checked = !!review.clashAcknowledged;
} else {
  if (clashWarning) clashWarning.style.display = "none";
  if (clashAcknowledgement) clashAcknowledgement.style.display = "none";
}
}

function updateClashesForAll() {
  const stored = JSON.parse(localStorage.getItem("ramsReviews") || "[]");

  const approved = stored.filter(r => (r.status || "").toLowerCase() === "approved");

  // reset
  approved.forEach(r => r.clash = false);

  for (let i = 0; i < approved.length; i++) {
    for (let j = i + 1; j < approved.length; j++) {
      const a = approved[i];
      const b = approved[j];

      const aStart = new Date(a.startDate);
      const aEnd = new Date(a.endDate);
      const bStart = new Date(b.startDate);
      const bEnd = new Date(b.endDate);

      const overlap = aStart <= bEnd && bStart <= aEnd;
      if (!overlap) continue;

      const sameArea = (a.areas || []).some(area =>
        (b.areas || []).includes(area)
      );

      if (sameArea) {
        a.clash = true;
        b.clash = true;
      }
    }
  }

  localStorage.setItem("ramsReviews", JSON.stringify(stored));
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
    clash: !!draft.clash,
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

// ✅ ADD THIS LINE
updateClashesForAll();

saveCurrentRamsReview(review);
clearDraftRamsReview();

  console.log("Review saved:", review);
  console.log("All reviews:", getRamsReviews());

  window.location.href = "/index.html";
}

function closeClashApprovalModal() {
  const modal = document.getElementById("clashApprovalModal");
  if (modal) modal.style.display = "none";
}

function confirmClashApproval() {
  const confirmBox = document.getElementById("clashApprovalConfirm");
  const draft = getDraftReviewData() || getCurrentRamsReview();

  if (!confirmBox?.checked) {
    alert("Please tick the control measures confirmation box before approving.");
    return;
  }

  if (draft) {
    draft.clashAcknowledged = true;
    saveDraftRamsReview(draft);
    saveCurrentRamsReview(draft);
  }

  closeClashApprovalModal();
  saveReviewWithStatus("Approved");
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
  const review = getDraftReviewData() || getCurrentRamsReview();
  const clashConfirm = document.getElementById("clashConfirm");

  if (review?.clash === true) {
    if (!clashConfirm?.checked) {
      alert("You must confirm the clash has been reviewed and control measures are in place before approving.");
      return;
    }

    review.clashAcknowledged = true;
    saveDraftRamsReview(review);
    saveCurrentRamsReview(review);
  }

  saveReviewWithStatus("Approved");
});

  document.getElementById("underReviewBtn")?.addEventListener("click", () => {
    saveReviewWithStatus("Under Review");
  });

  document.getElementById("rejectBtn")?.addEventListener("click", () => {
    saveReviewWithStatus("Rejected");
  });
});
