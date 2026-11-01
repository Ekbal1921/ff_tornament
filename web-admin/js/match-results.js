/**
 * Match Results & Prize Distribution Module.
 */
let resultsTournId = null;
let currentResultsParticipants = [];

async function initMatchResults() {
  const select = document.getElementById("results-tourn-select");
  if (!select) return;

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

async function loadMatchEvaluationSheet(tournId) {
  const panel = document.getElementById("results-evaluation-panel");
  panel.style.display = "block";

  const tbody = document.getElementById("results-tbody");
  tbody.innerHTML = `<tr><td colspan="7" class="loading-container"><div class="loading-spinner"></div>Loading participants...</td></tr>`;

  try {
    const [tournDoc, participantsSnap] = await Promise.all([
      db.collection("tournaments").document(tournId).get(),
      db.collection("tournaments").document(tournId).collection("participants").orderBy("slotNumber", "asc").get(),
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
    const reviewFn = functions.httpsCallable("adminReviewMatchResults");
    const res = await reviewFn({
      tournamentId: resultsTournId,
      matchResults,
    });

    showToast(res.data.message || "Match results published & prizes distributed!", "success");
    await loadMatchEvaluationSheet(resultsTournId);

  } catch (err) {
    console.error("Match result error:", err);
    showToast("Evaluation failed: " + err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Publish Results & Credit Player Wallets";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const publishBtn = document.getElementById("btn-publish-results");
  if (publishBtn) publishBtn.addEventListener("click", handlePublishMatchResults);
});

window.initMatchResults = initMatchResults;

