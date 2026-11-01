/**
 * User Account & Permissions Management Module.
 */
let allUsersList = [];
let targetUserActionId = null;

async function loadUsers() {
  const tbody = document.getElementById("users-tbody");
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="8" class="loading-container"><div class="loading-spinner"></div>Loading player accounts...</td></tr>`;

  try {
    let snap = await db.collection("users").limit(100).get();
    if (snap.empty) {
      snap = await db.collection("user").limit(100).get();
    }
    allUsersList = [];
    snap.forEach((doc) => {
      allUsersList.push({ id: doc.id, ...doc.data() });
    });
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
    tbody.innerHTML = `<tr><td colspan="8" class="empty-state">No users registered yet.</td></tr>`;
    return;
  }

  users.forEach((u) => {
    const isBanned = u.isBanned === true;
    const role = (u.role || "player").toUpperCase();

    let roleBadge = "badge-upcoming";
    if (role === "ADMIN") roleBadge = "badge-live";
    if (role === "MODERATOR") roleBadge = "badge-open";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <strong>${escapeHtml(u.displayName || "Gamer")}</strong>
        <div style="font-size: 11px; color: var(--text-muted); font-family: monospace;">${escapeHtml(u.id)}</div>
      </td>
      <td>${escapeHtml(u.email || "No Email")}</td>
      <td><strong style="color: var(--secondary); font-family: monospace;">${escapeHtml(u.freeFireUid || "Not Linked")}</strong></td>
      <td>${escapeHtml(u.freeFireName || "N/A")}</td>
      <td><span class="badge ${roleBadge}">${escapeHtml(role)}</span></td>
      <td><span class="badge ${isBanned ? 'badge-cancelled' : 'badge-open'}">${isBanned ? 'BANNED' : 'ACTIVE'}</span></td>
      <td>${formatTimestamp(u.createdAt)}</td>
      <td>
        <div style="display: flex; gap: 6px;">
          <button class="btn btn-secondary btn-sm" onclick="openEditUserRoleModal('${u.id}', '${u.role || 'player'}')">Role</button>
          ${isBanned ? `
            <button class="btn btn-success btn-sm" onclick="handleToggleUserBan('${u.id}', false)">Unban</button>
          ` : `
            <button class="btn btn-danger btn-sm" onclick="openBanUserModal('${u.id}')">Ban</button>
          `}
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
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

// Ban / Unban
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
    const setStatusFn = functions.httpsCallable("adminSetUserStatus");
    await setStatusFn({
      targetUserId: targetUserActionId,
      isBanned: true,
      reason: reason || "Terms violation.",
    });

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
    const setStatusFn = functions.httpsCallable("adminSetUserStatus");
    await setStatusFn({
      targetUserId: userId,
      isBanned: isBanned,
    });

    showToast(`User has been ${isBanned ? 'banned' : 'unbanned'}.`, "success");
    await loadUsers();
  } catch (err) {
    console.error("Toggle ban error:", err);
    showToast("Failed: " + err.message, "error");
  }
}

// Role Edit
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
    const setStatusFn = functions.httpsCallable("adminSetUserStatus");
    await setStatusFn({
      targetUserId: targetUserActionId,
      role: role,
    });

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

window.loadUsers = loadUsers;
window.filterUsers = filterUsers;
window.openBanUserModal = openBanUserModal;
window.handleToggleUserBan = handleToggleUserBan;
window.openEditUserRoleModal = openEditUserRoleModal;

