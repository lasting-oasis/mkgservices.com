/*
  Tests for firestore.rules, run against the Firestore emulator:

    cd test && npm install && npm test

  (or, from the repository root, with firebase-tools on PATH:
   firebase emulators:exec --only firestore --project demo-mkg-rules "node test/rules.test.js")

  Each test is one actor (a visitor, a signed-in client, a team member) trying
  one write, and the expectation that the rules allow or refuse it. The writes
  mirror what backend.js sends, so a change to either side shows up here.
*/
const fs = require("fs");
const path = require("path");
const { initializeTestEnvironment } = require("@firebase/rules-unit-testing");
const firebase = require("firebase/compat/app").default;
require("firebase/compat/firestore");

const RULES = path.join(__dirname, "..", "firestore.rules");
const FV = firebase.firestore.FieldValue, TS = firebase.firestore.Timestamp;
const CAP = 2; // firestore.rules capacity(), plans.js availability.capacity
let failures = 0, passes = 0;

function ymd(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
// Working days ahead (Mon-Sat), far enough inside the lead time and horizon.
function workday(n) { const x = new Date(); x.setDate(x.getDate() + n); while (x.getDay() === 0) x.setDate(x.getDate() + 1); return ymd(x); }
function sunday(n) { const x = new Date(); x.setDate(x.getDate() + n); while (x.getDay() !== 0) x.setDate(x.getDate() + 1); return ymd(x); }
const D1 = workday(5), D2 = workday(8), D3 = workday(11), D4 = workday(14), D5 = workday(17);
const CLOSED = workday(20), BLOCKED = workday(23), SUNDAY = sunday(6), FAR = ymd(new Date(Date.now() + 200 * 864e5)), PAST = "2020-01-06";

function quote(over) {
  // What backend.js submitRequest() writes for the quote form (quote.js payload()).
  return Object.assign({
    status: "new", createdAt: FV.serverTimestamp(), submittedAt: new Date().toISOString(), language: "en",
    segment: "residential", zip: "28202", outOfArea: false, notes: "", name: "Visitor", email: "visitor@example.com",
    emailLower: "visitor@example.com", phone: "9805550000", contactMethod: "Text", days: ["Mon", "Tue"], timeOfDay: "Morning",
    homeType: "Apartment", pets: "None", bedrooms: 2, bathrooms: 1, date: "", slot: "", plan: "Essentials", frequency: "Monthly",
    estimatePerVisit: 150, estimateFullPrice: 158, discount: 0.05, estimatePerMonth: 150, _subject: "Quote request",
  }, over || {});
}
function hold(id, date, slot) { return { date, slot, requestId: id, createdAt: FV.serverTimestamp(), segment: "residential" }; }
function counter(date, slot, count, last) { return { date, slot, count, last }; }

async function expect(title, shouldPass, run) {
  let ok = true, msg = "";
  try { await run(); } catch (e) { ok = false; msg = String((e && e.message) || e).split("\n")[0].slice(0, 110); }
  const good = ok === shouldPass;
  if (good) passes++; else failures++;
  console.log((good ? "  ok   " : "  FAIL ") + title + (good ? "" : "  (expected " + (shouldPass ? "allowed" : "denied") + ", got " + (ok ? "allowed" : "denied: " + msg) + ")"));
}

(async () => {
  const hp = (process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080").split(":");
  const env = await initializeTestEnvironment({ projectId: "demo-mkg-rules", firestore: { rules: fs.readFileSync(RULES, "utf8"), host: hp[0], port: Number(hp[1]) } });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore(), now = TS.now();
    await db.doc("admins/owner-uid").set({ email: "owner@mkg.test", role: "owner" });
    await db.doc("admins/staff-uid").set({ email: "staff@mkg.test", role: "admin", createdAt: now });
    await db.doc("users/alice-uid").set({ code: "ALICE2", emailLower: "alice@example.com", createdAt: now });
    await db.doc("referrers/ALICE2").set({ uid: "alice-uid", createdAt: now });
    await db.doc("days/" + CLOSED).set({ closed: true });
    await db.doc("days/" + BLOCKED).set({ blockedSlots: ["0800"] });
    // Alice: confirmed, counted, on D2 0800.
    await db.doc("requests/req-alice").set(Object.assign(quote({ name: "Alice", email: "alice@example.com", emailLower: "alice@example.com", date: D2, slot: "0800" }), { status: "confirmed", createdAt: now, updatedAt: now }));
    await db.doc("holds/req-alice").set({ date: D2, slot: "0800", requestId: "req-alice", createdAt: now, segment: "residential" });
    await db.doc("slots/" + D2 + "_0800").set(counter(D2, "0800", 1, "req-alice"));
    // Bob: a hold from before counters existed (no slots document), on D3 1130.
    await db.doc("requests/req-bob").set(Object.assign(quote({ name: "Bob", email: "bob@example.com", emailLower: "bob@example.com", date: D3, slot: "1130" }), { createdAt: now, updatedAt: now }));
    await db.doc("holds/req-bob").set({ date: D3, slot: "1130", requestId: "req-bob", createdAt: now, segment: "residential" });
    // D4 1500 is full.
    for (const id of ["req-full-1", "req-full-2"]) {
      await db.doc("requests/" + id).set(Object.assign(quote({ date: D4, slot: "1500" }), { status: "confirmed", createdAt: now, updatedAt: now }));
      await db.doc("holds/" + id).set({ date: D4, slot: "1500", requestId: id, createdAt: now, segment: "residential" });
    }
    await db.doc("slots/" + D4 + "_1500").set(counter(D4, "1500", 2, "req-full-2"));
  });

  const anon = env.unauthenticatedContext().firestore();
  const alice = env.authenticatedContext("alice-uid", { email: "alice@example.com", email_verified: true }).firestore();
  const bob = env.authenticatedContext("bob-uid", { email: "bob@example.com", email_verified: true }).firestore();
  const staff = env.authenticatedContext("staff-uid", { email: "staff@mkg.test", email_verified: true }).firestore();

  // The real client path: one transaction with the request, the hold, and the counter.
  async function visitorBooks(db, id, date, slot, over, counterOver) {
    return db.runTransaction(async (tx) => {
      const s = await tx.get(db.doc("slots/" + date + "_" + slot));
      const before = s.exists ? s.data().count : 0;
      tx.set(db.doc("requests/" + id), quote(Object.assign({ date, slot }, over || {})));
      tx.set(db.doc("holds/" + id), hold(id, date, slot));
      tx.set(db.doc("slots/" + date + "_" + slot), Object.assign(counter(date, slot, before + 1, id), counterOver || {}));
    });
  }

  console.log("\n-- a visitor sending the quote form --");
  await expect("a quote with no day picked", true, () => anon.doc("requests/v-nodate").set(quote()));
  await expect("a quote with a day and window, hold and counter in one transaction", true, () => visitorBooks(anon, "v-ok", D1, "1130"));
  await expect("the same with a friend's invite code (three more document reads)", true, () => visitorBooks(anon, "v-ref", D1, "1500", { ref: "ALICE2", refAmount: 25 }));
  await expect("a commercial quote with every optional field filled", true, () => visitorBooks(anon, "v-biz", D1, "1830", {
    segment: "commercial", company: "Acme Dental", facilityType: "Clinic", floors: "2", sqft: 3000, restrooms: 2, requestedTime: "Friday after 6",
    plan: "Professional", frequency: "Twice a week", refDropped: "ZZZZZZ", notes: "n".repeat(2000), _subject: "s".repeat(400),
    heardFrom: "Nextdoor",
  }));
  await expect("a hold without its counter", false, () => anon.runTransaction(async (tx) => {
    tx.set(anon.doc("requests/v-nocount"), quote({ date: D1, slot: "0800" })); tx.set(anon.doc("holds/v-nocount"), hold("v-nocount", D1, "0800"));
  }));
  await expect("a counter that jumps by two", false, () => visitorBooks(anon, "v-two", D5, "0800", null, { count: 2 }));
  await expect("a counter naming another hold", false, () => visitorBooks(anon, "v-other", D5, "1130", null, { last: "req-alice" }));
  await expect("a counter written on its own, with no hold", false, () => anon.doc("slots/" + D5 + "_1500").set(counter(D5, "1500", 1, "nothing")));
  await expect("a counter set straight to capacity, with no hold", false, () => anon.doc("slots/" + D5 + "_1830").set(counter(D5, "1830", 2, "nothing")));
  await expect("two holds in one write with one counter step", false, () => anon.runTransaction(async (tx) => {
    tx.set(anon.doc("requests/v-a"), quote({ date: D5, slot: "1500" })); tx.set(anon.doc("holds/v-a"), hold("v-a", D5, "1500"));
    tx.set(anon.doc("requests/v-b"), quote({ date: D5, slot: "1500" })); tx.set(anon.doc("holds/v-b"), hold("v-b", D5, "1500"));
    tx.set(anon.doc("slots/" + D5 + "_1500"), counter(D5, "1500", 1, "v-a"));
  }));
  await expect("a hold in a window that is full", false, () => visitorBooks(anon, "v-full", D4, "1500"));
  await expect("a hold on a day the team closed", false, () => visitorBooks(anon, "v-closed", CLOSED, "1130"));
  await expect("a hold in a window the team blocked", false, () => visitorBooks(anon, "v-blocked", BLOCKED, "0800"));
  await expect("the next window on that same day", true, () => visitorBooks(anon, "v-blocked-ok", BLOCKED, "1130"));
  await expect("a hold on a Sunday", false, () => visitorBooks(anon, "v-sunday", SUNDAY, "1130"));
  await expect("a hold in the past", false, () => visitorBooks(anon, "v-past", PAST, "1130"));
  await expect("a hold 200 days out", false, () => visitorBooks(anon, "v-far", FAR, "1130"));
  await expect("a hold in a window that does not exist", false, () => visitorBooks(anon, "v-badslot", D5, "zzz"));
  await expect("a hold on a malformed date", false, () => visitorBooks(anon, "v-baddate", "9999-99-99", "0800"));
  await expect("a request with a 10,000-character 'company'", false, () => anon.doc("requests/v-big").set(quote({ company: "x".repeat(10000) })));
  await expect("a request whose 'days' carry a 50 KB string", false, () => anon.doc("requests/v-days").set(quote({ days: ["y".repeat(50000)] })));
  await expect("a request with a negative estimate", false, () => anon.doc("requests/v-neg").set(quote({ estimatePerVisit: -5 })));
  await expect("a request with a text where a number belongs", false, () => anon.doc("requests/v-str").set(quote({ bedrooms: "three" })));
  await expect("a request whose 'how did you hear' is not text", false, () => anon.doc("requests/v-heard").set(quote({ heardFrom: 5 })));
  await expect("a request with an unknown field", false, () => anon.doc("requests/v-extra").set(quote({ payLink: "https://evil.example" })));

  console.log("\n-- a signed-in client on their account page --");
  await expect("Alice moves her confirmed visit to another window (both counters step)", true, () => alice.runTransaction(async (tx) => {
    const a = await tx.get(alice.doc("slots/" + D2 + "_0800")), b = await tx.get(alice.doc("slots/" + D2 + "_1500"));
    tx.update(alice.doc("requests/req-alice"), { date: D2, slot: "1500", status: "new", movedByClientAt: FV.serverTimestamp(), movedFrom: D2 + " 0800", updatedAt: FV.serverTimestamp() });
    tx.set(alice.doc("holds/req-alice"), hold("req-alice", D2, "1500"));
    tx.set(alice.doc("slots/" + D2 + "_0800"), counter(D2, "0800", Math.max(0, a.data().count - 1), "req-alice"));
    tx.set(alice.doc("slots/" + D2 + "_1500"), counter(D2, "1500", (b.exists ? b.data().count : 0) + 1, "req-alice"));
  }));
  await expect("Alice moves it again into the full window", false, () => alice.runTransaction(async (tx) => {
    tx.update(alice.doc("requests/req-alice"), { date: D4, slot: "1500", status: "new", movedByClientAt: FV.serverTimestamp(), movedFrom: D2 + " 1500", updatedAt: FV.serverTimestamp() });
    tx.set(alice.doc("holds/req-alice"), hold("req-alice", D4, "1500"));
    tx.set(alice.doc("slots/" + D2 + "_1500"), counter(D2, "1500", 0, "req-alice"));
    tx.set(alice.doc("slots/" + D4 + "_1500"), counter(D4, "1500", 3, "req-alice"));
  }));
  await expect("Alice moves it without touching the counters", false, () => alice.runTransaction(async (tx) => {
    tx.update(alice.doc("requests/req-alice"), { date: D2, slot: "1130", status: "new", movedByClientAt: FV.serverTimestamp(), movedFrom: D2 + " 1500", updatedAt: FV.serverTimestamp() });
    tx.set(alice.doc("holds/req-alice"), hold("req-alice", D2, "1130"));
  }));
  await expect("Bob cancels a hold from before counters existed (counter stays at zero)", true, () => bob.runTransaction(async (tx) => {
    tx.update(bob.doc("requests/req-bob"), { status: "cancelled", cancelledBy: "client", updatedAt: FV.serverTimestamp() });
    tx.delete(bob.doc("holds/req-bob"));
    tx.set(bob.doc("slots/" + D3 + "_1130"), counter(D3, "1130", 0, "req-bob"));
  }));
  await expect("Alice cancels, hold and counter together", true, () => alice.runTransaction(async (tx) => {
    tx.update(alice.doc("requests/req-alice"), { status: "cancelled", cancelledBy: "client", updatedAt: FV.serverTimestamp() });
    tx.delete(alice.doc("holds/req-alice"));
    tx.set(alice.doc("slots/" + D2 + "_1500"), counter(D2, "1500", 0, "req-alice"));
  }));
  await expect("Bob lowers someone else's counter", false, () => bob.doc("slots/" + D4 + "_1500").set(counter(D4, "1500", 1, "req-full-1")));
  await expect("Bob reads the counters (no personal data in them)", true, () => bob.doc("slots/" + D4 + "_1500").get());

  console.log("\n-- the team on admin.html --");
  await expect("staff books by phone on a closed day", true, () => staff.runTransaction(async (tx) => {
    tx.set(staff.doc("requests/phone-1"), { name: "Mrs Smith", email: "", emailLower: "", phone: "", notes: "", zip: "", segment: "residential", date: CLOSED, slot: "0800", status: "confirmed", source: "phone", createdAt: FV.serverTimestamp(), updatedAt: FV.serverTimestamp() });
    tx.set(staff.doc("holds/phone-1"), hold("phone-1", CLOSED, "0800"));
    tx.set(staff.doc("slots/" + CLOSED + "_0800"), counter(CLOSED, "0800", 1, "phone-1"));
  }));
  await expect("staff re-syncs a counter from the holds", true, () => staff.doc("slots/" + D4 + "_1500").set(counter(D4, "1500", 2, "sync")));
  await expect("staff takes a booking off the calendar (hold, counter, and the request back to New)", true, () => staff.runTransaction(async (tx) => {
    tx.update(staff.doc("requests/req-full-2"), { date: "", slot: "", status: "new", updatedAt: FV.serverTimestamp() });
    tx.delete(staff.doc("holds/req-full-2"));
    tx.set(staff.doc("slots/" + D4 + "_1500"), counter(D4, "1500", 1, "req-full-2"));
  }));
  await expect("a visitor can now take the freed window", true, () => visitorBooks(anon, "v-freed", D4, "1500"));
  await expect("and the next visitor cannot", false, () => visitorBooks(anon, "v-freed-2", D4, "1500"));

  await env.cleanup();
  console.log("\n" + passes + " passed, " + failures + " failed");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error("HARNESS ERROR", e); process.exit(2); });
