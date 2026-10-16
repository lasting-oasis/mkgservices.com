#!/usr/bin/env python3
"""Builds availability.html, account.html, admin.html, privacy.html and terms.html
from the shared chrome (head, top bar, header, footer) in quote.html, so the
new pages stay in step with the rest of the site. Run from the repo root:

    python3 docs/make-pages.py
"""
import re, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
base = (ROOT / "quote.html").read_text()

head = base[: base.index("  <link rel=\"stylesheet\"")]
head = head[head.index("  <link rel=\"preconnect\""):]           # fonts, icons, theme-color
head = re.sub(r'  <link rel="canonical".*?<meta name="twitter:card" content="summary">\n', "", head, flags=re.S)
topbar = base[base.index('  <div class="topbar">'): base.index("  <header")]
header = base[base.index("  <header"): base.index("  <main")]
footer = base[base.index("  <footer"): base.index("  <script")]

# Footer: add the new links everywhere later (index etc. are patched separately); here just build.
footer = footer.replace(
    '        <a href="commercial.html" data-i18n="nav.commercial">Commercial</a>\n      </nav>',
    '        <a href="commercial.html" data-i18n="nav.commercial">Commercial</a>\n'
    '        <a href="availability.html" data-i18n="nav.availability">Availability</a>\n'
    '        <a href="account.html" data-i18n="nav.account">Client sign-in</a>\n'
    '        <a href="privacy.html" data-i18n="nav.privacy">Privacy</a>\n'
    '        <a href="terms.html" data-i18n="nav.terms">Terms</a>\n      </nav>')
header = header.replace(' aria-current="page"', "")
header = header.replace(
    '        <a href="commercial.html" data-i18n="nav.commercial">Commercial</a>\n',
    '        <a href="availability.html" data-i18n="nav.availability">Availability</a>\n'
    '        <a href="commercial.html" data-i18n="nav.commercial">Commercial</a>\n')


def page(name, title_key, title, desc, body, scripts, noindex=False, extra_head=""):
    canon = "" if noindex else f'  <link rel="canonical" href="https://mkgservices.com/{name}">\n'
    robots = '  <meta name="robots" content="noindex">\n' if noindex else ""
    html = f'''<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title data-i18n="{title_key}">{title} | MKG Services</title>
  <meta name="description" data-i18n-attr="content:{title_key}.desc" content="{desc}">
{robots}{head}{canon}{extra_head}  <link rel="stylesheet" href="styles.css?v=13">
</head>
<body>
{topbar}{header}{body}
{footer}{scripts}</body>
</html>
'''
    (ROOT / name).write_text(html)
    print("wrote", name)


SCRIPTS = '''  <script src="plans.js?v=13"></script>
  <script src="i18n.js?v=13"></script>
  <script src="app.js?v=13"></script>
  <script src="backend.js?v=13"></script>
  <script src="calendar.js?v=13"></script>
'''

# ---------------------------------------------------------------- availability
page("availability.html", "meta.title.availability", "Availability",
     "See which days and start windows are still open for a cleaning in Charlotte, then request the one you want.",
     '''  <main>
    <section class="page-head">
      <div class="container">
        <h1 class="display" data-i18n="avail.h1">Open days and start windows</h1>
        <p class="lead" data-i18n="avail.lead">Pick a day to see which windows are still free. Choose one and we'll carry it into your quote request.</p>
      </div>
    </section>
    <section class="section" style="padding-top: 0;">
      <div class="container avail-grid">
        <div>
          <div class="seg avail-seg" role="group" data-i18n-attr="aria-label:avail.for" aria-label="Type of space">
            <button type="button" class="seg-btn" data-avail-seg="residential" aria-pressed="true"><span class="seg-label" data-i18n="avail.home">Home</span></button>
            <button type="button" class="seg-btn" data-avail-seg="commercial" aria-pressed="false"><span class="seg-label" data-i18n="avail.business">Business</span></button>
          </div>
          <div data-calendar></div>
        </div>
        <aside class="avail-side">
          <h2 class="title" style="font-size:1.4rem" data-i18n="avail.yourPick">Your pick</h2>
          <p class="when-summary" data-when-summary></p>
          <a class="btn btn-block" data-avail-cta href="quote.html" hidden data-i18n="avail.cta">Request this window</a>
          <p class="field-hint" data-i18n="avail.note">A window shows as full once as many jobs as we can start in it are requested. Picking one holds nothing yet; we confirm when we reply.</p>
          <h3 style="font-size:1.05rem; margin-top: 10px" data-i18n="avail.windowsH">Start windows</h3>
          <ul class="avail-windows" data-avail-windows></ul>
        </aside>
      </div>
    </section>
  </main>''',
     SCRIPTS + '  <script src="availability.js?v=13"></script>\n')

# ---------------------------------------------------------------- account
page("account.html", "meta.title.account", "Your account",
     "Sign in with your email to see the status of your cleaning requests from MKG Services.",
     '''  <main class="quote-wrap">
    <div class="container">
      <div class="quote-card">
        <section class="step" data-acct="loading">
          <h1 class="title" data-i18n="acct.h1">Your requests</h1>
          <p class="muted" data-i18n="acct.loading">One moment…</p>
        </section>

        <section class="step" data-acct="signin" hidden>
          <h1 class="title" data-i18n="acct.h1">Your requests</h1>
          <p class="step-intro" data-i18n="acct.lead">No password to remember. Enter the email you used on your quote request and we'll send you a sign-in link.</p>
          <form data-acct-form novalidate>
            <div class="field">
              <label for="acct-email" data-i18n="q.email">Email</label>
              <input class="input" id="acct-email" name="email" type="email" autocomplete="email" inputmode="email">
              <p class="field-error" data-error="email"></p>
            </div>
            <div class="step-actions" style="justify-content:flex-start">
              <button class="btn" type="submit" data-i18n="acct.sendLink">Email me a sign-in link</button>
            </div>
          </form>
          <p class="notice" data-acct-sent hidden data-i18n="acct.sent">Check your inbox. The link signs you in on this device; it's good for a short while.</p>
          <p class="notice" data-acct-offline hidden data-i18n="acct.offline">Sign-in isn't available on this copy of the site.</p>
        </section>

        <section class="step" data-acct="confirm" hidden>
          <h1 class="title" data-i18n="acct.confirmH">Confirm your email</h1>
          <p class="step-intro" data-i18n="acct.confirmP">You opened the sign-in link on a different device. Enter the same email to finish.</p>
          <form data-acct-confirm novalidate>
            <div class="field">
              <label for="acct-email2" data-i18n="q.email">Email</label>
              <input class="input" id="acct-email2" name="email" type="email" autocomplete="email" inputmode="email">
              <p class="field-error" data-error="email2"></p>
            </div>
            <div class="step-actions" style="justify-content:flex-start">
              <button class="btn" type="submit" data-i18n="acct.finish">Sign in</button>
            </div>
          </form>
        </section>

        <section class="step" data-acct="list" hidden>
          <div class="acct-bar">
            <div>
              <h1 class="title" data-i18n="acct.h1">Your requests</h1>
              <p class="muted"><span data-i18n="acct.signedInAs">Signed in as</span> <b data-acct-email></b></p>
            </div>
            <button type="button" class="btn btn-secondary btn-sm" data-acct-signout data-i18n="acct.signOut">Sign out</button>
          </div>
          <div class="acct-list" data-acct-list></div>
          <p class="notice" data-acct-empty hidden data-i18n="acct.empty">Nothing under this email yet. {quoteLink}</p>
          <p class="field-hint" data-i18n="acct.help">Questions about a request? Call or text {phone}, or email {email}.</p>
        </section>
      </div>
    </div>
  </main>''',
     SCRIPTS + '  <script src="account.js?v=13"></script>\n', noindex=True)

# ---------------------------------------------------------------- admin
page("admin.html", "meta.title.admin", "Admin",
     "MKG Services admin: quote requests and the booking calendar.",
     '''  <main class="quote-wrap admin">
    <div class="container">
      <section class="quote-card" data-admin="login">
        <h1 class="title" data-i18n="adm.h1">Admin sign-in</h1>
        <p class="step-intro" data-i18n="adm.lead">For MKG Services staff. Clients sign in on the account page.</p>
        <form data-admin-form novalidate class="step">
          <div class="field">
            <label for="adm-email" data-i18n="q.email">Email</label>
            <input class="input" id="adm-email" name="email" type="email" autocomplete="username">
          </div>
          <div class="field">
            <label for="adm-pass" data-i18n="adm.password">Password</label>
            <input class="input" id="adm-pass" name="password" type="password" autocomplete="current-password">
          </div>
          <p class="field-error" data-error="login"></p>
          <div class="step-actions" style="justify-content:flex-start">
            <button class="btn" type="submit" data-i18n="adm.signIn">Sign in</button>
          </div>
        </form>
        <p class="notice" data-admin-offline hidden data-i18n="adm.offline">This copy of the site isn't connected to Firebase, so there's nothing to sign in to.</p>
        <p class="notice" data-admin-notadmin hidden data-i18n="adm.notAdmin">This account isn't on the admin list. See docs/SETUP-firebase.md for how to add it.</p>
      </section>

      <section data-admin="dash" hidden>
        <div class="acct-bar">
          <div>
            <h1 class="title" data-i18n="adm.dashH">Requests and calendar</h1>
            <p class="muted"><span data-i18n="acct.signedInAs">Signed in as</span> <b data-admin-email></b></p>
          </div>
          <button type="button" class="btn btn-secondary btn-sm" data-admin-signout data-i18n="acct.signOut">Sign out</button>
        </div>

        <div class="admin-grid">
          <div>
            <div class="seg admin-filter" role="group">
              <button type="button" class="seg-btn" data-filter="new" aria-pressed="true"><span class="seg-label" data-i18n="status.new">New</span><span class="seg-off" data-count="new">0</span></button>
              <button type="button" class="seg-btn" data-filter="confirmed" aria-pressed="false"><span class="seg-label" data-i18n="status.confirmed">Confirmed</span><span class="seg-off" data-count="confirmed">0</span></button>
              <button type="button" class="seg-btn" data-filter="done" aria-pressed="false"><span class="seg-label" data-i18n="adm.finished">Finished</span><span class="seg-off" data-count="done">0</span></button>
              <button type="button" class="seg-btn" data-filter="all" aria-pressed="false"><span class="seg-label" data-i18n="adm.all">All</span><span class="seg-off" data-count="all">0</span></button>
            </div>
            <div class="admin-list" data-admin-list></div>
            <p class="muted" data-admin-empty hidden data-i18n="adm.empty">Nothing here.</p>
          </div>
          <aside class="admin-cal">
            <h2 class="title" style="font-size:1.3rem" data-i18n="adm.calH">Calendar</h2>
            <p class="field-hint" data-i18n="adm.calHint">Click a day to close it, block a window, or add a booking you took by phone.</p>
            <div data-calendar></div>
            <div class="admin-day" data-admin-day></div>
          </aside>
        </div>
      </section>
    </div>
  </main>''',
     SCRIPTS + '  <script src="admin.js?v=13"></script>\n', noindex=True)

# ---------------------------------------------------------------- legal
def legal(name, key, title, desc, sections):
    body = ['  <main>\n    <section class="page-head">\n      <div class="container">',
            f'        <h1 class="display" data-i18n="{key}.h1">{title}</h1>',
            f'        <p class="lead" data-i18n="{key}.lead">{desc}</p>',
            f'        <p class="muted" data-i18n="{key}.updated">Last updated October 16, 2026.</p>',
            '      </div>\n    </section>\n    <section class="section legal" style="padding-top: 0;">\n      <div class="container legal-body">']
    for i, (h, ps) in enumerate(sections, 1):
        body.append(f'        <h2 data-i18n="{key}.{i}.h">{h}</h2>')
        for j, p in enumerate(ps, 1):
            body.append(f'        <p data-i18n="{key}.{i}.p{j}">{p}</p>')
    body.append('      </div>\n    </section>\n  </main>')
    page(name, f"meta.title.{key}", title, desc, "\n".join(body),
         '  <script src="plans.js?v=13"></script>\n  <script src="i18n.js?v=13"></script>\n  <script src="app.js?v=13"></script>\n')

legal("privacy.html", "privacy", "Privacy policy",
      "What MKG Services collects when you use this site, why, and how to have it removed.", [
    ("What we collect", [
        "When you request a quote we collect what you type into the form: your name, email, phone number if you give it, ZIP code, details about the home or building, the plan and schedule you chose, any day and time window you picked, and your notes.",
        "The price calculator keeps your size and schedule choices in your browser so the pages agree with each other. Your quote draft is kept in the browser only until you close the tab.",
    ]),
    ("How we use it", [
        "To reply with a price, confirm a day and time, do the work, and bill for it. We don't sell or rent your details, and we don't use them for advertising.",
        "If you sign in on the account page, we use your email address only to show you your own requests.",
    ]),
    ("Where it's kept", [
        "Requests are stored in Google Firebase on servers in the United States, protected by access rules so that only MKG Services staff and the person who made the request (signed in with the same email) can read them. Page fonts load from Google Fonts, which sees your IP address like any web server does.",
    ]),
    ("Your choices", [
        "Email {email} to see what we hold about you or to have it deleted. We keep request records for as long as we may need them for scheduling, billing, and tax purposes, then delete them.",
    ]),
])

legal("terms.html", "terms", "Terms of service",
      "The plain-language terms for cleaning services from MKG Services, LLC.", [
    ("Estimates and prices", [
        "Prices on this site are estimates based on what you tell us. The exact price is confirmed in our reply, or after a walk-through for commercial spaces and single cleans, before any work starts.",
    ]),
    ("Requests, confirmations, and changes", [
        "Sending a request or picking a day on the calendar does not book a visit. A visit is booked when we confirm it with you. You can change or cancel a confirmed visit free of charge with at least 24 hours' notice; later than that, we may charge up to half the visit price.",
        "Recurring plans have no contract. Pause or stop with a week's notice.",
    ]),
    ("Our work", [
        "We bring our own supplies and equipment unless we agree otherwise. If something isn't right, tell us within 24 hours and we'll come back and fix it at no charge. We're insured; damage caused by our team is reported to you the same day.",
    ]),
    ("Payment", [
        "Payment is due at or after each visit, by the method we agree on, including online payment where offered. Unpaid balances may pause service.",
    ]),
    ("Contact", [
        "MKG Services, LLC, Charlotte, North Carolina. Call or text {phone}, or email {email}.",
    ]),
])
