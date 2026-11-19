/*
  Today / Hoy (today.js): the pure derive() step, with synthetic records.
  No emulator or browser needed:  node test/today.test.js
*/
"use strict";
var assert = require("assert");
global.window = {};                      // today.js attaches to window.MKG; the view part skips itself in Node
require("../today.js");
var T = window.MKG.todayLogic;

var TODAY = "2026-11-25", YDAY = "2026-11-24", OLD = "2026-11-01";
function at(ymd, h, m) { var p = ymd.split("-"); return new Date(+p[0], +p[1] - 1, +p[2], h, m || 0).getTime(); }
var NOW = at(TODAY, 7, 15);
function req(id, o) { return Object.assign({ id: id, name: "Test " + id, status: "confirmed", date: "", slot: "", assignedTo: "", sinceMs: at(YDAY, 9) }, o); }

var morning = [
  req("a", { date: TODAY, slot: "0800", assignedTo: "a@x" }),
  req("b", { date: TODAY, slot: "0800", assignedTo: "b@x" }),
  req("c", { date: TODAY, slot: "0800", assignedTo: "c@x" }),              // third in a window for two
  req("d", { date: TODAY, slot: "1130" }),                                  // confirmed, nobody assigned
  req("e", { date: TODAY, slot: "1130", status: "new", movedByClientMs: at(YDAY, 20) }),
  req("f", { status: "new", language: "es", sinceMs: at(YDAY, 18, 12) }),  // waiting, no owner
  req("g", { status: "new", assignedTo: "g@x" }),                           // waiting, owned
  req("h", { date: YDAY, slot: "0800" }),                                   // past and still open
  req("i", { date: YDAY, slot: "1130", status: "done" }),                   // done, has time
  req("j", { date: "2026-11-23", slot: "0800", status: "done" }),           // done, no time
  req("k", { date: OLD, status: "confirmed" }),                             // outside the 14-day look-back
  req("l", { date: TODAY, slot: "1500", status: "cancelled" }),             // closed: ignored
];
var shifts = [
  { requestId: "i", email: "w1@x", inMs: at(YDAY, 11, 40), outMs: at(YDAY, 14, 10) },
  { requestId: "", email: "w2@x", inMs: at(YDAY, 6, 0), outMs: 0 },        // open 25 hours
];

var r = T.derive({ now: NOW, today: TODAY, requests: morning, shifts: shifts, day: { closed: false, blockedSlots: [] }, capacity: 2 });
var kinds = function (q) { return r.q[q].items.map(function (x) { return x.kind + (x.id ? ":" + x.id : ""); }); };

assert.deepStrictEqual(kinds(1).sort(), ["notConfirmed:e", "overWindow", "unassigned:d"], "question 1 items");
assert.strictEqual(r.q[1].state, "no");
assert.strictEqual(r.q[1].extra.booked, 5, "cancelled booking not counted");
assert.deepStrictEqual(kinds(2), ["waiting:f"], "only the unowned new request waits");
assert.ok(r.q[2].items[0].spanish, "Spanish flagged");
assert.strictEqual(r.q[2].extra.assigned, 1);
assert.deepStrictEqual(kinds(3).sort(), ["longShift", "noTime:j", "pastOpen:h"], "question 3 items");
assert.strictEqual(r.q[4].state, "unknown", "money is unknown");
assert.strictEqual(r.q[4].items[0].kind, "cash");
assert.strictEqual(r.items[0].kind, "overWindow", "first action: the 8:00 window over capacity");
assert.strictEqual(r.items[r.items.length - 1].kind, "cash", "money is never the first action");
assert.ok(!r.items.some(function (x) { return x.amount !== undefined; }), "no money amounts anywhere");

// Request e is booked today and new: listed once (question 1), not again as waiting.
assert.strictEqual(r.items.filter(function (x) { return x.id === "e"; }).length, 1);

// Shifts not loaded (failed, or not the owner): no time check, question 3 stays partly unknown.
var noShifts = T.derive({ now: NOW, today: TODAY, requests: [req("h2", { date: TODAY, slot: "0800", assignedTo: "x" })], shifts: null, day: null, capacity: 2 });
assert.strictEqual(noShifts.q[3].state, "unknown");
assert.strictEqual(noShifts.q[1].state, "yes");

// Requests failed to load: everything unknown, the first action is not invented.
var none = T.derive({ now: NOW, today: TODAY, requests: null, shifts: null, day: null, capacity: 2 });
[1, 2, 3, 4].forEach(function (q) { assert.strictEqual(none.q[q].state, "unknown", "q" + q + " unknown"); });
assert.strictEqual(none.items[0].kind, "cash");

// A quiet day.
var quiet = T.derive({ now: NOW, today: TODAY, requests: [], shifts: [], day: { closed: false, blockedSlots: [] }, capacity: 2 });
assert.strictEqual(quiet.q[1].state, "empty");
assert.strictEqual(quiet.q[2].state, "none");
assert.strictEqual(quiet.q[3].state, "none");

// Closed day and blocked window.
var closed = T.derive({ now: NOW, today: TODAY, requests: [req("m", { date: TODAY, slot: "0800", assignedTo: "x" })], shifts: [], day: { closed: true, blockedSlots: [] }, capacity: 2 });
assert.deepStrictEqual(closed.q[1].items.map(function (x) { return x.kind; }), ["closedDay"]);
var blocked = T.derive({ now: NOW, today: TODAY, requests: [req("n", { date: TODAY, slot: "1500", assignedTo: "x" })], shifts: [], day: { closed: false, blockedSlots: ["1500"] }, capacity: 2 });
assert.deepStrictEqual(blocked.q[1].items.map(function (x) { return x.kind; }), ["blocked"]);

// Due times come from the window's start.
assert.strictEqual(T.slotStartMs(TODAY, "1130"), at(TODAY, 11, 30));

console.log("today.test.js: all checks passed");
