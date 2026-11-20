// The customer-reschedule recorder (recorder.js) against an in-memory stand-in
// for Firestore with create() semantics. The same scenario runs on the real
// Firestore emulator in test/recorder.emulator.test.js (CI).
// Fictional booking: Nora Example, #NORA01, confirmed Thu Dec 10 8:00.
const assert = require("assert");
const { recordMove, buildMoveEvent } = require("../recorder");

function ts(iso) { const ms = Date.parse(iso); return { seconds: Math.floor(ms / 1000), nanoseconds: (ms % 1000) * 1e6 }; }
function fakeDb() {
  const docs = new Map();
  return { docs, doc(path) { return { create(data) {
    if (docs.has(path)) { const e = new Error("6 ALREADY_EXISTS: Document already exists: " + path); e.code = 6; return Promise.reject(e); }
    docs.set(path, data); return Promise.resolve();
  } }; } };
}
let clock = Date.parse("2026-12-07T09:00:00-05:00");
const stamp = () => ({ __recordedAt: clock });
let n = 0; function check(name, fn) { return Promise.resolve().then(fn).then(() => { n++; console.log("  ok   " + name); }); }

const booked = { name: "Nora Example", status: "confirmed", date: "2026-12-10", slot: "0800", quotedPrice: 180 };
const move1 = Object.assign({}, booked, { status: "new", date: "2026-12-09", slot: "1130", movedFrom: "2026-12-10 0800", movedByClientAt: ts("2026-12-07T09:02:14.381-05:00") });
const move2 = Object.assign({}, move1, { date: "2026-12-11", slot: "1500", movedFrom: "2026-12-09 1130", movedByClientAt: ts("2026-12-07T09:40:05.112-05:00") });
const staffEdit = Object.assign({}, move2, { quotedPrice: 195 });
const staffMove = Object.assign({}, staffEdit, { date: "2026-12-12", slot: "0800" });

(async () => {
  const db = fakeDb(), ev = () => [...db.docs.entries()].filter(([p]) => p.startsWith("internal/NORA01/events/"));
  await check("the second move's trigger arrives first: one entry, Wed 11:30 -> Fri 3:00 pm", async () => {
    clock = Date.parse("2026-12-07T09:40:06-05:00");
    const r = await recordMove(db, "NORA01", move1, move2, stamp);
    assert.strictEqual(r.status, "written"); assert.strictEqual(r.id, "move-1796654405-112000000");
    const d = db.docs.get("internal/NORA01/events/move-1796654405-112000000");
    assert.deepStrictEqual([d.kind, d.by, d.from, d.to, d.prevStatus], ["move", "customer", "2026-12-09 1130", "2026-12-11 1500", "new"]);
    assert.deepStrictEqual(d.prevMovedAt, move1.movedByClientAt);
  });
  await check("the first move's trigger arrives later: two entries, Thu 8:00 -> Wed 11:30 recorded late", async () => {
    clock = Date.parse("2026-12-07T09:41:30-05:00");
    const r = await recordMove(db, "NORA01", booked, move1, stamp);
    assert.strictEqual(r.status, "written"); assert.strictEqual(r.id, "move-1796652134-381000000");
    const d = db.docs.get("internal/NORA01/events/move-1796652134-381000000");
    assert.deepStrictEqual([d.from, d.to, d.prevStatus, d.prevMovedAt], ["2026-12-10 0800", "2026-12-09 1130", "confirmed", null]);
    assert.strictEqual(ev().length, 2);
  });
  await check("in move-time order the chain reads Thu 8:00 -> Wed 11:30 -> Fri 3:00 pm", () => {
    const list = ev().map(([, d]) => d).sort((a, b) => a.at.seconds - b.at.seconds || a.at.nanoseconds - b.at.nanoseconds);
    assert.deepStrictEqual(list.map((d) => d.from + " > " + d.to), ["2026-12-10 0800 > 2026-12-09 1130", "2026-12-09 1130 > 2026-12-11 1500"]);
  });
  await check("replaying the first move's trigger writes nothing: still exactly two entries", async () => {
    const before = JSON.stringify([...db.docs]);
    const r = await recordMove(db, "NORA01", booked, move1, stamp);
    assert.strictEqual(r.status, "duplicate"); assert.strictEqual(ev().length, 2); assert.strictEqual(JSON.stringify([...db.docs]), before);
  });
  await check("a staff edit (price) creates no customer-move entry", async () => {
    const r = await recordMove(db, "NORA01", move2, staffEdit, stamp); assert.strictEqual(r.status, "skipped"); assert.strictEqual(ev().length, 2);
  });
  await check("a staff reschedule (date changed, no new customer move) creates no customer-move entry", async () => {
    const r = await recordMove(db, "NORA01", staffEdit, staffMove, stamp); assert.strictEqual(r.status, "skipped"); assert.strictEqual(ev().length, 2);
  });
  await check("a request the customer never moved creates nothing", async () => {
    assert.strictEqual(buildMoveEvent(booked, Object.assign({}, booked, { status: "done" }), stamp), null);
  });
  await check("a write error other than already-exists is thrown, so the platform retries", async () => {
    const bad = { doc() { return { create() { const e = new Error("14 UNAVAILABLE"); e.code = 14; return Promise.reject(e); } }; } };
    await assert.rejects(recordMove(bad, "NORA01", booked, move1, stamp), /UNAVAILABLE/);
  });
  console.log("recorder.test.js: all " + n + " checks passed");
})().catch((e) => { console.error(e); process.exit(1); });
