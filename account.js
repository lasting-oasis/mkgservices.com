/*
  account.html: clients sign in with an emailed link (no password) and see the
  requests made with that email, their status, and a payment link when one
  is set. While a request is still new or confirmed they can move it to
  another day or window, or cancel it. Finished ones can be booked again.
*/
(function () {
  "use strict";
  var C = window.MKG, I = C && C.i18n, B = C && C.backend, A = C && C.app, Cal = C && C.calendar;
  if (!I || !B || !A || !Cal) return;
  var t = I.t, esc = A.esc;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $all = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var user = null, items = [];
  var editing = {}; // request id -> { date, slot } while its calendar is open
  var OPEN = { new: true, confirmed: true };

  function show(which) {
    $all("[data-acct]").forEach(function (s) { s.hidden = s.getAttribute("data-acct") !== which; });
  }
  function validEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e); }
  function err(key, msg) { var el = $('[data-error="' + key + '"]'); if (el) el.textContent = msg || ""; }
  function locale() { return I.lang === "es" ? "es-US" : "en-US"; }

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
    var pay = r.payLink || (C.payments && C.payments.link);
    var rows = [
      [t("acct.what"), serviceText(r) + (r.segment === "commercial" ? " · " + t("avail.business") : "")],
      [t("acct.where"), (r.company ? r.company + ", " : "") + (r.zip || "")],
      [t("review.timing"), when(r)],
      [t("review.estimate"), priceText(r)],
    ];
    if (r.replyNote) rows.push([t("acct.fromUs"), r.replyNote]);
    var ed = editing[r.id];
    var html = '<article class="acct-item" data-id="' + esc(r.id) + '">' +
      '<header><span class="muted">' + esc(t("acct.sentOn", { date: created })) + " · #" + esc(r.id.slice(0, 6).toUpperCase()) + "</span>" + statusPill(s) + "</header>" +
      '<p class="acct-status-note">' + esc(t("acct.note." + s)) + "</p>" +
      '<dl class="review">' + rows.map(function (x) { return '<div class="review-row"><dt>' + esc(x[0]) + "</dt><dd>" + esc(x[1]) + "</dd></div>"; }).join("") + "</dl>";
    var actions = [];
    if (pay && s === "confirmed") actions.push('<a class="btn btn-sm" href="' + esc(pay) + '" target="_blank" rel="noopener">' + esc(t("acct.pay")) + "</a>");
    if (open) {
      actions.push('<button type="button" class="btn btn-sm btn-secondary" data-acct-act="move">' + esc(ed ? t("acct.keepDate") : t("acct.changeDate")) + "</button>");
      actions.push('<button type="button" class="link-btn acct-cancel" data-acct-act="cancel">' + esc(t("acct.cancel")) + "</button>");
    } else {
      actions.push('<a class="btn btn-sm btn-secondary" href="' + esc(againLink(r)) + '">' + esc(t("acct.again")) + "</a>");
    }
    html += '<div class="admin-actions">' + actions.join(" ") + '<span class="muted" data-acct-msg></span></div>';
    if (ed) {
      html += '<div class="acct-move"><p class="field-hint">' + esc(t("acct.moveHint")) + "</p><div data-acct-cal></div>" +
        '<p class="acct-move-pick" data-acct-pick>' + esc(ed.date ? Cal.fmtDate(ed.date) + (ed.slot ? ", " + Cal.slotLabel(ed.slot) : ", " + t("cal.anyWindow").toLowerCase()) : t("acct.nothingPicked")) + "</p>" +
        '<p><button type="button" class="btn btn-sm" data-acct-act="save"' + (ed.date ? "" : " disabled") + ">" + esc(t("acct.saveDate")) + "</button></p></div>";
    }
    return html + "</article>";
  }
  function renderList() {
    var box = $("[data-acct-list]");
    $("[data-acct-empty]").hidden = items.length > 0;
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
        var p;
        if (act === "save") {
          var ed = editing[id];
          if (!ed || !ed.date) return;
          if (ed.date === (r.date || "") && ed.slot === (r.slot || "")) { delete editing[id]; renderList(); return; }
          p = B.reschedule(r, ed.date, ed.slot).then(function () { r.date = ed.date; r.slot = ed.slot; delete editing[id]; });
        } else if (act === "cancel") {
          if (!confirm(t("acct.cancelConfirm"))) return;
          p = B.cancelRequest(id).then(function () { r.status = "cancelled"; r.cancelledBy = "client"; delete editing[id]; });
        } else return;
        $all("[data-acct-act]", art).forEach(function (x) { x.disabled = true; });
        p.then(function () { renderList(); })
          .catch(function (e) { if (window.console) console.warn(e); $all("[data-acct-act]", art).forEach(function (x) { x.disabled = false; }); $("[data-acct-msg]", art).textContent = t("acct.failed"); });
      });
    });
  }
  function load() {
    $("[data-acct-email]").textContent = user.email;
    show("list");
    B.myRequests(user.email).then(function (list) { items = list; renderList(); })
      .catch(function (e) { items = []; renderList(); if (window.console) console.warn(e); });
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
  $("[data-acct-signout]").addEventListener("click", function () { B.signOut().then(function () { items = []; editing = {}; show("signin"); }); });
  document.addEventListener("mkg:langchange", function () { if (user) renderList(); });

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
