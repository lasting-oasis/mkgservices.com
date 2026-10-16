/*
  Shared behaviour for every page: pricing, the plan dial state, segmented
  controls, steppers, and small chrome (nav, footer, contact details).
  Reads window.MKG from plans.js and window.MKG.i18n from i18n.js.
*/
(function () {
  "use strict";
  var C = window.MKG;
  if (!C || !C.i18n) return;
  var I = C.i18n, t = I.t, L = I.L;

  var STORAGE_KEY = "mkg.state" + (C.segment === "residential" ? "" : "." + C.segment);

  // ---------- pricing ----------
  function plan(id) {
    for (var i = 0; i < C.plans.length; i++) if (C.plans[i].id === id) return C.plans[i];
    return null;
  }
  function frequency(id) {
    for (var i = 0; i < C.frequencies.length; i++) if (C.frequencies[i].id === id) return C.frequencies[i];
    return null;
  }
  function dim(id) {
    for (var i = 0; i < C.dims.length; i++) if (C.dims[i].id === id) return C.dims[i];
    return null;
  }
  // size: an object of dim values (the shared state works). freq: a frequency id,
  // or a plain discount number for one-off pricing such as the follow-up tiers.
  function estimate(planId, size, freq) {
    var p = plan(planId);
    var f = typeof freq === "number" ? null : frequency(freq);
    if (!p || (f === null && typeof freq !== "number")) return null;
    var discount = f ? f.discount : freq;
    var oneTime = p.base;
    C.dims.forEach(function (d) { oneTime += (p.per[d.id] || 0) * (size[d.id] || 0); });
    var perVisit = Math.round(oneTime * (1 - discount));
    var vpm = f && f.visitsPerMonth;
    return {
      oneTime: Math.round(oneTime),
      perVisit: perVisit,
      saving: Math.round(oneTime) - perVisit,
      discount: discount,
      perVisitLabel: L((f || frequency("onetime") || C.frequencies[0]).perVisitLabel),
      perMonth: vpm ? Math.round(perVisit * vpm) : null,
      visitsPerMonth: vpm || null,
    };
  }
  function dollars(n) { return "$" + n.toLocaleString("en-US"); }
  function num(n) { return Number(n).toLocaleString("en-US"); }
  function pct(d) { return Math.round(d * 100) + "%"; }
  // "Monthly: 5% off every visit. Every 2 weeks: 10% off. Weekly: 15% off."
  function discountSentence() {
    return C.frequencies.filter(function (f) { return f.discount > 0; }).map(function (f, i) {
      return t(i === 0 ? "discount.first" : "discount.rest", { label: L(f.label), pct: pct(f.discount) });
    }).join(" ");
  }

  // ---------- state ----------
  var state = { plan: C.defaults.plan, frequency: C.defaults.frequency };
  C.dims.forEach(function (d) { state[d.id] = d.default; });
  function clamp(n, d) { return Math.min(d.max, Math.max(d.min, n)); }
  function load() {
    try {
      var saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (saved) {
        C.dims.forEach(function (d) { if (typeof saved[d.id] === "number") state[d.id] = clamp(saved[d.id], d); });
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
      el.innerHTML = "";
      el.setAttribute("role", "group");
      el.setAttribute("aria-label", t("seg.aria"));
      C.frequencies.forEach(function (f) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "seg-btn";
        b.dataset.freq = f.id;
        b.setAttribute("aria-label", L(f.label) + ", " + (f.discount ? t("seg.off", { pct: pct(f.discount) }) : t("seg.full")));
        b.innerHTML = '<span class="seg-label">' + esc(L(f.short) || L(f.label)) + "</span>" +
          (f.discount ? '<span class="seg-off">' + esc(t("seg.off", { pct: pct(f.discount) })) + "</span>"
                      : '<span class="seg-off seg-off-none">' + esc(t("seg.full")) + "</span>");
        b.addEventListener("click", function () { set({ frequency: f.id }); });
        el.appendChild(b);
      });
    });
  }

  // Steppers: <div data-stepper="bedrooms"></div>
  function buildSteppers() {
    $all("[data-stepper]").forEach(function (el) {
      var key = el.dataset.stepper;
      var d = dim(key);
      if (!d) return;
      el.classList.add("stepper");
      el.innerHTML =
        '<button type="button" class="stepper-btn" data-dir="-1" aria-label="' + esc(t("stepper.fewer." + key)) + '">−</button>' +
        '<output class="stepper-value" aria-live="polite"></output>' +
        '<button type="button" class="stepper-btn" data-dir="1" aria-label="' + esc(t("stepper.more." + key)) + '">+</button>';
      $all(".stepper-btn", el).forEach(function (b) {
        b.addEventListener("click", function () {
          var patch = {};
          patch[key] = clamp(state[key] + Number(b.dataset.dir) * d.step, d);
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
    $all("[data-freq-control] .seg-btn").forEach(function (b) {
      b.setAttribute("aria-pressed", b.dataset.freq === state.frequency ? "true" : "false");
    });
    $all("[data-stepper]").forEach(function (el) {
      var key = el.dataset.stepper, d = dim(key);
      if (!d) return;
      var out = el.querySelector(".stepper-value");
      if (out) out.textContent = num(state[key]) + (state[key] === d.max ? "+" : "") + " " + I.plural("stepper." + key, state[key]);
      var minus = el.querySelector('[data-dir="-1"]'), plus = el.querySelector('[data-dir="1"]');
      if (minus) minus.disabled = state[key] <= d.min;
      if (plus) plus.disabled = state[key] >= d.max;
    });
    $all("[data-plan-pick]").forEach(function (el) {
      el.setAttribute("aria-pressed", el.dataset.planPick === state.plan ? "true" : "false");
    });
    // Prices: [data-price="planId|current"] with optional [data-price-part]
    $all("[data-price]").forEach(function (el) {
      var id = el.dataset.price === "current" ? state.plan : el.dataset.price;
      var e = estimate(id, state, state.frequency);
      if (!e) return;
      var part = el.dataset.pricePart || "perVisit";
      var next;
      switch (part) {
        case "oneTime": next = dollars(e.oneTime); break;
        case "saving": next = dollars(e.saving); break;
        case "discount": next = pct(e.discount); break;
        case "label": next = e.perVisitLabel; break;
        case "perMonth": next = e.perMonth === null ? "" : dollars(e.perMonth); break;
        default: next = dollars(e.perVisit);
      }
      if (el.textContent !== next) { el.textContent = next; if (part === "perVisit") pop(el); }
    });
    var f = frequency(state.frequency), hasDiscount = !!(f && f.discount);
    $all("[data-saving-pill]").forEach(function (el) { el.hidden = !hasDiscount; });
    $all("[data-fullprice-note]").forEach(function (el) { el.hidden = hasDiscount; });
    // Monthly figures only exist where the frequency says how many visits a month it is.
    var monthly = !!(f && f.visitsPerMonth);
    $all("[data-monthly]").forEach(function (el) { el.hidden = !monthly; });
    // Text slots
    var p = plan(state.plan);
    var map = {
      planName: p ? L(p.name) : "",
      planTagline: p ? L(p.tagline) : "",
      frequencyLabel: f ? L(f.label).toLowerCase() : "",
      discountSentence: discountSentence(),
    };
    C.dims.forEach(function (d) { map[d.id] = num(state[d.id]); });
    $all("[data-text]").forEach(function (el) {
      if (map[el.dataset.text] !== undefined) el.textContent = map[el.dataset.text];
    });
    // Links that carry the current choice
    $all("[data-quote-link]").forEach(function (a) {
      var id = a.dataset.quoteLink === "current" ? state.plan : a.dataset.quoteLink;
      a.setAttribute("href", C.pages.quote + "?plan=" + encodeURIComponent(id) + "&freq=" + encodeURIComponent(state.frequency));
    });
  }

  // ---------- templated blocks (plans.js is the single source of truth) ----------
  var CHECK = '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 7.5l3.2 3L12 3.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  function renderPlanCards(container) {
    container.innerHTML = C.plans.map(function (p) {
      return (
        '<article class="plan-card' + (p.recommended ? " is-recommended" : "") + '" data-plan-card="' + p.id + '">' +
          (p.recommended ? '<span class="plan-tag">' + esc(t("plans.tag")) + "</span>" : "") +
          '<h3 class="plan-name">' + esc(L(p.name)) + "</h3>" +
          '<p class="plan-tagline">' + esc(L(p.tagline)) + "</p>" +
          '<div class="plan-price"><span class="price-big" data-price="' + p.id + '"></span>' +
            '<span class="price-unit" data-price="' + p.id + '" data-price-part="label"></span></div>' +
          '<p class="plan-monthly" data-monthly hidden>' + esc(t("plans.monthly")) + ' <span data-price="' + p.id + '" data-price-part="perMonth"></span></p>' +
          '<div class="plan-was">' +
            '<span data-saving-pill><s data-price="' + p.id + '" data-price-part="oneTime"></s> ' + esc(t("plans.atFull")) + "</span>" +
            '<span class="pill" data-saving-pill>' + esc(t("plans.save")) + ' <span data-price="' + p.id + '" data-price-part="discount"></span></span>' +
            "<span data-fullprice-note>" + esc(t("plans.fullSingle")) + "</span>" +
          "</div>" +
          '<ul class="plan-includes">' + p.includes.map(function (x) { return "<li>" + CHECK + "<span>" + esc(L(x)) + "</span></li>"; }).join("") + "</ul>" +
          '<p class="plan-best">' + esc(t("plans.bestFor")) + " " + esc(L(p.bestFor)) + "</p>" +
          '<a class="btn' + (p.recommended ? "" : " btn-secondary") + ' btn-block" data-quote-link="' + p.id + '">' + esc(t("plans.cta", { name: L(p.name) })) + "</a>" +
        "</article>"
      );
    }).join("");
  }

  function renderComparison(table) {
    var marks = [
      '<span class="no" aria-label="' + esc(t("compare.no")) + '">—</span>',
      '<span class="yes" aria-label="' + esc(t("compare.yes")) + '">' + CHECK + "</span>",
      '<span class="rot">' + esc(t("compare.rot")) + "</span>",
    ];
    table.setAttribute("aria-label", t("compare.aria"));
    table.innerHTML =
      '<thead><tr><th scope="col">' + esc(t("compare.col")) + "</th>" +
      C.plans.map(function (p) { return '<th scope="col">' + esc(L(p.name)) + "</th>"; }).join("") +
      "</tr></thead><tbody>" +
      C.comparison.map(function (row) {
        return '<tr><th scope="row" style="font-weight:500">' + esc(L(row.label)) + "</th>" +
          row.values.map(function (v) { return "<td>" + marks[v] + "</td>"; }).join("") + "</tr>";
      }).join("") +
      "</tbody>";
  }

  function renderSingles(container) {
    container.innerHTML = C.singleCleans.map(function (s) {
      return '<article class="single"><h3 class="heading">' + esc(L(s.name)) + "</h3><p>" + esc(L(s.description)) + "</p>" +
        '<a class="btn btn-secondary btn-sm" href="' + C.pages.quote + '?service=' + encodeURIComponent(s.id) + '">' + esc(t("singles.cta")) + "</a></article>";
    }).join("");
  }

  function renderPlanPicks(container) {
    container.setAttribute("aria-label", t("dial.plan"));
    container.innerHTML = C.plans.map(function (p) {
      return '<button type="button" class="plan-pick" data-plan-pick="' + p.id + '">' + esc(L(p.name)) + "</button>";
    }).join("");
  }

  function templates() {
    $all("[data-render-plans]").forEach(renderPlanCards);
    $all("[data-render-comparison]").forEach(renderComparison);
    $all("[data-render-singles]").forEach(renderSingles);
    $all("[data-render-plan-picks]").forEach(renderPlanPicks);
  }

  // ---------- contact details and chrome ----------
  function telHref(v) {
    var d = String(v).replace(/\D/g, "");
    if (d.length === 10) d = "1" + d;
    return "+" + d;
  }
  function fillBusiness() {
    var b = C.business;
    $all("[data-business]").forEach(function (el) {
      var key = el.dataset.business;
      var v = key === "sms" ? b.phone : L(b[key]);
      if (!v) { el.hidden = true; return; }
      el.hidden = false;
      if (el.tagName === "A") {
        if (key === "phone") el.setAttribute("href", "tel:" + telHref(v));
        if (key === "sms") el.setAttribute("href", "sms:" + telHref(v));
        if (key === "email") el.setAttribute("href", "mailto:" + v);
      }
      // Elements marked data-business-keep show their own text (an icon or a label).
      if (!el.hasAttribute("data-business-keep")) el.textContent = v;
    });
    $all("[data-business-wrap]").forEach(function (el) { el.hidden = !L(b[el.dataset.businessWrap]); });
  }

  function chrome() {
    var y = document.querySelector("[data-year]");
    if (y) y.textContent = String(new Date().getFullYear());

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

  // Everything that depends on the language, rebuilt when it changes.
  function relocalize() {
    templates();
    buildFrequencyControls();
    buildSteppers();
    buildPlanPickers();
    fillBusiness();
    render();
  }

  function init() {
    load();
    chrome();
    relocalize();
  }

  C.app = {
    state: state, set: set, estimate: estimate, plan: plan, frequency: frequency, dim: dim,
    dollars: dollars, num: num, pct: pct, esc: esc, render: render, relocalize: relocalize, fillBusiness: fillBusiness,
    onChange: function (fn) { listeners.push(fn); },
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
