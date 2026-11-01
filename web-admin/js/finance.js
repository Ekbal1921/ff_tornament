/**
 * Financial Operations: Deposits, Withdrawals, and Transaction Logs.
 */

/* ==========================================================================
   1. DEPOSIT REQUESTS
   ========================================================================== */
let allDeposits = [];
let targetDepositId = null;

async function loadDeposits() {
  const tbody = document.getElementById("deposits-tbody");
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="8" class="loading-container"><div class="loading-spinner"></div>Loading deposit requests...</td></tr>`;

  try {
    const snap = await db.collection("depositRequests").orderBy("createdAt", "desc").limit(50).get();
    allDeposits = [];
    snap.forEach((doc) => {
      allDeposits.push({ id: doc.id, ...doc.data() });
    });
    renderDepositsTable(allDeposits);
  } catch (err) {
    console.error("Deposits load error:", err);
    tbody.innerHTML = `<tr><td colspan="8" class="empty-state">Failed to load deposits: ${escapeHtml(err.message)}</td></tr>`;
  }
}

function renderDepositsTable(deposits) {
  const tbody = document.getElementById("deposits-tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (deposits.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-state">No deposit requests found.</td></tr>`;
    return;
  }

  deposits.forEach((d) => {
    const rawStatus = (d.status || "PENDING").toUpperCase();
    const isPending = rawStatus === "PENDING";
    const isUnderReview = rawStatus === "UNDER_REVIEW";

    let badgeClass = "badge-pending";
    if (rawStatus === "APPROVED") badgeClass = "badge-approved";
    if (rawStatus === "REJECTED") badgeClass = "badge-rejected";
    if (rawStatus === "UNDER_REVIEW") badgeClass = "badge-completed"; // blue accent

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><span style="font-family: monospace; font-size: 11px;">${escapeHtml(d.id)}</span></td>
      <td>
        <strong>${escapeHtml(d.userId)}</strong>
      </td>
      <td><strong style="color: var(--accent-green); font-size: 15px;">৳ ${Number(d.amount || 0).toLocaleString()}</strong></td>
      <td>${escapeHtml(d.paymentMethod || "bKash")}</td>
      <td><strong style="font-family: monospace; color: var(--secondary);">${escapeHtml(d.trxId || "N/A")}</strong></td>
      <td>${escapeHtml(d.senderNumber || "N/A")}</td>
      <td><span class="badge ${badgeClass}">${escapeHtml(rawStatus)}</span></td>
      <td>
        ${isPending || isUnderReview ? `
          <div style="display: flex; gap: 6px; flex-wrap: wrap;">
            ${isPending ? `<button class="btn btn-secondary btn-sm" onclick="handleMarkDepositUnderReview('${d.id}')">Review</button>` : ''}
            <button class="btn btn-success btn-sm" onclick="openApproveDepositModal('${d.id}', ${d.amount})">Approve</button>
            <button class="btn btn-danger btn-sm" onclick="openRejectDepositModal('${d.id}')">Reject</button>
          </div>
        ` : `
          <div style="font-size: 11px; color: var(--text-muted);">
            ${d.rejectionReason ? `<span style="color: var(--accent-red);">${escapeHtml(d.rejectionReason)}</span>` : formatTimestamp(d.approvedAt || d.rejectedAt)}
          </div>
        `}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

async function handleMarkDepositUnderReview(id) {
  try {
    const reviewFn = functions.httpsCallable("adminSetDepositUnderReview");
    await reviewFn({ requestId: id });
    showToast("Request marked as Under Review.", "info");
    await loadDeposits();
  } catch (err) {
    showToast("Error updating status: " + err.message, "error");
  }
}

// Payment Settings Configuration Modal
async function openConfigurePaymentSettingsModal() {
  try {
    const doc = await db.collection("systemConfig").document("paymentSettings").get();
    const data = doc.exists ? doc.data() : {};

    document.getElementById("cfg-bkash-number").value = data.bKashNumber || "01700000000 (Personal)";
    document.getElementById("cfg-bkash-instructions").value = data.bKashInstructions || "1. Open bKash -> Send Money.\n2. Send money to this Personal number.\n3. Copy the TrxID from your SMS.\n4. Enter the TrxID and your sender number below.";
    document.getElementById("cfg-nagad-number").value = data.nagadNumber || "01800000000 (Personal)";
    document.getElementById("cfg-nagad-instructions").value = data.nagadInstructions || "1. Open Nagad -> Send Money.\n2. Send money to this Personal number.\n3. Copy the 8-digit TrxID.\n4. Enter the TrxID and your sender number below.";
    document.getElementById("cfg-min-deposit").value = data.minDeposit || 50;
    document.getElementById("cfg-max-deposit").value = data.maxDeposit || 25000;
    document.getElementById("cfg-test-notice").value = data.testNotice || "TEST TRANSACTIONS ONLY: No real money is charged during testing.";
    document.getElementById("cfg-test-mode").checked = data.isTestMode !== false;

    openModal("modal-configure-payments");
  } catch (err) {
    console.error("Load payment settings error:", err);
    showToast("Failed to load settings: " + err.message, "error");
  }
}

async function handleSavePaymentSettings(e) {
  e.preventDefault();

  const bKashNumber = document.getElementById("cfg-bkash-number").value.trim();
  const bKashInstructions = document.getElementById("cfg-bkash-instructions").value.trim();
  const nagadNumber = document.getElementById("cfg-nagad-number").value.trim();
  const nagadInstructions = document.getElementById("cfg-nagad-instructions").value.trim();
  const minDeposit = Number(document.getElementById("cfg-min-deposit").value || 50);
  const maxDeposit = Number(document.getElementById("cfg-max-deposit").value || 25000);
  const testNotice = document.getElementById("cfg-test-notice").value.trim();
  const isTestMode = document.getElementById("cfg-test-mode").checked;

  const btn = document.getElementById("btn-save-payment-settings");
  btn.disabled = true;
  btn.textContent = "Saving...";

  try {
    const cfgFn = functions.httpsCallable("adminConfigurePaymentSettings");
    await cfgFn({
      bKashNumber,
      bKashInstructions,
      nagadNumber,
      nagadInstructions,
      minDeposit,
      maxDeposit,
      testNotice,
      isTestMode,
    });

    showToast("Payment methods and instructions saved successfully!", "success");
    closeModal("modal-configure-payments");
  } catch (err) {
    console.error("Save payment settings error:", err);
    showToast("Failed to save settings: " + err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Save Settings & Log Audit";
  }
}

function filterDeposits() {
  const statusFilter = document.getElementById("deposit-status-filter")?.value || "ALL";
  const search = document.getElementById("deposit-search-input")?.value.toLowerCase().trim() || "";

  const filtered = allDeposits.filter((d) => {
    const matchStatus = statusFilter === "ALL" || d.status === statusFilter;
    const matchSearch = (d.userId && d.userId.toLowerCase().includes(search)) || (d.trxId && d.trxId.toLowerCase().includes(search)) || (d.id && d.id.toLowerCase().includes(search));
    return matchStatus && matchSearch;
  });

  renderDepositsTable(filtered);
}

function openApproveDepositModal(id, amount) {
  targetDepositId = id;
  document.getElementById("approve-deposit-id").textContent = id;
  document.getElementById("approve-deposit-amount").textContent = "৳ " + Number(amount).toLocaleString();
  openModal("modal-approve-deposit");
}

async function handleConfirmApproveDeposit() {
  if (!targetDepositId) return;

  const note = document.getElementById("approve-deposit-note").value.trim();
  const btn = document.getElementById("btn-confirm-approve-deposit");
  btn.disabled = true;
  btn.textContent = "Processing...";

  try {
    const approveFn = functions.httpsCallable("adminApproveDeposit");
    const res = await approveFn({
      requestId: targetDepositId,
      adminNote: note || "Verified and approved.",
    });

    showToast(res.data.message || "Deposit approved and balance credited!", "success");
    closeModal("modal-approve-deposit");
    await loadDeposits();
  } catch (err) {
    console.error("Approve deposit error:", err);
    showToast("Approval failed: " + err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Confirm & Credit Balance";
  }
}

function openRejectDepositModal(id) {
  targetDepositId = id;
  document.getElementById("reject-deposit-id").textContent = id;
  openModal("modal-reject-deposit");
}

async function handleConfirmRejectDeposit() {
  if (!targetDepositId) return;

  const reason = document.getElementById("reject-deposit-reason").value.trim();
  const btn = document.getElementById("btn-confirm-reject-deposit");
  btn.disabled = true;
  btn.textContent = "Rejecting...";

  try {
    const rejectFn = functions.httpsCallable("adminRejectDeposit");
    await rejectFn({
      requestId: targetDepositId,
      reason: reason || "Invalid transaction details.",
    });

    showToast("Deposit request rejected.", "warning");
    closeModal("modal-reject-deposit");
    await loadDeposits();
  } catch (err) {
    console.error("Reject deposit error:", err);
    showToast("Rejection failed: " + err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Confirm Rejection";
  }
}

/* ==========================================================================
   2. WITHDRAWAL REQUESTS
   ========================================================================== */
let allWithdrawals = [];
let targetWithdrawalId = null;

async function loadWithdrawals() {
  const tbody = document.getElementById("withdrawals-tbody");
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="8" class="loading-container"><div class="loading-spinner"></div>Loading withdrawal requests...</td></tr>`;

  try {
    const snap = await db.collection("withdrawalRequests").orderBy("createdAt", "desc").limit(50).get();
    allWithdrawals = [];
    snap.forEach((doc) => {
      allWithdrawals.push({ id: doc.id, ...doc.data() });
    });
    renderWithdrawalsTable(allWithdrawals);
  } catch (err) {
    console.error("Withdrawals load error:", err);
    tbody.innerHTML = `<tr><td colspan="8" class="empty-state">Failed to load withdrawals: ${escapeHtml(err.message)}</td></tr>`;
  }
}

function renderWithdrawalsTable(withdrawals) {
  const tbody = document.getElementById("withdrawals-tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (withdrawals.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-state">No withdrawal requests found.</td></tr>`;
    return;
  }

  withdrawals.forEach((w) => {
    const isPending = w.status === "PENDING";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><span style="font-family: monospace; font-size: 11px;">${escapeHtml(w.id)}</span></td>
      <td><strong>${escapeHtml(w.userId)}</strong></td>
      <td><strong style="color: var(--secondary); font-size: 15px;">৳ ${Number(w.amount || 0).toLocaleString()}</strong></td>
      <td>${escapeHtml(w.paymentMethod || "bKash")}</td>
      <td><strong style="font-family: monospace;">${escapeHtml(w.receiverNumber || "N/A")}</strong></td>
      <td><span class="badge ${w.status === 'COMPLETED' ? 'badge-approved' : (w.status === 'REJECTED' ? 'badge-rejected' : 'badge-pending')}">${escapeHtml(w.status || "PENDING")}</span></td>
      <td>${formatTimestamp(w.createdAt)}</td>
      <td>
        ${isPending ? `
          <div style="display: flex; gap: 6px;">
            <button class="btn btn-success btn-sm" onclick="openApproveWithdrawalModal('${w.id}', ${w.amount})">Complete</button>
            <button class="btn btn-danger btn-sm" onclick="openRejectWithdrawalModal('${w.id}', ${w.amount})">Reject</button>
          </div>
        ` : `
          <div style="font-size: 11px; color: var(--text-muted);">
            ${w.payoutTrxId ? `Ref: ${escapeHtml(w.payoutTrxId)}` : formatTimestamp(w.completedAt || w.rejectedAt)}
          </div>
        `}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function filterWithdrawals() {
  const statusFilter = document.getElementById("withdrawal-status-filter")?.value || "ALL";
  const search = document.getElementById("withdrawal-search-input")?.value.toLowerCase().trim() || "";

  const filtered = allWithdrawals.filter((w) => {
    const matchStatus = statusFilter === "ALL" || w.status === statusFilter;
    const matchSearch = (w.userId && w.userId.toLowerCase().includes(search)) || (w.receiverNumber && w.receiverNumber.includes(search)) || (w.id && w.id.toLowerCase().includes(search));
    return matchStatus && matchSearch;
  });

  renderWithdrawalsTable(filtered);
}

function openApproveWithdrawalModal(id, amount) {
  targetWithdrawalId = id;
  document.getElementById("approve-withdraw-id").textContent = id;
  document.getElementById("approve-withdraw-amount").textContent = "৳ " + Number(amount).toLocaleString();
  openModal("modal-approve-withdrawal");
}

async function handleConfirmApproveWithdrawal() {
  if (!targetWithdrawalId) return;

  const trxRef = document.getElementById("approve-withdraw-ref").value.trim();
  const note = document.getElementById("approve-withdraw-note").value.trim();
  const btn = document.getElementById("btn-confirm-approve-withdraw");
  btn.disabled = true;
  btn.textContent = "Processing...";

  try {
    const approveFn = functions.httpsCallable("adminApproveWithdrawal");
    const res = await approveFn({
      requestId: targetWithdrawalId,
      transactionRef: trxRef,
      adminNote: note || "Payout processed.",
    });

    showToast(res.data.message || "Withdrawal completed!", "success");
    closeModal("modal-approve-withdrawal");
    await loadWithdrawals();
  } catch (err) {
    console.error("Approve withdrawal error:", err);
    showToast("Processing failed: " + err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Confirm Payout Complete";
  }
}

function openRejectWithdrawalModal(id, amount) {
  targetWithdrawalId = id;
  document.getElementById("reject-withdraw-id").textContent = id;
  document.getElementById("reject-withdraw-amount").textContent = "৳ " + Number(amount).toLocaleString();
  openModal("modal-reject-withdrawal");
}

async function handleConfirmRejectWithdrawal() {
  if (!targetWithdrawalId) return;

  const reason = document.getElementById("reject-withdraw-reason").value.trim();
  const btn = document.getElementById("btn-confirm-reject-withdraw");
  btn.disabled = true;
  btn.textContent = "Refunding...";

  try {
    const rejectFn = functions.httpsCallable("adminRejectWithdrawal");
    const res = await rejectFn({
      requestId: targetWithdrawalId,
      reason: reason || "Withdrawal rejected.",
    });

    showToast(res.data.message || "Withdrawal rejected & balance refunded to player!", "warning");
    closeModal("modal-reject-withdrawal");
    await loadWithdrawals();
  } catch (err) {
    console.error("Reject withdrawal error:", err);
    showToast("Rejection failed: " + err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Confirm Rejection & Refund";
  }
}

/* ==========================================================================
   3. ALL TRANSACTION LOGS
   ========================================================================== */
let allTransactions = [];

async function loadTransactions() {
  const tbody = document.getElementById("transactions-tbody");
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="7" class="loading-container"><div class="loading-spinner"></div>Loading global transaction logs...</td></tr>`;

  try {
    const snap = await db.collection("transactions").orderBy("timestamp", "desc").limit(80).get();
    allTransactions = [];
    snap.forEach((doc) => {
      allTransactions.push({ id: doc.id, ...doc.data() });
    });
    renderTransactionsTable(allTransactions);
  } catch (err) {
    console.error("Transactions load error:", err);
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">Failed to load transactions: ${escapeHtml(err.message)}</td></tr>`;
  }
}

function renderTransactionsTable(transactions) {
  const tbody = document.getElementById("transactions-tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (transactions.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">No transaction logs recorded yet.</td></tr>`;
    return;
  }

  transactions.forEach((tx) => {
    let typeClass = "badge-upcoming";
    if (tx.type === "DEPOSIT" || tx.type === "WINNING") typeClass = "badge-approved";
    if (tx.type === "WITHDRAWAL") typeClass = "badge-live";
    if (tx.type === "REFUND") typeClass = "badge-open";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><span style="font-family: monospace; font-size: 11px;">${escapeHtml(tx.id)}</span></td>
      <td><strong>${escapeHtml(tx.userId)}</strong></td>
      <td><span class="badge ${typeClass}">${escapeHtml(tx.type || "TRANSACTION")}</span></td>
      <td><strong style="font-size: 14px;">৳ ${Number(tx.amount || 0).toLocaleString()}</strong></td>
      <td style="font-size: 12px; color: var(--text-secondary);">${escapeHtml(tx.tournamentTitle || tx.reason || tx.trxId || "-")}</td>
      <td><span class="badge badge-open">${escapeHtml(tx.status || "COMPLETED")}</span></td>
      <td>${formatTimestamp(tx.timestamp)}</td>
    `;
    tbody.appendChild(tr);
  });
}

function filterTransactions() {
  const typeFilter = document.getElementById("tx-type-filter")?.value || "ALL";
  const search = document.getElementById("tx-search-input")?.value.toLowerCase().trim() || "";

  const filtered = allTransactions.filter((tx) => {
    const matchType = typeFilter === "ALL" || tx.type === typeFilter;
    const matchSearch = (tx.userId && tx.userId.toLowerCase().includes(search)) || (tx.id && tx.id.toLowerCase().includes(search));
    return matchType && matchSearch;
  });

  renderTransactionsTable(filtered);
}

document.addEventListener("DOMContentLoaded", () => {
  const btnApproveDep = document.getElementById("btn-confirm-approve-deposit");
  if (btnApproveDep) btnApproveDep.addEventListener("click", handleConfirmApproveDeposit);

  const btnRejectDep = document.getElementById("btn-confirm-reject-deposit");
  if (btnRejectDep) btnRejectDep.addEventListener("click", handleConfirmRejectDeposit);

  const btnApproveWith = document.getElementById("btn-confirm-approve-withdraw");
  if (btnApproveWith) btnApproveWith.addEventListener("click", handleConfirmApproveWithdrawal);

  const btnRejectWith = document.getElementById("btn-confirm-reject-withdraw");
  if (btnRejectWith) btnRejectWith.addEventListener("click", handleConfirmRejectWithdrawal);

  const formCfgPay = document.getElementById("form-configure-payments");
  if (formCfgPay) formCfgPay.addEventListener("submit", handleSavePaymentSettings);
});

/* ==========================================================================
   4. PHASE 8: LEDGER RECONCILIATION
   ========================================================================== */
function openReconcileModal(userId = "") {
  document.getElementById("reconcile-user-id").value = userId || "";
  document.getElementById("reconcile-result-card").style.display = "none";
  openModal("modal-ledger-reconcile");
}

async function handleRunReconcile() {
  const userId = document.getElementById("reconcile-user-id").value.trim();
  const card = document.getElementById("reconcile-result-card");
  const badge = document.getElementById("reconcile-badge");

  card.style.display = "block";
  badge.textContent = "Auditing...";
  badge.className = "badge badge-pending";

  try {
    const reconcileFn = functions.httpsCallable("reconcileWalletLedger");
    const res = await reconcileFn({ userId: userId || undefined });
    const r = res.data;

    const isBalanced = r.status === "BALANCED";
    badge.textContent = isBalanced ? "BALANCED" : "DISCREPANCY";
    badge.className = isBalanced ? "badge badge-approved" : "badge badge-rejected";

    document.getElementById("rec-snap-bal").textContent = "৳ " + Number(r.snapshotBalance || 0).toLocaleString();
    document.getElementById("rec-comp-bal").textContent = "৳ " + Number(r.computedBalance || 0).toLocaleString();
    document.getElementById("rec-credits").textContent = "+৳ " + Number(r.totalCredits || 0).toLocaleString();
    document.getElementById("rec-debits").textContent = "-৳ " + Number(r.totalDebits || 0).toLocaleString();
    document.getElementById("rec-variance").textContent = "৳ " + Number(r.balanceVariance || 0).toFixed(2);
    document.getElementById("rec-count").textContent = r.transactionsCount || 0;
    document.getElementById("rec-idemp").textContent = (r.duplicateIdempotencyKeys === 0) ? "✅ Zero duplicate keys" : `⚠️ ${r.duplicateIdempotencyKeys} duplicates flagged`;
    document.getElementById("rec-running").textContent = r.runningBalanceIntegrity ? "✅ Maintained non-negative" : "⚠️ Negative balance detected in timeline";

    showToast(isBalanced ? "Ledger reconciled! Perfect match." : "Discrepancy detected in ledger audit.", isBalanced ? "success" : "warning");
  } catch (err) {
    badge.textContent = "ERROR";
    badge.className = "badge badge-rejected";
    showToast("Reconciliation failed: " + err.message, "error");
  }
}

window.loadDeposits = loadDeposits;
window.filterDeposits = filterDeposits;
window.openApproveDepositModal = openApproveDepositModal;
window.openRejectDepositModal = openRejectDepositModal;
window.handleMarkDepositUnderReview = handleMarkDepositUnderReview;
window.openConfigurePaymentSettingsModal = openConfigurePaymentSettingsModal;

window.loadWithdrawals = loadWithdrawals;
window.filterWithdrawals = filterWithdrawals;
window.openApproveWithdrawalModal = openApproveWithdrawalModal;
window.openRejectWithdrawalModal = openRejectWithdrawalModal;

window.loadTransactions = loadTransactions;
window.filterTransactions = filterTransactions;
window.openReconcileModal = openReconcileModal;
window.handleRunReconcile = handleRunReconcile;

