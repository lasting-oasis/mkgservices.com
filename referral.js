/*
  Refer-a-friend: the pieces every page shares.

    - capture an invite code from ?ref=CODE and remember it (60 days) so it is
      still there when the visitor reaches the quote form
    - the "a friend invited you" banner on the public pages
    - the amounts from plans.js (MKG.referral) filled into [data-ref-amount]
    - the share panel: QR code, link, copy, native share, text, email, and a
      downloadable QR card (used on account.html)

  Exposed as MKG.invite. (MKG.referral is the plans.js configuration.)
*/
(function () {
  "use strict";
  var C = window.MKG, I = C && C.i18n, A = C && C.app;
  if (!I || !A) return;
  var t = I.t, esc = A.esc;
  var R = C.referral || { enabled: false, rewards: {}, maxPercentOfVisit: 100 };
  var KEY = "mkg.ref", MAX_AGE = 60 * 24 * 3600 * 1000;
  var CODE_RE = /^[A-Z2-9]{6}$/;

  function clean(v) { return String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); }
  function valid(code) { return CODE_RE.test(code || ""); }

  // ---------- remembering the invite ----------
  function fromUrl() {
    try { var c = clean(new URLSearchParams(location.search).get("ref")); return valid(c) ? c : ""; } catch (e) { return ""; }
  }
  function stored() {
    try {
      var o = JSON.parse(localStorage.getItem(KEY) || "null");
      if (o && valid(o.code) && Date.now() - o.at < MAX_AGE) return o.code;
    } catch (e) { /* ignore */ }
    return "";
  }
  function current() {
    var c = fromUrl();
    if (c) { try { localStorage.setItem(KEY, JSON.stringify({ code: c, at: Date.now() })); } catch (e) { /* ignore */ } return c; }
    return stored();
  }
  function forget() { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } }

  // ---------- amounts ----------
  function rewards(segment) { return (R.rewards || {})[segment || C.segment] || { friend: 0, referrer: 0 }; }
  function amount(who, segment) { return rewards(segment)[who] || 0; }
  function fillAmounts() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-ref-amount]"), function (el) {
      el.textContent = A.dollars(amount(el.getAttribute("data-ref-amount"), el.getAttribute("data-ref-seg") || C.segment));
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-ref-max]"), function (el) { el.textContent = (R.maxPercentOfVisit || 100) + "%"; });
  }
  // The most credit that may come off a visit costing `price`.
  function cap(price) {
    if (typeof price !== "number" || !isFinite(price)) return Infinity;
    return Math.floor(price * (R.maxPercentOfVisit || 100) / 100);
  }

  // ---------- links and messages ----------
  function linkFor(code, lang) {
    var base = (C.siteUrl || location.origin).replace(/\/$/, "");
    return base + "/?ref=" + code + ((lang || I.lang) === "es" ? "&lang=es" : "");
  }
  function message(code) { return t("ref.shareMsg", { amount: A.dollars(amount("friend", "residential")), link: linkFor(code) }); }
  function subject() { return t("ref.shareSubject", { amount: A.dollars(amount("friend", "residential")) }); }

  // ---------- QR ----------
  function matrix(text) {
    if (!window.qrcode) return null;
    var qr = window.qrcode(0, "M"); qr.addData(text); qr.make();
    var n = qr.getModuleCount(), rows = [];
    for (var r = 0; r < n; r++) { var row = []; for (var c = 0; c < n; c++) row.push(qr.isDark(r, c)); rows.push(row); }
    return rows;
  }
  function qrSvg(text) {
    var m = matrix(text); if (!m) return "";
    var n = m.length, q = 4, d = "";
    m.forEach(function (row, r) {
      var c = 0;
      while (c < n) {
        if (!row[c]) { c++; continue; }
        var s = c; while (c < n && row[c]) c++;
        d += "M" + (s + q) + " " + (r + q) + "h" + (c - s) + "v1h-" + (c - s) + "z";
      }
    });
    var size = n + q * 2;
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + size + " " + size + '" shape-rendering="crispEdges" role="img" aria-label="' + esc(t("ref.qrAlt")) + '">' +
      '<rect width="' + size + '" height="' + size + '" fill="#fff"/><path fill="#0f2e2c" d="' + d + '"/></svg>';
  }
  // A shareable card: logo, QR, what it's worth, and the code.
  function downloadCard(code) {
    var m = matrix(linkFor(code)); if (!m) return;
    var W = 1000, H = 1260, cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    var g = cv.getContext("2d");
    function draw(logo) {
      g.fillStyle = "#edf4f1"; g.fillRect(0, 0, W, H);
      g.fillStyle = "#fff"; roundRect(g, 60, 60, W - 120, H - 120, 48); g.fill();
      var y = 120;
      if (logo) { g.drawImage(logo, W / 2 - 80, y, 160, 160); y += 190; } else y += 20;
      g.fillStyle = "#0f2e2c"; g.textAlign = "center";
      g.font = '800 54px "Bricolage Grotesque", "Segoe UI", system-ui, sans-serif';
      g.fillText("MKG Services", W / 2, y + 40);
      var n = m.length, q = 3, cell = Math.floor(620 / (n + q * 2)), qs = cell * (n + q * 2), ox = (W - qs) / 2, oy = y + 80;
      g.fillStyle = "#fff"; g.fillRect(ox, oy, qs, qs); g.fillStyle = "#0f2e2c";
      for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (m[r][c]) g.fillRect(ox + (c + q) * cell, oy + (r + q) * cell, cell, cell);
      var ty = oy + qs + 90;
      g.font = '700 40px "Bricolage Grotesque", "Segoe UI", system-ui, sans-serif';
      wrap(g, t("ref.qrCaption", { amount: A.dollars(amount("friend", "residential")) }), W / 2, ty, W - 260, 50);
      g.font = '800 64px ui-monospace, Menlo, Consolas, monospace'; g.fillStyle = "#176b61";
      g.fillText(code.split("").join(" "), W / 2, H - 140);
      g.font = '600 30px "Segoe UI", system-ui, sans-serif'; g.fillStyle = "#4f6865";
      g.fillText((C.siteUrl || location.origin).replace(/^https?:\/\//, ""), W / 2, H - 100);
      cv.toBlob(function (blob) {
        var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "MKG-invite-" + code + ".png";
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
      }, "image/png");
    }
    var img = new Image(); img.onload = function () { draw(img); }; img.onerror = function () { draw(null); }; img.src = "brand/logo-full-320.png";
  }
  function roundRect(g, x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  function wrap(g, text, cx, y, maxW, lh) {
    var words = text.split(" "), line = "";
    words.forEach(function (w) {
      var test = line ? line + " " + w : w;
      if (g.measureText(test).width > maxW && line) { g.fillText(line, cx, y); y += lh; line = w; } else line = test;
    });
    if (line) g.fillText(line, cx, y);
  }

  // ---------- the share panel ----------
  function mountShare(root, code) {
    var link = linkFor(code);
    var canShare = !!navigator.share;
    root.innerHTML =
      '<div class="ref-qr" data-ref-qr>' + qrSvg(link) + "</div>" +
      '<div class="ref-share-body">' +
        '<p class="ref-label">' + esc(t("ref.yourCode")) + "</p>" +
        '<p class="ref-code" data-ref-code>' + esc(code) + "</p>" +
        '<label class="ref-label" for="ref-link">' + esc(t("ref.yourLink")) + "</label>" +
        '<div class="ref-link"><input class="input" id="ref-link" readonly value="' + esc(link) + '"><button type="button" class="btn btn-sm" data-ref-copy>' + esc(t("ref.copy")) + "</button></div>" +
        '<div class="ref-actions">' +
          (canShare ? '<button type="button" class="btn btn-secondary btn-sm" data-ref-share>' + esc(t("ref.share")) + "</button>" : "") +
          '<a class="btn btn-secondary btn-sm" data-ref-sms href="sms:?&body=' + encodeURIComponent(message(code)) + '">' + esc(t("ref.text")) + "</a>" +
          '<a class="btn btn-secondary btn-sm" data-ref-mail href="mailto:?subject=' + encodeURIComponent(subject()) + "&body=" + encodeURIComponent(message(code)) + '">' + esc(t("ref.email")) + "</a>" +
          '<button type="button" class="btn btn-secondary btn-sm" data-ref-download>' + esc(t("ref.download")) + "</button>" +
        "</div>" +
      "</div>";
    var copy = root.querySelector("[data-ref-copy]");
    copy.addEventListener("click", function () {
      var input = root.querySelector("#ref-link");
      function done() { copy.textContent = t("ref.copied"); setTimeout(function () { copy.textContent = t("ref.copy"); }, 1800); }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(done, function () { input.select(); try { document.execCommand("copy"); done(); } catch (e) { /* ignore */ } });
      else { input.select(); try { document.execCommand("copy"); done(); } catch (e) { /* ignore */ } }
    });
    var sh = root.querySelector("[data-ref-share]");
    if (sh) sh.addEventListener("click", function () { navigator.share({ title: "MKG Services", text: message(code), url: link }).catch(function () { /* cancelled */ }); });
    root.querySelector("[data-ref-download]").addEventListener("click", function () { downloadCard(code); });
  }

  // ---------- "a friend invited you" banner ----------
  function banner() {
    if (!R.enabled || !document.body.hasAttribute("data-ref-banner")) return;
    var old = document.querySelector(".ref-banner"); if (old) old.remove();
    var code = current(), dismissed = false;
    try { dismissed = sessionStorage.getItem("mkg.refBannerOff") === code; } catch (e) { /* ignore */ }
    if (!code || dismissed || !amount("friend")) return;
    var el = document.createElement("div");
    el.className = "ref-banner"; el.setAttribute("role", "status");
    var onQuote = /quote\.html$/.test(location.pathname);
    el.innerHTML = '<div class="container ref-banner-inner"><span class="ref-banner-text"><b>' + esc(t("ref.banner", { amount: A.dollars(amount("friend")) })) + "</b> " + esc(t("ref.bannerSub")) + "</span>" +
      (onQuote ? "" : '<a class="btn btn-sm" href="' + esc(C.pages.quote) + '">' + esc(t("hero.cta")) + "</a>") +
      '<button type="button" class="ref-banner-x" aria-label="' + esc(t("ref.dismiss")) + '">&times;</button></div>';
    var header = document.querySelector(".site-header");
    if (header) header.parentNode.insertBefore(el, header); else document.body.insertBefore(el, document.body.firstChild);
    el.querySelector(".ref-banner-x").addEventListener("click", function () {
      try { sessionStorage.setItem("mkg.refBannerOff", code); } catch (e) { /* ignore */ }
      el.remove();
    });
  }

  function init() { current(); fillAmounts(); banner(); }
  document.addEventListener("mkg:langchange", function () { fillAmounts(); banner(); });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();

  C.invite = {
    enabled: !!R.enabled, clean: clean, valid: valid, current: current, forget: forget,
    amount: amount, rewards: rewards, cap: cap, linkFor: linkFor, qrSvg: qrSvg, mountShare: mountShare, fillAmounts: fillAmounts,
  };
})();
