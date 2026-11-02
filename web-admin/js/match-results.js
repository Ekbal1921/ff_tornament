/**
 * Match Results & Prize Distribution Module.
 */
let resultsTournId = null;
let currentResultsParticipants = [];
let allMatchSubmissions = [];

async function initMatchResults() {
  const select = document.getElementById("results-tourn-select");
  if (select) {
    try {
      const snap = await db.collection("tournaments").orderBy("createdAt", "desc").get();
      select.innerHTML = `<option value="">-- Choose a Tournament to Evaluate --</option>`;

      snap.forEach((doc) => {
        const t = doc.data();
        select.innerHTML += `<option value="${doc.id}">${escapeHtml(t.title || "Match")} (${t.gameMode} - ${t.status})</option>`;
      });

      select.onchange = () => {
        resultsTournId = select.value;
        if (resultsTournId) {
          loadMatchEvaluationSheet(resultsTournId);
        } else {
          document.getElementById("results-evaluation-panel").style.display = "none";
        }
      };
    } catch (err) {
      console.error("Match results init error:", err);
    }
  }

  // Also load participant match claims queue
  await loadMatchSubmissions();
}

/**
 * PHASE 9: Load participant match claim submissions
 */
async function loadMatchSubmissions() {
  const tbody = document.getElementById("submissions-tbody");
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="7" class="loading-container"><div class="loading-spinner"></div>Loading submissions...</td></tr>`;

  try {
    const snap = await db.collection("matchSubmissions").orderBy("submittedAt", "desc").get();
    allMatchSubmissions = [];

    snap.forEach((doc) => {
      allMatchSubmissions.push({ id: doc.id, ...doc.data() });
    });

    filterSubmissions();
  } catch (err) {
    console.error("Error loading submissions:", err);
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">Failed to load claims: ${escapeHtml(err.message)}</td></tr>`;
  }
}

function filterSubmissions() {
  const search = (document.getElementById("submissions-search-input")?.value || "").toLowerCase().trim();
  const filter = document.getElementById("submissions-status-filter")?.value || "ALL";

  const filtered = allMatchSubmissions.filter((s) => {
    const matchesFilter = filter === "ALL" || s.status === filter;
    const matchesSearch = !search ||
      (s.ffName && s.ffName.toLowerCase().includes(search)) ||
      (s.ffUid && s.ffUid.toLowerCase().includes(search)) ||
      (s.userId && s.userId.toLowerCase().includes(search)) ||
      (s.tournamentTitle && s.tournamentTitle.toLowerCase().includes(search));
    return matchesFilter && matchesSearch;
  });

  renderMatchSubmissionsTable(filtered);
}

function renderMatchSubmissionsTable(subs) {
  const tbody = document.getElementById("submissions-tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (subs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">No match claims matching the selected filter.</td></tr>`;
    return;
  }

  subs.forEach((s) => {
    const tr = document.createElement("tr");

    let statusBadge = `<span class="badge badge-pending">PENDING</span>`;
    if (s.status === "APPROVED") {
      statusBadge = `<span class="badge badge-completed">APPROVED</span>`;
    } else if (s.status === "REJECTED") {
      statusBadge = `<span class="badge badge-rejected">REJECTED</span>`;
    }

    let submittedTime = "N/A";
    if (s.submittedAt && s.submittedAt.toDate) {
      submittedTime = s.submittedAt.toDate().toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" });
    }

    let evidenceHtml = `<span style="color: var(--text-muted); font-size: 11px;">None</span>`;
    if (s.evidenceUrl && s.evidenceUrl.startsWith("http")) {
      evidenceHtml = `<a href="${escapeHtml(s.evidenceUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm" style="font-size: 11px; padding: 3px 8px;">View Proof 🔗</a>`;
    } else if (s.evidenceUrl) {
      evidenceHtml = `<span style="font-size: 11px; color: var(--text-secondary); max-width: 140px; display: inline-block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(s.evidenceUrl)}</span>`;
    }

    let actionsHtml = "";
    if (s.status === "PENDING_REVIEW") {
      actionsHtml = `
        <div style="display: flex; gap: 6px;">
          <button class="btn btn-sm btn-success" onclick="openApproveSubmissionModal('${s.id}')" title="Verify kills and credit ৳10/kill">
            Verify &amp; Credit
          </button>
          <button class="btn btn-sm btn-danger" onclick="openRejectSubmissionModal('${s.id}')">
            Reject
          </button>
        </div>
      `;
    } else if (s.status === "APPROVED") {
      actionsHtml = `
        <div style="font-size: 12px; color: var(--accent-green); font-weight: 600;">
          Credited ৳${(s.rewardAmount || 0).toLocaleString()} (${s.verifiedKills || 0} kills)
        </div>
      `;
    } else if (s.status === "REJECTED") {
      actionsHtml = `
        <div style="font-size: 11px; color: var(--accent-red); max-width: 180px;">
          ${escapeHtml(s.rejectionReason || "Claim rejected")}
        </div>
      `;
    }

    tr.innerHTML = `
      <td>
        <strong>${escapeHtml(s.ffName || s.teamName || "Player")}</strong><br/>
        <span style="font-size: 11.5px; color: var(--text-muted);">FF UID: ${escapeHtml(s.ffUid || "N/A")}</span>
      </td>
      <td>
        <span style="font-weight: 500;">${escapeHtml(s.tournamentTitle || "Tournament")}</span><br/>
        <span style="font-size: 11px; color: var(--text-muted);">Slot #${s.slotNumber || 1}</span>
      </td>
      <td>
        <span style="font-weight: bold; color: var(--secondary-gold);">${s.claimedKills || 0} Kills</span> 
        <span style="font-size: 12px; color: var(--text-secondary);">(Rank #${s.claimedRank || 1})</span>
      </td>
      <td>${evidenceHtml}</td>
      <td style="font-size: 12px; color: var(--text-secondary);">${submittedTime}</td>
      <td>${statusBadge}</td>
      <td>${actionsHtml}</td>
    `;

    tbody.appendChild(tr);
  });
}

function openApproveSubmissionModal(id) {
  const sub = allMatchSubmissions.find((s) => s.id === id);
  if (!sub) return;

  document.getElementById("approve-sub-id").value = sub.id;
  document.getElementById("approve-sub-player").textContent = `${sub.ffName || "Player"} (FF UID: ${sub.ffUid || "N/A"})`;
  document.getElementById("approve-sub-tournament").textContent = sub.tournamentTitle || "Tournament";
  document.getElementById("approve-sub-claimed").textContent = `${sub.claimedKills || 0} Kills, Rank #${sub.claimedRank || 1}`;

  document.getElementById("approve-sub-kills").value = sub.claimedKills != null ? sub.claimedKills : 0;
  document.getElementById("approve-sub-rank").value = sub.claimedRank != null ? sub.claimedRank : 1;
  document.getElementById("approve-sub-rankprize").value = 0;
  document.getElementById("approve-sub-note").value = "";

  calculateSubRewardPreview();
  openModal("modal-approve-submission");
}

function calculateSubRewardPreview() {
  const kills = Math.max(0, parseInt(document.getElementById("approve-sub-kills")?.value || "0", 10));
  const rankPrize = Math.max(0, parseFloat(document.getElementById("approve-sub-rankprize")?.value || "0"));
  const perKillRate = 10; // Configured BDT 10 per verified kill

  const killReward = kills * perKillRate;
  const total = killReward + rankPrize;

  const previewEl = document.getElementById("approve-sub-calc-preview");
  if (previewEl) {
    previewEl.textContent = `৳${total.toFixed(2)} (${kills} kills × ৳${perKillRate}${rankPrize > 0 ? ` + ৳${rankPrize}` : ""})`;
  }
}

async function executeApproveSubmission(event) {
  event.preventDefault();

  const submissionId = document.getElementById("approve-sub-id").value;
  const verifiedKills = parseInt(document.getElementById("approve-sub-kills").value, 10);
  const verifiedRank = parseInt(document.getElementById("approve-sub-rank").value, 10);
  const rankPrize = parseFloat(document.getElementById("approve-sub-rankprize").value || "0");
  const moderatorNotes = document.getElementById("approve-sub-note").value;

  const btn = document.getElementById("btn-confirm-approve-sub");
  btn.disabled = true;
  btn.textContent = "Crediting Wallet...";

  try {
    await approveMatchSubmissionDirectFallback(submissionId, verifiedKills, verifiedRank, rankPrize, moderatorNotes);
    showToast(`Approved! Credited verified kill rewards to player wallet.`, "success");

    closeModal("modal-approve-submission");
    await loadMatchSubmissions();
    if (window.initDashboard) window.initDashboard();
  } catch (err) {
    console.error("Approve error:", err);
    showToast("Approval failed: " + err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Confirm & Credit Wallet";
  }
}

function openRejectSubmissionModal(id) {
  const sub = allMatchSubmissions.find((s) => s.id === id);
  if (!sub) return;

  document.getElementById("reject-sub-id").value = sub.id;
  document.getElementById("reject-sub-player").textContent = `${sub.ffName || "Player"} (FF UID: ${sub.ffUid || "N/A"})`;
  document.getElementById("reject-sub-tournament").textContent = sub.tournamentTitle || "Tournament";
  document.getElementById("reject-sub-reason").value = "";
  document.getElementById("reject-sub-reason-preset").value = "";

  openModal("modal-reject-submission");
}

function setRejectReasonPreset() {
  const preset = document.getElementById("reject-sub-reason-preset").value;
  if (preset) {
    document.getElementById("reject-sub-reason").value = preset;
  }
}

async function executeRejectSubmission(event) {
  event.preventDefault();

  const submissionId = document.getElementById("reject-sub-id").value;
  const reason = document.getElementById("reject-sub-reason").value.trim();

  if (!reason) {
    showToast("Please provide a rejection reason.", "error");
    return;
  }

  const btn = document.getElementById("btn-confirm-reject-sub");
  btn.disabled = true;
  btn.textContent = "Rejecting...";

  try {
    await rejectMatchSubmissionDirectFallback(submissionId, reason);
    showToast("Match claim rejected and reason recorded.", "info");

    closeModal("modal-reject-submission");
    await loadMatchSubmissions();
  } catch (err) {
    console.error("Reject error:", err);
    showToast("Rejection failed: " + err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Confirm Rejection";
  }
}

async function loadMatchEvaluationSheet(tournId) {
  const panel = document.getElementById("results-evaluation-panel");
  panel.style.display = "block";

  const tbody = document.getElementById("results-tbody");
  tbody.innerHTML = `<tr><td colspan="7" class="loading-container"><div class="loading-spinner"></div>Loading participants...</td></tr>`;

  try {
    const [tournDoc, participantsSnap] = await Promise.all([
      db.collection("tournaments").doc(tournId).get(),
      db.collection("tournaments").doc(tournId).collection("participants").orderBy("slotNumber", "asc").get(),
    ]);

    if (!tournDoc.exists) {
      tbody.innerHTML = `<tr><td colspan="7" class="empty-state">Tournament not found.</td></tr>`;
      return;
    }

    const tData = tournDoc.data();
    currentResultsParticipants = [];

    participantsSnap.forEach((doc) => {
      currentResultsParticipants.push({ id: doc.id, ...doc.data() });
    });

    const isAlreadyCompleted = tData.status === "Completed";
    const statusNote = document.getElementById("results-status-note");
    if (statusNote) {
      if (isAlreadyCompleted) {
        statusNote.innerHTML = `<span class="badge badge-completed">ALREADY COMPLETED & DISTRIBUTED</span>`;
      } else {
        statusNote.innerHTML = `<span class="badge badge-open">READY FOR EVALUATION</span>`;
      }
    }

    renderResultsTable(currentResultsParticipants, isAlreadyCompleted);

  } catch (err) {
    console.error("Error loading evaluation sheet:", err);
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">Failed to load data: ${escapeHtml(err.message)}</td></tr>`;
  }
}

function renderResultsTable(participants, isCompleted) {
  const tbody = document.getElementById("results-tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (participants.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">No participants registered in this tournament.</td></tr>`;
    return;
  }

  participants.forEach((p, index) => {
    let igns = "";
    if (Array.isArray(p.players)) {
      igns = p.players.map(pl => `${pl.freeFireName} (${pl.freeFireUid})`).join(", ");
    }

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>SLOT #${p.slotNumber || (index + 1)}</strong></td>
      <td><strong>${escapeHtml(p.teamName || "Team")}</strong></td>
      <td style="font-size: 12px; color: var(--text-secondary);">${escapeHtml(igns)}</td>
      <td>
        <input 
          type="number" 
          class="form-control result-rank-input" 
          data-user-id="${p.userId}" 
          data-slot="${p.slotNumber}" 
          placeholder="Rank (e.g. 1)" 
          min="1" 
          max="50" 
          value="${index === 0 ? 1 : (index === 1 ? 2 : (index === 2 ? 3 : index + 1))}"
          ${isCompleted ? "disabled" : ""}
          style="width: 80px;"
        />
      </td>
      <td>
        <input 
          type="number" 
          class="form-control result-kills-input" 
          data-user-id="${p.userId}" 
          placeholder="0" 
          min="0" 
          value="0"
          ${isCompleted ? "disabled" : ""}
          style="width: 80px;"
        />
      </td>
      <td>
        <input 
          type="number" 
          class="form-control result-prize-input" 
          data-user-id="${p.userId}" 
          placeholder="৳ Amount" 
          min="0" 
          value="${index === 0 ? 300 : (index === 1 ? 150 : (index === 2 ? 50 : 0))}"
          ${isCompleted ? "disabled" : ""}
          style="width: 110px;"
        />
      </td>
      <td>
        <span class="badge ${isCompleted ? 'badge-completed' : 'badge-pending'}">${isCompleted ? 'PAID' : 'PENDING'}</span>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

async function handlePublishMatchResults() {
  if (!resultsTournId) return;

  const rows = document.querySelectorAll("#results-tbody tr");
  if (rows.length === 0) return;

  const matchResults = [];

  rows.forEach((row) => {
    const rankInput = row.querySelector(".result-rank-input");
    const killsInput = row.querySelector(".result-kills-input");
    const prizeInput = row.querySelector(".result-prize-input");

    if (rankInput && killsInput && prizeInput) {
      const userId = rankInput.getAttribute("data-user-id");
      const slotNumber = Number(rankInput.getAttribute("data-slot") || 0);
      const rank = Number(rankInput.value || 0);
      const kills = Number(killsInput.value || 0);
      const prizeAmount = Number(prizeInput.value || 0);

      matchResults.push({
        userId,
        slotNumber,
        rank,
        kills,
        prizeAmount,
      });
    }
  });

  const totalPrizeDistributing = matchResults.reduce((sum, r) => sum + r.prizeAmount, 0);

  const confirmed = confirm(
    `CONFIRM PRIZE DISTRIBUTION:\n\n` +
    `Total Winners to Credit: ${matchResults.filter(r => r.prizeAmount > 0).length}\n` +
    `Total Amount: ৳ ${totalPrizeDistributing.toLocaleString()}\n\n` +
    `This will atomically credit players' wallets, create transactions, and mark tournament Completed. Proceed?`
  );

  if (!confirmed) return;

  const btn = document.getElementById("btn-publish-results");
  btn.disabled = true;
  btn.textContent = "Processing Winnings...";

  try {
    await publishMatchResultsDirectFallback(resultsTournId, matchResults);
    showToast("Match results evaluated & player prizes credited!", "success");

    await loadMatchEvaluationSheet(resultsTournId);
    if (window.initDashboard) window.initDashboard();

  } catch (err) {
    console.error("Match result error:", err);
    showToast("Evaluation failed: " + err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Publish Results & Credit Player Wallets";
  }
}

/**
 * DIRECT FIRESTORE FALLBACK: Approve Match Submission & Credit Kill Reward (৳10/kill)
 */
async function approveMatchSubmissionDirectFallback(submissionId, verifiedKills, verifiedRank, rankPrize, moderatorNotes) {
  const submissionRef = db.collection("matchSubmissions").doc(submissionId);
  const now = firebase.firestore.FieldValue.serverTimestamp();
  const adminId = (currentAdminUser && currentAdminUser.uid) || (auth.currentUser && auth.currentUser.uid) || "admin";

  return db.runTransaction(async (transaction) => {
    const subDoc = await transaction.get(submissionRef);
    if (!subDoc.exists) throw new Error("Match submission not found.");

    const subData = subDoc.data();
    if (subData.status !== "PENDING_REVIEW") {
      throw new Error(`Submission is already ${subData.status}.`);
    }

    const tournId = subData.tournamentId;
    const targetUserId = subData.userId;
    const tournSubRef = db.collection("tournaments").doc(tournId).collection("resultSubmissions").doc(targetUserId);

    const vKills = Number(verifiedKills != null ? verifiedKills : subData.claimedKills || 0);
    const vRank = Number(verifiedRank != null ? verifiedRank : subData.claimedRank || 1);
    const rPrize = Math.max(0, Number(rankPrize || 0));

    const perKillRate = Number(subData.rewardPerKill || 10);
    const killRewardAmount = vKills * perKillRate;
    const totalRewardAmount = killRewardAmount + rPrize;
    const totalRewardInPaisa = Math.round(totalRewardAmount * 100);

    const walletRef = db.collection("wallets").doc(targetUserId);
    const walletDoc = await transaction.get(walletRef);
    const wData = walletDoc.exists ? walletDoc.data() : {};

    const curBalPaisa = Math.round(Number(wData.balanceInPaisa != null ? wData.balanceInPaisa : (wData.balance || 0) * 100));
    const curWinPaisa = Math.round(Number(wData.winningBalanceInPaisa != null ? wData.winningBalanceInPaisa : (wData.winningBalance || 0) * 100));
    const curTotalWinPaisa = Math.round(Number(wData.totalWinningsInPaisa != null ? wData.totalWinningsInPaisa : (wData.totalWinnings || 0) * 100));

    const newBalPaisa = curBalPaisa + totalRewardInPaisa;
    const newWinPaisa = curWinPaisa + totalRewardInPaisa;
    const newTotalWinPaisa = curTotalWinPaisa + totalRewardInPaisa;

    transaction.set(walletRef, {
      userId: targetUserId,
      balanceInPaisa: newBalPaisa,
      winningBalanceInPaisa: newWinPaisa,
      totalWinningsInPaisa: newTotalWinPaisa,
      balance: newBalPaisa / 100.0,
      winningBalance: newWinPaisa / 100.0,
      totalWinnings: newTotalWinPaisa / 100.0,
      updatedAt: now,
    }, { merge: true });

    const approvedData = {
      status: "APPROVED",
      verifiedKills: vKills,
      verifiedRank: vRank,
      perKillReward: perKillRate,
      killRewardAmount,
      rankPrizeAmount: rPrize,
      rewardAmount: totalRewardAmount,
      rewardInPaisa: totalRewardInPaisa,
      moderatorId: adminId,
      moderatorNotes: moderatorNotes || "",
      reviewedAt: now,
      updatedAt: now,
    };

    transaction.update(submissionRef, approvedData);
    transaction.set(tournSubRef, approvedData, { merge: true });

    if (totalRewardInPaisa > 0) {
      const txRef = walletRef.collection("transactions").doc();
      const globalTxRef = db.collection("transactions").doc(txRef.id);
      const ledgerRef = db.collection("ledgerEntries").doc(txRef.id);

      const idempotencyKey = `reward_${submissionId}`;
      const txPayload = {
        transactionId: txRef.id,
        idempotencyKey,
        userId: targetUserId,
        type: "REWARD_CREDIT",
        amountInPaisa: totalRewardInPaisa,
        amount: totalRewardAmount,
        balanceBeforeInPaisa: curBalPaisa,
        balanceAfterInPaisa: newBalPaisa,
        tournamentId: tournId,
        tournamentTitle: subData.tournamentTitle || "Tournament",
        verifiedKills: vKills,
        verifiedRank: vRank,
        status: "CONFIRMED",
        description: `Verified Match Reward: ${vKills} kills (৳${perKillRate}/kill)${rPrize > 0 ? ` + ৳${rPrize} Rank Prize` : ""}`,
        timestamp: now,
      };

      transaction.set(txRef, txPayload);
      transaction.set(globalTxRef, txPayload);
      transaction.set(ledgerRef, txPayload);
    }

    const auditRef = db.collection("adminAuditLogs").doc();
    transaction.set(auditRef, {
      adminId,
      action: "MATCH_SUBMISSION_REVIEWED",
      targetId: submissionId,
      details: { decision: "APPROVE", verifiedKills: vKills, verifiedRank: vRank, rewardAmount: totalRewardAmount },
      timestamp: now,
    });
  });
}

/**
 * DIRECT FIRESTORE FALLBACK: Reject Match Submission
 */
async function rejectMatchSubmissionDirectFallback(submissionId, reason) {
  const submissionRef = db.collection("matchSubmissions").doc(submissionId);
  const now = firebase.firestore.FieldValue.serverTimestamp();
  const adminId = (currentAdminUser && currentAdminUser.uid) || (auth.currentUser && auth.currentUser.uid) || "admin";

  const subDoc = await submissionRef.get();
  if (!subDoc.exists) throw new Error("Match submission not found.");
  const subData = subDoc.data();

  const updateData = {
    status: "REJECTED",
    rejectionReason: reason,
    moderatorId: adminId,
    reviewedAt: now,
    updatedAt: now,
  };

  await submissionRef.update(updateData);
  if (subData.tournamentId && subData.userId) {
    const tournSubRef = db.collection("tournaments").doc(subData.tournamentId).collection("resultSubmissions").doc(subData.userId);
    await tournSubRef.set(updateData, { merge: true });
  }

  await db.collection("adminAuditLogs").add({
    adminId,
    action: "MATCH_SUBMISSION_REVIEWED",
    targetId: submissionId,
    details: { decision: "REJECT", reason },
    timestamp: now,
  });
}

/**
 * DIRECT FIRESTORE FALLBACK: Publish Match Results & Bulk Prize Distribution
 */
async function publishMatchResultsDirectFallback(tournamentId, matchResults) {
  const tournRef = db.collection("tournaments").doc(tournamentId);
  const now = firebase.firestore.FieldValue.serverTimestamp();
  const adminId = (currentAdminUser && currentAdminUser.uid) || (auth.currentUser && auth.currentUser.uid) || "admin";

  return db.runTransaction(async (transaction) => {
    const tournDoc = await transaction.get(tournRef);
    if (!tournDoc.exists) throw new Error("Tournament not found.");
    const tData = tournDoc.data();

    transaction.update(tournRef, {
      status: "Completed",
      completedAt: now,
      evaluatedByAdminId: adminId,
    });

    const resultsRef = tournRef.collection("results").doc("matchSummary");
    transaction.set(resultsRef, {
      tournamentId,
      results: matchResults,
      evaluatedAt: now,
      evaluatedByAdminId: adminId,
    });

    for (const r of matchResults) {
      const prize = Number(r.prizeAmount || 0);
      const prizeInPaisa = Math.round(prize * 100);

      if (prizeInPaisa > 0 && r.userId) {
        const walletRef = db.collection("wallets").doc(r.userId);
        const walletDoc = await transaction.get(walletRef);
        const wData = walletDoc.exists ? walletDoc.data() : {};

        const curBalPaisa = Math.round(Number(wData.balanceInPaisa != null ? wData.balanceInPaisa : (wData.balance || 0) * 100));
        const curWinPaisa = Math.round(Number(wData.winningBalanceInPaisa != null ? wData.winningBalanceInPaisa : (wData.winningBalance || 0) * 100));
        const curTotalWinPaisa = Math.round(Number(wData.totalWinningsInPaisa != null ? wData.totalWinningsInPaisa : (wData.totalWinnings || 0) * 100));

        const newBalPaisa = curBalPaisa + prizeInPaisa;
        const newWinPaisa = curWinPaisa + prizeInPaisa;
        const newTotalWinPaisa = curTotalWinPaisa + prizeInPaisa;

        transaction.set(walletRef, {
          userId: r.userId,
          balanceInPaisa: newBalPaisa,
          winningBalanceInPaisa: newWinPaisa,
          totalWinningsInPaisa: newTotalWinPaisa,
          balance: newBalPaisa / 100.0,
          winningBalance: newWinPaisa / 100.0,
          totalWinnings: newTotalWinPaisa / 100.0,
          updatedAt: now,
        }, { merge: true });

        const txRef = walletRef.collection("transactions").doc();
        const globalTxRef = db.collection("transactions").doc(txRef.id);
        const ledgerRef = db.collection("ledgerEntries").doc(txRef.id);

        const idempotencyKey = `win_${tournamentId}_${r.userId}`;
        const txPayload = {
          transactionId: txRef.id,
          idempotencyKey,
          userId: r.userId,
          type: "REWARD_CREDIT",
          amountInPaisa: prizeInPaisa,
          amount: prize,
          balanceBeforeInPaisa: curBalPaisa,
          balanceAfterInPaisa: newBalPaisa,
          tournamentId,
          tournamentTitle: tData.title || "Match",
          rank: r.rank || 0,
          kills: r.kills || 0,
          status: "CONFIRMED",
          description: `Reward prize for Rank #${r.rank || 1} in ${tData.title || "Tournament"}`,
          timestamp: now,
        };

        transaction.set(txRef, txPayload);
        transaction.set(globalTxRef, txPayload);
        transaction.set(ledgerRef, txPayload);
      }
    }

    const auditRef = db.collection("adminAuditLogs").doc();
    transaction.set(auditRef, {
      adminId,
      action: "MATCH_RESULTS_PUBLISHED",
      targetId: tournamentId,
      details: { winnersCount: matchResults.filter(r => (r.prizeAmount || 0) > 0).length },
      timestamp: now,
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const publishBtn = document.getElementById("btn-publish-results");
  if (publishBtn) publishBtn.addEventListener("click", handlePublishMatchResults);
});

window.initMatchResults = initMatchResults;
window.loadMatchSubmissions = loadMatchSubmissions;
window.filterSubmissions = filterSubmissions;
window.openApproveSubmissionModal = openApproveSubmissionModal;
window.calculateSubRewardPreview = calculateSubRewardPreview;
window.executeApproveSubmission = executeApproveSubmission;
window.openRejectSubmissionModal = openRejectSubmissionModal;
window.setRejectReasonPreset = setRejectReasonPreset;
window.executeRejectSubmission = executeRejectSubmission;

