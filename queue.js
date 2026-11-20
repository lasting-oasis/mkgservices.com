/*
  admin.html, Requests: the daily queue's rules (Task 3B-1).

  Which requests owe a reply, who owns each one, what to do next, and by when.
  Three kinds of item:
    quote       a new request nobody has answered yet (status 'new')
    reschedule  the customer moved their visit from the account page
                (status back to 'new' with movedByClientAt)
    followup    something staff promised, with a time (queue state 'waiting')

  Due times
    The clock runs Mon–Fri 8:00–18:00 in Charlotte (America/New_York);
    evenings and weekends don't count. There is no holiday list yet.
    Rule due = the earlier of
      4 working hours after the start (the provisional internal target), and
      1 business day = 10 working hours after the start (the promise the
        website makes: "within one business day" / "en un día hábil"),
    and, for a reschedule, no later than the start of the earlier of the old
    and new visit windows. The start is the request's createdAt or the move's
    movedByClientAt; the rules make both the server's time.
    A time staff set on the item (a promise like "by Tuesday noon") replaces
    the rule while it is newer than the start. A later customer move starts a
    new item. Changing the owner never changes the due time.

  Everything here is pure (records in, items out, no text), so
  test/queue.test.js can run it in Node. admin.js draws the strip.
*/
(function (root) {
  "use strict";
  var TZ = "America/New_York";
  var WORK = { start: 8, end: 18, days: { 1: true, 2: true, 3: true, 4: true, 5: true } };
  var TARGET_HOURS = 4;          // provisional internal target (manager, Task 3)
  var PROMISE_HOURS = 10;        // "within one business day": one working day
  var STATES = { open: true, waiting: true, closed: true };

  // ---------- Charlotte wall-clock time ----------
  var fmt = null;
  function parts(ms) {
    fmt = fmt || new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "short" });
    var o = {};
    fmt.formatToParts(new Date(ms)).forEach(function (p) { o[p.type] = p.value; });
    var dow = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[o.weekday];
    return { y: +o.year, m: +o.month, d: +o.day, h: +o.hour % 24, mi: +o.minute, s: +o.second, dow: dow };
  }
  // The instant when Charlotte's clocks read y-m-d h:mi.
  function wall(y, m, d, h, mi) {
    var guess = Date.UTC(y, m - 1, d, h, mi || 0);
    for (var i = 0; i < 3; i++) {
      var p = parts(guess), seen = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi);
      var diff = Date.UTC(y, m - 1, d, h, mi || 0) - seen;
      if (!diff) break;
      guess += diff;
    }
    return guess;
  }
  function dayStart(p, h) { return wall(p.y, p.m, p.d, h, 0); }
  function nextDay(p) { var x = new Date(Date.UTC(p.y, p.m - 1, p.d + 1, 12)); return parts(wall(x.getUTCFullYear(), x.getUTCMonth() + 1, x.getUTCDate(), 12, 0)); }

  // Add working hours to an instant.
  function addWorkHours(ms, hours) {
    var left = Math.round(hours * 60) * 6e4, t = ms;
    for (var guard = 0; guard < 400 && left > 0; guard++) {
      var p = parts(t), open = dayStart(p, WORK.start), close = dayStart(p, WORK.end);
      if (!WORK.days[p.dow] || t >= close) { t = dayStart(nextDay(p), WORK.start); continue; }
      if (t < open) t = open;
      var room = close - t;
      if (room >= left) { t += left; left = 0; } else { left -= room; t = dayStart(nextDay(p), WORK.start); }
    }
    return t;
  }
  // When a visit window starts: "2026-12-10" + "0800" → 8:00 that day in Charlotte.
  function slotStart(ymd, slot) {
    var d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || ""), s = /^(\d{2})(\d{2})$/.exec(slot || "");
    if (!d) return null;
    return wall(+d[1], +d[2], +d[3], s ? +s[1] : WORK.start, s ? +s[2] : 0);
  }

  // ---------- items ----------
  function num(v) { return typeof v === "number" && isFinite(v) ? v : null; }
  /*
    r: a merged request (admin.js items): status, createdMs, movedMs, date, slot,
       movedFrom ("YYYY-MM-DD SLOT"), assignedTo, queue: { state, dueMs, nextAction, setMs }
    Returns null, or { id, kind, start, ruleDue, targetDue, promiseDue, visitDue,
       dueMs, dueFrom ('rule' | 'visit' | 'staff'), owner, nextAction, state, late }.
  */
  function itemFor(r, now) {
    var s = r.status || "new", q = r.queue || {}, moved = s === "new" && num(r.movedMs) !== null;
    var start = moved ? r.movedMs : num(r.createdMs);
    var setMs = num(q.setMs), staffNewer = setMs !== null && (start === null || setMs >= start);
    var state = staffNewer && STATES[q.state] ? q.state : "open";
    var kind = null;
    if (state === "waiting") kind = "followup";
    else if (s === "new") kind = moved ? "reschedule" : "quote";
    if (!kind || state === "closed") return null;
    if (kind === "followup" && (s === "done" || s === "declined" || s === "cancelled")) return null;

    var it = { id: r.id, kind: kind, start: start, owner: r.assignedTo || "", state: state,
      nextAction: staffNewer && q.nextAction ? q.nextAction : "", dueFrom: "rule" };
    if (start !== null) {
      it.targetDue = addWorkHours(start, TARGET_HOURS);
      it.promiseDue = addWorkHours(start, PROMISE_HOURS);
      it.ruleDue = Math.min(it.targetDue, it.promiseDue);
      it.dueMs = it.ruleDue;
      if (kind === "reschedule") {
        var from = (r.movedFrom || "").split(" "), a = slotStart(from[0], from[1]), b = slotStart(r.date, r.slot);
        var visit = [a, b].filter(function (x) { return x !== null; }).sort(function (x, y) { return x - y; })[0];
        if (visit !== undefined && visit < it.dueMs) { it.visitDue = visit; it.dueMs = visit; it.dueFrom = "visit"; }
      }
    } else it.dueMs = null;
    if (staffNewer && num(q.dueMs) !== null) { it.dueMs = q.dueMs; it.dueFrom = "staff"; }
    it.late = it.dueMs !== null && it.dueMs < now;
    return it;
  }
  // The queue, most urgent first: late, then soonest due, then oldest.
  function build(requests, now) {
    return (requests || []).map(function (r) { return itemFor(r, now); }).filter(Boolean).sort(function (a, b) {
      return (b.late ? 1 : 0) - (a.late ? 1 : 0) || (a.dueMs === null) - (b.dueMs === null) || (a.dueMs || 0) - (b.dueMs || 0) || (a.start || 0) - (b.start || 0);
    });
  }
  function sameDay(a, b) { var x = parts(a), y = parts(b); return x.y === y.y && x.m === y.m && x.d === y.d; }
  function summary(items, now) {
    var s = { late: 0, today: 0, triage: 0, all: items.length };
    items.forEach(function (it) {
      if (it.late) s.late++;
      else if (it.dueMs !== null && sameDay(it.dueMs, now)) s.today++;
      if (!it.owner) s.triage++;
    });
    return s;
  }
  // The newest promise staff made to the customer (a "reply" event), if any.
  function lastPromise(events) {
    var best = null;
    (events || []).forEach(function (e) { if (e.kind === "reply" && e.text && (!best || e.atMs > best.atMs)) best = e; });
    return best;
  }

  root.MKG = root.MKG || {};
  root.MKG.queueLogic = { TZ: TZ, TARGET_HOURS: TARGET_HOURS, PROMISE_HOURS: PROMISE_HOURS, parts: parts, wall: wall,
    addWorkHours: addWorkHours, slotStart: slotStart, itemFor: itemFor, build: build, summary: summary, sameDay: sameDay, lastPromise: lastPromise };
})(typeof window !== "undefined" ? window : globalThis);
