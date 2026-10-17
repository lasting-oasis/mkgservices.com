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
    return query.split(/\s+/).every(function (w) { return !w || hay.indexOf(w) !== -1; });
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
    if (r.notes) details.push([t("review.notes"), esc(r.notes)]);
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
    if (what === "delete" && !confirm(t("adm.deleteConfirm", { name: r.name || "?" }))) return;
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
    } else {
      b.disabled = true;
      p = B.updateRequest(id, { status: what }).then(function () {
        if (CLOSED[what]) return B.releaseHolds(id);
        return B.ensureHold(Object.assign({}, r, { status: what }));
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
    if (C.timeclock) C.timeclock.enter(u, me, function () { return items; });
    subs.push(B.watchRequests(function (list, err) {
      if (err) { if (window.console) console.warn(err); $("[data-admin-empty]").hidden = false; $("[data-admin-empty]").textContent = t("adm.failed"); return; }
      raw = list; merge(); renderList(); if (openDay) renderDay(); if (C.timeclock) C.timeclock.refresh();
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
    user = null; me = null; raw = []; items = []; internal = {}; drafts = {}; team = [];
    document.title = baseTitle;
    B.signOut().then(function () { show("login"); $("[data-admin-notadmin]").hidden = !removed; });
  }
  $("[data-admin-form]").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var email = $("#adm-email").value.trim(), pass = $("#adm-pass").value;
    $('[data-error="login"]').textContent = "";
    B.signInPassword(email, pass).catch(function (e) { $('[data-error="login"]').textContent = t("adm.badLogin"); if (window.console) console.warn(e); });
  });
  $("[data-google-signin]").addEventListener("click", function () {
    var b = this; b.disabled = true; $('[data-error="google"]').textContent = "";
    B.signInGoogle().catch(function (e) { $('[data-error="google"]').textContent = t("acct.googleFailed"); if (window.console) console.warn(e); }).then(function () { b.disabled = false; });
  });
  $("[data-admin-signout]").addEventListener("click", function () { leave(false); });
  document.addEventListener("mkg:langchange", function () { if (user) { renderList(); renderDay(); if (isOwner()) renderTeam(); } });

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
