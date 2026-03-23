// js/rams-storage.js

const RAMS_STORAGE_KEY = "ramsReviews";
const CURRENT_REVIEW_KEY = "currentRamsReview";

function getRamsReviews() {
  return JSON.parse(localStorage.getItem(RAMS_STORAGE_KEY) || "[]");
}

function saveRamsReviews(reviews) {
  localStorage.setItem(RAMS_STORAGE_KEY, JSON.stringify(reviews));
}

function getCurrentRamsReview() {
  return JSON.parse(localStorage.getItem(CURRENT_REVIEW_KEY) || "null");
}

function saveCurrentRamsReview(review) {
  localStorage.setItem(CURRENT_REVIEW_KEY, JSON.stringify(review));
}

function clearCurrentRamsReview() {
  localStorage.removeItem(CURRENT_REVIEW_KEY);
}

function generateRamsId() {
  return "RAMS-" + Date.now();
}
