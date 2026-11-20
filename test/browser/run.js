// Browser checks for the Requests queue and request cards: the real admin.html, admin.js,
// queue.js and i18n.js, with backend.js swapped for an in-memory stand-in (stub-backend.js)
// and fictional records (fixture.js). Clock fixed at Mon Dec 7 2026, 10:00 am Charlotte.
// Run: node test/browser/run.js   (needs Chrome; CHROME_PATH overrides /usr/bin/google-chrome)
const http = require("http"), fs = require("fs"), path = require("path");
const puppeteer = require("puppeteer-core");
const ROOT = path.join(__dirname, "..", ".."), HERE = __dirname;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".json": "application/json", ".woff2": "font/woff2" };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split("?")[0]);
  let file = url.startsWith("/__test/") ? path.join(HERE, url.slice(8)) : path.join(ROOT, url);
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end(); }
    let body = buf;
    if (url === "/admin.html") {
      const s = buf.toString("utf8"), swapped = s.replace(/<script src="backend\.js\?v=\d+"><\/script>/, '<script src="/__test/fixture.js"></script><script src="/__test/stub-backend.js"></script>');
      if (swapped === s) { res.writeHead(500); return res.end("backend.js tag not found"); }
      body = swapped;
    }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" }); res.end(body);
  });
});
server.listen(0, "127.0.0.1", async () => {
  const base = "http://127.0.0.1:" + server.address().port;
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome", args: ["--no-sandbox"], env: Object.assign({}, process.env, { TZ: "UTC" }) });
  let total = { pass: 0, fail: 0 };
  try {
    for (const [name, mod] of [["queue strip", "./queue-strip.js"], ["stale request card vs. customer reschedule", "./stale-card.js"]]) {
      console.log("\n-- " + name + " --");
      const r = await require(mod)(browser, base); total.pass += r.pass; total.fail += r.fail;
    }
  } catch (e) { console.error("HARNESS ERROR", e); total.fail++; }
  await browser.close(); server.close();
  console.log("\nbrowser checks: " + total.pass + " passed, " + total.fail + " failed");
  process.exit(total.fail ? 1 : 0);
});
