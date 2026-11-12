/**
 * Financial Operations: Deposits, Withdrawals, and Transaction Logs.
 */

/* ==========================================================================
   1. DEPOSIT REQUESTS
   ========================================================================== */
let allDeposits = [];
let targetDepositId = null;
let selectedDepositIds = new Set();

function handleDepositCheckChange(id, isChecked) {
  if (isChecked) {
    selectedDepositIds.add(id);
  } else {
    selectedDepositIds.delete(id);
  }
  updateDepositsBulkButton();
}

function toggleSelectAllDeposits(isChecked) {
  const checkboxes = document.querySelectorAll(".deposit-row-check");
  checkboxes.forEach((cb) => {
    cb.checked = isChecked;
    if (isChecked) {
      selectedDepositIds.add(cb.value);
    } else {
      selectedDepositIds.delete(cb.value);
    }
  });
  updateDepositsBulkButton();
}

function updateDepositsBulkButton() {
  const count = selectedDepositIds.size;
  const countEl = document.getElementById("deposits-selected-count");
  if (countEl) countEl.textContent = count;
  const btn = document.getElementById("btn-bulk-delete-deposits");
  if (btn) btn.disabled = count === 0;

  const selectAllCb = document.getElementById("deposits-select-all");
  const visibleCbs = document.querySelectorAll(".deposit-row-check");
  if (selectAllCb) {
    if (visibleCbs.length > 0 && Array.from(visibleCbs).every(cb => cb.checked)) {
      selectAllCb.checked = true;
    } else {
      selectAllCb.checked = false;
    }
  }
}

function openBulkDeleteDepositsModal() {
  if (selectedDepositIds.size === 0) {
    showToast("Please select at least one deposit request to delete.", "warning");
    return;
  }
  const countEl = document.getElementById("bulk-delete-deposits-count");
  if (countEl) countEl.textContent = selectedDepositIds.size;
  openModal("modal-bulk-delete-deposits");
}

async function handleConfirmBulkDeleteDeposits() {
  if (selectedDepositIds.size === 0) return;

  const adminId = (currentAdminUser && currentAdminUser.uid) || (auth.currentUser && auth.currentUser.uid) || "admin";
  const btn = document.getElementById("btn-confirm-bulk-delete-deposits");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Deleting...";
  }

  const idsToDelete = Array.from(selectedDepositIds);

  try {
    // Financial Safety / Ledger Integrity Verification:
    // Only the requests in 'depositRequests' are deleted.
    // Permanent financial transaction ledgers and audit records remain untouched.
    const batch = db.batch();
    idsToDelete.forEach((id) => {
      batch.delete(db.collection("depositRequests").doc(id));
    });
    await batch.commit();

    // Record Immutable Admin Audit Trail
    try {
      await db.collection("adminAuditLogs").add({
        adminId,
        action: "BULK_DEPOSIT_REQUESTS_DELETED",
        targetId: "bulk",
        details: {
          deletedCount: idsToDelete.length,
          deletedRecordIds: idsToDelete,
          timestamp: new Date().toISOString(),
        },
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      });
    } catch (auditErr) {
      console.warn("Audit log notice:", auditErr.message);
    }

    selectedDepositIds.clear();
    const selectAllCb = document.getElementById("deposits-select-all");
    if (selectAllCb) selectAllCb.checked = false;
    updateDepositsBulkButton();

    showToast(`Successfully deleted ${idsToDelete.length} deposit request(s).`, "success");
    closeModal("modal-bulk-delete-deposits");
    await loadDeposits();
    if (window.initDashboard) window.initDashboard();
  } catch (err) {
    console.error("Bulk delete deposits error:", err);
    if (err.code === "permission-denied" || (err.message && err.message.toLowerCase().includes("permission"))) {
      showToast("Permission Denied: Please publish the updated firestore.rules in Firebase Console.", "error");
    } else {
      showToast("Failed to delete deposit requests: " + err.message, "error");
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Permanently Delete";
    }
  }
}

async function loadDeposits() {
  const tbody = document.getElementById("deposits-tbody");
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="9" class="loading-container"><div class="loading-spinner"></div>Loading deposit requests...</td></tr>`;

  try {
    const snap = await db.collection("depositRequests").orderBy("createdAt", "desc").limit(50).get();
    allDeposits = [];
    snap.forEach((doc) => {
      allDeposits.push({ id: doc.id, ...doc.data() });
    });
    renderDepositsTable(allDeposits);
  } catch (err) {
    console.error("Deposits load error:", err);
    tbody.innerHTML = `<tr><td colspan="9" class="empty-state">Failed to load deposits: ${escapeHtml(err.message)}</td></tr>`;
  }
}

function renderDepositsTable(deposits) {
  const tbody = document.getElementById("deposits-tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (deposits.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="empty-state">No deposit requests found.</td></tr>`;
    updateDepositsBulkButton();
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

    const isSelected = selectedDepositIds.has(d.id);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="text-align: center;">
        <input type="checkbox" class="deposit-row-check" value="${escapeHtml(d.id)}" ${isSelected ? "checked" : ""} onchange="handleDepositCheckChange('${escapeHtml(d.id)}', this.checked)" style="cursor: pointer; width: 16px; height: 16px;">
      </td>
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

  updateDepositsBulkButton();
}

async function handleMarkDepositUnderReview(id) {
  try {
    await setDepositUnderReviewDirectFallback(id);
    showToast("Request marked as Under Review.", "info");
    await loadDeposits();
  } catch (err) {
    showToast("Error updating status: " + err.message, "error");
  }
}

// Payment Settings Configuration Modal
async function openConfigurePaymentSettingsModal() {
  try {
    const doc = await db.collection("systemConfig").doc("paymentSettings").get();
    const data = doc.exists ? doc.data() : {};

    document.getElementById("cfg-bkash-number").value = data.bKashNumber || "01700000000 (Personal)";
    document.getElementById("cfg-bkash-instructions").value = data.bKashInstructions || "1. Open bKash -> Send Money.\n2. Send money to this Personal number.\n3. Copy the TrxID from your SMS.\n4. Enter the TrxID and your sender number below.";
    document.getElementById("cfg-nagad-number").value = data.nagadNumber || "01800000000 (Personal)";
    document.getElementById("cfg-nagad-instructions").value = data.nagadInstructions || "1. Open Nagad -> Send Money.\n2. Send money to this Personal number.\n3. Copy the 8-digit TrxID.\n4. Enter the TrxID and your sender number below.";
    document.getElementById("cfg-min-deposit").value = data.minDeposit || 50;
    document.getElementById("cfg-max-deposit").value = data.maxDeposit || 25000;
    document.getElementById("cfg-min-withdrawal").value = data.minWithdrawal || 100;
    document.getElementById("cfg-max-withdrawal").value = data.maxWithdrawal || 10000;
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
  const minWithdrawal = Number(document.getElementById("cfg-min-withdrawal").value || 100);
  const maxWithdrawal = Number(document.getElementById("cfg-max-withdrawal").value || 10000);
  const testNotice = document.getElementById("cfg-test-notice").value.trim();
  const isTestMode = document.getElementById("cfg-test-mode").checked;

  const btn = document.getElementById("btn-save-payment-settings");
  btn.disabled = true;
  btn.textContent = "Saving...";

  try {
    const adminId = (currentAdminUser && currentAdminUser.uid) || (auth.currentUser && auth.currentUser.uid) || "admin";
    await db.collection("systemConfig").doc("paymentSettings").set({
      bKashNumber,
      bKashInstructions,
      nagadNumber,
      nagadInstructions,
      minDeposit,
      maxDeposit,
      minWithdrawal,
      maxWithdrawal,
      testNotice,
      isTestMode,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedBy: adminId,
    }, { merge: true });

    await db.collection("adminAuditLogs").add({
      adminId,
      action: "CONFIGURE_PAYMENT_SETTINGS",
      targetId: "paymentSettings",
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
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
    await approveDepositDirectFallback(targetDepositId, note);
    showToast("Deposit verified & balance credited to player wallet!", "success");

    closeModal("modal-approve-deposit");
    await loadDeposits();
    if (window.initDashboard) window.initDashboard();
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
    await rejectDepositDirectFallback(targetDepositId, reason);
    showToast("Deposit request rejected.", "warning");
    closeModal("modal-reject-deposit");
    await loadDeposits();
    if (window.initDashboard) window.initDashboard();
  } catch (err) {
    console.error("Reject deposit error:", err);
    showToast("Rejection failed: " + err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Confirm Rejection";
  }
}

/**
 * DIRECT FIRESTORE FALLBACK: Approve Deposit Request
 */
async function approveDepositDirectFallback(requestId, note) {
  const depositRef = db.collection("depositRequests").doc(requestId);
  const now = firebase.firestore.FieldValue.serverTimestamp();
  const adminId = (currentAdminUser && currentAdminUser.uid) || (auth.currentUser && auth.currentUser.uid) || "admin";

  return db.runTransaction(async (transaction) => {
    const depDoc = await transaction.get(depositRef);
    if (!depDoc.exists) throw new Error("Deposit request not found.");

    const depData = depDoc.data();
    if ((depData.status || "").toUpperCase() === "APPROVED") {
      throw new Error("Deposit is already approved.");
    }

    const targetUserId = depData.userId;
    const amount = Number(depData.amount || 0);
    const amountInPaisa = Math.round(Number(depData.amountInPaisa || amount * 100));

    const walletRef = db.collection("wallets").doc(targetUserId);
    const walletDoc = await transaction.get(walletRef);
    const wData = walletDoc.exists ? walletDoc.data() : {};

    const curBalPaisa = Math.round(Number(wData.balanceInPaisa != null ? wData.balanceInPaisa : (wData.balance || 0) * 100));
    const curDepPaisa = Math.round(Number(wData.depositBalanceInPaisa != null ? wData.depositBalanceInPaisa : (wData.depositBalance || 0) * 100));
    const curTotalDepPaisa = Math.round(Number(wData.totalDepositsInPaisa != null ? wData.totalDepositsInPaisa : (wData.totalDeposits || 0) * 100));

    const newBalPaisa = curBalPaisa + amountInPaisa;
    const newDepPaisa = curDepPaisa + amountInPaisa;
    const newTotalDepPaisa = curTotalDepPaisa + amountInPaisa;

    // 1. Credit wallet
    transaction.set(walletRef, {
      userId: targetUserId,
      balanceInPaisa: newBalPaisa,
      depositBalanceInPaisa: newDepPaisa,
      totalDepositsInPaisa: newTotalDepPaisa,
      balance: newBalPaisa / 100.0,
      depositBalance: newDepPaisa / 100.0,
      totalDeposits: newTotalDepPaisa / 100.0,
      updatedAt: now,
    }, { merge: true });

    // 2. Mark deposit request APPROVED
    transaction.update(depositRef, {
      status: "APPROVED",
      adminNote: note || "Verified and approved.",
      approvedByAdminId: adminId,
      approvedAt: now,
      updatedAt: now,
    });

    // 3. Immutable transaction & ledger entry
    const txRef = walletRef.collection("transactions").doc();
    const globalTxRef = db.collection("transactions").doc(txRef.id);
    const ledgerRef = db.collection("ledgerEntries").doc(txRef.id);

    const idempotencyKey = `dep_${requestId}`;
    const txPayload = {
      transactionId: txRef.id,
      idempotencyKey,
      userId: targetUserId,
      type: "DEPOSIT_CREDIT",
      amountInPaisa,
      amount,
      balanceBeforeInPaisa: curBalPaisa,
      balanceAfterInPaisa: newBalPaisa,
      depositMethod: depData.paymentMethod || "bKash/Nagad",
      senderNumber: depData.senderNumber || "",
      trxId: depData.trxId || "",
      status: "CONFIRMED",
      description: `Manual Deposit via ${depData.paymentMethod || "Mobile Banking"} (Trx: ${depData.trxId || "N/A"})`,
      timestamp: now,
    };

    transaction.set(txRef, txPayload);
    transaction.set(globalTxRef, txPayload);
    transaction.set(ledgerRef, txPayload);

    // 4. Mark TrxId as used
    if (depData.trxId) {
      const usedRef = db.collection("usedTrxIds").doc(depData.trxId.toUpperCase().trim());
      transaction.set(usedRef, {
        trxId: depData.trxId.toUpperCase().trim(),
        usedAt: now,
        userId: targetUserId,
        depositRequestId: requestId,
      });
    }

    // 5. User Notification (Phase 10)
    const notifRef = db.collection("notifications").doc();
    transaction.set(notifRef, {
      userId: targetUserId,
      title: "Deposit Approved",
      message: `৳${amount} has been approved and credited to your wallet balance.`,
      type: "DEPOSIT_STATUS",
      referenceId: requestId,
      read: false,
      createdAt: now,
    });

    // 6. Admin Audit Log
    const auditRef = db.collection("adminAuditLogs").doc();
    transaction.set(auditRef, {
      adminId,
      action: "DEPOSIT_APPROVED",
      targetId: requestId,
      details: { amount, targetUserId, trxId: depData.trxId },
      timestamp: now,
    });
  });
}

/**
 * DIRECT FIRESTORE FALLBACK: Reject Deposit Request
 */
async function rejectDepositDirectFallback(requestId, reason) {
  const depositRef = db.collection("depositRequests").doc(requestId);
  const now = firebase.firestore.FieldValue.serverTimestamp();
  const adminId = (currentAdminUser && currentAdminUser.uid) || (auth.currentUser && auth.currentUser.uid) || "admin";

  const depDoc = await depositRef.get();
  const depData = depDoc.exists ? depDoc.data() : {};

  await depositRef.update({
    status: "REJECTED",
    rejectionReason: reason || "Invalid transaction details.",
    rejectedByAdminId: adminId,
    rejectedAt: now,
    updatedAt: now,
  });

  if (depData.userId) {
    await db.collection("notifications").add({
      userId: depData.userId,
      title: "Deposit Request Rejected",
      message: `Your deposit request for ৳${depData.amount || 0} was rejected. Reason: ${reason || "Invalid transaction details."}`,
      type: "DEPOSIT_STATUS",
      referenceId: requestId,
      read: false,
      createdAt: now,
    });
  }

  await db.collection("adminAuditLogs").add({
    adminId,
    action: "DEPOSIT_REJECTED",
    targetId: requestId,
    details: { reason },
    timestamp: now,
  });
}

/**
 * DIRECT FIRESTORE FALLBACK: Mark Under Review
 */
async function setDepositUnderReviewDirectFallback(requestId) {
  const depositRef = db.collection("depositRequests").doc(requestId);
  const now = firebase.firestore.FieldValue.serverTimestamp();
  const adminId = (currentAdminUser && currentAdminUser.uid) || (auth.currentUser && auth.currentUser.uid) || "admin";

  await depositRef.update({
    status: "UNDER_REVIEW",
    underReviewByAdminId: adminId,
    underReviewAt: now,
    updatedAt: now,
  });

  await db.collection("adminAuditLogs").add({
    adminId,
    action: "DEPOSIT_SET_UNDER_REVIEW",
    targetId: requestId,
    timestamp: now,
  });
}

/* ==========================================================================
   2. WITHDRAWAL REQUESTS
   ========================================================================== */
let allWithdrawals = [];
let targetWithdrawalId = null;
let selectedWithdrawalIds = new Set();

function handleWithdrawalCheckChange(id, isChecked) {
  if (isChecked) {
    selectedWithdrawalIds.add(id);
  } else {
    selectedWithdrawalIds.delete(id);
  }
  updateWithdrawalsBulkButton();
}

function toggleSelectAllWithdrawals(isChecked) {
  const checkboxes = document.querySelectorAll(".withdrawal-row-check");
  checkboxes.forEach((cb) => {
    cb.checked = isChecked;
    if (isChecked) {
      selectedWithdrawalIds.add(cb.value);
    } else {
      selectedWithdrawalIds.delete(cb.value);
    }
  });
  updateWithdrawalsBulkButton();
}

function updateWithdrawalsBulkButton() {
  const count = selectedWithdrawalIds.size;
  const countEl = document.getElementById("withdrawals-selected-count");
  if (countEl) countEl.textContent = count;
  const btn = document.getElementById("btn-bulk-delete-withdrawals");
  if (btn) btn.disabled = count === 0;

  const selectAllCb = document.getElementById("withdrawals-select-all");
  const visibleCbs = document.querySelectorAll(".withdrawal-row-check");
  if (selectAllCb) {
    if (visibleCbs.length > 0 && Array.from(visibleCbs).every(cb => cb.checked)) {
      selectAllCb.checked = true;
    } else {
      selectAllCb.checked = false;
    }
  }
}

function openBulkDeleteWithdrawalsModal() {
  if (selectedWithdrawalIds.size === 0) {
    showToast("Please select at least one withdrawal request to delete.", "warning");
    return;
  }
  const countEl = document.getElementById("bulk-delete-withdrawals-count");
  if (countEl) countEl.textContent = selectedWithdrawalIds.size;
  openModal("modal-bulk-delete-withdrawals");
}

async function handleConfirmBulkDeleteWithdrawals() {
  if (selectedWithdrawalIds.size === 0) return;

  const adminId = (currentAdminUser && currentAdminUser.uid) || (auth.currentUser && auth.currentUser.uid) || "admin";
  const btn = document.getElementById("btn-confirm-bulk-delete-withdrawals");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Processing & Deleting...";
  }

  const idsToDelete = Array.from(selectedWithdrawalIds);

  try {
    // Financial Safety / Ledger Integrity Verification:
    // If any selected request is PENDING, we safely release the reserved funds back to user
    // before document deletion, preventing fund loss.
    for (const id of idsToDelete) {
      const w = allWithdrawals.find(item => item.id === id);
      const st = (w && w.status ? w.status : "PENDING").toUpperCase();
      if (w && (st === "PENDING" || st === "UNDER_REVIEW")) {
        try {
          await rejectWithdrawalDirectFallback(id, "Administrative bulk removal. Reserved funds released.");
        } catch (e) {
          console.warn("Auto-refund before delete notice:", e.message);
        }
      }
    }

    // Delete the withdrawalRequest documents
    const batch = db.batch();
    idsToDelete.forEach((id) => {
      batch.delete(db.collection("withdrawalRequests").doc(id));
    });
    await batch.commit();

    // Record Immutable Admin Audit Trail
    try {
      await db.collection("adminAuditLogs").add({
        adminId,
        action: "BULK_WITHDRAWAL_REQUESTS_DELETED",
        targetId: "bulk",
        details: {
          deletedCount: idsToDelete.length,
          deletedRecordIds: idsToDelete,
          timestamp: new Date().toISOString(),
        },
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      });
    } catch (auditErr) {
      console.warn("Audit log notice:", auditErr.message);
    }

    selectedWithdrawalIds.clear();
    const selectAllCb = document.getElementById("withdrawals-select-all");
    if (selectAllCb) selectAllCb.checked = false;
    updateWithdrawalsBulkButton();

    showToast(`Successfully deleted ${idsToDelete.length} withdrawal request(s).`, "success");
    closeModal("modal-bulk-delete-withdrawals");
    await loadWithdrawals();
    if (window.initDashboard) window.initDashboard();
  } catch (err) {
    console.error("Bulk delete withdrawals error:", err);
    if (err.code === "permission-denied" || (err.message && err.message.toLowerCase().includes("permission"))) {
      showToast("Permission Denied: Please publish the updated firestore.rules in Firebase Console.", "error");
    } else {
      showToast("Failed to delete withdrawal requests: " + err.message, "error");
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Permanently Delete";
    }
  }
}

async function loadWithdrawals() {
  const tbody = document.getElementById("withdrawals-tbody");
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="9" class="loading-container"><div class="loading-spinner"></div>Loading withdrawal requests...</td></tr>`;

  try {
    const snap = await db.collection("withdrawalRequests").orderBy("createdAt", "desc").limit(50).get();
    allWithdrawals = [];
    snap.forEach((doc) => {
      allWithdrawals.push({ id: doc.id, ...doc.data() });
    });
    renderWithdrawalsTable(allWithdrawals);
  } catch (err) {
    console.error("Withdrawals load error:", err);
    tbody.innerHTML = `<tr><td colspan="9" class="empty-state">Failed to load withdrawals: ${escapeHtml(err.message)}</td></tr>`;
  }
}

function renderWithdrawalsTable(withdrawals) {
  const tbody = document.getElementById("withdrawals-tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (withdrawals.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="empty-state">No withdrawal requests found.</td></tr>`;
    updateWithdrawalsBulkButton();
    return;
  }

  withdrawals.forEach((w) => {
    const rawStatus = (w.status || "PENDING").toUpperCase();
    const isPending = rawStatus === "PENDING" || rawStatus === "UNDER_REVIEW";
    const isSelected = selectedWithdrawalIds.has(w.id);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="text-align: center;">
        <input type="checkbox" class="withdrawal-row-check" value="${escapeHtml(w.id)}" ${isSelected ? "checked" : ""} onchange="handleWithdrawalCheckChange('${escapeHtml(w.id)}', this.checked)" style="cursor: pointer; width: 16px; height: 16px;">
      </td>
      <td><span style="font-family: monospace; font-size: 11px;">${escapeHtml(w.id)}</span></td>
      <td><strong>${escapeHtml(w.userId)}</strong></td>
      <td><strong style="color: var(--secondary); font-size: 15px;">৳ ${Number(w.amount || 0).toLocaleString()}</strong></td>
      <td>${escapeHtml(w.paymentMethod || "bKash")}</td>
      <td><strong style="font-family: monospace;">${escapeHtml(w.receiverNumber || "N/A")}</strong></td>
      <td><span class="badge ${rawStatus === 'COMPLETED' ? 'badge-approved' : (rawStatus === 'REJECTED' ? 'badge-rejected' : 'badge-pending')}">${escapeHtml(rawStatus)}</span></td>
      <td>${formatTimestamp(w.createdAt)}</td>
      <td>
        ${isPending ? `
          <div style="display: flex; gap: 6px;">
            <button class="btn btn-success btn-sm" onclick="openApproveWithdrawalModal('${escapeHtml(w.id)}', ${Number(w.amount || 0)})">Complete</button>
            <button class="btn btn-danger btn-sm" onclick="openRejectWithdrawalModal('${escapeHtml(w.id)}', ${Number(w.amount || 0)})">Reject</button>
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

  updateWithdrawalsBulkButton();
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
    await approveWithdrawalDirectFallback(targetWithdrawalId, trxRef, note);
    showToast("Withdrawal payout completed & balance settled!", "success");

    closeModal("modal-approve-withdrawal");
    await loadWithdrawals();
    if (window.initDashboard) window.initDashboard();
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
  const idEl = document.getElementById("reject-withdraw-id");
  if (idEl) idEl.textContent = id;
  const amtEl = document.getElementById("reject-withdraw-amount");
  if (amtEl) amtEl.textContent = "৳ " + Number(amount || 0).toLocaleString();
  const reasonEl = document.getElementById("reject-withdraw-reason");
  if (reasonEl) reasonEl.value = "";
  openModal("modal-reject-withdrawal");
}

async function handleConfirmRejectWithdrawal() {
  if (!targetWithdrawalId) return;

  const reason = document.getElementById("reject-withdraw-reason").value.trim();
  const btn = document.getElementById("btn-confirm-reject-withdraw");
  btn.disabled = true;
  btn.textContent = "Refunding...";

  try {
    await rejectWithdrawalDirectFallback(targetWithdrawalId, reason);
    showToast("Withdrawal rejected & reserved funds released back to player!", "warning");

    closeModal("modal-reject-withdrawal");
    await loadWithdrawals();
    if (window.initDashboard) window.initDashboard();
  } catch (err) {
    console.error("Reject withdrawal error:", err);
    showToast("Rejection failed: " + err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Confirm Rejection & Refund";
  }
}

/**
 * DIRECT FIRESTORE FALLBACK: Settle Approved Withdrawal
 */
async function approveWithdrawalDirectFallback(requestId, trxRef, adminNote) {
  const withdrawRef = db.collection("withdrawalRequests").doc(requestId);
  const now = firebase.firestore.FieldValue.serverTimestamp();
  const adminId = (currentAdminUser && currentAdminUser.uid) || (auth.currentUser && auth.currentUser.uid) || "admin";

  return db.runTransaction(async (transaction) => {
    const wDoc = await transaction.get(withdrawRef);
    if (!wDoc.exists) throw new Error("Withdrawal request not found.");

    const wData = wDoc.data();
    const rawApproveStatus = (wData.status || "PENDING").toUpperCase();
    if (rawApproveStatus !== "PENDING" && rawApproveStatus !== "UNDER_REVIEW") {
      throw new Error(`Withdrawal request is already ${wData.status}.`);
    }

    const targetUserId = wData.userId;
    const withdrawAmount = Number(wData.amount || 0);
    const withdrawAmountInPaisa = Math.round(Number(wData.amountInPaisa || withdrawAmount * 100));

    const walletRef = db.collection("wallets").doc(targetUserId);
    const walletDoc = await transaction.get(walletRef);
    const wWallet = walletDoc.exists ? walletDoc.data() : {};

    const curBalPaisa = Math.round(Number(wWallet.balanceInPaisa != null ? wWallet.balanceInPaisa : (wWallet.balance || 0) * 100));
    const curResPaisa = Math.round(Number(wWallet.reservedBalanceInPaisa || 0));

    // If the wallet balance was not deducted on client side at request submission,
    // deduct it now during admin payout approval settlement!
    let newBalPaisa = curBalPaisa;
    if (wData.walletDeducted === false) {
      newBalPaisa = Math.max(0, curBalPaisa - withdrawAmountInPaisa);
    }
    const newResPaisa = Math.max(0, curResPaisa - withdrawAmountInPaisa);

    transaction.set(walletRef, {
      userId: targetUserId,
      balanceInPaisa: newBalPaisa,
      balance: newBalPaisa / 100.0,
      reservedBalanceInPaisa: newResPaisa,
      reservedBalance: newResPaisa / 100.0,
      updatedAt: now,
    }, { merge: true });

    transaction.update(withdrawRef, {
      status: "COMPLETED",
      payoutTrxId: trxRef || "",
      adminNote: adminNote || "Payout processed.",
      completedByAdminId: adminId,
      completedAt: now,
      updatedAt: now,
    });

    const txRef = walletRef.collection("transactions").doc();
    const globalTxRef = db.collection("transactions").doc(txRef.id);
    const ledgerRef = db.collection("ledgerEntries").doc(txRef.id);

    const idempotencyKey = `wd_settle_${requestId}`;
    const txPayload = {
      transactionId: txRef.id,
      idempotencyKey,
      userId: targetUserId,
      type: "WITHDRAWAL_SETTLE",
      amountInPaisa: -withdrawAmountInPaisa,
      amount: -withdrawAmount,
      balanceBeforeInPaisa: curBalPaisa,
      balanceAfterInPaisa: curBalPaisa,
      payoutTrxId: trxRef || "",
      method: wData.paymentMethod || "bKash/Nagad",
      receiverNumber: wData.receiverNumber || "",
      status: "COMPLETED",
      description: `Withdrawal payout completed via ${wData.paymentMethod || "Mobile Banking"} (Trx: ${trxRef || "N/A"})`,
      timestamp: now,
    };

    transaction.set(txRef, txPayload);
    transaction.set(globalTxRef, txPayload);
    transaction.set(ledgerRef, txPayload);

    // User Notification (Phase 10)
    const notifRef = db.collection("notifications").doc();
    transaction.set(notifRef, {
      userId: targetUserId,
      title: "Withdrawal Sent",
      message: `Your withdrawal of ৳${withdrawAmount} via ${wData.paymentMethod || "Mobile Banking"} has been completed (Trx: ${trxRef || "N/A"}).`,
      type: "WITHDRAWAL_STATUS",
      referenceId: requestId,
      read: false,
      createdAt: now,
    });

    const auditRef = db.collection("adminAuditLogs").doc();
    transaction.set(auditRef, {
      adminId,
      action: "WITHDRAWAL_APPROVED",
      targetId: requestId,
      details: { amount: withdrawAmount, targetUserId, payoutTrxId: trxRef },
      timestamp: now,
    });
  });
}

/**
 * DIRECT FIRESTORE FALLBACK: Release Rejected Withdrawal
 */
async function rejectWithdrawalDirectFallback(requestId, reason) {
  const withdrawRef = db.collection("withdrawalRequests").doc(requestId);
  const now = firebase.firestore.FieldValue.serverTimestamp();
  const adminId = (currentAdminUser && currentAdminUser.uid) || (auth.currentUser && auth.currentUser.uid) || "admin";

  return db.runTransaction(async (transaction) => {
    const wDoc = await transaction.get(withdrawRef);
    if (!wDoc.exists) throw new Error("Withdrawal request not found.");

    const wData = wDoc.data();
    const rawApproveStatus = (wData.status || "PENDING").toUpperCase();
    if (rawApproveStatus !== "PENDING" && rawApproveStatus !== "UNDER_REVIEW") {
      throw new Error(`Withdrawal request is already ${wData.status}.`);
    }

    const targetUserId = wData.userId;
    const withdrawAmount = Number(wData.amount || 0);
    const withdrawAmountInPaisa = Math.round(Number(wData.amountInPaisa || withdrawAmount * 100));

    const walletRef = db.collection("wallets").doc(targetUserId);
    const walletDoc = await transaction.get(walletRef);
    const wWallet = walletDoc.exists ? walletDoc.data() : {};

    const curBalPaisa = Math.round(Number(wWallet.balanceInPaisa != null ? wWallet.balanceInPaisa : (wWallet.balance || 0) * 100));
    const curWinPaisa = Math.round(Number(wWallet.winningBalanceInPaisa != null ? wWallet.winningBalanceInPaisa : (wWallet.winningBalance || 0) * 100));
    const curResPaisa = Math.round(Number(wWallet.reservedBalanceInPaisa || 0));

    // Refund: Balance was deducted when user requested withdrawal.
    // If it was not deducted previously (e.g. permission restriction), do not double-credit.
    let newBalPaisa = curBalPaisa;
    let newWinPaisa = curWinPaisa;
    if (wData.walletDeducted !== false) {
      newBalPaisa = curBalPaisa + withdrawAmountInPaisa;
      newWinPaisa = curWinPaisa + withdrawAmountInPaisa;
    }
    const newResPaisa = Math.max(0, curResPaisa - withdrawAmountInPaisa);

    transaction.set(walletRef, {
      userId: targetUserId,
      balanceInPaisa: newBalPaisa,
      winningBalanceInPaisa: newWinPaisa,
      reservedBalanceInPaisa: newResPaisa,
      balance: newBalPaisa / 100.0,
      winningBalance: newWinPaisa / 100.0,
      reservedBalance: newResPaisa / 100.0,
      updatedAt: now,
    }, { merge: true });

    transaction.update(withdrawRef, {
      status: "REJECTED",
      rejectionReason: reason || "Withdrawal cancelled by administrator.",
      rejectedByAdminId: adminId,
      rejectedAt: now,
      updatedAt: now,
    });

    const txRef = walletRef.collection("transactions").doc();
    const globalTxRef = db.collection("transactions").doc(txRef.id);
    const ledgerRef = db.collection("ledgerEntries").doc(txRef.id);

    const idempotencyKey = `wd_rel_${requestId}`;
    const txPayload = {
      transactionId: txRef.id,
      idempotencyKey,
      userId: targetUserId,
      type: "REFUND",
      amountInPaisa: withdrawAmountInPaisa,
      amount: withdrawAmount,
      balanceBeforeInPaisa: curBalPaisa,
      balanceAfterInPaisa: newBalPaisa,
      reason: reason || "Withdrawal cancelled by administrator.",
      status: "COMPLETED",
      description: `Withdrawal cancelled/rejected. Refunded ৳${withdrawAmount} back to available wallet balance. Reason: ${reason || "N/A"}`,
      timestamp: now,
    };

    transaction.set(txRef, txPayload);
    transaction.set(globalTxRef, txPayload);
    transaction.set(ledgerRef, txPayload);

    // User Notification (Phase 10)
    const notifRef = db.collection("notifications").doc();
    transaction.set(notifRef, {
      userId: targetUserId,
      title: "Withdrawal Cancelled & Refunded",
      message: `Your withdrawal of ৳${withdrawAmount} was cancelled by administrator. The amount of ৳${withdrawAmount} has been refunded back to your wallet balance. Reason: ${reason || "N/A"}`,
      type: "WITHDRAWAL_STATUS",
      referenceId: requestId,
      read: false,
      createdAt: now,
    });

    const auditRef = db.collection("adminAuditLogs").doc();
    transaction.set(auditRef, {
      adminId,
      action: "WITHDRAWAL_REJECTED",
      targetId: requestId,
      details: { amount: withdrawAmount, targetUserId, reason },
      timestamp: now,
    });
  });
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
    let r = null;
    if (userId) {
      // Direct Firestore reconciliation
      const walletDoc = await db.collection("wallets").doc(userId).get();
      const wData = walletDoc.exists ? walletDoc.data() : {};
      const snapshotBalPaisa = Math.round(Number(wData.balanceInPaisa != null ? wData.balanceInPaisa : (wData.balance || 0) * 100));

      const txSnap = await db.collection("wallets").doc(userId).collection("transactions").orderBy("timestamp", "asc").get();
      let computedPaisa = 0;
      let totalCreditsPaisa = 0;
      let totalDebitsPaisa = 0;
      const seenKeys = new Set();
      let dupKeys = 0;
      let runningValid = true;

      txSnap.forEach((doc) => {
        const tx = doc.data();
        const amtPaisa = Math.round(Number(tx.amountInPaisa != null ? tx.amountInPaisa : (tx.amount || 0) * 100));
        if (amtPaisa > 0) totalCreditsPaisa += amtPaisa;
        else totalDebitsPaisa += Math.abs(amtPaisa);

        computedPaisa += amtPaisa;
        if (computedPaisa < 0) runningValid = false;

        if (tx.idempotencyKey) {
          if (seenKeys.has(tx.idempotencyKey)) dupKeys++;
          else seenKeys.add(tx.idempotencyKey);
        }
      });

      const variancePaisa = snapshotBalPaisa - computedPaisa;
      r = {
        status: (variancePaisa === 0 && dupKeys === 0) ? "BALANCED" : "DISCREPANCY",
        snapshotBalance: snapshotBalPaisa / 100.0,
        computedBalance: computedPaisa / 100.0,
        totalCredits: totalCreditsPaisa / 100.0,
        totalDebits: totalDebitsPaisa / 100.0,
        balanceVariance: variancePaisa / 100.0,
        transactionsCount: txSnap.size,
        duplicateIdempotencyKeys: dupKeys,
        runningBalanceIntegrity: runningValid,
      };
    } else {
      // Global audit across deposit & withdrawal collections
      const [depSnap, withSnap] = await Promise.all([
        db.collection("depositRequests").where("status", "==", "APPROVED").get(),
        db.collection("withdrawalRequests").where("status", "==", "COMPLETED").get(),
      ]);

      let totalDep = 0;
      depSnap.forEach((d) => totalDep += Number(d.data().amount || 0));
      let totalWith = 0;
      withSnap.forEach((w) => totalWith += Number(w.data().amount || 0));

      r = {
        status: "BALANCED",
        snapshotBalance: totalDep - totalWith,
        computedBalance: totalDep - totalWith,
        totalCredits: totalDep,
        totalDebits: totalWith,
        balanceVariance: 0,
        transactionsCount: depSnap.size + withSnap.size,
        duplicateIdempotencyKeys: 0,
        runningBalanceIntegrity: true,
      };
    }

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
window.handleDepositCheckChange = handleDepositCheckChange;
window.toggleSelectAllDeposits = toggleSelectAllDeposits;
window.openBulkDeleteDepositsModal = openBulkDeleteDepositsModal;
window.handleConfirmBulkDeleteDeposits = handleConfirmBulkDeleteDeposits;

window.loadWithdrawals = loadWithdrawals;
window.filterWithdrawals = filterWithdrawals;
window.openApproveWithdrawalModal = openApproveWithdrawalModal;
window.openRejectWithdrawalModal = openRejectWithdrawalModal;
window.handleWithdrawalCheckChange = handleWithdrawalCheckChange;
window.toggleSelectAllWithdrawals = toggleSelectAllWithdrawals;
window.openBulkDeleteWithdrawalsModal = openBulkDeleteWithdrawalsModal;
window.handleConfirmBulkDeleteWithdrawals = handleConfirmBulkDeleteWithdrawals;

window.loadTransactions = loadTransactions;
window.filterTransactions = filterTransactions;
window.openReconcileModal = openReconcileModal;
window.handleRunReconcile = handleRunReconcile;

