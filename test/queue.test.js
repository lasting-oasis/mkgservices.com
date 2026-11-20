/*
  Request queue (queue.js): due times and which requests are in the queue,
  with synthetic records. No emulator or browser needed:  node test/queue.test.js
  Times are Charlotte wall-clock times (America/New_York), whatever the
  machine's own time zone is.
*/
"use strict";
var assert = require("assert");
global.window = {};
require("../queue.js");
var Q = window.MKG.queueLogic;

function at(y, m, d, h, mi) { return Q.wall(y, m, d, h, mi || 0); }
function show(ms) { var p = Q.parts(ms); return p.y + "-" + p.m + "-" + p.d + " " + p.h + ":" + String(p.mi).padStart(2, "0"); }
function req(id, o) { return Object.assign({ id: id, status: "new", createdMs: at(2026, 12, 1, 9), assignedTo: "", date: "", slot: "", queue: null }, o); }
var n = 0;
function check(name, fn) { fn(); n++; console.log("  ok   " + name); }

console.log("-- the clock --");
check("4 working hours inside one day", function () { assert.strictEqual(show(Q.addWorkHours(at(2026, 12, 7, 9, 10), 4)), "2026-12-7 13:10"); });
check("Friday 3:30 pm quote: due Monday 9:30 am (2.5 h Friday + 1.5 h Monday)", function () {
  var it = Q.itemFor(req("fri", { createdMs: at(2026, 12, 4, 15, 30) }), at(2026, 12, 4, 15, 31));
  assert.strictEqual(it.kind, "quote");
  assert.strictEqual(show(it.dueMs), "2026-12-7 9:30");
  assert.strictEqual(it.dueFrom, "rule");
  assert.strictEqual(show(it.promiseDue), "2026-12-7 15:30", "the website's one-business-day promise");
  assert.ok(it.dueMs <= it.promiseDue, "the internal target is never later than the customer promise");
});
check("the Friday quote is not late at 9:30 Monday and is late at 9:31", function () {
  var r = req("fri", { createdMs: at(2026, 12, 4, 15, 30) });
  assert.strictEqual(Q.itemFor(r, at(2026, 12, 7, 9, 30)).late, false);
  assert.strictEqual(Q.itemFor(r, at(2026, 12, 7, 9, 31)).late, true);
});
check("a form sent Friday 5:55 pm is due Monday 11:55 am", function () { assert.strictEqual(show(Q.addWorkHours(at(2026, 12, 4, 17, 55), 4)), "2026-12-7 11:55"); });
check("a form sent Saturday night starts the clock Monday 8:00", function () { assert.strictEqual(show(Q.addWorkHours(at(2026, 12, 5, 21, 10), 4)), "2026-12-7 12:00"); });
check("before opening: a 6:40 am form is due at noon", function () { assert.strictEqual(show(Q.addWorkHours(at(2026, 12, 8, 6, 40), 4)), "2026-12-8 12:00"); });
check("across the end of daylight saving time (Nov 1, 2026): Friday 4 pm is due Monday 10 am", function () {
  assert.strictEqual(Q.addWorkHours(at(2026, 10, 30, 16), 4), at(2026, 11, 2, 10));
});

console.log("-- staff promises and handoff --");
check("an earlier staff promise replaces the rule", function () {
  var r = req("p", { createdMs: at(2026, 12, 4, 15, 30), queue: { state: "open", dueMs: at(2026, 12, 4, 17, 0), setMs: at(2026, 12, 4, 15, 45), nextAction: "Call back before 5" } });
  var it = Q.itemFor(r, at(2026, 12, 4, 16, 0));
  assert.strictEqual(show(it.dueMs), "2026-12-4 17:00");
  assert.strictEqual(it.dueFrom, "staff");
  assert.strictEqual(it.nextAction, "Call back before 5");
});
check("a staff promise also holds when it is later than the rule (a follow-up)", function () {
  var r = req("f", { status: "confirmed", createdMs: at(2026, 12, 1, 9), queue: { state: "waiting", dueMs: at(2026, 12, 8, 12), setMs: at(2026, 12, 7, 9, 10), nextAction: "Text Thursday openings" } });
  var it = Q.itemFor(r, at(2026, 12, 8, 8));
  assert.strictEqual(it.kind, "followup");
  assert.strictEqual(show(it.dueMs), "2026-12-8 12:00");
});
check("a dispatcher takeover changes the owner and nothing else", function () {
  var base = { createdMs: at(2026, 12, 1, 9), status: "confirmed", queue: { state: "waiting", dueMs: at(2026, 12, 8, 12), setMs: at(2026, 12, 7, 9, 10), nextAction: "Text Thursday openings" } };
  var before = Q.itemFor(req("h", Object.assign({}, base, { assignedTo: "ana@mkg.test" })), at(2026, 12, 8, 8));
  var after = Q.itemFor(req("h", Object.assign({}, base, { assignedTo: "carla@mkg.test" })), at(2026, 12, 8, 8, 4));
  assert.strictEqual(after.owner, "carla@mkg.test");
  assert.strictEqual(after.dueMs, before.dueMs);
  assert.strictEqual(after.nextAction, before.nextAction);
  assert.strictEqual(after.kind, before.kind);
});
check("a follow-up on a finished request leaves the queue", function () {
  assert.strictEqual(Q.itemFor(req("d", { status: "done", queue: { state: "waiting", dueMs: at(2026, 12, 8, 12), setMs: at(2026, 12, 7, 9) } }), at(2026, 12, 8, 8)), null);
});

console.log("-- reschedules --");
check("a weekend move: due Monday noon", function () {
  var r = req("m", { status: "new", createdMs: at(2026, 11, 20, 9), movedMs: at(2026, 12, 5, 21, 10), movedFrom: "2026-12-10 0800", date: "2026-12-17", slot: "1130" });
  var it = Q.itemFor(r, at(2026, 12, 7, 8));
  assert.strictEqual(it.kind, "reschedule");
  assert.strictEqual(show(it.dueMs), "2026-12-7 12:00");
  assert.strictEqual(it.dueFrom, "rule");
});
check("a move close to the visit: due when the earlier window starts, not after it", function () {
  // Booked Thu Dec 10, 8:00. Moved Wed 4:30 pm to Thu 3:00 pm. The rule alone says Thu 10:30 am.
  var r = req("c", { status: "new", createdMs: at(2026, 11, 20, 9), movedMs: at(2026, 12, 9, 16, 30), movedFrom: "2026-12-10 0800", date: "2026-12-10", slot: "1500" });
  var it = Q.itemFor(r, at(2026, 12, 9, 16, 31));
  assert.strictEqual(show(it.ruleDue), "2026-12-10 10:30");
  assert.strictEqual(show(it.dueMs), "2026-12-10 8:00");
  assert.strictEqual(it.dueFrom, "visit");
});
check("a move to an earlier visit caps the due time at the new window", function () {
  var r = req("e", { status: "new", createdMs: at(2026, 11, 20, 9), movedMs: at(2026, 12, 9, 16, 30), movedFrom: "2026-12-17 0800", date: "2026-12-10", slot: "0800" });
  assert.strictEqual(show(Q.itemFor(r, at(2026, 12, 9, 17)).dueMs), "2026-12-10 8:00");
});
check("a closed item comes back when the customer moves the visit afterwards", function () {
  var closed = req("x", { status: "new", createdMs: at(2026, 12, 1, 9), queue: { state: "closed", setMs: at(2026, 12, 1, 10) } });
  assert.strictEqual(Q.itemFor(closed, at(2026, 12, 2, 9)), null);
  var moved = Object.assign({}, closed, { movedMs: at(2026, 12, 3, 9), movedFrom: "2026-12-10 0800", date: "2026-12-17", slot: "0800" });
  var it = Q.itemFor(moved, at(2026, 12, 3, 9, 5));
  assert.strictEqual(it.kind, "reschedule");
  assert.strictEqual(it.dueFrom, "rule", "the older staff time no longer applies");
});

console.log("-- the list --");
check("confirmed and finished requests with no follow-up are not in the queue", function () {
  assert.strictEqual(Q.itemFor(req("c1", { status: "confirmed" }), at(2026, 12, 2, 9)), null);
  assert.strictEqual(Q.itemFor(req("c2", { status: "declined" }), at(2026, 12, 2, 9)), null);
});
check("late first, then soonest due; summary counts late, due today and unassigned", function () {
  var now = at(2026, 12, 7, 10);
  var list = Q.build([
    req("a", { createdMs: at(2026, 12, 7, 9) }),                                // due 13:00 today
    req("b", { createdMs: at(2026, 12, 4, 15, 30), assignedTo: "ana@mkg.test" }), // due 9:30 today, late
    req("c", { createdMs: at(2026, 12, 7, 9, 30), status: "confirmed" }),        // not in the queue
  ], now);
  assert.deepStrictEqual(list.map(function (i) { return i.id; }), ["b", "a"]);
  assert.deepStrictEqual(Q.summary(list, now), { late: 1, today: 1, triage: 1, all: 2 });
});
check("the last promise is the newest reply event", function () {
  var p = Q.lastPromise([{ kind: "owner", atMs: 3, text: "x" }, { kind: "reply", atMs: 1, text: "old" }, { kind: "reply", atMs: 2, text: "Tuesday noon" }]);
  assert.strictEqual(p.text, "Tuesday noon");
  assert.strictEqual(Q.lastPromise([{ kind: "owner", atMs: 1, text: "a" }]), null);
});

console.log("queue.test.js: all " + n + " checks passed");
