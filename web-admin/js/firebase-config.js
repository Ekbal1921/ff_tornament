/**
 * Firebase Configuration for FFTournament Web Admin Panel.
 * Loaded via Firebase Compat SDK.
 */
const firebaseConfig = {
  apiKey: "AIzaSyD47L2BIU8WG8yW6NlHdLEw_Zys7yxezlI",
  authDomain: "ff-tornamwent.firebaseapp.com",
  databaseURL: "https://ff-tornamwent-default-rtdb.firebaseio.com",
  projectId: "ff-tornamwent",
  storageBucket: "ff-tornamwent.firebasestorage.app",
  messagingSenderId: "329046440654",
  appId: "1:329046440654:web:webadmin001"
};

// Initialize Firebase
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db = firebase.firestore();
const functions = firebase.functions();
const rtdb = typeof firebase.database === "function" ? firebase.database() : null;
const storage = typeof firebase.storage === "function" ? firebase.storage() : null;

// Toast notification helper
function showToast(message, type = "info") {
  const container = document.getElementById("toast-container") || createToastContainer();
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  
  let icon = "ℹ️";
  if (type === "success") icon = "✅";
  if (type === "error") icon = "❌";
  if (type === "warning") icon = "⚠️";

  toast.innerHTML = `<span class="toast-icon">${icon}</span> <span class="toast-msg">${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("fade-out");
    setTimeout(() => toast.remove(), 400);
  }, 4000);
}

function createToastContainer() {
  const div = document.createElement("div");
  div.id = "toast-container";
  div.className = "toast-container";
  document.body.appendChild(div);
  return div;
}

// Modal helper functions
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add("active");
    document.body.style.overflow = "hidden";
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove("active");
    document.body.style.overflow = "auto";
  }
}

// Date formatter
function formatTimestamp(ts) {
  if (!ts) return "N/A";
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

