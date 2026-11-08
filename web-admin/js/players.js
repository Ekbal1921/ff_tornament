/**
 * Registered Players & Tournament Roster Module.
 */
let currentTournamentParticipants = [];

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
      if (tournId) {
        loadParticipantsForTournament(tournId);
      } else {
        document.getElementById("players-tbody").innerHTML = `<tr><td colspan="6" class="empty-state">Select a tournament to inspect registered players.</td></tr>`;
      }
    };

  } catch (err) {
    console.error("Players init error:", err);
  }
}

async function loadParticipantsForTournament(tournId) {
  const tbody = document.getElementById("players-tbody");
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="6" class="loading-container"><div class="loading-spinner"></div>Loading participants...</td></tr>`;

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

    renderPlayersTable(currentTournamentParticipants);

  } catch (err) {
    console.error("Error fetching participants:", err);
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">Failed to load participants: ${escapeHtml(err.message)}</td></tr>`;
  }
}

function renderPlayersTable(participants) {
  const tbody = document.getElementById("players-tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (participants.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6">
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
      <td><span class="badge badge-open" style="font-size: 13px;">SLOT #${p.slotNumber || "?"}</span></td>
      <td><strong>${escapeHtml(p.teamName || "Solo Player")}</strong></td>
      <td>${rosterHtml}</td>
      <td>৳ ${Number(p.entryFeePaid || 0).toLocaleString()}</td>
      <td>${formatTimestamp(p.joinedAt)}</td>
      <td><span class="badge ${p.status === 'CONFIRMED' ? 'badge-open' : 'badge-pending'}">${escapeHtml(p.status || "CONFIRMED")}</span></td>
    `;
    tbody.appendChild(tr);
  });
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

window.initPlayersModule = initPlayersModule;
window.filterPlayers = filterPlayers;
window.copyRosterToClipboard = copyRosterToClipboard;

