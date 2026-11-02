/**
 * Free Fire Custom Room Manager Module.
 */
let selectedRoomTournament = null;

async function initRoomManager() {
  const select = document.getElementById("room-tourn-select");
  if (!select) return;

  try {
    const snap = await db.collection("tournaments").orderBy("createdAt", "desc").get();
    select.innerHTML = `<option value="">-- Choose a Tournament --</option>`;

    snap.forEach((doc) => {
      const t = doc.data();
      select.innerHTML += `<option value="${doc.id}">${escapeHtml(t.title || "Match")} (${t.status})</option>`;
    });

    select.onchange = () => {
      const tournId = select.value;
      if (tournId) {
        selectedRoomTournament = snap.docs.find(d => d.id === tournId)?.data() || null;
        loadRoomDetails(tournId);
      } else {
        document.getElementById("room-details-card").style.display = "none";
      }
    };

  } catch (err) {
    console.error("Room manager init error:", err);
  }
}

async function loadRoomDetails(tournId) {
  const card = document.getElementById("room-details-card");
  card.style.display = "block";

  const statusBadge = document.getElementById("room-status-badge");
  const roomIdInput = document.getElementById("room-id-input");
  const roomPassInput = document.getElementById("room-pass-input");
  const roomInstructionsInput = document.getElementById("room-instructions-input");
  const currentRoomInfo = document.getElementById("current-room-info-display");

  statusBadge.className = "badge badge-pending";
  statusBadge.textContent = "CHECKING...";

  try {
    const doc = await db.collection("tournaments")
      .doc(tournId)
      .collection("private")
      .doc("roomDetails")
      .get();

    if (doc.exists) {
      const r = doc.data();
      roomIdInput.value = r.roomId || "";
      roomPassInput.value = r.roomPassword || "";
      roomInstructionsInput.value = r.instructions || "";

      let isReleased = true;
      if (r.releaseTime) {
        const releaseDate = r.releaseTime.toDate ? r.releaseTime.toDate() : new Date(r.releaseTime);
        isReleased = new Date() >= releaseDate;
      }

      let isExpired = false;
      if (r.expiryTime) {
        const expiryDate = r.expiryTime.toDate ? r.expiryTime.toDate() : new Date(r.expiryTime);
        isExpired = new Date() > expiryDate;
      }

      if (isExpired) {
        statusBadge.className = "badge badge-cancelled";
        statusBadge.textContent = "EXPIRED";
      } else if (isReleased) {
        statusBadge.className = "badge badge-open";
        statusBadge.textContent = "LIVE / UNLOCKED";
      } else {
        statusBadge.className = "badge badge-upcoming";
        statusBadge.textContent = "SCHEDULED / LOCKED";
      }

      currentRoomInfo.innerHTML = `
        <div style="background: var(--bg-input); padding: 14px; border-radius: var(--radius-sm); border: 1px solid var(--border-color); margin-bottom: 18px;">
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; font-size: 13px;">
            <div><span style="color: var(--text-muted);">Current Room ID:</span> <strong style="color: var(--primary);">${escapeHtml(r.roomId)}</strong></div>
            <div><span style="color: var(--text-muted);">Current Password:</span> <strong style="color: var(--secondary);">${escapeHtml(r.roomPassword)}</strong></div>
            <div><span style="color: var(--text-muted);">Release Time:</span> ${formatTimestamp(r.releaseTime)}</div>
            <div><span style="color: var(--text-muted);">Expiry Time:</span> ${formatTimestamp(r.expiryTime)}</div>
          </div>
        </div>
      `;

    } else {
      statusBadge.className = "badge badge-full";
      statusBadge.textContent = "NOT CONFIGURED";
      roomIdInput.value = "";
      roomPassInput.value = "";
      roomInstructionsInput.value = "1. Open Free Fire -> Custom -> Join Room.\n2. Enter Room ID & Password.\n3. Sit in your designated Slot number.\n4. Strictly no emulators or teaming allowed.";
      currentRoomInfo.innerHTML = `
        <div style="background: var(--bg-input); padding: 12px; border-radius: var(--radius-sm); border: 1px dashed var(--border-color); margin-bottom: 18px; color: var(--text-secondary); font-size: 13px;">
          ℹ️ No room credentials configured yet for this tournament. Enter Room ID and Password below.
        </div>
      `;
    }

  } catch (err) {
    console.error("Error loading room details:", err);
    showToast("Error checking room details: " + err.message, "error");
  }
}

async function handleSaveRoomCredentials(e) {
  e.preventDefault();
  const select = document.getElementById("room-tourn-select");
  const tournId = select?.value;

  if (!tournId) {
    showToast("Please select a tournament first.", "error");
    return;
  }

  const roomId = document.getElementById("room-id-input").value.trim();
  const roomPassword = document.getElementById("room-pass-input").value.trim();
  const instructions = document.getElementById("room-instructions-input").value.trim();
  const timingOption = document.querySelector('input[name="room-release-timing"]:checked')?.value || "15mins";

  if (!roomId || !roomPassword) {
    showToast("Both Room ID and Room Password are required.", "error");
    return;
  }

  let releaseTimeMs = Date.now();
  if (timingOption === "15mins" && selectedRoomTournament && selectedRoomTournament.matchSchedule) {
    const matchDate = selectedRoomTournament.matchSchedule.toDate 
      ? selectedRoomTournament.matchSchedule.toDate() 
      : new Date(selectedRoomTournament.matchSchedule);
    releaseTimeMs = Math.max(Date.now(), matchDate.getTime() - (15 * 60 * 1000));
  } else if (timingOption === "now") {
    releaseTimeMs = Date.now();
  }

  // Expiry: 2 hours after release
  const expiryTimeMs = releaseTimeMs + (2 * 60 * 60 * 1000);

  const btn = document.getElementById("btn-save-room-credentials");
  btn.disabled = true;
  btn.textContent = "Saving...";

  try {
    const now = firebase.firestore.FieldValue.serverTimestamp();
    const adminId = (currentAdminUser && currentAdminUser.uid) || (auth.currentUser && auth.currentUser.uid) || "admin";
    
    const roomPayload = {
      tournamentId: tournId,
      roomId: roomId || "",
      roomPassword: roomPassword || "",
      instructions: instructions || "Join lobby on time. Do not share password.",
      releaseTime: firebase.firestore.Timestamp.fromMillis(releaseTimeMs),
      expiryTime: firebase.firestore.Timestamp.fromMillis(expiryTimeMs),
      updatedAt: now,
      configuredByAdminId: adminId,
    };

    await db.collection("tournaments").doc(tournId).collection("private").doc("roomDetails").set(roomPayload, { merge: true });

    // Audit log
    await db.collection("tournaments").doc(tournId).collection("auditLogs").add({
      action: "ROOM_CREDENTIALS_CONFIGURED",
      configuredBy: adminId,
      releaseTime: firebase.firestore.Timestamp.fromMillis(releaseTimeMs),
      expiryTime: firebase.firestore.Timestamp.fromMillis(expiryTimeMs),
      timestamp: now,
    });

    showToast("Room credentials saved and audit log created!", "success");
    await loadRoomDetails(tournId);

  } catch (err) {
    console.error("Save room error:", err);
    showToast("Failed to save room details: " + err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Save Credentials & Record Audit Log";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const roomForm = document.getElementById("form-room-credentials");
  if (roomForm) roomForm.addEventListener("submit", handleSaveRoomCredentials);
});

window.initRoomManager = initRoomManager;

