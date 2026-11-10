/**
 * Disputes, Support Tickets & Refunds Module (Phase 10).
 */
let allReports = [];
let allSupportTickets = [];
let targetReportId = null;
let targetSupportTicket = null;
let selectedDisputeIds = new Set();
let selectedSupportIds = new Set();

/* ==========================================================================
   1. SUPPORT TICKETS & DISPUTES (PHASE 10)
   ========================================================================== */
function handleSupportCheckChange(id, isChecked) {
  if (isChecked) {
    selectedSupportIds.add(id);
  } else {
    selectedSupportIds.delete(id);
  }
  updateSupportBulkButton();
}

function toggleSelectAllSupportTickets(isChecked) {
  const checkboxes = document.querySelectorAll(".support-row-check");
  checkboxes.forEach((cb) => {
    cb.checked = isChecked;
    if (isChecked) {
      selectedSupportIds.add(cb.value);
    } else {
      selectedSupportIds.delete(cb.value);
    }
  });
  updateSupportBulkButton();
}

function updateSupportBulkButton() {
  const count = selectedSupportIds.size;
  const countEl = document.getElementById("support-selected-count");
  if (countEl) countEl.textContent = count;
  const btn = document.getElementById("btn-bulk-delete-support");
  if (btn) btn.disabled = count === 0;

  const selectAllCb = document.getElementById("support-select-all");
  const visibleCbs = document.querySelectorAll(".support-row-check");
  if (selectAllCb) {
    if (visibleCbs.length > 0 && Array.from(visibleCbs).every(cb => cb.checked)) {
      selectAllCb.checked = true;
    } else {
      selectAllCb.checked = false;
    }
  }
}

function openBulkDeleteSupportTicketsModal() {
  if (selectedSupportIds.size === 0) {
    showToast("Please select at least one support case to delete.", "warning");
    return;
  }
  const countEl = document.getElementById("bulk-delete-support-count");
  if (countEl) countEl.textContent = selectedSupportIds.size;
  openModal("modal-bulk-delete-support");
}

async function handleConfirmBulkDeleteSupportTickets() {
  if (selectedSupportIds.size === 0) return;

  const adminId = (currentAdminUser && currentAdminUser.uid) || (auth.currentUser && auth.currentUser.uid) || "admin";
  const btn = document.getElementById("btn-confirm-bulk-delete-support");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Deleting...";
  }

  const idsToDelete = Array.from(selectedSupportIds);

  try {
    const batch = db.batch();
    idsToDelete.forEach((id) => {
      batch.delete(db.collection("supportTickets").doc(id));
    });
    await batch.commit();

    // Record Immutable Admin Audit Trail
    try {
      await db.collection("adminAuditLogs").add({
        adminId,
        action: "BULK_SUPPORT_TICKETS_DELETED",
        targetId: "bulk",
        details: {
          deletedCount: idsToDelete.length,
          deletedRecordIds: idsToDelete,
          timestamp: new Date().toISOString(),
        },
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      });
    } catch (auditErr) {
      console.warn("Audit log notice:", auditErr.message);
    }

    selectedSupportIds.clear();
    const selectAllCb = document.getElementById("support-select-all");
    if (selectAllCb) selectAllCb.checked = false;
    updateSupportBulkButton();

    showToast(`Successfully deleted ${idsToDelete.length} support case(s).`, "success");
    closeModal("modal-bulk-delete-support");
    await loadSupportTickets();
  } catch (err) {
    console.error("Bulk delete support tickets error:", err);
    if (err.code === "permission-denied" || (err.message && err.message.toLowerCase().includes("permission"))) {
      showToast("Permission Denied: Please publish the updated firestore.rules in Firebase Console.", "error");
    } else {
      showToast("Failed to delete support cases: " + err.message, "error");
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Permanently Delete";
    }
  }
}
async function loadSupportTickets() {
  const tbody = document.getElementById("support-tickets-tbody");
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="9" class="loading-container"><div class="loading-spinner"></div>Loading support cases...</td></tr>`;

  try {
    const snap = await db.collection("supportTickets").orderBy("createdAt", "desc").limit(100).get();
    allSupportTickets = [];
    snap.forEach((doc) => {
      allSupportTickets.push({ id: doc.id, ...doc.data() });
    });

    // Update pending badge in sidebar if present
    const pendingCount = allSupportTickets.filter(t => t.status === "OPEN" || t.status === "IN_REVIEW").length;
    const badge = document.getElementById("badge-pending-disputes");
    if (badge) {
      if (pendingCount > 0) {
        badge.textContent = pendingCount;
        badge.style.display = "inline-block";
      } else {
        badge.style.display = "none";
      }
    }

    renderSupportTicketsTable(allSupportTickets);
  } catch (err) {
    console.error("Support tickets load error:", err);
    tbody.innerHTML = `<tr><td colspan="9" class="empty-state">Failed to load support cases: ${escapeHtml(err.message)}</td></tr>`;
  }
}

function renderSupportTicketsTable(tickets) {
  const tbody = document.getElementById("support-tickets-tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (tickets.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="empty-state">No support cases found for the selected filter.</td></tr>`;
    updateSupportBulkButton();
    return;
  }

  tickets.forEach((t) => {
    const status = (t.status || "OPEN").toUpperCase();
    const isOpen = status === "OPEN" || status === "IN_REVIEW";

    let badgeClass = "badge-pending";
    if (status === "RESOLVED") badgeClass = "badge-approved";
    if (status === "IN_REVIEW") badgeClass = "badge-open";
    if (status === "CLOSED") badgeClass = "badge-full";

    const isSelected = selectedSupportIds.has(t.id);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="text-align: center;">
        <input type="checkbox" class="support-row-check" value="${escapeHtml(t.id)}" ${isSelected ? "checked" : ""} onchange="handleSupportCheckChange('${escapeHtml(t.id)}', this.checked)" style="cursor: pointer; width: 16px; height: 16px;">
      </td>
      <td><span style="font-family: monospace; font-size: 11px;">${escapeHtml(t.id)}</span></td>
      <td><span class="badge badge-open" style="font-size: 11px;">${escapeHtml(t.category || "General")}</span></td>
      <td>
        <strong>${escapeHtml(t.displayName || "Player")}</strong><br>
        <span style="font-size: 11px; color: var(--text-muted);">${escapeHtml(t.userEmail || t.userId || "N/A")}</span>
      </td>
      <td>
        <strong style="color: var(--text-primary); font-size: 13px;">${escapeHtml(t.subject || "No Subject")}</strong><br>
        <span style="font-size: 12px; color: var(--text-secondary); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
          ${escapeHtml(t.description || "No description")}
        </span>
      </td>
      <td><span style="font-family: monospace; font-size: 11px; color: var(--secondary);">${escapeHtml(t.relatedReferenceId || "N/A")}</span></td>
      <td><span class="badge ${badgeClass}">${escapeHtml(status)}</span></td>
      <td style="font-size: 11px; color: var(--text-muted);">${formatTimestamp(t.createdAt)}</td>
      <td>
        <button class="btn btn-primary btn-sm" onclick="openRespondSupportTicketModal('${t.id}')">
          ${isOpen ? 'Respond' : 'View / Edit'}
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  updateSupportBulkButton();
}

function filterSupportTickets() {
  const catFilter = document.getElementById("support-category-filter")?.value || "ALL";
  const statusFilter = document.getElementById("support-status-filter")?.value || "ALL";
  const search = document.getElementById("support-search-input")?.value.toLowerCase().trim() || "";

  const filtered = allSupportTickets.filter((t) => {
    const matchCat = catFilter === "ALL" || (t.category && t.category.toLowerCase() === catFilter.toLowerCase());
    let matchStatus = statusFilter === "ALL";
    if (statusFilter === "OPEN") {
      matchStatus = t.status === "OPEN" || t.status === "IN_REVIEW";
    } else if (statusFilter !== "ALL") {
      matchStatus = t.status === statusFilter;
    }

    const matchSearch = (t.subject && t.subject.toLowerCase().includes(search)) ||
                        (t.description && t.description.toLowerCase().includes(search)) ||
                        (t.displayName && t.displayName.toLowerCase().includes(search)) ||
                        (t.userEmail && t.userEmail.toLowerCase().includes(search)) ||
                        (t.userId && t.userId.toLowerCase().includes(search)) ||
                        (t.relatedReferenceId && t.relatedReferenceId.toLowerCase().includes(search)) ||
                        (t.id && t.id.toLowerCase().includes(search));

    return matchCat && matchStatus && matchSearch;
  });

  renderSupportTicketsTable(filtered);
}

function openRespondSupportTicketModal(ticketId) {
  const t = allSupportTickets.find(item => item.id === ticketId);
  if (!t) return;

  targetSupportTicket = t;
  document.getElementById("respond-ticket-id").value = t.id;
  document.getElementById("respond-ticket-userid").value = t.userId || "";
  document.getElementById("respond-ticket-subject").value = t.subject || "Support Inquiry";

  document.getElementById("respond-ticket-player").textContent = `${t.displayName || "Player"} (${t.userEmail || t.userId})`;
  document.getElementById("respond-ticket-category-badge").textContent = (t.category || "GENERAL").toUpperCase();
  document.getElementById("respond-ticket-subject-display").textContent = t.subject || "No Subject";
  document.getElementById("respond-ticket-ref-display").textContent = t.relatedReferenceId || "N/A";
  document.getElementById("respond-ticket-desc-display").textContent = t.description || "No description provided.";

  document.getElementById("respond-ticket-status").value = (t.status === "RESOLVED" || t.status === "CLOSED") ? t.status : "RESOLVED";
  document.getElementById("respond-ticket-reply").value = t.adminResponse || "";

  openModal("modal-respond-support-ticket");
}

async function executeRespondSupportTicket(e) {
  e.preventDefault();
  if (!targetSupportTicket) return;

  const ticketId = document.getElementById("respond-ticket-id").value;
  const userId = document.getElementById("respond-ticket-userid").value;
  const subject = document.getElementById("respond-ticket-subject").value;
  const newStatus = document.getElementById("respond-ticket-status").value;
  const reply = document.getElementById("respond-ticket-reply").value.trim();
  const shouldNotify = document.getElementById("respond-ticket-notify").checked;

  const btn = document.getElementById("btn-confirm-respond-ticket");
  btn.disabled = true;
  btn.textContent = "Saving...";

  try {
    const now = firebase.firestore.FieldValue.serverTimestamp();
    const adminId = (currentAdminUser && currentAdminUser.uid) || (auth.currentUser && auth.currentUser.uid) || "admin";

    // 1. Update Support Ticket in Firestore
    await db.collection("supportTickets").doc(ticketId).update({
      status: newStatus,
      adminResponse: reply,
      respondedByAdminId: adminId,
      resolvedAt: newStatus === "RESOLVED" || newStatus === "CLOSED" ? now : null,
      updatedAt: now,
    });

    // 2. Dispatch Notification to Player
    if (shouldNotify && userId) {
      await db.collection("notifications").add({
        userId,
        title: `Support Case Update: ${targetSupportTicket.category || "Inquiry"}`,
        message: `Status: ${newStatus}. Moderator response: ${reply}`,
        type: "ACCOUNT_SECURITY",
        referenceId: ticketId,
        read: false,
        createdAt: now,
      });
    }

    // 3. Admin Audit Log
    await db.collection("adminAuditLogs").add({
      adminId,
      action: "SUPPORT_TICKET_RESPONDED",
      targetId: ticketId,
      details: { userId, status: newStatus, replySnippet: reply.substring(0, 100) },
      timestamp: now,
    });

    showToast("Support case updated and player notified!", "success");
    closeModal("modal-respond-support-ticket");
    await loadSupportTickets();
  } catch (err) {
    console.error("Respond error:", err);
    showToast("Failed to save resolution: " + err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Save Resolution & Respond";
  }
}

/* ==========================================================================
   2. CUSTOM NOTIFICATION DISPATCHER (PHASE 10 & FCM PUSH)
   ========================================================================== */
function openSendNotificationModal(target = "", displayName = "", mode = "AUTO") {
  const modeInput = document.getElementById("notify-target-mode");
  const uidsInput = document.getElementById("notify-target-uids");
  const targetUidInput = document.getElementById("notify-target-uid");
  const targetGroup = document.getElementById("notify-target-uid-group");
  const summaryEl = document.getElementById("notify-recipient-summary");

  document.getElementById("notify-title").value = "";
  document.getElementById("notify-message").value = "";

  if (mode === "ALL" || target === "ALL_USERS") {
    if (modeInput) modeInput.value = "ALL";
    if (uidsInput) uidsInput.value = "";
    if (targetUidInput) targetUidInput.value = "ALL_USERS";
    if (targetGroup) targetGroup.style.display = "none";
    if (summaryEl) summaryEl.innerHTML = `🌐 Recipient: <strong>All Registered Players (Broadcast)</strong>`;
  } else if (mode === "SELECTED") {
    if (modeInput) modeInput.value = "SELECTED";
    if (uidsInput) uidsInput.value = target;
    if (targetUidInput) targetUidInput.value = "";
    if (targetGroup) targetGroup.style.display = "none";
    const count = target.split(",").filter(Boolean).length;
    if (summaryEl) summaryEl.innerHTML = `☑️ Recipient: <strong>${count} Selected Player(s)</strong>`;
  } else if (target && target.trim().length > 0) {
    if (modeInput) modeInput.value = "SINGLE";
    if (uidsInput) uidsInput.value = target.trim();
    if (targetUidInput) targetUidInput.value = target.trim();
    if (targetGroup) targetGroup.style.display = "none";
    if (summaryEl) summaryEl.innerHTML = `👤 Recipient: <strong>${escapeHtml(displayName || target)}</strong> <span style="font-family: monospace; font-size: 11px;">(${escapeHtml(target)})</span>`;
  } else {
    if (modeInput) modeInput.value = "CUSTOM";
    if (uidsInput) uidsInput.value = "";
    if (targetUidInput) targetUidInput.value = "";
    if (targetGroup) targetGroup.style.display = "block";
    if (summaryEl) summaryEl.innerHTML = `👤 Recipient: <strong>Custom Recipient</strong> (specify UID or 'ALL_USERS' below)`;
  }

  const imgInput = document.getElementById("notify-image-url");
  if (imgInput) imgInput.value = "";
  const imgPrev = document.getElementById("notify-image-preview-container");
  if (imgPrev) imgPrev.style.display = "none";

  openModal("modal-send-notification");
}

async function executeSendCustomNotification(e) {
  e.preventDefault();

  const mode = document.getElementById("notify-target-mode")?.value || "CUSTOM";
  const targetUidsRaw = document.getElementById("notify-target-uids")?.value || "";
  const targetUidInput = document.getElementById("notify-target-uid")?.value.trim() || "";
  const type = document.getElementById("notify-type").value;
  const title = document.getElementById("notify-title").value.trim();
  const message = document.getElementById("notify-message").value.trim();
  const imageUrlRaw = document.getElementById("notify-image-url")?.value.trim() || "";
  const imageUrl = (imageUrlRaw.startsWith("http://") || imageUrlRaw.startsWith("https://")) ? imageUrlRaw : null;
  const includeFcm = document.getElementById("notify-include-fcm")?.checked !== false;

  if (!title || !message) {
    showToast("Title and message are required.", "error");
    return;
  }

  // Security sanitize against PINs/passwords
  const cleanMsg = message.replaceAll("(?i)(pin|password|secret|cvv)\\s*[:=]\\s*\\w+", "$1: [PROTECTED]");

  const btn = document.getElementById("btn-confirm-send-notify");
  btn.disabled = true;
  btn.textContent = "Dispatching...";

  try {
    const now = firebase.firestore.FieldValue.serverTimestamp();
    const adminId = (currentAdminUser && currentAdminUser.uid) || (auth.currentUser && auth.currentUser.uid) || "admin";

    // Load FCM Configuration (v1 Service Account or Legacy Server Key)
    let fcmConfig = null;
    let oauthToken = null;
    let targetProjectId = "ff-tornamwent";

    if (includeFcm) {
      try {
        const cfgDoc = await db.collection("systemConfig").doc("notificationSettings").get();
        if (cfgDoc.exists) {
          fcmConfig = cfgDoc.data();
          if (fcmConfig.projectId) targetProjectId = fcmConfig.projectId;
          if (fcmConfig.clientEmail && fcmConfig.privateKey) {
            oauthToken = await getGoogleOAuth2Token(fcmConfig.clientEmail, fcmConfig.privateKey);
          }
        }
      } catch (err) {
        console.warn("Could not read notificationSettings or acquire OAuth2 token:", err);
      }
    }

    if (mode === "ALL" || targetUidInput.toUpperCase() === "ALL_USERS") {
      // 1. Broadcast to all users in Firestore
      let usersSnap = await db.collection("users").limit(200).get();
      if (usersSnap.empty) {
        usersSnap = await db.collection("user").limit(200).get();
      }

      // Record broadcast document in notifications
      const broadcastDoc = {
        userId: "ALL_USERS",
        title,
        message: cleanMsg,
        type,
        referenceId: "broadcast",
        read: false,
        createdAt: now,
      };
      if (imageUrl) broadcastDoc.imageUrl = imageUrl;
      await db.collection("notifications").add(broadcastDoc);

      // Also batch write to active users
      const batch = db.batch();
      usersSnap.forEach((doc) => {
        const notifRef = db.collection("notifications").doc();
        const userNotif = {
          userId: doc.id,
          title,
          message: cleanMsg,
          type,
          referenceId: "broadcast",
          read: false,
          createdAt: now,
        };
        if (imageUrl) userNotif.imageUrl = imageUrl;
        batch.set(notifRef, userNotif);
      });
      await batch.commit();

      // Send FCM Topic Push to /topics/all
      let pushStatus = "";
      if (includeFcm) {
        const fcmNotif = { title, body: cleanMsg };
        if (imageUrl) fcmNotif.image = imageUrl;

        const fcmData = { title, body: cleanMsg, type, target: "ALL_USERS" };
        if (imageUrl) {
          fcmData.imageUrl = imageUrl;
          fcmData.image = imageUrl;
        }

        if (oauthToken) {
          try {
            await dispatchFcmV1Call(targetProjectId, oauthToken, {
              topic: "all",
              notification: fcmNotif,
              data: fcmData
            });
            pushStatus = " + Mobile Push Alert (FCM v1" + (imageUrl ? " with Banner Image" : "") + ") sent to all devices!";
          } catch (fcmErr) {
            console.warn("FCM v1 Broadcast error:", fcmErr);
            pushStatus = " (FCM v1 notice: " + fcmErr.message + ")";
          }
        } else if (fcmConfig && fcmConfig.fcmServerKey) {
          try {
            const legacyNotif = { ...fcmNotif, sound: "default" };
            await dispatchFcmHttpCall(fcmConfig.fcmServerKey, {
              to: "/topics/all",
              priority: "high",
              notification: legacyNotif,
              data: fcmData
            });
            pushStatus = " + Mobile Push Alert sent to all devices!";
          } catch (fcmErr) {
            console.warn("FCM Push error:", fcmErr);
            pushStatus = " (FCM push notice: " + fcmErr.message + ")";
          }
        }
      }

      showToast(`Broadcast notification dispatched to ${usersSnap.size} players${pushStatus}!`, "success");

      await db.collection("adminAuditLogs").add({
        adminId,
        action: "BROADCAST_NOTIFICATION_DISPATCHED",
        targetId: "ALL_USERS",
        details: { title, type, userCount: usersSnap.size, hasImage: !!imageUrl },
        timestamp: now,
      });

    } else if (mode === "SELECTED") {
      const uids = targetUidsRaw.split(",").map(u => u.trim()).filter(Boolean);
      if (uids.length === 0) {
        showToast("No players were selected.", "warning");
        return;
      }

      // Collect FCM tokens & batch write to Firestore
      const fcmTokens = [];
      const batch = db.batch();
      for (const uid of uids) {
        const notifRef = db.collection("notifications").doc();
        const selNotif = {
          userId: uid,
          title,
          message: cleanMsg,
          type,
          referenceId: "admin_selected",
          read: false,
          createdAt: now,
        };
        if (imageUrl) selNotif.imageUrl = imageUrl;
        batch.set(notifRef, selNotif);

        if (includeFcm) {
          try {
            let uDoc = await db.collection("users").doc(uid).get();
            if (!uDoc.exists) {
              uDoc = await db.collection("user").doc(uid).get();
            }
            if (uDoc.exists && uDoc.data().fcmToken) {
              fcmTokens.push(uDoc.data().fcmToken);
            }
          } catch (e) {}
        }
      }
      await batch.commit();

      let pushStatus = "";
      if (includeFcm && fcmTokens.length > 0) {
        const fcmNotif = { title, body: cleanMsg };
        if (imageUrl) fcmNotif.image = imageUrl;

        const fcmData = { title, body: cleanMsg, type };
        if (imageUrl) {
          fcmData.imageUrl = imageUrl;
          fcmData.image = imageUrl;
        }

        if (oauthToken) {
          let sentCount = 0;
          for (const token of fcmTokens) {
            try {
              await dispatchFcmV1Call(targetProjectId, oauthToken, {
                token,
                notification: fcmNotif,
                data: fcmData
              });
              sentCount++;
            } catch (err) {
              console.warn("FCM v1 token dispatch error:", err);
            }
          }
          pushStatus = ` + ${sentCount} Mobile Push Alert(s) (FCM v1${imageUrl ? " with Banner Image" : ""}) sent!`;
        } else if (fcmConfig && fcmConfig.fcmServerKey) {
          try {
            const legacyNotif = { ...fcmNotif, sound: "default" };
            await dispatchFcmHttpCall(fcmConfig.fcmServerKey, {
              registration_ids: fcmTokens,
              priority: "high",
              notification: legacyNotif,
              data: fcmData
            });
            pushStatus = ` + ${fcmTokens.length} Mobile Push Alerts sent!`;
          } catch (fcmErr) {
            console.warn("FCM Multicast error:", fcmErr);
          }
        }
      }

      showToast(`Notification dispatched to ${uids.length} selected player(s)${pushStatus}!`, "success");

      await db.collection("adminAuditLogs").add({
        adminId,
        action: "SELECTED_USERS_NOTIFICATION_DISPATCHED",
        targetId: "selected:" + uids.length,
        details: { title, type, uids, hasImage: !!imageUrl },
        timestamp: now,
      });

    } else {
      // Single Recipient
      const targetUid = targetUidInput || targetUidsRaw;
      if (!targetUid) {
        showToast("Please enter a target Player UID.", "error");
        return;
      }

      const singleNotif = {
        userId: targetUid,
        title,
        message: cleanMsg,
        type,
        referenceId: "admin_direct",
        read: false,
        createdAt: now,
      };
      if (imageUrl) singleNotif.imageUrl = imageUrl;
      await db.collection("notifications").add(singleNotif);

      let pushStatus = "";
      if (includeFcm) {
        try {
          let uDoc = await db.collection("users").doc(targetUid).get();
          if (!uDoc.exists) uDoc = await db.collection("user").doc(targetUid).get();
          const targetToken = (uDoc.exists && uDoc.data().fcmToken) ? uDoc.data().fcmToken : null;

          if (targetToken) {
            const fcmNotif = { title, body: cleanMsg };
            if (imageUrl) fcmNotif.image = imageUrl;

            const fcmData = { title, body: cleanMsg, type, target: targetUid };
            if (imageUrl) {
              fcmData.imageUrl = imageUrl;
              fcmData.image = imageUrl;
            }

            if (oauthToken) {
              await dispatchFcmV1Call(targetProjectId, oauthToken, {
                token: targetToken,
                notification: fcmNotif,
                data: fcmData
              });
              pushStatus = " + Mobile Push Alert (FCM v1" + (imageUrl ? " with Banner Image" : "") + ") sent!";
            } else if (fcmConfig && fcmConfig.fcmServerKey) {
              const legacyNotif = { ...fcmNotif, sound: "default" };
              await dispatchFcmHttpCall(fcmConfig.fcmServerKey, {
                to: targetToken,
                priority: "high",
                notification: legacyNotif,
                data: fcmData
              });
              pushStatus = " + Mobile Push Alert sent!";
            }
          }
        } catch (e) {
          console.warn("Single FCM push error:", e);
        }
      }

      showToast(`Notification sent to player (${targetUid})${pushStatus}!`, "success");

      await db.collection("adminAuditLogs").add({
        adminId,
        action: "SINGLE_NOTIFICATION_DISPATCHED",
        targetId: targetUid,
        details: { title, type, hasImage: !!imageUrl },
        timestamp: now,
      });
    }

    closeModal("modal-send-notification");
  } catch (err) {
    console.error("Send notification error:", err);
    showToast("Failed to dispatch notification: " + err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Dispatch Notification";
  }
}

// Live Image Preview for Push Notification Banner
function handleNotifyImagePreview(url) {
  const container = document.getElementById("notify-image-preview-container");
  const img = document.getElementById("notify-image-preview");
  if (!container || !img) return;
  const clean = (url || "").trim();
  if (clean && (clean.startsWith("http://") || clean.startsWith("https://"))) {
    img.src = clean;
    container.style.display = "block";
    img.onerror = () => { container.style.display = "none"; };
    img.onload = () => { container.style.display = "block"; };
  } else {
    container.style.display = "none";
    img.src = "";
  }
}
window.handleNotifyImagePreview = handleNotifyImagePreview;

// Base64Url and Web Crypto RSA SHA-256 JWT signing for FCM HTTP v1
function base64UrlEncodeStr(str) {
  return btoa(unescape(encodeURIComponent(str)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function arrayBufferToBase64Url(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function pemToArrayBuffer(pem) {
  const b64 = pem
    .replace(/-----BEGIN [A-Z ]+-----/g, '')
    .replace(/-----END [A-Z ]+-----/g, '')
    .replace(/\s+/g, '');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

let cachedOAuthToken = null;
let cachedTokenExpiry = 0;

async function getGoogleOAuth2Token(clientEmail, privateKeyPem) {
  const now = Math.floor(Date.now() / 1000);
  if (cachedOAuthToken && cachedTokenExpiry > (now + 60)) {
    return cachedOAuthToken;
  }

  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const encodedHeader = base64UrlEncodeStr(JSON.stringify(header));
  const encodedClaims = base64UrlEncodeStr(JSON.stringify(claims));
  const unsignedToken = `${encodedHeader}.${encodedClaims}`;

  const keyBuffer = pemToArrayBuffer(privateKeyPem);
  const cryptoKey = await window.crypto.subtle.importKey(
    "pkcs8",
    keyBuffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const encoder = new TextEncoder();
  const signature = await window.crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    encoder.encode(unsignedToken)
  );

  const encodedSignature = arrayBufferToBase64Url(signature);
  const jwt = `${unsignedToken}.${encodedSignature}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${encodeURIComponent(jwt)}`
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google OAuth2 Token error (${res.status}): ${errText}`);
  }

  const tokenData = await res.json();
  cachedOAuthToken = tokenData.access_token;
  cachedTokenExpiry = now + (tokenData.expires_in || 3600);
  return cachedOAuthToken;
}

async function dispatchFcmV1Call(projectId, accessToken, messagePayload) {
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ message: messagePayload })
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`FCM v1 (${res.status}): ${errorText}`);
  }
  return await res.json();
}

async function dispatchFcmHttpCall(serverKey, payload) {
  const response = await fetch("https://fcm.googleapis.com/fcm/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "key=" + serverKey.trim(),
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`FCM status ${response.status}: ${errorText}`);
  }
  return await response.json();
}

/* ==========================================================================
   3. IN-GAME INTRUDER & ANTI-CHEAT REPORTS
   ========================================================================== */
function handleDisputeCheckChange(id, isChecked) {
  if (isChecked) {
    selectedDisputeIds.add(id);
  } else {
    selectedDisputeIds.delete(id);
  }
  updateDisputesBulkButton();
}

function toggleSelectAllDisputes(isChecked) {
  const checkboxes = document.querySelectorAll(".dispute-row-check");
  checkboxes.forEach((cb) => {
    cb.checked = isChecked;
    if (isChecked) {
      selectedDisputeIds.add(cb.value);
    } else {
      selectedDisputeIds.delete(cb.value);
    }
  });
  updateDisputesBulkButton();
}

function updateDisputesBulkButton() {
  const count = selectedDisputeIds.size;
  const countEl = document.getElementById("disputes-selected-count");
  if (countEl) countEl.textContent = count;
  const btn = document.getElementById("btn-bulk-delete-disputes");
  if (btn) btn.disabled = count === 0;

  const selectAllCb = document.getElementById("disputes-select-all");
  const visibleCbs = document.querySelectorAll(".dispute-row-check");
  if (selectAllCb) {
    if (visibleCbs.length > 0 && Array.from(visibleCbs).every(cb => cb.checked)) {
      selectAllCb.checked = true;
    } else {
      selectAllCb.checked = false;
    }
  }
}

function openBulkDeleteDisputesModal() {
  if (selectedDisputeIds.size === 0) {
    showToast("Please select at least one report to delete.", "warning");
    return;
  }
  const countEl = document.getElementById("bulk-delete-disputes-count");
  if (countEl) countEl.textContent = selectedDisputeIds.size;
  openModal("modal-bulk-delete-disputes");
}

async function handleConfirmBulkDeleteDisputes() {
  if (selectedDisputeIds.size === 0) return;

  const adminId = (currentAdminUser && currentAdminUser.uid) || (auth.currentUser && auth.currentUser.uid) || "admin";
  const btn = document.getElementById("btn-confirm-bulk-delete-disputes");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Deleting...";
  }

  const idsToDelete = Array.from(selectedDisputeIds);

  try {
    const batch = db.batch();
    idsToDelete.forEach((id) => {
      batch.delete(db.collection("reports").doc(id));
    });
    await batch.commit();

    // Record Immutable Admin Audit Trail
    try {
      await db.collection("adminAuditLogs").add({
        adminId,
        action: "BULK_DISPUTES_DELETED",
        targetId: "bulk",
        details: {
          deletedCount: idsToDelete.length,
          deletedRecordIds: idsToDelete,
          timestamp: new Date().toISOString(),
        },
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      });
    } catch (auditErr) {
      console.warn("Audit log notice:", auditErr.message);
    }

    selectedDisputeIds.clear();
    const selectAllCb = document.getElementById("disputes-select-all");
    if (selectAllCb) selectAllCb.checked = false;
    updateDisputesBulkButton();

    showToast(`Successfully deleted ${idsToDelete.length} report(s).`, "success");
    closeModal("modal-bulk-delete-disputes");
    await loadDisputes();
  } catch (err) {
    console.error("Bulk delete disputes error:", err);
    if (err.code === "permission-denied" || (err.message && err.message.toLowerCase().includes("permission"))) {
      showToast("Permission Denied: Please publish the updated firestore.rules in Firebase Console.", "error");
    } else {
      showToast("Failed to delete reports: " + err.message, "error");
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Permanently Delete";
    }
  }
}

async function loadDisputes() {
  // Concurrently load support tickets & cheat reports
  loadSupportTickets();

  const tbody = document.getElementById("disputes-tbody");
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="8" class="loading-container"><div class="loading-spinner"></div>Loading dispute reports...</td></tr>`;

  try {
    const snap = await db.collection("reports").orderBy("createdAt", "desc").limit(50).get();
    allReports = [];
    snap.forEach((doc) => {
      allReports.push({ id: doc.id, ...doc.data() });
    });
    renderDisputesTable(allReports);
  } catch (err) {
    console.error("Disputes load error:", err);
    tbody.innerHTML = `<tr><td colspan="8" class="empty-state">Failed to load reports: ${escapeHtml(err.message)}</td></tr>`;
  }
}

function renderDisputesTable(reports) {
  const tbody = document.getElementById("disputes-tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (reports.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-state">No cheat or intruder reports filed.</td></tr>`;
    updateDisputesBulkButton();
    return;
  }

  reports.forEach((r) => {
    const isPending = r.status === "PENDING";
    let statusBadge = "badge-pending";
    if (r.status === "RESOLVED") statusBadge = "badge-approved";
    if (r.status === "DISMISSED") statusBadge = "badge-full";

    const isSelected = selectedDisputeIds.has(r.id);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="text-align: center;">
        <input type="checkbox" class="dispute-row-check" value="${escapeHtml(r.id)}" ${isSelected ? "checked" : ""} onchange="handleDisputeCheckChange('${escapeHtml(r.id)}', this.checked)" style="cursor: pointer; width: 16px; height: 16px;">
      </td>
      <td><span style="font-family: monospace; font-size: 11px;">${escapeHtml(r.id)}</span></td>
      <td><strong>${escapeHtml(r.tournamentId || "Match")}</strong></td>
      <td><strong style="color: var(--accent-red); font-family: monospace;">${escapeHtml(r.reportedFreeFireUid || "N/A")}</strong></td>
      <td>${escapeHtml(r.reportedFreeFireName || "Unknown")}</td>
      <td style="font-size: 12px; color: var(--text-secondary); max-width: 250px;">${escapeHtml(r.reason || "No details provided")}</td>
      <td><span class="badge ${statusBadge}">${escapeHtml(r.status || "PENDING")}</span></td>
      <td>
        ${isPending ? `
          <div style="display: flex; gap: 6px;">
            <button class="btn btn-success btn-sm" onclick="openResolveReportModal('${r.id}')">Resolve</button>
            <button class="btn btn-secondary btn-sm" onclick="handleDismissReport('${r.id}')">Dismiss</button>
          </div>
        ` : `
          <span style="font-size: 11px; color: var(--text-muted);">${escapeHtml(r.resolutionNotes || formatTimestamp(r.resolvedAt))}</span>
        `}
      </td>
    `;
    tbody.appendChild(tr);
  });

  updateDisputesBulkButton();
}

function filterDisputes() {
  const statusFilter = document.getElementById("dispute-status-filter")?.value || "ALL";
  const search = document.getElementById("dispute-search-input")?.value.toLowerCase().trim() || "";

  const filtered = allReports.filter((r) => {
    const matchStatus = statusFilter === "ALL" || r.status === statusFilter;
    const matchSearch = (r.reportedFreeFireUid && r.reportedFreeFireUid.includes(search)) ||
                        (r.tournamentId && r.tournamentId.toLowerCase().includes(search)) ||
                        (r.reason && r.reason.toLowerCase().includes(search));
    return matchStatus && matchSearch;
  });

  renderDisputesTable(filtered);
}

function openResolveReportModal(reportId) {
  targetReportId = reportId;
  document.getElementById("resolve-report-id-display").textContent = reportId;
  openModal("modal-resolve-report");
}

async function handleConfirmResolveReport() {
  if (!targetReportId) return;

  const notes = document.getElementById("resolve-report-notes").value.trim();
  const btn = document.getElementById("btn-confirm-resolve-report");
  btn.disabled = true;
  btn.textContent = "Resolving...";

  try {
    const now = firebase.firestore.FieldValue.serverTimestamp();
    const adminId = (currentAdminUser && currentAdminUser.uid) || (auth.currentUser && auth.currentUser.uid) || "admin";
    await db.collection("reports").doc(targetReportId).update({
      status: "RESOLVED",
      resolutionNotes: notes || "Investigated and resolved.",
      resolvedByAdminId: adminId,
      resolvedAt: now,
      updatedAt: now,
    });

    showToast("Report marked as resolved.", "success");
    closeModal("modal-resolve-report");
    await loadDisputes();
  } catch (err) {
    console.error("Resolve report error:", err);
    showToast("Failed to resolve report: " + err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Confirm Resolution";
  }
}

async function handleDismissReport(reportId) {
  if (!confirm("Dismiss this report as invalid or unverified?")) return;

  try {
    const now = firebase.firestore.FieldValue.serverTimestamp();
    const adminId = (currentAdminUser && currentAdminUser.uid) || (auth.currentUser && auth.currentUser.uid) || "admin";
    await db.collection("reports").doc(reportId).update({
      status: "DISMISSED",
      resolutionNotes: "Dismissed by admin after review.",
      resolvedByAdminId: adminId,
      resolvedAt: now,
      updatedAt: now,
    });

    showToast("Report dismissed.", "info");
    await loadDisputes();
  } catch (err) {
    console.error("Dismiss report error:", err);
    showToast("Failed: " + err.message, "error");
  }
}

/* ==========================================================================
   4. MANUAL REFUNDS (PHASE 8 / 10)
   ========================================================================== */
function openManualRefundModal(userId = "", tournId = "") {
  document.getElementById("refund-user-id").value = userId || "";
  document.getElementById("refund-tourn-id").value = tournId || "";
  document.getElementById("refund-amount").value = "";
  document.getElementById("refund-reason").value = "";
  openModal("modal-manual-refund");
}

async function handleConfirmManualRefund(e) {
  e.preventDefault();

  const userId = document.getElementById("refund-user-id").value.trim();
  const tournId = document.getElementById("refund-tourn-id").value.trim();
  const amount = Number(document.getElementById("refund-amount").value);
  const reason = document.getElementById("refund-reason").value.trim();

  if (!userId || amount <= 0) {
    showToast("Please enter a valid user ID and positive refund amount.", "error");
    return;
  }

  const btn = document.getElementById("btn-confirm-manual-refund");
  btn.disabled = true;
  btn.textContent = "Processing...";

  try {
    await executeManualRefundDirectFallback(userId, tournId, amount, reason);
    showToast(`Refund of ৳${amount} credited to player wallet!`, "success");

    closeModal("modal-manual-refund");
    document.getElementById("form-manual-refund").reset();
  } catch (err) {
    console.error("Refund error:", err);
    showToast("Refund failed: " + err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Issue Refund to Wallet";
  }
}

/**
 * DIRECT FIRESTORE FALLBACK: Manual Wallet Refund
 */
async function executeManualRefundDirectFallback(userId, tournId, amount, reason) {
  const refundAmountInPaisa = Math.round(amount * 100);
  const walletRef = db.collection("wallets").doc(userId);
  const now = firebase.firestore.FieldValue.serverTimestamp();
  const adminId = (currentAdminUser && currentAdminUser.uid) || (auth.currentUser && auth.currentUser.uid) || "admin";

  return db.runTransaction(async (transaction) => {
    const walletDoc = await transaction.get(walletRef);
    const wData = walletDoc.exists ? walletDoc.data() : {};

    const curBalPaisa = Math.round(Number(wData.balanceInPaisa != null ? wData.balanceInPaisa : (wData.balance || 0) * 100));
    const curDepPaisa = Math.round(Number(wData.depositBalanceInPaisa != null ? wData.depositBalanceInPaisa : (wData.depositBalance || 0) * 100));

    const newBalPaisa = curBalPaisa + refundAmountInPaisa;
    const newDepPaisa = curDepPaisa + refundAmountInPaisa;

    transaction.set(walletRef, {
      userId,
      balanceInPaisa: newBalPaisa,
      depositBalanceInPaisa: newDepPaisa,
      balance: newBalPaisa / 100.0,
      depositBalance: newDepPaisa / 100.0,
      updatedAt: now,
    }, { merge: true });

    const txRef = walletRef.collection("transactions").doc();
    const globalTxRef = db.collection("transactions").doc(txRef.id);
    const ledgerRef = db.collection("ledgerEntries").doc(txRef.id);

    const idempotencyKey = `refund_${txRef.id}`;
    const txPayload = {
      transactionId: txRef.id,
      idempotencyKey,
      userId,
      type: "REFUND",
      amountInPaisa: refundAmountInPaisa,
      amount,
      balanceBeforeInPaisa: curBalPaisa,
      balanceAfterInPaisa: newBalPaisa,
      tournamentId: tournId || "",
      status: "CONFIRMED",
      description: `Manual Refund: ${reason || "Admin compensation"}`,
      timestamp: now,
    };

    transaction.set(txRef, txPayload);
    transaction.set(globalTxRef, txPayload);
    transaction.set(ledgerRef, txPayload);

    // Notify player
    const notifRef = db.collection("notifications").doc();
    transaction.set(notifRef, {
      userId,
      title: "Refund Credited to Wallet",
      message: `৳${amount} has been refunded to your wallet. Reason: ${reason || "Admin compensation"}`,
      type: "REWARD_CREDIT",
      referenceId: txRef.id,
      read: false,
      createdAt: now,
    });

    const auditRef = db.collection("adminAuditLogs").doc();
    transaction.set(auditRef, {
      adminId,
      action: "MANUAL_REFUND_ISSUED",
      targetId: userId,
      details: { amount, tournamentId: tournId, reason },
      timestamp: now,
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const btnResolve = document.getElementById("btn-confirm-resolve-report");
  if (btnResolve) btnResolve.addEventListener("click", handleConfirmResolveReport);

  const formRefund = document.getElementById("form-manual-refund");
  if (formRefund) formRefund.addEventListener("submit", handleConfirmManualRefund);
});

window.loadDisputes = loadDisputes;
window.filterDisputes = filterDisputes;
window.openResolveReportModal = openResolveReportModal;
window.handleDismissReport = handleDismissReport;
window.openManualRefundModal = openManualRefundModal;
window.handleDisputeCheckChange = handleDisputeCheckChange;
window.toggleSelectAllDisputes = toggleSelectAllDisputes;
window.openBulkDeleteDisputesModal = openBulkDeleteDisputesModal;
window.handleConfirmBulkDeleteDisputes = handleConfirmBulkDeleteDisputes;

window.loadSupportTickets = loadSupportTickets;
window.filterSupportTickets = filterSupportTickets;
window.openRespondSupportTicketModal = openRespondSupportTicketModal;
window.executeRespondSupportTicket = executeRespondSupportTicket;
window.openSendNotificationModal = openSendNotificationModal;
window.executeSendCustomNotification = executeSendCustomNotification;
window.handleSupportCheckChange = handleSupportCheckChange;
window.toggleSelectAllSupportTickets = toggleSelectAllSupportTickets;
window.openBulkDeleteSupportTicketsModal = openBulkDeleteSupportTicketsModal;
window.handleConfirmBulkDeleteSupportTickets = handleConfirmBulkDeleteSupportTickets;
