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

Clients sign in with Google or the email link (no password). The admin uses a
password or Google (the Google provider is on by default in this project).

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

## 5. Optional: an email for every request

The admin page is the inbox. To also get an email per request, create a free
form at https://formspree.io (or Basin), copy its endpoint URL and paste it
into `plans.js`:

```js
formEndpoint: "https://formspree.io/f/xxxxxxxx",
```

Push the change; the site sends every request to both places.

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
  are handled by account.html. In the console, Authentication > Templates >
  (any template) > edit > **Customize action URL** should be
  `https://mkgservices.com/account.html`, so those links point at the site
  instead of firebaseapp.com.

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

Later, if volume grows: the Blaze plan (free tier, card on file) unlocks Cloud
Functions and the Trigger Email extension for notifications straight from the
database, and App Check to stop automated spam. Neither is needed to start.
