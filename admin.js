/*
  admin.html: the owner's view. Sign in with the admin email and password
  (created in the Firebase console), then: every quote request with its
  status, a note and payment link per request, and the calendar with the
  power to close days, block windows, and add bookings taken by phone.
  Referral credit lives here too: a friend's credit is granted when their
  visit is confirmed, the referrer's when it is done, and a client's stacked
  balance is applied to a visit from its card. A Credits tab shows every
  balance and lets the owner add or remove credit by hand.
*/
(function () {
  "use strict";
  var C = window.MKG, I = C && C.i18n, B = C && C.backend, A = C && C.app, Cal = C && C.calendar;
  if (!I || !B || !A || !Cal) return;
  var t = I.t, L = I.L, esc = A.esc, D = B.dates;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $all = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var INV = C.invite;
  var user = null, items = [], filter = "new", unsub = null, unsubCredits = null, cal = null, openDay = "";
  var ledger = [], balances = {}, owners = {}, view = "requests", selected = "";
  var openEdits = {}, savedFlash = {}; // survive the re-render that follows every write
  var AV = C.availability;

  function show(which) { $all("[data-admin]").forEach(function (s) { s.hidden = s.getAttribute("data-admin") !== which; }); }
  function locale() { return I.lang === "es" ? "es-US" : "en-US"; }
  function fmtTs(ts) { return ts ? new Date(B.toMs(ts)).toLocaleString(locale(), { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : ""; }
  function money(n) { return typeof n === "number" ? A.dollars(n) : ""; }
  function slotName(id) { return id ? Cal.slotLabel(id) : ""; }
  // Form values are stored in English; show the translation when one exists.
  function tv(prefix, v) { if (!v) return ""; var k = prefix + "." + v; return I.dictionaries.en[k] !== undefined ? t(k) : v; }
  function pill(s) { return '<span class="status status-' + esc(s) + '">' + esc(t("status." + s)) + "</span>"; }

  // ---------- referral credit ----------
  function digits(v) { return String(v || "").replace(/\D/g, ""); }
  function rounded(n) { return Math.round(n * 100) / 100; }
  function bal(email) { return rounded(balances[String(email || "").toLowerCase()] || 0); }
  function recompute() {
    balances = {};
    ledger.forEach(function (c) { balances[c.emailLower] = (balances[c.emailLower] || 0) + (Number(c.amount) || 0); });
  }
  function visitPrice(r) { return typeof r.estimatePerVisit === "number" ? r.estimatePerVisit : typeof r.estimateOneVisit === "number" ? r.estimateOneVisit : null; }
  // A returning customer (same email or phone, earlier visit) doesn't earn a "new customer" credit automatically.
  function isRepeat(r) {
    var mine = B.toMs(r.createdAt);
    return items.some(function (o) {
      if (o.id === r.id || (o.status !== "done" && o.status !== "confirmed")) return false;
      if (B.toMs(o.createdAt) >= mine) return false;
      return o.emailLower === r.emailLower || (digits(o.phone).length >= 10 && digits(o.phone) === digits(r.phone));
    });
  }
  function loadOwners() {
    var codes = {};
    items.forEach(function (r) { if (r.ref && owners[r.ref] === undefined) codes[r.ref] = true; });
    Object.keys(codes).forEach(function (code) {
      owners[code] = null; // asked
      B.ownerOfCode(code).then(function (o) { owners[code] = o ? o.emailLower : ""; renderList(); }).catch(function () { owners[code] = ""; });
    });
  }
  function refRows(r) {
    if (!r.ref) return [];
    var who = owners[r.ref];
    var line = t("adm.ref.by", { code: r.ref }) + (who ? " · " + t("adm.ref.owner", { email: who }) : who === "" ? " · " + t("adm.ref.unknownOwner") : "");
    var rw = INV.rewards(r.segment || "residential");
    line += " · " + t("ref.type.welcome") + ": " + (r.refWelcomeGranted ? A.dollars(rw.friend) : t("adm.ref.pending").toLowerCase());
    line += " · " + t("adm.ref.reward") + ": " + (r.refRewardGranted ? A.dollars(rw.referrer) : t("adm.ref.pending").toLowerCase());
    var rows = [[t("adm.ref.row"), esc(line), true]];
    if (isRepeat(r) && !r.refWelcomeGranted) rows.push(["", '<span class="admin-warn">' + esc(t("adm.ref.repeat")) + "</span>", true]);
    return rows;
  }
  function creditBlock(r) {
    if (!INV || !INV.enabled) return "";
    var s = r.status || "new";
    if (r.creditApplied > 0) {
      return '<div class="admin-credit"><span>' + esc(t("adm.credit.applied", { amount: A.dollars(r.creditApplied) }) + (typeof r.youPay === "number" ? " " + t("adm.credit.pays", { pay: A.dollars(r.youPay) }) : "")) +
        '</span> <button type="button" class="link-btn" data-act="undoCredit">' + esc(t("adm.credit.undo")) + "</button></div>";
    }
    var b = bal(r.emailLower);
    if (b <= 0 || (s !== "new" && s !== "confirmed")) return "";
    var max = Math.min(b, INV.cap(visitPrice(r)));
    return '<div class="admin-credit"><b>' + esc(t("adm.credit.available", { amount: A.dollars(b) })) + '</b>' +
      '<label>' + esc(t("adm.credit.applyLabel")) + ' <input class="input" type="number" min="0" step="1" max="' + esc(max) + '" value="' + esc(max) + '" data-credit-amount></label>' +
      '<button type="button" class="btn btn-sm" data-act="applyCredit">' + esc(t("adm.credit.apply")) + "</button></div>";
  }
  // Friend's welcome credit once the visit is confirmed; the referrer's once it is done.
  function grants(r, act) {
    if (!INV || !INV.enabled || !r.ref || (act !== "confirmed" && act !== "done") || isRepeat(r)) return Promise.resolve();
    var rw = INV.rewards(r.segment || "residential"), chain = Promise.resolve();
    if (!r.refWelcomeGranted && rw.friend > 0) {
      chain = chain.then(function () {
        return B.addCredit({ id: "welcome-" + r.id, email: r.emailLower, amount: rw.friend, type: "welcome", requestId: r.id, code: r.ref })
          .then(function () { return B.updateRequest(r.id, { refWelcomeGranted: true }); });
      });
    }
    if (act === "done" && !r.refRewardGranted && rw.referrer > 0) {
      chain = chain.then(function () { return B.ownerOfCode(r.ref); }).then(function (o) {
        if (!o) return null;
        return B.addCredit({ id: "referral-" + r.id, email: o.emailLower, amount: rw.referrer, type: "referral", requestId: r.id, code: r.ref })
          .then(function () { return B.updateRequest(r.id, { refRewardGranted: true }); });
      });
    }
    return chain;
  }

  // ---------- requests ----------
  function visible() {
    if (filter === "all") return items;
    if (filter === "done") return items.filter(function (r) { return r.status === "done" || r.status === "declined"; });
    return items.filter(function (r) { return (r.status || "new") === filter; });
  }
  function counts() {
    var c = { new: 0, confirmed: 0, done: 0, all: items.length };
    items.forEach(function (r) { var s = r.status || "new"; if (s === "done" || s === "declined") c.done++; else if (c[s] !== undefined) c[s]++; });
    Object.keys(c).forEach(function (k) { var el = $('[data-count="' + k + '"]'); if (el) el.textContent = c[k]; });
  }
  function sizeText(r) {
    var dims = C.segments[r.segment || "residential"].dims;
    return dims.map(function (d) { return A.num(r[d.id] || 0) + " " + t("unit." + (d.id === "bedrooms" ? "bedroom" : d.id === "bathrooms" ? "bathroom" : d.id) + (Number(r[d.id]) === 1 ? ".one" : ".other")); }).join(", ");
  }
  function whenText(r) {
    if (r.date) return Cal.fmtDate(r.date) + (r.slot ? ", " + slotName(r.slot) : ", " + t("cal.anyWindow").toLowerCase());
    var days = (r.days || []).map(function (d) { return t("q.day." + d); }).join(", ");
    return t("review.flexible") + (days ? " (" + days + (r.timeOfDay ? ", " + t("review.time." + r.timeOfDay) : "") + ")" : "");
  }
  function card(r) {
    var what = r.service || ((r.plan || "") + (r.frequency ? ", " + r.frequency : ""));
    var est = r.estimatePerVisit !== undefined ? money(r.estimatePerVisit) + " " + t("acct.perVisit") + (r.estimatePerMonth ? " · " + t("dial.perMonth", { perMonth: money(r.estimatePerMonth) }) : "")
      : r.estimateOneVisit !== undefined ? money(r.estimateOneVisit) : t("q.custom");
    var contact = '<a href="mailto:' + esc(r.email) + '">' + esc(r.email) + "</a>" + (r.phone ? ' · <a href="tel:' + esc(r.phone.replace(/[^\d+]/g, "")) + '">' + esc(r.phone) + "</a>" : "") +
      (r.contactMethod ? " · " + esc(t("review.prefers." + r.contactMethod)) : "") + (r.language === "es" ? " · " + esc(t("adm.speaksSpanish")) : "");
    var extraField = C.segments[r.segment || "residential"].quote.extraField, extraVal = r[extraField];
    var details = [
      [t("adm.contact"), contact, true],
      [t("acct.what"), esc(what) + " · " + esc(r.segment === "commercial" ? t("avail.business") : t("avail.home")), true],
      [t("review.size"), esc(sizeText(r) + (extraVal && extraVal !== "None" ? ", " + tv("review." + extraField, extraVal) : "")), true],
      [t("acct.where"), esc((r.company ? r.company + ", " : "") + (r.homeType ? tv("q.homeType", r.homeType) : tv("q.facilityType", r.facilityType)) + (r.zip ? ", " + r.zip : "") + (r.outOfArea ? " · " + t("adm.outside") : "")), true],
      [t("review.timing"), esc(whenText(r)), true],
      [t("review.estimate"), esc(est), true],
    ];
    refRows(r).forEach(function (row) { details.push(row); });
    if (r.notes) details.push([t("review.notes"), esc(r.notes), true]);
    if (r.flooring) details.push([t("adm.flooring"), esc(r.flooring), true]);
    var slotOpts = '<option value="">' + esc(t("cal.anyWindow")) + "</option>" + AV.slots.map(function (s) {
      return '<option value="' + esc(s.id) + '"' + (s.id === r.slot ? " selected" : "") + ">" + esc(L(s.label) + " " + (s.time || "")) + "</option>";
    }).join("");
    var s = r.status || "new";
    return '<article class="admin-item" data-id="' + esc(r.id) + '">' +
      '<header><div><b>' + esc(r.name || "?") + "</b> <span class='muted'>#" + esc(r.id.slice(0, 6).toUpperCase()) + " · " + esc(fmtTs(r.createdAt)) + "</span></div>" + pill(s) + "</header>" +
      '<dl class="review">' + details.map(function (x) { return '<div class="review-row"><dt>' + esc(x[0]) + "</dt><dd>" + x[1] + "</dd></div>"; }).join("") + "</dl>" +
      creditBlock(r) +
      '<div class="admin-actions">' +
        (s !== "confirmed" ? '<button type="button" class="btn btn-sm" data-act="confirmed">' + esc(t("adm.confirm")) + "</button>" : "") +
        (s !== "done" ? '<button type="button" class="btn btn-sm btn-secondary" data-act="done">' + esc(t("adm.markDone")) + "</button>" : "") +
        (s !== "declined" ? '<button type="button" class="btn btn-sm btn-secondary" data-act="declined">' + esc(t("adm.decline")) + "</button>" : "") +
        (s === "declined" || s === "done" ? '<button type="button" class="btn btn-sm btn-secondary" data-act="new">' + esc(t("adm.reopen")) + "</button>" : "") +
      "</div>" +
      '<details class="admin-edit"' + (openEdits[r.id] ? " open" : "") + "><summary>" + esc(t("adm.edit")) + "</summary>" +
        '<div class="two-up"><div class="field"><label>' + esc(t("adm.date")) + '</label><input class="input" type="date" data-f="date" value="' + esc(r.date || "") + '"></div>' +
        '<div class="field"><label>' + esc(t("adm.window")) + '</label><select class="select" data-f="slot">' + slotOpts + "</select></div></div>" +
        '<div class="field"><label>' + esc(t("adm.note")) + '</label><textarea class="textarea" rows="2" data-f="replyNote">' + esc(r.replyNote || "") + "</textarea></div>" +
        '<div class="field"><label>' + esc(t("adm.payLink")) + '</label><input class="input" type="url" data-f="payLink" value="' + esc(r.payLink || "") + '" placeholder="https://buy.stripe.com/..."></div>' +
        '<div class="field"><label>' + esc(t("adm.private")) + '</label><textarea class="textarea" rows="2" data-f="adminNotes">' + esc(r.adminNotes || "") + "</textarea></div>" +
        '<p><button type="button" class="btn btn-sm" data-act="save">' + esc(t("adm.save")) + "</button> <span class='muted' data-saved>" + (savedFlash[r.id] ? esc(t("adm.saved")) : "") + "</span></p>" +
      "</details></article>";
  }
  function renderList() {
    var box = $("[data-admin-list]"), list = visible();
    $("[data-admin-empty]").hidden = list.length > 0;
    box.innerHTML = list.map(card).join("");
    counts();
    $all(".admin-edit", box).forEach(function (d) {
      d.addEventListener("toggle", function () { openEdits[d.closest("[data-id]").getAttribute("data-id")] = d.open; });
    });
    $all("[data-act]", box).forEach(function (b) {
      b.addEventListener("click", function () {
        var art = b.closest("[data-id]"), id = art.getAttribute("data-id"), act = b.getAttribute("data-act");
        var r = items.filter(function (x) { return x.id === id; })[0];
        if (!r) return;
        b.disabled = true;
        var p;
        if (act === "save") {
          var patch = {};
          $all("[data-f]", art).forEach(function (f) { patch[f.getAttribute("data-f")] = f.value.trim(); });
          p = B.updateRequest(id, patch).then(function () {
            var moved = patch.date !== (r.date || "") || patch.slot !== (r.slot || "");
            if (!moved) return null;
            return B.releaseHolds(id).then(function () { return B.ensureHold({ id: id, date: patch.date, slot: patch.slot, segment: r.segment }); });
          }).then(function () {
            savedFlash[id] = true; var m = $('[data-id="' + id + '"] [data-saved]'); if (m) m.textContent = t("adm.saved");
            setTimeout(function () { delete savedFlash[id]; var m2 = $('[data-id="' + id + '"] [data-saved]'); if (m2) m2.textContent = ""; }, 2500);
          });
        } else if (act === "applyCredit") {
          var n = rounded(Number($("[data-credit-amount]", art).value)), have = bal(r.emailLower), price = visitPrice(r);
          if (!(n > 0) || n > have || n > INV.cap(price)) { alert(t("adm.credit.tooMuch")); b.disabled = false; return; }
          p = B.addCredit({ id: "use-" + id, email: r.emailLower, amount: -n, type: "used", requestId: id })
            .then(function () { return B.updateRequest(id, { creditApplied: n, youPay: price === null ? null : Math.max(0, rounded(price - n)) }); });
        } else if (act === "undoCredit") {
          p = B.removeCredit("use-" + id).then(function () { return B.updateRequest(id, { creditApplied: 0, youPay: null }); });
        } else {
          p = B.updateRequest(id, { status: act }).then(function () {
            if (act === "declined" || act === "done") return B.releaseHolds(id);
            if (act === "confirmed" || act === "new") return B.ensureHold(r);
            return null;
          }).then(function () {
            return grants(r, act).catch(function (e) { if (window.console) console.warn(e); alert(t("adm.credit.grantFailed")); });
          });
        }
        p.catch(function (e) { alert(t("adm.failed")); if (window.console) console.warn(e); })
          .then(function () { b.disabled = false; if (cal) cal.refresh().then(renderDay); });
      });
    });
  }
  $all("[data-filter]").forEach(function (b) {
    b.addEventListener("click", function () {
      filter = b.getAttribute("data-filter");
      $all("[data-filter]").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
      renderList();
    });
  });

  // ---------- credits tab ----------
  function renderCredits() {
    var positives = 0;
    Object.keys(balances).forEach(function (e) { if (balances[e] > 0) positives += balances[e]; });
    var tot = $("[data-credit-total]"); if (tot) tot.textContent = positives > 0 ? A.dollars(rounded(positives)) : "";
    $("[data-credit-none]").hidden = ledger.length > 0;
    var q = ($("[data-credit-search]").value || "").trim().toLowerCase();
    var emails = Object.keys(balances).filter(function (e) { return !q || e.indexOf(q) !== -1; })
      .sort(function (a, b) { return balances[b] - balances[a] || (a < b ? -1 : 1); });
    $("[data-credit-balances]").innerHTML = emails.map(function (e) {
      return '<button type="button" class="admin-bal' + (e === selected ? " is-active" : "") + '" data-bal="' + esc(e) + '"><span>' + esc(e) + "</span><b>" + esc(A.dollars(bal(e))) + "</b></button>";
    }).join("");
    var box = $("[data-credit-detail]");
    if (!selected) { box.innerHTML = '<p class="muted">' + esc(t("adm.credit.pick")) + "</p>"; return; }
    var rows = ledger.filter(function (c) { return c.emailLower === selected; });
    box.innerHTML = '<h3>' + esc(selected) + '</h3><p class="admin-bal-total">' + esc(t("adm.credit.balance")) + ": <b>" + esc(A.dollars(bal(selected))) + "</b></p>" +
      '<ul class="ref-ledger admin-ledger">' + rows.map(function (c) {
        var amt = Number(c.amount) || 0;
        return "<li><span class='ref-ledger-what'>" + esc(t("ref.type." + (c.type || "adjust"))) + (c.note ? " · " + esc(c.note) : "") +
          "<small>" + esc(fmtTs(c.createdAt)) + (c.code ? " · " + esc(c.code) : "") + "</small></span>" +
          '<b class="' + (amt < 0 ? "is-neg" : "is-pos") + '">' + (amt < 0 ? "−" : "+") + esc(A.dollars(Math.abs(amt))) + "</b>" +
          ' <button type="button" class="link-btn" data-credit-del="' + esc(c.id) + '">' + esc(t("adm.credit.delete")) + "</button></li>";
      }).join("") + "</ul>";
  }
  function setView(v) {
    view = v;
    $all("[data-view-tab]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-view-tab") === v)); });
    $all("[data-view]").forEach(function (d) { d.hidden = d.getAttribute("data-view") !== v; });
    if (v === "credits") renderCredits();
  }
  $all("[data-view-tab]").forEach(function (b) { b.addEventListener("click", function () { setView(b.getAttribute("data-view-tab")); }); });
  $("[data-credit-search]").addEventListener("input", renderCredits);
  $("[data-credit-balances]").addEventListener("click", function (ev) {
    var b = ev.target.closest("[data-bal]"); if (!b) return;
    selected = b.getAttribute("data-bal"); $("#cf-email").value = selected; renderCredits();
  });
  $("[data-credit-detail]").addEventListener("click", function (ev) {
    var b = ev.target.closest("[data-credit-del]"); if (!b) return;
    if (!confirm(t("adm.credit.deleteConfirm"))) return;
    B.removeCredit(b.getAttribute("data-credit-del")).catch(function (e) { alert(t("adm.failed")); if (window.console) console.warn(e); });
  });
  $("[data-credit-form]").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var email = $("#cf-email").value.trim().toLowerCase(), amt = rounded(Number($("#cf-amount").value.replace(/[$,\s]/g, "")));
    var err = $('[data-error="credit"]'); err.textContent = "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || !amt) { err.textContent = t("adm.credit.badInput"); return; }
    B.addCredit({ email: email, amount: amt, type: "adjust", note: $("#cf-note").value.trim() })
      .then(function () { $("#cf-amount").value = ""; $("#cf-note").value = ""; selected = email; renderCredits(); })
      .catch(function (e) { err.textContent = t("adm.failed"); if (window.console) console.warn(e); });
  });

  // ---------- calendar ----------
  function nameFor(hold) {
    if (hold.requestId === "manual") return t("adm.manual") + (hold.note ? ": " + hold.note : "");
    var r = items.filter(function (x) { return x.id === hold.requestId; })[0];
    return r ? r.name + " (" + t("status." + (r.status || "new")) + ")" : "#" + hold.requestId.slice(0, 6).toUpperCase();
  }
  function renderDay() {
    var box = $("[data-admin-day]");
    if (!openDay) { box.innerHTML = ""; return; }
    B.availability(openDay, openDay).then(function (r) {
      var day = r.days[openDay] || {};
      var blocked = day.blockedSlots || [];
      var dow = D.parse(openDay).getDay(), workday = AV.weekdays.indexOf(dow) !== -1;
      var h = '<h3 class="cal-day-title">' + esc(Cal.fmtDate(openDay)) + "</h3>";
      h += '<p><button type="button" class="btn btn-sm ' + (day.closed ? "" : "btn-secondary") + '" data-day-act="toggleClosed">' + esc(day.closed ? t("adm.reopenDay") : t("adm.closeDay")) + "</button>" +
        (!workday ? ' <span class="muted">' + esc(t("adm.notWorkday")) + "</span>" : "") + "</p>";
      h += '<div class="admin-windows">';
      AV.slots.forEach(function (s) {
        var holds = r.holds.filter(function (x) { return x.slot === s.id; });
        var isBlocked = blocked.indexOf(s.id) !== -1;
        h += '<div class="admin-window' + (isBlocked ? " is-blocked" : "") + '"><div class="admin-window-head"><b>' + esc(L(s.label)) + '</b> <span class="muted">' + esc(s.time || "") + " · " + esc(t("cal.adminTaken", { taken: holds.length, cap: AV.capacity })) + "</span>" +
          '<span class="admin-window-btns"><button type="button" class="link-btn" data-day-act="block" data-slot="' + esc(s.id) + '">' + esc(isBlocked ? t("adm.unblock") : t("adm.block")) + "</button>" +
          '<button type="button" class="link-btn" data-day-act="add" data-slot="' + esc(s.id) + '">' + esc(t("adm.addBooking")) + "</button></span></div>";
        if (holds.length) h += "<ul>" + holds.map(function (x) { return "<li>" + esc(nameFor(x)) + ' <button type="button" class="link-btn" data-day-act="drop" data-hold="' + esc(x.id) + '">' + esc(t("adm.remove")) + "</button></li>"; }).join("") + "</ul>";
        h += "</div>";
      });
      h += "</div>";
      box.innerHTML = h;
      $all("[data-day-act]", box).forEach(function (b) {
        b.addEventListener("click", function () {
          var act = b.getAttribute("data-day-act"), p;
          if (act === "toggleClosed") p = B.setDay(openDay, { closed: !day.closed, blockedSlots: blocked });
          else if (act === "block") {
            var id = b.getAttribute("data-slot"), next = blocked.indexOf(id) !== -1 ? blocked.filter(function (x) { return x !== id; }) : blocked.concat([id]);
            p = B.setDay(openDay, { closed: !!day.closed, blockedSlots: next });
          } else if (act === "add") {
            var note = prompt(t("adm.addPrompt"));
            if (note === null) return;
            p = B.addManualHold(openDay, b.getAttribute("data-slot"), note);
          } else if (act === "drop") {
            if (!confirm(t("adm.removeConfirm"))) return;
            p = B.deleteHold(b.getAttribute("data-hold"));
          }
          if (p) p.catch(function (e) { alert(t("adm.failed")); if (window.console) console.warn(e); }).then(function () { cal.refresh().then(renderDay); });
        });
      });
    });
  }
  function mountCal() {
    var box = $("[data-calendar]");
    cal = Cal.mount(box, { segment: "commercial", pickable: false, admin: true });
    box.addEventListener("click", function (ev) {
      var b = ev.target.closest("[data-cal-day]");
      if (b) { openDay = b.getAttribute("data-cal-day"); renderDay(); }
    });
  }

  // ---------- auth ----------
  function enter(u) {
    user = u;
    $("[data-admin-email]").textContent = u.email;
    show("dash");
    if (!cal) mountCal();
    if (unsub) unsub();
    unsub = B.watchRequests(function (list, err) {
      if (err) { if (window.console) console.warn(err); $("[data-admin-empty]").hidden = false; $("[data-admin-empty]").textContent = t("adm.failed"); return; }
      items = list; loadOwners(); renderList(); if (openDay) renderDay();
    });
    if (unsubCredits) unsubCredits();
    unsubCredits = B.watchCredits(function (list, err) {
      if (err) { if (window.console) console.warn(err); return; }
      ledger = list; recompute(); renderCredits(); renderList();
    });
  }
  $("[data-admin-form]").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var email = $("#adm-email").value.trim(), pass = $("#adm-pass").value;
    $('[data-error="login"]').textContent = "";
    B.signInPassword(email, pass).catch(function (e) { $('[data-error="login"]').textContent = t("adm.badLogin"); if (window.console) console.warn(e); });
  });
  $("[data-admin-signout]").addEventListener("click", function () { if (unsub) { unsub(); unsub = null; } if (unsubCredits) { unsubCredits(); unsubCredits = null; } B.signOut().then(function () { show("login"); }); });
  document.addEventListener("mkg:langchange", function () { if (user) { renderList(); renderDay(); renderCredits(); } });

  B.ready.then(function (live) {
    if (!live) { $("[data-admin-offline]").hidden = false; $("[data-admin-form] button").disabled = true; return; }
    B.onAuth(function (u) {
      if (!u) { show("login"); return; }
      B.isAdmin(u).then(function (ok) {
        if (ok) { $("[data-admin-notadmin]").hidden = true; enter(u); }
        else { show("login"); $("[data-admin-notadmin]").hidden = false; B.signOut(); }
      });
    });
  });
})();
