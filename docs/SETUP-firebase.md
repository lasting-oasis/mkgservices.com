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

Clients use the email link (no password). The admin uses a password.

## 4. Create the admin account

1. Authentication → **Users** tab → **Add user**: the business email and a
   strong password → Add user.
2. Copy the new user's **User UID** (the long string in the table).
3. Firestore Database → **Data** tab → **Start collection**:
   - Collection ID: `admins`
   - Document ID: paste the UID
   - Add one field: `email` (string) = the same email → Save.
4. Go to https://mkgservices.com/admin.html and sign in.

To add a second admin later, repeat with their UID. To remove one, delete
their document.

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

## Referral program (nothing extra to turn on)

It uses the same database and sign-in. After any update to `firestore.rules`,
**re-paste the file into Firebase console > Firestore > Rules and Publish**
(the referral collections are in it).

- A signed-in client gets a 6-character code, an invite link (`/?ref=CODE`), and a QR code on `account.html`.
- A friend who arrives by that link sees a banner and the code is filled in on the quote form.
- Credits are granted from the admin page: the friend's welcome credit when you
  Confirm or mark Done, the referrer's credit when the friend's visit is marked Done.
  Repeat customers (same email or phone as an earlier confirmed/done request) get no automatic credit.
- Credits stack and do not expire. In a request card, "Apply credit" subtracts
  up to the client's balance (never more than the visit price). Undo is there too.
- The **Credits** tab shows every balance and ledger line; add an adjustment or
  delete an entry to revoke it.
- Amounts are in `plans.js` under `referral` (`rewards`, `maxPercentOfVisit`); set `enabled: false` to hide the program.

## What the owner can change without code

- **In the admin page:** confirm, decline, or finish a request; move its date
  or window; write a note the client sees; add a payment link; close a day;
  block a window; add a booking taken by phone; remove one.
- **In `plans.js`:** how many jobs can start in the same window (`capacity`),
  working weekdays, earliest bookable day (`leadDays`), how far ahead the
  calendar opens (`horizonDays`), and the windows themselves.

## How the data is laid out (for whoever maintains this)

| Collection | One document is… | Who can read | Who can write |
|---|---|---|---|
| `requests` | a quote request with the customer's details, status (`new`, `confirmed`, `declined`, `done`), note to client, payment link | admins; the customer, signed in with the same email | anyone may create; admins may change |
| `holds` | one date + window a request is holding (no personal data) | everyone (this is what the public calendar reads) | created together with its request; admins may delete |
| `days` | a closed day or blocked windows, keyed by `YYYY-MM-DD` | everyone | admins |
| `users` | a client's private record: their referral code | admins; that client | that client, once (created with its `referrers` entry) |
| `referrers` | code to user id (no email); a visitor can check one code, nobody can list them | single lookups only | the signed-in client, once |
| `credits` | one ledger line: welcome, referral, used, or adjustment (signed amount) | admins; the client with that email | admins only |
| `admins` | one document per admin, keyed by user UID | the admin themself | nobody from the site (console only) |

Pages load Firebase from Hosting's reserved URLs (`/__/firebase/...`), so there
is no API key to paste and the same files work on the live domain and preview
channels. Opened from anywhere else, pages fall back to the "not connected"
behaviour described at the top.

Later, if volume grows: the Blaze plan (free tier, card on file) unlocks Cloud
Functions and the Trigger Email extension for notifications straight from the
database, and App Check to stop automated spam. Neither is needed to start.
