/*
  The site's connection to Firebase (Firestore for data, Auth for sign-in).

  Nothing here needs configuring: Firebase Hosting serves the project's own
  config at /__/firebase/init.js, so the same files work on mkgservices.com,
  on preview channels, and in the local emulator. Opened from anywhere else
  (a plain file server), there is no Firebase and every page falls back to
  "demo" behaviour: the calendar shows all windows open and the quote form
  shows its demo confirmation.

  Data layout (and who may do what) is in firestore.rules. In short: a
  request's hold on the calendar is holds/{requestId}; staff-only fields
  (private notes, assignee) live in internal/{requestId}, never on the
  request the customer can read.

  Everything is exposed as window.MKG.backend; see the bottom of the file.
*/
(function () {
  "use strict";
  var C = window.MKG = window.MKG || {};
  var SDK = "10.14.1";
  var base = "/__/firebase/";
  var fb = null, db = null, auth = null;
  var OPEN = { new: true, confirmed: true };

  function script(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src; s.async = false;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error("failed " + src)); };
      document.head.appendChild(s);
    });
  }

  // Resolves to true when Firebase is available, false otherwise. Never rejects.
  var ready = (function () {
    if (location.protocol === "file:") return Promise.resolve(false);
    var useEmu = /[?&]emulator=1/.test(location.search) || /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
    return script(base + SDK + "/firebase-app-compat.js")
      .then(function () { return script(base + SDK + "/firebase-auth-compat.js"); })
      .then(function () { return script(base + SDK + "/firebase-firestore-compat.js"); })
      .then(function () { return script(base + "init.js" + (useEmu ? "?useEmulator=true" : "")); })
      .then(function () {
        if (!window.firebase || !window.firebase.apps || !window.firebase.apps.length) return false;
        fb = window.firebase;
        db = fb.firestore();
        auth = fb.auth();
        return true;
      })
      .catch(function () { return false; });
  })();

  // ---------- dates ----------
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function ymd(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function parse(s) { var p = s.split("-"); return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])); }
  function addDays(d, n) { var x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; }

  // ---------- helpers ----------
  // Pending server timestamps read as the local estimate instead of null.
  var EST = { serverTimestamps: "estimate" };
  function rows(snap, clean) { return snap.docs.map(function (d) { var x = d.data(EST); x.id = d.id; return clean ? clean(x) : x; }); }
  function stamp() { return fb.firestore.FieldValue.serverTimestamp(); }
  function holdRef(id) { return db.collection("holds").doc(id); }
  function holdsOf(requestId) { return db.collection("holds").where("requestId", "==", requestId).get(); }
  function isTs(v) { return !!v && typeof v.toMillis === "function"; }

  // Whatever is stored, pages get fields of the type they expect, so one odd
  // record can't break a list.
  var STR = ["name", "email", "emailLower", "phone", "notes", "zip", "company", "service", "plan", "frequency",
    "replyNote", "payLink", "date", "slot", "status", "segment", "homeType", "facilityType", "pets", "floors",
    "contactMethod", "timeOfDay", "language", "cancelledBy", "movedFrom", "source", "requestedTime",
    "deepCleanWithin", "flooring", "adminNotes", "assignedTo"];
  var NUM = ["estimatePerVisit", "estimateOneVisit", "estimateFullPrice", "estimatePerMonth", "quotedPrice",
    "discount", "bedrooms", "bathrooms", "sqft", "restrooms"];
  function cleanRequest(x) {
    STR.forEach(function (k) { if (x[k] === undefined || x[k] === null) delete x[k]; else if (typeof x[k] !== "string") x[k] = String(x[k]); });
    NUM.forEach(function (k) { if (x[k] !== undefined && (typeof x[k] !== "number" || !isFinite(x[k]))) delete x[k]; });
    ["createdAt", "updatedAt", "movedByClientAt"].forEach(function (k) { if (x[k] !== undefined && !isTs(x[k])) delete x[k]; });
    x.date = /^\d{4}-\d{2}-\d{2}$/.test(x.date || "") ? x.date : "";
    x.slot = x.slot || "";
    x.days = Array.isArray(x.days) ? x.days.filter(function (d) { return typeof d === "string"; }) : [];
    x.outOfArea = x.outOfArea === true;
    return x;
  }
  function cleanShift(x) {
    if (!isTs(x.inAt)) x.inAt = null;
    if (!isTs(x.outAt)) x.outAt = null;
    x.requestId = typeof x.requestId === "string" ? x.requestId : "";
    x.note = typeof x.note === "string" ? x.note : "";
    x.email = typeof x.email === "string" ? x.email : String(x.uid || "");
    return x;
  }

  // ---------- public: calendar ----------
  // Holds and blocked days between two YYYY-MM-DD strings (inclusive).
  function availability(from, to) {
    return ready.then(function (ok) {
      if (!ok) return { live: false, holds: [], days: {} };
      var q1 = db.collection("holds").where("date", ">=", from).where("date", "<=", to).get();
      var q2 = db.collection("days").where(fb.firestore.FieldPath.documentId(), ">=", from)
        .where(fb.firestore.FieldPath.documentId(), "<=", to).get();
      return Promise.all([q1, q2]).then(function (r) {
        var holds = rows(r[0]).filter(function (h) { return typeof h.date === "string" && typeof h.slot === "string"; });
        var days = {};
        r[1].docs.forEach(function (d) { var x = d.data(); days[d.id] = { closed: x.closed === true, blockedSlots: Array.isArray(x.blockedSlots) ? x.blockedSlots : [] }; });
        return { live: true, holds: holds, days: days };
      });
    });
  }

  // ---------- public: quote requests ----------
  // Saves the request and, when a date and window were picked, its hold, in
  // one batch. Resolves with the new request id.
  function submitRequest(data) {
    return ready.then(function (ok) {
      if (!ok) throw new Error("no-backend");
      var now = stamp();
      var batch = db.batch();
      var ref = db.collection("requests").doc();
      var doc = Object.assign({}, data, {
        status: "new", createdAt: now,
        email: String(data.email || "").trim(),
        emailLower: String(data.email || "").trim().toLowerCase(),
        date: data.date || "", slot: data.slot || "",
        name: String(data.name || ""), phone: String(data.phone || ""), notes: String(data.notes || ""), zip: String(data.zip || ""),
      });
      Object.keys(doc).forEach(function (k) { if (doc[k] === undefined) delete doc[k]; });
      batch.set(ref, doc);
      if (doc.date && doc.slot) {
        batch.set(holdRef(ref.id), { date: doc.date, slot: doc.slot, requestId: ref.id, createdAt: now, segment: doc.segment || "residential" });
      }
      return batch.commit().then(function () { return ref.id; });
    });
  }

  // ---------- auth ----------
  function lang() { return (C.i18n && C.i18n.lang) || "en"; }
  function onAuth(cb) { ready.then(function (ok) { if (ok) auth.onAuthStateChanged(cb); else cb(null); }); }
  function signOut() { return ready.then(function (ok) { return ok ? auth.signOut() : null; }); }
  function signInPassword(email, password) { return auth.signInWithEmailAndPassword(email, password); }
  // One-tap sign-in with a Google account. A popup where the browser allows
  // it; otherwise the page redirects to Google and comes back signed in.
  function signInGoogle() {
    var provider = new fb.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    auth.languageCode = lang();
    return auth.signInWithPopup(provider).catch(function (e) {
      var code = e && e.code;
      if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment" || code === "auth/cancelled-popup-request") return auth.signInWithRedirect(provider);
      throw e;
    });
  }
  // ---------- accounts with a password ----------
  // Links in Firebase's emails (confirm email, reset password, sign-in link)
  // come back to the account page, which handles them on mkgservices.com.
  function actionUrl() { return location.origin + "/account.html"; }
  // New account: create it, save the name, and send the "confirm your email"
  // link. Until the email is confirmed the account can't see any requests
  // (firestore.rules), so nobody can sign up with someone else's address and
  // read their bookings.
  function signUpPassword(name, email, password) {
    auth.languageCode = lang();
    return auth.createUserWithEmailAndPassword(email, password).then(function (cred) {
      var u = cred.user;
      return (name ? u.updateProfile({ displayName: name }) : Promise.resolve())
        .then(function () { return u.sendEmailVerification({ url: actionUrl() }).catch(function () { /* they can resend */ }); })
        .then(function () { return u; });
    });
  }
  function sendVerification() {
    var u = auth.currentUser;
    if (!u) return Promise.reject(new Error("no-user"));
    auth.languageCode = lang();
    return u.sendEmailVerification({ url: actionUrl() });
  }
  // After the email is confirmed (maybe in another tab): reload the account
  // and refresh its sign-in token so the database sees the confirmation.
  function refreshUser() {
    var u = auth && auth.currentUser;
    if (!u) return Promise.resolve(null);
    return u.reload().then(function () { return auth.currentUser.getIdToken(true); }).then(function () { return auth.currentUser; });
  }
  function sendReset(email) { auth.languageCode = lang(); return auth.sendPasswordResetEmail(email, { url: actionUrl() }); }
  // A link from one of those emails, opened on this page: { mode, code } or null.
  function actionInfo() {
    try {
      var q = new URLSearchParams(location.search), mode = q.get("mode"), code = q.get("oobCode");
      return mode && code && mode !== "signIn" ? { mode: mode, code: code } : null;
    } catch (e) { return null; }
  }
  function clearActionParams() {
    try { var u = new URL(location.href); ["apiKey", "oobCode", "mode", "lang", "continueUrl", "tenantId"].forEach(function (k) { u.searchParams.delete(k); }); history.replaceState(null, "", u.toString()); } catch (e) { /* ignore */ }
  }
  function applyCode(code) { return auth.applyActionCode(code); }
  function checkReset(code) { return auth.verifyPasswordResetCode(code); }      // resolves with the account's email
  function confirmReset(code, password) { return auth.confirmPasswordReset(code, password); }
  function currentUser() { return auth ? auth.currentUser : null; }
  // Which ways in this account has: "password", "google.com".
  function providers(u) { return ((u && u.providerData) || []).map(function (p) { return p.providerId; }); }

  // Remember on this browser that someone is signed in, so every page's nav
  // can say "My account" without loading Firebase.
  ready.then(function (ok) {
    if (!ok) return;
    auth.onAuthStateChanged(function (u) {
      try { if (u) localStorage.setItem("mkg.account", "1"); else localStorage.removeItem("mkg.account"); } catch (e) { /* private mode */ }
      if (C.app && C.app.accountNav) C.app.accountNav();
    });
  });

  // Passwordless sign-in for clients: a link is emailed; opening it signs them in.
  var LINK_KEY = "mkg.signInEmail";
  function sendLink(email, returnTo) {
    auth.languageCode = lang(); // the email, and the page it returns to, in the visitor's language
    return auth.sendSignInLinkToEmail(email, { url: returnTo || location.href, handleCodeInApp: true })
      .then(function () { try { localStorage.setItem(LINK_KEY, email); } catch (e) { /* ignore */ } });
  }
  function isLink() { return !!(auth && auth.isSignInWithEmailLink(location.href)); }
  function completeLink(email) {
    var e = email;
    if (!e) { try { e = localStorage.getItem(LINK_KEY); } catch (err) { /* ignore */ } }
    if (!e) return Promise.reject(new Error("need-email"));
    return auth.signInWithEmailLink(e, location.href).then(function (r) {
      try { localStorage.removeItem(LINK_KEY); } catch (err) { /* ignore */ }
      try { var u = new URL(location.href); ["apiKey", "oobCode", "mode", "lang", "continueUrl"].forEach(function (k) { u.searchParams.delete(k); }); history.replaceState(null, "", u.toString()); } catch (err) { /* ignore */ }
      return r.user;
    });
  }

  // ---------- the team ----------
  // Resolves with the admin record ({ email, role }) or null. Someone the
  // owner invited by email gets their record created on first sign-in, as
  // long as the sign-in verified that email (Google does; a password alone
  // does not).
  function isAdmin(user) {
    if (!user) return Promise.resolve(null);
    var ref = db.collection("admins").doc(user.uid);
    return ref.get().then(function (d) {
      if (d.exists) return d.data();
      if (!user.email || !user.emailVerified) return null;
      return db.collection("adminInvites").doc(user.email.toLowerCase()).get().then(function (inv) {
        if (!inv.exists) return null;
        var rec = { email: user.email.toLowerCase(), role: "admin", createdAt: stamp() };
        return ref.set(rec).then(function () { return rec; });
      });
    }).catch(function () { return null; });
  }
  // Still on the team? Asks the server, and rejects (rather than answering
  // "no") when it can't be reached, so a dropped connection signs nobody out.
  function stillAdmin(uid) {
    return db.collection("admins").doc(uid).get({ source: "server" }).then(function (d) { return d.exists; });
  }
  // The team list, live: every admin record plus every invite not yet used.
  function watchTeam(cb) {
    var admins = [], invites = [], seen = 0;
    function emit() {
      if (seen !== 3) return;
      var have = {}; admins.forEach(function (a) { have[a.email] = true; });
      cb(admins.concat(invites.filter(function (i) { return !have[i.email]; })));
    }
    var u1 = db.collection("admins").onSnapshot(function (r) {
      admins = r.docs.map(function (d) { var x = d.data(); return { uid: d.id, email: String(x.email || ""), role: x.role === "owner" ? "owner" : "admin", status: "active" }; });
      seen |= 1; emit();
    }, function (e) { cb(null, e); });
    var u2 = db.collection("adminInvites").onSnapshot(function (r) {
      invites = r.docs.map(function (d) { return { email: d.id, role: "admin", status: "invited" }; });
      seen |= 2; emit();
    }, function (e) { cb(null, e); });
    return function () { u1(); u2(); };
  }
  function inviteAdmin(email, byEmail) {
    var e = String(email || "").trim().toLowerCase();
    return db.collection("adminInvites").doc(e).set({ email: e, invitedBy: byEmail || "", createdAt: stamp() });
  }
  // Removing someone drops both their record (if they ever signed in) and their invite.
  function removeAdmin(member) {
    var b = db.batch();
    if (member.uid) b.delete(db.collection("admins").doc(member.uid));
    b.delete(db.collection("adminInvites").doc(member.email));
    return b.commit();
  }

  // ---------- time clock ----------
  // A member's own shifts, live (sorted by the caller).
  function watchMyShifts(uid, cb) {
    return db.collection("shifts").where("uid", "==", uid).onSnapshot(function (r) { cb(rows(r, cleanShift)); }, function (e) { cb(null, e); });
  }
  // Everyone's shifts that started on or after a date (owner only).
  function watchShiftsSince(fromTs, cb) {
    return db.collection("shifts").where("inAt", ">=", fromTs).orderBy("inAt", "desc").onSnapshot(function (r) { cb(rows(r, cleanShift)); }, function (e) { cb(null, e); });
  }
  function clockIn(user, requestId, note) {
    return db.collection("shifts").add({ uid: user.uid, email: String(user.email || "").toLowerCase(), inAt: stamp(), outAt: null, requestId: requestId || "", note: note || "" });
  }
  function clockOut(id) { return db.collection("shifts").doc(id).update({ outAt: stamp() }); }
  function updateShift(id, patch) { return db.collection("shifts").doc(id).update(patch); }
  function deleteShift(id) { return db.collection("shifts").doc(id).delete(); }
  function tsFromDate(d) { return fb.firestore.Timestamp.fromDate(d); }

  // ---------- client: own requests ----------
  function myRequests(email) {
    return db.collection("requests").where("emailLower", "==", String(email).toLowerCase()).get()
      .then(function (r) { return rows(r, cleanRequest).sort(byNewest); });
  }
  // Move a request to another day/window (or to "any window"). One batch:
  // the request changes, and its hold follows (made, moved, or dropped).
  // byClient: the customer did it from their account page, so the request
  // goes back to 'new' for the team to re-confirm, with a note of where it was.
  function reschedule(req, date, slot, byClient) {
    date = date || ""; slot = slot || "";
    return holdsOf(req.id).then(function (r) {
      var now = stamp(), b = db.batch(), hasOwn = false;
      var patch = { date: date, slot: slot, updatedAt: now };
      if (byClient) {
        patch.status = "new"; patch.movedByClientAt = now;
        patch.movedFrom = req.date ? req.date + (req.slot ? " " + req.slot : "") : "";
      }
      b.update(db.collection("requests").doc(req.id), patch);
      r.docs.forEach(function (d) { if (d.id === req.id) hasOwn = true; else b.delete(d.ref); }); // older holds had random ids
      var open = byClient || !!OPEN[req.status || "new"];
      if (date && slot && open) b.set(holdRef(req.id), { date: date, slot: slot, requestId: req.id, createdAt: now, segment: req.segment || "residential" });
      else if (hasOwn) b.delete(holdRef(req.id));
      return b.commit();
    });
  }
  // A customer cancels their own request; its window opens up again.
  function cancelRequest(id) {
    return holdsOf(id).then(function (r) {
      var b = db.batch();
      b.update(db.collection("requests").doc(id), { status: "cancelled", cancelledBy: "client", updatedAt: stamp() });
      r.docs.forEach(function (d) { b.delete(d.ref); });
      return b.commit();
    });
  }
  function byNewest(a, b) { return (toMs(b.createdAt) - toMs(a.createdAt)); }
  function toMs(ts) {
    if (isTs(ts)) return ts.toMillis();
    if (typeof ts === "string" || typeof ts === "number") { var n = new Date(ts).getTime(); return isFinite(n) ? n : 0; }
    return 0;
  }

  // ---------- admin ----------
  function watchRequests(cb) {
    return db.collection("requests").orderBy("createdAt", "desc").limit(300).onSnapshot(function (r) { cb(rows(r, cleanRequest)); }, function (err) { cb(null, err); });
  }
  function updateRequest(id, patch) {
    patch.updatedAt = stamp();
    return db.collection("requests").doc(id).update(patch);
  }
  // Staff-only fields, live: { requestId: { adminNotes, assignedTo } }.
  function watchInternal(cb) {
    return db.collection("internal").onSnapshot(function (r) {
      var m = {};
      r.docs.forEach(function (d) { var x = d.data(); m[d.id] = { adminNotes: typeof x.adminNotes === "string" ? x.adminNotes : "", assignedTo: typeof x.assignedTo === "string" ? x.assignedTo : "" }; });
      cb(m);
    }, function (e) { cb(null, e); });
  }
  function saveInternal(id, data) {
    return db.collection("internal").doc(id).set({ adminNotes: String(data.adminNotes || ""), assignedTo: String(data.assignedTo || ""), updatedAt: stamp() }, { merge: true });
  }
  // Declining or finishing a request frees its window.
  function releaseHolds(requestId) {
    return holdsOf(requestId).then(function (r) {
      var b = db.batch(); r.docs.forEach(function (d) { b.delete(d.ref); }); return b.commit();
    });
  }
  // Confirming or reopening puts it back on the calendar (when it has a window).
  function ensureHold(req) {
    if (!req.date || !req.slot || !OPEN[req.status || "new"]) return Promise.resolve();
    return holdsOf(req.id).then(function (r) {
      if (r.docs.length) return null;
      return holdRef(req.id).set({ date: req.date, slot: req.slot, requestId: req.id, createdAt: stamp(), segment: req.segment || "residential" });
    });
  }
  // A booking taken by phone: a confirmed request (so it can be assigned,
  // clocked against and seen in the lists) plus its hold. The name lives on
  // the request, which only the team can read; the public hold has none.
  function addPhoneBooking(date, slot, name, segment) {
    var ref = db.collection("requests").doc(), b = db.batch(), now = stamp(), seg = segment || "residential";
    b.set(ref, { name: String(name || "").slice(0, 120), email: "", emailLower: "", phone: "", notes: "", zip: "",
      segment: seg, date: date, slot: slot || "", status: "confirmed", source: "phone", createdAt: now, updatedAt: now });
    if (date && slot) b.set(holdRef(ref.id), { date: date, slot: slot, requestId: ref.id, createdAt: now, segment: seg });
    return b.commit().then(function () { return ref.id; });
  }
  // Owner only: a request, its hold(s) and its staff fields, gone for good.
  function deleteRequest(id) {
    return holdsOf(id).then(function (r) {
      var b = db.batch();
      r.docs.forEach(function (d) { b.delete(d.ref); });
      b.delete(db.collection("internal").doc(id));
      b.delete(db.collection("requests").doc(id));
      return b.commit();
    });
  }
  function deleteHold(id) { return holdRef(id).delete(); }
  function setDay(date, data) {
    if (!data || (!data.closed && !(data.blockedSlots || []).length)) return db.collection("days").doc(date).delete();
    return db.collection("days").doc(date).set({ closed: !!data.closed, blockedSlots: data.blockedSlots || [] });
  }

  C.backend = {
    ready: ready,
    get db() { return db; }, get auth() { return auth; }, get firebase() { return fb; },
    dates: { ymd: ymd, parse: parse, addDays: addDays, pad: pad },
    availability: availability, submitRequest: submitRequest,
    onAuth: onAuth, signOut: signOut, signInPassword: signInPassword, signInGoogle: signInGoogle, sendLink: sendLink, isLink: isLink, completeLink: completeLink,
    signUpPassword: signUpPassword, sendVerification: sendVerification, refreshUser: refreshUser, sendReset: sendReset,
    actionInfo: actionInfo, clearActionParams: clearActionParams, applyCode: applyCode, checkReset: checkReset, confirmReset: confirmReset,
    currentUser: currentUser, providers: providers,
    isAdmin: isAdmin, stillAdmin: stillAdmin, watchTeam: watchTeam, inviteAdmin: inviteAdmin, removeAdmin: removeAdmin,
    watchMyShifts: watchMyShifts, watchShiftsSince: watchShiftsSince, clockIn: clockIn, clockOut: clockOut, updateShift: updateShift, deleteShift: deleteShift, tsFromDate: tsFromDate,
    myRequests: myRequests, reschedule: reschedule, cancelRequest: cancelRequest, toMs: toMs,
    watchRequests: watchRequests, updateRequest: updateRequest, watchInternal: watchInternal, saveInternal: saveInternal,
    releaseHolds: releaseHolds, ensureHold: ensureHold, addPhoneBooking: addPhoneBooking, deleteRequest: deleteRequest, deleteHold: deleteHold, setDay: setDay,
  };
})();
