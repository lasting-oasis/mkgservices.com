// Sends one fictional quote, with a unique reference, through quote.html in
// headless Chrome, then checks the outcome and exits non-zero on any mismatch:
// a timeout, an unexpected outbound attempt, the wrong page state, or the
// wrong number of database records or inbox messages.
//
// Requests to anything but this machine are logged and BLOCKED, so a mistake
// can't reach the live database or the business's inbox.
//
//   node test/preview-isolation.js --scenario saved|unsaved|refused
//        [--url http://127.0.0.1:5000] [--lang en|es] [--as HOST] [--config FILE]
//        [--expect-inbox URL]   (default http://127.0.0.1:8025/inbox)
//
//   saved     emulator copy, emulators and capture inbox running: page shows
//             "Request sent" and a visible six-character reference that is
//             the saved record's id; exactly 1 Firestore record and exactly
//             1 inbox message carry the run's reference.
//   unsaved   emulator copy, Firestore emulator NOT running: page shows the
//             "not saved" note and no saved reference; 0 records (database
//             unreachable), 1 message.
//   refused   readiness check fails: page shows the q.testConfig error;
//             after Send nothing is contacted at all, no Firebase file is
//             ever loaded, and 0 messages carry the reference.
//
// --as HOST     Chrome resolves HOST to 127.0.0.1 and opens http://HOST:<port>,
//               so a preview address (x--pr2-abc.web.app) can be tried locally.
// --config FILE replaces app.js's TEST block (between TEST-CONFIG-START/END)
//               with `var TEST = <FILE contents>;` for this run only.
// Needs playwright-core (npm i -D playwright-core) and Chrome (CHROME_PATH).
"use strict";
const fs = require("fs");
const crypto = require("crypto");
const { chromium } = require("playwright-core");

const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i > 0 ? process.argv[i + 1] : d; };
const scenario = arg("scenario", "");
const base = new URL(arg("url", "http://127.0.0.1:5000"));
const lang = arg("lang", "en");
const as = arg("as", "");
const configFile = arg("config", "");
const INBOX = "http://127.0.0.1:8025/inbox";
// The exact endpoint the page must post to (path, case and query included).
const EXPECT_INBOX = arg("expect-inbox", INBOX);
const FIRESTORE = "127.0.0.1:8080";
const AUTH = "127.0.0.1:9099";
const PROJECT = "demo-mkg-preview";
const WAIT = Number(arg("wait", 60000));
if (!/^(saved|unsaved|refused)$/.test(scenario)) { console.error("--scenario saved|unsaved|refused"); process.exit(2); }

// Outside addresses a page may TRY to reach that carry no quote data
// (blocked here either way): the web font, the reCAPTCHA script the Auth SDK
// preloads, and the 1-pixel image the Firestore SDK fetches to test the
// connection when its database is unreachable. Anything else fails the run.
const ASSETS = [/^GET fonts\.googleapis\.com\/css2$/, /^GET fonts\.gstatic\.com\//, /^GET www\.google\.com\/recaptcha\//, /^GET www\.google\.com\/images\/cleardot\.gif$/];

async function inboxWith(ref) {
  const r = await fetch(INBOX);
  if (!r.ok) throw new Error("capture inbox not readable: " + r.status);
  return (await r.json()).filter((m) => JSON.stringify(m.fields).indexOf(ref) >= 0);
}
async function recordsWith(ref) {
  try {
    const r = await fetch("http://" + FIRESTORE + "/v1/projects/" + PROJECT + "/databases/(default)/documents/requests?pageSize=1000",
      { headers: { Authorization: "Bearer owner" } });
    if (!r.ok) return { reachable: true, count: null, error: "HTTP " + r.status };
    const docs = (await r.json()).documents || [];
    const mine = docs.filter((d) => JSON.stringify(d.fields || {}).indexOf(ref) >= 0);
    return { reachable: true, count: mine.length, ids: mine.map((d) => d.name.split("/").pop()) };
  } catch (e) { return { reachable: false, count: 0 }; }
}

(async () => {
  const ref = "REF-" + crypto.randomBytes(4).toString("hex").toUpperCase();
  const failures = [];
  const expect = (ok, what) => { if (!ok) failures.push(what); };

  const launchArgs = ["--no-proxy-server"];
  if (as) launchArgs.push("--host-resolver-rules=MAP " + as + " 127.0.0.1");
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome", args: launchArgs });
  const page = await (await browser.newContext()).newPage();
  const pageHost = (as || base.hostname) + ":" + base.port;
  const local = { [pageHost]: "page", [INBOX.replace(/^http:\/\/|\/inbox$/g, "")]: "inbox", [FIRESTORE]: "firestore", [AUTH]: "auth" };
  const seen = [];
  let sendAt = Infinity;
  let routeError = null;
  await page.route("**/*", (route) => handle(route).catch((e) => { routeError = e; return route.abort(); }));
  async function handle(route) {
    const req = route.request(), u = new URL(req.url());
    const role = local[u.host] || "";
    seen.push({ t: Date.now(), method: req.method(), host: u.host, path: u.pathname, url: req.url(), role });
    if (!role) return route.abort("blockedbyclient");
    if (configFile && role === "page" && /\/app\.js$/.test(u.pathname)) {
      // Fetched by Node from the real address: Node doesn't share Chrome's --as mapping.
      const r = await route.fetch({ url: base.origin + u.pathname + u.search }), body = await r.text();
      const swapped = body.replace(/\/\* TEST-CONFIG-START \*\/[\s\S]*?\/\* TEST-CONFIG-END \*\//, "var TEST = " + fs.readFileSync(configFile, "utf8").trim() + ";");
      if (swapped === body) throw new Error("TEST-CONFIG markers not found in app.js");
      return route.fulfill({ response: r, body: swapped });
    }
    return route.continue();
  }
  const origin = "http://" + pageHost;
  await page.goto(origin + "/quote.html?lang=" + lang, { waitUntil: "load" });

  async function next(step) { await page.click('[data-step="' + step + '"] [data-next]'); await page.waitForTimeout(250); }
  await page.fill("#zip", "28202"); await next(1);
  await page.fill("#notes", "FICTIONAL TEST QUOTE " + ref + " - not a real customer."); await next(2);
  await next(3);
  await page.fill("#name", "Pat Fictional " + ref);
  await page.fill("#email", "pat.fictional@example.test");
  await page.fill("#phone", "704-555-0100");
  await next(4);
  await next(5);
  sendAt = Date.now();
  await page.click("[data-submit]");
  let timedOut = false;
  await page.waitForFunction(() => {
    const done = document.querySelector('[data-step="done"]');
    const err = document.querySelector('[data-error="submit"]');
    return (done && !done.hidden) || (err && err.textContent.trim());
  }, null, { timeout: WAIT }).catch(() => { timedOut = true; });
  await page.waitForTimeout(2000); // let the email copy and any retries land
  const ui = await page.evaluate(() => {
    const vis = (s) => { const el = document.querySelector(s); return el && !el.hidden ? el.textContent.trim() : ""; };
    const T = window.MKG.target || {};
    return {
      env: T.env, ready: T.ready, reason: T.reason, inbox: T.inbox, project: T.firebase && T.firebase.projectId,
      done: !document.querySelector('[data-step="done"]').hidden,
      // The saved-request reference, only if its line is actually showing.
      reference: (function () {
        const line = document.querySelector("[data-saved-ref]");
        if (!line || line.hidden || !line.offsetParent) return "";
        return ((line.querySelector("[data-request-id]") || {}).textContent || "").trim();
      })(),
      referenceText: (document.querySelector("[data-request-id]") || {}).textContent || "",
      referenceLabel: ((document.querySelector("[data-saved-ref] [data-i18n]") || {}).textContent || "").trim(),
      expectedLabel: window.MKG.i18n.t("q.done.refLabel"),
      submitError: ((document.querySelector('[data-error="submit"]') || {}).textContent || "").trim(),
      unsavedNote: vis("[data-unsaved-note]"), demoNote: vis("[data-demo-note]"),
      expectedRefusal: window.MKG.i18n.t("q.testConfig"),
    };
  });
  await browser.close();

  const key = (r) => r.method + " " + r.host + r.path;
  const onSend = seen.filter((r) => r.t >= sendAt);
  const outside = seen.filter((r) => !r.role);
  const unexpectedOutside = outside.filter((r) => !ASSETS.some((re) => re.test(key(r))));
  const firebaseFiles = seen.filter((r) => r.role === "page" && r.path.indexOf("/__/firebase/") === 0);
  const messages = await inboxWith(ref);
  const records = await recordsWith(ref);

  expect(!routeError, "test setup failed: " + (routeError && routeError.message));
  expect(!timedOut, "page did not finish within " + WAIT + " ms");
  expect(unexpectedOutside.length === 0, "unexpected outbound attempts: " + unexpectedOutside.map(key).join(", "));
  expect(!onSend.some((r) => !r.role), "something outside this machine was contacted after Send");
  if (scenario === "refused") {
    expect(ui.ready === false, "readiness check passed but should fail");
    expect(!ui.done, "done step shown");
    expect(ui.submitError === ui.expectedRefusal && !!ui.submitError, "refusal message not shown (got: " + ui.submitError + ")");
    expect(onSend.length === 0, "contacted after Send: " + onSend.map(key).join(", "));
    expect(firebaseFiles.length === 0, "Firebase files loaded: " + firebaseFiles.map(key).join(", "));
    expect(messages.length === 0, "inbox messages with the reference: " + messages.length + " (want 0)");
  } else {
    expect(ui.env === "emulator" && ui.ready === true, "not a ready emulator copy (" + ui.env + ", " + ui.reason + ")");
    expect(ui.done, "done step not shown");
    expect(!ui.submitError, "submit error shown: " + ui.submitError);
    expect(onSend.every((r) => r.role === "firestore" || r.role === "inbox" || r.role === "auth"), "after Send, contacted more than the emulator and inbox: " + onSend.map(key).join(", "));
    const posts = onSend.filter((r) => r.role === "inbox" && r.method === "POST");
    expect(ui.inbox === EXPECT_INBOX, "page's inbox is " + ui.inbox + ", expected exactly " + EXPECT_INBOX);
    expect(posts.every((r) => r.url === EXPECT_INBOX), "posted to " + posts.map((r) => r.url).join(", ") + ", expected exactly " + EXPECT_INBOX);
    expect(messages.every((m) => "http://127.0.0.1:8025" + m.path === EXPECT_INBOX), "inbox received at " + messages.map((m) => m.path).join(", "));
    expect(onSend.filter((r) => r.role === "inbox" && r.method === "POST").length === 1, "inbox POSTs after Send: " + onSend.filter((r) => r.role === "inbox" && r.method === "POST").length + " (want 1)");
    expect(messages.length === 1, "inbox messages with the reference: " + messages.length + " (want 1)");
    expect(messages.every((m) => /^\[TEST emulator\] /.test(m.fields._subject || "")), "message subject lacks the [TEST emulator] prefix");
    if (scenario === "saved") {
      expect(/^[A-Z0-9]{6}$/.test(ui.reference), "no six-character request reference shown");
      expect(ui.referenceLabel === ui.expectedLabel, "reference label not in the page language");
      expect(records.reachable && ui.reference === records.ids.map((x) => x.slice(0, 6).toUpperCase())[0], "shown reference doesn't match the saved record's id");
      expect(!ui.unsavedNote, "not-saved note shown");
      expect(records.reachable && records.count === 1, "Firestore records with the reference: " + records.count + " (want 1)" + (records.reachable ? "" : "; emulator unreachable"));
    } else {
      expect(!!ui.unsavedNote, "not-saved note not shown");
      expect(!ui.reference && !ui.referenceText.trim(), "a saved-request reference is shown for an email-only request");
      expect(!records.reachable, "Firestore emulator is reachable; this scenario needs it stopped");
    }
  }

  const tally = (list) => list.reduce((m, r) => { const k = (r.role ? r.role + " " : "BLOCKED ") + r.method + " " + r.host + (r.role === "page" ? "" : r.path.replace(/\/[^/]*$/, "/…")); m[k] = (m[k] || 0) + 1; return m; }, {});
  console.log(JSON.stringify({
    scenario, ref, page: origin + "/quote.html?lang=" + lang, config: configFile || "(app.js as committed)", ui,
    records: records.reachable ? records.count : "database unreachable", inboxMessages: messages.length,
    contactedAfterSend: tally(onSend), contactedWholeVisit: tally(seen),
    result: failures.length ? "FAIL" : "PASS", failures,
  }, null, 2));
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error("FAIL:", e && e.message || e); process.exit(1); });
