/*
  account.html: clients sign in with an emailed link (no password) and see the
  requests made with that email, their status, and a payment link when one
  is set.
*/
(function () {
  "use strict";
  var C = window.MKG, I = C && C.i18n, B = C && C.backend, A = C && C.app, Cal = C && C.calendar;
  if (!I || !B || !A) return;
  var t = I.t, esc = A.esc;
  var $ = function (s) { return document.querySelector(s); };
  var INV = C.invite;
  var user = null, items = [], code = null, ledger = [], codeFailed = false;

  function show(which) {
    document.querySelectorAll("[data-acct]").forEach(function (s) { s.hidden = s.getAttribute("data-acct") !== which; });
  }
  function validEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e); }
  function err(key, msg) { var el = $('[data-error="' + key + '"]'); if (el) el.textContent = msg || ""; }

  function statusPill(s) {
    return '<span class="status status-' + esc(s) + '">' + esc(t("status." + s)) + "</span>";
  }
  function when(r) {
    if (!r.date) return t("review.flexible");
    return Cal.fmtDate(r.date) + (r.slot ? ", " + Cal.slotLabel(r.slot) : "");
  }
  function money(n) { return typeof n === "number" ? A.dollars(n) : ""; }
  function renderList() {
    var box = $("[data-acct-list]");
    $("[data-acct-empty]").hidden = items.length > 0;
    box.innerHTML = items.map(function (r) {
      var what = r.service || ((r.plan || "") + (r.frequency ? ", " + r.frequency : ""));
      var est = r.estimatePerVisit !== undefined ? money(r.estimatePerVisit) + " " + t("acct.perVisit") : r.estimateOneVisit !== undefined ? money(r.estimateOneVisit) : t("q.custom");
      var created = r.createdAt ? new Date(B.toMs(r.createdAt)).toLocaleDateString(I.lang === "es" ? "es-US" : "en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
      var pay = r.payLink || (C.payments && C.payments.link);
      var rows = [
        [t("acct.what"), what + (r.segment === "commercial" ? " · " + t("avail.business") : "")],
        [t("acct.where"), (r.company ? r.company + ", " : "") + (r.zip || "")],
        [t("review.timing"), when(r)],
        [t("review.estimate"), est],
      ];
      if (r.creditApplied > 0) {
        rows.push([t("acct.creditApplied"), "−" + A.dollars(r.creditApplied)]);
        if (typeof r.youPay === "number") rows.push([t("acct.youPay"), A.dollars(r.youPay)]);
      }
      if (r.replyNote) rows.push([t("acct.fromUs"), r.replyNote]);
      return '<article class="acct-item">' +
        '<header><span class="muted">' + esc(t("acct.sentOn", { date: created })) + " · #" + esc(r.id.slice(0, 6).toUpperCase()) + "</span>" + statusPill(r.status || "new") + "</header>" +
        '<dl class="review">' + rows.map(function (x) { return '<div class="review-row"><dt>' + esc(x[0]) + "</dt><dd>" + esc(x[1]) + "</dd></div>"; }).join("") + "</dl>" +
        (pay && r.status === "confirmed" ? '<p><a class="btn" href="' + esc(pay) + '" target="_blank" rel="noopener">' + esc(t("acct.pay")) + "</a></p>" : "") +
        "</article>";
    }).join("");
  }
  // ---------- referral panel ----------
  function whenShort(ts) { return ts ? new Date(B.toMs(ts)).toLocaleDateString(I.lang === "es" ? "es-US" : "en-US", { month: "short", day: "numeric", year: "numeric" }) : ""; }
  function renderRef() {
    var panel = $("[data-ref-panel]");
    if (!INV || !INV.enabled) { panel.hidden = true; return; }
    panel.hidden = false;
    var bal = Math.max(0, B.creditBalance(ledger));
    $("[data-ref-balance]").textContent = A.dollars(bal);
    var friends = ledger.filter(function (c) { return c.type === "referral"; }).length;
    $("[data-ref-friends]").textContent = friends ? t("ref.friends" + (friends === 1 ? ".one" : ".other"), { n: friends }) : "";
    var ul = $("[data-ref-ledger]");
    ul.innerHTML = ledger.length ? ledger.map(function (c) {
      var amt = Number(c.amount) || 0;
      return '<li><span class="ref-ledger-what">' + esc(t("ref.type." + (c.type || "adjust"))) + '<small>' + esc(whenShort(c.createdAt)) + "</small></span>" +
        '<b class="' + (amt < 0 ? "is-neg" : "is-pos") + '">' + (amt < 0 ? "−" : "+") + esc(A.dollars(Math.abs(amt))) + "</b></li>";
    }).join("") : '<li class="muted">' + esc(t("ref.historyEmpty")) + "</li>";
    var box = $("[data-ref-share-box]");
    if (code) INV.mountShare(box, code);
    else box.innerHTML = '<p class="muted">' + esc(t(codeFailed ? "ref.failed" : "ref.creating")) + "</p>";
  }
  function load() {
    $("[data-acct-email]").textContent = user.email;
    show("list");
    code = null; ledger = []; codeFailed = false;
    B.myRequests(user.email).then(function (list) { items = list; renderList(); })
      .catch(function (e) { items = []; renderList(); if (window.console) console.warn(e); });
    if (INV && INV.enabled) {
      renderRef();
      B.ensureCode(user).then(function (c) { code = c; renderRef(); })
        .catch(function (e) { codeFailed = true; renderRef(); if (window.console) console.warn(e); });
      B.myCredits(user.email).then(function (list) { ledger = list; renderRef(); })
        .catch(function (e) { if (window.console) console.warn(e); });
    }
  }

  // Sign-in form
  $("[data-acct-form]").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var email = $("#acct-email").value.trim();
    if (!validEmail(email)) { err("email", t("err.email")); return; }
    err("email", "");
    var btn = ev.target.querySelector("button"); btn.disabled = true;
    B.sendLink(email, location.origin + location.pathname).then(function () { $("[data-acct-sent]").hidden = false; })
      .catch(function (e) { err("email", t("acct.linkFailed")); if (window.console) console.warn(e); })
      .then(function () { btn.disabled = false; });
  });
  $("[data-acct-confirm]").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var email = $("#acct-email2").value.trim();
    if (!validEmail(email)) { err("email2", t("err.email")); return; }
    B.completeLink(email).catch(function () { err("email2", t("acct.linkBad")); });
  });
  $("[data-acct-signout]").addEventListener("click", function () { B.signOut().then(function () { items = []; code = null; ledger = []; show("signin"); }); });
  document.addEventListener("mkg:langchange", function () { if (user) { renderList(); renderRef(); } });

  B.ready.then(function (live) {
    if (!live) { show("signin"); $("[data-acct-offline]").hidden = false; $("[data-acct-form] button").disabled = true; return; }
    if (B.isLink()) {
      B.completeLink().catch(function (e) {
        if (e && e.message === "need-email") show("confirm");
        else { show("signin"); err("email", t("acct.linkBad")); }
      });
    }
    B.onAuth(function (u) {
      user = u;
      if (u) load(); else if (!B.isLink()) show("signin");
    });
  });
})();
