/*
  Time clock for the team, on admin.html.

  My day: each member sees today's bookings assigned to them, plus confirmed
  ones nobody has been assigned to, each with a Start button that becomes
  End while it runs. Start/End are a clock-in/clock-out tied to that booking.
  If a shift is open on anything not in that list (no booking, yesterday's,
  reassigned), a banner shows it with its own End button, so nobody is ever
  stuck on the clock.

  Team time (owner): per person and in total, for a chosen period: hours
  (overlapping shifts counted once), visits, hours per visit, and revenue per
  hour. A visit is one booking on one day, so a recurring plan cleaned four
  times counts four times; when a crew shares a visit, its price is split by
  each person's hours on it. CSV for payroll, and every shift can be fixed or
  deleted (a forgotten clock-out, say); long and overlapping shifts are flagged.

  admin.js calls MKG.timeclock.enter(user, adminRecord, getRequests) after
  sign-in, refresh() when requests change, and leave() on sign-out.
*/
(function () {
  "use strict";
  var C = window.MKG, I = C && C.i18n, B = C && C.backend, A = C && C.app, Cal = C && C.calendar;
  if (!I || !B || !A || !Cal) return;
  var t = I.t, esc = A.esc, D = B.dates;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $all = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var user = null, me = null, getRequests = function () { return []; };
  var mine = [], team = [], unsubMine = null, unsubTeam = null, tick = null;
  var period = "week", fixing = {}, fixDrafts = {}, allOpen = false;
  var LONG_HOURS = 12;

  function locale() { return I.lang === "es" ? "es-US" : "en-US"; }
  function ms(ts) { return ts ? B.toMs(ts) : 0; }
  function fmtTime(ts) { return ts ? new Date(ms(ts)).toLocaleTimeString(locale(), { hour: "numeric", minute: "2-digit" }) : ""; }
  function fmtDay(ts) { return ts ? new Date(ms(ts)).toLocaleDateString(locale(), { weekday: "short", month: "short", day: "numeric" }) : ""; }
  function span(sh) { var a = ms(sh.inAt); if (!a) return null; var b = sh.outAt ? ms(sh.outAt) : Date.now(); return [a, Math.max(a, b)]; }
  function hours(sh) { var s = span(sh); return s ? (s[1] - s[0]) / 36e5 : 0; }
  function fmtHours(h) { var m = Math.round(h * 60); return Math.floor(m / 60) + "h " + (m % 60 < 10 ? "0" : "") + (m % 60) + "m"; }
  function fmtH(h) { return (Math.round(h * 10) / 10).toFixed(1); }
  function money(n) { return A.dollars(n); }
  function dayOf(ts) { return D.ymd(new Date(ms(ts))); }
  function toLocalInput(ts) { if (!ts) return ""; var d = new Date(ms(ts)); return D.ymd(d) + "T" + D.pad(d.getHours()) + ":" + D.pad(d.getMinutes()); }
  function reqById(id) { return getRequests().filter(function (r) { return r.id === id; })[0]; }
  function jobName(id) { if (!id) return t("tc.noJob"); var r = reqById(id); return r ? (r.name || "?") + (r.date ? " · " + Cal.fmtDate(r.date, { month: "short", day: "numeric" }) : "") : "#" + id.slice(0, 6).toUpperCase(); }
  function price(r) { return typeof r.quotedPrice === "number" ? r.quotedPrice : typeof r.estimatePerVisit === "number" ? r.estimatePerVisit : typeof r.estimateOneVisit === "number" ? r.estimateOneVisit : 0; }
  function serviceText(r) { return r.service || ((r.plan || "") + (r.frequency ? ", " + r.frequency : "")); }
  function weekStart() { var d = new Date(); d = new Date(d.getFullYear(), d.getMonth(), d.getDate()); var dow = (d.getDay() + 6) % 7; return d.getTime() - dow * 864e5; }

  // Bookings to pick from when fixing a shift: this week's and last week's that aren't closed, plus the one already chosen.
  function jobOptions(selected) {
    var today = D.ymd(new Date()), end = D.ymd(D.addDays(new Date(), 7)), from = D.ymd(D.addDays(new Date(), -14));
    var list = getRequests().filter(function (r) { return r.status !== "declined" && r.status !== "cancelled" && r.date && r.date >= from && r.date <= end; })
      .sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    if (selected && !list.some(function (r) { return r.id === selected; })) { var r = reqById(selected); if (r) list.unshift(r); }
    return '<option value="">' + esc(t("tc.noJob")) + "</option>" + list.map(function (r) {
      return '<option value="' + esc(r.id) + '"' + (r.id === selected ? " selected" : "") + ">" + esc((r.name || "?") + " · " + (r.date === today ? t("adm.today") : Cal.fmtDate(r.date, { weekday: "short", month: "short", day: "numeric" })) + (r.slot ? ", " + Cal.slotLabel(r.slot) : "")) + "</option>";
    }).join("");
  }

  // ---------- my day ----------
  function openShift() { return mine.filter(function (s) { return !s.outAt; }).sort(function (a, b) { return ms(b.inAt) - ms(a.inAt); })[0] || null; }
  // Today's jobs: the ones assigned to me (even if not confirmed yet: the owner
  // chose me), then confirmed ones nobody has been assigned to.
  function myDay() {
    var today = D.ymd(new Date()), email = (user.email || "").toLowerCase();
    function bySlot(a, b) { return (a.slot || "zzzz") < (b.slot || "zzzz") ? -1 : 1; }
    var todays = getRequests().filter(function (r) { return r.date === today && r.status !== "declined" && r.status !== "cancelled"; });
    return {
      mine: todays.filter(function (r) { return (r.assignedTo || "").toLowerCase() === email; }).sort(bySlot),
      open: todays.filter(function (r) { return !r.assignedTo && (r.status === "confirmed" || r.status === "done"); }).sort(bySlot),
    };
  }
  function jobCard(r, open) {
    var today = D.ymd(new Date());
    var running = !!open && open.requestId === r.id;
    var todayHrs = mine.filter(function (s) { return s.requestId === r.id && s.outAt && dayOf(s.inAt) === today; }).reduce(function (a, s) { return a + hours(s); }, 0);
    var h = '<li class="tc-job' + (running ? " is-running" : "") + (r.status === "done" && !running ? " is-done" : "") + '">' +
      '<div class="tc-job-head"><b>' + esc(r.slot ? Cal.slotLabel(r.slot) : t("cal.anyWindow")) + "</b> · " + esc(r.name || "?") + (r.company ? " · " + esc(r.company) : "") +
        (r.status === "new" ? " " + '<span class="status status-new">' + esc(t("status.new")) + "</span>" : "") + "</div>" +
      '<div class="muted">' + esc(serviceText(r) + (r.zip ? " · " + r.zip : "")) +
        (r.phone ? ' · <a href="tel:' + esc(r.phone.replace(/[^\d+]/g, "")) + '">' + esc(r.phone) + "</a>" : "") + "</div>" +
      (r.notes ? '<div class="muted tc-job-notes">' + esc(r.notes) + "</div>" : "") +
      (r.replyNote ? '<div class="muted tc-job-notes">' + esc(t("acct.fromUs")) + ": " + esc(r.replyNote) + "</div>" : "");
    // Running wins over Done: a crew-mate may have marked the job done while this shift is still open.
    if (running) h += '<div class="tc-job-act"><span class="tc-dot"></span><b data-tc-elapsed>' + esc(fmtHours(hours(open))) + '</b> <button type="button" class="btn btn-sm" data-tc-end="' + esc(r.id) + '">' + esc(t("tc.end")) + "</button></div>";
    else if (r.status === "done") h += '<div class="tc-job-act"><span class="status status-done">' + esc(t("status.done")) + "</span>" + (todayHrs ? ' <span class="muted">' + esc(fmtHours(todayHrs)) + "</span>" : "") + "</div>";
    else h += '<div class="tc-job-act"><button type="button" class="btn btn-sm' + (open ? " btn-secondary" : "") + '" data-tc-start="' + esc(r.id) + '"' + (open ? " disabled" : "") + ">" + esc(t("tc.start")) + "</button>" + (todayHrs ? ' <span class="muted">' + esc(t("tc.soFar", { time: fmtHours(todayHrs) })) + "</span>" : "") + "</div>";
    return h + "</li>";
  }
  function renderMine() {
    var box = $("[data-tc]"); if (!box) return;
    var open = openShift(), day = myDay(), listed = {};
    day.mine.concat(day.open).forEach(function (r) { listed[r.id] = true; });
    var h = "";
    // Any open shift not shown as a job card below gets its own End button.
    if (open && !(open.requestId && listed[open.requestId])) {
      h += '<p class="tc-status' + (hours(open) > LONG_HOURS ? " is-long" : "") + '"><span class="tc-dot"></span>' + esc(t("tc.inSince", { time: (dayOf(open.inAt) === D.ymd(new Date()) ? "" : fmtDay(open.inAt) + " ") + fmtTime(open.inAt) })) +
        ' <b data-tc-elapsed>' + esc(fmtHours(hours(open))) + "</b>" + (open.requestId ? ' <span class="muted">· ' + esc(jobName(open.requestId)) + "</span>" : "") +
        ' <button type="button" class="btn btn-sm" data-tc-end="' + esc(open.requestId || "") + '">' + esc(open.requestId ? t("tc.end") : t("tc.clockOut")) + "</button></p>";
    }
    if (day.mine.length) h += '<h4 class="tc-sub">' + esc(t("tc.myJobs")) + '</h4><ul class="tc-jobs">' + day.mine.map(function (r) { return jobCard(r, open); }).join("") + "</ul>";
    else h += '<p class="muted">' + esc(t("tc.noJobsToday")) + "</p>";
    if (day.open.length) h += '<h4 class="tc-sub">' + esc(t("tc.unassignedJobs")) + '</h4><ul class="tc-jobs">' + day.open.map(function (r) { return jobCard(r, open); }).join("") + "</ul>";
    if (!open) h += '<p><button type="button" class="link-btn" data-tc-start="">' + esc(t("tc.clockInNoJob")) + "</button></p>";
    var recent = mine.filter(function (s) { return s.outAt; }).sort(function (a, b) { return ms(b.inAt) - ms(a.inAt); }).slice(0, 5);
    if (recent.length) {
      h += '<details class="tc-recent"><summary>' + esc(t("tc.recent")) + '</summary><ul class="tc-list">' + recent.map(function (s) {
        return "<li><span>" + esc(fmtDay(s.inAt) + " · " + fmtTime(s.inAt) + "–" + fmtTime(s.outAt)) + "</span><b>" + esc(fmtHours(hours(s))) + "</b>" + (s.requestId ? '<span class="muted">' + esc(jobName(s.requestId)) + "</span>" : "") + "</li>";
      }).join("") + "</ul></details>";
      var week = weekStart();
      h += '<p class="muted">' + esc(t("tc.thisWeek", { hours: fmtHours(unionHours(mine.filter(function (s) { return ms(s.inAt) >= week; }).map(span).filter(Boolean))) })) + "</p>";
    }
    h += '<p class="field-error" data-tc-err></p>';
    box.innerHTML = h;
    function failed(e) { $("[data-tc-err]", box).textContent = t("adm.failed"); if (window.console) console.warn(e); $all("button", box).forEach(function (x) { x.disabled = false; }); }
    $all("[data-tc-start]", box).forEach(function (b) {
      b.addEventListener("click", function () {
        $all("button", box).forEach(function (x) { x.disabled = true; });
        B.clockIn(user, b.getAttribute("data-tc-start"), "").catch(failed);
      });
    });
    $all("[data-tc-end]", box).forEach(function (b) {
      b.addEventListener("click", function () {
        var id = b.getAttribute("data-tc-end"), r = id ? reqById(id) : null;
        $all("button", box).forEach(function (x) { x.disabled = true; });
        B.clockOut(open.id).then(function () {
          // Only a confirmed job can be finished from here; a crew-mate may already have done it.
          if (r && r.status === "confirmed" && confirm(t("tc.markDone", { name: r.name || "?" }))) {
            return B.updateRequest(r.id, { status: "done" }).then(function () { return B.releaseHolds(r.id); });
          }
        }).catch(failed);
      });
    });
  }
  // Time clocked against a booking's latest visit, from the shifts this viewer can see.
  function timeOnJob(requestId) {
    var src = (me && me.role === "owner" ? team : mine).filter(function (s) { return s.requestId === requestId && ms(s.inAt); });
    if (!src.length) return null;
    var last = src.map(function (s) { return dayOf(s.inAt); }).sort().pop();
    var who = {}, total = 0;
    src.filter(function (s) { return dayOf(s.inAt) === last; }).forEach(function (s) { var h = hours(s); total += h; who[s.email] = (who[s.email] || 0) + h; });
    var names = Object.keys(who).map(function (e) { return e.split("@")[0] + (Object.keys(who).length > 1 ? " " + fmtHours(who[e]) : ""); }).join(", ");
    return t("tc.lastVisit", { time: fmtHours(total), who: names, day: Cal.fmtDate(last, { month: "short", day: "numeric" }) });
  }

  // ---------- numbers ----------
  // Hours covered by a set of [start, end] spans, overlaps counted once.
  function unionHours(spans) {
    var s = spans.slice().sort(function (x, y) { return x[0] - y[0]; }), total = 0, cur = null;
    s.forEach(function (iv) {
      if (!cur) cur = iv.slice();
      else if (iv[0] <= cur[1]) cur[1] = Math.max(cur[1], iv[1]);
      else { total += cur[1] - cur[0]; cur = iv.slice(); }
    });
    if (cur) total += cur[1] - cur[0];
    return total / 36e5;
  }
  // Pure: shifts + a way to look up bookings -> per-person rows and totals.
  function computeStats(shifts, lookup) {
    var people = {}, visits = {};
    shifts.forEach(function (s) {
      var sp = span(s); if (!sp) return;
      var k = s.email || s.uid, p = people[k] = people[k] || { email: k, spans: [], open: 0, visitHours: {} };
      p.spans.push(sp); if (!s.outAt) p.open++;
      if (s.requestId) {
        var v = s.requestId + "|" + D.ymd(new Date(sp[0])), h = (sp[1] - sp[0]) / 36e5;
        p.visitHours[v] = (p.visitHours[v] || 0) + h;
        visits[v] = (visits[v] || 0) + h;
      }
    });
    function visitPrice(v) { var r = lookup(v.split("|")[0]); return r ? price(r) : 0; }
    var rows = Object.keys(people).map(function (k) {
      var p = people[k], vs = Object.keys(p.visitHours);
      p.hours = unionHours(p.spans);
      p.visits = vs.length;
      var onJobs = vs.reduce(function (a, v) { return a + p.visitHours[v]; }, 0);
      p.revenue = vs.reduce(function (a, v) { return a + (visits[v] > 0 ? visitPrice(v) * p.visitHours[v] / visits[v] : 0); }, 0);
      p.hoursPerVisit = p.visits ? onJobs / p.visits : null;
      p.perHour = p.hours > 0 && p.revenue > 0 ? p.revenue / p.hours : null;
      return p;
    }).sort(function (a, b) { return b.hours - a.hours; });
    var vids = Object.keys(visits), crewHours = vids.reduce(function (a, v) { return a + visits[v]; }, 0);
    var totals = { hours: rows.reduce(function (a, p) { return a + p.hours; }, 0), visits: vids.length, revenue: vids.reduce(function (a, v) { return a + visitPrice(v); }, 0) };
    totals.hoursPerVisit = totals.visits ? crewHours / totals.visits : null;
    totals.perHour = totals.hours > 0 && totals.revenue > 0 ? totals.revenue / totals.hours : null;
    return { rows: rows, totals: totals };
  }
  // Shifts that are very long, or that overlap another of the same person's.
  function flagsFor(shifts) {
    var flags = {}, by = {};
    shifts.forEach(function (s) { var sp = span(s); if (!sp) return; (by[s.email || s.uid] = by[s.email || s.uid] || []).push({ id: s.id, sp: sp }); if ((sp[1] - sp[0]) / 36e5 > LONG_HOURS) (flags[s.id] = flags[s.id] || []).push("long"); });
    Object.keys(by).forEach(function (k) {
      var list = by[k].sort(function (a, b) { return a.sp[0] - b.sp[0]; }), end = -1, endId = null;
      list.forEach(function (x) {
        if (x.sp[0] < end) { (flags[x.id] = flags[x.id] || []).push("overlap"); if (endId && (flags[endId] || []).indexOf("overlap") === -1) (flags[endId] = flags[endId] || []).push("overlap"); }
        if (x.sp[1] > end) { end = x.sp[1]; endId = x.id; }
      });
    });
    return flags;
  }

  // ---------- team report (owner) ----------
  function periodFrom() {
    var d = new Date(); d = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if (period === "week") return new Date(weekStart());
    if (period === "7d") return D.addDays(d, -6);
    if (period === "month") return new Date(d.getFullYear(), d.getMonth(), 1);
    return D.addDays(d, -29);
  }
  function startTeam() {
    if (unsubTeam) unsubTeam();
    unsubTeam = B.watchShiftsSince(B.tsFromDate(periodFrom()), function (list, err) {
      if (err) { if (window.console) console.warn(err); var el = $("[data-tc-report]"); if (el) el.innerHTML = '<p class="muted">' + esc(t("adm.failed")) + "</p>"; return; }
      team = list; renderTeam();
    });
  }
  function fixVal(s, k, saved) { var d = fixDrafts[s.id]; return d && d[k] !== undefined ? d[k] : saved; }
  function renderTeam() {
    var box = $("[data-tc-report]"); if (!box) return;
    var st = computeStats(team, reqById), flags = flagsFor(team);
    var h = '<div class="seg admin-filter tc-periods" role="group">' + [["week", "tc.p.week"], ["7d", "tc.p.7d"], ["month", "tc.p.month"], ["30d", "tc.p.30d"]].map(function (p) {
      return '<button type="button" class="seg-btn" data-tc-period="' + p[0] + '" aria-pressed="' + (period === p[0]) + '"><span class="seg-label">' + esc(t(p[1])) + "</span></button>";
    }).join("") + "</div>";
    if (!st.rows.length) h += '<p class="muted">' + esc(t("tc.empty")) + "</p>";
    else {
      h += '<table class="tc-table"><thead><tr><th>' + esc(t("tc.who")) + "</th><th>" + esc(t("tc.hours")) + "</th><th>" + esc(t("tc.jobs")) + "</th><th>" + esc(t("tc.hrsPerJob")) + "</th><th>" + esc(t("tc.perHour")) + "</th></tr></thead><tbody>" +
        st.rows.map(function (p) {
          return "<tr><td>" + esc(p.email.split("@")[0]) + (p.open ? ' <span class="tc-dot" title="' + esc(t("tc.onClock")) + '"></span>' : "") + "</td><td>" + esc(fmtH(p.hours)) + "</td><td>" + p.visits + "</td><td>" +
            (p.hoursPerVisit === null ? "—" : esc(fmtH(p.hoursPerVisit))) + "</td><td>" + (p.perHour === null ? "—" : esc(money(Math.round(p.perHour)))) + "</td></tr>";
        }).join("") + "</tbody></table>";
      var tt = st.totals;
      h += '<p class="muted tc-totals">' + esc(t("tc.totals", { hours: fmtH(tt.hours), jobs: tt.visits, revenue: money(Math.round(tt.revenue)), perHour: tt.perHour === null ? "—" : money(Math.round(tt.perHour)) })) + "</p>";
      h += '<p class="field-hint">' + esc(t("tc.how")) + "</p>";
      h += '<p><button type="button" class="link-btn" data-tc-csv>' + esc(t("tc.csv")) + "</button></p>";
    }
    if (team.length) {
      var nFlag = Object.keys(flags).length;
      h += '<details class="tc-fix" data-tc-all' + (allOpen ? " open" : "") + "><summary>" + esc(t("tc.allShifts", { n: team.length })) + (nFlag ? ' <span class="tc-flag">' + esc(t("tc.flagged", { n: nFlag })) + "</span>" : "") + '</summary><ul class="tc-list">' + team.map(function (s) {
        var fl = (flags[s.id] || []).map(function (f) { return '<span class="tc-flag">' + esc(t(f === "long" ? "tc.flagLong" : "tc.flagOverlap")) + "</span>"; }).join(" ");
        if (fixing[s.id]) {
          return '<li class="tc-fixrow" data-shift="' + esc(s.id) + '"><span>' + esc(s.email) + "</span>" +
            '<label>' + esc(t("tc.in")) + ' <input class="input" type="datetime-local" data-fix="inAt" value="' + esc(fixVal(s, "inAt", toLocalInput(s.inAt))) + '"></label>' +
            '<label>' + esc(t("tc.out")) + ' <input class="input" type="datetime-local" data-fix="outAt" value="' + esc(fixVal(s, "outAt", toLocalInput(s.outAt))) + '"></label>' +
            '<label>' + esc(t("tc.job")) + ' <select class="select" data-fix="requestId">' + jobOptions(fixVal(s, "requestId", s.requestId)) + "</select></label>" +
            '<span class="admin-actions"><button type="button" class="btn btn-sm" data-fix-act="save">' + esc(t("adm.save")) + '</button><button type="button" class="link-btn" data-fix-act="cancel">' + esc(t("tc.cancelFix")) + '</button><button type="button" class="link-btn" data-fix-act="delete">' + esc(t("adm.remove")) + "</button></span></li>";
        }
        return '<li data-shift="' + esc(s.id) + '"><span>' + esc(s.email.split("@")[0] + " · " + fmtDay(s.inAt) + " · " + fmtTime(s.inAt) + "–" + (s.outAt ? fmtTime(s.outAt) : t("tc.open"))) + "</span><b>" + esc(fmtHours(hours(s))) + "</b>" + fl +
          (s.requestId ? '<span class="muted">' + esc(jobName(s.requestId)) + "</span>" : "") + (s.note ? '<span class="muted">' + esc(s.note) + "</span>" : "") +
          ' <button type="button" class="link-btn" data-fix-act="edit">' + esc(t("tc.fix")) + "</button></li>";
      }).join("") + "</ul></details>";
    }
    box.innerHTML = h;
    var all = $("[data-tc-all]", box); if (all) all.addEventListener("toggle", function () { allOpen = all.open; });
    $all("[data-tc-period]", box).forEach(function (b) { b.addEventListener("click", function () { period = b.getAttribute("data-tc-period"); startTeam(); }); });
    var csv = $("[data-tc-csv]", box); if (csv) csv.addEventListener("click", exportCsv);
    $all("[data-fix]", box).forEach(function (f) {
      var id = f.closest("[data-shift]").getAttribute("data-shift");
      function keep() { (fixDrafts[id] = fixDrafts[id] || {})[f.getAttribute("data-fix")] = f.value; }
      f.addEventListener("input", keep); f.addEventListener("change", keep);
    });
    $all("[data-fix-act]", box).forEach(function (b) {
      b.addEventListener("click", function () {
        var li = b.closest("[data-shift]"), id = li.getAttribute("data-shift"), what = b.getAttribute("data-fix-act");
        function done() { delete fixing[id]; delete fixDrafts[id]; }
        if (what === "edit") { fixing[id] = true; renderTeam(); return; }
        if (what === "cancel") { done(); renderTeam(); return; }
        if (what === "delete") { if (!confirm(t("tc.deleteConfirm"))) return; B.deleteShift(id).then(done).catch(failed); return; }
        var inV = $('[data-fix="inAt"]', li).value, outV = $('[data-fix="outAt"]', li).value, job = $('[data-fix="requestId"]', li).value;
        if (!inV) return;
        var patch = { inAt: B.tsFromDate(new Date(inV)), outAt: outV ? B.tsFromDate(new Date(outV)) : null, requestId: job };
        if (patch.outAt && ms(patch.outAt) < ms(patch.inAt)) { alert(t("tc.outBeforeIn")); return; }
        B.updateShift(id, patch).then(done).catch(failed);
      });
    });
    function failed(e) { alert(t("adm.failed")); if (window.console) console.warn(e); }
  }
  function exportCsv() {
    var lines = [["email", "date", "clock in", "clock out", "hours", "job", "job date", "price", "note"].join(",")];
    team.slice().sort(function (a, b) { return ms(a.inAt) - ms(b.inAt); }).forEach(function (s) {
      var r = s.requestId ? reqById(s.requestId) : null;
      var row = [s.email, new Date(ms(s.inAt)).toLocaleDateString("en-US"), fmtTime(s.inAt), s.outAt ? fmtTime(s.outAt) : "", fmtH(hours(s)), r ? r.name : (s.requestId || ""), r ? r.date : "", r ? price(r) : "", s.note || ""];
      // Quote every cell, and stop spreadsheet apps from running a cell that starts with = + - or @.
      lines.push(row.map(function (v) { v = String(v); if (/^[=+\-@]/.test(v)) v = "'" + v; return '"' + v.replace(/"/g, '""') + '"'; }).join(","));
    });
    var blob = new Blob([lines.join("\n")], { type: "text/csv" }), a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "mkg-time-" + period + "-" + D.ymd(new Date()) + ".csv"; document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  // ---------- lifecycle ----------
  function enter(u, rec, getItems) {
    user = u; me = rec; getRequests = getItems || getRequests;
    if (unsubMine) unsubMine();
    unsubMine = B.watchMyShifts(u.uid, function (list, err) { if (err) { if (window.console) console.warn(err); return; } mine = list; renderMine(); });
    var rep = $("[data-tc-report-wrap]"); if (rep) rep.hidden = rec.role !== "owner";
    if (rec.role === "owner") startTeam();
    if (tick) clearInterval(tick);
    tick = setInterval(function () { var o = openShift(); if (o) $all("[data-tc-elapsed]").forEach(function (el) { el.textContent = fmtHours(hours(o)); }); }, 30000);
  }
  function leave() {
    if (unsubMine) { unsubMine(); unsubMine = null; }
    if (unsubTeam) { unsubTeam(); unsubTeam = null; }
    if (tick) { clearInterval(tick); tick = null; }
    user = null; me = null; mine = []; team = []; fixing = {}; fixDrafts = {};
    var box = $("[data-tc]"); if (box) box.innerHTML = "";
    var rep = $("[data-tc-report]"); if (rep) rep.innerHTML = "";
  }
  function refresh() { if (user) { renderMine(); if (me && me.role === "owner") renderTeam(); } }
  document.addEventListener("mkg:langchange", refresh);

  C.timeclock = { enter: enter, leave: leave, refresh: refresh, timeOnJob: timeOnJob, _computeStats: computeStats, _flags: flagsFor };
})();
