/**
 * Disputes, Lobby Intruder Reports & Refunds Module.
 */
let allReports = [];
let targetReportId = null;

async function loadDisputes() {
  const tbody = document.getElementById("disputes-tbody");
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="7" class="loading-container"><div class="loading-spinner"></div>Loading dispute reports...</td></tr>`;

  try {
    const snap = await db.collection("reports").orderBy("createdAt", "desc").limit(50).get();
    allReports = [];
    snap.forEach((doc) => {
      allReports.push({ id: doc.id, ...doc.data() });
    });
    renderDisputesTable(allReports);
  } catch (err) {
    console.error("Disputes load error:", err);
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">Failed to load reports: ${escapeHtml(err.message)}</td></tr>`;
  }
}

function renderDisputesTable(reports) {
  const tbody = document.getElementById("disputes-tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (reports.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">No dispute or cheat reports filed.</td></tr>`;
    return;
  }

  reports.forEach((r) => {
    const isPending = r.status === "PENDING";
    let statusBadge = "badge-pending";
    if (r.status === "RESOLVED") statusBadge = "badge-approved";
    if (r.status === "DISMISSED") statusBadge = "badge-full";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><span style="font-family: monospace; font-size: 11px;">${escapeHtml(r.id)}</span></td>
      <td><strong>${escapeHtml(r.tournamentId || "Match")}</strong></td>
      <td><strong style="color: var(--accent-red); font-family: monospace;">${escapeHtml(r.reportedFreeFireUid || "N/A")}</strong></td>
      <td>${escapeHtml(r.reportedFreeFireName || "Unknown")}</td>
      <td style="font-size: 12px; color: var(--text-secondary); max-width: 250px;">${escapeHtml(r.reason || "No details provided")}</td>
      <td><span class="badge ${statusBadge}">${escapeHtml(r.status || "PENDING")}</span></td>
      <td>
        ${isPending ? `
          <div style="display: flex; gap: 6px;">
            <button class="btn btn-success btn-sm" onclick="openResolveReportModal('${r.id}')">Resolve</button>
            <button class="btn btn-secondary btn-sm" onclick="handleDismissReport('${r.id}')">Dismiss</button>
          </div>
        ` : `
          <span style="font-size: 11px; color: var(--text-muted);">${escapeHtml(r.resolutionNotes || formatTimestamp(r.resolvedAt))}</span>
        `}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function filterDisputes() {
  const statusFilter = document.getElementById("dispute-status-filter")?.value || "ALL";
  const search = document.getElementById("dispute-search-input")?.value.toLowerCase().trim() || "";

  const filtered = allReports.filter((r) => {
    const matchStatus = statusFilter === "ALL" || r.status === statusFilter;
    const matchSearch = (r.reportedFreeFireUid && r.reportedFreeFireUid.includes(search)) ||
                        (r.tournamentId && r.tournamentId.toLowerCase().includes(search)) ||
                        (r.reason && r.reason.toLowerCase().includes(search));
    return matchStatus && matchSearch;
  });

  renderDisputesTable(filtered);
}

function openResolveReportModal(reportId) {
  targetReportId = reportId;
  document.getElementById("resolve-report-id-display").textContent = reportId;
  openModal("modal-resolve-report");
}

async function handleConfirmResolveReport() {
  if (!targetReportId) return;

  const notes = document.getElementById("resolve-report-notes").value.trim();
  const btn = document.getElementById("btn-confirm-resolve-report");
  btn.disabled = true;
  btn.textContent = "Resolving...";

  try {
    const now = firebase.firestore.FieldValue.serverTimestamp();
    const adminId = (currentAdminUser && currentAdminUser.uid) || (auth.currentUser && auth.currentUser.uid) || "admin";
    await db.collection("reports").doc(targetReportId).update({
      status: "RESOLVED",
      resolutionNotes: notes || "Investigated and resolved.",
      resolvedByAdminId: adminId,
      resolvedAt: now,
      updatedAt: now,
    });

    showToast("Report marked as resolved.", "success");
    closeModal("modal-resolve-report");
    await loadDisputes();
  } catch (err) {
    console.error("Resolve report error:", err);
    showToast("Failed to resolve report: " + err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Confirm Resolution";
  }
}

async function handleDismissReport(reportId) {
  if (!confirm("Dismiss this report as invalid or unverified?")) return;

  try {
    const now = firebase.firestore.FieldValue.serverTimestamp();
    const adminId = (currentAdminUser && currentAdminUser.uid) || (auth.currentUser && auth.currentUser.uid) || "admin";
    await db.collection("reports").doc(reportId).update({
      status: "DISMISSED",
      resolutionNotes: "Dismissed by admin after review.",
      resolvedByAdminId: adminId,
      resolvedAt: now,
      updatedAt: now,
    });

    showToast("Report dismissed.", "info");
    await loadDisputes();
  } catch (err) {
    console.error("Dismiss report error:", err);
    showToast("Failed: " + err.message, "error");
  }
}

// Manual Refund Action
function openManualRefundModal() {
  openModal("modal-manual-refund");
}

async function handleConfirmManualRefund() {
  const userId = document.getElementById("refund-user-id").value.trim();
  const tournId = document.getElementById("refund-tourn-id").value.trim();
  const amount = Number(document.getElementById("refund-amount").value);
  const reason = document.getElementById("refund-reason").value.trim();

  if (!userId || !amount || amount <= 0) {
    showToast("Please enter a valid User ID and refund amount.", "error");
    return;
  }

  const btn = document.getElementById("btn-confirm-manual-refund");
  btn.disabled = true;
  btn.textContent = "Processing...";

  try {
    await executeManualRefundDirectFallback(userId, tournId, amount, reason);
    showToast(`Refund of ৳${amount} credited to player wallet!`, "success");

    closeModal("modal-manual-refund");
    document.getElementById("form-manual-refund").reset();
  } catch (err) {
    console.error("Refund error:", err);
    showToast("Refund failed: " + err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Issue Refund to Wallet";
  }
}

/**
 * DIRECT FIRESTORE FALLBACK: Manual Wallet Refund
 */
async function executeManualRefundDirectFallback(userId, tournId, amount, reason) {
  const refundAmountInPaisa = Math.round(amount * 100);
  const walletRef = db.collection("wallets").doc(userId);
  const now = firebase.firestore.FieldValue.serverTimestamp();
  const adminId = (currentAdminUser && currentAdminUser.uid) || (auth.currentUser && auth.currentUser.uid) || "admin";

  return db.runTransaction(async (transaction) => {
    const walletDoc = await transaction.get(walletRef);
    const wData = walletDoc.exists ? walletDoc.data() : {};

    const curBalPaisa = Math.round(Number(wData.balanceInPaisa != null ? wData.balanceInPaisa : (wData.balance || 0) * 100));
    const curDepPaisa = Math.round(Number(wData.depositBalanceInPaisa != null ? wData.depositBalanceInPaisa : (wData.depositBalance || 0) * 100));

    const newBalPaisa = curBalPaisa + refundAmountInPaisa;
    const newDepPaisa = curDepPaisa + refundAmountInPaisa;

    transaction.set(walletRef, {
      userId,
      balanceInPaisa: newBalPaisa,
      depositBalanceInPaisa: newDepPaisa,
      balance: newBalPaisa / 100.0,
      depositBalance: newDepPaisa / 100.0,
      updatedAt: now,
    }, { merge: true });

    const txRef = walletRef.collection("transactions").doc();
    const globalTxRef = db.collection("transactions").doc(txRef.id);
    const ledgerRef = db.collection("ledgerEntries").doc(txRef.id);

    const idempotencyKey = `refund_${txRef.id}`;
    const txPayload = {
      transactionId: txRef.id,
      idempotencyKey,
      userId,
      type: "REFUND",
      amountInPaisa: refundAmountInPaisa,
      amount,
      balanceBeforeInPaisa: curBalPaisa,
      balanceAfterInPaisa: newBalPaisa,
      tournamentId: tournId || "",
      status: "CONFIRMED",
      description: `Manual Refund: ${reason || "Admin compensation"}`,
      timestamp: now,
    };

    transaction.set(txRef, txPayload);
    transaction.set(globalTxRef, txPayload);
    transaction.set(ledgerRef, txPayload);

    const auditRef = db.collection("adminAuditLogs").doc();
    transaction.set(auditRef, {
      adminId,
      action: "MANUAL_REFUND_ISSUED",
      targetId: userId,
      details: { amount, tournamentId: tournId, reason },
      timestamp: now,
    });
  });
}
}

document.addEventListener("DOMContentLoaded", () => {
  const btnResolve = document.getElementById("btn-confirm-resolve-report");
  if (btnResolve) btnResolve.addEventListener("click", handleConfirmResolveReport);

  const btnRefund = document.getElementById("btn-confirm-manual-refund");
  if (btnRefund) btnRefund.addEventListener("click", handleConfirmManualRefund);
});

window.loadDisputes = loadDisputes;
window.filterDisputes = filterDisputes;
window.openResolveReportModal = openResolveReportModal;
window.handleDismissReport = handleDismissReport;
window.openManualRefundModal = openManualRefundModal;

