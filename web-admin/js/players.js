/**
 * Registered Players & Tournament Roster Module.
 */
let currentTournamentParticipants = [];
let selectedParticipantUids = new Set();

async function initPlayersModule() {
  const select = document.getElementById("players-tourn-select");
  if (!select) return;

  try {
    const snap = await db.collection("tournaments").orderBy("createdAt", "desc").get();
    select.innerHTML = `<option value="">-- Choose a Tournament --</option>`;

    snap.forEach((doc) => {
      const t = doc.data();
      select.innerHTML += `<option value="${doc.id}">${escapeHtml(t.title || "Match")} (${t.gameMode} - ${t.status})</option>`;
    });

    select.onchange = () => {
      const tournId = select.value;
      selectedParticipantUids.clear();
      updateParticipantSelectionUI();
      if (tournId) {
        loadParticipantsForTournament(tournId);
      } else {
        currentTournamentParticipants = [];
        updateJoinedPlayersCount(0);
        document.getElementById("players-tbody").innerHTML = `<tr><td colspan="8" class="empty-state">Select a tournament to inspect registered players.</td></tr>`;
      }
    };

  } catch (err) {
    console.error("Players init error:", err);
  }
}

async function loadParticipantsForTournament(tournId) {
  const tbody = document.getElementById("players-tbody");
  if (!tbody) return;

  selectedParticipantUids.clear();
  updateParticipantSelectionUI();
  tbody.innerHTML = `<tr><td colspan="8" class="loading-container"><div class="loading-spinner"></div>Loading participants...</td></tr>`;

  try {
    const snap = await db.collection("tournaments")
      .doc(tournId)
      .collection("participants")
      .orderBy("slotNumber", "asc")
      .get();

    currentTournamentParticipants = [];
    snap.forEach((doc) => {
      currentTournamentParticipants.push({ id: doc.id, ...doc.data() });
    });

    updateJoinedPlayersCount(currentTournamentParticipants.length);
    renderPlayersTable(currentTournamentParticipants);

  } catch (err) {
    console.error("Error fetching participants:", err);
    updateJoinedPlayersCount(0);
    tbody.innerHTML = `<tr><td colspan="8" class="empty-state">Failed to load participants: ${escapeHtml(err.message)}</td></tr>`;
  }
}

function updateJoinedPlayersCount(count) {
  const countEl = document.getElementById("txt-joined-count");
  if (countEl) countEl.textContent = count;
  const btnNotify = document.getElementById("btn-notify-match-players");
  if (btnNotify) {
    btnNotify.disabled = (count === 0);
  }
}

function handleParticipantCheckChange(uid, isChecked) {
  if (isChecked) {
    selectedParticipantUids.add(uid);
  } else {
    selectedParticipantUids.delete(uid);
  }
  updateParticipantSelectionUI();
}

function toggleSelectAllParticipants(isChecked) {
  const checkboxes = document.querySelectorAll(".participant-row-check");
  checkboxes.forEach((cb) => {
    cb.checked = isChecked;
    if (isChecked) {
      selectedParticipantUids.add(cb.value);
    } else {
      selectedParticipantUids.delete(cb.value);
    }
  });
  updateParticipantSelectionUI();
}

function updateParticipantSelectionUI() {
  const count = selectedParticipantUids.size;
  const countEl = document.getElementById("txt-selected-players-count");
  if (countEl) countEl.textContent = count;
  const btn = document.getElementById("btn-notify-selected-players");
  if (btn) btn.disabled = (count === 0);

  const selectAllCb = document.getElementById("participants-select-all");
  const visibleCbs = document.querySelectorAll(".participant-row-check");
  if (selectAllCb) {
    selectAllCb.checked = (visibleCbs.length > 0 && Array.from(visibleCbs).every(cb => cb.checked));
  }
}

function renderPlayersTable(participants) {
  const tbody = document.getElementById("players-tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (participants.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8">
          <div class="empty-state">
            <div class="empty-icon">👥</div>
            <div class="empty-title">No Players Registered</div>
            <div class="empty-desc">Slots are currently open for registration.</div>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  participants.forEach((p) => {
    const uid = p.userId || p.id || "";
    const isChecked = selectedParticipantUids.has(uid);
    let rosterHtml = "";
    if (Array.isArray(p.players)) {
      rosterHtml = p.players.map((pl, idx) => `
        <div style="margin-bottom: 4px; font-size: 12px;">
          <span style="color: var(--secondary); font-weight: 600;">[P${idx + 1}]</span> 
          <strong>${escapeHtml(pl.freeFireName || "Unknown")}</strong> 
          <span style="color: var(--text-muted); font-family: monospace;">(UID: ${escapeHtml(pl.freeFireUid || "N/A")})</span>
          ${pl.isCaptain ? `<span class="badge badge-upcoming" style="font-size: 9px; padding: 1px 4px;">CAPTAIN</span>` : ""}
        </div>
      `).join("");
    } else {
      rosterHtml = `<span style="color: var(--text-muted);">No player info recorded</span>`;
    }

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="text-align: center;">
        <input type="checkbox" class="participant-row-check" value="${escapeHtml(uid)}" ${isChecked ? "checked" : ""} onchange="handleParticipantCheckChange('${escapeHtml(uid)}', this.checked)" style="cursor: pointer; width: 16px; height: 16px;">
      </td>
      <td><span class="badge badge-open" style="font-size: 13px;">SLOT #${p.slotNumber || "?"}</span></td>
      <td><strong>${escapeHtml(p.teamName || "Solo Player")}</strong></td>
      <td>${rosterHtml}</td>
      <td>৳ ${Number(p.entryFeePaid || 0).toLocaleString()}</td>
      <td>${formatTimestamp(p.joinedAt)}</td>
      <td><span class="badge ${p.status === 'CONFIRMED' ? 'badge-open' : 'badge-pending'}">${escapeHtml(p.status || "CONFIRMED")}</span></td>
      <td>
        <button class="btn btn-secondary btn-sm" onclick="notifySinglePlayer('${escapeHtml(uid)}', '${escapeHtml(p.teamName || 'Player')}')" title="Send push notification to this player" style="padding: 4px 8px; font-size: 11px;">
          📢 Notify
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
  updateParticipantSelectionUI();
}

function filterPlayers() {
  const query = document.getElementById("player-search-input")?.value.toLowerCase().trim() || "";
  if (!query) {
    renderPlayersTable(currentTournamentParticipants);
    return;
  }

  const filtered = currentTournamentParticipants.filter((p) => {
    const slotMatch = String(p.slotNumber) === query;
    const teamMatch = p.teamName && p.teamName.toLowerCase().includes(query);
    let playerMatch = false;
    if (Array.isArray(p.players)) {
      playerMatch = p.players.some(pl => 
        (pl.freeFireName && pl.freeFireName.toLowerCase().includes(query)) ||
        (pl.freeFireUid && pl.freeFireUid.includes(query))
      );
    }
    return slotMatch || teamMatch || playerMatch;
  });

  renderPlayersTable(filtered);
}

function copyRosterToClipboard() {
  if (currentTournamentParticipants.length === 0) {
    showToast("No participant data to copy.", "warning");
    return;
  }

  let text = "=== TOURNAMENT ROSTER MANIFEST ===\n";
  currentTournamentParticipants.forEach((p) => {
    text += `\n[SLOT #${p.slotNumber}] Team: ${p.teamName || "N/A"}\n`;
    if (Array.isArray(p.players)) {
      p.players.forEach((pl, idx) => {
        text += `  P${idx + 1}: ${pl.freeFireName} (Free Fire UID: ${pl.freeFireUid})\n`;
      });
    }
  });

  navigator.clipboard.writeText(text).then(() => {
    showToast("Roster copied to clipboard for Free Fire custom room check!", "success");
  }).catch((e) => {
    showToast("Clipboard copy failed: " + e.message, "error");
  });
}

/**
 * Dispatch Push Notification specifically to all players who joined this match
 */
function notifyTournamentJoinedPlayers() {
  const select = document.getElementById("players-tourn-select");
  const tournId = select ? select.value : "";
  if (!tournId) {
    if (window.showToast) window.showToast("Please choose a tournament first!", "warning");
    return;
  }

  if (!currentTournamentParticipants || currentTournamentParticipants.length === 0) {
    if (window.showToast) window.showToast("No players have joined this tournament yet.", "warning");
    return;
  }

  const tournTitle = select.options[select.selectedIndex]?.text || "Tournament Match";
  const joinedUids = [...new Set(currentTournamentParticipants.map((p) => p.userId || p.id).filter(Boolean))];

  if (joinedUids.length === 0) {
    if (window.showToast) window.showToast("No valid player UIDs found for this tournament.", "warning");
    return;
  }

  if (window.openSendNotificationModal) {
    window.openSendNotificationModal(joinedUids.join(","), `${tournTitle} (${joinedUids.length} Joined)`, "SELECTED");

    // Pre-fill fields for conveniency
    const typeSel = document.getElementById("notify-type");
    if (typeSel) typeSel.value = "ROOM_AVAILABLE";

    const titleInput = document.getElementById("notify-title");
    if (titleInput) titleInput.value = `🔑 Room Credentials & Alert: ${tournTitle}`;

    const msgInput = document.getElementById("notify-message");
    if (msgInput) {
      msgInput.value = `Attention Fighters! The custom room details or schedule for ${tournTitle} have been updated. Open your Arena app now to view room ID and password!`;
    }
  } else {
    if (window.showToast) window.showToast("Notification dispatcher modal not available.", "error");
  }
}

/**
 * Dispatch Push Notification strictly to marked/selected players in this match
 */
function notifySelectedTournamentPlayers() {
  if (selectedParticipantUids.size === 0) {
    if (window.showToast) window.showToast("Please mark at least one player to notify.", "warning");
    return;
  }
  const select = document.getElementById("players-tourn-select");
  const tournTitle = (select && select.options[select.selectedIndex]?.text) || "Tournament Match";
  const selectedUids = Array.from(selectedParticipantUids);

  if (window.openSendNotificationModal) {
    window.openSendNotificationModal(
      selectedUids.join(","),
      `${tournTitle} (${selectedUids.length} Selected Players ONLY)`,
      "SELECTED"
    );

    const typeSel = document.getElementById("notify-type");
    if (typeSel) typeSel.value = "ROOM_AVAILABLE";

    const titleInput = document.getElementById("notify-title");
    if (titleInput) titleInput.value = `🔑 Room Credentials & Alert: ${tournTitle}`;

    const msgInput = document.getElementById("notify-message");
    if (msgInput) {
      msgInput.value = `Attention Fighter! The custom room details or schedule for ${tournTitle} have been updated. Open your Arena app now to view room ID and password!`;
    }
  } else {
    if (window.showToast) window.showToast("Notification dispatcher modal not available.", "error");
  }
}

/**
 * Dispatch Push Notification to a single joined player/team
 */
function notifySinglePlayer(userId, name) {
  if (!userId) {
    if (window.showToast) window.showToast("Player UID not available.", "warning");
    return;
  }

  if (window.openSendNotificationModal) {
    window.openSendNotificationModal(userId, name || "Tournament Player", "SINGLE");

    const typeSel = document.getElementById("notify-type");
    if (typeSel) typeSel.value = "ROOM_AVAILABLE";

    const titleInput = document.getElementById("notify-title");
    if (titleInput) titleInput.value = `Match Alert for ${name || "Player"}`;

    const msgInput = document.getElementById("notify-message");
    if (msgInput) {
      msgInput.value = `Hello ${name || "Player"}! Please check your tournament schedule and room credentials in the app.`;
    }
  } else {
    if (window.showToast) window.showToast("Notification dispatcher modal not available.", "error");
  }
}

window.initPlayersModule = initPlayersModule;
window.filterPlayers = filterPlayers;
window.copyRosterToClipboard = copyRosterToClipboard;
window.handleParticipantCheckChange = handleParticipantCheckChange;
window.toggleSelectAllParticipants = toggleSelectAllParticipants;
window.notifySelectedTournamentPlayers = notifySelectedTournamentPlayers;
window.notifyTournamentJoinedPlayers = notifyTournamentJoinedPlayers;
window.notifySinglePlayer = notifySinglePlayer;

