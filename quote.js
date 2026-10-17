/*
  Quote flow: five short steps (including a date picker), a review, and a send.
  Requests are saved to Firebase through backend.js; when a date and time
  window were picked the request also holds that window on the calendar.
  Plan, schedule, bedrooms, and bathrooms come from the shared state in app.js,
  so whatever the visitor chose on the home or plans page is already filled in.
*/
(function () {
  "use strict";
  var C = window.MKG, A = C && C.app, I = C && C.i18n;
  if (!A || !I) return;
  var t = I.t, L = I.L;

  var DRAFT_KEY = "mkg.quote" + (C.segment === "residential" ? "" : "." + C.segment);
  var Q = C.quote || { typeField: "homeType", extraField: "pets", company: false };
  var form = document.getElementById("quote");
  var steps = Array.prototype.slice.call(form.querySelectorAll("[data-step]"));
  var marks = Array.prototype.slice.call(form.querySelectorAll("[data-step-mark]"));
  var current = 1;
  var draft = { service: null, outOfArea: false, recency: (C.followUp || {}).defaultTier, date: "", slot: "", ref: "", refValid: null };
  var B = C.backend, cal = null, INV = C.invite;
  var credit = 0; // referral credit of the signed-in client, shown as a heads-up
  var REVIEW = 6;

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
      zip: value("zip"), notes: value("notes"), company: value("company"), ref: value("ref"),
      name: value("name"), email: value("email"), phone: value("phone"),
      contactMethod: checked("contactMethod")[0], days: checked("days"), timeOfDay: checked("timeOfDay")[0],
      service: draft.service, recency: draft.recency, outOfArea: draft.outOfArea, step: current,
      date: draft.date, slot: draft.slot,
    };
    d[Q.typeField] = checked(Q.typeField)[0];
    d[Q.extraField] = checked(Q.extraField)[0];
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch (e) { /* ignore */ }
  }
  function loadDraft() {
    var d = null;
    try { d = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || "null"); } catch (e) { /* ignore */ }
    if (!d) return;
    ["zip", "notes", "name", "email", "phone", "company", "ref"].forEach(function (k) { if (d[k] && form.elements[k]) form.elements[k].value = d[k]; });
    [Q.typeField, Q.extraField, "contactMethod", "timeOfDay"].forEach(function (k) {
      var el = $('input[name="' + k + '"][value="' + (d[k] || "") + '"]');
      if (el) el.checked = true;
    });
    (d.days || []).forEach(function (day) {
      var el = $('input[name="days"][value="' + day + '"]'); if (el) el.checked = true;
    });
    draft.service = d.service || null;
    if (fuTier(d.recency)) draft.recency = d.recency;
    draft.outOfArea = !!d.outOfArea;
    draft.date = d.date || ""; draft.slot = d.slot || "";
  }
  function clearDraft() { try { sessionStorage.removeItem(DRAFT_KEY); } catch (e) { /* ignore */ } }

  // ---------- date and time window (step 5) ----------
  function renderWhen() {
    var box = $("[data-calendar]");
    if (!box || !C.calendar) return;
    if (!cal) {
      cal = C.calendar.mount(box, {
        segment: C.segment, pickable: true, value: { date: draft.date, slot: draft.slot },
        onChange: function (v) { draft.date = v.date; draft.slot = v.slot; renderWhenSummary(); saveDraft(); },
      });
    }
    renderWhenSummary();
  }
  function whenText() {
    if (!draft.date) return t("review.flexible");
    return C.calendar.fmtDate(draft.date) + ", " + (draft.slot ? C.calendar.slotLabel(draft.slot) : t("cal.anyWindow").toLowerCase());
  }
  function renderWhenSummary() {
    var el = $("[data-when-summary]");
    if (!el) return;
    el.textContent = draft.date ? t("q.when.picked", { when: whenText() }) : t("q.when.none");
    var clear = $("[data-when-clear]");
    if (clear) clear.hidden = !draft.date;
    var prefs = $("[data-when-prefs]");
    if (prefs) prefs.hidden = !!draft.date;
  }

  // ---------- a friend's invite code (step 4) ----------
  function friendAmount() { return INV ? INV.amount("friend", C.segment) : 0; }
  function refApplied() { return !!(INV && INV.enabled && friendAmount() > 0 && INV.valid(draft.ref) && draft.refValid !== false); }
  function showRefStatus() {
    var el = $("[data-ref-status]"); if (!el) return;
    var msg = t("q.ref.hint"), cls = "";
    if (draft.ref && !INV.valid(draft.ref) && draft.ref.length === 6) { msg = t("q.ref.bad"); cls = "is-bad"; }
    else if (INV.valid(draft.ref)) {
      if (draft.refValid === undefined) msg = t("q.ref.checking");
      else if (draft.refValid === false) { msg = t("q.ref.bad"); cls = "is-bad"; }
      else { msg = t("q.ref.ok", { amount: A.dollars(friendAmount()) }); cls = "is-ok"; }
    }
    el.textContent = msg; el.classList.toggle("is-ok", cls === "is-ok"); el.classList.toggle("is-bad", cls === "is-bad");
  }
  function checkRef() {
    var el = form.elements.ref; if (!el || !INV) return;
    var code = INV.clean(el.value).slice(0, 6);
    el.value = code; draft.ref = code;
    if (!INV.valid(code)) { draft.refValid = null; showRefStatus(); return; }
    draft.refValid = undefined; showRefStatus();
    B.checkReferral(code).then(function (ok) {
      if (el.value !== code) return; // typed on since
      draft.refValid = ok; showRefStatus(); saveDraft();
    });
  }
  function initRef() {
    var field = $("[data-ref-field]");
    if (!INV || !INV.enabled || !friendAmount()) { if (field) field.hidden = true; return; }
    var el = form.elements.ref;
    var fromLink = INV.current();
    if (fromLink) el.value = fromLink;
    el.addEventListener("input", checkRef);
    checkRef();
  }
  // A short heads-up for a signed-in client who has credit.
  function note(stepSel, attr, text, before) {
    var host = $(stepSel); if (!host) return;
    var el = host.querySelector("[" + attr + "]");
    if (!text) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement("p"); el.className = "notice"; el.setAttribute(attr, ""); var ref = before ? host.querySelector(before) : null; if (ref) host.insertBefore(el, ref); else host.appendChild(el); }
    el.textContent = text;
  }
  function creditNotes() {
    var text = credit > 0 ? t("q.credit.note", { credit: A.dollars(credit) }) : "";
    note('[data-step="6"]', "data-credit-note", text, "[data-review]");
  }
  function watchCredit() {
    if (!INV || !INV.enabled) return;
    B.ready.then(function (live) {
      if (!live) return;
      B.onAuth(function (u) {
        if (!u) { credit = 0; creditNotes(); return; }
        B.myCredits(u.email).then(function (list) { credit = Math.max(0, B.creditBalance(list)); creditNotes(); }).catch(function () { /* none */ });
      });
    });
  }

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
          '<span class="plan-option-name">' + A.esc(L(p.name)) + "</span>" +
          '<span class="plan-option-price"><span data-price="' + p.id + '"></span><small data-price="' + p.id + '" data-price-part="label"></small></span>' +
          '<span class="plan-option-desc">' + A.esc(L(p.tagline)) + (p.recommended ? " " + A.esc(t("q.fits")) : "") + "</span>" +
        "</span></label>";
    }).concat(C.singleCleans.map(function (s) {
      return '<label class="plan-option"><input type="radio" name="planChoice" value="single:' + s.id + '">' +
        '<span class="plan-option-body">' +
          '<span class="plan-option-name">' + A.esc(L(s.name)) + "</span>" +
          '<span class="plan-option-price"><span>' + A.esc(t(s.id === "followup" ? "q.fu.optPrice" : "q.custom")) + "</span><small>" + A.esc(t(s.id === "followup" ? "q.fu.optSub" : "q.customSub")) + "</small></span>" +
          '<span class="plan-option-desc">' + A.esc(t("q.single.desc")) + "</span>" +
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
  // ---------- follow-up pricing ----------
  // Essentials one-time price for the home, less the tier's discount (borrowed from the member ladder).
  function fuTier(id) {
    var tiers = (C.followUp || {}).tiers || [];
    for (var i = 0; i < tiers.length; i++) if (tiers[i].id === id) return tiers[i];
    return null;
  }
  function fuEstimate(id) {
    var tier = fuTier(id);
    if (!tier) return null;
    return A.estimate(C.followUp.basePlan, A.state, tier.uses !== undefined ? tier.uses : tier.discount);
  }
  function tierDiscount(tier) {
    if (tier.uses !== undefined) { var f = A.frequency(tier.uses); return f ? f.discount : 0; }
    return tier.discount || 0;
  }
  // {bedrooms: "3", bathrooms: "2"} or {sqft: "3,000", restrooms: "2"} for sentences.
  function dimVars() {
    var v = {};
    C.dims.forEach(function (d) { v[d.id] = A.num(A.state[d.id]); });
    return v;
  }
  function renderFollowUp() {
    var on = draft.service === "followup";
    $("[data-fu-field]").hidden = !on;
    $("[data-fu-estimate]").hidden = !on;
    if (!on) return;
    var seg = $("[data-fu-control]");
    seg.setAttribute("role", "group");
    seg.innerHTML = C.followUp.tiers.map(function (tier) {
      var disc = tierDiscount(tier);
      return '<button type="button" class="seg-btn" data-fu="' + tier.id + '" aria-pressed="' + (draft.recency === tier.id) + '">' +
        '<span class="seg-label">' + A.esc(L(tier.label)) + "</span>" +
        (disc ? '<span class="seg-off">' + A.esc(t("seg.off", { pct: A.pct(disc) })) + "</span>"
                    : '<span class="seg-off seg-off-none">' + A.esc(t("seg.full")) + "</span>") + "</button>";
    }).join("");
    $all("[data-fu]", seg).forEach(function (b) {
      b.addEventListener("click", function () { draft.recency = b.getAttribute("data-fu"); renderFollowUp(); saveDraft(); });
    });
    var e = fuEstimate(draft.recency);
    $("[data-fu-estimate]").innerHTML =
      '<div class="estimate-price"><span class="price-big">' + A.esc(A.dollars(e.perVisit)) + '</span><span class="price-unit">' + A.esc(t("q.fu.unit")) + "</span></div>" +
      (e.saving ? '<span class="pill">' + A.esc(t("dial.save", { discount: A.pct(e.discount) })) + "</span>" : "") +
      "<p>" + A.esc(e.saving ? t("q.fu.was", { oneTime: A.dollars(e.oneTime), saving: A.dollars(e.saving) }) : t("q.fu.full", { oneTime: A.dollars(e.oneTime) })) + " " +
      A.esc(t("q.fu.note", dimVars())) + "</p>";
  }

  // Tabs above "Where's the home?" for the deep-clean visits: a first deep clean, or a follow-up after a recent one.
  var TAB_IDS = ["deep", "followup"];
  function renderTabs() {
    var box = $("[data-service-tabs]");
    var on = TAB_IDS.indexOf(draft.service) !== -1;
    box.hidden = !on;
    if (!on) return;
    box.innerHTML = '<div class="seg" role="group" aria-label="' + A.esc(t("q.tabs.label")) + '">' + TAB_IDS.map(function (id) {
      var s = singleClean(id);
      return '<button type="button" class="seg-btn" data-tab="' + id + '" aria-pressed="' + (draft.service === id) + '"><span class="seg-label">' + A.esc(L(s.name)) + "</span></button>";
    }).join("") + '</div><p class="step-intro">' + A.esc(L(singleClean(draft.service).description)) + "</p>";
    $all("[data-tab]", box).forEach(function (b) {
      b.addEventListener("click", function () {
        draft.service = b.getAttribute("data-tab");
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
    renderTabs();
    $("[data-freq-field]").hidden = single;
    $("[data-estimate]").hidden = single;
    $("[data-single-note]").hidden = !single || draft.service === "followup";
    renderFollowUp();
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
      if (!validZip(zip)) { setError("zip", t("err.zip")); note.hidden = true; return false; }
      var served = !C.serviceZips.length || C.serviceZips.indexOf(zip) !== -1;
      draft.outOfArea = !served;
      if (!served) {
        $all("[data-out-zip]").forEach(function (el) { el.textContent = zip; });
        if (note.hidden) { note.hidden = false; return false; } // first click shows the note; second continues
      } else {
        note.hidden = true;
      }
    }
    if (step === 4) {
      if (form.elements.company) {
        if (!value("company")) { setError("company", t("err.company")); ok = false; } else setError("company", "");
      }
      if (!value("name")) { setError("name", t("err.name")); ok = false; } else setError("name", "");
      if (!validEmail(value("email"))) { setError("email", t("err.email")); ok = false; } else setError("email", "");
      var method = checked("contactMethod")[0];
      if ((method === "Text" || method === "Call") && value("phone").replace(/\D/g, "").length < 10) {
        setError("phone", t("err.phone." + method)); ok = false;
      } else setError("phone", "");
    }
    return ok;
  }

  // ---------- review ----------
  function unitKey(dimId) { return dimId === "bedrooms" ? "bedroom" : dimId === "bathrooms" ? "bathroom" : dimId; }
  function summary() {
    var s = A.state;
    var extra = checked(Q.extraField)[0];
    var size = C.dims.map(function (d) { return A.num(s[d.id]) + " " + I.plural("unit." + unitKey(d.id), s[d.id]); }).join(", ");
    var rows = [
      [t("review.home"), t("review.in", { type: t("q." + Q.typeField + "." + checked(Q.typeField)[0]), zip: value("zip") }) + (draft.outOfArea ? " " + t("review.outside") : ""), 1],
      [t("review.size"), size + (extra ? ", " + t("review." + Q.extraField + "." + extra) : ""), 2],
    ];
    if (form.elements.company) rows.push([t("review.company"), value("company"), 4]);
    if (draft.service) {
      if (draft.service === "followup") {
        var fu = fuEstimate(draft.recency);
        rows.push([t("review.service"), L(singleClean("followup").name), 3]);
        rows.push([t("review.fuTiming"), L(fuTier(draft.recency).label), 3]);
        rows.push([t("review.estimate"), fu.saving
          ? t("review.fuEstimateV", { price: A.dollars(fu.perVisit), pct: A.pct(fu.discount), oneTime: A.dollars(fu.oneTime) })
          : t("review.fuEstimateFull", { price: A.dollars(fu.perVisit) }), 3]);
      } else {
        rows.push([t("review.service"), L(singleClean(draft.service).name) + ", " + t("review.quoted"), 3]);
      }
    } else {
      var e = A.estimate(s.plan, s, s.frequency);
      var f = A.frequency(s.frequency);
      rows.push([t("review.plan"), L(A.plan(s.plan).name) + ", " + L(f.label).toLowerCase(), 3]);
      rows.push([t("review.estimate"), e.saving
        ? t("review.estimateV", { perVisit: A.dollars(e.perVisit), unit: e.perVisitLabel, pct: A.pct(e.discount), oneTime: A.dollars(e.oneTime), perMonth: e.perMonth === null ? "" : A.dollars(e.perMonth) })
        : A.dollars(e.perVisit) + " " + e.perVisitLabel, 3]);
    }
    if (refApplied()) rows.push([t("review.referral"), t("review.referralV", { code: draft.ref, amount: A.dollars(friendAmount()) }), 4]);
    var method = checked("contactMethod")[0];
    rows.push([t("review.contact"), value("name") + ", " + value("email") + (value("phone") ? ", " + value("phone") : "") + ". " + t("review.prefers." + method), 4]);
    var days = checked("days"), tod = checked("timeOfDay")[0];
    rows.push([t("review.timing"), draft.date ? whenText()
      : (days.length ? days.map(function (d) { return t("q.day." + d); }).join(", ") : t("review.anyDay")) + ", " + t("review.time." + tod), 5]);
    if (value("notes")) rows.push([t("review.notes"), value("notes"), 2]);
    return rows;
  }
  function renderReview(target, editable) {
    target.innerHTML = summary().map(function (r) {
      return '<div class="review-row"><dt>' + A.esc(r[0]) + "</dt><dd>" + A.esc(r[1]) + "</dd>" +
        (editable ? '<button type="button" data-goto="' + r[2] + '">' + A.esc(t("q.change")) + "</button>" : "") + "</div>";
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
    if (n === 5) renderWhen();
    if (n === REVIEW) renderReview($("[data-review]"), true);
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
      language: I.lang,
      segment: C.segment,
      zip: value("zip"), outOfArea: draft.outOfArea, notes: value("notes"),
      name: value("name"), email: value("email"), phone: value("phone"),
      contactMethod: checked("contactMethod")[0], days: checked("days"), timeOfDay: checked("timeOfDay")[0],
    };
    p[Q.typeField] = checked(Q.typeField)[0];
    p[Q.extraField] = checked(Q.extraField)[0];
    if (form.elements.company) p.company = value("company");
    C.dims.forEach(function (d) { p[d.id] = s[d.id]; });
    p.date = draft.date || ""; p.slot = draft.slot || "";
    if (refApplied()) { p.ref = draft.ref; p.refAmount = friendAmount(); }
    if (draft.date) p.requestedTime = whenText();
    if (draft.service) {
      p.service = singleClean(draft.service).name.en;
      if (draft.service === "followup") {
        var fu = fuEstimate(draft.recency);
        p.deepCleanWithin = fuTier(draft.recency).label.en;
        p.estimateOneVisit = fu.perVisit; p.estimateFullPrice = fu.oneTime; p.discount = fu.discount;
      }
    } else {
      var e = A.estimate(s.plan, s, s.frequency);
      p.plan = A.plan(s.plan).name.en; p.frequency = A.frequency(s.frequency).label.en;
      p.estimatePerVisit = e.perVisit; p.estimateFullPrice = e.oneTime; p.discount = e.discount;
      if (e.perMonth !== null) p.estimatePerMonth = e.perMonth;
    }
    p._subject = (C.segment === "commercial" ? "Commercial quote request: " : "Quote request: ") + (p.company ? p.company + ", " : "") + (p.service || p.plan + ", " + p.frequency) + " (ZIP " + p.zip + ")";
    return p;
  }

  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    if (current !== REVIEW) return;
    var btn = $("[data-submit]");
    setError("submit", "");
    btn.disabled = true; btn.textContent = t("q.sending");

    function done(demo) {
      renderReview($("[data-review-done]"), false);
      $("[data-demo-note]").hidden = !demo;
      clearDraft();
      go("done");
    }
    function fail() {
      btn.disabled = false; btn.textContent = t("q.send");
      var alt = C.business.email ? t("err.submitAlt", { email: C.business.email }) : "";
      setError("submit", t("err.submit", { alt: alt }));
    }

    var data = payload();
    // Optional copy to an email form service, on top of the database.
    function mailCopy() {
      if (!C.formEndpoint) return Promise.resolve(true);
      return fetch(C.formEndpoint, {
        method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(data),
      }).then(function (r) { return r.ok; }).catch(function () { return false; });
    }
    B.ready.then(function (live) {
      if (!live) {
        if (!C.formEndpoint) { setTimeout(function () { done(true); }, 400); return; }
        return mailCopy().then(function (ok) { ok ? done(false) : fail(); });
      }
      return B.submitRequest(data).catch(function (err) {
        if (!data.ref) throw err;
        // Most likely the invite was refused (your own code, or one that was removed): send the request without it.
        var plain = Object.assign({}, data); delete plain.ref; delete plain.refAmount; plain.refDropped = data.ref;
        data = plain; return B.submitRequest(plain);
      }).then(function (id) {
        $all("[data-request-id]").forEach(function (el) { el.textContent = id.slice(0, 6).toUpperCase(); });
        if (data.ref) { note('[data-step="done"]', "data-done-ref", t("q.done.refNote", { amount: A.dollars(friendAmount()) }), "[data-review-done]"); INV.forget(); }
        return mailCopy().then(function () { done(false); });
      }).catch(function (err) {
        if (window.console) console.warn("request not saved", err);
        // Firebase refused (rules not deployed yet, offline): still try the email copy.
        if (C.formEndpoint) return mailCopy().then(function (ok) { ok ? done(false) : fail(); });
        fail();
      });
    });
  });

  // ---------- start ----------
  function init() {
    loadDraft();
    renderPlanOptions();
    var q = new URLSearchParams(location.search);
    if (singleClean(q.get("service"))) draft.service = q.get("service");
    else if (q.get("single")) draft.service = "deep"; // older links: ?single=1
    else if (q.get("plan")) draft.service = null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(q.get("date") || "")) { draft.date = q.get("date"); draft.slot = q.get("slot") || ""; }
    var clearBtn = $("[data-when-clear]");
    if (clearBtn) clearBtn.addEventListener("click", function () { draft.date = ""; draft.slot = ""; if (cal) cal.set(draft); renderWhenSummary(); saveDraft(); });
    initRef(); watchCredit();
    A.render();
    renderTabs();
    A.onChange(function () { if (current === 3) syncPlanUI(); });
    document.addEventListener("mkg:langchange", function () {
      renderPlanOptions();
      A.render();
      renderTabs();
      renderFollowUp();
      if (current === 3) syncPlanUI();
      showRefStatus(); creditNotes();
      if (current === 5) renderWhenSummary();
      if (current === REVIEW) renderReview($("[data-review]"), true);
      if (current === "done") renderReview($("[data-review-done]"), false);
      var btn = $("[data-submit]");
      if (btn && !btn.disabled) btn.textContent = t("q.send");
    });
    go(1);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
