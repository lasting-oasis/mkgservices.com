/*
  admin.html, Today / Hoy: the owner's "start my day" view.

  One screen answering four questions, each item with why, who, by when, its
  source and a link to the record where it gets handled:
    1. Can today's jobs be covered?          (bookings, calendar, assignment)
    2. Who is waiting on us?                  (new requests nobody owns)
    3. Which completed visits need correction? (open past visits, missing time)
    4. Is there a money decision today?       (the books aren't connected: Unknown)

  Only real records are read: requests and their staff-only fields (from
  admin.js), time-clock shifts (owner only; firestore.rules enforces that),
  and today's calendar day. Sources that don't exist on this site yet (the
  request queue's promised reply times, the crew day sheet, the MKG Books
  workbook) are shown as Not connected, and money is Unknown, never $0.

  derive() is pure (records in, items out, no text), so test/today.test.js can
  run it in Node. The rest renders and only runs for the owner.
*/
(function (root) {
  "use strict";

  // ---------- pure logic ----------
  var CLOSED = { done: true, declined: true, cancelled: true };
  var OPEN_SHIFT_HOURS = 12;   // the time clock flags shifts longer than this too
  var LOOKBACK_DAYS = 14;      // how far back question 3 looks
  var WAITING_SHOWN = 5;

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function ymdOf(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function slotStartMs(today, slot) {
    var m = /^(\d{2})(\d{2})$/.exec(slot || "");
    var p = today.split("-");
    return new Date(+p[0], +p[1] - 1, +p[2], m ? +m[1] : 8, m ? +m[2] : 0).getTime();
  }
  function daysBefore(today, n) { var p = today.split("-"); return ymdOf(new Date(+p[0], +p[1] - 1, +p[2] - n)); }

  /*
    src = {
      now: ms, today: "YYYY-MM-DD",
      requests: [merged request records] | null (not loaded / failed),
      shifts: [shift records with inMs, outMs] | null,
      day: { closed, blockedSlots } | null,
      capacity: jobs per window,
    }
    Returns { q: {1..4: { state, items, extra }}, items (all, in priority order) }.
  */
  function derive(src) {
    var now = src.now, today = src.today, reqs = src.requests, out = { q: {}, items: [] };
    function add(q, it) { it.q = q; out.q[q].items.push(it); out.items.push(it); }
    [1, 2, 3, 4].forEach(function (n) { out.q[n] = { state: "unknown", items: [], extra: {} }; });

    if (reqs) {
      // 1 · today's bookings
      var todays = reqs.filter(function (r) { return r.date === today && !CLOSED[r.status || "new"]; });
      out.q[1].extra.booked = todays.length;
      var flagged = {};
      var bySlot = {};
      todays.forEach(function (r) { if (r.slot) (bySlot[r.slot] = bySlot[r.slot] || []).push(r); });
      Object.keys(bySlot).sort().forEach(function (slot) {
        var list = bySlot[slot];
        if (list.length > src.capacity) {
          add(1, { kind: "overWindow", sev: "bad", slot: slot, count: list.length, cap: src.capacity, names: list.map(function (r) { return r.name || "?"; }), dueMs: slotStartMs(today, slot), dest: { type: "day", id: today } });
        }
      });
      if (src.day && src.day.closed && todays.length) {
        add(1, { kind: "closedDay", sev: "bad", count: todays.length, names: todays.map(function (r) { return r.name || "?"; }), dueMs: slotStartMs(today, "0800"), dest: { type: "day", id: today } });
      } else if (src.day) {
        (src.day.blockedSlots || []).forEach(function (slot) {
          var list = bySlot[slot] || [];
          if (list.length) add(1, { kind: "blocked", sev: "bad", slot: slot, count: list.length, names: list.map(function (r) { return r.name || "?"; }), dueMs: slotStartMs(today, slot), dest: { type: "day", id: today } });
        });
      }
      todays.forEach(function (r) {
        var due = slotStartMs(today, r.slot);
        if ((r.status || "new") === "new") { flagged[r.id] = true; add(1, { kind: "notConfirmed", sev: "bad", id: r.id, name: r.name || "?", slot: r.slot, moved: !!r.movedByClientMs, assignee: r.assignedTo || "", dueMs: due, dest: { type: "request", id: r.id } }); }
        else if (!r.assignedTo) { flagged[r.id] = true; add(1, { kind: "unassigned", sev: "bad", id: r.id, name: r.name || "?", slot: r.slot, dueMs: due, dest: { type: "request", id: r.id } }); }
      });
      out.q[1].state = out.q[1].items.length ? "no" : todays.length ? "yes" : "empty";

      // 2 · new requests nobody owns (today's bookings are already in question 1)
      var waiting = reqs.filter(function (r) { return (r.status || "new") === "new" && !flagged[r.id]; });
      var noOwner = waiting.filter(function (r) { return !r.assignedTo; })
        .sort(function (a, b) { return (a.sinceMs || 0) - (b.sinceMs || 0); });
      noOwner.slice(0, WAITING_SHOWN).forEach(function (r) {
        add(2, { kind: "waiting", sev: "warn", id: r.id, name: r.name || "?", spanish: r.language === "es", moved: !!r.movedByClientMs, sinceMs: r.sinceMs || 0, dueMs: null, dest: { type: "request", id: r.id } });
      });
      out.q[2].extra.more = Math.max(0, noOwner.length - WAITING_SHOWN);
      out.q[2].extra.assigned = waiting.length - noOwner.length;
      out.q[2].state = noOwner.length ? "some" : "none";

      // 3 · past visits still open; done visits with no time on the clock
      var from = daysBefore(today, LOOKBACK_DAYS);
      reqs.forEach(function (r) {
        var s = r.status || "new";
        if (!r.date || r.date < from) return;
        if (r.date < today && (s === "new" || s === "confirmed")) {
          add(3, { kind: "pastOpen", sev: "warn", id: r.id, name: r.name || "?", date: r.date, assignee: r.assignedTo || "", sinceMs: slotStartMs(r.date, r.slot), dueMs: null, dest: { type: "request", id: r.id } });
        } else if (s === "done" && r.date <= today && src.shifts) {
          var has = src.shifts.some(function (sh) { return sh.requestId === r.id && sh.inMs && ymdOf(new Date(sh.inMs)) === r.date; });
          if (!has) add(3, { kind: "noTime", sev: "warn", id: r.id, name: r.name || "?", date: r.date, sinceMs: slotStartMs(r.date, r.slot), dueMs: null, dest: { type: "request", id: r.id } });
        }
      });
    }
    if (src.shifts) {
      src.shifts.forEach(function (sh) {
        if (sh.inMs && !sh.outMs && now - sh.inMs > OPEN_SHIFT_HOURS * 36e5) {
          add(3, { kind: "longShift", sev: "warn", who: sh.email || "?", sinceMs: sh.inMs, hours: OPEN_SHIFT_HOURS, dueMs: null, dest: { type: "teamtime" } });
        }
      });
    }
    // Question 3 is only fully known when both requests and shifts loaded.
    out.q[3].state = out.q[3].items.length ? "some" : (reqs && src.shifts ? "none" : "unknown");
    out.q[3].extra.partial = !(reqs && src.shifts);

    // 4 · the money records live in the MKG Books workbook, which this page can't read.
    out.q[4].state = "unknown";
    out.q[4].items.push({ q: 4, kind: "cash", sev: "unk", dueMs: null, sinceMs: Infinity, dest: { type: "none" } });

    // Priority: anything with a time today, soonest first; then the oldest waiting.
    out.items.sort(function (a, b) {
      var ad = a.dueMs == null ? Infinity : a.dueMs, bd = b.dueMs == null ? Infinity : b.dueMs;
      if (ad !== bd) return ad - bd;
      var as = a.sinceMs == null ? Infinity : a.sinceMs, bs = b.sinceMs == null ? Infinity : b.sinceMs;
      if (as !== bs) return as - bs;
      return a.q - b.q;
    });
    out.items.push(out.q[4].items[0]);   // money is Unknown: shown, never the first action
    return out;
  }

  root.MKG = root.MKG || {};
  root.MKG.todayLogic = { derive: derive, slotStartMs: slotStartMs, ymd: ymdOf };

  // ---------- the view (browser only) ----------
  var C = root.MKG, I = C.i18n, B = C.backend, A = C.app, Cal = C.calendar;
  if (!I || !B || !A || !Cal || typeof document === "undefined") return;
  var t = I.t, esc = A.esc;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var AV = C.availability;

  var me = null, getItems = function () { return null; }, nav = {};
  var shifts = null, shiftsErr = false, shiftsAt = 0, unsubShifts = null;
  var day = null, dayErr = false, dayAt = 0, dayFor = "";
  var errs = {}, reqAt = 0, offlineSince = 0;
  function reqFailed() { return !!(errs.requests || errs.internal); }
  var tick = null, dayTimer = null, active = false;

  function locale() { return I.lang === "es" ? "es-US" : "en-US"; }
  function fmtTime(ms) { return new Date(ms).toLocaleTimeString(locale(), { hour: "numeric", minute: "2-digit" }); }
  function fmtWhen(ms) {
    var d = new Date(ms), today = ymdOf(new Date());
    return ymdOf(d) === today ? fmtTime(ms) : d.toLocaleString(locale(), { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }
  function fmtDay(ymd) { return Cal.fmtDate(ymd, { weekday: "short", month: "short", day: "numeric" }); }
  function windowName(slot) { return slot ? Cal.slotLabel(slot) : t("cal.anyWindow"); }
  function person(email) { return String(email || "").split("@")[0] || "?"; }
  function age(ms) {
    var m = Math.max(0, Math.round((Date.now() - ms) / 60000));
    if (m < 60) return t("today.age.min", { n: m });
    if (m < 48 * 60) return t("today.age.h", { n: Math.round(m / 60) });
    return t("today.age.d", { n: Math.round(m / 1440) });
  }
  function isOwner() { return !!me && me.role === "owner"; }

  // Requests from admin.js, with the timestamps derive() needs as plain numbers.
  function requestsNow() {
    var list = getItems();
    if (!list) return null;
    return list.map(function (r) {
      var x = Object.assign({}, r);
      x.movedByClientMs = r.movedByClientAt ? B.toMs(r.movedByClientAt) : 0;
      x.sinceMs = x.movedByClientMs && (r.status || "new") === "new" ? x.movedByClientMs : B.toMs(r.createdAt);
      return x;
    });
  }
  function latestChange(list) {
    var m = 0;
    (list || []).forEach(function (r) { ["createdAt", "updatedAt", "movedByClientAt"].forEach(function (k) { var v = r[k] ? B.toMs(r[k]) : 0; if (v > m) m = v; }); });
    return m;
  }

  // ---------- item text ----------
  function text(it) {
    var w = windowName(it.slot), names = (it.names || []).join(", ");
    switch (it.kind) {
      case "overWindow": return { what: t("today.k.overWindow.what", { window: w, count: it.count, cap: it.cap }), why: t("today.k.overWindow.why", { cap: it.cap, names: names }), next: t("today.k.overWindow.next"), who: t("today.who.you"), src: t("today.src.requests") + " · " + t("today.src.capacity") };
      case "closedDay": return { what: t("today.k.closedDay.what", { count: it.count }), why: t("today.k.closedDay.why", { names: names }), next: t("today.k.closedDay.next"), who: t("today.who.you"), src: t("today.src.calendar") };
      case "blocked": return { what: t("today.k.blocked.what", { count: it.count, window: w }), why: t("today.k.blocked.why", { names: names }), next: t("today.k.blocked.next"), who: t("today.who.you"), src: t("today.src.calendar") };
      case "notConfirmed": return { what: t("today.k.notConfirmed.what", { name: it.name }), why: t(it.moved ? "today.k.notConfirmed.whyMoved" : "today.k.notConfirmed.why", { window: w }), next: t("today.k.notConfirmed.next"), who: it.assignee ? person(it.assignee) : t("today.who.you"), src: t("today.src.requests") };
      case "unassigned": return { what: t("today.k.unassigned.what", { name: it.name }), why: t("today.k.unassigned.why", { window: w }), next: t("today.k.unassigned.next"), who: t("today.who.you"), src: t("today.src.requests") };
      case "waiting": return { what: t("today.k.waiting.what", { name: it.name }), why: t(it.moved ? "today.k.waiting.whyMoved" : "today.k.waiting.why", { age: age(it.sinceMs) }) + (it.spanish ? " " + t("today.k.waiting.es") : ""), next: t("today.k.waiting.next"), who: t("today.who.triage"), src: t("today.src.requests") };
      case "pastOpen": return { what: t("today.k.pastOpen.what", { name: it.name, date: fmtDay(it.date) }), why: t("today.k.pastOpen.why"), next: t("today.k.pastOpen.next"), who: it.assignee ? person(it.assignee) : t("today.who.you"), src: t("today.src.requests") };
      case "noTime": return { what: t("today.k.noTime.what", { name: it.name, date: fmtDay(it.date) }), why: t("today.k.noTime.why"), next: t("today.k.noTime.next"), who: t("today.who.worker"), src: t("today.src.shifts") };
      case "longShift": return { what: t("today.k.longShift.what", { who: person(it.who), since: fmtWhen(it.sinceMs) }), why: t("today.k.longShift.why", { hours: it.hours }), next: t("today.k.longShift.next"), who: t("today.who.personOrYou", { who: person(it.who) }), src: t("today.src.shifts") };
      case "cash": return { what: t("today.k.cash.what"), why: t("today.dep.books"), next: t("today.k.cash.next"), who: t("today.who.you"), src: t("today.src.books") + " · " + t("today.st.notConnected") };
    }
    return { what: "", why: "", next: "", who: "", src: "" };
  }
  function byText(it) {
    if (it.dueMs == null) return it.kind === "cash" ? t("today.by.beforeSpending") : t("today.by.none");
    return it.dueMs < Date.now() ? '<span class="today-late">' + esc(t("today.by.late", { time: fmtTime(it.dueMs) })) + "</span>" : esc(t("today.by.at", { time: fmtTime(it.dueMs) }));
  }
  function destButton(it, cls) {
    var d = it.dest || { type: "none" };
    if (d.type === "none") return '<p class="today-nolink">' + esc(t("today.go.none")) + "</p>";
    var label = d.type === "request" ? t("today.go.request") : d.type === "day" ? t("today.go.day") : d.type === "teamtime" ? t("today.go.teamtime") : t("today.go.new");
    return '<button type="button" class="' + cls + '" data-today-go="' + esc(d.type) + '" data-today-id="' + esc(d.id || "") + '">' + esc(label) + " →</button>";
  }
  function itemHTML(it) {
    var x = text(it);
    return '<li class="today-item sev-' + it.sev + '" data-today-kind="' + esc(it.kind) + '">' +
      '<b class="today-what">' + esc(x.what) + "</b>" +
      '<dl class="today-kv">' +
        "<dt>" + esc(t("today.why")) + "</dt><dd>" + esc(x.why) + "</dd>" +
        "<dt>" + esc(t("today.next")) + "</dt><dd>" + esc(x.next) + "</dd>" +
        "<dt>" + esc(t("today.who")) + "</dt><dd>" + esc(x.who) + "</dd>" +
        "<dt>" + esc(t("today.by")) + "</dt><dd>" + byText(it) + "</dd>" +
        "<dt>" + esc(t("today.source")) + "</dt><dd>" + esc(x.src) + "</dd>" +
      "</dl>" + destButton(it, "btn btn-sm today-go") + "</li>";
  }

  function answer(n, q) {
    var s = q.state, cls = "is-unk", txt = t("today.a.unknown");
    if (n === 1) {
      if (s === "no") { cls = "is-bad"; txt = t("today.a1.no", { n: q.items.length }); }
      else if (s === "yes") { cls = "is-ok"; txt = t("today.a1.yes", { n: q.extra.booked }); }
      else if (s === "empty") { cls = "is-ok"; txt = t("today.a1.empty"); }
    } else if (n === 2) {
      if (s === "some") { cls = "is-warn"; txt = t("today.a2.some", { n: q.items.length + (q.extra.more || 0) }); }
      else if (s === "none") { cls = "is-ok"; txt = t("today.a2.none"); }
    } else if (n === 3) {
      if (s === "some" && q.extra.partial) { cls = "is-warn"; txt = t("today.a3.partial", { n: q.items.length }); }
      else if (s === "some") { cls = "is-warn"; txt = t("today.a3.some", { n: q.items.length }); }
      else if (s === "none") { cls = "is-ok"; txt = t("today.a3.none"); }
    }
    return '<span class="today-ans ' + cls + '" data-today-ans="' + n + '">' + esc(txt) + "</span>";
  }
  function dep(key) { return '<p class="today-dep"><span class="today-badge is-nc">' + esc(t("today.st.notConnected")) + "</span> " + esc(t(key)) + "</p>"; }

  function sourceRow(key, status, detail) {
    var cls = { live: "is-ok", stale: "is-warn", error: "is-unk", nc: "is-nc", loading: "is-unk" }[status];
    var label = { live: "today.st.live", stale: "today.st.stale", error: "today.st.unknown", nc: "today.st.notConnected", loading: "today.st.loading" }[status];
    return '<li data-today-src="' + esc(key) + '"><span>' + esc(t("today.src." + key)) + (detail ? ' <span class="muted">· ' + esc(detail) + "</span>" : "") + '</span><span class="today-badge ' + cls + '">' + esc(t(label)) + "</span></li>";
  }
  function liveStatus(err, at) { if (err) return "error"; if (!at) return "loading"; if (offlineSince) return "stale"; return "live"; }

  function render() {
    var box = $("[data-today]");
    if (!box || !active) return;
    if (!isOwner()) { box.innerHTML = '<p class="muted">' + esc(t("today.ownerOnly")) + "</p>"; return; }
    var now = Date.now(), today = ymdOf(new Date(now));
    var reqs = reqFailed() ? null : requestsNow();
    var res = derive({ now: now, today: today, requests: reqs, shifts: shiftsErr ? null : shifts, day: dayFor === today && !dayErr ? day : null, capacity: AV.capacity });
    var first = res.items[0];
    var h = '<div class="today-head"><h2 class="title">' + esc(t("today.h")) + '</h2><p class="muted">' + esc(t("today.asOf", { date: fmtDay(today), time: fmtTime(now) })) + "</p></div>";
    if (offlineSince) h += '<p class="notice today-offline">' + esc(t("today.offline", { time: fmtTime(offlineSince) })) + "</p>";
    if (reqs && first && first.kind !== "cash") {
      var fx = text(first);
      h += '<section class="today-first" aria-labelledby="today-first-h"><span class="today-first-lbl">' + esc(t("today.first")) + " · " + esc(t("today.q" + first.q)) + '</span><h3 id="today-first-h">' + esc(fx.next) + '</h3><p>' + esc(fx.what) + "</p><p>" + esc(fx.who) + " · " + byText(first) + "</p>" + destButton(first, "btn today-first-go") + "</section>";
    } else {
      h += '<section class="today-first is-calm"><span class="today-first-lbl">' + esc(t("today.first")) + "</span><h3>" + esc(reqs ? t("today.calm") : t("today.cantTell")) + "</h3><p>" + esc(t("today.calmNote")) + "</p></section>";
    }
    [1, 2, 3, 4].forEach(function (n) {
      var q = res.q[n];
      h += '<section class="today-q" data-today-q="' + n + '"><header><h3>' + esc(t("today.q" + n)) + "</h3>" + answer(n, q) + "</header>";
      if (q.items.length) h += '<ul class="today-items">' + q.items.map(itemHTML).join("") + "</ul>";
      if (n === 1) {
        if (reqs && !q.items.length) h += '<p class="today-note">' + esc(q.extra.booked ? t("today.q1.ok", { n: q.extra.booked }) : t("today.q1.none")) + "</p>";
        h += '<p class="today-note">' + esc(t("today.capacityNote", { cap: AV.capacity })) + "</p>" + dep("today.dep.daysheet");
      }
      if (n === 2) {
        if (q.extra.more) h += '<p class="today-note"><button type="button" class="link-btn" data-today-go="new">' + esc(t("today.k.waiting.more", { n: q.extra.more })) + "</button></p>";
        if (q.extra.assigned) h += '<p class="today-note">' + esc((q.extra.assigned === 1 ? t("today.k.waiting.assigned1") : t("today.k.waiting.assigned", { n: q.extra.assigned }))) + "</p>";
        h += dep("today.dep.queue");
      }
      if (n === 3) h += dep("today.dep.crew");
      h += "</section>";
    });
    var rl = latestChange(getItems());
    h += '<section class="today-sources"><h3>' + esc(t("today.src.h")) + "</h3><ul>" +
      sourceRow("requests", liveStatus(reqFailed(), reqAt), reqAt ? t("today.st.latest", { time: rl ? fmtWhen(rl) : "—" }) : "") +
      sourceRow("shifts", liveStatus(shiftsErr, shiftsAt), shiftsAt ? t("today.st.checked", { time: fmtWhen(shiftsAt) }) : "") +
      sourceRow("calendar", dayErr ? "error" : !dayAt ? "loading" : (now - dayAt > 15 * 60000 || offlineSince) ? "stale" : "live", dayAt ? t("today.st.checked", { time: fmtWhen(dayAt) }) : "") +
      sourceRow("queue", "nc", "") + sourceRow("daysheet", "nc", "") + sourceRow("books", "nc", "") +
      "</ul></section>";
    box.innerHTML = h;
  }

  function loadDay() {
    var today = ymdOf(new Date());
    B.availability(today, today).then(function (r) {
      if (!r.live) { dayErr = true; render(); return; }
      day = r.days[today] || { closed: false, blockedSlots: [] }; dayFor = today; dayErr = false; dayAt = Date.now(); render();
    }).catch(function (e) { dayErr = true; if (root.console) console.warn("today: calendar", e); render(); });
  }

  function onClick(ev) {
    var b = ev.target.closest("[data-today-go]");
    if (!b) return;
    var type = b.getAttribute("data-today-go"), id = b.getAttribute("data-today-id");
    if (type === "request" && nav.openRequest) nav.openRequest(id);
    else if (type === "day" && nav.openDay) nav.openDay(id);
    else if (type === "teamtime" && nav.openTeamTime) nav.openTeamTime();
    else if (type === "new" && nav.openNew) nav.openNew();
  }
  function online() { if (offlineSince) { offlineSince = 0; loadDay(); render(); } }
  function offline() { if (!offlineSince) { offlineSince = Date.now(); render(); } }

  // admin.js: enter(adminRecord, () => merged requests or null, navigation)
  function enter(rec, items, navigation) {
    leave();
    me = rec; getItems = items; nav = navigation || {};
    if (!isOwner()) return;   // the tab is hidden for everyone else; no owner data is requested
    var from = new Date(); from.setDate(from.getDate() - LOOKBACK_DAYS - 1);
    unsubShifts = B.watchShiftsSince(B.tsFromDate(from), function (list, err) {
      if (err) { shiftsErr = true; if (root.console) console.warn("today: shifts", err); render(); return; }
      shifts = list.map(function (s) { return { requestId: s.requestId, email: s.email, inMs: s.inAt ? B.toMs(s.inAt) : 0, outMs: s.outAt ? B.toMs(s.outAt) : 0 }; });
      shiftsErr = false; shiftsAt = Date.now(); render();
    });
    loadDay();
    tick = setInterval(render, 60000);           // overdue times flip without a reload
    dayTimer = setInterval(loadDay, 5 * 60000);  // the calendar day is fetched, not streamed
    if (root.navigator && root.navigator.onLine === false) offlineSince = Date.now();
  }
  function leave() {
    if (unsubShifts) { try { unsubShifts(); } catch (e) { /* closed */ } unsubShifts = null; }
    if (tick) { clearInterval(tick); tick = null; }
    if (dayTimer) { clearInterval(dayTimer); dayTimer = null; }
    me = null; shifts = null; shiftsErr = false; shiftsAt = 0; day = null; dayErr = false; dayAt = 0; dayFor = ""; errs = {}; reqAt = 0;
    var box = $("[data-today]"); if (box) box.innerHTML = "";
  }
  // admin.js calls this when requests or their staff-only fields arrive
  // (which = "requests" | "internal"; err = that listener failed).
  function requestsChanged(which, err) { errs[which] = !!err; if (!err && which === "requests") reqAt = Date.now(); render(); }
  function show(on) { active = !!on; if (active) { if (dayAt && Date.now() - dayAt > 60000) loadDay(); render(); } }

  var boxEl = $("[data-today]");
  if (boxEl) boxEl.addEventListener("click", onClick);
  root.addEventListener("online", online);
  root.addEventListener("offline", offline);
  document.addEventListener("mkg:langchange", render);

  C.today = { enter: enter, leave: leave, requestsChanged: requestsChanged, show: show, render: render };
})(typeof window !== "undefined" ? window : globalThis);
