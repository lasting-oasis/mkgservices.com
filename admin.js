/*
  admin.html: the team's page. Sign in (password or Google), then: every
  quote request with its status, the time clock, the week ahead, and the
  calendar (close days, block windows, add bookings taken by phone). The
  owner also gets the team list and the team's time report.

  Requests, their staff-only fields (internal/{id}) and the team list all
  stream in live, and every update redraws the list. Anything typed into an
  open edit panel is kept in `drafts` until it's saved or discarded, so a
  redraw never wipes it.
*/
(function () {
  "use strict";
  var C = window.MKG, I = C && C.i18n, B = C && C.backend, A = C && C.app, Cal = C && C.calendar;
  if (!I || !B || !A || !Cal) return;
  var t = I.t, L = I.L, esc = A.esc, D = B.dates;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $all = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var user = null, me = null, filter = "new", query = "", cal = null, openDay = "";
  var raw = [], internal = {}, items = [];   // items = raw requests merged with their staff-only fields
  var team = [];                            // everyone on the team, invites included
  var subs = [], recheck = null;
  var openEdits = {}, savedFlash = {}, drafts = {};
  var AV = C.availability;
  var INV = C.invite;
  var ledger = [], balances = {}, owners = {}, view = "requests", selected = "";
  var CLOSED = { done: true, declined: true, cancelled: true };
  var PRIVATE = ["adminNotes", "assignedTo"];
  var baseTitle = document.title;

  function isOwner() { return !!me && me.role === "owner"; }
  function show(which) { $all("[data-admin]").forEach(function (s) { s.hidden = s.getAttribute("data-admin") !== which; }); }
  function locale() { return I.lang === "es" ? "es-US" : "en-US"; }
  function fmtTs(ts) { return ts ? new Date(B.toMs(ts)).toLocaleString(locale(), { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : ""; }
  function money(n) { return typeof n === "number" ? A.dollars(n) : ""; }
  function slotName(id) { return id ? Cal.slotLabel(id) : ""; }
  function shortDay(ymd) { return Cal.fmtDate(ymd, { weekday: "short", month: "short", day: "numeric" }); }
  // Form values are stored in English; show the translation when one exists.
  function tv(prefix, v) { if (!v) return ""; var k = prefix + "." + v; return I.dictionaries.en[k] !== undefined ? t(k) : v; }
  function pill(s) { return '<span class="status status-' + esc(s) + '">' + esc(t("status." + s)) + "</span>"; }
  function fail(e) { alert(t("adm.failed")); if (window.console) console.warn(e); }
  function byId(id) { return items.filter(function (x) { return x.id === id; })[0]; }

  // Older requests kept the staff-only fields on the request itself; the
  // internal/ document wins once it exists, and saving moves them over.
  function merge() {
    items = raw.map(function (r) {
      var i = internal[r.id], x = Object.assign({}, r);
      PRIVATE.forEach(function (k) { x[k] = i ? i[k] : (r[k] || ""); });
      return x;
    });
  }
  function draftOf(r, k, saved) { var d = drafts[r.id]; return d && d[k] !== undefined ? d[k] : saved; }

  // ---------- requests ----------
  function matches(r) {
    if (!query) return true;
    var hay = [r.name, r.email, r.phone, r.zip, r.company, r.id, r.service, r.plan, r.notes, r.adminNotes, r.assignedTo].join(" ").toLowerCase();
    return query.split(/\s+/).every(function (w) { w = w.replace(/^#+/, ""); return !w || hay.indexOf(w) !== -1; });
  }
  function visible() {
    var list = items.filter(matches);
    if (filter === "all") return list;
    if (filter === "done") return list.filter(function (r) { return !!CLOSED[r.status]; });
    return list.filter(function (r) { return (r.status || "new") === filter; });
  }
  function counts() {
    var c = { new: 0, confirmed: 0, done: 0, all: items.length };
    items.forEach(function (r) { var s = r.status || "new"; if (CLOSED[s]) c.done++; else if (c[s] !== undefined) c[s]++; });
    Object.keys(c).forEach(function (k) { var el = $('[data-count="' + k + '"]'); if (el) el.textContent = c[k]; });
    document.title = (c.new ? "(" + c.new + ") " : "") + baseTitle;
  }
  // Service choices for the edit panel: this segment's single cleans, then every plan x schedule.
  function segOf(r) { return C.segments[r.segment] || C.segments.residential; }
  function serviceValue(r) {
    var seg = segOf(r);
    if (r.service) { var s = seg.singleCleans.filter(function (x) { return x.name.en === r.service; })[0]; return s ? "single:" + s.id : ""; }
    var p = seg.plans.filter(function (x) { return x.name.en === r.plan; })[0], f = seg.frequencies.filter(function (x) { return x.label.en === r.frequency; })[0];
    return p ? "plan:" + p.id + ":" + (f ? f.id : "") : "";
  }
  function serviceOptions(r) {
    var seg = segOf(r), saved = serviceValue(r), cur = draftOf(r, "serviceChoice", saved), out = [];
    function opt(v, label) { out.push('<option value="' + esc(v) + '"' + (v === cur ? " selected" : "") + ">" + esc(label) + "</option>"); }
    if (!saved) opt("", r.service || ((r.plan || "") + (r.frequency ? ", " + r.frequency : "")) || "—");
    seg.singleCleans.forEach(function (s) { opt("single:" + s.id, L(s.name)); });
    seg.plans.forEach(function (p) { seg.frequencies.forEach(function (f) { opt("plan:" + p.id + ":" + f.id, L(p.name) + ", " + L(f.label)); }); });
    return out.join("");
  }
  // Turn a service choice back into the fields the quote form would have saved.
  function servicePatch(r, v) {
    var seg = segOf(r), del = B.firebase.firestore.FieldValue.delete(), parts = v.split(":");
    if (parts[0] === "single") {
      var s = seg.singleCleans.filter(function (x) { return x.id === parts[1]; })[0];
      return s ? { service: s.name.en, plan: del, frequency: del } : {};
    }
    if (parts[0] === "plan") {
      var p = seg.plans.filter(function (x) { return x.id === parts[1]; })[0], f = seg.frequencies.filter(function (x) { return x.id === parts[2]; })[0];
      return p ? { plan: p.name.en, frequency: f ? f.label.en : (r.frequency || ""), service: del } : {};
    }
    return {};
  }
  function sizeText(r) {
    var dims = segOf(r).dims.filter(function (d) { return typeof r[d.id] === "number"; });
    return dims.map(function (d) { return A.num(r[d.id]) + " " + t("unit." + (d.id === "bedrooms" ? "bedroom" : d.id === "bathrooms" ? "bathroom" : d.id) + (r[d.id] === 1 ? ".one" : ".other")); }).join(", ");
  }
  function whenText(r) {
    if (r.date) return Cal.fmtDate(r.date) + (r.slot ? ", " + slotName(r.slot) : ", " + t("cal.anyWindow").toLowerCase());
    var days = r.days.map(function (d) { return t("q.day." + d); }).join(", ");
    return t("review.flexible") + (days ? " (" + days + (r.timeOfDay ? ", " + t("review.time." + r.timeOfDay) : "") + ")" : "");
  }
  function movedText(r) {
    var p = (r.movedFrom || "").split(" "), from = p[0] ? shortDay(p[0]) + (p[1] ? ", " + slotName(p[1]) : "") : t("review.flexible");
    return t("adm.movedFrom", { from: from, when: fmtTs(r.movedByClientAt) });
  }
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

  function card(r) {
    var phoneBooking = r.source === "phone";
    var what = r.service || ((r.plan || "") + (r.frequency ? ", " + r.frequency : "")) || (phoneBooking ? t("adm.phoneBooking") : "");
    var est = r.estimatePerVisit !== undefined ? money(r.estimatePerVisit) + " " + t("acct.perVisit") + (r.estimatePerMonth ? " · " + t("dial.perMonth", { perMonth: money(r.estimatePerMonth) }) : "")
      : r.estimateOneVisit !== undefined ? money(r.estimateOneVisit) : t("q.custom");
    if (typeof r.quotedPrice === "number") est = money(r.quotedPrice) + (r.estimatePerVisit !== undefined ? " " + t("acct.perVisit") : "") + " · " + t("acct.priceFinal") + " (" + t("adm.wasEst", { est: est }) + ")";
    var contact = (r.email ? '<a href="mailto:' + esc(r.email) + '">' + esc(r.email) + "</a>" : esc(phoneBooking ? t("adm.phoneBooking") : "—")) +
      (r.phone ? ' · <a href="tel:' + esc(r.phone.replace(/[^\d+]/g, "")) + '">' + esc(r.phone) + "</a>" : "") +
      (r.contactMethod ? " · " + esc(t("review.prefers." + r.contactMethod)) : "") + (r.language === "es" ? " · " + esc(t("adm.speaksSpanish")) : "");
    var extraField = segOf(r).quote.extraField, extraVal = r[extraField];
    var size = sizeText(r) + (extraVal && extraVal !== "None" ? ", " + tv("review." + extraField, extraVal) : "");
    var where = (r.company ? r.company + ", " : "") + (r.homeType ? tv("q.homeType", r.homeType) : r.facilityType ? tv("q.facilityType", r.facilityType) : "") + (r.zip ? ", " + r.zip : "");
    var s = r.status || "new", moved = s === "new" && r.movedByClientAt;
    var details = [[t("adm.contact"), contact], [t("acct.what"), esc(what) + " · " + esc(r.segment === "commercial" ? t("avail.business") : t("avail.home"))]];
    if (size) details.push([t("review.size"), esc(size)]);
    if (where.replace(/^, /, "")) details.push([t("acct.where"), esc(where.replace(/^, /, "") + (r.outOfArea ? " · " + t("adm.outside") : ""))]);
    details.push([t("review.timing"), esc(whenText(r))]);
    if (moved) details.push([t("adm.movedH"), esc(movedText(r))]);
    details.push([t("review.estimate"), esc(est)]);
    refRows(r).forEach(function (row) { details.push(row); });
    if (r.notes) details.push([t("review.notes"), esc(r.notes)]);
    if (r.heardFrom) details.push([t("adm.heardFrom"), esc(tv("q.heard", r.heardFrom))]);
    if (r.flooring) details.push([t("adm.flooring"), esc(r.flooring)]);
    if (r.assignedTo) details.push([t("adm.assignedTo"), esc(r.assignedTo)]);
    var tj = C.timeclock && C.timeclock.timeOnJob(r.id);
    if (tj) details.push([t("adm.timeOnJob"), esc(tj)]);
    if (s === "cancelled") details.push([t("status.cancelled"), esc(r.cancelledBy === "client" ? t("adm.cancelledByClient") : t("adm.cancelledByYou")) + (r.updatedAt ? " · " + esc(fmtTs(r.updatedAt)) : "")]);

    var slot = draftOf(r, "slot", r.slot || "");
    var slotOpts = '<option value="">' + esc(t("cal.anyWindow")) + "</option>" + AV.slots.map(function (x) {
      return '<option value="' + esc(x.id) + '"' + (x.id === slot ? " selected" : "") + ">" + esc(L(x.label) + " " + (x.time || "")) + "</option>";
    }).join("");
    var assigned = draftOf(r, "assignedTo", r.assignedTo || "");
    var assignOpts = '<option value="">' + esc(t("adm.unassigned")) + "</option>" + team.map(function (m) {
      return '<option value="' + esc(m.email) + '"' + (m.email === assigned ? " selected" : "") + ">" + esc(m.email + (m.status === "invited" ? " (" + t("adm.invitedShort") + ")" : "")) + "</option>";
    }).join("") + (assigned && !team.some(function (m) { return m.email === assigned; }) ? '<option value="' + esc(assigned) + '" selected>' + esc(assigned) + "</option>" : "");
    var price = draftOf(r, "quotedPrice", typeof r.quotedPrice === "number" ? String(r.quotedPrice) : "");
    var dirty = !!drafts[r.id];

    return '<article class="admin-item" data-id="' + esc(r.id) + '">' +
      '<header><div><b>' + esc(r.name || "?") + "</b> <span class='muted'>#" + esc(r.id.slice(0, 6).toUpperCase()) + " · " + esc(fmtTs(r.createdAt)) + "</span></div>" +
        "<div>" + (moved ? '<span class="status status-moved">' + esc(t("adm.movedH")) + "</span> " : "") + pill(s) + "</div></header>" +
      '<dl class="review">' + details.map(function (x) { return '<div class="review-row"><dt>' + esc(x[0]) + "</dt><dd>" + x[1] + "</dd></div>"; }).join("") + "</dl>" +
      '<div class="admin-actions">' +
        (s !== "confirmed" ? '<button type="button" class="btn btn-sm" data-act="confirmed">' + esc(t("adm.confirm")) + "</button>" : "") +
        (s !== "done" ? '<button type="button" class="btn btn-sm btn-secondary" data-act="done">' + esc(t("adm.markDone")) + "</button>" : "") +
        (!CLOSED[s] ? '<button type="button" class="btn btn-sm btn-secondary" data-act="declined">' + esc(t("adm.decline")) + "</button>" : "") +
        (CLOSED[s] ? '<button type="button" class="btn btn-sm btn-secondary" data-act="new">' + esc(t("adm.reopen")) + "</button>" : "") +
      "</div>" +
      creditBlock(r) +
      '<details class="admin-edit"' + (openEdits[r.id] ? " open" : "") + "><summary>" + esc(t("adm.edit")) + '<span class="admin-unsaved"' + (dirty ? "" : " hidden") + ' data-unsaved> · ' + esc(t("adm.unsaved")) + "</span></summary>" +
        '<div class="two-up"><div class="field"><label>' + esc(t("adm.date")) + '</label><input class="input" type="date" data-f="date" value="' + esc(draftOf(r, "date", r.date || "")) + '"></div>' +
        '<div class="field"><label>' + esc(t("adm.window")) + '</label><select class="select" data-f="slot">' + slotOpts + "</select></div></div>" +
        '<div class="two-up"><div class="field"><label>' + esc(t("adm.service")) + '</label><select class="select" data-f="serviceChoice">' + serviceOptions(r) + "</select></div>" +
        '<div class="field"><label>' + esc(t("adm.finalPrice")) + '</label><input class="input" type="number" min="0" step="1" inputmode="decimal" data-f="quotedPrice" value="' + esc(price) + '" placeholder="' + esc(t("adm.finalPriceHint")) + '"></div></div>' +
        '<div class="field"><label>' + esc(t("adm.note")) + '</label><textarea class="textarea" rows="2" maxlength="2000" data-f="replyNote">' + esc(draftOf(r, "replyNote", r.replyNote || "")) + "</textarea></div>" +
        '<div class="field"><label>' + esc(t("adm.payLink")) + '</label><input class="input" type="url" data-f="payLink" value="' + esc(draftOf(r, "payLink", r.payLink || "")) + '" placeholder="https://buy.stripe.com/..."></div>' +
        '<div class="field"><label>' + esc(t("adm.private")) + '</label><textarea class="textarea" rows="2" maxlength="4000" data-f="adminNotes">' + esc(draftOf(r, "adminNotes", r.adminNotes || "")) + "</textarea></div>" +
        '<div class="field"><label>' + esc(t("adm.assign")) + '</label><select class="select" data-f="assignedTo">' + assignOpts + "</select></div>" +
        '<p class="field-error" data-edit-err></p>' +
        '<p><button type="button" class="btn btn-sm" data-act="save">' + esc(t("adm.save")) + "</button> " +
          (dirty ? '<button type="button" class="link-btn" data-act="discard">' + esc(t("adm.discard")) + "</button> " : "") +
          "<span class='muted' data-saved>" + (savedFlash[r.id] ? esc(t("adm.saved")) : "") + "</span></p>" +
        (isOwner() ? '<p class="admin-danger"><button type="button" class="link-btn" data-act="delete">' + esc(t("adm.deleteRequest")) + "</button></p>" : "") +
      "</details></article>";
  }
  function renderList() {
    var box = $("[data-admin-list]"), list = visible();
    $("[data-admin-empty]").hidden = list.length > 0;
    box.innerHTML = list.map(card).join("");
    counts();
    renderUpcoming();
    $all(".admin-edit", box).forEach(function (d) {
      d.addEventListener("toggle", function () { openEdits[d.closest("[data-id]").getAttribute("data-id")] = d.open; });
    });
    $all("[data-f]", box).forEach(function (f) {
      var art = f.closest("[data-id]"), id = art.getAttribute("data-id");
      function keep() { (drafts[id] = drafts[id] || {})[f.getAttribute("data-f")] = f.value; var u = $("[data-unsaved]", art); if (u) u.hidden = false; }
      f.addEventListener("input", keep); f.addEventListener("change", keep);
    });
    $all("[data-act]", box).forEach(function (b) { b.addEventListener("click", function () { act(b); }); });
  }
  function act(b) {
    var art = b.closest("[data-id]"), id = art.getAttribute("data-id"), what = b.getAttribute("data-act"), r = byId(id);
    if (!r) return;
    if (what === "discard") { delete drafts[id]; renderList(); return; }
    if (what === "delete") {
      // A permanent delete needs the word typed out, so a stray click can't wipe a client's request.
      var typed = prompt(t("adm.deleteConfirm", { name: r.name || "?" }));
      if (typed === null) return;
      if (["delete", "borrar"].indexOf(String(typed).trim().toLowerCase()) === -1) { alert(t("adm.deleteWrongWord")); return; }
    }
    var p, del = B.firebase.firestore.FieldValue.delete();
    if (what === "save") {
      var patch = {}, priv = {}, date = "", slot = "", bad = "";
      $all("[data-f]", art).forEach(function (f) {
        var k = f.getAttribute("data-f"), v = f.value.trim();
        if (k === "date") date = v;
        else if (k === "slot") slot = v;
        else if (k === "serviceChoice") { if (v && v !== serviceValue(r)) Object.assign(patch, servicePatch(r, v)); }
        else if (k === "quotedPrice") { if (v === "") patch.quotedPrice = del; else if (isFinite(Number(v)) && Number(v) >= 0) patch.quotedPrice = Number(v); else bad = t("adm.priceBad"); }
        else if (k === "payLink") { if (v && !/^https:\/\/\S+$/i.test(v)) bad = t("adm.payLinkBad"); else patch.payLink = v; }
        else if (PRIVATE.indexOf(k) !== -1) priv[k] = v;
        else patch[k] = v;
      });
      if (bad) { $("[data-edit-err]", art).textContent = bad; return; }
      var old = raw.filter(function (x) { return x.id === id; })[0] || {};
      PRIVATE.forEach(function (k) { if (old[k] !== undefined) patch[k] = del; }); // move older fields off the customer-readable request
      var moved = date !== (r.date || "") || slot !== (r.slot || "");
      b.disabled = true;
      p = Promise.all([B.updateRequest(id, patch), B.saveInternal(id, priv)]).then(function () {
        return moved ? B.reschedule(r, date, slot, false) : null;
      }).then(function () {
        delete drafts[id]; savedFlash[id] = true; renderList();
        setTimeout(function () { delete savedFlash[id]; var m = $('[data-id="' + id + '"] [data-saved]'); if (m) m.textContent = ""; }, 2500);
      });
    } else if (what === "delete") {
      b.disabled = true;
      p = B.deleteRequest(id).then(function () { delete drafts[id]; delete openEdits[id]; });
    } else if (what === "applyCredit") {
      var n = rounded(Number($("[data-credit-amount]", art).value)), have = bal(r.emailLower), price = visitPrice(r);
      if (!(n > 0) || n > have || n > INV.cap(price)) { alert(t("adm.credit.tooMuch")); return; }
      b.disabled = true;
      p = B.addCredit({ id: "use-" + id, email: r.emailLower, amount: -n, type: "used", requestId: id })
        .then(function () { return B.updateRequest(id, { creditApplied: n, youPay: price === null ? null : Math.max(0, rounded(price - n)) }); });
    } else if (what === "undoCredit") {
      b.disabled = true;
      p = B.removeCredit("use-" + id).then(function () { return B.updateRequest(id, { creditApplied: 0, youPay: null }); });
    } else {
      b.disabled = true;
      p = B.updateRequest(id, { status: what }).then(function () {
        if (CLOSED[what]) return B.releaseHolds(id);
        return B.ensureHold(Object.assign({}, r, { status: what }));
      }).then(function () {
        return grants(r, what).catch(function (e) { if (window.console) console.warn(e); alert(t("adm.credit.grantFailed")); });
      });
    }
    p.catch(function (e) { b.disabled = false; fail(e); }).then(function () { if (cal) cal.refresh().then(renderDay); });
  }
  $all("[data-filter]").forEach(function (b) {
    b.addEventListener("click", function () {
      filter = b.getAttribute("data-filter");
      $all("[data-filter]").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
      renderList();
    });
  });
  $("[data-admin-search]").addEventListener("input", function (ev) { query = ev.target.value.trim().toLowerCase(); renderList(); });

  // ---------- the week ahead ----------
  // Open bookings in the next 7 days, soonest first, plus any the client
  // cancelled (struck through) so a freed window doesn't go unnoticed.
  function renderUpcoming() {
    var box = $("[data-admin-upcoming]");
    var today = D.ymd(new Date()), end = D.ymd(D.addDays(new Date(), 7));
    var list = items.filter(function (r) {
      var show = !CLOSED[r.status] || (r.status === "cancelled" && r.cancelledBy === "client");
      return show && r.date && r.date >= today && r.date <= end;
    }).sort(function (a, b) { return (a.date + (a.slot || "zzzz")) < (b.date + (b.slot || "zzzz")) ? -1 : 1; });
    if (!list.length) { box.innerHTML = '<p class="muted">' + esc(t("adm.weekEmpty")) + "</p>"; return; }
    var h = "", lastDay = "";
    list.forEach(function (r) {
      if (r.date !== lastDay) { h += (lastDay ? "</ul>" : "") + '<h4 class="admin-week-day"><button type="button" class="link-btn" data-week-day="' + esc(r.date) + '">' + esc(r.date === today ? t("adm.today") : shortDay(r.date)) + "</button></h4><ul>"; lastDay = r.date; }
      var who = r.assignedTo ? ' <span class="muted">→ ' + esc(r.assignedTo.split("@")[0]) + "</span>" : "";
      h += '<li' + (r.status === "cancelled" ? ' class="is-cancelled"' : "") + '><button type="button" class="link-btn" data-week-req="' + esc(r.id) + '">' + esc(r.name || "?") + "</button> · " +
        esc(r.slot ? slotName(r.slot) : t("cal.anyWindow")) + " · " + pill(r.status || "new") + (r.movedByClientAt && r.status === "new" ? ' <span class="status status-moved">' + esc(t("adm.movedH")) + "</span>" : "") + who + "</li>";
    });
    box.innerHTML = h + "</ul>";
    $all("[data-week-day]", box).forEach(function (b) { b.addEventListener("click", function () { openDay = b.getAttribute("data-week-day"); renderDay(); }); });
    $all("[data-week-req]", box).forEach(function (b) {
      b.addEventListener("click", function () {
        var id = b.getAttribute("data-week-req");
        filter = "all"; $all("[data-filter]").forEach(function (x) { x.setAttribute("aria-pressed", String(x.getAttribute("data-filter") === "all")); });
        query = ""; $("[data-admin-search]").value = "";
        renderList();
        var art = $('[data-id="' + id + '"]'); if (art && art.scrollIntoView) { art.scrollIntoView({ block: "start", behavior: "smooth" }); art.classList.add("is-flash"); setTimeout(function () { art.classList.remove("is-flash"); }, 1600); }
      });
    });
  }

  // ---------- calendar ----------
  function nameFor(hold) {
    if (hold.requestId === "manual") return t("adm.manual") + (hold.note ? ": " + hold.note : ""); // from before phone bookings were requests
    var r = byId(hold.requestId);
    return r ? r.name + " (" + t("status." + (r.status || "new")) + ")" : "#" + String(hold.requestId).slice(0, 6).toUpperCase();
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
          var what = b.getAttribute("data-day-act"), p;
          if (what === "toggleClosed") p = B.setDay(openDay, { closed: !day.closed, blockedSlots: blocked });
          else if (what === "block") {
            var id = b.getAttribute("data-slot"), next = blocked.indexOf(id) !== -1 ? blocked.filter(function (x) { return x !== id; }) : blocked.concat([id]);
            p = B.setDay(openDay, { closed: !!day.closed, blockedSlots: next });
          } else if (what === "add") {
            var name = prompt(t("adm.addPrompt"));
            if (name === null || !name.trim()) return;
            var sid = b.getAttribute("data-slot"), sl = AV.slots.filter(function (x) { return x.id === sid; })[0];
            var seg = sl && sl.segments && sl.segments.indexOf("residential") === -1 ? "commercial" : "residential";
            p = B.addPhoneBooking(openDay, sid, name.trim(), seg);
          } else if (what === "drop") {
            if (!confirm(t("adm.removeConfirm"))) return;
            p = B.deleteHold(b.getAttribute("data-hold"));
          }
          if (p) p.catch(fail).then(function () { cal.refresh().then(renderDay); });
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

  // ---------- team ----------
  function renderTeam() {
    var box = $("[data-admin-team-list]");
    box.innerHTML = team.slice().sort(function (a, b) { return (a.role === "owner" ? 0 : 1) - (b.role === "owner" ? 0 : 1) || a.email.localeCompare(b.email); }).map(function (m) {
      var tag = m.role === "owner" ? t("adm.owner") : m.status === "invited" ? t("adm.invited") : t("adm.member");
      var canRemove = m.role !== "owner" && m.uid !== user.uid;
      return '<li><span>' + esc(m.email) + ' <span class="muted">· ' + esc(tag) + "</span></span>" +
        (canRemove ? ' <button type="button" class="link-btn" data-team-remove="' + esc(m.email) + '" data-team-uid="' + esc(m.uid || "") + '">' + esc(t("adm.remove")) + "</button>" : "") + "</li>";
    }).join("");
    $all("[data-team-remove]", box).forEach(function (b) {
      b.addEventListener("click", function () {
        var email = b.getAttribute("data-team-remove");
        if (!confirm(t("adm.removeAdminConfirm", { email: email }))) return;
        b.disabled = true;
        B.removeAdmin({ email: email, uid: b.getAttribute("data-team-uid") }).catch(function (e) { b.disabled = false; fail(e); });
      });
    });
  }
  function mountTeam() {
    $("[data-admin-team]").hidden = !isOwner();
    subs.push(B.watchTeam(function (list, err) {
      if (err) { if (window.console) console.warn(err); return; }
      team = list;
      if (isOwner()) renderTeam();
      renderList();
    }));
  }
  $("[data-admin-team-form]").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var input = $("#adm-invite"), email = input.value.trim().toLowerCase(), msg = $('[data-error="invite"]');
    msg.textContent = "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { msg.textContent = t("err.email"); return; }
    if (team.some(function (m) { return m.email === email; })) { msg.textContent = t("adm.alreadyOnTeam", { addr: email }); return; }
    var btn = ev.target.querySelector("button"); btn.disabled = true;
    B.inviteAdmin(email, user.email).then(function () { input.value = ""; })
      .catch(function (e) { msg.textContent = t("adm.failed"); if (window.console) console.warn(e); })
      .then(function () { btn.disabled = false; });
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

  // ---------- auth ----------
  function stopAll() {
    subs.forEach(function (f) { try { f(); } catch (e) { /* already closed */ } }); subs = [];
    if (recheck) { clearInterval(recheck); recheck = null; }
    if (C.timeclock) C.timeclock.leave();
  }
  function enter(u) {
    user = u;
    $("[data-admin-email]").textContent = u.email + (isOwner() ? " · " + t("adm.owner") : "");
    show("dash");
    if (!cal) mountCal();
    stopAll();
    mountTeam();
    var ct = $('[data-view-tab="credits"]'); if (ct) ct.hidden = !isOwner();
    if (!isOwner() && view === "credits") setView("requests");
    if (C.timeclock) C.timeclock.enter(u, me, function () { return items; });
    subs.push(B.watchRequests(function (list, err) {
      if (err) { if (window.console) console.warn(err); $("[data-admin-empty]").hidden = false; $("[data-admin-empty]").textContent = t("adm.failed"); return; }
      raw = list; merge(); loadOwners(); renderList(); if (openDay) renderDay(); if (C.timeclock) C.timeclock.refresh();
    }));
    subs.push(B.watchCredits(function (list, err) {
      if (err) { if (window.console) console.warn(err); return; }
      ledger = list; recompute(); renderCredits(); renderList();
    }));
    subs.push(B.watchInternal(function (m, err) {
      if (err) { if (window.console) console.warn(err); return; }
      internal = m; merge(); renderList(); if (C.timeclock) C.timeclock.refresh();
    }));
    // Someone removed from the team is signed out here within a couple of minutes.
    recheck = setInterval(function () {
      if (!user) return;
      B.stillAdmin(user.uid).then(function (ok) { if (!ok) leave(true); }).catch(function () { /* offline: try again later */ });
    }, 120000);
  }
  function leave(removed) {
    stopAll();
    user = null; me = null; ledger = []; balances = {}; owners = {}; raw = []; items = []; internal = {}; drafts = {}; team = [];
    document.title = baseTitle;
    B.signOut().then(function () { show("login"); $("[data-admin-notadmin]").hidden = !removed; });
  }
  $("[data-admin-form]").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var email = $("#adm-email").value.trim(), pass = $("#adm-pass").value;
    $('[data-error="login"]').textContent = "";
    B.signInPassword(email, pass).catch(function (e) { $('[data-error="login"]').textContent = t("adm.badLogin"); if (window.console) console.warn(e); });
  });
  $("[data-admin-forgot]").addEventListener("click", function () {
    var email = $("#adm-email").value.trim(), msg = $("[data-admin-forgot-msg]");
    msg.hidden = false;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { msg.textContent = t("acct.needEmail"); $("#adm-email").focus(); return; }
    // Same message either way, so the page never reveals which emails have accounts.
    B.sendReset(email).catch(function (e) { if (window.console) console.warn(e); }).then(function () { msg.textContent = t("acct.resetSent", { addr: email }); });
  });
  $("[data-google-signin]").addEventListener("click", function () {
    var b = this; b.disabled = true; $('[data-error="google"]').textContent = "";
    B.signInGoogle().catch(function (e) { $('[data-error="google"]').textContent = t("acct.googleFailed"); if (window.console) console.warn(e); }).then(function () { b.disabled = false; });
  });
  $("[data-admin-signout]").addEventListener("click", function () { leave(false); });
  document.addEventListener("mkg:langchange", function () { if (user) { renderList(); renderDay(); renderCredits(); if (isOwner()) renderTeam(); } });

  B.ready.then(function (live) {
    if (!live) { $("[data-admin-offline]").hidden = false; $("[data-admin-form] button").disabled = true; $("[data-google-signin]").disabled = true; return; }
    B.onAuth(function (u) {
      if (!u) { if (user) { stopAll(); user = null; } show("login"); return; }
      B.isAdmin(u).then(function (rec) {
        if (rec) { me = rec; $("[data-admin-notadmin]").hidden = true; enter(u); }
        else { show("login"); $("[data-admin-notadmin]").hidden = false; B.signOut(); }
      });
    });
  });
})();
