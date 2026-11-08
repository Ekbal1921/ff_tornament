/**
 * User Account & Permissions Management Module.
 * Supports Balance Viewing & Editing, Account Deletion, and Full Financial & Match Statistics.
 */
let allUsersList = [];
let allWalletsMap = {};
let allDepositsMap = {};
let allWithdrawalsMap = {};
let allUserMatchesMap = {};
let targetUserActionId = null;
let selectedUserIds = new Set();
let pendingDeletionUsers = {};

function handleUserCheckChange(id, isChecked) {
  if (isChecked) {
    selectedUserIds.add(id);
  } else {
    selectedUserIds.delete(id);
  }
  updateUsersSelectionButton();
}

function toggleSelectAllUsers(isChecked) {
  const checkboxes = document.querySelectorAll(".user-row-check");
  checkboxes.forEach((cb) => {
    cb.checked = isChecked;
    if (isChecked) {
      selectedUserIds.add(cb.value);
    } else {
      selectedUserIds.delete(cb.value);
    }
  });
  updateUsersSelectionButton();
}

function updateUsersSelectionButton() {
  const count = selectedUserIds.size;
  const countEl = document.getElementById("users-selected-count");
  if (countEl) countEl.textContent = count;
  const btn = document.getElementById("btn-notify-selected-users");
  if (btn) btn.disabled = count === 0;

  const selectAllCb = document.getElementById("users-select-all");
  const visibleCbs = document.querySelectorAll(".user-row-check");
  if (selectAllCb) {
    if (visibleCbs.length > 0 && Array.from(visibleCbs).every(cb => cb.checked)) {
      selectAllCb.checked = true;
    } else {
      selectAllCb.checked = false;
    }
  }
}

function openNotifySelectedUsersModal() {
  if (selectedUserIds.size === 0) {
    showToast("Please mark at least one user to notify.", "warning");
    return;
  }
  if (window.openSendNotificationModal) {
    window.openSendNotificationModal(Array.from(selectedUserIds).join(","), `${selectedUserIds.size} Selected Users`, "SELECTED");
  }
}

function openBroadcastNotificationModal() {
  if (window.openSendNotificationModal) {
    window.openSendNotificationModal("ALL_USERS", "All Registered Players", "ALL");
  }
}

async function openPushSettingsModal() {
  try {
    const doc = await db.collection("systemConfig").doc("notificationSettings").get();
    let currentVal = "";
    if (doc.exists) {
      const data = doc.data();
      if (data.serviceAccountJson) {
        currentVal = data.serviceAccountJson;
      } else if (data.fcmServerKey) {
        currentVal = data.fcmServerKey;
      }
    }
    document.getElementById("cfg-fcm-server-key").value = currentVal;
    openModal("modal-push-settings");
  } catch (err) {
    console.error("Load push settings error:", err);
    document.getElementById("cfg-fcm-server-key").value = "";
    openModal("modal-push-settings");
  }
}

function handlePushConfigFileSelected(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const content = e.target.result;
      const parsed = JSON.parse(content);
      if (!parsed.client_email || !parsed.private_key) {
        showToast("JSON file does not appear to be a valid Firebase Service Account key.", "error");
        return;
      }
      document.getElementById("cfg-fcm-server-key").value = JSON.stringify(parsed, null, 2);
      showToast("Service Account JSON loaded! Click 'Save Push Settings' to activate.", "success");
    } catch (err) {
      showToast("Invalid JSON file: " + err.message, "error");
    }
  };
  reader.readAsText(file);
}

async function handleSavePushSettings(e) {
  e.preventDefault();
  const inputVal = document.getElementById("cfg-fcm-server-key").value.trim();
  const btn = document.getElementById("btn-save-push-settings");
  btn.disabled = true;
  btn.textContent = "Saving...";

  try {
    const adminId = (currentAdminUser && currentAdminUser.uid) || (auth.currentUser && auth.currentUser.uid) || "admin";
    const updateData = {
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedBy: adminId,
    };

    // Check if input is Service Account JSON
    let parsedJson = null;
    if (inputVal.startsWith("{")) {
      try {
        parsedJson = JSON.parse(inputVal);
      } catch (jsonErr) {
        throw new Error("Invalid JSON format. Please ensure the full JSON is copied.");
      }
    }

    if (parsedJson && parsedJson.client_email && parsedJson.private_key) {
      updateData.serviceAccountJson = JSON.stringify(parsedJson);
      updateData.projectId = parsedJson.project_id || "ff-tornamwent";
      updateData.clientEmail = parsedJson.client_email;
      updateData.privateKey = parsedJson.private_key;
      updateData.fcmServerKey = ""; // Modern v1 active
      showToast("⭐ Modern FCM HTTP v1 Service Account saved successfully!", "success");
    } else {
      updateData.fcmServerKey = inputVal;
      showToast("FCM Server Key saved successfully!", "success");
    }

    await db.collection("systemConfig").doc("notificationSettings").set(updateData, { merge: true });
    closeModal("modal-push-settings");
  } catch (err) {
    console.error("Save push settings error:", err);
    showToast("Failed to save push settings: " + err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Save Push Settings";
  }
}

async function loadUsers() {
  const tbody = document.getElementById("users-tbody");
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="8" class="loading-container"><div class="loading-spinner"></div>Loading player accounts & financial data...</td></tr>`;

  try {
    // 1. Fetch Users
    let snap = await db.collection("users").limit(100).get();
    if (snap.empty) {
      snap = await db.collection("user").limit(100).get();
    }
    allUsersList = [];
    snap.forEach((doc) => {
      allUsersList.push({ id: doc.id, ...doc.data() });
    });

    // 2. Fetch Wallets (map by userId)
    allWalletsMap = {};
    try {
      const walletsSnap = await db.collection("wallets").get();
      walletsSnap.forEach((doc) => {
        allWalletsMap[doc.id] = doc.data();
      });
    } catch (wErr) {
      console.warn("Wallets bulk load error:", wErr);
    }

    // 3. Fetch Deposits (map by userId)
    allDepositsMap = {};
    try {
      const depSnap = await db.collection("depositRequests").orderBy("createdAt", "desc").get();
      depSnap.forEach((doc) => {
        const d = { id: doc.id, ...doc.data() };
        const uid = d.userId;
        if (!uid) return;
        if (!allDepositsMap[uid]) {
          allDepositsMap[uid] = { count: 0, totalAmount: 0, approvedCount: 0, approvedAmount: 0, list: [] };
        }
        allDepositsMap[uid].count++;
        const amt = Number(d.amount || 0);
        allDepositsMap[uid].totalAmount += amt;
        const st = (d.status || "").toUpperCase();
        if (st === "APPROVED" || st === "COMPLETED") {
          allDepositsMap[uid].approvedCount++;
          allDepositsMap[uid].approvedAmount += amt;
        }
        allDepositsMap[uid].list.push(d);
      });
    } catch (dErr) {
      console.warn("Deposits bulk load error:", dErr);
    }

    // 4. Fetch Withdrawals (map by userId)
    allWithdrawalsMap = {};
    try {
      const withSnap = await db.collection("withdrawalRequests").orderBy("createdAt", "desc").get();
      withSnap.forEach((doc) => {
        const w = { id: doc.id, ...doc.data() };
        const uid = w.userId;
        if (!uid) return;
        if (!allWithdrawalsMap[uid]) {
          allWithdrawalsMap[uid] = { count: 0, totalAmount: 0, completedCount: 0, completedAmount: 0, list: [] };
        }
        allWithdrawalsMap[uid].count++;
        const amt = Number(w.amount || 0);
        allWithdrawalsMap[uid].totalAmount += amt;
        const st = (w.status || "").toUpperCase();
        if (st === "APPROVED" || st === "COMPLETED" || st === "PAID") {
          allWithdrawalsMap[uid].completedCount++;
          allWithdrawalsMap[uid].completedAmount += amt;
        }
        allWithdrawalsMap[uid].list.push(w);
      });
    } catch (wErr) {
      console.warn("Withdrawals bulk load error:", wErr);
    }

    // 5. Fetch Match Participations (from tournaments / participants)
    allUserMatchesMap = {};
    try {
      const partSnap = await db.collectionGroup("participants").get();
      partSnap.forEach((doc) => {
        const p = doc.data();
        const uid = p.userId || doc.id;
        if (!uid) return;
        if (!allUserMatchesMap[uid]) {
          allUserMatchesMap[uid] = { count: 0, list: [] };
        }
        allUserMatchesMap[uid].count++;
        allUserMatchesMap[uid].list.push({
          id: doc.id,
          tournamentId: doc.ref.parent.parent ? doc.ref.parent.parent.id : "",
          ...p
        });
      });
    } catch (pErr) {
      console.warn("Participants bulk load fallback:", pErr);
    }

    // 6. Fetch Pending Account Deletion Requests
    pendingDeletionUsers = {};
    try {
      const delSnap = await db.collection("accountDeletionRequests").where("status", "==", "PENDING").get();
      const badge = document.getElementById("deletion-requests-badge");
      if (badge) {
        if (!delSnap.empty) {
          badge.textContent = delSnap.size;
          badge.style.display = "inline-block";
        } else {
          badge.style.display = "none";
        }
      }
      delSnap.forEach((doc) => {
        const d = doc.data();
        if (d.userId) pendingDeletionUsers[d.userId] = doc.id;
      });
    } catch (delErr) {
      console.warn("Deletion requests badge load error:", delErr);
    }

    renderUsersTable(allUsersList);
  } catch (err) {
    console.error("Users load error:", err);
    tbody.innerHTML = `<tr><td colspan="8" class="empty-state">Failed to load users: ${escapeHtml(err.message)}</td></tr>`;
  }
}

function renderUsersTable(users) {
  const tbody = document.getElementById("users-tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (users.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="empty-state">No users registered yet.</td></tr>`;
    updateUsersSelectionButton();
    return;
  }

  users.forEach((u) => {
    const isBanned = u.isBanned === true;
    const role = (u.role || "player").toUpperCase();

    let roleBadge = "badge-upcoming";
    if (role === "ADMIN") roleBadge = "badge-live";
    if (role === "MODERATOR") roleBadge = "badge-open";

    // Wallet balance calculation
    const w = allWalletsMap[u.id] || {};
    const balInPaisa = w.balanceInPaisa != null ? w.balanceInPaisa : Math.round((w.balance || 0) * 100);
    const depInPaisa = w.depositBalanceInPaisa != null ? w.depositBalanceInPaisa : Math.round((w.depositBalance || 0) * 100);
    const winInPaisa = w.winningBalanceInPaisa != null ? w.winningBalanceInPaisa : Math.round((w.winningBalance || 0) * 100);

    const totalBal = balInPaisa / 100;
    const depBal = depInPaisa / 100;
    const winBal = winInPaisa / 100;

    // Activity stats calculation
    const depStats = allDepositsMap[u.id] || { count: 0, totalAmount: 0, approvedCount: 0, approvedAmount: 0 };
    const withStats = allWithdrawalsMap[u.id] || { count: 0, totalAmount: 0, completedCount: 0, completedAmount: 0 };
    const userMatchData = allUserMatchesMap[u.id] || { count: 0 };
    const matchesCount = userMatchData.count || u.totalMatchesPlayed || 0;

    const isSelected = selectedUserIds.has(u.id);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="text-align: center;">
        <input type="checkbox" class="user-row-check" value="${escapeHtml(u.id)}" ${isSelected ? "checked" : ""} onchange="handleUserCheckChange('${escapeHtml(u.id)}', this.checked)" style="cursor: pointer; width: 16px; height: 16px;">
      </td>
      <td>
        <strong>${escapeHtml(u.displayName || "Gamer")}</strong>
        ${(u.deletionRequested || (pendingDeletionUsers && pendingDeletionUsers[u.id])) ? '<span class="badge" style="background:#fee2e2;color:#dc2626;border:1px solid #fca5a5;font-size:10px;margin-left:4px;">⚠️ DELETION REQUESTED</span>' : ''}
        <div style="font-size: 11px; color: var(--text-muted); font-family: monospace;">${escapeHtml(u.id)}</div>
        <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">${escapeHtml(u.email || "No Email")}</div>
      </td>
      <td>
        <strong style="color: var(--secondary); font-family: monospace;">${escapeHtml(u.freeFireUid || "Not Linked")}</strong>
        <div style="font-size: 11.5px; color: var(--text-muted); margin-top: 2px;">IGN: ${escapeHtml(u.freeFireName || "N/A")}</div>
      </td>
      <td>
        <strong style="color: var(--accent-green); font-size: 14.5px;">৳ ${totalBal.toLocaleString()}</strong>
        <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">
          Dep: <span style="color: var(--text-primary);">৳ ${depBal}</span> | Win: <span style="color: var(--secondary);">৳ ${winBal}</span>
        </div>
      </td>
      <td>
        <div style="font-size: 11.5px; line-height: 1.5;">
          <div>📥 <strong>${depStats.count}</strong> Dep <span style="color: var(--text-muted);">(৳ ${depStats.totalAmount.toLocaleString()})</span></div>
          <div>📤 <strong>${withStats.count}</strong> With <span style="color: var(--text-muted);">(৳ ${withStats.totalAmount.toLocaleString()})</span></div>
          <div>🎮 <strong>${matchesCount}</strong> Match${matchesCount === 1 ? '' : 'es'}</div>
        </div>
      </td>
      <td><span class="badge ${roleBadge}">${escapeHtml(role)}</span></td>
      <td><span class="badge ${isBanned ? 'badge-cancelled' : 'badge-open'}">${isBanned ? 'BANNED' : 'ACTIVE'}</span></td>
      <td>${formatTimestamp(u.createdAt)}</td>
      <td>
        <div style="display: flex; gap: 5px; flex-wrap: wrap;">
          <button class="btn btn-warning btn-sm" onclick="openSendNotificationModal('${u.id}', '${escapeHtml(u.displayName || 'Player')}', 'SINGLE')" title="Send Push Notification to this Player">📢 Notify</button>
          <button class="btn btn-primary btn-sm" onclick="openEditUserBalanceModal('${u.id}')" title="Edit Wallet Balance">💰 Balance</button>
          <button class="btn btn-secondary btn-sm" onclick="openUserDetailsModal('${u.id}')" title="View Full Activity & Stats">📊 Stats</button>
          <button class="btn btn-secondary btn-sm" onclick="openEditUserRoleModal('${u.id}', '${u.role || 'player'}')">Role</button>
          ${isBanned ? `
            <button class="btn btn-success btn-sm" onclick="handleToggleUserBan('${u.id}', false)">Unban</button>
          ` : `
            <button class="btn btn-danger btn-sm" onclick="openBanUserModal('${u.id}')">Ban</button>
          `}
          <button class="btn btn-danger btn-sm" style="background: #dc2626; border-color: #dc2626;" onclick="openDeleteUserModal('${u.id}', '${escapeHtml(u.displayName || 'User')}')" title="Delete User Account">🗑️ Delete</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
  updateUsersSelectionButton();
}

function filterUsers() {
  const search = document.getElementById("user-search-input")?.value.toLowerCase().trim() || "";
  const roleFilter = document.getElementById("user-role-filter")?.value || "ALL";

  const filtered = allUsersList.filter((u) => {
    const matchSearch = (u.displayName && u.displayName.toLowerCase().includes(search)) ||
                        (u.email && u.email.toLowerCase().includes(search)) ||
                        (u.freeFireUid && u.freeFireUid.includes(search)) ||
                        (u.freeFireName && u.freeFireName.toLowerCase().includes(search)) ||
                        (u.id && u.id.toLowerCase().includes(search));
    const matchRole = roleFilter === "ALL" || (u.role && u.role.toLowerCase() === roleFilter.toLowerCase());
    return matchSearch && matchRole;
  });

  renderUsersTable(filtered);
}

// ==========================================
// 1. BALANCE MANAGEMENT (VIEW & EDIT)
// ==========================================
function openEditUserBalanceModal(userId) {
  targetUserActionId = userId;
  const user = allUsersList.find(u => u.id === userId);
  const w = allWalletsMap[userId] || {};

  const curBalPaisa = Math.round(Number(w.balanceInPaisa != null ? w.balanceInPaisa : (w.balance || 0) * 100));
  const curDepPaisa = Math.round(Number(w.depositBalanceInPaisa != null ? w.depositBalanceInPaisa : (w.depositBalance || 0) * 100));
  const curWinPaisa = Math.round(Number(w.winningBalanceInPaisa != null ? w.winningBalanceInPaisa : (w.winningBalance || 0) * 100));

  document.getElementById("balance-user-name-display").textContent = (user ? user.displayName : "Player") + (user && user.email ? ` (${user.email})` : "");
  document.getElementById("balance-user-id-display").textContent = "User ID: " + userId;

  document.getElementById("current-total-balance-display").textContent = "৳ " + (curBalPaisa / 100).toLocaleString();
  document.getElementById("current-deposit-balance-display").textContent = "৳ " + (curDepPaisa / 100).toLocaleString();
  document.getElementById("current-winning-balance-display").textContent = "৳ " + (curWinPaisa / 100).toLocaleString();

  // Initialize input fields
  document.getElementById("input-new-deposit-bal").value = (curDepPaisa / 100);
  document.getElementById("input-new-winning-bal").value = (curWinPaisa / 100);
  document.getElementById("input-adjust-amount").value = "";
  document.getElementById("input-balance-note").value = "";

  const radioExact = document.querySelector('input[name="balance-edit-mode"][value="set_exact"]');
  if (radioExact) radioExact.checked = true;
  toggleBalanceEditMode();
  calculatePreviewTotal();

  openModal("modal-edit-user-balance");
}

function toggleBalanceEditMode() {
  const mode = document.querySelector('input[name="balance-edit-mode"]:checked')?.value || "set_exact";
  const secExact = document.getElementById("section-balance-exact");
  const secAdjust = document.getElementById("section-balance-adjust");
  if (!secExact || !secAdjust) return;

  if (mode === "set_exact") {
    secExact.style.display = "block";
    secAdjust.style.display = "none";
    document.getElementById("input-new-deposit-bal").required = true;
    document.getElementById("input-new-winning-bal").required = true;
    document.getElementById("input-adjust-amount").required = false;
  } else {
    secExact.style.display = "none";
    secAdjust.style.display = "block";
    document.getElementById("input-new-deposit-bal").required = false;
    document.getElementById("input-new-winning-bal").required = false;
    document.getElementById("input-adjust-amount").required = true;
  }
  calculatePreviewTotal();
}

function calculatePreviewTotal() {
  if (!targetUserActionId) return;
  const w = allWalletsMap[targetUserActionId] || {};
  const curDepPaisa = Math.round(Number(w.depositBalanceInPaisa != null ? w.depositBalanceInPaisa : (w.depositBalance || 0) * 100));
  const curWinPaisa = Math.round(Number(w.winningBalanceInPaisa != null ? w.winningBalanceInPaisa : (w.winningBalance || 0) * 100));

  const mode = document.querySelector('input[name="balance-edit-mode"]:checked')?.value || "set_exact";
  if (mode === "set_exact") {
    const dep = Number(document.getElementById("input-new-deposit-bal")?.value || 0);
    const win = Number(document.getElementById("input-new-winning-bal")?.value || 0);
    const total = Math.max(0, dep) + Math.max(0, win);
    const el = document.getElementById("preview-new-total");
    if (el) el.textContent = "৳ " + total.toLocaleString();
  } else {
    const action = document.getElementById("select-adjust-action")?.value || "add";
    const target = document.getElementById("select-adjust-target")?.value || "deposit";
    const amt = Number(document.getElementById("input-adjust-amount")?.value || 0);
    const deltaPaisa = Math.round(amt * 100);

    let nextDepPaisa = curDepPaisa;
    let nextWinPaisa = curWinPaisa;
    if (target === "deposit") {
      nextDepPaisa = action === "add" ? (curDepPaisa + deltaPaisa) : Math.max(0, curDepPaisa - deltaPaisa);
    } else {
      nextWinPaisa = action === "add" ? (curWinPaisa + deltaPaisa) : Math.max(0, curWinPaisa - deltaPaisa);
    }
    const nextTotal = (nextDepPaisa + nextWinPaisa) / 100;
    const el = document.getElementById("preview-adjust-total");
    if (el) el.textContent = "৳ " + nextTotal.toLocaleString() + 
      ` (Dep: ৳ ${(nextDepPaisa / 100).toLocaleString()} | Win: ৳ ${(nextWinPaisa / 100).toLocaleString()})`;
  }
}

async function handleConfirmEditUserBalance(e) {
  e.preventDefault();
  if (!targetUserActionId) return;

  const btn = document.getElementById("btn-save-user-balance");
  btn.disabled = true;
  btn.textContent = "Updating Balance...";

  try {
    const mode = document.querySelector('input[name="balance-edit-mode"]:checked')?.value || "set_exact";
    const note = document.getElementById("input-balance-note").value.trim() || "Admin balance adjustment";
    const adminId = (currentAdminUser && currentAdminUser.uid) || (auth.currentUser && auth.currentUser.uid) || "admin";

    const currentWallet = allWalletsMap[targetUserActionId] || {};
    const curBalPaisa = Math.round(Number(currentWallet.balanceInPaisa != null ? currentWallet.balanceInPaisa : (currentWallet.balance || 0) * 100));
    const curDepPaisa = Math.round(Number(currentWallet.depositBalanceInPaisa != null ? currentWallet.depositBalanceInPaisa : (currentWallet.depositBalance || 0) * 100));
    const curWinPaisa = Math.round(Number(currentWallet.winningBalanceInPaisa != null ? currentWallet.winningBalanceInPaisa : (currentWallet.winningBalance || 0) * 100));
    const curResPaisa = Math.round(Number(currentWallet.reservedBalanceInPaisa || 0));

    let newDepPaisa = curDepPaisa;
    let newWinPaisa = curWinPaisa;

    if (mode === "set_exact") {
      const depVal = Number(document.getElementById("input-new-deposit-bal").value || 0);
      const winVal = Number(document.getElementById("input-new-winning-bal").value || 0);
      newDepPaisa = Math.max(0, Math.round(depVal * 100));
      newWinPaisa = Math.max(0, Math.round(winVal * 100));
    } else {
      const action = document.getElementById("select-adjust-action").value;
      const target = document.getElementById("select-adjust-target").value;
      const amountVal = Number(document.getElementById("input-adjust-amount").value || 0);
      const deltaPaisa = Math.round(amountVal * 100);

      if (target === "deposit") {
        newDepPaisa = action === "add" ? (curDepPaisa + deltaPaisa) : Math.max(0, curDepPaisa - deltaPaisa);
      } else {
        newWinPaisa = action === "add" ? (curWinPaisa + deltaPaisa) : Math.max(0, curWinPaisa - deltaPaisa);
      }
    }

    const newBalPaisa = newDepPaisa + newWinPaisa;
    const now = firebase.firestore.FieldValue.serverTimestamp();

    const walletRef = db.collection("wallets").doc(targetUserActionId);
    await walletRef.set({
      userId: targetUserActionId,
      balanceInPaisa: newBalPaisa,
      depositBalanceInPaisa: newDepPaisa,
      winningBalanceInPaisa: newWinPaisa,
      reservedBalanceInPaisa: curResPaisa,
      balance: newBalPaisa / 100.0,
      depositBalance: newDepPaisa / 100.0,
      winningBalance: newWinPaisa / 100.0,
      reservedBalance: curResPaisa / 100.0,
      updatedAt: now,
      lastUpdatedByAdminId: adminId,
    }, { merge: true });

    // Also write transaction log
    const diffPaisa = newBalPaisa - curBalPaisa;
    if (diffPaisa !== 0) {
      const txRef = walletRef.collection("transactions").doc();
      const globalTxRef = db.collection("transactions").doc(txRef.id);
      const txPayload = {
        transactionId: txRef.id,
        userId: targetUserActionId,
        type: "ADMIN_ADJUSTMENT",
        amountInPaisa: diffPaisa,
        amount: diffPaisa / 100.0,
        balanceBeforeInPaisa: curBalPaisa,
        balanceAfterInPaisa: newBalPaisa,
        status: "CONFIRMED",
        description: `Admin balance adjustment: ${note}`,
        timestamp: now,
      };
      await txRef.set(txPayload).catch(() => null);
      await globalTxRef.set(txPayload).catch(() => null);
    }

    // Log admin audit
    await db.collection("adminAuditLogs").add({
      adminId,
      action: "USER_BALANCE_EDITED",
      targetId: targetUserActionId,
      details: {
        balanceBefore: curBalPaisa / 100.0,
        balanceAfter: newBalPaisa / 100.0,
        depositBalanceAfter: newDepPaisa / 100.0,
        winningBalanceAfter: newWinPaisa / 100.0,
        note,
      },
      timestamp: now,
    }).catch(() => null);

    showToast(`Wallet balance updated! New Total: ৳ ${(newBalPaisa / 100).toLocaleString()}`, "success");
    closeModal("modal-edit-user-balance");
    await loadUsers();
  } catch (err) {
    console.error("Balance update error:", err);
    showToast("Failed to update balance: " + err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Save Balance Changes";
  }
}

// ==========================================
// 2. USER DELETION
// ==========================================
function openDeleteUserModal(userId, displayName) {
  targetUserActionId = userId;
  document.getElementById("delete-user-name-display").textContent = displayName;
  document.getElementById("delete-user-id-display").textContent = "UID: " + userId;
  openModal("modal-delete-user");
}

async function handleConfirmDeleteUser() {
  if (!targetUserActionId) return;

  const btn = document.getElementById("btn-confirm-delete-user");
  btn.disabled = true;
  btn.textContent = "Deleting...";

  try {
    const adminId = (currentAdminUser && currentAdminUser.uid) || (auth.currentUser && auth.currentUser.uid) || "admin";
    const now = firebase.firestore.FieldValue.serverTimestamp();

    // 1. Delete users doc
    await db.collection("users").doc(targetUserActionId).delete();
    // 2. Delete user doc (legacy)
    await db.collection("user").doc(targetUserActionId).delete().catch(() => null);
    // 3. Delete wallet doc
    await db.collection("wallets").doc(targetUserActionId).delete().catch(() => null);

    // 4. Log admin audit
    await db.collection("adminAuditLogs").add({
      adminId,
      action: "USER_DELETED",
      targetId: targetUserActionId,
      details: { deletedUserId: targetUserActionId },
      timestamp: now,
    }).catch(() => null);

    showToast("User account permanently deleted.", "warning");
    closeModal("modal-delete-user");
    await loadUsers();
  } catch (err) {
    console.error("Delete user error:", err);
    showToast("Failed to delete user: " + err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Permanently Delete";
  }
}

// ==========================================
// 3. FULL STATS & ACTIVITY MODAL
// ==========================================
async function openUserDetailsModal(userId) {
  const user = allUsersList.find(u => u.id === userId);
  if (!user) return;

  const w = allWalletsMap[userId] || {};
  const balInPaisa = w.balanceInPaisa != null ? w.balanceInPaisa : Math.round((w.balance || 0) * 100);
  const depInPaisa = w.depositBalanceInPaisa != null ? w.depositBalanceInPaisa : Math.round((w.depositBalance || 0) * 100);
  const winInPaisa = w.winningBalanceInPaisa != null ? w.winningBalanceInPaisa : Math.round((w.winningBalance || 0) * 100);

  const depStats = allDepositsMap[userId] || { count: 0, totalAmount: 0, approvedCount: 0, approvedAmount: 0, list: [] };
  const withStats = allWithdrawalsMap[userId] || { count: 0, totalAmount: 0, completedCount: 0, completedAmount: 0, list: [] };
  const userMatches = allUserMatchesMap[userId] || { count: 0, list: [] };

  document.getElementById("detail-user-name").textContent = user.displayName || "Gamer";
  document.getElementById("detail-user-email").textContent = user.email || "No Email";
  document.getElementById("detail-user-id").textContent = "UID: " + user.id;

  const roleBadge = document.getElementById("detail-user-role-badge");
  roleBadge.textContent = (user.role || "player").toUpperCase();
  roleBadge.className = "badge " + (user.role === 'admin' ? 'badge-live' : (user.role === 'moderator' ? 'badge-open' : 'badge-upcoming'));

  const statusBadge = document.getElementById("detail-user-status-badge");
  statusBadge.textContent = user.isBanned ? "BANNED" : "ACTIVE";
  statusBadge.className = "badge " + (user.isBanned ? 'badge-cancelled' : 'badge-open');

  document.getElementById("detail-user-ffuid").textContent = user.freeFireUid || "Not Linked";
  document.getElementById("detail-user-ffname").textContent = user.freeFireName || "N/A";
  document.getElementById("detail-user-joined").textContent = formatTimestamp(user.createdAt);

  document.getElementById("detail-stat-total-bal").textContent = "৳ " + Number(balInPaisa / 100).toLocaleString();
  document.getElementById("detail-stat-dep-bal").textContent = "৳ " + Number(depInPaisa / 100).toLocaleString();
  document.getElementById("detail-stat-win-bal").textContent = "৳ " + Number(winInPaisa / 100).toLocaleString();

  document.getElementById("detail-stat-dep-count").textContent = `${depStats.count} times`;
  document.getElementById("detail-stat-dep-amount").textContent = `Approved: ৳ ${Number(depStats.approvedAmount).toLocaleString()}`;

  document.getElementById("detail-stat-with-count").textContent = `${withStats.count} times`;
  document.getElementById("detail-stat-with-amount").textContent = `Completed: ৳ ${Number(withStats.completedAmount).toLocaleString()}`;

  const matchesCount = userMatches.count || user.totalMatchesPlayed || 0;
  document.getElementById("detail-stat-matches-count").textContent = String(matchesCount);

  // Render Deposits List
  const depTbody = document.getElementById("detail-deposits-tbody");
  if (depStats.list.length === 0) {
    depTbody.innerHTML = `<tr><td colspan="5" class="empty-state">No deposit requests submitted yet.</td></tr>`;
  } else {
    depTbody.innerHTML = depStats.list.map(d => `
      <tr>
        <td>${formatTimestamp(d.createdAt)}</td>
        <td><strong style="color: var(--accent-green);">৳ ${Number(d.amount || 0).toLocaleString()}</strong></td>
        <td>${escapeHtml(d.paymentMethod || 'Mobile Banking')}</td>
        <td><span style="font-family: monospace;">${escapeHtml(d.trxId || 'N/A')}</span></td>
        <td><span class="badge ${d.status === 'APPROVED' ? 'badge-approved' : (d.status === 'REJECTED' ? 'badge-rejected' : 'badge-pending')}">${escapeHtml(d.status || 'PENDING')}</span></td>
      </tr>
    `).join("");
  }

  // Render Withdrawals List
  const withTbody = document.getElementById("detail-withdrawals-tbody");
  if (withStats.list.length === 0) {
    withTbody.innerHTML = `<tr><td colspan="5" class="empty-state">No withdrawal requests submitted yet.</td></tr>`;
  } else {
    withTbody.innerHTML = withStats.list.map(w => `
      <tr>
        <td>${formatTimestamp(w.createdAt)}</td>
        <td><strong style="color: var(--secondary);">৳ ${Number(w.amount || 0).toLocaleString()}</strong></td>
        <td>${escapeHtml(w.paymentMethod || 'Mobile Banking')}</td>
        <td><span style="font-family: monospace;">${escapeHtml(w.receiverNumber || 'N/A')}</span></td>
        <td><span class="badge ${w.status === 'COMPLETED' ? 'badge-approved' : (w.status === 'REJECTED' ? 'badge-rejected' : 'badge-pending')}">${escapeHtml(w.status || 'PENDING')}</span></td>
      </tr>
    `).join("");
  }

  // Render Matches List (Fetch from users/{userId}/myTournaments)
  const matchTbody = document.getElementById("detail-matches-tbody");
  matchTbody.innerHTML = `<tr><td colspan="5" class="loading-container"><div class="loading-spinner"></div>Loading match participation...</td></tr>`;

  openModal("modal-user-details");

  try {
    const myTournSnap = await db.collection("users").doc(userId).collection("myTournaments").get();
    if (myTournSnap.empty && userMatches.list.length === 0) {
      matchTbody.innerHTML = `<tr><td colspan="5" class="empty-state">No tournament entries found for this player.</td></tr>`;
    } else {
      const matchItems = [];
      myTournSnap.forEach(doc => {
        matchItems.push({ id: doc.id, ...doc.data() });
      });
      if (matchItems.length === 0 && userMatches.list.length > 0) {
        userMatches.list.forEach(item => matchItems.push(item));
      }

      document.getElementById("detail-stat-matches-count").textContent = String(matchItems.length);

      matchTbody.innerHTML = matchItems.map(m => `
        <tr>
          <td><strong>${escapeHtml(m.title || m.tournamentTitle || m.tournamentId || 'Match')}</strong></td>
          <td>${escapeHtml(m.gameMode || 'SOLO')} - ${escapeHtml(m.map || 'Bermuda')}</td>
          <td><span class="badge badge-open">Slot #${m.slotNumber || 1}</span></td>
          <td>${m.entryFeePaid > 0 ? '৳ ' + m.entryFeePaid : '<span style="color: var(--accent-green);">FREE</span>'}</td>
          <td><span class="badge ${m.status === 'CONFIRMED' ? 'badge-approved' : 'badge-pending'}">${escapeHtml(m.status || 'CONFIRMED')}</span></td>
        </tr>
      `).join("");
    }
  } catch (mErr) {
    console.error("Load player matches error:", mErr);
    matchTbody.innerHTML = `<tr><td colspan="5" class="empty-state">Participated in ${matchesCount} match(es).</td></tr>`;
  }
}

// ==========================================
// 4. BAN / UNBAN
// ==========================================
function openBanUserModal(userId) {
  targetUserActionId = userId;
  document.getElementById("ban-user-id-display").textContent = userId;
  openModal("modal-ban-user");
}

async function handleConfirmBanUser() {
  if (!targetUserActionId) return;

  const reason = document.getElementById("ban-user-reason").value.trim();
  const btn = document.getElementById("btn-confirm-ban-user");
  btn.disabled = true;
  btn.textContent = "Banning...";

  try {
    const now = firebase.firestore.FieldValue.serverTimestamp();
    const updatePayload = {
      isBanned: true,
      banReason: reason || "Terms violation.",
      bannedAt: now,
      updatedAt: now,
    };
    await db.collection("users").doc(targetUserActionId).set(updatePayload, { merge: true });
    await db.collection("user").doc(targetUserActionId).set(updatePayload, { merge: true }).catch(() => null);

    showToast("User account has been banned.", "warning");
    closeModal("modal-ban-user");
    await loadUsers();
  } catch (err) {
    console.error("Ban user error:", err);
    showToast("Failed to ban user: " + err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Confirm Ban";
  }
}

async function handleToggleUserBan(userId, isBanned) {
  if (!confirm(`Are you sure you want to ${isBanned ? 'BAN' : 'UNBAN'} this player?`)) return;

  try {
    const now = firebase.firestore.FieldValue.serverTimestamp();
    const updatePayload = {
      isBanned: isBanned,
      updatedAt: now,
    };
    await db.collection("users").doc(userId).set(updatePayload, { merge: true });
    await db.collection("user").doc(userId).set(updatePayload, { merge: true }).catch(() => null);

    showToast(`User has been ${isBanned ? 'banned' : 'unbanned'}.`, "success");
    await loadUsers();
  } catch (err) {
    console.error("Toggle ban error:", err);
    showToast("Failed: " + err.message, "error");
  }
}

// ==========================================
// 5. ROLE EDIT
// ==========================================
function openEditUserRoleModal(userId, currentRole) {
  targetUserActionId = userId;
  document.getElementById("role-user-id-display").textContent = userId;
  document.getElementById("select-user-role").value = currentRole;
  openModal("modal-edit-user-role");
}

async function handleConfirmEditRole() {
  if (!targetUserActionId) return;

  const role = document.getElementById("select-user-role").value;
  const btn = document.getElementById("btn-confirm-user-role");
  btn.disabled = true;
  btn.textContent = "Updating...";

  try {
    const now = firebase.firestore.FieldValue.serverTimestamp();
    const updatePayload = {
      role: role,
      updatedAt: now,
    };
    await db.collection("users").doc(targetUserActionId).set(updatePayload, { merge: true });
    await db.collection("user").doc(targetUserActionId).set(updatePayload, { merge: true }).catch(() => null);

    showToast(`User role updated to ${role.toUpperCase()}!`, "success");
    closeModal("modal-edit-user-role");
    await loadUsers();
  } catch (err) {
    console.error("Role update error:", err);
    showToast("Failed to update role: " + err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Save Role";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const btnBan = document.getElementById("btn-confirm-ban-user");
  if (btnBan) btnBan.addEventListener("click", handleConfirmBanUser);

  const btnRole = document.getElementById("btn-confirm-user-role");
  if (btnRole) btnRole.addEventListener("click", handleConfirmEditRole);
});

// Window Exports for inline HTML click handlers
window.loadUsers = loadUsers;
window.filterUsers = filterUsers;
window.handleUserCheckChange = handleUserCheckChange;
window.toggleSelectAllUsers = toggleSelectAllUsers;
window.openNotifySelectedUsersModal = openNotifySelectedUsersModal;
window.openBroadcastNotificationModal = openBroadcastNotificationModal;
window.openPushSettingsModal = openPushSettingsModal;
window.handlePushConfigFileSelected = handlePushConfigFileSelected;
window.handleSavePushSettings = handleSavePushSettings;
window.openBanUserModal = openBanUserModal;
window.handleToggleUserBan = handleToggleUserBan;
window.openEditUserRoleModal = openEditUserRoleModal;
window.openEditUserBalanceModal = openEditUserBalanceModal;
window.toggleBalanceEditMode = toggleBalanceEditMode;
window.calculatePreviewTotal = calculatePreviewTotal;
window.handleConfirmEditUserBalance = handleConfirmEditUserBalance;
window.openDeleteUserModal = openDeleteUserModal;
window.handleConfirmDeleteUser = handleConfirmDeleteUser;
window.openUserDetailsModal = openUserDetailsModal;
window.openDeletionRequestsModal = openDeletionRequestsModal;
window.loadAccountDeletionRequests = loadAccountDeletionRequests;
window.handleApproveDeletionRequest = handleApproveDeletionRequest;
window.handleRejectDeletionRequest = handleRejectDeletionRequest;

// ==========================================
// 8. Account Deletion Requests Management
// ==========================================

function openDeletionRequestsModal() {
  openModal("modal-deletion-requests");
  loadAccountDeletionRequests();
}

async function loadAccountDeletionRequests() {
  const tbody = document.getElementById("deletion-requests-tbody");
  if (!tbody) return;

  if (!navigator.onLine) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state" style="color: #dc2626;">⚠️ Internet disconnected. Please reconnect to review requests.</td></tr>`;
    showToast("Internet disconnected. Cannot fetch requests.", "warning");
    return;
  }

  tbody.innerHTML = `<tr><td colspan="7" class="loading-container"><div class="loading-spinner"></div>Loading account deletion requests...</td></tr>`;

  try {
    const snap = await db.collection("accountDeletionRequests").orderBy("createdAt", "desc").limit(100).get();
    
    // Update badge count
    let pendingCount = 0;
    snap.forEach(d => {
      if ((d.data().status || "").toUpperCase() === "PENDING") pendingCount++;
    });
    const badge = document.getElementById("deletion-requests-badge");
    if (badge) {
      if (pendingCount > 0) {
        badge.textContent = pendingCount;
        badge.style.display = "inline-block";
      } else {
        badge.style.display = "none";
      }
    }

    if (snap.empty) {
      tbody.innerHTML = `<tr><td colspan="7" class="empty-state">No account deletion requests submitted yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = "";
    snap.forEach((doc) => {
      const r = { id: doc.id, ...doc.data() };
      const status = (r.status || "PENDING").toUpperCase();
      let statusBadge = "badge-upcoming";
      if (status === "APPROVED") statusBadge = "badge-completed";
      if (status === "REJECTED") statusBadge = "badge-cancelled";

      // Wallet details
      const w = allWalletsMap[r.userId] || {};
      const balInPaisa = w.balanceInPaisa != null ? w.balanceInPaisa : Math.round((w.balance || 0) * 100);
      const totalBal = balInPaisa / 100;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>
          <strong>${escapeHtml(r.displayName || "User")}</strong>
          <div style="font-size: 11px; color: var(--text-muted); font-family: monospace;">${escapeHtml(r.userId || "")}</div>
          <div style="font-size: 11px; color: var(--text-secondary);">${escapeHtml(r.userEmail || "No Email")}</div>
        </td>
        <td>
          <strong style="color: var(--secondary); font-family: monospace;">${escapeHtml(r.freeFireUid || "N/A")}</strong>
        </td>
        <td>
          <strong style="color: ${totalBal > 0 ? 'var(--accent-red)' : 'var(--accent-green)'}; font-size: 13.5px;">৳ ${totalBal.toLocaleString()}</strong>
        </td>
        <td>
          <div style="font-size: 11.5px; color: var(--text-muted);">${escapeHtml(r.deviceModel || "Mobile")}</div>
        </td>
        <td>
          <div style="font-size: 11.5px;">${formatTimestamp(r.createdAt)}</div>
        </td>
        <td><span class="badge ${statusBadge}">${escapeHtml(status)}</span></td>
        <td>
          ${status === "PENDING" ? `
            <div style="display: flex; gap: 5px;">
              <button class="btn btn-danger btn-sm" style="background: #dc2626; border-color: #dc2626;" onclick="handleApproveDeletionRequest('${escapeHtml(r.id)}', '${escapeHtml(r.userId)}', '${escapeHtml(r.displayName || 'User')}')">✅ Approve</button>
              <button class="btn btn-secondary btn-sm" onclick="handleRejectDeletionRequest('${escapeHtml(r.id)}', '${escapeHtml(r.userId)}', '${escapeHtml(r.displayName || 'User')}')">❌ Reject</button>
            </div>
          ` : `
            <span style="font-size: 11px; color: var(--text-muted);">Processed</span>
          `}
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error("Deletion requests load error:", err);
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">Failed to load deletion requests: ${escapeHtml(err.message)}</td></tr>`;
  }
}

async function handleApproveDeletionRequest(reqId, userId, userName) {
  if (!navigator.onLine) {
    showToast("Internet disconnected. Cannot approve deletion offline.", "error");
    return;
  }

  const w = allWalletsMap[userId] || {};
  const balInPaisa = w.balanceInPaisa != null ? w.balanceInPaisa : Math.round((w.balance || 0) * 100);
  const totalBal = balInPaisa / 100;

  let balanceWarning = "";
  if (totalBal > 0) {
    balanceWarning = `\n\n⚠️ WARNING: This user still has a wallet balance of ৳ ${totalBal}! Ensure any refunds are settled before deleting.`;
  }

  const confirmed = confirm(`Are you sure you want to approve account deletion for ${userName} (${userId})?${balanceWarning}\n\nThis will permanently deactivate this player's account.`);
  if (!confirmed) return;

  try {
    const adminId = (currentAdminUser && currentAdminUser.uid) || (auth.currentUser && auth.currentUser.uid) || "admin";
    const now = firebase.firestore.FieldValue.serverTimestamp();

    const batch = db.batch();

    // 1. Update deletion request record
    const reqRef = db.collection("accountDeletionRequests").doc(reqId);
    batch.update(reqRef, {
      status: "APPROVED",
      approvedAt: now,
      approvedBy: adminId
    });

    // 2. Deactivate & ban user profile
    const userRef = db.collection("users").doc(userId);
    batch.set(userRef, {
      status: "DELETED",
      isBanned: true,
      deletionRequested: false,
      deletedAt: now,
      deletedByAdminId: adminId
    }, { merge: true });

    // 3. Log Immutable Audit Log
    const auditRef = db.collection("adminAuditLogs").doc();
    batch.set(auditRef, {
      action: "USER_DELETION_APPROVED",
      targetUserId: userId,
      userName: userName,
      deletionRequestId: reqId,
      performedBy: adminId,
      timestamp: now,
      details: `Admin approved player-initiated account deletion request.`
    });

    await batch.commit();

    showToast(`Account deletion for ${userName} approved and processed.`, "success");
    await loadAccountDeletionRequests();
    await loadUsers();
  } catch (err) {
    console.error("Approve deletion error:", err);
    showToast("Failed to approve deletion: " + err.message, "error");
  }
}

async function handleRejectDeletionRequest(reqId, userId, userName) {
  if (!navigator.onLine) {
    showToast("Internet disconnected. Cannot reject deletion offline.", "error");
    return;
  }

  const confirmed = confirm(`Reject account deletion request for ${userName} (${userId})?`);
  if (!confirmed) return;

  try {
    const adminId = (currentAdminUser && currentAdminUser.uid) || (auth.currentUser && auth.currentUser.uid) || "admin";
    const now = firebase.firestore.FieldValue.serverTimestamp();

    const batch = db.batch();

    // 1. Update deletion request record
    const reqRef = db.collection("accountDeletionRequests").doc(reqId);
    batch.update(reqRef, {
      status: "REJECTED",
      rejectedAt: now,
      rejectedBy: adminId
    });

    // 2. Unmark deletionRequested on user profile
    const userRef = db.collection("users").doc(userId);
    batch.update(userRef, {
      deletionRequested: false
    });

    // 3. Audit log
    const auditRef = db.collection("adminAuditLogs").doc();
    batch.set(auditRef, {
      action: "USER_DELETION_REJECTED",
      targetUserId: userId,
      userName: userName,
      deletionRequestId: reqId,
      performedBy: adminId,
      timestamp: now,
      details: `Admin rejected player account deletion request.`
    });

    await batch.commit();

    showToast(`Deletion request for ${userName} rejected.`, "info");
    await loadAccountDeletionRequests();
    await loadUsers();
  } catch (err) {
    console.error("Reject deletion error:", err);
    showToast("Failed to reject deletion: " + err.message, "error");
  }
}
