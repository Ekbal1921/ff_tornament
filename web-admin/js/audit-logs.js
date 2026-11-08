/**
 * Immutable Administrative Audit Trail Module.
 */
let allAuditLogs = [];

async function loadAuditLogs() {
  const tbody = document.getElementById("audit-tbody");
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="6" class="loading-container"><div class="loading-spinner"></div>Loading audit logs...</td></tr>`;

  try {
    const snap = await db.collection("adminAuditLogs").orderBy("timestamp", "desc").limit(100).get();
    allAuditLogs = [];
    snap.forEach((doc) => {
      allAuditLogs.push({ id: doc.id, ...doc.data() });
    });
    renderAuditTable(allAuditLogs);
  } catch (err) {
    console.error("Audit load error:", err);
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">Failed to load audit logs: ${escapeHtml(err.message)}</td></tr>`;
  }
}

function renderAuditTable(logs) {
  const tbody = document.getElementById("audit-tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (logs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">No administrative actions logged yet.</td></tr>`;
    return;
  }

  logs.forEach((log) => {
    let actionBadge = "badge-upcoming";
    const act = log.action || "";
    if (act.includes("APPROVED") || act.includes("CREATED") || act.includes("PUBLISHED")) actionBadge = "badge-open";
    if (act.includes("REJECTED") || act.includes("CANCELLED") || act.includes("BANNED")) actionBadge = "badge-cancelled";

    let detailsPreview = "";
    if (log.details) {
      try {
        detailsPreview = JSON.stringify(log.details);
        if (detailsPreview.length > 70) detailsPreview = detailsPreview.substring(0, 67) + "...";
      } catch (e) {
        detailsPreview = "Object";
      }
    }

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><span style="font-family: monospace; font-size: 11px;">${escapeHtml(log.id)}</span></td>
      <td><span class="badge ${actionBadge}">${escapeHtml(log.action || "UNKNOWN")}</span></td>
      <td><span style="font-family: monospace; font-size: 11px; color: var(--text-secondary);">${escapeHtml(log.adminId || "System")}</span></td>
      <td>${escapeHtml(log.tournamentId || "-")}</td>
      <td>
        <span style="font-family: monospace; font-size: 11px; color: var(--text-muted); cursor: pointer;" onclick="inspectAuditDetails('${log.id}')" title="Click to view full details">
          ${escapeHtml(detailsPreview)} 🔍
        </span>
      </td>
      <td>${formatTimestamp(log.timestamp)}</td>
    `;
    tbody.appendChild(tr);
  });
}

function filterAuditLogs() {
  const actionFilter = document.getElementById("audit-action-filter")?.value || "ALL";
  const search = document.getElementById("audit-search-input")?.value.toLowerCase().trim() || "";

  const filtered = allAuditLogs.filter((log) => {
    const matchAction = actionFilter === "ALL" || log.action === actionFilter;
    const matchSearch = (log.adminId && log.adminId.toLowerCase().includes(search)) ||
                        (log.tournamentId && log.tournamentId.toLowerCase().includes(search)) ||
                        (log.id && log.id.toLowerCase().includes(search));
    return matchAction && matchSearch;
  });

  renderAuditTable(filtered);
}

function inspectAuditDetails(logId) {
  const log = allAuditLogs.find(l => l.id === logId);
  if (!log) return;

  const content = document.getElementById("audit-modal-content");
  if (content) {
    content.innerHTML = `
      <div style="font-size: 13px;">
        <p><strong>Log ID:</strong> <span style="font-family: monospace;">${escapeHtml(log.id)}</span></p>
        <p><strong>Action:</strong> <span class="badge badge-open">${escapeHtml(log.action)}</span></p>
        <p><strong>Administrator ID:</strong> <span style="font-family: monospace;">${escapeHtml(log.adminId)}</span></p>
        <p><strong>Tournament ID:</strong> ${escapeHtml(log.tournamentId || "N/A")}</p>
        <p><strong>Timestamp:</strong> ${formatTimestamp(log.timestamp)}</p>
        <h4 style="margin-top: 14px; margin-bottom: 6px;">Details Payload:</h4>
        <pre style="background: var(--bg-input); padding: 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-color); overflow-x: auto; font-size: 12px; color: var(--accent-green);">${escapeHtml(JSON.stringify(log.details || {}, null, 2))}</pre>
      </div>
    `;
  }
  openModal("modal-audit-details");
}

window.loadAuditLogs = loadAuditLogs;
window.filterAuditLogs = filterAuditLogs;
window.inspectAuditDetails = inspectAuditDetails;

