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
if 'href="privacy.html"' not in footer:
  footer = footer.replace(
    '        <a href="commercial.html" data-i18n="nav.commercial">Commercial</a>\n      </nav>',
    '        <a href="commercial.html" data-i18n="nav.commercial">Commercial</a>\n'
    '        <a href="availability.html" data-i18n="nav.availability">Availability</a>\n'
    '        <a href="refer.html" data-i18n="nav.refer">Refer a friend</a>\n'
    '        <a href="account.html" data-i18n="nav.account">Client sign-in</a>\n'
    '        <a href="privacy.html" data-i18n="nav.privacy">Privacy</a>\n'
    '        <a href="terms.html" data-i18n="nav.terms">Terms</a>\n      </nav>')
header = header.replace(' aria-current="page"', "")
if 'href="availability.html"' not in header:   # quote.html already has it once the link was added
    header = header.replace(
        '        <a href="commercial.html" data-i18n="nav.commercial">Commercial</a>\n',
        '        <a href="availability.html" data-i18n="nav.availability">Availability</a>\n'
        '        <a href="commercial.html" data-i18n="nav.commercial">Commercial</a>\n')


def page(name, title_key, title, desc, body, scripts, noindex=False, extra_head="", body_attrs=""):
    canon = "" if noindex else f'  <link rel="canonical" href="https://mkgservices.com/{name}">\n'
    robots = '  <meta name="robots" content="noindex">\n' if noindex else ""
    html = f'''<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title data-i18n="{title_key}">{title} | MKG Services</title>
  <meta name="description" data-i18n-attr="content:{title_key}.desc" content="{desc}">
{robots}{head}{canon}{extra_head}  <link rel="stylesheet" href="styles.css?v=14">
</head>
<body{body_attrs}>
{topbar}{header}{body}
{footer}{scripts}</body>
</html>
'''
    (ROOT / name).write_text(html)
    print("wrote", name)


SCRIPTS = '''  <script src="plans.js?v=14"></script>
  <script src="i18n.js?v=14"></script>
  <script src="app.js?v=14"></script>
  <script src="backend.js?v=14"></script>
  <script src="calendar.js?v=14"></script>
  <script src="referral.js?v=14"></script>
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
     SCRIPTS + '  <script src="availability.js?v=14"></script>\n', body_attrs=" data-ref-banner")

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
          <section class="ref-panel" data-ref-panel hidden>
            <div class="ref-balance">
              <div>
                <p class="ref-label" data-i18n="ref.balanceH">Your credit</p>
                <p class="ref-amount" data-ref-balance>$0</p>
                <p class="ref-stat" data-ref-friends></p>
              </div>
              <p class="muted" data-i18n="ref.balanceP">It comes off the price of your next visit, and it stacks: every friend adds more.</p>
            </div>
            <div class="ref-invite">
              <h2 class="title" data-i18n="acct.refH">Invite a friend, earn credit</h2>
              <p class="step-intro" data-i18n="acct.refP">Share your link or QR code. Your friend gets money off their first visit, and you earn credit when it's done. Credit stacks: every friend adds more.</p>
              <ul class="ref-rewards">
                <li data-i18n="ref.rewardsHome">Homes: your friend gets {homeFriend} off, you earn {homeReferrer}.</li>
                <li data-i18n="ref.rewardsBiz">Businesses: your friend gets {bizFriend} off, you earn {bizReferrer}.</li>
              </ul>
              <div class="ref-share" data-ref-share-box><p class="muted" data-i18n="ref.creating">Setting up your code…</p></div>
              <p class="field-error" data-ref-error></p>
            </div>
            <div class="ref-history">
              <h3 data-i18n="ref.history">Credit history</h3>
              <ul class="ref-ledger" data-ref-ledger></ul>
            </div>
          </section>
          <h2 class="title ref-reqs-h" data-i18n="acct.h1">Your requests</h2>
          <div class="acct-list" data-acct-list></div>
          <p class="notice" data-acct-empty hidden data-i18n="acct.empty">Nothing under this email yet. {quoteLink}</p>
          <p class="field-hint" data-i18n="acct.help">Questions about a request? Call or text {phone}, or email {email}.</p>
        </section>
      </div>
    </div>
  </main>''',
     SCRIPTS + '  <script src="vendor/qrcode.js?v=14"></script>\n  <script src="account.js?v=14"></script>\n', noindex=True)

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

        <div class="seg admin-tabs" role="group">
          <button type="button" class="seg-btn" data-view-tab="requests" aria-pressed="true"><span class="seg-label" data-i18n="adm.tab.requests">Requests</span></button>
          <button type="button" class="seg-btn" data-view-tab="credits" aria-pressed="false"><span class="seg-label" data-i18n="adm.tab.credits">Credits</span><span class="seg-off" data-credit-total></span></button>
        </div>

        <div class="admin-credits" data-view="credits" hidden>
          <div>
            <div class="field">
              <label for="credit-search" data-i18n="adm.credit.search">Find by email</label>
              <input class="input" id="credit-search" data-credit-search type="search" autocomplete="off">
            </div>
            <h3 style="margin-top:18px" data-i18n="adm.credit.balances">Balances</h3>
            <div class="admin-balances" data-credit-balances></div>
            <p class="muted" data-credit-none hidden data-i18n="adm.credit.none">No credit entries yet.</p>
          </div>
          <div>
            <div data-credit-detail><p class="muted" data-i18n="adm.credit.pick">Pick someone on the left to see their history.</p></div>
            <form class="admin-credit-form" data-credit-form novalidate>
              <h3 data-i18n="adm.credit.addH">Add or remove credit</h3>
              <div class="field"><label for="cf-email" data-i18n="q.email">Email</label><input class="input" id="cf-email" name="email" type="email"></div>
              <div class="two-up">
                <div class="field"><label for="cf-amount" data-i18n="adm.credit.amount">Amount (a minus removes credit)</label><input class="input" id="cf-amount" name="amount" inputmode="decimal"></div>
                <div class="field"><label for="cf-note" data-i18n="adm.credit.note">Note (only you see this)</label><input class="input" id="cf-note" name="note"></div>
              </div>
              <p class="field-error" data-error="credit"></p>
              <p><button class="btn btn-sm" type="submit" data-i18n="adm.credit.add">Add entry</button></p>
            </form>
          </div>
        </div>

        <div class="admin-grid" data-view="requests">
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
     SCRIPTS + '  <script src="admin.js?v=14"></script>\n', noindex=True)

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
         '  <script src="plans.js?v=14"></script>\n  <script src="i18n.js?v=14"></script>\n  <script src="app.js?v=14"></script>\n  <script src="referral.js?v=14"></script>\n')

legal("privacy.html", "privacy", "Privacy policy",
      "What MKG Services collects when you use this site, why, and how to have it removed.", [
    ("What we collect", [
        "When you request a quote we collect what you type into the form: your name, email, phone number if you give it, ZIP code, details about the home or building, the plan and schedule you chose, any day and time window you picked, and your notes.",
        "The price calculator keeps your size and schedule choices in your browser so the pages agree with each other. Your quote draft is kept in the browser only until you close the tab.",
        "If a friend invites you, or you invite friends, we keep the code that was used so we can give the credit. Nobody sees another person's details; the person who invited you only learns that credit was earned.",
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
    ("Referral credit", [
        "Referral credit is for first-time customers and comes off the price of a visit when we confirm it. It stacks with no limit, doesn't expire, has no cash value, and can't be moved to another account. We may remove credit that was earned by referring yourself, your household, or your own business, and we may change or end the program at any time; credit already earned stays yours.",
    ]),
    ("Contact", [
        "MKG Services, LLC, Charlotte, North Carolina. Call or text {phone}, or email {email}.",
    ]),
])


# ---------------------------------------------------------------- refer
page("refer.html", "meta.title.refer", "Refer a friend",
     "Invite a friend to MKG Services. They save on their first visit and you earn cleaning credit that stacks.",
     '''  <main>
    <section class="page-head">
      <div class="container">
        <h1 class="display" data-i18n="refer.h1">Refer a friend, earn cleaning credit</h1>
        <p class="lead" data-i18n="refer.lead">Your friend gets money off their first visit. You earn credit toward your next one. Invite as many people as you like; the credit stacks.</p>
        <p style="margin-top:22px"><a class="btn" href="account.html" data-i18n="refer.cta">Get my invite link</a></p>
      </div>
    </section>
    <section class="section" style="padding-top: 0;">
      <div class="container">
        <table class="ref-table">
          <thead><tr><th></th><th data-i18n="refer.col.friend">Your friend gets</th><th data-i18n="refer.col.you">You earn</th></tr></thead>
          <tbody>
            <tr><th scope="row" data-i18n="refer.row.home">Homes</th><td><b data-ref-amount="friend" data-ref-seg="residential"></b></td><td><b data-ref-amount="referrer" data-ref-seg="residential"></b></td></tr>
            <tr><th scope="row" data-i18n="refer.row.biz">Businesses</th><td><b data-ref-amount="friend" data-ref-seg="commercial"></b></td><td><b data-ref-amount="referrer" data-ref-seg="commercial"></b></td></tr>
          </tbody>
        </table>

        <h2 class="title" style="margin: 48px 0 20px" data-i18n="refer.how.h">How it works</h2>
        <ol class="ref-steps">
          <li><h3 data-i18n="refer.how.1.h">Get your link</h3><p data-i18n="refer.how.1.p">Sign in with your email. Your personal code, link, and QR code are ready in seconds.</p></li>
          <li><h3 data-i18n="refer.how.2.h">Share it</h3><p data-i18n="refer.how.2.p">Text it, post it, or let a friend scan the QR code from your phone.</p></li>
          <li><h3 data-i18n="refer.how.3.h">You both save</h3><p data-i18n="refer.how.3.p">When your friend's first visit is confirmed, their welcome credit is added. When it's done, yours is. A few friends can cover a whole clean.</p></li>
        </ol>
        <p class="notice" style="margin-top: 28px" data-i18n="refer.haveCode">Got a code from a friend? Open their link, or enter the code on the quote form.</p>

        <h2 class="title" style="margin: 48px 0 16px" data-i18n="refer.rules.h">The fine print, in plain words</h2>
        <ul class="ref-rules">
          <li data-i18n="refer.rules.1">Credit is for new customers: your friend must not have had a visit with us before.</li>
          <li data-i18n="refer.rules.2">Your friend's credit is added when we confirm their first visit. Yours is added when that visit is done.</li>
          <li data-i18n="refer.rules.3">Credit stacks with no limit and doesn't expire. It comes off the price of a visit when we confirm it, up to {maxPct} of that visit's price. It can't be paid out as cash or moved to another account.</li>
          <li data-i18n="refer.rules.4">You can't refer yourself, your household, or your own business, and we may remove credit earned that way.</li>
          <li data-i18n="refer.rules.5">We may change or end the program at any time. Credit you've already earned stays yours.</li>
        </ul>
      </div>
    </section>
  </main>''',
     '  <script src="plans.js?v=14"></script>\n  <script src="i18n.js?v=14"></script>\n  <script src="app.js?v=14"></script>\n  <script src="referral.js?v=14"></script>\n')
