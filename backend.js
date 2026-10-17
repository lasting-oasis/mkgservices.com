/*
  The site's connection to Firebase (Firestore for data, Auth for sign-in).

  Nothing here needs configuring: Firebase Hosting serves the project's own
  config at /__/firebase/init.js, so the same files work on mkgservices.com,
  on preview channels, and in the local emulator. Opened from anywhere else
  (a plain file server), there is no Firebase and every page falls back to
  "demo" behaviour: the calendar shows all windows open and the quote form
  shows its demo confirmation.

  Everything is exposed as window.MKG.backend; see the bottom of the file.
*/
(function () {
  "use strict";
  var C = window.MKG = window.MKG || {};
  var SDK = "10.14.1";
  var base = "/__/firebase/";
  var fb = null, db = null, auth = null;

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

  // ---------- public: calendar ----------
  // Holds and blocked days between two YYYY-MM-DD strings (inclusive).
  function availability(from, to) {
    return ready.then(function (ok) {
      if (!ok) return { live: false, holds: [], days: {} };
      var q1 = db.collection("holds").where("date", ">=", from).where("date", "<=", to).get();
      var q2 = db.collection("days").where(fb.firestore.FieldPath.documentId(), ">=", from)
        .where(fb.firestore.FieldPath.documentId(), "<=", to).get();
      return Promise.all([q1, q2]).then(function (r) {
        var holds = r[0].docs.map(function (d) { var x = d.data(); x.id = d.id; return x; });
        var days = {};
        r[1].docs.forEach(function (d) { days[d.id] = d.data(); });
        return { live: true, holds: holds, days: days };
      });
    });
  }

  // ---------- public: quote requests ----------
  // Saves the request and, when a date and window were picked, the hold for it,
  // in one batch. Resolves with the new request id.
  function submitRequest(data) {
    return ready.then(function (ok) {
      if (!ok) throw new Error("no-backend");
      var now = fb.firestore.FieldValue.serverTimestamp();
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
        batch.set(db.collection("holds").doc(), { date: doc.date, slot: doc.slot, requestId: ref.id, createdAt: now, segment: doc.segment });
      }
      return batch.commit().then(function () { return ref.id; });
    });
  }

  // ---------- auth ----------
  function onAuth(cb) { ready.then(function (ok) { if (ok) auth.onAuthStateChanged(cb); else cb(null); }); }
  function signOut() { return ready.then(function (ok) { return ok ? auth.signOut() : null; }); }
  function signInPassword(email, password) { return auth.signInWithEmailAndPassword(email, password); }
  // One-tap sign-in with a Google account. A popup where the browser allows
  // it; otherwise the page redirects to Google and comes back signed in.
  function signInGoogle() {
    var provider = new fb.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    return auth.signInWithPopup(provider).catch(function (e) {
      var code = e && e.code;
      if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment" || code === "auth/cancelled-popup-request") return auth.signInWithRedirect(provider);
      throw e;
    });
  }
  // Passwordless sign-in for clients: a link is emailed; opening it signs them in.
  var LINK_KEY = "mkg.signInEmail";
  function sendLink(email, returnTo) {
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
        var rec = { email: user.email.toLowerCase(), role: "admin", createdAt: fb.firestore.FieldValue.serverTimestamp() };
        return ref.set(rec).then(function () { return rec; });
      });
    }).catch(function () { return null; });
  }
  // The team list, live: every admin record plus every invite not yet used.
  function watchTeam(cb) {
    var admins = [], invites = [], seen = 0;
    function emit() { if (seen !== 3) return; var have = {}; admins.forEach(function (a) { have[a.email] = true; });
      cb(admins.concat(invites.filter(function (i) { return !have[i.email]; }))); }
    var u1 = db.collection("admins").onSnapshot(function (r) { admins = r.docs.map(function (d) { var x = d.data(); x.uid = d.id; x.status = "active"; return x; }); seen |= 1; emit(); }, function (e) { cb(null, e); });
    var u2 = db.collection("adminInvites").onSnapshot(function (r) { invites = r.docs.map(function (d) { var x = d.data(); x.status = "invited"; return x; }); seen |= 2; emit(); }, function (e) { cb(null, e); });
    return function () { u1(); u2(); };
  }
  function inviteAdmin(email, byEmail) {
    var e = String(email || "").trim().toLowerCase();
    return db.collection("adminInvites").doc(e).set({ email: e, invitedBy: byEmail || "", createdAt: fb.firestore.FieldValue.serverTimestamp() });
  }
  // Removing someone drops both their record (if they ever signed in) and their invite.
  function removeAdmin(member) {
    var b = db.batch();
    if (member.uid) b.delete(db.collection("admins").doc(member.uid));
    b.delete(db.collection("adminInvites").doc(member.email));
    return b.commit();
  }

  // ---------- client: own requests ----------
  function myRequests(email) {
    return db.collection("requests").where("emailLower", "==", String(email).toLowerCase()).get()
      .then(function (r) { return r.docs.map(function (d) { var x = d.data(); x.id = d.id; return x; }).sort(byNewest); });
  }
  // Move a request to another day/window (or clear it). One batch: the
  // request's date and slot change, its old hold goes, a new one is created.
  // The rules let the admin and the request's own customer do this.
  function reschedule(req, date, slot) {
    var ref = db.collection("requests").doc(req.id);
    return db.collection("holds").where("requestId", "==", req.id).get().then(function (r) {
      var now = fb.firestore.FieldValue.serverTimestamp();
      var b = db.batch();
      b.update(ref, { date: date || "", slot: slot || "", updatedAt: now });
      r.docs.forEach(function (d) { b.delete(d.ref); });
      if (date && slot) b.set(db.collection("holds").doc(), { date: date, slot: slot, requestId: req.id, createdAt: now, segment: req.segment || "" });
      return b.commit();
    });
  }
  // A customer cancels their own request; its window opens up again.
  function cancelRequest(id) {
    var ref = db.collection("requests").doc(id);
    return db.collection("holds").where("requestId", "==", id).get().then(function (r) {
      var b = db.batch();
      b.update(ref, { status: "cancelled", cancelledBy: "client", updatedAt: fb.firestore.FieldValue.serverTimestamp() });
      r.docs.forEach(function (d) { b.delete(d.ref); });
      return b.commit();
    });
  }
  function byNewest(a, b) { return (toMs(b.createdAt) - toMs(a.createdAt)); }
  function toMs(ts) { return ts && ts.toMillis ? ts.toMillis() : (ts ? new Date(ts).getTime() : 0); }

  // ---------- admin ----------
  function watchRequests(cb) {
    return db.collection("requests").orderBy("createdAt", "desc").limit(300).onSnapshot(function (r) {
      cb(r.docs.map(function (d) { var x = d.data(); x.id = d.id; return x; }));
    }, function (err) { cb(null, err); });
  }
  function updateRequest(id, patch) {
    patch.updatedAt = fb.firestore.FieldValue.serverTimestamp();
    return db.collection("requests").doc(id).update(patch);
  }
  // Declining or finishing a request frees its window.
  function releaseHolds(requestId) {
    return db.collection("holds").where("requestId", "==", requestId).get().then(function (r) {
      var b = db.batch(); r.docs.forEach(function (d) { b.delete(d.ref); }); return b.commit();
    });
  }
  function ensureHold(req) {
    if (!req.date || !req.slot) return Promise.resolve();
    return db.collection("holds").where("requestId", "==", req.id).get().then(function (r) {
      if (r.docs.length) return null;
      return db.collection("holds").add({ date: req.date, slot: req.slot, requestId: req.id, createdAt: fb.firestore.FieldValue.serverTimestamp(), segment: req.segment || "" });
    });
  }
  function addManualHold(date, slot, note) {
    return db.collection("holds").add({ date: date, slot: slot, requestId: "manual", note: note || "", createdAt: fb.firestore.FieldValue.serverTimestamp() });
  }
  function deleteHold(id) { return db.collection("holds").doc(id).delete(); }
  function setDay(date, data) {
    if (!data || (!data.closed && !(data.blockedSlots || []).length)) return db.collection("days").doc(date).delete();
    return db.collection("days").doc(date).set(data);
  }
  function watchHolds(from, to, cb) {
    return db.collection("holds").where("date", ">=", from).where("date", "<=", to).onSnapshot(function (r) {
      cb(r.docs.map(function (d) { var x = d.data(); x.id = d.id; return x; }));
    });
  }

  C.backend = {
    ready: ready,
    get db() { return db; }, get auth() { return auth; }, get firebase() { return fb; },
    dates: { ymd: ymd, parse: parse, addDays: addDays, pad: pad },
    availability: availability, submitRequest: submitRequest,
    onAuth: onAuth, signOut: signOut, signInPassword: signInPassword, signInGoogle: signInGoogle, sendLink: sendLink, isLink: isLink, completeLink: completeLink, isAdmin: isAdmin, watchTeam: watchTeam, inviteAdmin: inviteAdmin, removeAdmin: removeAdmin,
    myRequests: myRequests, reschedule: reschedule, cancelRequest: cancelRequest, toMs: toMs,
    watchRequests: watchRequests, updateRequest: updateRequest, releaseHolds: releaseHolds, ensureHold: ensureHold,
    addManualHold: addManualHold, deleteHold: deleteHold, setDay: setDay, watchHolds: watchHolds,
  };
})();
