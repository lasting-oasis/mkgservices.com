/*
  Firestore evaluates at most 1,000 expressions per request, counted across
  every document in a batch or transaction. This checks that the heaviest
  write the site makes (a commercial quote with an invite code, plus its hold
  and counter) still passes with PAD extra terms added to quoteFields(), so a
  future edit to the rules has room. Run like rules.test.js:

    firebase emulators:exec --only firestore --project demo-mkg-rules "node test/headroom.test.js"
*/
const fs = require("fs");
const path = require("path");
const { initializeTestEnvironment } = require("@firebase/rules-unit-testing");
const firebase = require("firebase/compat/app").default;
require("firebase/compat/firestore");
const FV = firebase.firestore.FieldValue, TS = firebase.firestore.Timestamp;
const base = fs.readFileSync(path.join(__dirname, "..", "firestore.rules"), "utf8");
const marker = "nums(d) && refOk(d);";
if (base.indexOf(marker) === -1) throw new Error("marker not found in firestore.rules");
function ymd(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function workday(n) { const x = new Date(); x.setDate(x.getDate() + n); while (x.getDay() === 0) x.setDate(x.getDate() + 1); return ymd(x); }

(async () => {
  const hp = (process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080").split(":");
  const pads = (process.env.PADS || "0,100,200,300").split(",").map(Number);
  let worst = null;
  for (const n of pads) {
    // The compiler refuses one very long expression, so the padding goes in helper functions of 20 terms each.
    const fns = [], calls = [];
    for (let i = 0; i * 20 < n; i++) { const k = Math.min(20, n - i * 20); fns.push("    function pad" + i + "(d) { return " + Array(k).fill("d.status == 'new'").join(" && ") + "; }"); calls.push("pad" + i + "(d)"); }
    const rules = n
      ? base.replace(marker, "nums(d) && refOk(d) && " + calls.join(" && ") + ";").replace("    function quoteFields(d) {", fns.join("\n") + "\n    function quoteFields(d) {")
      : base;
    const env = await initializeTestEnvironment({ projectId: "demo-mkg-rules", firestore: { rules, host: hp[0], port: Number(hp[1]) } });
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore(), now = TS.now();
      await db.doc("users/alice-uid").set({ code: "ALICE2", emailLower: "alice@example.com", createdAt: now });
      await db.doc("referrers/ALICE2").set({ uid: "alice-uid", createdAt: now });
      await db.doc("days/" + workday(5)).set({ blockedSlots: ["0800"] });
    });
    const anon = env.unauthenticatedContext().firestore(), date = workday(5), slot = "1830", id = "v-" + n;
    let ok = true, msg = "";
    try {
      await anon.runTransaction(async (tx) => {
        const s = await tx.get(anon.doc("slots/" + date + "_" + slot));
        tx.set(anon.doc("requests/" + id), {
          status: "new", createdAt: FV.serverTimestamp(), submittedAt: new Date().toISOString(), language: "es", segment: "commercial",
          zip: "28202", outOfArea: false, notes: "n".repeat(500), name: "Visitor", email: "visitor@example.com", emailLower: "visitor@example.com",
          phone: "9805550000", contactMethod: "Text", days: ["Mon", "Tue", "Wed"], timeOfDay: "Morning", facilityType: "Clinic", floors: "2",
          company: "Acme Dental", sqft: 3000, restrooms: 2, requestedTime: "Friday after 6", date, slot, plan: "Professional",
          frequency: "Twice a week", estimatePerVisit: 150, estimateFullPrice: 158, discount: 0.05, estimatePerMonth: 1300, _subject: "Quote",
          heardFrom: "Nextdoor",
          ref: "ALICE2", refAmount: 50,
        });
        tx.set(anon.doc("holds/" + id), { date, slot, requestId: id, createdAt: FV.serverTimestamp(), segment: "commercial" });
        tx.set(anon.doc("slots/" + date + "_" + slot), { date, slot, count: (s.exists ? s.data().count : 0) + 1, last: id });
      });
    } catch (e) { ok = false; msg = String((e && e.message) || e).split("\n").join(" ").slice(0, 120); }
    console.log("pad=" + String(n).padStart(3) + "  " + (ok ? "accepted" : "DENIED: " + msg));
    if (ok) worst = n;
    await env.cleanup();
  }
  console.log("heaviest write still accepted with " + worst + " extra terms");
  process.exit(worst !== null && worst >= 100 ? 0 : 1);
})().catch((e) => { console.error("HARNESS ERROR", e); process.exit(2); });
