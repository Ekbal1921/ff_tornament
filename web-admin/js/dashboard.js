/**
 * Dashboard Overview & Statistics Module.
 */
async function initDashboard() {
  const statsContainer = document.getElementById("dashboard-stats-grid");
  const recentTournamentsTable = document.getElementById("recent-tournaments-tbody");

  try {
    // 1. Fetch Stats directly from Firestore
    const stats = await fetchStatsDirectly();

    if (stats) {
      updateStatCard("stat-total-users", stats.totalUsers || 0);
      updateStatCard("stat-active-tournaments", stats.activeTournaments || 0);
      updateStatCard("stat-completed-tournaments", stats.completedTournaments || 0);
      updateStatCard("stat-total-prizepool", "৳ " + Number(stats.totalPrizePool || 0).toLocaleString());
      updateStatCard("stat-pending-deposits", `${stats.pendingDepositCount || 0} (৳ ${Number(stats.pendingDepositAmount || 0).toLocaleString()})`);
      updateStatCard("stat-pending-withdrawals", `${stats.pendingWithdrawalCount || 0} (৳ ${Number(stats.pendingWithdrawalAmount || 0).toLocaleString()})`);
      updateStatCard("stat-pending-disputes", stats.pendingDisputesCount || 0);

      // Update Nav Badges
      updateBadge("badge-pending-deposits", stats.pendingDepositCount);
      updateBadge("badge-pending-withdrawals", stats.pendingWithdrawalCount);
      updateBadge("badge-pending-disputes", stats.pendingDisputesCount);
    }

    // 2. Fetch Recent Tournaments
    const snapshot = await db.collection("tournaments")
      .orderBy("createdAt", "desc")
      .limit(6)
      .get();

    if (recentTournamentsTable) {
      recentTournamentsTable.innerHTML = "";
      if (snapshot.empty) {
        recentTournamentsTable.innerHTML = `<tr><td colspan="6" class="empty-state">No tournaments created yet.</td></tr>`;
      } else {
        snapshot.forEach((doc) => {
          const t = doc.data();
          const tr = document.createElement("tr");
          tr.innerHTML = `
            <td><strong>${escapeHtml(t.title || "Untitled")}</strong></td>
            <td><span class="badge ${getModeBadgeClass(t.gameMode)}">${escapeHtml(t.gameMode || "Solo")}</span></td>
            <td>${t.filledSlots || 0} / ${t.totalSlots || 48}</td>
            <td>৳ ${Number(t.totalPrizePool || 0).toLocaleString()}</td>
            <td><span class="badge ${getStatusBadgeClass(t.status)}">${escapeHtml(t.status || "Upcoming")}</span></td>
            <td>
              <button class="btn btn-secondary btn-sm" onclick="quickManageTournament('${doc.id}')">Manage</button>
            </td>
          `;
          recentTournamentsTable.appendChild(tr);
        });
      }
    }

  } catch (err) {
    console.error("Dashboard init error:", err);
    showToast("Failed to load dashboard metrics: " + err.message, "error");
  }
}

async function fetchStatsDirectly() {
  let usersSnap = await db.collection("users").get();
  if (usersSnap.empty) {
    usersSnap = await db.collection("user").get();
  }
  const [tournSnap, depSnap, withSnap, repSnap] = await Promise.all([
    db.collection("tournaments").get(),
    db.collection("depositRequests").where("status", "==", "PENDING").get(),
    db.collection("withdrawalRequests").where("status", "==", "PENDING").get(),
    db.collection("reports").where("status", "==", "PENDING").get(),
  ]);

  let activeTournaments = 0;
  let completedTournaments = 0;
  let totalPrizePool = 0;

  tournSnap.forEach((doc) => {
    const t = doc.data();
    if (["Upcoming", "Registration Open", "Live"].includes(t.status)) activeTournaments++;
    if (t.status === "Completed") completedTournaments++;
    totalPrizePool += Number(t.totalPrizePool || 0);
  });

  let depAmount = 0;
  depSnap.forEach((d) => depAmount += Number(d.data().amount || 0));

  let withAmount = 0;
  withSnap.forEach((w) => withAmount += Number(w.data().amount || 0));

  return {
    totalUsers: usersSnap.size,
    totalTournaments: tournSnap.size,
    activeTournaments,
    completedTournaments,
    totalPrizePool,
    pendingDepositCount: depSnap.size,
    pendingDepositAmount: depAmount,
    pendingWithdrawalCount: withSnap.size,
    pendingWithdrawalAmount: withAmount,
    pendingDisputesCount: repSnap.size,
  };
}

function updateStatCard(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function updateBadge(id, count) {
  const el = document.getElementById(id);
  if (el) {
    if (count > 0) {
      el.textContent = count;
      el.style.display = "inline-block";
    } else {
      el.style.display = "none";
    }
  }
}

function getStatusBadgeClass(status) {
  switch (status) {
    case "Registration Open": return "badge-open";
    case "Live": return "badge-live";
    case "Upcoming": return "badge-upcoming";
    case "Full": return "badge-full";
    case "Completed": return "badge-completed";
    case "Cancelled": return "badge-cancelled";
    default: return "badge-upcoming";
  }
}

function getModeBadgeClass(mode) {
  return "badge-upcoming";
}

function escapeHtml(text) {
  if (!text) return "";
  const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
  return String(text).replace(/[&<>"']/g, (m) => map[m]);
}

function quickManageTournament(tournId) {
  const tournNav = document.querySelector('.nav-item[data-view="tournaments"]');
  if (tournNav) tournNav.click();
}

window.initDashboard = initDashboard;

