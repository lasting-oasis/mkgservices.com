/*
  Booking calendar: a month grid showing which start windows are still open,
  built from MKG.availability (plans.js) plus the live holds and days-off in
  Firebase (backend.js). Used read-only on availability.html and as a picker
  in the quote flow and on admin.html.

    var cal = MKG.calendar.mount(element, {
      segment: "residential",         // which windows to show
      pickable: true,                 // let the visitor choose a date + window
      value: { date: "", slot: "" },  // current choice
      onChange: function (v) {},      // called with { date, slot }
      admin: false                    // show taken counts even when full, no lead time
    });
    cal.refresh();   // re-read holds (after a change)
*/
(function () {
  "use strict";
  var C = window.MKG = window.MKG || {};
  var I = C.i18n, B = C.backend;
  if (!I || !B) return;
  var t = I.t, L = I.L, D = B.dates;
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function locale() { return I.lang === "es" ? "es-US" : "en-US"; }
  function fmtDate(ymd, opts) { return D.parse(ymd).toLocaleDateString(locale(), opts || { weekday: "long", month: "long", day: "numeric" }); }
  function monthName(y, m) { return new Date(y, m, 1).toLocaleDateString(locale(), { month: "long", year: "numeric" }); }

  function mount(root, opts) {
    opts = opts || {};
    var AV = C.availability || { capacity: 1, weekdays: [1, 2, 3, 4, 5], leadDays: 1, horizonDays: 60, slots: [] };
    var segment = opts.segment || C.segment || "residential";
    var value = { date: (opts.value && opts.value.date) || "", slot: (opts.value && opts.value.slot) || "" };
    var today = new Date(); today = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    var first = opts.admin ? today : D.addDays(today, AV.leadDays || 0);
    var last = D.addDays(today, opts.admin ? 365 : (AV.horizonDays || 60));
    var view = value.date ? D.parse(value.date) : first;
    var vy = view.getFullYear(), vm = view.getMonth();
    var cache = {}, live = null, holds = [], days = {};
    var open = value.date || ""; // the day whose windows are listed

    function slots() { return AV.slots.filter(function (s) { return !s.segments || s.segments.indexOf(segment) !== -1; }); }
    function slotById(id) { for (var i = 0; i < AV.slots.length; i++) if (AV.slots[i].id === id) return AV.slots[i]; return null; }
    function key(y, m) { return y + "-" + D.pad(m + 1); }
    function inRange(d) { return d >= first && d <= last; }
    function workday(d) { return (AV.weekdays || []).indexOf(d.getDay()) !== -1; }

    // Per-window numbers for one day.
    function dayInfo(ymd) {
      var d = D.parse(ymd), info = { date: ymd, closed: false, windows: [], openCount: 0, bookable: false };
      var day = days[ymd] || {};
      info.closed = !!day.closed || !workday(d);
      slots().forEach(function (s) {
        var taken = holds.filter(function (h) { return h.date === ymd && h.slot === s.id; }).length;
        var blocked = info.closed || (day.blockedSlots || []).indexOf(s.id) !== -1;
        var left = Math.max(0, (AV.capacity || 1) - taken);
        var w = { slot: s, taken: taken, left: blocked ? 0 : left, blocked: blocked, full: !blocked && left === 0 };
        if (w.left > 0) info.openCount++;
        info.windows.push(w);
      });
      info.bookable = inRange(d) && !info.closed && info.openCount > 0;
      return info;
    }

    function load() {
      var k = key(vy, vm);
      if (cache[k]) { apply(cache[k]); return Promise.resolve(); }
      var from = key(vy, vm) + "-01", to = key(vy, vm) + "-31";
      return B.availability(from, to).then(function (r) { cache[k] = r; apply(r); }).catch(function () { apply({ live: false, holds: [], days: {} }); });
    }
    function apply(r) {
      live = r.live;
      // Keep holds from every month seen so far (other months' entries are harmless).
      holds = holds.filter(function (h) { return h.date.slice(0, 7) !== key(vy, vm); }).concat(r.holds);
      Object.keys(r.days).forEach(function (d) { days[d] = r.days[d]; });
      render();
    }

    function render() {
      var firstOfMonth = new Date(vy, vm, 1);
      var startPad = firstOfMonth.getDay();
      var count = new Date(vy, vm + 1, 0).getDate();
      var canPrev = new Date(vy, vm, 1) > new Date(first.getFullYear(), first.getMonth(), 1);
      var canNext = new Date(vy, vm + 1, 1) <= last;
      var wd = [];
      for (var i = 0; i < 7; i++) wd.push(new Date(2023, 0, 1 + i).toLocaleDateString(locale(), { weekday: "short" }).replace(".", ""));

      var html = '<div class="cal">' +
        '<div class="cal-head">' +
          '<button type="button" class="cal-nav" data-cal-prev aria-label="' + esc(t("cal.prev")) + '"' + (canPrev ? "" : " disabled") + '>&lsaquo;</button>' +
          '<h3 class="cal-month" aria-live="polite">' + esc(monthName(vy, vm)) + "</h3>" +
          '<button type="button" class="cal-nav" data-cal-next aria-label="' + esc(t("cal.next")) + '"' + (canNext ? "" : " disabled") + '>&rsaquo;</button>' +
        "</div>" +
        '<div class="cal-grid" role="grid">' +
          wd.map(function (w) { return '<div class="cal-wd" role="columnheader">' + esc(w) + "</div>"; }).join("");
      for (var p = 0; p < startPad; p++) html += '<div class="cal-cell is-pad" aria-hidden="true"></div>';
      for (var dnum = 1; dnum <= count; dnum++) {
        var d = new Date(vy, vm, dnum), ymd = D.ymd(d), info = dayInfo(ymd);
        var cls = "cal-cell", state, label;
        if (!inRange(d) && !opts.admin) { cls += " is-off"; state = ""; }
        else if (info.closed) { cls += " is-closed"; state = t("cal.closed"); }
        else if (info.openCount === 0) { cls += " is-full"; state = t("cal.full"); }
        else if (info.openCount < info.windows.length) { cls += " is-few"; state = t("cal.open", { n: info.openCount }); }
        else { cls += " is-open"; state = t("cal.open", { n: info.openCount }); }
        if (ymd === D.ymd(today)) cls += " is-today";
        if (ymd === value.date) cls += " is-selected";
        if (ymd === open) cls += " is-active";
        var clickable = opts.admin ? true : info.bookable;
        var showState = !!state && (inRange(d) || opts.admin);
        label = fmtDate(ymd) + (showState ? ", " + state : "");
        html += '<button type="button" class="' + cls + '" data-cal-day="' + ymd + '" aria-label="' + esc(label) + '"' +
          (clickable ? "" : " disabled") + (ymd === value.date ? ' aria-pressed="true"' : "") + ">" +
          '<span class="cal-num">' + dnum + "</span>" + (showState ? '<span class="cal-state">' + esc(state) + "</span>" : "") + "</button>";
      }
      html += "</div>";
      html += '<div class="cal-legend"><span><i class="is-open"></i>' + esc(t("cal.legend.open")) + '</span><span><i class="is-few"></i>' + esc(t("cal.legend.few")) + '</span><span><i class="is-full"></i>' + esc(t("cal.legend.full")) + "</span></div>";
      if (live === false) html += '<p class="notice cal-offline">' + esc(t("cal.offline")) + "</p>";
      html += '<div class="cal-day" data-cal-windows>' + windowsHtml() + "</div></div>";
      // Redrawing replaces every button; keep the keyboard where it was.
      var active = document.activeElement, keep = null;
      if (active && root.contains(active)) {
        keep = active.hasAttribute("data-cal-day") ? '[data-cal-day="' + active.getAttribute("data-cal-day") + '"]'
          : active.hasAttribute("data-cal-slot") ? '[data-cal-slot="' + active.getAttribute("data-cal-slot") + '"]'
          : active.hasAttribute("data-cal-prev") ? "[data-cal-prev]" : active.hasAttribute("data-cal-next") ? "[data-cal-next]" : ".cal-month";
      }
      root.innerHTML = html;
      if (keep) {
        var again = root.querySelector(keep);
        if (!again || again.disabled) { again = root.querySelector(".cal-month"); if (again) again.setAttribute("tabindex", "-1"); }
        if (again && again.focus) again.focus({ preventScroll: true });
      }

      root.querySelector("[data-cal-prev]").addEventListener("click", function () { vm--; if (vm < 0) { vm = 11; vy--; } load(); });
      root.querySelector("[data-cal-next]").addEventListener("click", function () { vm++; if (vm > 11) { vm = 0; vy++; } load(); });
      Array.prototype.forEach.call(root.querySelectorAll("[data-cal-day]"), function (b) {
        b.addEventListener("click", function () {
          open = b.getAttribute("data-cal-day");
          if (opts.pickable && !opts.admin) { value.date = open; value.slot = ""; emit(); }
          render();
          var w = root.querySelector("[data-cal-windows]");
          if (w && w.scrollIntoView && window.innerWidth < 720) w.scrollIntoView({ block: "nearest", behavior: "smooth" });
        });
      });
      Array.prototype.forEach.call(root.querySelectorAll("[data-cal-slot]"), function (b) {
        b.addEventListener("click", function () {
          value.date = open; value.slot = b.getAttribute("data-cal-slot");
          emit(); render();
        });
      });
    }

    function windowsHtml() {
      if (opts.admin) return ""; // admin.html draws its own day panel
      if (!open) return opts.pickable ? '<p class="cal-hint">' + esc(t("cal.pickDay")) + "</p>" : "";
      var info = dayInfo(open);
      var h = '<h4 class="cal-day-title">' + esc(fmtDate(open)) + "</h4>";
      if (info.closed) return h + '<p class="cal-hint">' + esc(t("cal.closedDay")) + "</p>";
      h += '<div class="cal-slots">';
      info.windows.forEach(function (w) {
        var disabled = w.blocked || w.full;
        var pressed = value.date === open && value.slot === w.slot.id;
        var status = w.blocked ? t("cal.unavailable") : w.full ? t("cal.full") : t("cal.spots", { open: w.left, cap: AV.capacity });
        if (opts.admin) status = t("cal.adminTaken", { taken: w.taken, cap: AV.capacity }) + (w.blocked ? " · " + t("cal.unavailable") : "");
        var inner = '<span class="cal-slot-name">' + esc(L(w.slot.label)) + '</span><span class="cal-slot-time">' + esc(w.slot.time || "") + '</span><span class="cal-slot-status">' + esc(status) + "</span>";
        if (opts.pickable) {
          h += '<button type="button" class="cal-slot' + (pressed ? " is-selected" : "") + (disabled ? " is-full" : "") + '" data-cal-slot="' + esc(w.slot.id) + '"' + (disabled && !opts.admin ? " disabled" : "") + ' aria-pressed="' + pressed + '">' + inner + "</button>";
        } else {
          h += '<div class="cal-slot' + (disabled ? " is-full" : "") + '">' + inner + "</div>";
        }
      });
      h += "</div>";
      if (opts.pickable && !opts.admin) {
        var anyPressed = value.date === open && !value.slot;
        h += '<button type="button" class="cal-any' + (anyPressed ? " is-selected" : "") + '" data-cal-slot="" aria-pressed="' + anyPressed + '">' + esc(t("cal.anyWindow")) + "</button>";
      }
      return h;
    }

    function emit() { if (opts.onChange) opts.onChange({ date: value.date, slot: value.slot, slotLabel: value.slot && slotById(value.slot) ? L(slotById(value.slot).label) : "" }); }

    load();
    document.addEventListener("mkg:langchange", render);
    return {
      refresh: function () { cache = {}; holds = []; return load(); },
      get value() { return value; },
      set: function (v) { value = { date: v.date || "", slot: v.slot || "" }; open = value.date || open; render(); },
      setSegment: function (s) { segment = s; render(); },
      dayInfo: dayInfo, open: function () { return open; },
    };
  }

  C.calendar = { mount: mount, fmtDate: fmtDate, slotLabel: function (id) { for (var i = 0; i < (C.availability || { slots: [] }).slots.length; i++) if (C.availability.slots[i].id === id) return L(C.availability.slots[i].label) + (C.availability.slots[i].time ? " (" + C.availability.slots[i].time + ")" : ""); return id || ""; } };
})();
