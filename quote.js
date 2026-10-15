/*
  Quote flow: five short steps, a review, and a send.
  Plan, schedule, bedrooms, and bathrooms come from the shared state in app.js,
  so whatever the visitor chose on the home or plans page is already filled in.
*/
(function () {
  "use strict";
  var C = window.MKG, A = C && C.app;
  if (!A) return;

  var DRAFT_KEY = "mkg.quote";
  var form = document.getElementById("quote");
  var steps = Array.prototype.slice.call(form.querySelectorAll("[data-step]"));
  var marks = Array.prototype.slice.call(form.querySelectorAll("[data-step-mark]"));
  var current = 1;
  var draft = { service: null, outOfArea: false };

  function $(sel, root) { return (root || form).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || form).querySelectorAll(sel)); }
  function value(name) { var el = form.elements[name]; return el ? (el.value || "").trim() : ""; }
  function checked(name) {
    return $all('input[name="' + name + '"]:checked').map(function (i) { return i.value; });
  }
  function setError(key, msg) {
    var el = $('[data-error="' + key + '"]');
    if (el) el.textContent = msg || "";
    var input = form.elements[key];
    if (input && input.classList) input.classList.toggle("is-invalid", !!msg);
  }

  // ---------- draft persistence ----------
  function saveDraft() {
    var d = {
      zip: value("zip"), homeType: checked("homeType")[0], pets: checked("pets")[0], notes: value("notes"),
      name: value("name"), email: value("email"), phone: value("phone"),
      contactMethod: checked("contactMethod")[0], days: checked("days"), timeOfDay: checked("timeOfDay")[0],
      service: draft.service, outOfArea: draft.outOfArea, step: current,
    };
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch (e) { /* ignore */ }
  }
  function loadDraft() {
    var d = null;
    try { d = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null"); } catch (e) { /* ignore */ }
    if (!d) return;
    ["zip", "notes", "name", "email", "phone"].forEach(function (k) { if (d[k] && form.elements[k]) form.elements[k].value = d[k]; });
    ["homeType", "pets", "contactMethod", "timeOfDay"].forEach(function (k) {
      var el = $('input[name="' + k + '"][value="' + (d[k] || "") + '"]');
      if (el) el.checked = true;
    });
    (d.days || []).forEach(function (day) {
      var el = $('input[name="days"][value="' + day + '"]'); if (el) el.checked = true;
    });
    draft.service = d.service || null;
    draft.outOfArea = !!d.outOfArea;
  }
  function clearDraft() { try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* ignore */ } }

  // ---------- plan options (step 3) ----------
  function singleClean(id) {
    for (var i = 0; i < C.singleCleans.length; i++) if (C.singleCleans[i].id === id) return C.singleCleans[i];
    return null;
  }
  function renderPlanOptions() {
    var box = $("[data-plan-options]");
    var html = C.plans.map(function (p) {
      return '<label class="plan-option"><input type="radio" name="planChoice" value="plan:' + p.id + '">' +
        '<span class="plan-option-body">' +
          '<span class="plan-option-name">' + A.esc(p.name) + "</span>" +
          '<span class="plan-option-price"><span data-price="' + p.id + '"></span><small data-price="' + p.id + '" data-price-part="label"></small></span>' +
          '<span class="plan-option-desc">' + A.esc(p.tagline) + (p.recommended ? " Fits most homes." : "") + "</span>" +
        "</span></label>";
    }).concat(C.singleCleans.map(function (s) {
      return '<label class="plan-option"><input type="radio" name="planChoice" value="single:' + s.id + '">' +
        '<span class="plan-option-body">' +
          '<span class="plan-option-name">' + A.esc(s.name) + "</span>" +
          '<span class="plan-option-price"><span>Custom</span><small>quoted for you</small></span>' +
          '<span class="plan-option-desc">One visit. No schedule needed.</span>' +
        "</span></label>";
    })).join("");
    box.innerHTML = html;
    $all('input[name="planChoice"]').forEach(function (input) {
      input.addEventListener("change", function () {
        var parts = input.value.split(":");
        if (parts[0] === "plan") { draft.service = null; A.set({ plan: parts[1] }); }
        else { draft.service = parts[1]; }
        syncPlanUI();
        saveDraft();
      });
    });
  }
  function syncPlanUI() {
    var single = !!draft.service;
    var val = single ? "single:" + draft.service : "plan:" + A.state.plan;
    var input = $('input[name="planChoice"][value="' + val + '"]');
    if (input) input.checked = true;
    $("[data-freq-field]").hidden = single;
    $("[data-estimate]").hidden = single;
    $("[data-single-note]").hidden = !single;
  }

  // ---------- validation ----------
  function validZip(z) { return /^\d{5}$/.test(z); }
  function validEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e); }
  function validate(step) {
    var ok = true;
    if (step === 1) {
      var zip = value("zip");
      setError("zip", "");
      var note = $("[data-out-of-area]");
      if (!validZip(zip)) { setError("zip", "Enter a 5-digit ZIP code."); note.hidden = true; return false; }
      var served = !C.serviceZips.length || C.serviceZips.indexOf(zip) !== -1;
      draft.outOfArea = !served;
      if (!served) {
        $("[data-out-zip]").textContent = zip;
        if (note.hidden) { note.hidden = false; return false; } // first click shows the note; second continues
      } else {
        note.hidden = true;
      }
    }
    if (step === 4) {
      if (!value("name")) { setError("name", "Enter your name."); ok = false; } else setError("name", "");
      if (!validEmail(value("email"))) { setError("email", "Enter an email address we can reply to."); ok = false; } else setError("email", "");
      var method = checked("contactMethod")[0];
      if ((method === "Text" || method === "Call") && value("phone").replace(/\D/g, "").length < 10) {
        setError("phone", "Add a phone number so we can " + method.toLowerCase() + " you."); ok = false;
      } else setError("phone", "");
    }
    return ok;
  }

  // ---------- review ----------
  function summary() {
    var s = A.state;
    var pets = checked("pets")[0];
    var rows = [
      ["Home", checked("homeType")[0] + " in " + value("zip") + (draft.outOfArea ? " (outside our current area)" : ""), 1],
      ["Size", s.bedrooms + " bedrooms, " + s.bathrooms + " bathrooms" + (pets !== "None" ? ", " + (pets === "More than one" ? "more than one pet" : "a " + pets.toLowerCase()) : ", no pets"), 2],
    ];
    if (draft.service) {
      rows.push(["Service", singleClean(draft.service).name + ", quoted after we hear about the home", 3]);
    } else {
      var e = A.estimate(s.plan, s.bedrooms, s.bathrooms, s.frequency);
      var f = A.frequency(s.frequency);
      rows.push(["Plan", A.plan(s.plan).name + ", " + f.label.toLowerCase(), 3]);
      rows.push(["Estimate", A.dollars(e.perVisit) + " " + e.perVisitLabel + (e.saving ? " (" + A.pct(e.discount) + " off the full price of " + A.dollars(e.oneTime) + ")" : ""), 3]);
    }
    var method = checked("contactMethod")[0];
    rows.push(["Contact", value("name") + ", " + value("email") + (value("phone") ? ", " + value("phone") : "") + ". Prefers " + (method === "Call" ? "a call" : method.toLowerCase()) + ".", 4]);
    var days = checked("days"), tod = checked("timeOfDay")[0];
    rows.push(["Timing", (days.length ? days.join(", ") : "Any day") + ", " + (tod === "Either" ? "morning or afternoon" : tod.toLowerCase() + "s"), 4]);
    if (value("notes")) rows.push(["Notes", value("notes"), 2]);
    return rows;
  }
  function renderReview(target, editable) {
    target.innerHTML = summary().map(function (r) {
      return '<div class="review-row"><dt>' + A.esc(r[0]) + "</dt><dd>" + A.esc(r[1]) + "</dd>" +
        (editable ? '<button type="button" data-goto="' + r[2] + '">Change</button>' : "") + "</div>";
    }).join("");
    $all("[data-goto]", target).forEach(function (b) {
      b.addEventListener("click", function () { go(Number(b.dataset.goto)); });
    });
  }

  // ---------- navigation ----------
  function go(n) {
    current = n;
    steps.forEach(function (s) { s.hidden = s.dataset.step !== String(n); });
    marks.forEach(function (m) {
      var i = Number(m.dataset.stepMark);
      m.classList.toggle("is-done", typeof n === "number" && i < n);
      m.classList.toggle("is-current", i === n);
    });
    $(".progress").hidden = n === "done";
    if (n === 3) syncPlanUI();
    if (n === 5) renderReview($("[data-review]"), true);
    saveDraft();
    var heading = $('[data-step="' + n + '"] .title');
    if (heading) { heading.setAttribute("tabindex", "-1"); heading.focus({ preventScroll: true }); }
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  $all("[data-next]").forEach(function (b) {
    b.addEventListener("click", function () { if (validate(current)) go(current + 1); });
  });
  $all("[data-back]").forEach(function (b) {
    b.addEventListener("click", function () { go(Math.max(1, current - 1)); });
  });
  form.addEventListener("input", saveDraft);
  form.addEventListener("change", saveDraft);
  $("#zip").addEventListener("input", function () { setError("zip", ""); $("[data-out-of-area]").hidden = true; });

  // ---------- send ----------
  function payload() {
    var s = A.state;
    var p = {
      submittedAt: new Date().toISOString(),
      zip: value("zip"), outOfArea: draft.outOfArea, homeType: checked("homeType")[0],
      bedrooms: s.bedrooms, bathrooms: s.bathrooms, pets: checked("pets")[0], notes: value("notes"),
      name: value("name"), email: value("email"), phone: value("phone"),
      contactMethod: checked("contactMethod")[0], days: checked("days"), timeOfDay: checked("timeOfDay")[0],
    };
    if (draft.service) {
      p.service = singleClean(draft.service).name;
    } else {
      var e = A.estimate(s.plan, s.bedrooms, s.bathrooms, s.frequency);
      p.plan = A.plan(s.plan).name; p.frequency = A.frequency(s.frequency).label;
      p.estimatePerVisit = e.perVisit; p.estimateFullPrice = e.oneTime; p.discount = e.discount;
    }
    p._subject = "Quote request: " + (p.service || p.plan + " · " + p.frequency) + " · ZIP " + p.zip;
    return p;
  }

  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    if (current !== 5) return;
    var btn = $("[data-submit]");
    setError("submit", "");
    btn.disabled = true; btn.textContent = "Sending…";

    function done(demo) {
      renderReview($("[data-review-done]"), false);
      $("[data-demo-note]").hidden = !demo;
      clearDraft();
      go("done");
    }
    function fail() {
      btn.disabled = false; btn.textContent = "Send my quote request";
      var alt = C.business.email ? " or email " + C.business.email : "";
      setError("submit", "Couldn't send your request. Check your connection and try again" + alt + ".");
    }

    if (!C.formEndpoint) { setTimeout(function () { done(true); }, 400); return; }
    fetch(C.formEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload()),
    }).then(function (r) { if (r.ok) done(false); else fail(); }).catch(fail);
  });

  // ---------- start ----------
  function init() {
    loadDraft();
    renderPlanOptions();
    var q = new URLSearchParams(location.search);
    if (singleClean(q.get("service"))) draft.service = q.get("service");
    else if (q.get("plan")) draft.service = null;
    A.rebuild();
    A.onChange(function () { if (current === 3) syncPlanUI(); });
    go(1);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
