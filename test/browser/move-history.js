// Customer-move history on the admin page. The entries come from the real recorder
// (functions/recorder.js), run here against an in-memory Firestore stand-in, then
// shown on the real admin page with the in-memory backend.
// Fictional booking: Nora Example (#NORA01), confirmed Thu Dec 10 8:00, moved to
// Wed Dec 9 11:30 at 9:02:14 am and to Fri Dec 11 3:00 pm at 9:40:05 am (Mon Dec 7).
// The second move's entry is written first (9:40:06); the first one's at 9:41:30.
const { recordMove } = require("../../functions/recorder");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = async function (browser, base) {
  let pass = 0, failN = 0;
  function check(name, ok, info) { console.log((ok ? "PASS " : "FAIL ") + name + (ok || info === undefined ? "" : "  -> " + JSON.stringify(info))); ok ? pass++ : failN++; }

  // ---- the recorder, out of order, with a replay ----
  const ts = (iso) => { const ms = Date.parse(iso); return { seconds: Math.floor(ms / 1000), nanoseconds: (ms % 1000) * 1e6 }; };
  const docs = new Map(), db = { doc: (p) => ({ create: (d) => docs.has(p) ? Promise.reject(Object.assign(new Error("ALREADY_EXISTS"), { code: 6 })) : (docs.set(p, d), Promise.resolve()) }) };
  let clock = 0; const stamp = () => ({ ms: clock });
  const booked = { status: "confirmed", date: "2026-12-10", slot: "0800" };
  const m1 = { status: "new", date: "2026-12-09", slot: "1130", movedByClientAt: ts("2026-12-07T09:02:14.381-05:00") };
  const m2 = { status: "new", date: "2026-12-11", slot: "1500", movedByClientAt: ts("2026-12-07T09:40:05.112-05:00") };
  const toMs = (t) => t ? t.seconds * 1000 + t.nanoseconds / 1e6 : null;
  const asEvents = () => [...docs.entries()].map(([p, d]) => ({ id: p.split("/").pop(), kind: d.kind, text: d.text, by: d.by, atMs: toMs(d.at), from: d.from, to: d.to, recordedMs: d.recordedAt.ms, prevMovedMs: toMs(d.prevMovedAt) }));

  const ctx = await browser.createBrowserContext(), p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  const NOW = Date.parse("2026-12-07T10:00:00-05:00");
  await p.evaluateOnNewDocument((now) => { const real = Date.now.bind(Date), off = now - real(), R = Date;
    function D(...a) { return a.length ? new R(...a) : new R(real() + off); } D.prototype = R.prototype; D.now = () => real() + off; D.parse = R.parse; D.UTC = R.UTC; window.Date = D; }, NOW);
  await p.setViewport({ width: 1300, height: 1000 });
  await p.goto(base + "/admin.html", { waitUntil: "networkidle0" }); await wait(400);
  await p.evaluate(() => { const t = document.querySelector('[data-view-tab="requests"]'); if (t) t.click(); }); await wait(200);
  // The booking as the customer left it after the second move.
  await p.evaluate(() => { const B = window.MKG.backend;
    B._store.requests.push({ id: "NORA01", name: "Nora Example", email: "nora@example.test", emailLower: "nora@example.test", phone: "(704) 555-0141", zip: "28273", segment: "residential", plan: "Family", frequency: "Every 2 weeks", bedrooms: 3, bathrooms: 2, homeType: "House", pets: "None", days: [], language: "en", contactMethod: "Text", estimatePerVisit: 180, status: "new", date: "2026-12-11", slot: "1500", movedFrom: "2026-12-09 1130", movedByClientAt: "2026-12-07T09:40:05.112-05:00", createdAt: "2026-11-20T10:00:00-05:00" });
    B._emit(); });
  await wait(200);
  const setEvents = (list) => p.evaluate((list) => { const B = window.MKG.backend; B._store.events.NORA01 = list; B._emit(); }, list);
  const history = () => p.evaluate(() => { const r = document.querySelector('[data-qid="NORA01"]'); if (!r) return null; const d = r.querySelector("details"); d.open = true;
    return { moves: [...r.querySelectorAll(".q-history li.q-ev-move")].map((li) => li.textContent.replace(/\s+/g, " ").trim()), gap: !!r.querySelector("[data-q-gap]"), all: r.querySelectorAll(".q-history li").length }; });

  clock = Date.parse("2026-12-07T09:40:06-05:00");
  const r2 = await recordMove(db, "NORA01", m1, m2, stamp);
  await setEvents(asEvents()); await wait(200);
  let h = await history();
  console.log("  after the second move's entry only:", JSON.stringify(h));
  check("the second move's entry arrives first: shown as Wed, Dec 9, 11:30 AM → Fri, Dec 11, 3:00 PM", r2.status === "written" && h && h.moves.length === 1 && /Wed, Dec 9, 11:30\sAM → Fri, Dec 11, 3:00\sPM/.test(h.moves[0]), h);
  check("...with a note that an earlier move isn't in the history yet", h && h.gap, h);

  clock = Date.parse("2026-12-07T09:41:30-05:00");
  const r1 = await recordMove(db, "NORA01", booked, m1, stamp);
  await setEvents(asEvents()); await wait(200);
  h = await history();
  console.log("  after both entries:", JSON.stringify(h));
  check("both moves shown, newest first, with the correct old and new times", r1.status === "written" && h.moves.length === 2 &&
    /9:40\sAM · Customer moved the visit: Wed, Dec 9, 11:30\sAM → Fri, Dec 11, 3:00\sPM/.test(h.moves[0]) &&
    /9:02\sAM · Customer moved the visit: Thu, Dec 10, 8:00\sAM → Wed, Dec 9, 11:30\sAM/.test(h.moves[1]), h);
  check("the first move is marked as recorded late (9:41), the second is not", /recorded Mon, Dec 7, 9:41\sAM/.test(h.moves[1]) && !/recorded/.test(h.moves[0]), h);
  check("the gap note is gone once both are in", !h.gap, h);

  const r3 = await recordMove(db, "NORA01", booked, m1, stamp);
  await setEvents(asEvents()); await wait(200);
  h = await history();
  check("replaying the first move's trigger: duplicate, still exactly two entries", r3.status === "duplicate" && docs.size === 2 && h.moves.length === 2 && h.all === 2, { r3, size: docs.size, h });

  const r4 = await recordMove(db, "NORA01", m2, Object.assign({}, m2, { quotedPrice: 195 }), stamp);
  check("a staff edit creates no customer-move entry", r4.status === "skipped" && docs.size === 2, r4);

  // Spanish labels
  await p.evaluate(() => document.querySelector('[data-lang-switch="es"]').click()); await wait(300);
  h = await history();
  check("Spanish: El cliente cambió la visita", h.moves.length === 2 && /El cliente cambió la visita/.test(h.moves[0]), h);
  await p.evaluate(() => document.querySelector('[data-lang-switch="en"]').click()); await wait(200);

  check("no page errors", errs.length === 0, errs);
  console.log(pass + " passed, " + failN + " failed");
  await ctx.close();
  return { pass, fail: failN };
};
