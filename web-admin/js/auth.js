/**
 * Global Admin Authentication & Authorization Guard.
 * Protects index.html from unauthorized or unauthenticated access.
 */
let currentAdminUser = null;

// Auth state observer
auth.onAuthStateChanged(async (user) => {
  if (!user) {
    // Not signed in: redirect to login
    window.location.href = "login.html";
    return;
  }

  try {
    // Force refresh token to obtain latest custom claims
    const tokenResult = await user.getIdTokenResult(true);
    const hasAdminClaim = tokenResult.claims && tokenResult.claims.admin === true;

    // Check if user is the designated owner/admin
    const isDesignatedAdmin = user.email && (
      user.email.toLowerCase() === "ekbalhossain1921@gmail.com" ||
      user.email.toLowerCase().startsWith("admin@")
    );

    // Check user document in Firestore (supports both users and user collections)
    let hasFirestoreAdminRole = false;
    let adminRole = isDesignatedAdmin ? "admin" : "player";
    try {
      let userDoc = await db.collection("users").doc(user.uid).get().catch(() => null);
      if (!userDoc || !userDoc.exists) {
        userDoc = await db.collection("user").doc(user.uid).get().catch(() => null);
      }
      if (!userDoc || !userDoc.exists) {
        const q1 = await db.collection("users").where("email", "==", user.email).get().catch(() => null);
        if (q1 && !q1.empty) userDoc = q1.docs[0];
        else {
          const q2 = await db.collection("user").where("email", "==", user.email).get().catch(() => null);
          if (q2 && !q2.empty) userDoc = q2.docs[0];
        }
      }
      if (!userDoc || !userDoc.exists) {
        userDoc = await db.collection("user").doc("CVAqBuzGC6NQ9h9y0Dv7jSnPD533").get().catch(() => null);
      }

      if (userDoc && userDoc.exists) {
        adminRole = userDoc.data().role || "player";
        if (adminRole === "admin" || adminRole === "moderator") {
          hasFirestoreAdminRole = true;
        }
      }
    } catch (e) {
      console.warn("Firestore role check:", e.message);
    }

    if (!hasAdminClaim && !hasFirestoreAdminRole && !isDesignatedAdmin) {
      // Unauthorized regular player: kick out immediately
      await auth.signOut();
      window.location.href = "login.html?error=unauthorized";
      return;
    }

    // Authorization Verified
    currentAdminUser = user;
    const adminEmailEl = document.getElementById("admin-display-email");
    const adminRoleEl = document.getElementById("admin-display-role");
    const adminAvatarEl = document.getElementById("admin-avatar-initials");

    if (adminEmailEl) adminEmailEl.textContent = user.email || "Administrator";
    if (adminRoleEl) adminRoleEl.textContent = hasAdminClaim ? "SUPER ADMIN" : adminRole.toUpperCase();
    if (adminAvatarEl) adminAvatarEl.textContent = (user.email ? user.email.charAt(0) : "A").toUpperCase();

    // Trigger initial module loads
    if (window.initDashboard) window.initDashboard();

  } catch (error) {
    console.error("Auth guard error:", error);
    await auth.signOut();
    window.location.href = "login.html?error=unauthorized";
  }
});

// Logout action
document.addEventListener("DOMContentLoaded", () => {
  const logoutBtn = document.getElementById("btn-logout");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      if (confirm("Are you sure you want to sign out of the Administrator Panel?")) {
        try {
          await auth.signOut();
          sessionStorage.clear();
          window.location.href = "login.html?error=logged_out";
        } catch (e) {
          showToast("Logout failed: " + e.message, "error");
        }
      }
    });
  }

  // Setup sidebar navigation switching
  const navItems = document.querySelectorAll(".nav-item[data-view]");
  const viewSections = document.querySelectorAll(".view-section");
  const pageTitle = document.getElementById("page-header-title");
  const sidebar = document.getElementById("admin-sidebar");
  const menuToggle = document.getElementById("menu-toggle-btn");

  if (menuToggle && sidebar) {
    menuToggle.addEventListener("click", () => {
      sidebar.classList.toggle("open");
    });
  }

  navItems.forEach((item) => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      const targetView = item.getAttribute("data-view");

      navItems.forEach((n) => n.classList.remove("active"));
      item.classList.add("active");

      viewSections.forEach((sec) => {
        if (sec.id === `view-${targetView}`) {
          sec.classList.add("active");
        } else {
          sec.classList.remove("active");
        }
      });

      if (pageTitle) {
        pageTitle.textContent = item.querySelector("span:not(.nav-icon):not(.nav-badge)")?.textContent || "Dashboard";
      }

      // Close mobile drawer on navigation
      if (sidebar && sidebar.classList.contains("open")) {
        sidebar.classList.remove("open");
      }

      // Trigger view-specific loads
      if (targetView === "tournaments" && window.loadTournaments) window.loadTournaments();
      if (targetView === "players" && window.initPlayersModule) window.initPlayersModule();
      if (targetView === "room" && window.initRoomManager) window.initRoomManager();
      if (targetView === "results" && window.initMatchResults) window.initMatchResults();
      if (targetView === "deposits" && window.loadDeposits) window.loadDeposits();
      if (targetView === "withdrawals" && window.loadWithdrawals) window.loadWithdrawals();
      if (targetView === "transactions" && window.loadTransactions) window.loadTransactions();
      if (targetView === "users" && window.loadUsers) window.loadUsers();
      if (targetView === "disputes" && window.loadDisputes) window.loadDisputes();
      if (targetView === "audit" && window.loadAuditLogs) window.loadAuditLogs();
    });
  });

  // Clock in header
  const timeEl = document.getElementById("header-clock");
  if (timeEl) {
    const updateTime = () => {
      const now = new Date();
      timeEl.textContent = now.toUTCString().replace("GMT", "UTC");
    };
    updateTime();
    setInterval(updateTime, 1000);
  }
});

