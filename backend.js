/*
  The site's connection to Firebase (Firestore for data, Auth for sign-in).

  Nothing here needs configuring: Firebase Hosting serves the project's own
  config at /__/firebase/init.json, so the same files work on mkgservices.com,
  on preview channels, and in the local emulator. Opened from anywhere else
  (a plain file server), there is no Firebase and every page falls back to
  "demo" behaviour: the calendar shows all windows open and the quote form
  shows its demo confirmation.

  Data layout (and who may do what) is in firestore.rules. In short: a
  request's hold on the calendar is holds/{requestId}, mirrored by a counter
  in slots/{date}_{slot} that the rules use to enforce capacity; staff-only
  fields (private notes, assignee) live in internal/{requestId}, never on the
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

  // The live site. www.mkgservices.com redirects here, but is listed too.
  var SITE = /^(www\.)?mkgservices\.com$/.test(location.hostname);

  // Resolves to true when Firebase is available, false otherwise. Never rejects.
  //
  // On mkgservices.com two things are switched on before anything is used:
  // - Sign-in runs on the site's own domain (authDomain) instead of the
  //   project's firebaseapp.com address, so Google's window says
  //   mkgservices.com and sign-in works in browsers that block third-party
  //   storage. Firebase Hosting serves /__/auth/handler on every domain it
  //   hosts; the Google OAuth client lists mkgservices.com as a redirect.
  // - App Check (plans.js appCheckKey): each database request carries a
  //   token showing it came from these pages. Enforcement is switched on in
  //   the Firebase console (App Check > APIs > Cloud Firestore).
  // Elsewhere (preview channels, the emulator) neither applies.
  var ready = (function () {
    if (location.protocol === "file:") return Promise.resolve(false);
    var useEmu = /[?&]emulator=1/.test(location.search) || /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
    var useAppCheck = SITE && !useEmu && !!C.appCheckKey;
    return script(base + SDK + "/firebase-app-compat.js")
      .then(function () { return script(base + SDK + "/firebase-auth-compat.js"); })
      .then(function () { return script(base + SDK + "/firebase-firestore-compat.js"); })
      .then(function () {
        if (!useAppCheck) return null;
        return script(base + SDK + "/firebase-app-check-compat.js").catch(function () { useAppCheck = false; });
      })
      .then(function () {
        if (useEmu) return script(base + "init.js?useEmulator=true");
        return fetch(base + "init.json").then(function (r) {
          if (!r.ok) throw new Error("no firebase config");
          return r.json();
        }).then(function (cfg) {
          if (SITE) cfg.authDomain = location.hostname;
          window.firebase.initializeApp(cfg);
        });
      })
      .then(function () {
        if (!window.firebase || !window.firebase.apps || !window.firebase.apps.length) return false;
        fb = window.firebase;
        if (useAppCheck && fb.appCheck) {
          try { fb.appCheck().activate(new fb.appCheck.ReCaptchaEnterpriseProvider(C.appCheckKey), true); }
          catch (e) { if (window.console) console.warn("App Check not started", e); }
        }
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

  // ---------- holds and their window counters ----------
  // Every hold is mirrored by slots/{date}_{slot} = { date, slot, count, last }:
  // how many holds that window has, and the id of the hold that last moved
  // it. firestore.rules enforces capacity, closed days, blocked windows, and
  // the booking horizon through those counters, so a hold and its counter are
  // always written in one transaction here. The team's writes are not capped
  // by the rules (admin.html warns instead), and syncCounters() repairs drift.
  var CAP = (C.availability && C.availability.capacity) || 1;
  function slotId(date, slot) { return date + "_" + slot; }
  function slotRef(date, slot) { return db.collection("slots").doc(slotId(date, slot)); }
  function holdData(id, date, slot, segment) { return { date: date, slot: slot, requestId: id, createdAt: stamp(), segment: segment || "residential" }; }
  function fullError() { var e = new Error("That window is full"); e.code = "mkg/full"; return e; }
  // One transaction that moves hold `id` from wherever it is to `next`
  // ({ date, slot }, or null to drop it), keeps the counters in step, deletes
  // any `extras` (older holds of the same request with random ids), and runs
  // `body(tx, oldHold)` for the caller's own writes. Rejects with code
  // "mkg/full" when the new window is at capacity, unless `force` (the team).
  function holdTx(id, next, segment, opts, body) {
    opts = opts || {};
    return db.runTransaction(function (tx) {
      return tx.get(holdRef(id)).then(function (hd) {
        var old = hd.exists ? hd.data() : null;
        var from = old && old.date && old.slot ? { date: old.date, slot: old.slot } : null;
        var to = next && next.date && next.slot ? { date: next.date, slot: next.slot } : null;
        var same = !!(from && to && from.date === to.date && from.slot === to.slot);
        var extras = (opts.extras || []).filter(function (x) { return x.id !== id && x.date && x.slot; });
        var reads = [];
        if (from && !same) reads.push(tx.get(slotRef(from.date, from.slot)));
        if (to && !same) reads.push(tx.get(slotRef(to.date, to.slot)));
        extras.forEach(function (x) { reads.push(tx.get(slotRef(x.date, x.slot))); });
        return Promise.all(reads).then(function (snaps) {
          var counts = {};
          snaps.forEach(function (s) { counts[s.id] = s.exists ? (Number(s.data().count) || 0) : 0; });
          if (to && !same && counts[slotId(to.date, to.slot)] >= CAP && !opts.force) throw fullError();
          if (body) body(tx, old);
          function bump(hid, p, n) {
            var k = slotId(p.date, p.slot);
            counts[k] = Math.max(0, (counts[k] || 0) + n);
            tx.set(slotRef(p.date, p.slot), { date: p.date, slot: p.slot, count: counts[k], last: hid });
          }
          extras.forEach(function (x) { tx.delete(holdRef(x.id)); bump(x.id, x, -1); });
          if (same) return old;
          if (from) bump(id, from, -1);
          if (to) { tx.set(holdRef(id), holdData(id, to.date, to.slot, segment || (old && old.segment))); bump(id, to, 1); }
          else if (old) tx.delete(holdRef(id));
          return old;
        });
      });
    });
  }
  // How many holds a window has right now, not counting one request's own.
  function windowCount(date, slot, excludeId) {
    return db.collection("holds").where("date", "==", date).where("slot", "==", slot).get()
      .then(function (r) { return r.docs.filter(function (d) { return d.id !== excludeId && d.data().requestId !== excludeId; }).length; });
  }
  // Team only: make the counters between two dates agree with the holds.
  function syncCounters(from, to) {
    return Promise.all([
      db.collection("holds").where("date", ">=", from).where("date", "<=", to).get(),
      db.collection("slots").where("date", ">=", from).where("date", "<=", to).get(),
    ]).then(function (r) {
      var want = {}, have = {}, b = db.batch(), n = 0;
      rows(r[0]).forEach(function (h) { if (typeof h.date === "string" && typeof h.slot === "string" && h.slot) { var k = slotId(h.date, h.slot); want[k] = (want[k] || 0) + 1; } });
      rows(r[1]).forEach(function (s) { have[s.id] = Number(s.count) || 0; });
      function fix(k, count) { var p = k.split("_"); b.set(db.collection("slots").doc(k), { date: p[0], slot: p[1], count: count, last: "sync" }); n++; }
      Object.keys(want).forEach(function (k) { if (have[k] !== want[k]) fix(k, want[k]); });
      Object.keys(have).forEach(function (k) { if (!want[k] && have[k] !== 0) fix(k, 0); });
      return n ? b.commit().then(function () { return n; }) : 0;
    });
  }

  // Whatever is stored, pages get fields of the type they expect, so one odd
  // record can't break a list.
  var STR = ["name", "email", "emailLower", "phone", "notes", "zip", "company", "service", "plan", "frequency",
    "replyNote", "payLink", "date", "slot", "status", "segment", "homeType", "facilityType", "pets", "floors",
    "contactMethod", "timeOfDay", "language", "cancelledBy", "movedFrom", "source", "requestedTime",
    "deepCleanWithin", "flooring", "adminNotes", "assignedTo", "ref", "refDropped"];
  var NUM = ["estimatePerVisit", "estimateOneVisit", "estimateFullPrice", "estimatePerMonth", "quotedPrice",
    "discount", "bedrooms", "bathrooms", "sqft", "restrooms", "refAmount", "creditApplied", "youPay"];
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
  // Saves the request and, when a date and window were picked, its hold and
  // the window's counter, in one transaction. Resolves with the new request
  // id; rejects with code "mkg/full" when that window filled up meanwhile.
  function submitRequest(data) {
    return ready.then(function (ok) {
      if (!ok) throw new Error("no-backend");
      var ref = db.collection("requests").doc();
      var doc = Object.assign({}, data, {
        status: "new", createdAt: stamp(),
        email: String(data.email || "").trim(),
        emailLower: String(data.email || "").trim().toLowerCase(),
        date: data.date || "", slot: data.slot || "",
        name: String(data.name || ""), phone: String(data.phone || ""), notes: String(data.notes || ""), zip: String(data.zip || ""),
      });
      Object.keys(doc).forEach(function (k) { if (doc[k] === undefined) delete doc[k]; });
      return holdTx(ref.id, { date: doc.date, slot: doc.slot }, doc.segment, {}, function (tx) { tx.set(ref, doc); })
        .then(function () { return ref.id; })
        .catch(function (e) {
          // "How did you hear about us?" is newer than some published copies
          // of firestore.rules. If the database refuses the field, send the
          // request without it rather than lose the request.
          if (e && e.code === "permission-denied" && data.heardFrom) {
            var rest = Object.assign({}, data); delete rest.heardFrom;
            return submitRequest(rest);
          }
          throw e;
        });
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
  // Rejects with code "mkg/full" when a client picks a window that filled up.
  function reschedule(req, date, slot, byClient) {
    date = date || ""; slot = slot || "";
    return holdsOf(req.id).then(function (r) {
      var open = byClient || !!OPEN[req.status || "new"];
      var next = date && slot && open ? { date: date, slot: slot } : null;
      return holdTx(req.id, next, req.segment, { force: !byClient, extras: rows(r) }, function (tx) {
        var now = stamp(), patch = { date: date, slot: slot, updatedAt: now };
        if (byClient) {
          patch.status = "new"; patch.movedByClientAt = now;
          patch.movedFrom = req.date ? req.date + (req.slot ? " " + req.slot : "") : "";
        }
        tx.update(db.collection("requests").doc(req.id), patch);
      });
    });
  }
  // A customer cancels their own request; its window opens up again.
  function cancelRequest(id) {
    return holdsOf(id).then(function (r) {
      return holdTx(id, null, null, { extras: rows(r) }, function (tx) {
        tx.update(db.collection("requests").doc(id), { status: "cancelled", cancelledBy: "client", updatedAt: stamp() });
      });
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
    return holdsOf(requestId).then(function (r) { return holdTx(requestId, null, null, { extras: rows(r) }); });
  }
  // Confirming or reopening puts it back on the calendar (when it has a window).
  function ensureHold(req) {
    if (!req.date || !req.slot || !OPEN[req.status || "new"]) return Promise.resolve();
    return holdTx(req.id, { date: req.date, slot: req.slot }, req.segment, { force: true });
  }
  // A booking taken by phone: a confirmed request (so it can be assigned,
  // clocked against and seen in the lists) plus its hold. The name lives on
  // the request, which only the team can read; the public hold has none.
  function addPhoneBooking(date, slot, name, segment) {
    var ref = db.collection("requests").doc(), now = stamp(), seg = segment || "residential";
    return holdTx(ref.id, { date: date, slot: slot || "" }, seg, { force: true }, function (tx) {
      tx.set(ref, { name: String(name || "").slice(0, 120), email: "", emailLower: "", phone: "", notes: "", zip: "",
        segment: seg, date: date, slot: slot || "", status: "confirmed", source: "phone", createdAt: now, updatedAt: now });
    }).then(function () { return ref.id; });
  }
  // Owner only: a request, its hold(s) and its staff fields, gone for good.
  function deleteRequest(id) {
    return holdsOf(id).then(function (r) {
      return holdTx(id, null, null, { extras: rows(r) }, function (tx) {
        tx.delete(db.collection("internal").doc(id));
        tx.delete(db.collection("requests").doc(id));
      });
    });
  }
  // The team taking a booking off the calendar from the day panel: the hold
  // goes and its window frees up, and the request it belonged to loses its
  // day and window and goes back to New, so the lists, the client's account
  // and the calendar keep agreeing.
  function unschedule(holdId) {
    return holdRef(holdId).get().then(function (hd) {
      if (!hd.exists) return null;
      var h = hd.data(), reqId = h.requestId === holdId ? holdId : "";
      return (reqId ? db.collection("requests").doc(reqId).get() : Promise.resolve(null)).then(function (rd) {
        var r = rd && rd.exists ? rd.data() : null;
        return holdTx(holdId, null, null, {}, function (tx) {
          if (!r) return;
          var patch = { date: "", slot: "", updatedAt: stamp() };
          if (r.status === "confirmed") patch.status = "new";
          tx.update(db.collection("requests").doc(reqId), patch);
        });
      });
    });
  }
  function setDay(date, data) {
    if (!data || (!data.closed && !(data.blockedSlots || []).length)) return db.collection("days").doc(date).delete();
    return db.collection("days").doc(date).set({ closed: !!data.closed, blockedSlots: data.blockedSlots || [] });
  }

  // ---------- referrals ----------
  var CODE_RE = /^[A-Z2-9]{6}$/;
  var ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I so codes read aloud cleanly
  function newCode() {
    var out = "", buf = new Uint32Array(6);
    (window.crypto || window.msCrypto).getRandomValues(buf);
    for (var i = 0; i < 6; i++) out += ALPHA.charAt(buf[i] % ALPHA.length);
    return out;
  }
  // true / false when Firebase answers, null when it can't be asked (offline copy).
  function checkReferral(code) {
    code = String(code || "").toUpperCase();
    if (!CODE_RE.test(code)) return Promise.resolve(false);
    return ready.then(function (ok) {
      if (!ok) return null;
      return db.collection("referrers").doc(code).get().then(function (d) { return d.exists; }).catch(function () { return null; });
    });
  }
  function myCode(user) {
    return db.collection("users").doc(user.uid).get().then(function (d) { return d.exists ? d.data().code : null; });
  }
  // One code per client. Written as one batch so the rules can check both halves.
  function createCode(user, tries) {
    tries = tries || 0;
    var code = newCode(), now = fb.firestore.FieldValue.serverTimestamp(), batch = db.batch();
    batch.set(db.collection("users").doc(user.uid), { code: code, emailLower: String(user.email).toLowerCase(), createdAt: now });
    batch.set(db.collection("referrers").doc(code), { uid: user.uid, createdAt: now });
    return batch.commit().then(function () { return code; }).catch(function (e) {
      if (tries < 5) return myCode(user).then(function (existing) { return existing || createCode(user, tries + 1); });
      throw e;
    });
  }
  function ensureCode(user) { return myCode(user).then(function (c) { return c || createCode(user); }); }
  function credits(email) {
    return db.collection("credits").where("emailLower", "==", String(email).toLowerCase()).get()
      .then(function (r) { return r.docs.map(function (d) { var x = d.data(); x.id = d.id; return x; }).sort(byNewest); });
  }
  function balance(list) { return list.reduce(function (n, c) { return n + (Number(c.amount) || 0); }, 0); }
  // admin: who owns a code (a users/{uid} document)
  function ownerOfCode(code) {
    return db.collection("users").where("code", "==", code).limit(1).get().then(function (r) {
      if (!r.docs.length) return null; var x = r.docs[0].data(); x.uid = r.docs[0].id; return x;
    });
  }
  function watchCredits(cb) {
    return db.collection("credits").orderBy("createdAt", "desc").limit(1000).onSnapshot(function (r) {
      cb(r.docs.map(function (d) { var x = d.data(); x.id = d.id; return x; }));
    }, function (err) { cb(null, err); });
  }
  // Writes a ledger entry. With an `id` it writes once (a second call with the same id is a no-op).
  function addCredit(entry) {
    var ref = entry.id ? db.collection("credits").doc(entry.id) : db.collection("credits").doc();
    var data = { emailLower: String(entry.email).toLowerCase(), amount: Number(entry.amount), type: entry.type || "adjust", note: entry.note || "",
      requestId: entry.requestId || "", code: entry.code || "", createdAt: fb.firestore.FieldValue.serverTimestamp() };
    if (!entry.id) return ref.set(data).then(function () { return true; });
    return ref.get().then(function (d) { if (d.exists) return false; return ref.set(data).then(function () { return true; }); });
  }
  function removeCredit(id) { return db.collection("credits").doc(id).delete(); }

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
    releaseHolds: releaseHolds, ensureHold: ensureHold, addPhoneBooking: addPhoneBooking, deleteRequest: deleteRequest, unschedule: unschedule, setDay: setDay,
    windowCount: windowCount, syncCounters: syncCounters,
    checkReferral: checkReferral, ensureCode: ensureCode, myCredits: credits, creditsFor: credits, creditBalance: balance, ownerOfCode: ownerOfCode,
    watchCredits: watchCredits, addCredit: addCredit, removeCredit: removeCredit, newCode: newCode,
  };
})();
