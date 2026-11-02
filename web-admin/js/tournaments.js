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
          ` : ''}
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
  document.getElementById("cancel-tourn-id-display").textContent = id;
  openModal("modal-cancel-tournament");
}

async function handleConfirmCancelTournament() {
  if (!cancellingTournId) return;

  const reason = document.getElementById("cancel-reason-input").value.trim();
  const btn = document.getElementById("btn-confirm-cancel");
  btn.disabled = true;
  btn.textContent = "Cancelling...";

  try {
    const now = firebase.firestore.FieldValue.serverTimestamp();
    await db.collection("tournaments").doc(cancellingTournId).update({
      status: "Cancelled",
      cancellationReason: reason || "Cancelled by administrator.",
      cancelledAt: now,
      updatedAt: now,
    });

    showToast("Tournament cancelled.", "warning");
    closeModal("modal-cancel-tournament");
    await loadTournaments();

  } catch (err) {
    console.error("Cancel tournament error:", err);
    showToast("Failed to cancel tournament: " + err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Confirm Cancellation";
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
});

window.loadTournaments = loadTournaments;
window.filterTournaments = filterTournaments;
window.openEditTournamentModal = openEditTournamentModal;
window.openCancelTournamentModal = openCancelTournamentModal;
window.navigateToPlayers = navigateToPlayers;
window.navigateToRoom = navigateToRoom;

