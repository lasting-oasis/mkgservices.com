/*
  account.html: sign in or create an account, then see every request sent
  with that email (before or after the account existed), follow its status,
  pay when a link is set, and, while a request is new or confirmed, move it
  to another day or window or cancel it. Finished ones can be booked again.

  Ways in: Google; email + password (new accounts confirm their email before
  any requests show, see firestore.rules); or a one-time link by email.
  Links in Firebase's emails (confirm email, reset password, sign-in link)
  also land on this page and are handled here.
*/
(function () {
  "use strict";
  var C = window.MKG, I = C && C.i18n, B = C && C.backend, A = C && C.app, Cal = C && C.calendar;
  if (!I || !B || !A || !Cal) return;
  var t = I.t, esc = A.esc;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $all = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var INV = C.invite;
  var code = null, ledger = [], codeFailed = false;
  var user = null, items = [], tab = "signin", view = "loading", flashNext = "", resetCode = "";
  var editing = {}; // request id -> { date, slot } while its calendar is open
  var OPEN = { new: true, confirmed: true };
  var MIN_PASSWORD = 8;
  // terms.html: a confirmed visit can be changed or cancelled free with this much notice.
  var NOTICE_HOURS = (C.policy && C.policy.changeNoticeHours) || 24;

  // When the visit starts, in the visitor's clock (start of its window, or 8am).
  function startsAt(r) {
    if (!r.date) return null;
    var p = r.date.split("-"), hh = 8, mm = 0;
    if (/^\d{4}$/.test(r.slot || "")) { hh = Number(r.slot.slice(0, 2)); mm = Number(r.slot.slice(2)); }
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]), hh, mm).getTime();
  }
  // A confirmed visit inside the notice window is changed by phone, not here.
  function tooLate(r) { var s = startsAt(r); return r.status === "confirmed" && s !== null && Date.now() > s - NOTICE_HOURS * 36e5; }
  function safeLink(u) { return /^https:\/\/\S+$/i.test(u || "") ? u : ""; }

  function show(which) {
    view = which;
    $all("[data-acct]").forEach(function (s) { s.hidden = s.getAttribute("data-acct") !== which; });
  }
  function validEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e); }
  function err(key, msg) { var el = $('[data-error="' + key + '"]'); if (el) el.textContent = msg || ""; }
  function clearErrors() { ["google", "email", "pass", "email2", "newpass"].forEach(function (k) { err(k, ""); }); }
  function notice(msg) { var n = $("[data-acct-notice]"); n.textContent = msg || ""; n.hidden = !msg; }
  function flash(msg) { var n = $("[data-acct-flash]"); n.textContent = msg || ""; n.hidden = !msg; }
  function locale() { return I.lang === "es" ? "es-US" : "en-US"; }
  // Firebase's error codes, in words a customer can act on.
  function authMessage(e) {
    var c = (e && e.code) || "";
    if (/invalid-credential|wrong-password|user-not-found|invalid-login-credentials/.test(c)) return t("acct.err.wrong");
    if (/email-already-in-use/.test(c)) return t("acct.err.exists");
    if (/weak-password/.test(c)) return t("acct.err.weak", { n: MIN_PASSWORD });
    if (/too-many-requests/.test(c)) return t("acct.err.tooMany");
    if (/invalid-email/.test(c)) return t("err.email");
    if (/expired-action-code|invalid-action-code/.test(c)) return t("acct.linkExpired");
    if (/popup-closed-by-user|cancelled-popup-request/.test(c)) return "";
    return t("acct.err.generic");
  }

  // ---------- requests ----------
  function statusPill(s) {
    return '<span class="status status-' + esc(s) + '">' + esc(t("status." + s)) + "</span>";
  }
  function when(r) {
    if (!r.date) return t("review.flexible");
    return Cal.fmtDate(r.date) + (r.slot ? ", " + Cal.slotLabel(r.slot) : ", " + t("cal.anyWindow").toLowerCase());
  }
  function money(n) { return typeof n === "number" ? A.dollars(n) : ""; }
  function priceText(r) {
    if (typeof r.quotedPrice === "number") return money(r.quotedPrice) + (r.estimatePerVisit !== undefined ? " " + t("acct.perVisit") : "") + " · " + t("acct.priceFinal");
    if (r.estimatePerVisit !== undefined) return money(r.estimatePerVisit) + " " + t("acct.perVisit") + " · " + t("acct.priceEst");
    if (r.estimateOneVisit !== undefined) return money(r.estimateOneVisit) + " · " + t("acct.priceEst");
    return t("q.custom");
  }
  function segmentOf(r) { return C.segments[r.segment || "residential"] || C.segments.residential; }
  function serviceText(r) {
    var seg = segmentOf(r);
    if (r.service) { var s = seg.singleCleans.filter(function (x) { return x.name.en === r.service; })[0]; return s ? I.L(s.name) : r.service; }
    var p = seg.plans.filter(function (x) { return x.name.en === r.plan; })[0];
    var f = seg.frequencies.filter(function (x) { return x.label.en === r.frequency; })[0];
    return (p ? I.L(p.name) : (r.plan || "")) + (f ? ", " + I.L(f.label) : (r.frequency ? ", " + r.frequency : ""));
  }
  // The quote page, pre-filled with what this request asked for.
  function againLink(r) {
    var seg = segmentOf(r), url = seg.pages.quote;
    if (r.service) { var s = seg.singleCleans.filter(function (x) { return x.name.en === r.service; })[0]; return url + (s ? "?service=" + encodeURIComponent(s.id) : ""); }
    var p = seg.plans.filter(function (x) { return x.name.en === r.plan; })[0];
    var f = seg.frequencies.filter(function (x) { return x.label.en === r.frequency; })[0];
    return url + (p ? "?plan=" + encodeURIComponent(p.id) + (f ? "&freq=" + encodeURIComponent(f.id) : "") : "");
  }
  function sorted() {
    // Open requests first, soonest date first (undated last); then the rest, newest first.
    return items.slice().sort(function (a, b) {
      var ao = OPEN[a.status || "new"] ? 0 : 1, bo = OPEN[b.status || "new"] ? 0 : 1;
      if (ao !== bo) return ao - bo;
      if (ao === 0) { var ad = a.date || "9999", bd = b.date || "9999"; if (ad !== bd) return ad < bd ? -1 : 1; }
      return B.toMs(b.createdAt) - B.toMs(a.createdAt);
    });
  }
  function card(r) {
    var s = r.status || "new", open = !!OPEN[s];
    var created = r.createdAt ? new Date(B.toMs(r.createdAt)).toLocaleDateString(locale(), { month: "short", day: "numeric", year: "numeric" }) : "";
    var pay = safeLink(r.payLink) || safeLink(C.payments && C.payments.link);
    var rows = [
      [t("acct.what"), serviceText(r) + (r.segment === "commercial" ? " · " + t("avail.business") : "")],
      [t("acct.where"), (r.company ? r.company + ", " : "") + (r.zip || "")],
      [t("review.timing"), when(r)],
      [t("review.estimate"), priceText(r)],
    ];
    if (r.creditApplied > 0) {
      rows.push([t("acct.creditApplied"), "\u2212" + A.dollars(r.creditApplied)]);
      if (typeof r.youPay === "number") rows.push([t("acct.youPay"), A.dollars(r.youPay)]);
    }
    if (r.replyNote) rows.push([t("acct.fromUs"), r.replyNote]);
    var ed = editing[r.id];
    var html = '<article class="acct-item" data-id="' + esc(r.id) + '">' +
      '<header><span class="muted">' + esc(t("acct.sentOn", { date: created })) + " · #" + esc(r.id.slice(0, 6).toUpperCase()) + "</span>" + statusPill(s) + "</header>" +
      '<p class="acct-status-note">' + esc(t("acct.note." + s)) + "</p>" +
      '<dl class="review">' + rows.map(function (x) { return '<div class="review-row"><dt>' + esc(x[0]) + "</dt><dd>" + esc(x[1]) + "</dd></div>"; }).join("") + "</dl>";
    var actions = [];
    if (pay && s === "confirmed") actions.push('<a class="btn btn-sm" href="' + esc(pay) + '" target="_blank" rel="noopener">' + esc(t("acct.pay")) + "</a>");
    var late = open && tooLate(r);
    if (open && !late) {
      actions.push('<button type="button" class="btn btn-sm btn-secondary" data-acct-act="move">' + esc(ed ? t("acct.keepDate") : t("acct.changeDate")) + "</button>");
      actions.push('<button type="button" class="link-btn acct-cancel" data-acct-act="cancel">' + esc(t("acct.cancel")) + "</button>");
    } else if (late) {
      actions.push('<span class="muted acct-late">' + esc(t("acct.tooLate", { hours: NOTICE_HOURS, phone: (C.business && C.business.phone) || "" })) + "</span>");
    } else {
      actions.push('<a class="btn btn-sm btn-secondary" href="' + esc(againLink(r)) + '">' + esc(t("acct.again")) + "</a>");
    }
    html += '<div class="admin-actions">' + actions.join(" ") + '<span class="muted" data-acct-msg></span></div>';
    if (ed && !late) {
      html += '<div class="acct-move"><p class="field-hint">' + esc(t(s === "confirmed" ? "acct.moveHintConfirmed" : "acct.moveHint")) + "</p><div data-acct-cal></div>" +
        '<p class="acct-move-pick" data-acct-pick>' + esc(ed.date ? Cal.fmtDate(ed.date) + (ed.slot ? ", " + Cal.slotLabel(ed.slot) : ", " + t("cal.anyWindow").toLowerCase()) : t("acct.nothingPicked")) + "</p>" +
        '<p><button type="button" class="btn btn-sm" data-acct-act="save"' + (ed.date ? "" : " disabled") + ">" + esc(t("acct.saveDate")) + "</button></p></div>";
    }
    return html + "</article>";
  }
  function renderList() {
    var box = $("[data-acct-list]"), verified = !!(user && user.emailVerified);
    $("[data-acct-empty]").hidden = !verified || items.length > 0;
    var hint = $("[data-acct-wrongemail]");
    hint.hidden = !verified; hint.textContent = user ? t("acct.wrongEmail", { addr: user.email }) : "";
    box.innerHTML = sorted().map(card).join("");
    $all("[data-acct-cal]", box).forEach(function (el) {
      var art = el.closest("[data-id]"), id = art.getAttribute("data-id");
      var r = items.filter(function (x) { return x.id === id; })[0];
      Cal.mount(el, {
        segment: r.segment || "residential", pickable: true, value: editing[id],
        onChange: function (v) {
          editing[id] = { date: v.date, slot: v.slot };
          $("[data-acct-pick]", art).textContent = v.date ? Cal.fmtDate(v.date) + (v.slot ? ", " + Cal.slotLabel(v.slot) : ", " + t("cal.anyWindow").toLowerCase()) : t("acct.nothingPicked");
          $('[data-acct-act="save"]', art).disabled = !v.date;
        },
      });
    });
    $all("[data-acct-act]", box).forEach(function (b) {
      b.addEventListener("click", function () {
        var art = b.closest("[data-id]"), id = art.getAttribute("data-id"), act = b.getAttribute("data-acct-act");
        var r = items.filter(function (x) { return x.id === id; })[0];
        if (!r) return;
        if (act === "move") { if (editing[id]) delete editing[id]; else editing[id] = { date: r.date || "", slot: r.slot || "" }; renderList(); return; }
        var p, before = { date: r.date || "", slot: r.slot || "", status: r.status };
        if (act === "save") {
          var ed = editing[id];
          if (!ed || !ed.date) return;
          if (ed.date === (r.date || "") && ed.slot === (r.slot || "")) { delete editing[id]; renderList(); return; }
          p = B.reschedule(r, ed.date, ed.slot, true).then(function () { r.date = ed.date; r.slot = ed.slot; r.status = "new"; delete editing[id]; tellBusiness(r, "moved", before); });
        } else if (act === "cancel") {
          if (!confirm(t("acct.cancelConfirm"))) return;
          p = B.cancelRequest(id).then(function () { r.status = "cancelled"; r.cancelledBy = "client"; delete editing[id]; tellBusiness(r, "cancelled", before); });
        } else return;
        $all("[data-acct-act]", art).forEach(function (x) { x.disabled = true; });
        p.then(function () { renderList(); })
          .catch(function (e) { if (window.console) console.warn(e); $all("[data-acct-act]", art).forEach(function (x) { x.disabled = false; }); $("[data-acct-msg]", art).textContent = t("acct.failed"); });
      });
    });
  }
  // An email to the business (plans.js formEndpoint) when a client moves or
  // cancels here, so nobody has to notice it on the admin page first.
  function tellBusiness(r, kind, before) {
    var who = r.name || r.email || "";
    var was = A.visitText(before.date, before.slot) || "no day picked";
    var f = { email: r.email || (user && user.email) || "" };
    if (kind === "moved") {
      var now = A.visitText(r.date, r.slot);
      f._subject = "Client moved their visit: " + who + ", now " + now;
      f["New day and window"] = now;
      f["Was"] = was;
      f["Next step"] = before.status === "confirmed"
        ? "It had been confirmed, so it is back to New. Confirm the new time on the admin page, or call them."
        : "Check the new time on the admin page.";
    } else {
      f._subject = "Client cancelled: " + who + ", " + was;
      f["Cancelled visit"] = was;
      f["It was"] = before.status === "confirmed" ? "Confirmed" : "Not confirmed yet";
    }
    f.Name = r.name || "";
    if (r.phone) f.Phone = r.phone;
    f.Service = r.service || [r.plan, r.frequency].filter(Boolean).join(", ");
    f.Reference = String(r.id || "").slice(0, 6).toUpperCase();
    f["Manage it"] = location.origin + "/admin.html";
    A.notify(f);
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
  function loadReferral() {
    code = null; ledger = []; codeFailed = false;
    if (!INV || !INV.enabled) { renderRef(); return; }
    renderRef();
    B.ensureCode(user).then(function (c) { code = c; renderRef(); })
      .catch(function (e) { codeFailed = true; renderRef(); if (window.console) console.warn(e); });
    B.myCredits(user.email).then(function (list) { ledger = list; renderRef(); })
      .catch(function (e) { if (window.console) console.warn(e); });
  }
  function loadRequests() {
    loadReferral();
    B.myRequests(user.email).then(function (list) { items = list; renderList(); })
      .catch(function (e) { items = []; renderList(); if (window.console) console.warn(e); });
  }

  // ---------- signed in ----------
  function showAccount() {
    show("list");
    $("[data-acct-email]").textContent = user.email || "";
    $("[data-acct-name]").textContent = user.displayName ? user.displayName + " ·" : "";
    // Accounts that can use a password (made with one, or by email link) can set or change it.
    $("[data-acct-pwrow]").hidden = B.providers(user).indexOf("password") === -1;
    $("[data-acct-pwmsg]").textContent = "";
    if (flashNext) { flash(flashNext); flashNext = ""; } else flash("");
    if (user.emailVerified) { $("[data-acct-verify]").hidden = true; loadRequests(); return; }
    // Not confirmed yet: maybe it was confirmed in another tab since this page loaded.
    showUnverified();
    B.refreshUser().then(function (fresh) { if (fresh && fresh.emailVerified) { user = fresh; $("[data-acct-verify]").hidden = true; loadRequests(); } }).catch(function () { /* stay on the banner */ });
  }
  function showUnverified() {
    items = []; renderList();
    var v = $("[data-acct-verify]");
    v.hidden = false;
    $("[data-acct-verify-text]").textContent = t("acct.verifyText", { addr: user.email });
    $("[data-acct-verify-msg]").textContent = "";
  }
  $("[data-acct-recheck]").addEventListener("click", function () {
    var b = this; b.disabled = true;
    B.refreshUser().then(function (fresh) {
      if (fresh && fresh.emailVerified) { user = fresh; $("[data-acct-verify]").hidden = true; flash(t("acct.verified")); loadRequests(); }
      else $("[data-acct-verify-msg]").textContent = t("acct.stillUnverified");
    }).catch(function () { $("[data-acct-verify-msg]").textContent = t("acct.err.generic"); }).then(function () { b.disabled = false; });
  });
  $("[data-acct-resend]").addEventListener("click", function () {
    var b = this; b.disabled = true;
    B.sendVerification().then(function () { $("[data-acct-verify-msg]").textContent = t("acct.resent"); })
      .catch(function (e) { $("[data-acct-verify-msg]").textContent = authMessage(e); }).then(function () { b.disabled = false; });
  });
  $("[data-acct-changepw]").addEventListener("click", function () {
    var b = this; b.disabled = true;
    B.sendReset(user.email).then(function () { $("[data-acct-pwmsg]").textContent = t("acct.changePwSent", { addr: user.email }); })
      .catch(function (e) { $("[data-acct-pwmsg]").textContent = authMessage(e); }).then(function () { b.disabled = false; });
  });
  $("[data-acct-signout]").addEventListener("click", function () { B.signOut().then(function () { items = []; code = null; ledger = []; editing = {}; showSignin(); }); });

  // ---------- signing in / signing up ----------
  // keepNotice: the page is (re)showing the form, so a message already on it
  // ("email confirmed", "link expired") stays; switching tabs by hand clears it.
  function setTab(which, keepNotice) {
    tab = which;
    $all("[data-acct-tab]").forEach(function (b) { b.setAttribute("aria-selected", String(b.getAttribute("data-acct-tab") === which)); b.setAttribute("aria-pressed", String(b.getAttribute("data-acct-tab") === which)); });
    $all("[data-signup-only]").forEach(function (el) { el.hidden = which !== "signup"; });
    $all("[data-signin-only]").forEach(function (el) { el.hidden = which !== "signin"; });
    var title = $("[data-acct-title]"), sub = $("[data-acct-submit]"), g = $("[data-acct-google-label]");
    title.setAttribute("data-i18n", which === "signup" ? "acct.signupH" : "acct.signinH"); title.textContent = t(title.getAttribute("data-i18n"));
    sub.setAttribute("data-i18n", which === "signup" ? "acct.signupBtn" : "acct.signinBtn"); sub.textContent = t(sub.getAttribute("data-i18n"));
    g.setAttribute("data-i18n", which === "signup" ? "acct.googleUp" : "acct.google"); g.textContent = t(g.getAttribute("data-i18n"));
    $("#acct-pass").setAttribute("autocomplete", which === "signup" ? "new-password" : "current-password");
    if (!keepNotice) { clearErrors(); notice(""); }
  }
  function showSignin() { show("signin"); setTab(tab, true); }
  $all("[data-acct-tab]").forEach(function (b) { b.addEventListener("click", function () { setTab(b.getAttribute("data-acct-tab")); }); });
  $all("[data-pw-toggle]").forEach(function (b) {
    b.addEventListener("click", function () {
      var input = document.getElementById(b.getAttribute("data-pw-toggle")), showing = input.type === "text";
      input.type = showing ? "password" : "text";
      b.setAttribute("aria-pressed", String(!showing));
      b.setAttribute("data-i18n", showing ? "acct.show" : "acct.hide"); b.textContent = t(b.getAttribute("data-i18n"));
    });
  });
  $("[data-acct-pw]").addEventListener("submit", function (ev) {
    ev.preventDefault();
    clearErrors(); notice("");
    var name = $("#acct-name").value.trim(), email = $("#acct-email").value.trim(), pass = $("#acct-pass").value;
    var bad = false;
    if (!validEmail(email)) { err("email", t("err.email")); bad = true; }
    if (tab === "signup" && pass.length < MIN_PASSWORD) { err("pass", t("acct.err.weak", { n: MIN_PASSWORD })); bad = true; }
    if (tab === "signin" && !pass) { err("pass", t("acct.err.noPass")); bad = true; }
    if (bad) return;
    var btn = $("[data-acct-submit]"); btn.disabled = true;
    var p = tab === "signup"
      ? B.signUpPassword(name, email, pass).then(function () { flashNext = t("acct.created", { addr: email }); })
      : B.signInPassword(email, pass);
    p.catch(function (e) {
      var code = (e && e.code) || "";
      // Password problems show under the password; everything else under the email.
      err(/invalid-credential|wrong-password|user-not-found|invalid-login-credentials|weak-password/.test(code) ? "pass" : "email", authMessage(e));
      if (window.console) console.warn(e);
    }).then(function () { btn.disabled = false; });
  });
  $("[data-acct-forgot]").addEventListener("click", function () {
    clearErrors();
    var email = $("#acct-email").value.trim();
    if (!validEmail(email)) { err("email", t("acct.needEmail")); $("#acct-email").focus(); return; }
    // The same message whether or not there's an account, so the page never reveals which emails have one.
    B.sendReset(email).then(function () { notice(t("acct.resetSent", { addr: email })); })
      .catch(function (e) {
        var code = (e && e.code) || "";
        if (/user-not-found|invalid-credential/.test(code)) notice(t("acct.resetSent", { addr: email })); else err("email", authMessage(e));
      });
  });
  $("[data-acct-linkmode]").addEventListener("click", function () {
    clearErrors();
    var email = $("#acct-email").value.trim();
    if (!validEmail(email)) { err("email", t("acct.needEmail")); $("#acct-email").focus(); return; }
    B.sendLink(email, location.origin + location.pathname).then(function () { notice(t("acct.sent")); })
      .catch(function (e) { err("email", t("acct.linkFailed")); if (window.console) console.warn(e); });
  });
  $("[data-google-signin]").addEventListener("click", function () {
    var b = this; b.disabled = true; err("google", "");
    B.signInGoogle().catch(function (e) { err("google", authMessage(e) && t("acct.googleFailed")); if (window.console) console.warn(e); }).then(function () { b.disabled = false; });
  });
  $("[data-acct-confirm]").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var email = $("#acct-email2").value.trim();
    if (!validEmail(email)) { err("email2", t("err.email")); return; }
    B.completeLink(email).catch(function () { err("email2", t("acct.linkBad")); });
  });

  // ---------- links from our emails ----------
  function showReset(email) {
    show("reset");
    $("[data-acct-reset-for]").textContent = t("acct.resetFor", { addr: email });
    $("[data-acct-reset]").setAttribute("data-email", email);
  }
  $("[data-acct-reset]").addEventListener("submit", function (ev) {
    ev.preventDefault();
    err("newpass", "");
    var pass = $("#acct-newpass").value, email = ev.target.getAttribute("data-email");
    if (pass.length < MIN_PASSWORD) { err("newpass", t("acct.err.weak", { n: MIN_PASSWORD })); return; }
    var btn = ev.target.querySelector("button[type=submit]"); btn.disabled = true;
    B.confirmReset(resetCode, pass).then(function () {
      flashNext = t("acct.resetDone"); resetCode = "";
      return B.signInPassword(email, pass);
    }).catch(function (e) {
      if (resetCode) { err("newpass", authMessage(e)); btn.disabled = false; }   // the reset itself failed
      else { show("signin"); setTab("signin"); $("#acct-email").value = email; notice(t("acct.resetDoneSignIn")); } // reset worked, sign-in didn't
    });
  });

  // ---------- start ----------
  function onUser(u) {
    user = u;
    if (view === "reset" && !u) return;
    if (u) { showAccount(); return; }
    if (!B.isLink()) showSignin();
  }
  document.addEventListener("mkg:langchange", function () {
    if (view === "list") { renderList(); renderRef(); if (!user.emailVerified) $("[data-acct-verify-text]").textContent = t("acct.verifyText", { addr: user.email }); }
    if (view === "signin") setTab(tab);
    if (view === "reset") $("[data-acct-reset-for]").textContent = t("acct.resetFor", { addr: $("[data-acct-reset]").getAttribute("data-email") || "" });
  });

  // Arriving from the quote page ("create an account with the same email") or a ?signup=1 link.
  (function () {
    var pre = "";
    try { pre = sessionStorage.getItem("mkg.prefillEmail") || ""; sessionStorage.removeItem("mkg.prefillEmail"); } catch (e) { /* ignore */ }
    if (pre && validEmail(pre)) $("#acct-email").value = pre;
    if (pre || /[?&]signup=1/.test(location.search)) tab = "signup";
  })();

  B.ready.then(function (live) {
    if (!live) {
      showSignin(); $("[data-acct-offline]").hidden = false;
      $all("[data-acct-pw] button, [data-google-signin]").forEach(function (b) { b.disabled = true; });
      return;
    }
    var act = B.actionInfo();
    if (act && act.mode === "resetPassword") {
      resetCode = act.code; B.clearActionParams();
      B.checkReset(act.code).then(function (email) { showReset(email); })
        .catch(function () { resetCode = ""; showSignin(); notice(t("acct.linkExpired")); });
    } else if (act && (act.mode === "verifyEmail" || act.mode === "recoverEmail")) {
      B.clearActionParams();
      B.applyCode(act.code).then(function () {
        flashNext = t("acct.verified");
        return B.refreshUser().then(function (fresh) { if (fresh) onUser(fresh); else { setTab("signin"); showSignin(); notice(t("acct.verifiedSignIn")); flashNext = ""; } });
      }).catch(function () { if (!user) { showSignin(); notice(t("acct.linkExpired")); } });
    } else if (B.isLink()) {
      B.completeLink().catch(function (e) {
        if (e && e.message === "need-email") show("confirm");
        else { showSignin(); notice(t("acct.linkBad")); }
      });
    }
    B.onAuth(onUser);
  });
})();
