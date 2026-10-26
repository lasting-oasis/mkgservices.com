/*
  Leave-behind cards: a printable card the team leaves after a visit, in the
  client's language, with their invite code and a QR code for a friend.

  Four cards per letter page (4.25 x 5.5 in each), cut on the dashed lines.
  A client who already has an invite code (they signed in on account.html)
  gets "pass this card to a friend" with their code and their invite link
  as the QR. A client without one gets "earn cleaning credit" with a QR to
  the sign-in page, where their code is made the first time they sign in.

  Used from admin.html: MKG.leaveBehind.print(requests).
  Needs vendor/qrcode.js and referral.js (MKG.invite) on the page.
*/
(function () {
  "use strict";
  var C = window.MKG, I = C && C.i18n, B = C && C.backend, A = C && C.app, INV = C && C.invite;
  if (!I || !B || !A || !INV) return;
  var t = I.t, esc = A.esc;

  // Links on the card go to the live site; the logo comes from wherever this page is served.
  function site() { return (C.siteUrl || location.origin).replace(/\/$/, ""); }
  // Text in the client's language, whatever language the admin page is in.
  function tr(lang, key, vars) {
    var s = (I.dictionaries[lang] || {})[key];
    if (s === undefined) s = I.dictionaries.en[key];
    if (s === undefined) return key;
    return vars ? s.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] !== undefined ? vars[k] : m; }) : s;
  }
  function firstName(r) { return String(r.name || "").trim().split(/\s+/)[0] || ""; }
  function langOf(r) { return r.language === "es" ? "es" : "en"; }
  function segOf(r) { return r.segment === "commercial" ? "commercial" : "residential"; }

  // The client's invite code, if they have one (users/{uid}.emailLower is their email).
  function codeFor(r) {
    var email = String(r.emailLower || r.email || "").toLowerCase();
    if (!email) return Promise.resolve("");
    return B.db.collection("users").where("emailLower", "==", email).limit(1).get()
      .then(function (q) { return q.docs.length ? q.docs[0].data().code || "" : ""; })
      .catch(function () { return ""; });
  }

  function cardHtml(r, code) {
    var lang = langOf(r), seg = segOf(r), name = firstName(r);
    var phone = (C.business && C.business.phone) || "";
    var amounts = { friend: A.dollars(INV.amount("friend", seg)), referrer: A.dollars(INV.amount("referrer", seg)) };
    var h = '<section class="card" lang="' + lang + '">' +
      '<img class="logo" src="' + location.origin + '/brand/logo-full-320.png" alt="MKG Services">' +
      "<h2>" + esc(name ? tr(lang, "card.thanks", { name: name }) : tr(lang, "card.thanksAnon")) + "</h2>" +
      '<p class="done">' + esc(tr(lang, seg === "commercial" ? "card.doneBiz" : "card.doneHome")) + "</p>" +
      '<p class="fix">' + esc(tr(lang, "card.fix")) + " <b>" + esc(tr(lang, "card.contact", { phone: phone })) + "</b></p>";
    if (INV.enabled) {
      var link = code ? INV.linkFor(code, lang) : site() + "/account.html" + (lang === "es" ? "?lang=es" : "");
      h += '<div class="refer">' +
        "<h3>" + esc(tr(lang, code ? "card.shareH" : "card.getH")) + "</h3>" +
        "<p>" + esc(tr(lang, code ? "card.shareP" : "card.getP", amounts)) + "</p>" +
        '<div class="qr">' + INV.qrSvg(link) + "</div>" +
        (code ? '<p class="code"><span>' + esc(tr(lang, "card.codeLabel")) + "</span><b>" + esc(code.split("").join(" ")) + "</b></p>" : "") +
        "</div>";
    }
    return h + '<p class="foot">' + esc(site().replace(/^https?:\/\//, "")) + (phone ? " · " + esc(phone) : "") + "</p></section>";
  }

  var CSS =
    "@page{size:letter;margin:0}" +
    "*{box-sizing:border-box}" +
    "body{margin:0;font-family:'Segoe UI',system-ui,-apple-system,Helvetica,Arial,sans-serif;color:#0f2e2c;background:#e9efed}" +
    ".bar{padding:14px 20px;background:#fff;border-bottom:1px solid #d5e0dc;display:flex;gap:16px;align-items:center;flex-wrap:wrap}" +
    ".bar button{font:inherit;font-weight:700;background:#176b61;color:#fff;border:0;border-radius:999px;padding:8px 20px;cursor:pointer}" +
    ".bar p{margin:0;color:#4f6865;font-size:14px}" +
    ".sheet{width:8.5in;height:11in;margin:20px auto;background:#fff;display:grid;grid-template-columns:4.25in 4.25in;grid-template-rows:5.5in 5.5in;" +
      "page-break-after:always;break-after:page}" +
    ".sheet:last-child{page-break-after:auto;break-after:auto}" +
    ".card{border:1px dashed #b7c6c1;padding:.28in .3in .2in;display:flex;flex-direction:column;align-items:center;text-align:center;overflow:hidden}" +
    ".logo{width:.85in;height:.85in;object-fit:contain}" +
    "h2{font-size:17pt;margin:.06in 0 .02in;font-weight:800}" +
    ".done{font-size:9.5pt;margin:0 0 .06in}" +
    ".fix{font-size:8.5pt;margin:0;color:#35504c;line-height:1.3}" +
    ".refer{margin-top:.12in;padding-top:.1in;border-top:2px solid #e3c25b;width:100%;display:flex;flex-direction:column;align-items:center}" +
    "h3{font-size:12pt;margin:0 0 .03in;color:#176b61;font-weight:800}" +
    ".refer p{font-size:8.5pt;margin:0;line-height:1.3}" +
    ".qr{width:1.35in;height:1.35in;margin:.07in 0 .02in}.qr svg{width:100%;height:100%}" +
    ".code{display:flex;flex-direction:column;margin:0}.code span{font-size:7pt;text-transform:uppercase;letter-spacing:.08em;color:#4f6865}" +
    ".code b{font:800 16pt ui-monospace,Menlo,Consolas,monospace;color:#176b61}" +
    ".foot{margin-top:auto;font-size:7.5pt;color:#4f6865}" +
    "@media print{body{background:#fff}.bar{display:none}.sheet{margin:0}}";

  function page(cards, printNow) {
    var sheets = [];
    for (var i = 0; i < cards.length; i += 4) sheets.push('<div class="sheet">' + cards.slice(i, i + 4).join("") + "</div>");
    return "<!doctype html><html lang=\"" + I.lang + "\"><head><meta charset=\"utf-8\"><title>" + esc(t("adm.leaveCards")) + "</title>" +
      "<style>" + CSS + "</style></head><body>" +
      '<div class="bar"><button type="button" onclick="window.print()">' + esc(t("adm.leaveCardsPrint")) + "</button><p>" + esc(t("adm.leaveCardsHelp")) + "</p></div>" +
      sheets.join("") +
      (printNow ? "<script>window.addEventListener('load',function(){setTimeout(function(){window.print()},300)});<\/script>" : "") +
      "</body></html>";
  }

  // Opens the window right away (inside the click, so pop-up blockers allow it),
  // then fills it once every client's code has been looked up.
  function print(requests) {
    var list = (requests || []).filter(Boolean);
    if (!list.length) return;
    var w = window.open("", "_blank");
    if (!w) { alert(t("adm.leaveCardPopup")); return; }
    w.document.open();
    w.document.write("<!doctype html><meta charset=\"utf-8\"><title>MKG</title><p style=\"font:16px system-ui;padding:20px\">" + esc(t("adm.leaveCardsPreparing")) + "</p>");
    w.document.close();
    Promise.all(list.map(function (r) { return codeFor(r).then(function (code) { return cardHtml(r, code); }); })).then(function (cards) {
      if (w.closed) return;
      w.document.open();
      w.document.write(page(cards, true));
      w.document.close();
    });
  }

  C.leaveBehind = { print: print, cardHtml: cardHtml };
})();
