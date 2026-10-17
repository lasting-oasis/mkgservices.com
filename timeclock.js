/*
  Time clock for the team, on admin.html.

  Every team member can clock in, say which booking they're on, and clock
  out; their own recent shifts are listed under the clock. The owner also
  gets "Team time": per person, hours, jobs, hours per job and revenue per
  hour for a chosen period, a CSV for payroll, and the power to fix or
  delete any shift (someone forgot to clock out, say).

  admin.js calls MKG.timeclock.enter(user, adminRecord, getRequests) after
  sign-in and MKG.timeclock.leave() on sign-out.
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
  var period = "week", fixing = {};

  function locale() { return I.lang === "es" ? "es-US" : "en-US"; }
  function ms(ts) { return ts ? B.toMs(ts) : 0; }
  function fmtTime(ts) { return ts ? new Date(ms(ts)).toLocaleTimeString(locale(), { hour: "numeric", minute: "2-digit" }) : ""; }
  function fmtDay(ts) { return ts ? new Date(ms(ts)).toLocaleDateString(locale(), { weekday: "short", month: "short", day: "numeric" }) : ""; }
  function hours(sh) { var a = ms(sh.inAt); if (!a) return 0; var b = sh.outAt ? ms(sh.outAt) : Date.now(); return Math.max(0, b - a) / 36e5; }
  function fmtHours(h) { var m = Math.round(h * 60); return Math.floor(m / 60) + "h " + (m % 60 < 10 ? "0" : "") + (m % 60) + "m"; }
  function fmtH(h) { return (Math.round(h * 10) / 10).toFixed(1); }
  function money(n) { return A.dollars(n); }
  function toLocalInput(ts) { if (!ts) return ""; var d = new Date(ms(ts)); return d.getFullYear() + "-" + D.pad(d.getMonth() + 1) + "-" + D.pad(d.getDate()) + "T" + D.pad(d.getHours()) + ":" + D.pad(d.getMinutes()); }
  function reqById(id) { return getRequests().filter(function (r) { return r.id === id; })[0]; }
  function jobName(id) { if (!id) return t("tc.noJob"); var r = reqById(id); return r ? r.name + (r.date ? " · " + Cal.fmtDate(r.date, { month: "short", day: "numeric" }) : "") : "#" + id.slice(0, 6).toUpperCase(); }
  function price(r) { return typeof r.quotedPrice === "number" ? r.quotedPrice : typeof r.estimatePerVisit === "number" ? r.estimatePerVisit : typeof r.estimateOneVisit === "number" ? r.estimateOneVisit : 0; }

  // Bookings worth clocking against: today's and this week's that aren't closed, plus whichever is already chosen.
  function jobOptions(selected) {
    var today = D.ymd(new Date()), end = D.ymd(D.addDays(new Date(), 7)), from = D.ymd(D.addDays(new Date(), -1));
    var list = getRequests().filter(function (r) { return r.status !== "declined" && r.status !== "cancelled" && r.date && r.date >= from && r.date <= end; })
      .sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    if (selected && !list.some(function (r) { return r.id === selected; })) { var r = reqById(selected); if (r) list.unshift(r); }
    return '<option value="">' + esc(t("tc.noJob")) + "</option>" + list.map(function (r) {
      return '<option value="' + esc(r.id) + '"' + (r.id === selected ? " selected" : "") + ">" + esc(r.name + " · " + (r.date === today ? t("adm.today") : Cal.fmtDate(r.date, { weekday: "short", month: "short", day: "numeric" })) + (r.slot ? ", " + Cal.slotLabel(r.slot) : "")) + "</option>";
    }).join("");
  }

  // ---------- my clock ----------
  function openShift() { return mine.filter(function (s) { return !s.outAt; }).sort(function (a, b) { return ms(b.inAt) - ms(a.inAt); })[0] || null; }
  function renderMine() {
    var box = $("[data-tc]"); if (!box) return;
    var open = openShift();
    // Keep what's being typed if a re-render lands mid-sentence.
    var typedNote = $("[data-tc-note]", box), typedJob = $("[data-tc-job]", box);
    if (open) { if (typedNote && typedNote.value.trim() !== (open.note || "")) open = Object.assign({}, open, { note: typedNote.value }); }
    var keepJob = !open && typedJob ? typedJob.value : "";
    var h = "";
    if (open) {
      h += '<p class="tc-status"><span class="tc-dot"></span>' + esc(t("tc.inSince", { time: fmtTime(open.inAt) })) + ' <b data-tc-elapsed>' + esc(fmtHours(hours(open))) + "</b></p>";
      h += '<div class="field"><label>' + esc(t("tc.job")) + '</label><select class="select" data-tc-job>' + jobOptions(open.requestId) + "</select></div>";
      h += '<div class="field"><label>' + esc(t("tc.note")) + '</label><input class="input" data-tc-note value="' + esc(open.note || "") + '" placeholder="' + esc(t("tc.noteHint")) + '"></div>';
      h += '<p><button type="button" class="btn btn-sm" data-tc-act="out">' + esc(t("tc.clockOut")) + "</button></p>";
    } else {
      h += '<div class="field"><label>' + esc(t("tc.job")) + '</label><select class="select" data-tc-job>' + jobOptions(keepJob) + "</select></div>";
      h += '<div class="field"><label>' + esc(t("tc.note")) + '</label><input class="input" data-tc-note value="' + esc(typedNote ? typedNote.value : "") + '" placeholder="' + esc(t("tc.noteHint")) + '"></div>';
      h += '<p><button type="button" class="btn btn-sm" data-tc-act="in">' + esc(t("tc.clockIn")) + "</button></p>";
    }
    var recent = mine.filter(function (s) { return s.outAt; }).sort(function (a, b) { return ms(b.inAt) - ms(a.inAt); }).slice(0, 7);
    if (recent.length) {
      h += '<h4 class="tc-sub">' + esc(t("tc.recent")) + "</h4><ul class=\"tc-list\">" + recent.map(function (s) {
        return "<li><span>" + esc(fmtDay(s.inAt) + " · " + fmtTime(s.inAt) + "–" + fmtTime(s.outAt)) + "</span><b>" + esc(fmtHours(hours(s))) + "</b>" + (s.requestId ? '<span class="muted">' + esc(jobName(s.requestId)) + "</span>" : "") + "</li>";
      }).join("") + "</ul>";
      var week = weekStart(), wk = mine.filter(function (s) { return ms(s.inAt) >= week; }).reduce(function (a, s) { return a + hours(s); }, 0);
      h += '<p class="muted">' + esc(t("tc.thisWeek", { hours: fmtHours(wk) })) + "</p>";
    }
    h += '<p class="field-error" data-tc-err></p>';
    box.innerHTML = h;
    var b = $("[data-tc-act]", box);
    b.addEventListener("click", function () {
      var job = $("[data-tc-job]", box).value, note = $("[data-tc-note]", box).value.trim();
      b.disabled = true; $("[data-tc-err]", box).textContent = "";
      var p = b.getAttribute("data-tc-act") === "in" ? B.clockIn(user, job, note) : B.clockOut(open.id, job, note);
      p.catch(function (e) { $("[data-tc-err]", box).textContent = t("adm.failed"); if (window.console) console.warn(e); b.disabled = false; });
    });
    if (open) { $("[data-tc-job]", box).addEventListener("change", function (ev) { B.updateShift(open.id, { requestId: ev.target.value }); }); }
  }
  function weekStart() { var d = new Date(); d = new Date(d.getFullYear(), d.getMonth(), d.getDate()); var dow = (d.getDay() + 6) % 7; return d.getTime() - dow * 864e5; }

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
  function stats() {
    var by = {};
    team.forEach(function (s) {
      var k = s.email || s.uid; var p = by[k] = by[k] || { email: k, shifts: 0, hours: 0, jobs: {}, open: 0 };
      p.shifts++; p.hours += hours(s); if (!s.outAt) p.open++;
      if (s.requestId) p.jobs[s.requestId] = true;
    });
    return Object.keys(by).map(function (k) {
      var p = by[k], ids = Object.keys(p.jobs);
      p.jobCount = ids.length;
      p.revenue = ids.reduce(function (a, id) { var r = reqById(id); return a + (r ? price(r) : 0); }, 0);
      p.hoursPerJob = p.jobCount ? p.hours / p.jobCount : null;
      p.perHour = p.hours > 0 && p.revenue ? p.revenue / p.hours : null;
      return p;
    }).sort(function (a, b) { return b.hours - a.hours; });
  }
  function renderTeam() {
    var box = $("[data-tc-report]"); if (!box) return;
    var rows = stats();
    var h = '<div class="seg admin-filter tc-periods" role="group">' + [["week", "tc.p.week"], ["7d", "tc.p.7d"], ["month", "tc.p.month"], ["30d", "tc.p.30d"]].map(function (p) {
      return '<button type="button" class="seg-btn" data-tc-period="' + p[0] + '" aria-pressed="' + (period === p[0]) + '"><span class="seg-label">' + esc(t(p[1])) + "</span></button>";
    }).join("") + "</div>";
    if (!rows.length) h += '<p class="muted">' + esc(t("tc.empty")) + "</p>";
    else {
      h += '<table class="tc-table"><thead><tr><th>' + esc(t("tc.who")) + "</th><th>" + esc(t("tc.hours")) + "</th><th>" + esc(t("tc.jobs")) + "</th><th>" + esc(t("tc.hrsPerJob")) + "</th><th>" + esc(t("tc.perHour")) + "</th></tr></thead><tbody>" +
        rows.map(function (p) {
          return "<tr><td>" + esc(p.email) + (p.open ? ' <span class="tc-dot" title="' + esc(t("tc.onClock")) + '"></span>' : "") + "</td><td>" + esc(fmtH(p.hours)) + "</td><td>" + p.jobCount + "</td><td>" +
            (p.hoursPerJob === null ? "—" : esc(fmtH(p.hoursPerJob))) + "</td><td>" + (p.perHour === null ? "—" : esc(money(Math.round(p.perHour)))) + "</td></tr>";
        }).join("") + "</tbody></table>";
      var tot = rows.reduce(function (a, p) { a.h += p.hours; a.j += p.jobCount; a.r += p.revenue; return a; }, { h: 0, j: 0, r: 0 });
      h += '<p class="muted tc-totals">' + esc(t("tc.totals", { hours: fmtH(tot.h), jobs: tot.j, revenue: money(Math.round(tot.r)) })) + "</p>";
      h += '<p class="field-hint">' + esc(t("tc.how")) + "</p>";
      h += '<p><button type="button" class="link-btn" data-tc-csv>' + esc(t("tc.csv")) + "</button></p>";
    }
    // Every shift in the period, editable.
    if (team.length) {
      h += '<details class="tc-fix"><summary>' + esc(t("tc.allShifts", { n: team.length })) + "</summary><ul class=\"tc-list\">" + team.map(function (s) {
        if (fixing[s.id]) {
          return '<li class="tc-fixrow" data-shift="' + esc(s.id) + '"><span>' + esc(s.email) + "</span>" +
            '<label>' + esc(t("tc.in")) + ' <input class="input" type="datetime-local" data-fix="inAt" value="' + toLocalInput(s.inAt) + '"></label>' +
            '<label>' + esc(t("tc.out")) + ' <input class="input" type="datetime-local" data-fix="outAt" value="' + toLocalInput(s.outAt) + '"></label>' +
            '<label>' + esc(t("tc.job")) + ' <select class="select" data-fix="requestId">' + jobOptions(s.requestId) + "</select></label>" +
            '<span class="admin-actions"><button type="button" class="btn btn-sm" data-fix-act="save">' + esc(t("adm.save")) + '</button><button type="button" class="link-btn" data-fix-act="cancel">' + esc(t("tc.cancelFix")) + '</button><button type="button" class="link-btn" data-fix-act="delete">' + esc(t("adm.remove")) + "</button></span></li>";
        }
        return '<li data-shift="' + esc(s.id) + '"><span>' + esc(s.email + " · " + fmtDay(s.inAt) + " · " + fmtTime(s.inAt) + "–" + (s.outAt ? fmtTime(s.outAt) : t("tc.open"))) + "</span><b>" + esc(fmtHours(hours(s))) + "</b>" +
          (s.requestId ? '<span class="muted">' + esc(jobName(s.requestId)) + "</span>" : "") + (s.note ? '<span class="muted">' + esc(s.note) + "</span>" : "") +
          ' <button type="button" class="link-btn" data-fix-act="edit">' + esc(t("tc.fix")) + "</button></li>";
      }).join("") + "</ul></details>";
    }
    box.innerHTML = h;
    $all("[data-tc-period]", box).forEach(function (b) { b.addEventListener("click", function () { period = b.getAttribute("data-tc-period"); startTeam(); }); });
    var csv = $("[data-tc-csv]", box); if (csv) csv.addEventListener("click", exportCsv);
    $all("[data-fix-act]", box).forEach(function (b) {
      b.addEventListener("click", function () {
        var li = b.closest("[data-shift]"), id = li.getAttribute("data-shift"), act = b.getAttribute("data-fix-act");
        if (act === "edit") { fixing[id] = true; renderTeam(); return; }
        if (act === "cancel") { delete fixing[id]; renderTeam(); return; }
        if (act === "delete") { if (!confirm(t("tc.deleteConfirm"))) return; B.deleteShift(id).then(function () { delete fixing[id]; }).catch(fail); return; }
        var inV = $('[data-fix="inAt"]', li).value, outV = $('[data-fix="outAt"]', li).value, job = $('[data-fix="requestId"]', li).value;
        if (!inV) return;
        var patch = { inAt: B.tsFromDate(new Date(inV)), outAt: outV ? B.tsFromDate(new Date(outV)) : null, requestId: job };
        if (patch.outAt && ms(patch.outAt) < ms(patch.inAt)) { alert(t("tc.outBeforeIn")); return; }
        B.updateShift(id, patch).then(function () { delete fixing[id]; }).catch(fail);
      });
    });
    function fail(e) { alert(t("adm.failed")); if (window.console) console.warn(e); }
  }
  function exportCsv() {
    var lines = [["email", "date", "clock in", "clock out", "hours", "job", "job date", "price", "note"].join(",")];
    team.slice().sort(function (a, b) { return ms(a.inAt) - ms(b.inAt); }).forEach(function (s) {
      var r = s.requestId ? reqById(s.requestId) : null;
      var row = [s.email, new Date(ms(s.inAt)).toLocaleDateString("en-US"), fmtTime(s.inAt), s.outAt ? fmtTime(s.outAt) : "", fmtH(hours(s)), r ? r.name : (s.requestId || ""), r ? r.date : "", r ? price(r) : "", s.note || ""];
      lines.push(row.map(function (v) { v = String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(","));
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
    tick = setInterval(function () { var el = $("[data-tc-elapsed]"), o = openShift(); if (el && o) el.textContent = fmtHours(hours(o)); }, 30000);
  }
  function leave() {
    if (unsubMine) { unsubMine(); unsubMine = null; }
    if (unsubTeam) { unsubTeam(); unsubTeam = null; }
    if (tick) { clearInterval(tick); tick = null; }
    user = null; me = null; mine = []; team = [];
  }
  function refresh() { if (user) { renderMine(); if (me && me.role === "owner") renderTeam(); } }
  document.addEventListener("mkg:langchange", refresh);

  C.timeclock = { enter: enter, leave: leave, refresh: refresh };
})();
