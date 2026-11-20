/* Test-only (test/browser/run.js): an in-memory stand-in for backend.js. Fictional records only; no page on the site loads it.
   Transactions are compare-and-set over the store, applied atomically; snapshots can be held back
   (B._hold = true) to imitate another dispatcher's write that hasn't reached this screen yet. */
(function () {
  var C = window.MKG = window.MKG || {};
  var DEL = { __del: true }, SERVER = { __ts: true };
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function ymd(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function parse(s) { var p = s.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addDays(d, n) { var x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; }
  function toMs(ts) { if (typeof ts === "number") return ts; if (typeof ts === "string") { var n = new Date(ts).getTime(); return isFinite(n) ? n : 0; } return 0; }
  var F = window.FIXTURE, store = { requests: F.requests, internal: F.internal, events: F.events || {} };
  var reqW = [], intW = [], evW = {}, log = [], seq = 0;
  var now = function () { return Date.now() + (seq++); };
  function emit() {
    if (C.backend._hold) return;
    var list = store.requests.slice().sort(function (a, b) { return toMs(b.createdAt) - toMs(a.createdAt); }).map(function (r) { return Object.assign({}, r); });
    reqW.forEach(function (cb) { cb(list); });
    var m = {}; Object.keys(store.internal).forEach(function (k) { var x = store.internal[k]; m[k] = { adminNotes: x.adminNotes || "", assignedTo: x.assignedTo || "", queue: x.queue ? Object.assign({}, x.queue) : null }; });
    intW.forEach(function (cb) { cb(m); });
    Object.keys(evW).forEach(function (id) { var l = (store.events[id] || []).slice().sort(function (a, b) { return b.atMs - a.atMs; }); evW[id].forEach(function (cb) { cb(l); }); });
  }
  function req(id) { return store.requests.filter(function (r) { return r.id === id; })[0]; }
  function apply(o, patch) { Object.keys(patch).forEach(function (k) { if (patch[k] === DEL) delete o[k]; else o[k] = patch[k]; }); }
  function addEvent(id, uid, kind, text) { (store.events[id] = store.events[id] || []).push({ id: "e" + seq, kind: kind, text: text, by: uid, atMs: now() }); log.push(["event", id, kind, text]); }
  function stale(code, extra) { var e = new Error(code); e.code = code; Object.assign(e, extra || {}); return e; }
  function cur(id) { var x = store.internal[id] || {}; return { adminNotes: x.adminNotes || "", assignedTo: x.assignedTo || "", queue: x.queue || null }; }
  function movedCheck(id, exp) {
    if (exp === undefined) return;
    var x = req(id), now = x && x.movedByClientAt ? toMs(x.movedByClientAt) : null;
    if (now !== exp) throw stale("mkg/request-moved", { movedMs: now, date: x.date || "", slot: x.slot || "" });
  }
  var ok = function (v) { return Promise.resolve(v); };
  var ME = F.me;
  C.backend = {
    ready: ok(true), _store: store, _log: log, _emit: emit, _hold: false,
    firebase: { firestore: { FieldValue: { delete: function () { return DEL; } } } },
    dates: { ymd: ymd, parse: parse, addDays: addDays, pad: pad }, toMs: toMs, tsFromDate: function (d) { return d.getTime(); },
    availability: function () { return ok({ live: true, holds: [], days: {} }); },
    onAuth: function (cb) { setTimeout(function () { cb({ uid: ME.uid, email: ME.email }); }, 0); },
    isAdmin: function () { return ok({ role: ME.role }); }, stillAdmin: function () { return ok(true); },
    signOut: ok, signInPassword: ok, signInGoogle: ok, sendReset: ok,
    watchTeam: function (cb) { setTimeout(function () { cb(F.team); }, 0); return function () {}; },
    watchRequests: function (cb) { reqW.push(cb); setTimeout(emit, 0); return function () {}; },
    watchInternal: function (cb) { intW.push(cb); setTimeout(emit, 0); return function () {}; },
    watchEvents: function (id, cb) { (evW[id] = evW[id] || []).push(cb); setTimeout(emit, 0); return function () { evW[id] = (evW[id] || []).filter(function (f) { return f !== cb; }); }; },
    watchCredits: function (cb) { setTimeout(function () { cb([]); }, 0); return function () {}; },
    watchMyShifts: function (u, cb) { setTimeout(function () { (cb || u)([]); }, 0); return function () {}; },
    watchShiftsSince: function (s, cb) { setTimeout(function () { (cb || s)([]); }, 0); return function () {}; },
    clockIn: ok, clockOut: ok, updateShift: ok, deleteShift: ok, syncCounters: ok, windowCount: function () { return ok(0); },
    ensureHold: ok, releaseHolds: ok, unschedule: ok, setDay: ok, ownerOfCode: function () { return ok(null); },
    addCredit: ok, removeCredit: ok, inviteAdmin: ok, removeAdmin: ok,
    deleteRequest: function (id) { store.requests = store.requests.filter(function (r) { return r.id !== id; }); delete store.internal[id]; log.push(["delete", id]); emit(); return ok(); }, addPhoneBooking: ok,
    updateRequest: function (id, patch) { apply(req(id), patch); emit(); return ok(); },
    saveInternal: function (id, d) { store.internal[id] = Object.assign(store.internal[id] || {}, d); emit(); return ok(); },
    reschedule: function (r, date, slot, byClient) { var x = req(r.id), p = { date: date, slot: slot }; if (byClient) { p.status = "new"; p.movedByClientAt = now(); p.movedFrom = x.date ? x.date + " " + x.slot : ""; } apply(x, p); emit(); return ok(); },
    // Same contract as backend.js: compare, then write the change and its event together.
    takeOver: function (id, expected, to, uid) {
      return Promise.resolve().then(function () {
        var c = cur(id);
        if ((c.assignedTo || "") !== (expected || "")) throw stale("mkg/owner-changed", { who: c.assignedTo });
        store.internal[id] = Object.assign(store.internal[id] || {}, { assignedTo: to });
        addEvent(id, uid, "owner", (expected || "-") + " -> " + (to || "-")); emit();
      });
    },
    saveQueue: function (id, q, expectedSetMs, uid, text, expectedMovedMs) {
      return Promise.resolve().then(function () {
        var rq = req(id), movedNow = rq && rq.movedByClientAt ? toMs(rq.movedByClientAt) : null;
        if (expectedMovedMs !== undefined && movedNow !== expectedMovedMs) throw stale("mkg/request-moved", { movedMs: movedNow });
        var c = cur(id), have = c.queue ? c.queue.setMs : null;
        if (have !== (expectedSetMs === undefined ? null : expectedSetMs)) throw stale("mkg/queue-changed");
        store.internal[id] = Object.assign(store.internal[id] || {}, { queue: { state: q.state, nextAction: q.nextAction, dueMs: typeof q.dueMs === "number" ? q.dueMs : null, setMs: now(), repliedMs: c.queue ? c.queue.repliedMs || null : null } });
        addEvent(id, uid, "queue", text); emit();
      });
    },
    checkMoved: function (id, exp) { return Promise.resolve().then(function () { movedCheck(id, exp); }); },
    setStatusIf: function (id, status, expectedMovedMs) {
      return Promise.resolve().then(function () { movedCheck(id, expectedMovedMs); req(id).status = status; log.push(["status", id, status]); emit(); });
    },
    saveEdit: function (id, reqPatch, priv, base, uid, expectedMovedMs) {
      return Promise.resolve().then(function () {
        movedCheck(id, expectedMovedMs);
        var c = cur(id);
        Object.keys(priv).forEach(function (k) { if ((c[k] || "") !== (base[k] || "")) throw stale(k === "assignedTo" ? "mkg/owner-changed" : "mkg/notes-changed", { who: c.assignedTo }); });
        if (Object.keys(reqPatch).length) apply(req(id), reqPatch);
        store.internal[id] = Object.assign(store.internal[id] || {}, priv);
        log.push(["saveEdit", id, JSON.stringify(reqPatch), JSON.stringify(priv)]);
        if (priv.assignedTo !== undefined) addEvent(id, uid, "owner", (c.assignedTo || "-") + " -> " + (priv.assignedTo || "-"));
        if (typeof reqPatch.replyNote === "string" && reqPatch.replyNote) {
          addEvent(id, uid, "reply", reqPatch.replyNote);
          var x = store.internal[id], t = now();
          x.queue = x.queue ? Object.assign({}, x.queue, { repliedMs: t }) : { state: "open", nextAction: "", dueMs: null, setMs: t, repliedMs: t };
        }
        emit();
      });
    },
  };
})();
