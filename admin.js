/*
  admin.html: the owner's view. Sign in with the admin email and password
  (created in the Firebase console), then: every quote request with its
  status, a note and payment link per request, and the calendar with the
  power to close days, block windows, and add bookings taken by phone.
*/
(function () {
  "use strict";
  var C = window.MKG, I = C && C.i18n, B = C && C.backend, A = C && C.app, Cal = C && C.calendar;
  if (!I || !B || !A || !Cal) return;
  var t = I.t, L = I.L, esc = A.esc, D = B.dates;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $all = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var user = null, me = null, items = [], filter = "new", query = "", unsub = null, unsubTeam = null, cal = null, openDay = "";
  var openEdits = {}, savedFlash = {}; // survive the re-render that follows every write
  var AV = C.availability;
  var CLOSED = { done: true, declined: true, cancelled: true };
  var baseTitle = document.title;

  function show(which) { $all("[data-admin]").forEach(function (s) { s.hidden = s.getAttribute("data-admin") !== which; }); }
  function locale() { return I.lang === "es" ? "es-US" : "en-US"; }
  function fmtTs(ts) { return ts ? new Date(B.toMs(ts)).toLocaleString(locale(), { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : ""; }
  function money(n) { return typeof n === "number" ? A.dollars(n) : ""; }
  function slotName(id) { return id ? Cal.slotLabel(id) : ""; }
  // Form values are stored in English; show the translation when one exists.
  function tv(prefix, v) { if (!v) return ""; var k = prefix + "." + v; return I.dictionaries.en[k] !== undefined ? t(k) : v; }
  function pill(s) { return '<span class="status status-' + esc(s) + '">' + esc(t("status." + s)) + "</span>"; }

  // ---------- requests ----------
  function matches(r) {
    if (!query) return true;
    var hay = [r.name, r.email, r.phone, r.zip, r.company, r.id, r.service, r.plan, r.notes, r.adminNotes].join(" ").toLowerCase();
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
  function serviceValue(r) {
    var seg = C.segments[r.segment || "residential"];
    if (r.service) { var s = seg.singleCleans.filter(function (x) { return x.name.en === r.service; })[0]; return s ? "single:" + s.id : ""; }
    var p = seg.plans.filter(function (x) { return x.name.en === r.plan; })[0], f = seg.frequencies.filter(function (x) { return x.label.en === r.frequency; })[0];
    return p ? "plan:" + p.id + ":" + (f ? f.id : "") : "";
  }
  function serviceOptions(r) {
    var seg = C.segments[r.segment || "residential"], cur = serviceValue(r), out = [];
    function opt(v, label) { out.push('<option value="' + esc(v) + '"' + (v === cur ? " selected" : "") + ">" + esc(label) + "</option>"); }
    if (!cur) opt("", r.service || ((r.plan || "") + (r.frequency ? ", " + r.frequency : "")) || "—");
    seg.singleCleans.forEach(function (s) { opt("single:" + s.id, L(s.name)); });
    seg.plans.forEach(function (p) { seg.frequencies.forEach(function (f) { opt("plan:" + p.id + ":" + f.id, L(p.name) + ", " + L(f.label)); }); });
    return out.join("");
  }
  // Turn a service choice back into the fields the quote form would have saved.
  function servicePatch(r, v) {
    var seg = C.segments[r.segment || "residential"], del = B.firebase.firestore.FieldValue.delete(), parts = v.split(":");
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
    if (typeof r.quotedPrice === "number") est = money(r.quotedPrice) + (r.estimatePerVisit !== undefined ? " " + t("acct.perVisit") : "") + " · " + t("acct.priceFinal") + " (" + t("adm.wasEst", { est: est }) + ")";
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
    if (r.notes) details.push([t("review.notes"), esc(r.notes), true]);
    if (r.flooring) details.push([t("adm.flooring"), esc(r.flooring), true]);
    if (r.status === "cancelled") details.push([t("status.cancelled"), esc(r.cancelledBy === "client" ? t("adm.cancelledByClient") : t("adm.cancelledByYou")) + (r.updatedAt ? " · " + esc(fmtTs(r.updatedAt)) : ""), true]);
    var slotOpts = '<option value="">' + esc(t("cal.anyWindow")) + "</option>" + AV.slots.map(function (s) {
      return '<option value="' + esc(s.id) + '"' + (s.id === r.slot ? " selected" : "") + ">" + esc(L(s.label) + " " + (s.time || "")) + "</option>";
    }).join("");
    var s = r.status || "new";
    return '<article class="admin-item" data-id="' + esc(r.id) + '">' +
      '<header><div><b>' + esc(r.name || "?") + "</b> <span class='muted'>#" + esc(r.id.slice(0, 6).toUpperCase()) + " · " + esc(fmtTs(r.createdAt)) + "</span></div>" + pill(s) + "</header>" +
      '<dl class="review">' + details.map(function (x) { return '<div class="review-row"><dt>' + esc(x[0]) + "</dt><dd>" + x[1] + "</dd></div>"; }).join("") + "</dl>" +
      '<div class="admin-actions">' +
        (s !== "confirmed" ? '<button type="button" class="btn btn-sm" data-act="confirmed">' + esc(t("adm.confirm")) + "</button>" : "") +
        (s !== "done" ? '<button type="button" class="btn btn-sm btn-secondary" data-act="done">' + esc(t("adm.markDone")) + "</button>" : "") +
        (s !== "declined" && !CLOSED[s] ? '<button type="button" class="btn btn-sm btn-secondary" data-act="declined">' + esc(t("adm.decline")) + "</button>" : "") +
        (CLOSED[s] ? '<button type="button" class="btn btn-sm btn-secondary" data-act="new">' + esc(t("adm.reopen")) + "</button>" : "") +
      "</div>" +
      '<details class="admin-edit"' + (openEdits[r.id] ? " open" : "") + "><summary>" + esc(t("adm.edit")) + "</summary>" +
        '<div class="two-up"><div class="field"><label>' + esc(t("adm.date")) + '</label><input class="input" type="date" data-f="date" value="' + esc(r.date || "") + '"></div>' +
        '<div class="field"><label>' + esc(t("adm.window")) + '</label><select class="select" data-f="slot">' + slotOpts + "</select></div></div>" +
        '<div class="two-up"><div class="field"><label>' + esc(t("adm.service")) + '</label><select class="select" data-f="serviceChoice">' + serviceOptions(r) + "</select></div>" +
        '<div class="field"><label>' + esc(t("adm.finalPrice")) + '</label><input class="input" type="number" min="0" step="1" inputmode="decimal" data-f="quotedPrice" value="' + (typeof r.quotedPrice === "number" ? r.quotedPrice : "") + '" placeholder="' + esc(t("adm.finalPriceHint")) + '"></div></div>' +
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
    renderUpcoming();
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
          var patch = {}, date = "", slot = "";
          $all("[data-f]", art).forEach(function (f) {
            var k = f.getAttribute("data-f"), v = f.value.trim();
            if (k === "date") date = v;
            else if (k === "slot") slot = v;
            else if (k === "serviceChoice") { if (v && v !== serviceValue(r)) Object.assign(patch, servicePatch(r, v)); }
            else if (k === "quotedPrice") patch.quotedPrice = v === "" ? B.firebase.firestore.FieldValue.delete() : Number(v);
            else patch[k] = v;
          });
          var moved = date !== (r.date || "") || slot !== (r.slot || "");
          p = B.updateRequest(id, patch).then(function () {
            return moved ? B.reschedule(r, date, slot) : null;
          }).then(function () {
            savedFlash[id] = true; var m = $('[data-id="' + id + '"] [data-saved]'); if (m) m.textContent = t("adm.saved");
            setTimeout(function () { delete savedFlash[id]; var m2 = $('[data-id="' + id + '"] [data-saved]'); if (m2) m2.textContent = ""; }, 2500);
          });
        } else {
          p = B.updateRequest(id, { status: act }).then(function () {
            if (act === "declined" || act === "done") return B.releaseHolds(id);
            if (act === "confirmed" || act === "new") return B.ensureHold(r);
            return null;
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
  $("[data-admin-search]").addEventListener("input", function (ev) { query = ev.target.value.trim().toLowerCase(); renderList(); });

  // ---------- the week ahead ----------
  // Every open request with a date in the next 7 days, soonest first.
  function renderUpcoming() {
    var box = $("[data-admin-upcoming]");
    var today = D.ymd(new Date()), end = D.ymd(D.addDays(new Date(), 7));
    var list = items.filter(function (r) { return !CLOSED[r.status] && r.date && r.date >= today && r.date <= end; })
      .sort(function (a, b) { return (a.date + (a.slot || "zzzz")) < (b.date + (b.slot || "zzzz")) ? -1 : 1; });
    if (!list.length) { box.innerHTML = '<p class="muted">' + esc(t("adm.weekEmpty")) + "</p>"; return; }
    var h = "", lastDay = "";
    list.forEach(function (r) {
      if (r.date !== lastDay) { h += (lastDay ? "</ul>" : "") + '<h4 class="admin-week-day"><button type="button" class="link-btn" data-week-day="' + esc(r.date) + '">' + esc(r.date === today ? t("adm.today") : Cal.fmtDate(r.date, { weekday: "short", month: "short", day: "numeric" })) + "</button></h4><ul>"; lastDay = r.date; }
      h += '<li><button type="button" class="link-btn" data-week-req="' + esc(r.id) + '">' + esc(r.name || "?") + "</button> · " + esc(r.slot ? slotName(r.slot) : t("cal.anyWindow")) + " · " + pill(r.status || "new") + "</li>";
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

  // ---------- team (owner only) ----------
  function renderTeam(list) {
    var box = $("[data-admin-team-list]");
    box.innerHTML = list.sort(function (a, b) { return (a.role === "owner" ? 0 : 1) - (b.role === "owner" ? 0 : 1) || a.email.localeCompare(b.email); }).map(function (m) {
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
        B.removeAdmin({ email: email, uid: b.getAttribute("data-team-uid") }).catch(function (e) { alert(t("adm.failed")); if (window.console) console.warn(e); b.disabled = false; });
      });
    });
  }
  function mountTeam() {
    var panel = $("[data-admin-team]");
    panel.hidden = me.role !== "owner";
    if (unsubTeam) { unsubTeam(); unsubTeam = null; }
    if (me.role !== "owner") return;
    unsubTeam = B.watchTeam(function (list, err) { if (err) { if (window.console) console.warn(err); return; } renderTeam(list); });
  }
  $("[data-admin-team-form]").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var input = $("#adm-invite"), email = input.value.trim().toLowerCase(), msg = $('[data-error="invite"]');
    msg.textContent = "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { msg.textContent = t("err.email"); return; }
    var btn = ev.target.querySelector("button"); btn.disabled = true;
    B.inviteAdmin(email, user.email).then(function () { input.value = ""; })
      .catch(function (e) { msg.textContent = t("adm.failed"); if (window.console) console.warn(e); })
      .then(function () { btn.disabled = false; });
  });

  // ---------- auth ----------
  function enter(u) {
    user = u;
    $("[data-admin-email]").textContent = u.email + (me.role === "owner" ? " · " + t("adm.owner") : "");
    show("dash");
    if (!cal) mountCal();
    mountTeam();
    if (unsub) unsub();
    unsub = B.watchRequests(function (list, err) {
      if (err) { if (window.console) console.warn(err); $("[data-admin-empty]").hidden = false; $("[data-admin-empty]").textContent = t("adm.failed"); return; }
      items = list; renderList(); if (openDay) renderDay();
    });
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
  $("[data-admin-signout]").addEventListener("click", function () { if (unsub) { unsub(); unsub = null; } if (unsubTeam) { unsubTeam(); unsubTeam = null; } me = null; document.title = baseTitle; B.signOut().then(function () { show("login"); }); });
  document.addEventListener("mkg:langchange", function () { if (user) { renderList(); renderDay(); } });

  B.ready.then(function (live) {
    if (!live) { $("[data-admin-offline]").hidden = false; $("[data-admin-form] button").disabled = true; $("[data-google-signin]").disabled = true; return; }
    B.onAuth(function (u) {
      if (!u) { show("login"); return; }
      B.isAdmin(u).then(function (rec) {
        if (rec) { me = rec; $("[data-admin-notadmin]").hidden = true; enter(u); }
        else { show("login"); $("[data-admin-notadmin]").hidden = false; B.signOut(); }
      });
    });
  });
})();
