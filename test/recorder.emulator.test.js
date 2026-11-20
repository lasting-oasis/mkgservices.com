/*
  The customer-reschedule recorder (functions/recorder.js) on the Firestore
  emulator, with the Admin SDK the deployed function uses, and the rules for
  who can read the resulting history.

    cd functions && npm ci && cd ../test && npm install
    npx firebase emulators:exec --only firestore --project demo-mkg-rules --config ../firebase.json "node recorder.emulator.test.js"

  Fictional booking: Nora Example (#NORA01, nora@example.test), confirmed
  Thu Dec 10 8:00. She moves it to Wed Dec 9 11:30, then to Fri Dec 11 3:00 pm.
  The trigger for the second move is run first; the first one's runs later and
  is then replayed.
*/
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const fromFunctions = (m) => require(require.resolve(m, { paths: [path.join(__dirname, "..", "functions")] }));
const { initializeApp } = fromFunctions("firebase-admin/app");
const { getFirestore, FieldValue } = fromFunctions("firebase-admin/firestore");
const { initializeTestEnvironment } = require("@firebase/rules-unit-testing");
const { recordMove } = require("../functions/recorder");

const PROJECT = "demo-mkg-rules";
let passes = 0, failures = 0;
async function check(name, fn) {
  try { await fn(); passes++; console.log("  ok   " + name); }
  catch (e) { failures++; console.log("  FAIL " + name + "  (" + String((e && e.message) || e).split("\n")[0].slice(0, 160) + ")"); }
}

(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("run under firebase emulators:exec");
  const app = initializeApp({ projectId: PROJECT }, "recorder-test");
  const db = getFirestore(app);
  const req = db.doc("requests/NORA01");
  const events = () => db.collection("internal/NORA01/events").get();
  const stamp = () => FieldValue.serverTimestamp();

  // Seed: the booking, the team member, and staff fields. Admin SDK, as the function runs.
  await db.doc("admins/staff-uid").set({ email: "staff@mkg.test", role: "admin" });
  await req.set({ name: "Nora Example", email: "nora@example.test", emailLower: "nora@example.test", status: "confirmed", date: "2026-12-10", slot: "0800", quotedPrice: 180, createdAt: FieldValue.serverTimestamp() });
  await db.doc("internal/NORA01").set({ adminNotes: "gate code 4410", assignedTo: "staff@mkg.test", updatedAt: FieldValue.serverTimestamp() });

  // The customer's two moves, each stamped by the server as the rules require.
  const s0 = (await req.get()).data();
  await req.update({ status: "new", date: "2026-12-09", slot: "1130", movedFrom: "2026-12-10 0800", movedByClientAt: FieldValue.serverTimestamp() });
  const s1 = (await req.get()).data();
  await new Promise((r) => setTimeout(r, 25));
  await req.update({ date: "2026-12-11", slot: "1500", movedFrom: "2026-12-09 1130", movedByClientAt: FieldValue.serverTimestamp() });
  const s2 = (await req.get()).data();

  console.log("\n-- triggers delivered out of order --");
  await check("the second move's trigger runs first and writes one entry", async () => {
    const r = await recordMove(db, "NORA01", s1, s2, stamp);
    assert.strictEqual(r.status, "written");
    assert.strictEqual((await events()).size, 1);
  });
  await check("the first move's trigger runs later and writes the second entry", async () => {
    const r = await recordMove(db, "NORA01", s0, s1, stamp);
    assert.strictEqual(r.status, "written");
    assert.strictEqual((await events()).size, 2);
  });
  await check("history by move time (the admin page's query): newest first, correct old and new times", async () => {
    const q = await db.collection("internal/NORA01/events").orderBy("at", "desc").get();
    const rows = q.docs.map((d) => [d.data().kind, d.data().from, d.data().to, d.data().prevStatus]);
    assert.deepStrictEqual(rows, [["move", "2026-12-09 1130", "2026-12-11 1500", "new"], ["move", "2026-12-10 0800", "2026-12-09 1130", "confirmed"]]);
    const [m2, m1] = q.docs.map((d) => d.data());
    assert.ok(m1.recordedAt.toMillis() > m2.recordedAt.toMillis(), "the first move was recorded after the second");
    assert.ok(m2.prevMovedAt && m2.prevMovedAt.isEqual(m1.at), "the second move points at the first");
  });

  console.log("\n-- replay --");
  await check("replaying the first move's trigger: duplicate, still exactly two entries", async () => {
    const r = await recordMove(db, "NORA01", s0, s1, stamp);
    assert.strictEqual(r.status, "duplicate");
    assert.strictEqual((await events()).size, 2);
  });

  console.log("\n-- staff changes --");
  await check("a staff edit (price) creates no customer-move entry", async () => {
    await req.update({ quotedPrice: 195, updatedAt: FieldValue.serverTimestamp() });
    const s3 = (await req.get()).data();
    assert.strictEqual((await recordMove(db, "NORA01", s2, s3, stamp)).status, "skipped");
    assert.strictEqual((await events()).size, 2);
  });
  await check("a staff confirmation creates no customer-move entry", async () => {
    const before = (await req.get()).data();
    await req.update({ status: "confirmed", updatedAt: FieldValue.serverTimestamp() });
    assert.strictEqual((await recordMove(db, "NORA01", before, (await req.get()).data(), stamp)).status, "skipped");
    assert.strictEqual((await events()).size, 2);
  });

  console.log("\n-- who can read the history --");
  const env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { rules: fs.readFileSync(path.join(__dirname, "..", "firestore.rules"), "utf8"), host: process.env.FIRESTORE_EMULATOR_HOST.split(":")[0], port: Number(process.env.FIRESTORE_EMULATOR_HOST.split(":")[1]) } });
  const nora = env.authenticatedContext("nora-uid", { email: "nora@example.test", email_verified: true }).firestore();
  const staff = env.authenticatedContext("staff-uid", { email: "staff@mkg.test", email_verified: true }).firestore();
  const visitor = env.unauthenticatedContext().firestore();
  async function denied(p) { try { await p; return false; } catch (e) { return /PERMISSION_DENIED|permission/i.test(String(e && (e.code || e.message))); } }
  await check("the customer can read her own booking", async () => { assert.strictEqual((await nora.doc("requests/NORA01").get()).data().date, "2026-12-11"); });
  await check("the customer cannot read the staff history", async () => { assert.ok(await denied(nora.collection("internal/NORA01/events").get())); });
  await check("the customer cannot read one history entry by id", async () => {
    const id = (await events()).docs[0].id;
    assert.ok(await denied(nora.doc("internal/NORA01/events/" + id).get()));
  });
  await check("a visitor cannot read the staff history", async () => { assert.ok(await denied(visitor.collection("internal/NORA01/events").get())); });
  await check("staff can read both entries", async () => { assert.strictEqual((await staff.collection("internal/NORA01/events").get()).size, 2); });
  await check("staff cannot forge a customer-move entry", async () => {
    assert.ok(await denied(staff.collection("internal/NORA01/events").add({ at: firebaseServerTs(), by: "staff-uid", kind: "move", text: "x" })));
  });
  await check("staff cannot change or delete a customer-move entry", async () => {
    const id = (await events()).docs[0].id;
    assert.ok(await denied(staff.doc("internal/NORA01/events/" + id).update({ to: "2026-12-12 0800" })));
    assert.ok(await denied(staff.doc("internal/NORA01/events/" + id).delete()));
  });
  await env.cleanup();

  console.log("\n" + passes + " passed, " + failures + " failed");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error("HARNESS ERROR", e); process.exit(2); });

function firebaseServerTs() { return require("firebase/compat/app").default.firestore.FieldValue.serverTimestamp(); }
