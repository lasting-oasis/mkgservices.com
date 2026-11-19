// A local stand-in for the business's inbox, for the emulator copy of the site
// (app.js sends there on localhost instead of Formspree). Nothing leaves this
// machine. Messages are kept in memory and mirrored to a JSON-lines file; the
// two always hold the same messages (the file is emptied on start and on reset).
//
//   node test/capture-inbox.js            # listens on 127.0.0.1:8025
//   curl -s http://127.0.0.1:8025/inbox   # every message so far, as JSON
//   curl -s -X DELETE http://127.0.0.1:8025/inbox   # reset: memory and file
// Any query on /inbox is accepted and kept with the message ("path"), so a
// test can check the exact address the page posted to.
//
// Only pages from approved origins may post or reset; anything else gets 403
// and is not stored. Requests with no Origin header (curl, test scripts) may
// read and reset, but not post.
//   MKG_INBOX_ORIGINS  comma-separated origins (default: the hosting emulator,
//                      http://127.0.0.1:5000 and http://localhost:5000)
//   MKG_INBOX_FILE     the file (default: mkg-inbox.jsonl in the system temp folder)
//   MKG_INBOX_PORT     the port (default 8025; app.js expects 8025)
"use strict";
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");

const PORT = Number(process.env.MKG_INBOX_PORT || 8025);
const FILE = process.env.MKG_INBOX_FILE || path.join(os.tmpdir(), "mkg-inbox.jsonl");
const ORIGINS = (process.env.MKG_INBOX_ORIGINS || "http://127.0.0.1:5000,http://localhost:5000")
  .split(",").map((o) => o.trim().replace(/\/+$/, "").toLowerCase()).filter(Boolean);
let messages = [];
let refused = 0;

function reset() { messages = []; fs.writeFileSync(FILE, ""); }
function approved(origin) { return !!origin && ORIGINS.indexOf(origin.replace(/\/+$/, "").toLowerCase()) >= 0; }
function send(res, code, body) {
  res.writeHead(code, body === undefined ? {} : { "Content-Type": "application/json" });
  res.end(body === undefined ? undefined : JSON.stringify(body, null, 2));
}

reset();
http.createServer((req, res) => {
  const origin = req.headers.origin || "";
  if (origin && !approved(origin)) {
    refused++;
    console.log("refused", req.method, "from origin", origin);
    return send(res, 403, { ok: false, error: "origin not approved" });
  }
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");
  }
  if (req.method === "OPTIONS") return send(res, 204);
  const url = new URL(req.url, "http://127.0.0.1");
  if (url.pathname !== "/inbox") return send(res, 404);
  if (req.method === "GET") return send(res, 200, messages);
  if (req.method === "DELETE") { reset(); return send(res, 204); }
  if (req.method === "POST") {
    if (!origin) return send(res, 403, { ok: false, error: "posts must come from an approved page" });
    let body = "";
    req.on("data", (c) => { body += c; if (body.length > 1e6) req.destroy(); });
    req.on("end", () => {
      let fields;
      try { fields = JSON.parse(body); } catch (e) { return send(res, 400, { ok: false, error: "not JSON" }); }
      const msg = { receivedAt: new Date().toISOString(), origin, path: req.url, fields };
      messages.push(msg);
      fs.appendFileSync(FILE, JSON.stringify(msg) + "\n");
      console.log("captured:", fields._subject || "(no subject)");
      send(res, 200, { ok: true });
    });
    return;
  }
  send(res, 405);
}).listen(PORT, "127.0.0.1", () => console.log("capture inbox on http://127.0.0.1:" + PORT + "/inbox; origins " + ORIGINS.join(", ") + "; file " + FILE));
