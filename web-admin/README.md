# FFTournament - Web Administrator Panel

A responsive, zero-trust web application for managing Free Fire tournaments, custom match rooms, registered player rosters, financial transactions (deposits & withdrawals), disputes, and platform audit logs.

---

## 🛠 Technology Stack

- **Frontend:** HTML5, Modern CSS3 (Dark Gaming Theme with CSS Custom Properties), Vanilla JavaScript (ES6+).
- **Backend Services:** Firebase Authentication, Cloud Firestore, Firebase Cloud Functions.
- **SDK:** Official Firebase JavaScript SDK v10 (Compat CDN).

---

## 🔒 Security Principles

1. **Zero-Trust Role Enforcement:**
   - Client-side checks are never trusted alone.
   - Every administrative action is guarded by `assertAdmin(context)` inside Firebase Cloud Functions and Firestore Security Rules.
   - Regular player tokens are strictly blocked from reading or writing sensitive documents.
2. **No Direct Wallet Manipulation:**
   - Financial balances (`wallets/{userId}`) cannot be directly written to from any browser or client.
   - All balance changes (deposits, prize payouts, withdrawal refunds) are executed through atomic Cloud Function transactions.
3. **Immutable Audit Trail:**
   - Every tournament creation, cancellation, room configuration, deposit approval, withdrawal rejection, or ban action creates an immutable log record in `/adminAuditLogs` and `/tournaments/{id}/auditLogs`.
   - Firestore security rules explicitly deny updating or deleting audit logs (`allow update, delete: if false`).

---

## 🚀 Local Development Setup

### Option 1: PowerShell Local Server (Instant, No Node/Python Required)

Run the included PowerShell server directly from the `web-admin` folder:

```powershell
cd web-admin
.\serve.ps1
```

Open your browser at:
```text
http://localhost:8080/login.html
```

### Option 2: Python HTTP Server (If Python is available)

```bash
cd web-admin
python -m http.server 8080
```

### Option 3: Firebase CLI Local Emulator

```bash
firebase emulators:start
```

---

## 👤 Provisioning Your First Administrator Account

Because public administrator registration is strictly forbidden for security reasons, you can designate an administrator account using one of two methods:

### Method A: Via Cloud Firestore Console
1. Create a user account using the Android app or Firebase Auth Console.
2. Open Firebase Console -> **Cloud Firestore** -> `users` collection.
3. Find your user document (`users/{uid}`).
4. Change or add the field:
   ```json
   "role": "admin"
   ```
5. You can now log in at `http://localhost:8080/login.html`.

### Method B: Via Firebase Admin SDK (Custom Claims)
Run a script or Cloud Function using Firebase Admin SDK:
```javascript
const admin = require("firebase-admin");
await admin.auth().setCustomUserClaims(uid, { admin: true, role: "admin" });
```

---

## 🚢 Production Deployment to Firebase Hosting

To deploy the web admin panel along with security rules and Cloud Functions to production:

```bash
# 1. Login to Firebase CLI
firebase login

# 2. Deploy Firestore Rules
firebase deploy --only firestore:rules

# 3. Deploy Cloud Functions
firebase deploy --only functions

# 4. Deploy Web Admin to Firebase Hosting
firebase deploy --only hosting
```

---

## 📂 Features Checklist

- [x] **Secure Administrator Login** (with client & server-side authorization check)
- [x] **Dashboard Statistics** (Users, active matches, pending deposits & withdrawals, prize pool)
- [x] **Tournament Management** (Create, edit, cancel with custom rules and schedules)
- [x] **Registered Players Manifest** (View slots, team names, Free Fire UIDs, export roster)
- [x] **Match Room Manager** (Room ID, Password, release timing, instructions, status badges)
- [x] **Match Results & Payouts** (Rank & kills evaluation, atomic prize distribution to player wallets)
- [x] **Deposit Review** (Approve & credit wallet, or reject with reason)
- [x] **Withdrawal Review** (Approve with transaction reference, or reject with automatic wallet refund)
- [x] **Transaction History** (Complete platform ledger)
- [x] **User Management** (Search, view profiles, Free Fire UID, ban/unban, edit roles)
- [x] **Disputes & Reports** (Review lobby intruders and cheaters, issue manual refunds)
- [x] **Immutable Audit Trail** (Detailed JSON payload inspection for all admin actions)

