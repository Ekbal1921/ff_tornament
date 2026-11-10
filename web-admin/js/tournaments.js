/**
 * Tournament Management Module.
 */
let allTournaments = [];
let currentEditingTournId = null;

async function loadTournaments() {
  const tbody = document.getElementById("tournaments-tbody");
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="8" class="loading-container"><div class="loading-spinner"></div>Loading tournaments...</td></tr>`;

  try {
    const snapshot = await db.collection("tournaments").orderBy("createdAt", "desc").get();
    allTournaments = [];

    snapshot.forEach((doc) => {
      allTournaments.push({ id: doc.id, ...doc.data() });
    });

    renderTournamentsTable(allTournaments);

  } catch (err) {
    console.error("Error loading tournaments:", err);
    tbody.innerHTML = `<tr><td colspan="8" class="empty-state">Error loading tournaments: ${escapeHtml(err.message)}</td></tr>`;
    showToast("Failed to fetch tournaments: " + err.message, "error");
  }
}

function renderTournamentsTable(tournaments) {
  const tbody = document.getElementById("tournaments-tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (tournaments.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8">
          <div class="empty-state">
            <div class="empty-icon">🏆</div>
            <div class="empty-title">No Tournaments Found</div>
            <div class="empty-desc">Create your first Free Fire tournament using the button above.</div>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tournaments.forEach((t) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <strong>${escapeHtml(t.title || "Match")}</strong>
        <div style="font-size: 11px; color: var(--text-muted);">${escapeHtml(t.id)}</div>
      </td>
      <td><span class="badge ${getModeBadgeClass(t.gameMode)}">${escapeHtml(t.gameMode || "Solo")}</span></td>
      <td>${escapeHtml(t.map || "Bermuda")}</td>
      <td>${t.filledSlots || 0} / ${t.totalSlots || 48}</td>
      <td>
        <div>Pool: <strong>৳ ${Number(t.totalPrizePool || 0).toLocaleString()}</strong></div>
        <div style="font-size: 11px; color: var(--text-secondary);">Fee: ৳ ${Number(t.entryFee || 0).toLocaleString()}</div>
      </td>
      <td>${formatTimestamp(t.matchSchedule)}</td>
      <td><span class="badge ${getStatusBadgeClass(t.status)}">${escapeHtml(t.status || "Upcoming")}</span></td>
      <td>
        <div style="display: flex; gap: 6px; flex-wrap: wrap;">
          <button class="btn btn-secondary btn-sm" onclick="openEditTournamentModal('${t.id}')">Edit</button>
          <button class="btn btn-secondary btn-sm" onclick="navigateToPlayers('${t.id}')">Players</button>
          <button class="btn btn-secondary btn-sm" onclick="navigateToRoom('${t.id}')">Room</button>
          ${t.status !== 'Cancelled' && t.status !== 'Completed' ? `
            <button class="btn btn-danger btn-sm" onclick="openCancelTournamentModal('${t.id}')">Cancel</button>
          ` : `
            <button class="btn btn-danger btn-sm" style="background: #dc2626; border-color: #dc2626;" onclick="openDeleteTournamentModal('${t.id}')">Delete</button>
          `}
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Search and Filter Handlers
function filterTournaments() {
  const search = document.getElementById("tourn-search-input")?.value.toLowerCase().trim() || "";
  const statusFilter = document.getElementById("tourn-status-filter")?.value || "ALL";
  const modeFilter = document.getElementById("tourn-mode-filter")?.value || "ALL";

  const filtered = allTournaments.filter((t) => {
    const matchSearch = (t.title && t.title.toLowerCase().includes(search)) || (t.id && t.id.toLowerCase().includes(search));
    const matchStatus = statusFilter === "ALL" || t.status === statusFilter;
    const matchMode = modeFilter === "ALL" || (t.gameMode && t.gameMode.toUpperCase() === modeFilter.toUpperCase());
    return matchSearch && matchStatus && matchMode;
  });

  renderTournamentsTable(filtered);
}

// Create Tournament Modal Action
async function handleCreateTournament(e) {
  e.preventDefault();

  const title = document.getElementById("create-title").value.trim();
  const description = document.getElementById("create-desc").value.trim();
  const gameMode = document.getElementById("create-mode").value;
  const map = document.getElementById("create-map").value;
  const totalSlots = Number(document.getElementById("create-slots").value);
  const entryFee = Number(document.getElementById("create-fee").value || 0);
  const totalPrizePool = Number(document.getElementById("create-prize-total").value || 0);
  const perKillPrize = Number(document.getElementById("create-prize-kill").value || 0);
  const scheduleDateVal = document.getElementById("create-schedule").value;
  const cutoffDateVal = document.getElementById("create-cutoff").value;
  const rulesRaw = document.getElementById("create-rules").value;

  if (!title || !scheduleDateVal) {
    showToast("Please fill in the title and match schedule.", "error");
    return;
  }

  const matchScheduleMs = new Date(scheduleDateVal).getTime();
  const registrationClosesMs = cutoffDateVal ? new Date(cutoffDateVal).getTime() : matchScheduleMs - (15 * 60 * 1000);

  const rules = rulesRaw.split("\n").map(r => r.trim()).filter(r => r.length > 0);

  const submitBtn = document.getElementById("btn-submit-create-tourn");
  submitBtn.disabled = true;
  submitBtn.textContent = "Creating...";

  try {
    const now = firebase.firestore.FieldValue.serverTimestamp();
    const adminId = (currentAdminUser && currentAdminUser.uid) || (auth.currentUser && auth.currentUser.uid) || "admin";
    await db.collection("tournaments").add({
      title,
      description: description || "Competitive Free Fire tournament with prize pool rewards and rank standings.",
      gameMode,
      map,
      totalSlots,
      filledSlots: 0,
      entryFee,
      totalPrizePool,
      perKillPrize,
      status: "Registration Open",
      matchSchedule: firebase.firestore.Timestamp.fromMillis(matchScheduleMs),
      registrationOpensAt: now,
      registrationClosesAt: firebase.firestore.Timestamp.fromMillis(registrationClosesMs),
      rules: rules.length > 0 ? rules : ["Standard Free Fire Competitive Rules apply."],
      createdAt: now,
      updatedAt: now,
      createdByAdminId: adminId,
    });

    showToast("Tournament created successfully!", "success");
    closeModal("modal-create-tournament");
    document.getElementById("form-create-tournament").reset();
    await loadTournaments();

  } catch (err) {
    console.error("Create tournament error:", err);
    showToast("Failed to create tournament: " + err.message, "error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Create Tournament";
  }
}

// Edit Tournament Modal Action
function openEditTournamentModal(id) {
  const t = allTournaments.find(x => x.id === id);
  if (!t) return;

  currentEditingTournId = id;
  document.getElementById("edit-tourn-id").value = id;
  document.getElementById("edit-title").value = t.title || "";
  document.getElementById("edit-desc").value = t.description || "";
  document.getElementById("edit-mode").value = t.gameMode || "Solo";
  document.getElementById("edit-map").value = t.map || "Bermuda";
  document.getElementById("edit-slots").value = t.totalSlots || 48;
  document.getElementById("edit-status").value = t.status || "Registration Open";
  document.getElementById("edit-fee").value = t.entryFee || 0;
  document.getElementById("edit-prize-total").value = t.totalPrizePool || 0;
  document.getElementById("edit-prize-kill").value = t.perKillPrize || 0;

  if (Array.isArray(t.rules)) {
    document.getElementById("edit-rules").value = t.rules.join("\n");
  }

  openModal("modal-edit-tournament");
}

async function handleUpdateTournament(e) {
  e.preventDefault();
  if (!currentEditingTournId) return;

  const updates = {
    title: document.getElementById("edit-title").value.trim(),
    description: document.getElementById("edit-desc").value.trim(),
    gameMode: document.getElementById("edit-mode").value,
    map: document.getElementById("edit-map").value,
    totalSlots: Number(document.getElementById("edit-slots").value),
    status: document.getElementById("edit-status").value,
    entryFee: Number(document.getElementById("edit-fee").value || 0),
    totalPrizePool: Number(document.getElementById("edit-prize-total").value || 0),
    perKillPrize: Number(document.getElementById("edit-prize-kill").value || 0),
  };

  const rawRules = document.getElementById("edit-rules").value;
  if (rawRules) {
    updates.rules = rawRules.split("\n").map(r => r.trim()).filter(r => r.length > 0);
  }

  const submitBtn = document.getElementById("btn-submit-edit-tourn");
  submitBtn.disabled = true;
  submitBtn.textContent = "Updating...";

  try {
    updates.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
    await db.collection("tournaments").doc(currentEditingTournId).update(updates);

    // Phase 10: Dispatch MATCH_SCHEDULE_UPDATE notifications if details/schedule modified
    try {
      const partSnap = await db.collection("tournaments").doc(currentEditingTournId).collection("participants").get();
      if (!partSnap.empty) {
        const batch = db.batch();
        partSnap.forEach(pDoc => {
          const pUserId = pDoc.data().userId || pDoc.id;
          if (pUserId) {
            const notifRef = db.collection("notifications").doc();
            batch.set(notifRef, {
              userId: pUserId,
              title: "Match Schedule Update",
              message: `Tournament "${updates.title || "Match"}" details or status have been updated. Status: ${updates.status || "Updated"}.`,
              type: "MATCH_SCHEDULE_UPDATE",
              referenceId: currentEditingTournId,
              read: false,
              createdAt: updates.updatedAt,
            });
          }
        });
        await batch.commit();
      }
    } catch (nErr) {
      console.warn("Could not dispatch schedule update notifications:", nErr);
    }

    showToast("Tournament updated successfully!", "success");
    closeModal("modal-edit-tournament");
    await loadTournaments();

  } catch (err) {
    console.error("Update tournament error:", err);
    showToast("Failed to update tournament: " + err.message, "error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Save Changes";
  }
}

// Cancel Tournament
let cancellingTournId = null;
function openCancelTournamentModal(id) {
  cancellingTournId = id;
  const t = allTournaments.find(x => x.id === id);
  document.getElementById("cancel-tourn-id-display").textContent = t ? `${t.title || 'Match'} (${id})` : id;
  openModal("modal-cancel-tournament");
}

async function handleConfirmCancelTournament() {
  if (!cancellingTournId) return;

  const reason = document.getElementById("cancel-reason-input").value.trim();
  const btn = document.getElementById("btn-confirm-cancel");
  btn.disabled = true;
  btn.textContent = "Cancelling & Refunding...";

  try {
    const now = firebase.firestore.FieldValue.serverTimestamp();
    const adminId = (currentAdminUser && currentAdminUser.uid) || (auth.currentUser && auth.currentUser.uid) || "admin";

    // 1. Fetch tournament details
    const tournDoc = await db.collection("tournaments").doc(cancellingTournId).get();
    const tournData = tournDoc.exists ? tournDoc.data() : {};
    const tournTitle = tournData.title || "Match";
    const defaultEntryFee = Number(tournData.entryFee || 0);

    // 2. Fetch all registered participants
    const partSnap = await db.collection("tournaments").doc(cancellingTournId).collection("participants").get();
    let refundedCount = 0;
    let totalRefundedPaisa = 0;

    for (const pDoc of partSnap.docs) {
      const pData = pDoc.data();
      const pUserId = pData.userId || pDoc.id;
      if (!pUserId) continue;

      // Avoid duplicate refunds
      if (pData.status === "CANCELLED_REFUNDED") continue;

      const feePaid = Number(pData.entryFeePaid != null ? pData.entryFeePaid : defaultEntryFee);
      const feeInPaisa = Math.round(Number(pData.entryFeePaidInPaisa != null ? pData.entryFeePaidInPaisa : feePaid * 100));

      if (feeInPaisa > 0) {
        try {
          await db.runTransaction(async (transaction) => {
            const walletRef = db.collection("wallets").doc(pUserId);
            const wDoc = await transaction.get(walletRef);
            const wData = wDoc.exists ? wDoc.data() : {};

            const curBalPaisa = Math.round(Number(wData.balanceInPaisa != null ? wData.balanceInPaisa : (wData.balance || 0) * 100));
            const curDepPaisa = Math.round(Number(wData.depositBalanceInPaisa != null ? wData.depositBalanceInPaisa : (wData.depositBalance || 0) * 100));

            const newBalPaisa = curBalPaisa + feeInPaisa;
            const newDepPaisa = curDepPaisa + feeInPaisa;

            // Credit wallet
            transaction.set(walletRef, {
              userId: pUserId,
              balanceInPaisa: newBalPaisa,
              depositBalanceInPaisa: newDepPaisa,
              balance: newBalPaisa / 100.0,
              depositBalance: newDepPaisa / 100.0,
              updatedAt: now,
            }, { merge: true });

            // Generate unique transaction ID
            const txId = `tx_refund_${cancellingTournId}_${pUserId}_${Date.now()}`;
            const txRef = walletRef.collection("transactions").doc(txId);
            const globalTxRef = db.collection("transactions").doc(txId);
            const ledgerRef = db.collection("ledgerEntries").doc(txId);

            const refundTx = {
              transactionId: txId,
              userId: pUserId,
              type: "REFUND_CREDIT",
              amountInPaisa: feeInPaisa,
              amount: feePaid,
              balanceAfterInPaisa: newBalPaisa,
              balanceAfter: newBalPaisa / 100.0,
              referenceId: cancellingTournId,
              reason: `Match Cancelled Refund: ${tournTitle}`,
              status: "COMPLETED",
              createdAt: now,
              timestamp: now,
            };

            transaction.set(txRef, refundTx);
            transaction.set(globalTxRef, refundTx);
            transaction.set(ledgerRef, refundTx);

            // Mark participant status
            transaction.update(pDoc.ref, {
              status: "CANCELLED_REFUNDED",
              refundedAmount: feePaid,
              refundedAt: now,
            });
          });

          refundedCount++;
          totalRefundedPaisa += feeInPaisa;
        } catch (rErr) {
          console.error(`Refund failed for player ${pUserId}:`, rErr);
        }
      } else {
        await pDoc.ref.update({
          status: "CANCELLED",
          cancelledAt: now,
        });
      }

      // Dispatch notification to player
      try {
        await db.collection("notifications").add({
          userId: pUserId,
          title: "Match Cancelled & Fee Refunded",
          message: feeInPaisa > 0
            ? `Match "${tournTitle}" was cancelled. Your entry fee of ৳ ${feePaid} has been refunded to your wallet balance.`
            : `Match "${tournTitle}" was cancelled. Reason: ${reason || "Cancelled by administrator."}`,
          type: "TOURNAMENT_CANCELLATION",
          referenceId: cancellingTournId,
          read: false,
          createdAt: now,
        });
      } catch (nErr) {
        console.warn("Notification error for player:", pUserId, nErr);
      }
    }

    // 3. Mark tournament Cancelled
    await db.collection("tournaments").doc(cancellingTournId).update({
      status: "Cancelled",
      cancellationReason: reason || "Cancelled by administrator.",
      refundedParticipantsCount: refundedCount,
      totalRefundedAmount: totalRefundedPaisa / 100.0,
      cancelledAt: now,
      updatedAt: now,
    });

    // 4. Admin Audit Log
    try {
      await db.collection("adminAuditLogs").add({
        adminId,
        action: "TOURNAMENT_CANCELLED_WITH_REFUNDS",
        details: {
          tournamentId: cancellingTournId,
          reason,
          refundedCount,
          totalRefunded: totalRefundedPaisa / 100.0,
        },
        timestamp: now,
      });
    } catch (aErr) {}

    showToast(`Tournament cancelled! ${refundedCount} player(s) refunded ৳ ${totalRefundedPaisa / 100}.`, "success");
    closeModal("modal-cancel-tournament");
    await loadTournaments();

  } catch (err) {
    console.error("Cancel tournament error:", err);
    showToast("Failed to cancel tournament: " + err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Confirm Cancellation & Refund Players";
  }
}

// Delete Tournament
let deletingTournId = null;
function openDeleteTournamentModal(id) {
  deletingTournId = id;
  const t = allTournaments.find(x => x.id === id);
  document.getElementById("delete-tourn-title-display").textContent = t ? (t.title || "Match") : "Match";
  document.getElementById("delete-tourn-id-display").textContent = id;
  openModal("modal-delete-tournament");
}

async function handleConfirmDeleteTournament() {
  if (!deletingTournId) return;

  const btn = document.getElementById("btn-confirm-delete");
  btn.disabled = true;
  btn.textContent = "Deleting...";

  try {
    const adminId = (currentAdminUser && currentAdminUser.uid) || (auth.currentUser && auth.currentUser.uid) || "admin";
    const tournRef = db.collection("tournaments").doc(deletingTournId);
    const tournDoc = await tournRef.get();
    const tournData = tournDoc.exists ? tournDoc.data() : {};
    const tournTitle = tournData.title || "Match";
    const defaultEntryFee = Number(tournData.entryFee || 0);

    // 1. Delete or auto-refund participants in subcollection
    const partSnap = await tournRef.collection("participants").get();
    let autoRefundCount = 0;
    const now = firebase.firestore.FieldValue.serverTimestamp();

    for (const pDoc of partSnap.docs) {
      const pData = pDoc.data();
      const pUserId = pData.userId || pDoc.id;

      // If match was cancelled or completed and a player was not yet refunded, refund them now before deleting
      if (tournData.status === "Cancelled" && pData.status !== "CANCELLED_REFUNDED") {
        const feePaid = Number(pData.entryFeePaid != null ? pData.entryFeePaid : defaultEntryFee);
        const feeInPaisa = Math.round(Number(pData.entryFeePaidInPaisa != null ? pData.entryFeePaidInPaisa : feePaid * 100));
        if (feeInPaisa > 0 && pUserId) {
          try {
            await db.runTransaction(async (transaction) => {
              const walletRef = db.collection("wallets").doc(pUserId);
              const wDoc = await transaction.get(walletRef);
              const wData = wDoc.exists ? wDoc.data() : {};
              const curBalPaisa = Math.round(Number(wData.balanceInPaisa != null ? wData.balanceInPaisa : (wData.balance || 0) * 100));
              const curDepPaisa = Math.round(Number(wData.depositBalanceInPaisa != null ? wData.depositBalanceInPaisa : (wData.depositBalance || 0) * 100));
              const newBalPaisa = curBalPaisa + feeInPaisa;
              const newDepPaisa = curDepPaisa + feeInPaisa;

              transaction.set(walletRef, {
                userId: pUserId,
                balanceInPaisa: newBalPaisa,
                depositBalanceInPaisa: newDepPaisa,
                balance: newBalPaisa / 100.0,
                depositBalance: newDepPaisa / 100.0,
                updatedAt: now,
              }, { merge: true });

              const txId = `tx_refund_${deletingTournId}_${pUserId}_${Date.now()}`;
              const txRef = walletRef.collection("transactions").doc(txId);
              const globalTxRef = db.collection("transactions").doc(txId);
              const ledgerRef = db.collection("ledgerEntries").doc(txId);

              const refundTx = {
                transactionId: txId,
                userId: pUserId,
                type: "REFUND_CREDIT",
                amountInPaisa: feeInPaisa,
                amount: feePaid,
                balanceAfterInPaisa: newBalPaisa,
                balanceAfter: newBalPaisa / 100.0,
                referenceId: deletingTournId,
                reason: `Match Deleted Refund: ${tournTitle}`,
                status: "COMPLETED",
                createdAt: now,
                timestamp: now,
              };

              transaction.set(txRef, refundTx);
              transaction.set(globalTxRef, refundTx);
              transaction.set(ledgerRef, refundTx);
            });
            autoRefundCount++;
          } catch (rErr) {
            console.error("Auto-refund error before deletion:", rErr);
          }
        }
      }

      // Delete participant doc
      await pDoc.ref.delete();
    }

    // 2. Delete room credentials if any
    try {
      await tournRef.collection("private").doc("roomDetails").delete();
    } catch (e) {}

    // 3. Delete resultSubmissions if any
    try {
      const resSnap = await tournRef.collection("resultSubmissions").get();
      for (const rDoc of resSnap.docs) {
        await rDoc.ref.delete();
      }
    } catch (e) {}

    // 4. Delete auditLogs and reports subcollections if any
    try {
      const auditSnap = await tournRef.collection("auditLogs").get();
      for (const aDoc of auditSnap.docs) {
        await aDoc.ref.delete();
      }
      const repSnap = await tournRef.collection("reports").get();
      for (const repDoc of repSnap.docs) {
        await repDoc.ref.delete();
      }
    } catch (e) {}

    // 5. Delete tournament document
    await tournRef.delete();

    // 6. Record admin audit log
    try {
      await db.collection("adminAuditLogs").add({
        adminId,
        action: "TOURNAMENT_PERMANENTLY_DELETED",
        details: {
          tournamentId: deletingTournId,
          tournamentTitle: tournTitle,
          status: tournData.status,
          autoRefundCount,
        },
        timestamp: now,
      });
    } catch (aErr) {}

    showToast(autoRefundCount > 0 
      ? `Tournament deleted! (${autoRefundCount} unrefunded players refunded ৳).` 
      : "Tournament deleted successfully!", "success");
    closeModal("modal-delete-tournament");
    await loadTournaments();

  } catch (err) {
    console.error("Delete tournament error:", err);
    showToast("Failed to delete tournament: " + err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Permanently Delete";
  }
}

// Navigation helpers
function navigateToPlayers(tournId) {
  const nav = document.querySelector('.nav-item[data-view="players"]');
  if (nav) nav.click();
  setTimeout(() => {
    const select = document.getElementById("players-tourn-select");
    if (select) {
      select.value = tournId;
      select.dispatchEvent(new Event("change"));
    }
  }, 200);
}

function navigateToRoom(tournId) {
  const nav = document.querySelector('.nav-item[data-view="room"]');
  if (nav) nav.click();
  setTimeout(() => {
    const select = document.getElementById("room-tourn-select");
    if (select) {
      select.value = tournId;
      select.dispatchEvent(new Event("change"));
    }
  }, 200);
}

document.addEventListener("DOMContentLoaded", () => {
  const createForm = document.getElementById("form-create-tournament");
  if (createForm) createForm.addEventListener("submit", handleCreateTournament);

  const editForm = document.getElementById("form-edit-tournament");
  if (editForm) editForm.addEventListener("submit", handleUpdateTournament);

  const confirmCancelBtn = document.getElementById("btn-confirm-cancel");
  if (confirmCancelBtn) confirmCancelBtn.addEventListener("click", handleConfirmCancelTournament);

  const confirmDeleteBtn = document.getElementById("btn-confirm-delete");
  if (confirmDeleteBtn) confirmDeleteBtn.addEventListener("click", handleConfirmDeleteTournament);
});

window.loadTournaments = loadTournaments;
window.filterTournaments = filterTournaments;
window.openEditTournamentModal = openEditTournamentModal;
window.openCancelTournamentModal = openCancelTournamentModal;
window.openDeleteTournamentModal = openDeleteTournamentModal;
window.navigateToPlayers = navigateToPlayers;
window.navigateToRoom = navigateToRoom;

