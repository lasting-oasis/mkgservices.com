# Turning on requests, the calendar, and sign-in (one-time setup)

The site now saves quote requests, shows live availability, and has an admin
page and a client sign-in. All of it runs on Firebase's free plan, in the same
project that hosts the site (`gen-lang-client-0946383119`). Nothing works until
these steps are done in the Firebase console, about 15 minutes.

Until then: the quote form tells visitors it couldn't send and shows the
business email instead, the calendar shows every window as open, and the
sign-in pages say they're not connected.

## 1. Create the database

1. Open https://console.firebase.google.com and pick the project.
2. In the left menu: **Build → Firestore Database → Create database**.
3. Location: **nam5 (United States)**. Mode: **Start in production mode**. Create.

## 2. Paste the access rules

1. Firestore Database → **Rules** tab.
2. Delete what's there, paste the whole contents of `firestore.rules` from the
   repository, and click **Publish**.

These rules are what keep customer details private: anyone can *send* a
request, but only an admin (step 4) and the customer who sent it can *read* it.
Repeat this step whenever `firestore.rules` changes in the repo (GitHub does
not deploy it automatically).

## 3. Turn on sign-in

1. **Build → Authentication → Get started**.
2. **Sign-in method** tab → **Email/Password** → turn on **Email/Password**
   *and* **Email link (passwordless sign-in)** → Save.
3. **Settings** tab → **Authorized domains**: make sure `mkgservices.com` and
   `www.mkgservices.com` are listed. Add them if not.

Clients sign in with Google, an email and password, or a one-time email link.
Staff use a password or Google (the Google provider is on by default in this
project).

## 4. Create the admin account

1. Authentication → **Users** tab → **Add user**: the business email and a
   strong password → Add user.
2. Copy the new user's **User UID** (the long string in the table).
3. Firestore Database → **Data** tab → **Start collection**:
   - Collection ID: `admins`
   - Document ID: paste the UID
   - Add two fields: `email` (string) = the same email, and `role` (string)
     = `owner` → Save.
4. Go to https://mkgservices.com/admin.html and sign in.

That account is the owner. To add more admins, open **Team** at the bottom
of the admin page's calendar column, type their email, and click Invite.
They sign in on the admin page with **Google** using that address (a
Google sign-in proves the email is theirs; a password alone does not) and
they're in. Remove anyone from the same list. The owner can't be removed
from the site; only the console can change that.

## 5. Emails to the business (set up)

The admin page is the inbox; the business also gets an email for:

- every new quote request, with the client's details, the day and window
  they picked, the site's estimate, and a link to the admin page;
- a client moving or cancelling a booking from their account (a confirmed
  visit that a client moves goes back to New, and the email says so).

Replying to one of these emails goes straight to the client (Reply-To is
their address). The emails are in English even when the client used the
Spanish site; those requests say "Language: Spanish".

They go through **Formspree**, form "MKG quote requests", owned by
mkgservices704@gmail.com. The endpoint is `formEndpoint` in `plans.js`
(`""` turns the emails off). The free plan covers 50 emails a month; past
that, Formspree holds them in an "Over limit" folder until the next month
(requests are still saved and shown on the admin page). A confirmation email
**to the client** ("autoresponse") is a paid Formspree feature.

If the email service is down or slow, the request is still saved and the
client still sees their confirmation; the email is a courtesy copy.

## 6. Optional: online payment

1. In Stripe: **Payment Links → New** (a product like "Cleaning visit", amount
   "customer chooses" or fixed) → copy the link.
2. Either paste it in `plans.js` under `payments.link` (every confirmed client
   sees a **Pay online** button), or paste a link on a single request in the
   admin page ("Date, note to client, payment link"); that one wins for that
   client.

## What the owner can change without code

- **In the admin page:** confirm, decline, finish, or (owner) delete a request; move its date
  or window; change the service or plan it is for; set the final price the
  client sees (otherwise they see the estimate); write a note the client
  sees; add a payment link; close a day; block a window; add a booking taken
  by phone; remove one. The "week ahead" panel lists what is scheduled in
  the next 7 days; the search box finds a request by name, email, phone,
  ZIP, or ID; the tab title shows how many new requests are waiting.
- **Time clock.** Everyone on the team can clock in and out on the admin
  page and say which booking they were on. The owner's "Team time" panel
  shows hours, jobs, hours per job and $ per hour per person for the week,
  month, or last 7/30 days, with a CSV download for payroll, and lets the
  owner fix or delete a shift (a forgotten clock-out, say).
- **What clients can do themselves** on the account page, while a request
  is still new or confirmed: move it to another open day and window (the
  old one frees up; a confirmed visit goes back to New with a "Moved by
  client" flag so you re-confirm it) or cancel it. Inside 24 hours of a
  confirmed visit (`policy.changeNoticeHours` in `plans.js`, matching the
  terms page) the buttons are replaced by "call or text us". Cancelled requests show in the admin
  page's Finished list with a note that the client cancelled. A finished,
  declined, or cancelled request has a "book this again" button that opens
  the quote form with the same service.
- **In `plans.js`:** how many jobs can start in the same window (`capacity`),
  working weekdays, earliest bookable day (`leadDays`), how far ahead the
  calendar opens (`horizonDays`), and the windows themselves.

## Customer accounts

Customers sign in on account.html (the nav's "Sign in", which reads "My
account" once they have). Three ways in: **Google**, **email + password**
(Create account), or a **one-time link** by email. Whichever they use, they
see every request sent with that email address, whether it was sent before
or after the account existed; nothing has to be linked by hand.

- A new email + password account must **confirm its email** (Firebase sends
  the link) before any requests show. That's enforced in firestore.rules, so
  nobody can sign up with someone else's address and read their bookings.
- Signed in, the quote form fills in their name, email (locked to the
  account's, so the request lands in it) and last phone number.
- After sending a quote while signed out, they're offered an account with
  the same email.
- "Forgot your password?" is on the account page and the Staff page.
- Links in Firebase's emails (confirm email, reset password, sign-in link)
  are handled by account.html: the link opens Firebase's page on
  firebaseapp.com, which sends the client on to account.html. (Authentication
  > Templates > **Customize action URL** would skip that hop, but the console
  doesn't keep the setting in this project; nothing depends on it.)
- Google sign-in runs on mkgservices.com itself (see "Sign-in domain" below),
  so Google's window says "to continue to mkgservices.com".

## How the data is laid out (for whoever maintains this)

| Collection | One document is… | Who can read | Who can write |
|---|---|---|---|
| `requests` | a quote request: the customer's details, status (`new`, `confirmed`, `declined`, `done`, `cancelled`), note to client, payment link, final price; `source: "phone"` for bookings taken by phone; `movedByClientAt`/`movedFrom` when the client moved it | admins; the customer, signed in with the same email | anyone may create one, but only with the fields the quote form sends; admins may change anything; the customer may only move it (it goes back to `new`) or cancel it, while it's new or confirmed; only the owner may delete |
| `holds` | the day + window a request is holding, keyed by the request's id (no personal data) | everyone (this is what the public calendar reads) | created together with its request; moved or dropped together with it; admins may remove one |
| `internal` | staff-only fields for a request, keyed by its id: private notes, who it's assigned to | admins | admins |
| `days` | a closed day or blocked windows, keyed by `YYYY-MM-DD` | everyone | admins |
| `admins` | one document per team member, keyed by user UID; the owner's has `role: owner` | admins | created by an invited person on their first sign-in; deleted by the owner |
| `adminInvites` | one document per invited email, keyed by the email | admins | the owner |
| `shifts` | one clock-in/out: `uid`, `email`, `inAt`, `outAt`, optional `requestId` and `note` | the member themself; the owner sees all | the member opens their own and may only end or edit it while it's open; the owner may change or delete any |

Every rule above is enforced by `firestore.rules`, not just by the pages, so
editing the site's JavaScript in a browser can't get around it.

Pages load Firebase from Hosting's reserved URLs (`/__/firebase/...`), so there
is no API key to paste and the same files work on the live domain and preview
channels. Opened from anywhere else, pages fall back to the "not connected"
behaviour described at the top.

## Sign-in domain, anti-spam, and billing (set up October 2026)

**Sign-in domain.** On mkgservices.com, backend.js starts Firebase with
`authDomain` = the site's own domain instead of the project's
firebaseapp.com address. For that to work, Google Cloud > Google Auth
Platform > Clients > "Web client (auto created by Google Service)" lists
`https://mkgservices.com` and `https://www.mkgservices.com` as JavaScript
origins and `https://mkgservices.com/__/auth/handler` and
`https://www.mkgservices.com/__/auth/handler` as redirect URIs. Don't remove
them. The consent screen (Google Auth Platform > Branding) is named
"MKG Services" and links the site's home, privacy and terms pages.

**App Check (anti-bot).** Firebase App Check is registered for the web app
with a reCAPTCHA key named "mkgservices.com website" (Google Cloud > Security >
Fraud Defense > Keys). The site key is `appCheckKey` in plans.js; backend.js
switches it on only on mkgservices.com. Every database request from the site
then carries a token proving it came from these pages.

It starts in **monitor-only** mode. To block everything else (scripts, bots,
copies of the site): Firebase console > App Check > APIs > **Cloud Firestore**
> check that nearly all recent requests are "Verified", then **Enforce**.
After that, the database only answers the live site (preview channels and the
emulator stop working with it until enforcement is turned off). If a real
client ever reports the calendar not loading, the App risk slider (App Check
> Apps > the web app > Fraud Defense) can be lowered from 0.5.

reCAPTCHA is free up to 10,000 checks a month across the project; a check
happens about once an hour per visitor on the booking pages. Above that,
Google bills $8 a month (up to 100,000).

**Billing.** The project is on the Blaze (pay-as-you-go) plan. A budget alert
emails the billing account's admins at 10%, 50% and 100% of $1 a month
(Google Cloud > Billing > Budgets & alerts). It warns; it does not stop
charges. Normal use of this site stays inside the free tiers.

Still available on Blaze if wanted later: Cloud Functions and the Trigger
Email extension, for emails sent straight from the database (for example a
confirmation to the client) without Formspree.
