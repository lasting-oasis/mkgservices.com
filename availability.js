/*
  availability.html: the public calendar. Pick a day and a window, then the
  button carries both into the quote request (?date=...&slot=...).
*/
(function () {
  "use strict";
  var C = window.MKG, I = C && C.i18n, Cal = C && C.calendar, B = C && C.backend;
  if (!I || !Cal || !B) return;
  var t = I.t, L = I.L;
  var segment = "residential";
  var pick = { date: "", slot: "" };
  var cal = null;
  var $ = function (s) { return document.querySelector(s); };

  function quotePage() { return C.segments[segment].pages.quote; }
  function render() {
    var sum = $("[data-when-summary]"), cta = $("[data-avail-cta]");
    if (pick.date) {
      sum.textContent = Cal.fmtDate(pick.date) + ", " + (pick.slot ? Cal.slotLabel(pick.slot) : t("cal.anyWindow").toLowerCase());
      cta.hidden = false;
      cta.href = quotePage() + "?date=" + pick.date + (pick.slot ? "&slot=" + encodeURIComponent(pick.slot) : "");
    } else {
      sum.textContent = t("avail.nonePicked");
      cta.hidden = true;
    }
    var list = $("[data-avail-windows]");
    list.innerHTML = C.availability.slots.filter(function (s) { return !s.segments || s.segments.indexOf(segment) !== -1; })
      .map(function (s) { return "<li><b>" + C.app.esc(L(s.label)) + "</b> <span class='muted'>" + C.app.esc(s.time || "") + "</span></li>"; }).join("");
  }
  function mountCal() {
    cal = Cal.mount($("[data-calendar]"), {
      segment: segment, pickable: true, value: pick,
      onChange: function (v) { pick = { date: v.date, slot: v.slot }; render(); },
    });
  }

  document.querySelectorAll("[data-avail-seg]").forEach(function (b) {
    b.addEventListener("click", function () {
      segment = b.getAttribute("data-avail-seg");
      document.querySelectorAll("[data-avail-seg]").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
      pick.slot = ""; // windows differ between the two
      cal.setSegment(segment); cal.set(pick);
      render();
    });
  });
  document.addEventListener("mkg:langchange", render);
  mountCal();
  render();
})();
