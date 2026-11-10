/**
 * App Update & Version Management Module for FFTournament Web Admin Panel.
 * Handles:
 * 1. Direct Firebase APK Updates (Pre-Play Store):
 *    - APK upload to Firebase Storage with live progress.
 *    - Client-side SHA-256 checksum computation via Web Crypto API.
 *    - Version metadata published to Firebase Realtime Database (/appUpdates/direct).
 * 2. Google Play Store In-App Updates (Post-Launch):
 *    - Mode switching between DIRECT and PLAY_STORE.
 *    - Play Core update flow settings (IMMEDIATE vs FLEXIBLE).
 * 3. Emergency Maintenance Mode switch.
 * 4. Release History & Rollback / Disable records.
 * 5. Immutable Administrative Audit Logging.
 */

let selectedApkFile = null;
let computedApkSha256 = "";
let currentActiveMode = "DIRECT";
let currentLatestVersionCode = 1;

/**
 * Initialize and load App Updates module
 */
window.loadAppUpdatesModule = async function () {
  const syncBadge = document.getElementById("update-system-sync-status");
  if (syncBadge) syncBadge.textContent = "Loading...";

  try {
    if (!rtdb) {
      throw new Error("Firebase Realtime Database is not initialized. Check firebase-config.js.");
    }

    // Read full appUpdates node
    const snapshot = await rtdb.ref("appUpdates").once("value");
    const data = snapshot.val() || {};

    renderAppUpdatesState(data);
    loadReleaseHistory(data.history || {});

    if (syncBadge) syncBadge.textContent = "Realtime Synced";
  } catch (error) {
    console.error("Error loading app updates config:", error);
    if (window.showToast) window.showToast("Failed to load App Update data: " + error.message, "error");
    if (syncBadge) syncBadge.textContent = "Offline / Error";
  }
};

/**
 * Render KPI cards and controls state
 */
function renderAppUpdatesState(data) {
  const config = data.config || {};
  const direct = data.direct || {};
  const playstore = data.playstore || {};

  currentActiveMode = (config.activeMode || "DIRECT").toUpperCase();
  currentLatestVersionCode = parseInt(direct.latestVersionCode, 10) || 1;

  // KPIs
  const kpiMode = document.getElementById("kpi-update-mode");
  const kpiModeDesc = document.getElementById("kpi-update-mode-desc");
  const kpiLatestVersion = document.getElementById("kpi-latest-version");
  const kpiLatestCode = document.getElementById("kpi-latest-version-code");
  const kpiMinVersion = document.getElementById("kpi-min-version");
  const kpiMandatory = document.getElementById("kpi-mandatory-status");
  const kpiMaintenance = document.getElementById("kpi-maintenance-status");

  if (kpiMode) {
    kpiMode.textContent = currentActiveMode;
    kpiMode.style.color = currentActiveMode === "PLAY_STORE" ? "var(--accent-cyan)" : "var(--primary)";
  }
  if (kpiModeDesc) {
    kpiModeDesc.textContent = currentActiveMode === "PLAY_STORE" ? "Google Play In-App Updates" : "Firebase Direct APK";
  }
  if (kpiLatestVersion) {
    kpiLatestVersion.textContent = direct.latestVersionName ? `v${direct.latestVersionName}` : "v1.0";
  }
  if (kpiLatestCode) {
    kpiLatestCode.textContent = `Version Code: ${direct.latestVersionCode || 1}`;
  }
  if (kpiMinVersion) {
    kpiMinVersion.textContent = `Code: ${direct.minimumSupportedVersion || 1}`;
  }
  if (kpiMandatory) {
    kpiMandatory.textContent = direct.mandatory ? "Mandatory" : "Optional";
    kpiMandatory.style.color = direct.mandatory ? "var(--accent-red)" : "var(--accent-green)";
  }
  if (kpiMaintenance) {
    const isMaint = direct.maintenanceMode === true;
    kpiMaintenance.textContent = isMaint ? "ACTIVE (BLOCKED)" : "INACTIVE";
    kpiMaintenance.style.color = isMaint ? "var(--accent-red)" : "var(--accent-green)";
  }

  // Radio button for active mode
  const radioDirect = document.getElementById("radio-mode-direct");
  const radioPlay = document.getElementById("radio-mode-play");
  if (radioDirect && radioPlay) {
    if (currentActiveMode === "PLAY_STORE") {
      radioPlay.checked = true;
    } else {
      radioDirect.checked = true;
    }
  }

  // Active mode highlight cards
  const cardDirect = document.getElementById("card-mode-direct-publisher");
  const cardPlay = document.getElementById("card-mode-play-publisher");
  if (cardDirect && cardPlay) {
    if (currentActiveMode === "PLAY_STORE") {
      cardDirect.style.opacity = "0.75";
      cardPlay.style.opacity = "1";
      cardPlay.style.borderColor = "var(--accent-cyan)";
    } else {
      cardDirect.style.opacity = "1";
      cardPlay.style.opacity = "0.75";
      cardPlay.style.borderColor = "var(--border-color)";
    }
  }

  // Maintenance Toggle
  const chkMaint = document.getElementById("chk-maintenance-mode");
  const lblMaint = document.getElementById("maintenance-toggle-label");
  const msgMaint = document.getElementById("input-maintenance-message");
  if (chkMaint) chkMaint.checked = direct.maintenanceMode === true;
  if (lblMaint) lblMaint.textContent = direct.maintenanceMode === true ? "ON (BLOCKED)" : "OFF";
  if (msgMaint && direct.maintenanceMessage) msgMaint.value = direct.maintenanceMessage;

  // Direct APK form prep
  const txtCurrentVCode = document.getElementById("txt-current-vcode");
  const inputVCode = document.getElementById("apk-version-code");
  const inputMinVCode = document.getElementById("apk-min-version-code");
  const inputVName = document.getElementById("apk-version-name");
  const inputTitle = document.getElementById("apk-update-title");
  const inputChangelog = document.getElementById("apk-update-changelog");
  const chkMandatory = document.getElementById("apk-mandatory-update");

  if (txtCurrentVCode) txtCurrentVCode.textContent = direct.latestVersionCode || 1;
  if (inputVCode && !inputVCode.value) {
    inputVCode.value = (parseInt(direct.latestVersionCode, 10) || 1) + 1;
  }
  if (inputMinVCode && !inputMinVCode.value) {
    inputMinVCode.value = direct.minimumSupportedVersion || 1;
  }
  if (inputVName && !inputVName.value && direct.latestVersionName) {
    inputVName.value = direct.latestVersionName;
  }
  if (inputTitle && !inputTitle.value && direct.updateTitle) {
    inputTitle.value = direct.updateTitle;
  }
  if (inputChangelog && !inputChangelog.value && direct.updateDescription) {
    inputChangelog.value = direct.updateDescription;
  }
  if (chkMandatory) {
    chkMandatory.checked = direct.mandatory === true;
  }

  // Play Store Form prep
  const selPlayType = document.getElementById("play-update-type");
  const inputPlayMinCode = document.getElementById("play-min-version-code");
  const chkPlayEnabled = document.getElementById("chk-playstore-enabled");

  if (selPlayType && playstore.updateType) selPlayType.value = playstore.updateType;
  if (inputPlayMinCode && playstore.minimumSupportedVersion) inputPlayMinCode.value = playstore.minimumSupportedVersion;
  if (chkPlayEnabled) chkPlayEnabled.checked = playstore.enabled !== false;
}

/**
 * Handle APK file selection and compute SHA-256 Checksum client-side
 */
window.onApkFileSelected = async function (file) {
  if (!file) return;

  if (!file.name.toLowerCase().endsWith(".apk")) {
    if (window.showToast) window.showToast("Invalid file! Please select a valid .apk file.", "error");
    return;
  }

  selectedApkFile = file;
  computedApkSha256 = "";

  const previewCard = document.getElementById("apk-file-preview-card");
  const nameEl = document.getElementById("apk-preview-name");
  const sizeEl = document.getElementById("apk-preview-size");
  const sha256El = document.getElementById("apk-preview-sha256");

  if (previewCard) previewCard.style.display = "block";
  if (nameEl) nameEl.textContent = file.name;
  if (sizeEl) sizeEl.textContent = `${(file.size / (1024 * 1024)).toFixed(2)} MB`;
  if (sha256El) sha256El.textContent = "⏳ Computing SHA-256 Checksum from binary bytes...";

  try {
    computedApkSha256 = await calculateFileSha256(file);
    if (sha256El) sha256El.textContent = computedApkSha256;
    if (window.showToast) window.showToast("SHA-256 Checksum verified!", "success");
  } catch (e) {
    console.error("SHA-256 computation error:", e);
    if (sha256El) sha256El.textContent = "Failed to calculate checksum: " + e.message;
  }
};

/**
 * Compute SHA-256 using browser's Web Crypto API
 */
async function calculateFileSha256(file) {
  const arrayBuffer = await file.arrayBuffer();
  const hashBuffer = await window.crypto.subtle.digest("SHA-256", arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return hashHex;
}

/**
 * Handle Upload & Publish Direct APK Release
 */
window.handlePublishDirectApk = async function (e) {
  if (e) e.preventDefault();

  if (!selectedApkFile) {
    if (window.showToast) window.showToast("Please choose or drop an APK file first!", "warning");
    return;
  }

  if (!computedApkSha256) {
    if (window.showToast) window.showToast("SHA-256 Checksum is still computing. Please wait a few seconds...", "warning");
    return;
  }

  const versionName = (document.getElementById("apk-version-name")?.value || "").trim();
  const versionCode = parseInt(document.getElementById("apk-version-code")?.value || "0", 10);
  const minVersionCode = parseInt(document.getElementById("apk-min-version-code")?.value || "1", 10);
  const updateTitle = (document.getElementById("apk-update-title")?.value || "").trim();
  const updateDescription = (document.getElementById("apk-update-changelog")?.value || "").trim();
  const mandatory = document.getElementById("apk-mandatory-update")?.checked === true;

  if (!versionName || !versionCode || !updateTitle || !updateDescription) {
    if (window.showToast) window.showToast("Please fill all required update fields.", "warning");
    return;
  }

  if (versionCode <= 0) {
    if (window.showToast) window.showToast("Version code must be a positive integer.", "error");
    return;
  }

  if (versionCode <= currentLatestVersionCode) {
    const proceed = confirm(
      `Warning: New Version Code (${versionCode}) is not greater than Current Version Code (${currentLatestVersionCode}). Android cannot upgrade without a higher version code. Are you sure you want to proceed?`
    );
    if (!proceed) return;
  }

  const confirmPublish = confirm(
    `Confirm App Release Publication?\n\n• Version: v${versionName} (Code: ${versionCode})\n• Mandatory: ${mandatory ? "YES (Blocking)" : "NO (Optional)"}\n• SHA-256: ${computedApkSha256.substring(0, 16)}...\n\nAll players will receive this update upon next app launch.`
  );
  if (!confirmPublish) return;

  const btnPublish = document.getElementById("btn-publish-direct-release");
  const progressContainer = document.getElementById("apk-upload-progress-container");
  const progressBar = document.getElementById("apk-upload-progress-bar");
  const percentText = document.getElementById("apk-upload-percent-text");
  const statusText = document.getElementById("apk-upload-status-text");

  try {
    if (btnPublish) {
      btnPublish.disabled = true;
      btnPublish.textContent = "Uploading Binary...";
    }
    if (progressContainer) progressContainer.style.display = "block";

    if (!storage) {
      throw new Error("Firebase Storage SDK not initialized.");
    }

    // 1. Upload APK to Firebase Storage
    const timestamp = Date.now();
    const storagePath = `app_releases/fftornament_v${versionCode}_${timestamp}.apk`;
    const storageRef = storage.ref(storagePath);

    const metadata = {
      contentType: "application/vnd.android.package-archive",
      customMetadata: {
        versionCode: versionCode.toString(),
        versionName: versionName,
        sha256: computedApkSha256,
        uploadedBy: currentAdminUser ? currentAdminUser.email : "admin",
      },
    };

    const uploadTask = storageRef.put(selectedApkFile, metadata);

    uploadTask.on(
      "state_changed",
      (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        if (progressBar) progressBar.style.width = `${progress}%`;
        if (percentText) percentText.textContent = `${Math.round(progress)}%`;
        if (statusText) {
          statusText.textContent = `Uploading APK... (${(snapshot.bytesTransferred / (1024 * 1024)).toFixed(1)} / ${(
            snapshot.totalBytes /
            (1024 * 1024)
          ).toFixed(1)} MB)`;
        }
      },
      (error) => {
        console.error("Storage upload error:", error);
        throw error;
      }
    );

    await uploadTask;
    if (statusText) statusText.textContent = "Upload complete. Getting secure download URL...";

    const downloadUrl = await storageRef.getDownloadURL();

    // 2. Publish to Realtime Database /appUpdates/direct
    const directPayload = {
      enabled: true,
      latestVersionCode: versionCode,
      latestVersionName: versionName,
      minimumSupportedVersion: minVersionCode,
      apkDownloadUrl: downloadUrl,
      apkStoragePath: storagePath,
      apkSha256: computedApkSha256,
      apkSizeBytes: selectedApkFile.size,
      updateTitle: updateTitle,
      updateDescription: updateDescription,
      mandatory: mandatory,
      maintenanceMode: false,
      publishedAt: firebase.database.ServerValue.TIMESTAMP,
    };

    await rtdb.ref("appUpdates/direct").update(directPayload);

    // Also record in history
    const releaseId = `v${versionCode}_${timestamp}`;
    await rtdb.ref(`appUpdates/history/${releaseId}`).set({
      id: releaseId,
      versionCode: versionCode,
      versionName: versionName,
      minimumSupportedVersion: minVersionCode,
      apkDownloadUrl: downloadUrl,
      apkStoragePath: storagePath,
      apkSha256: computedApkSha256,
      apkSizeBytes: selectedApkFile.size,
      updateTitle: updateTitle,
      updateDescription: updateDescription,
      mandatory: mandatory,
      mode: "DIRECT",
      status: "ACTIVE",
      publishedAt: Date.now(),
      publishedBy: currentAdminUser ? currentAdminUser.email : "admin",
    });

    // 3. Write Immutable Audit Log in Firestore (adminAuditLogs)
    await logAppUpdateAudit(
      "DIRECT_APK_RELEASE_PUBLISHED",
      `v${versionName} (Code ${versionCode})`,
      {
        versionName,
        versionCode,
        minVersionCode,
        mandatory,
        apkSha256: computedApkSha256,
        apkSizeBytes: selectedApkFile.size,
        storagePath,
      }
    );

    if (window.showToast) {
      window.showToast(`🎉 Version v${versionName} published successfully!`, "success");
    }

    // Reset upload card & reload
    selectedApkFile = null;
    computedApkSha256 = "";
    const previewCard = document.getElementById("apk-file-preview-card");
    if (previewCard) previewCard.style.display = "none";
    if (progressContainer) progressContainer.style.display = "none";
    const fileInput = document.getElementById("apk-file-input");
    if (fileInput) fileInput.value = "";

    window.loadAppUpdatesModule();
  } catch (error) {
    console.error("Failed to publish direct APK release:", error);
    if (window.showToast) window.showToast("Publish failed: " + error.message, "error");
    if (statusText) statusText.textContent = "Upload failed: " + error.message;
  } finally {
    if (btnPublish) {
      btnPublish.disabled = false;
      btnPublish.textContent = "🚀 Upload & Publish Update";
    }
  }
};

/**
 * Handle Switching Distribution Mode (DIRECT vs PLAY_STORE)
 */
window.handleModeRadioChange = async function (newMode) {
  if (newMode === currentActiveMode) return;

  const confirmMsg =
    newMode === "PLAY_STORE"
      ? "Switch App Distribution Channel to GOOGLE PLAY STORE?\n\nUsers will update via Google Play In-App Updates. Direct APK downloads will be deactivated."
      : "Switch App Distribution Channel to DIRECT FIREBASE APK?\n\nUsers will download and install APKs directly from Firebase.";

  if (!confirm(confirmMsg)) {
    // Revert radio button
    const radioDirect = document.getElementById("radio-mode-direct");
    const radioPlay = document.getElementById("radio-mode-play");
    if (radioDirect && radioPlay) {
      radioDirect.checked = currentActiveMode === "DIRECT";
      radioPlay.checked = currentActiveMode === "PLAY_STORE";
    }
    return;
  }

  try {
    await rtdb.ref("appUpdates/config/activeMode").set(newMode);

    await logAppUpdateAudit("APP_UPDATE_MODE_CHANGED", newMode, {
      previousMode: currentActiveMode,
      newMode: newMode,
    });

    if (window.showToast) {
      window.showToast(`Distribution channel switched to ${newMode}`, "success");
    }

    window.loadAppUpdatesModule();
  } catch (e) {
    console.error("Failed to change mode:", e);
    if (window.showToast) window.showToast("Failed to switch mode: " + e.message, "error");
  }
};

/**
 * Emergency Maintenance Mode Toggle
 */
window.toggleMaintenanceMode = async function (enable) {
  const confirmMsg = enable
    ? "⚠️ ACTIVATE EMERGENCY MAINTENANCE MODE?\n\nAll players will be immediately blocked from entering the arena or playing matches."
    : "DEACTIVATE MAINTENANCE MODE?\n\nNormal tournament gameplay access will resume for all players.";

  if (!confirm(confirmMsg)) {
    const chk = document.getElementById("chk-maintenance-mode");
    if (chk) chk.checked = !enable;
    return;
  }

  try {
    await rtdb.ref("appUpdates/direct/maintenanceMode").set(enable);

    await logAppUpdateAudit(
      "MAINTENANCE_MODE_TOGGLED",
      enable ? "MAINTENANCE_ACTIVE" : "MAINTENANCE_INACTIVE",
      { maintenanceMode: enable }
    );

    if (window.showToast) {
      window.showToast(enable ? "🛑 Emergency Maintenance Mode ACTIVATED" : "✅ Maintenance Mode Deactivated", "info");
    }

    window.loadAppUpdatesModule();
  } catch (e) {
    console.error("Failed to toggle maintenance mode:", e);
    if (window.showToast) window.showToast("Error updating maintenance mode: " + e.message, "error");
  }
};

/**
 * Save custom maintenance message
 */
window.saveMaintenanceMessage = async function () {
  const msgInput = document.getElementById("input-maintenance-message");
  const msg = (msgInput?.value || "").trim();
  if (!msg) {
    if (window.showToast) window.showToast("Notice message cannot be empty.", "warning");
    return;
  }

  try {
    await rtdb.ref("appUpdates/direct/maintenanceMessage").set(msg);
    if (window.showToast) window.showToast("Maintenance notice updated.", "success");
  } catch (e) {
    console.error("Error saving maintenance notice:", e);
    if (window.showToast) window.showToast("Failed to save notice: " + e.message, "error");
  }
};

/**
 * Save Google Play Store In-App Updates Configuration
 */
window.handleSavePlayStoreSettings = async function (e) {
  if (e) e.preventDefault();

  const playType = document.getElementById("play-update-type")?.value || "FLEXIBLE";
  const minCode = parseInt(document.getElementById("play-min-version-code")?.value || "1", 10);
  const playEnabled = document.getElementById("chk-playstore-enabled")?.checked === true;

  try {
    const payload = {
      enabled: playEnabled,
      updateType: playType,
      minimumSupportedVersion: minCode,
      updatedAt: firebase.database.ServerValue.TIMESTAMP,
    };

    await rtdb.ref("appUpdates/playstore").update(payload);

    await logAppUpdateAudit("PLAY_STORE_POLICY_UPDATED", playType, payload);

    if (window.showToast) window.showToast("Play Store update policy saved successfully!", "success");
    window.loadAppUpdatesModule();
  } catch (err) {
    console.error("Error saving Play Store settings:", err);
    if (window.showToast) window.showToast("Failed to save settings: " + err.message, "error");
  }
};

/**
 * Render Release History Table
 */
function loadReleaseHistory(historyObj) {
  const tbody = document.getElementById("app-releases-tbody");
  if (!tbody) return;

  const releases = Object.values(historyObj || {}).sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0));

  if (releases.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-secondary); padding: 24px;">No app releases published yet. Use the publisher above to deploy v1.1.0+.</td></tr>`;
    return;
  }

  tbody.innerHTML = releases
    .map((r) => {
      const dateStr = r.publishedAt ? new Date(r.publishedAt).toLocaleString() : "N/A";
      const sizeMb = r.apkSizeBytes ? `${(r.apkSizeBytes / (1024 * 1024)).toFixed(1)} MB` : "N/A";
      const shaShort = r.apkSha256 ? `${r.apkSha256.substring(0, 8)}...${r.apkSha256.substring(r.apkSha256.length - 8)}` : "N/A";
      const isActive = r.status !== "DISABLED";

      return `
      <tr>
        <td><strong>v${escapeHtml(r.versionName || "1.0")}</strong></td>
        <td><span class="badge badge-open">Code: ${r.versionCode || 1}</span></td>
        <td><span class="badge ${r.mode === "PLAY_STORE" ? "badge-info" : "badge-primary"}">${escapeHtml(r.mode || "DIRECT")}</span></td>
        <td>
          <code style="font-size: 11px; cursor: pointer;" title="Click to copy full SHA-256" onclick="copyToClipboard('${escapeHtml(r.apkSha256 || "")}')">
            ${shaShort} 📋
          </code>
        </td>
        <td>${sizeMb}</td>
        <td>
          <span class="badge ${r.mandatory ? "badge-closed" : "badge-in-review"}">
            ${r.mandatory ? "Mandatory" : "Optional"}
          </span>
        </td>
        <td style="font-size: 12px; color: var(--text-secondary);">${dateStr}</td>
        <td>
          <span class="badge ${isActive ? "badge-open" : "badge-closed"}">
            ${isActive ? "ACTIVE" : "DISABLED"}
          </span>
        </td>
        <td>
          <div style="display: flex; gap: 6px;">
            ${
              r.apkDownloadUrl
                ? `<a href="${escapeHtml(r.apkDownloadUrl)}" target="_blank" class="btn btn-secondary btn-sm" title="Download APK" download>⬇️ APK</a>`
                : ""
            }
            <button class="btn ${isActive ? "btn-danger" : "btn-success"} btn-sm" onclick="toggleReleaseActiveStatus('${escapeHtml(r.id)}', ${isActive})">
              ${isActive ? "Disable" : "Re-enable"}
            </button>
          </div>
        </td>
      </tr>
    `;
    })
    .join("");
}

/**
 * Toggle individual release status
 */
window.toggleReleaseActiveStatus = async function (releaseId, currentlyActive) {
  const actionName = currentlyActive ? "Disable" : "Re-enable";
  if (!confirm(`Are you sure you want to ${actionName} release ${releaseId}?`)) return;

  try {
    const newStatus = currentlyActive ? "DISABLED" : "ACTIVE";
    await rtdb.ref(`appUpdates/history/${releaseId}/status`).set(newStatus);

    await logAppUpdateAudit(`APP_RELEASE_${newStatus}`, releaseId, { releaseId, newStatus });

    if (window.showToast) window.showToast(`Release ${releaseId} marked as ${newStatus}`, "info");
    window.loadAppUpdatesModule();
  } catch (e) {
    console.error("Error toggling release status:", e);
    if (window.showToast) window.showToast("Failed to update status: " + e.message, "error");
  }
};

/**
 * Non-blocking Audit Logging Helper
 */
async function logAppUpdateAudit(action, target, details) {
  try {
    if (!db) return;
    const adminId = (currentAdminUser && currentAdminUser.uid) || (auth.currentUser && auth.currentUser.uid) || "ADMIN";
    const adminEmail = (currentAdminUser && currentAdminUser.email) || (auth.currentUser && auth.currentUser.email) || "admin";

    await db.collection("adminAuditLogs").add({
      action: action,
      adminId: adminId,
      adminEmail: adminEmail,
      target: target || "APP_UPDATE",
      details: typeof details === "object" ? JSON.stringify(details) : String(details || ""),
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.warn("Audit logging failed (non-blocking):", err.message);
  }
}

/**
 * Copy to clipboard utility
 */
window.copyToClipboard = function (text) {
  if (!text) return;
  navigator.clipboard.writeText(text).then(
    () => {
      if (window.showToast) window.showToast("Copied to clipboard!", "success");
    },
    (err) => {
      console.error("Could not copy text: ", err);
    }
  );
};

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

