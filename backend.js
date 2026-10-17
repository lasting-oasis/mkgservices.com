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
  function isAdmin(user) {
    if (!user) return Promise.resolve(false);
    return db.collection("admins").doc(user.uid).get().then(function (d) { return d.exists; }).catch(function () { return false; });
  }

  // ---------- client: own requests ----------
  function myRequests(email) {
    return db.collection("requests").where("emailLower", "==", String(email).toLowerCase()).get()
      .then(function (r) { return r.docs.map(function (d) { var x = d.data(); x.id = d.id; return x; }).sort(byNewest); });
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
    onAuth: onAuth, signOut: signOut, signInPassword: signInPassword, sendLink: sendLink, isLink: isLink, completeLink: completeLink, isAdmin: isAdmin,
    myRequests: myRequests, toMs: toMs,
    watchRequests: watchRequests, updateRequest: updateRequest, releaseHolds: releaseHolds, ensureHold: ensureHold,
    checkReferral: checkReferral, ensureCode: ensureCode, myCredits: credits, creditsFor: credits, creditBalance: balance, ownerOfCode: ownerOfCode,
    watchCredits: watchCredits, addCredit: addCredit, removeCredit: removeCredit, newCode: newCode,
    addManualHold: addManualHold, deleteHold: deleteHold, setDay: setDay, watchHolds: watchHolds,
  };
})();
