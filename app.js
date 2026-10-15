/*
  Shared behaviour for every page: pricing, the plan dial state, segmented
  controls, steppers, and small chrome (nav, footer, contact details).
  Reads window.MKG from plans.js.
*/
(function () {
  "use strict";
  var C = window.MKG;
  if (!C) return;

  var STORAGE_KEY = "mkg.state";

  // ---------- pricing ----------
  function plan(id) {
    for (var i = 0; i < C.plans.length; i++) if (C.plans[i].id === id) return C.plans[i];
    return null;
  }
  function frequency(id) {
    for (var i = 0; i < C.frequencies.length; i++) if (C.frequencies[i].id === id) return C.frequencies[i];
    return null;
  }
  function estimate(planId, bedrooms, bathrooms, freqId) {
    var p = plan(planId), f = frequency(freqId);
    if (!p || !f) return null;
    var oneTime = p.base + p.perBedroom * bedrooms + p.perBathroom * bathrooms;
    var perVisit = Math.round(oneTime * (1 - f.discount));
    return {
      oneTime: Math.round(oneTime),
      perVisit: perVisit,
      saving: Math.round(oneTime) - perVisit,
      discount: f.discount,
      perVisitLabel: f.perVisitLabel,
    };
  }
  function dollars(n) { return "$" + n.toLocaleString("en-US"); }
  // "Booking monthly takes 5% off every visit, every 2 weeks takes 10% off, and weekly takes 15% off."
  function discountSentence() {
    var parts = C.frequencies.filter(function (f) { return f.discount > 0; }).map(function (f, i) {
      return (i === 0 ? "Booking " : "") + f.label.toLowerCase() + " takes " + pct(f.discount) + " off" + (i === 0 ? " every visit" : "");
    });
    if (!parts.length) return "";
    if (parts.length === 1) return parts[0] + ".";
    return parts.slice(0, -1).join(", ") + ", and " + parts[parts.length - 1] + ".";
  }
  function pct(d) { return Math.round(d * 100) + "%"; }

  // ---------- state ----------
  var state = {
    bedrooms: C.defaults.bedrooms,
    bathrooms: C.defaults.bathrooms,
    plan: C.defaults.plan,
    frequency: C.defaults.frequency,
  };
  function clamp(n, range) { return Math.min(range[1], Math.max(range[0], n)); }
  function load() {
    try {
      var saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (saved) {
        if (typeof saved.bedrooms === "number") state.bedrooms = clamp(saved.bedrooms, C.limits.bedrooms);
        if (typeof saved.bathrooms === "number") state.bathrooms = clamp(saved.bathrooms, C.limits.bathrooms);
        if (plan(saved.plan)) state.plan = saved.plan;
        if (frequency(saved.frequency)) state.frequency = saved.frequency;
      }
    } catch (e) { /* storage unavailable: defaults stand */ }
    // URL parameters win over storage so links like quote.html?plan=family work.
    var q = new URLSearchParams(location.search);
    if (plan(q.get("plan"))) state.plan = q.get("plan");
    if (frequency(q.get("freq"))) state.frequency = q.get("freq");
  }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }
  var listeners = [];
  function set(patch) {
    var changed = false;
    Object.keys(patch).forEach(function (k) {
      if (state[k] !== patch[k]) { state[k] = patch[k]; changed = true; }
    });
    if (!changed) return;
    save();
    render();
    listeners.forEach(function (fn) { fn(state); });
  }

  // ---------- controls ----------
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  // Frequency segmented controls: <div data-freq-control></div>
  function buildFrequencyControls() {
    $all("[data-freq-control]").forEach(function (el) {
      if (el.dataset.built) return;
      el.dataset.built = "1";
      el.setAttribute("role", "group");
      if (!el.getAttribute("aria-label")) el.setAttribute("aria-label", "How often");
      C.frequencies.forEach(function (f) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "seg-btn";
        b.dataset.freq = f.id;
        b.setAttribute("aria-label", f.label + (f.discount ? ", " + pct(f.discount) + " off" : ", full price"));
        b.innerHTML = '<span class="seg-label">' + (f.short || f.label) + "</span>" +
          (f.discount ? '<span class="seg-off">' + pct(f.discount) + " off</span>" : '<span class="seg-off seg-off-none">full price</span>');
        b.addEventListener("click", function () { set({ frequency: f.id }); });
        el.appendChild(b);
      });
    });
  }

  // Steppers: <div data-stepper="bedrooms" data-label="bed"></div>
  function buildSteppers() {
    $all("[data-stepper]").forEach(function (el) {
      if (el.dataset.built) return;
      el.dataset.built = "1";
      var key = el.dataset.stepper;
      var range = C.limits[key];
      el.className += " stepper";
      el.innerHTML =
        '<button type="button" class="stepper-btn" data-dir="-1" aria-label="Fewer ' + key + '">−</button>' +
        '<output class="stepper-value" aria-live="polite"></output>' +
        '<button type="button" class="stepper-btn" data-dir="1" aria-label="More ' + key + '">+</button>';
      $all(".stepper-btn", el).forEach(function (b) {
        b.addEventListener("click", function () {
          var patch = {};
          patch[key] = clamp(state[key] + Number(b.dataset.dir), range);
          set(patch);
        });
      });
    });
  }

  // Plan pickers: <button data-plan-pick="family">
  function buildPlanPickers() {
    $all("[data-plan-pick]").forEach(function (el) {
      if (el.dataset.built) return;
      el.dataset.built = "1";
      el.addEventListener("click", function () { set({ plan: el.dataset.planPick }); });
    });
  }

  // ---------- rendering ----------
  function pop(el) {
    el.classList.remove("pop");
    void el.offsetWidth; // restart the animation
    el.classList.add("pop");
  }

  function render() {
    // Segmented controls
    $all("[data-freq-control] .seg-btn").forEach(function (b) {
      var on = b.dataset.freq === state.frequency;
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
    // Steppers
    $all("[data-stepper]").forEach(function (el) {
      var key = el.dataset.stepper, range = C.limits[key];
      var out = el.querySelector(".stepper-value");
      var label = el.dataset.label || key;
      if (out) out.textContent = state[key] + (state[key] === range[1] ? "+" : "") + " " + label;
      var minus = el.querySelector('[data-dir="-1"]'), plus = el.querySelector('[data-dir="1"]');
      if (minus) minus.disabled = state[key] <= range[0];
      if (plus) plus.disabled = state[key] >= range[1];
    });
    // Plan pickers
    $all("[data-plan-pick]").forEach(function (el) {
      el.setAttribute("aria-pressed", el.dataset.planPick === state.plan ? "true" : "false");
    });
    // Prices: [data-price="planId|current"] with optional [data-price-part]
    $all("[data-price]").forEach(function (el) {
      var id = el.dataset.price === "current" ? state.plan : el.dataset.price;
      var e = estimate(id, state.bedrooms, state.bathrooms, state.frequency);
      if (!e) return;
      var part = el.dataset.pricePart || "perVisit";
      var next;
      switch (part) {
        case "perVisit": next = dollars(e.perVisit); break;
        case "oneTime": next = dollars(e.oneTime); break;
        case "saving": next = dollars(e.saving); break;
        case "discount": next = pct(e.discount); break;
        case "label": next = e.perVisitLabel; break;
        default: next = dollars(e.perVisit);
      }
      if (el.textContent !== next) { el.textContent = next; if (part === "perVisit") pop(el); }
    });
    // Savings pills: hidden at full price
    $all("[data-saving-pill]").forEach(function (el) {
      var f = frequency(state.frequency);
      el.hidden = !f || !f.discount;
    });
    $all("[data-fullprice-note]").forEach(function (el) {
      var f = frequency(state.frequency);
      el.hidden = !!(f && f.discount);
    });
    // Text slots
    $all("[data-text]").forEach(function (el) {
      var p = plan(state.plan), f = frequency(state.frequency);
      var map = {
        planName: p ? p.name : "",
        planTagline: p ? p.tagline : "",
        frequencyLabel: f ? f.label.toLowerCase() : "",
        bedrooms: String(state.bedrooms),
        bathrooms: String(state.bathrooms),
        discountSentence: discountSentence(),
      };
      if (map[el.dataset.text] !== undefined) el.textContent = map[el.dataset.text];
    });
    // Links that carry the current choice
    $all("[data-quote-link]").forEach(function (a) {
      var id = a.dataset.quoteLink === "current" ? state.plan : a.dataset.quoteLink;
      a.setAttribute("href", "quote.html?plan=" + encodeURIComponent(id) + "&freq=" + encodeURIComponent(state.frequency));
    });
  }

  // ---------- templated blocks (plans.js is the single source of truth) ----------
  var CHECK = '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 7.5l3.2 3L12 3.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  function renderPlanCards(container) {
    if (!container) return;
    container.innerHTML = C.plans.map(function (p) {
      return (
        '<article class="plan-card' + (p.recommended ? " is-recommended" : "") + '" data-plan-card="' + p.id + '">' +
          (p.recommended ? '<span class="plan-tag">Fits most homes</span>' : "") +
          '<h3 class="plan-name">' + esc(p.name) + "</h3>" +
          '<p class="plan-tagline">' + esc(p.tagline) + "</p>" +
          '<div class="plan-price"><span class="price-big" data-price="' + p.id + '"></span>' +
            '<span class="price-unit" data-price="' + p.id + '" data-price-part="label"></span></div>' +
          '<div class="plan-was">' +
            '<span data-saving-pill><s data-price="' + p.id + '" data-price-part="oneTime"></s> at full price</span>' +
            '<span class="pill" data-saving-pill>Save <span data-price="' + p.id + '" data-price-part="discount"></span></span>' +
            '<span data-fullprice-note>Full price for a single visit</span>' +
          "</div>" +
          '<ul class="plan-includes">' + p.includes.map(function (t) { return "<li>" + CHECK + "<span>" + esc(t) + "</span></li>"; }).join("") + "</ul>" +
          '<p class="plan-best">Best for: ' + esc(p.bestFor) + "</p>" +
          '<a class="btn' + (p.recommended ? "" : " btn-secondary") + ' btn-block" data-quote-link="' + p.id + '">Get a quote for ' + esc(p.name) + "</a>" +
        "</article>"
      );
    }).join("");
  }

  function renderComparison(table) {
    if (!table) return;
    var marks = ['<span class="no" aria-label="Not included">—</span>', '<span class="yes" aria-label="Included">' + CHECK + "</span>", '<span class="rot">Rotation</span>'];
    table.innerHTML =
      "<thead><tr><th scope=\"col\">What gets cleaned</th>" +
      C.plans.map(function (p) { return '<th scope="col">' + esc(p.name) + "</th>"; }).join("") +
      "</tr></thead><tbody>" +
      C.comparison.map(function (row) {
        return "<tr><th scope=\"row\" style=\"font-weight:500\">" + esc(row.label) + "</th>" +
          row.values.map(function (v) { return "<td>" + marks[v] + "</td>"; }).join("") + "</tr>";
      }).join("") +
      "</tbody>";
  }

  function renderSingles(container) {
    if (!container) return;
    container.innerHTML = C.singleCleans.map(function (s) {
      return '<article class="single"><h3 class="heading">' + esc(s.name) + "</h3><p>" + esc(s.description) + "</p>" +
        '<a class="btn btn-secondary btn-sm" href="quote.html?service=' + encodeURIComponent(s.id) + '">Get a quote</a></article>';
    }).join("");
  }

  function renderPlanPicks(container) {
    if (!container) return;
    container.innerHTML = C.plans.map(function (p) {
      return '<button type="button" class="plan-pick" data-plan-pick="' + p.id + '">' + esc(p.name) + "</button>";
    }).join("");
  }

  function templates() {
    $all("[data-render-plans]").forEach(renderPlanCards);
    $all("[data-render-comparison]").forEach(renderComparison);
    $all("[data-render-singles]").forEach(renderSingles);
    $all("[data-render-plan-picks]").forEach(renderPlanPicks);
  }

  // ---------- chrome ----------
  function chrome() {
    var y = document.querySelector("[data-year]");
    if (y) y.textContent = String(new Date().getFullYear());

    var b = C.business;
    $all("[data-business]").forEach(function (el) {
      var v = b[el.dataset.business];
      if (!v) { el.hidden = true; return; }
      if (el.tagName === "A" && el.dataset.business === "phone") el.setAttribute("href", "tel:" + v.replace(/[^\d+]/g, ""));
      if (el.tagName === "A" && el.dataset.business === "email") el.setAttribute("href", "mailto:" + v);
      el.textContent = v;
    });
    // Hide wrappers that only exist for a missing detail
    $all("[data-business-wrap]").forEach(function (el) {
      el.hidden = !b[el.dataset.businessWrap];
    });

    var toggle = document.querySelector(".nav-toggle");
    var header = document.querySelector(".site-header");
    if (toggle && header) {
      toggle.addEventListener("click", function () {
        var open = header.classList.toggle("nav-open");
        toggle.setAttribute("aria-expanded", open ? "true" : "false");
      });
      $all(".site-nav a", header).forEach(function (a) {
        a.addEventListener("click", function () {
          header.classList.remove("nav-open");
          toggle.setAttribute("aria-expanded", "false");
        });
      });
    }
  }

  function init() {
    load();
    templates();
    buildFrequencyControls();
    buildSteppers();
    buildPlanPickers();
    chrome();
    render();
  }

  window.MKG.app = {
    state: state, set: set, estimate: estimate, plan: plan, frequency: frequency,
    dollars: dollars, pct: pct, esc: esc, onChange: function (fn) { listeners.push(fn); },
    rebuild: function () { buildFrequencyControls(); buildSteppers(); buildPlanPickers(); render(); },
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
