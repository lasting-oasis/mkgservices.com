# mkgservices.com

Website for MKG Services, LLC, a Charlotte cleaning company. Static pages (no build step) plus Firebase for the parts that need a database: quote requests, the live booking calendar, the admin page, and client sign-in. Opened from a plain file server the pages still work, in a "not connected" mode.

## Pages

Two service lines share one engine. Residential is priced by bedrooms and bathrooms; commercial by square feet and restrooms, with a visits-per-week ladder and an approximate monthly figure. The home page has one "Commercial service" card under the hero buttons that opens the commercial home page; the commercial pages have the mirror "Residential service" card.

| File | What it is |
|---|---|
| `index.html` | Residential home: hero with the live plan dial, how a plan works, plans, single cleans, FAQ |
| `plans.html` | Residential plans with the estimator, full comparison table, pricing notes |
| `quote.html` | Residential six-step quote request (ZIP, home, plan and schedule, contact, when, review) |
| `commercial.html` | Commercial home, same structure, priced by floor space and restrooms |
| `commercial-plans.html` | Commercial plans, comparison, and pricing notes |
| `commercial-quote.html` | Commercial quote: building ZIP, type of space, floor space, restrooms, flooring, business name, when to clean |
| `availability.html` | Public calendar: which days and start windows are still open, for homes or businesses; a pick carries into the quote |
| `account.html` | Client sign-in by emailed link; shows that email's requests, status, notes from the owner, and a Pay online button when a link is set |
| `admin.html` | Owner's page (password): every request with confirm/decline/done, note to client, payment link, date changes; the calendar with close-day, block-window, and phone bookings |
| `privacy.html`, `terms.html` | Plain-language privacy policy and terms (bilingual) |

The quote flows have six steps: ZIP, the space, plan and schedule, contact, **when** (the calendar), review. Requests are saved to Firestore by `backend.js`; `calendar.js` draws the month grid everywhere it appears. Setup for all of this is in **`docs/SETUP-firebase.md`**.

A page picks its line with `<script>window.MKG_SEGMENT = "commercial"</script>` before `plans.js`; pages without it are residential.

## Languages

The site is in English and Spanish. Visitors switch with the EN / ES buttons in the top bar; the choice is remembered, and `?lang=es` on any page URL opens it in Spanish (useful for sharing a Spanish link, e.g. `index.html?lang=es`). The browser's language picks the default on a first visit.

- Fixed page text lives in **`i18n.js`** under keys, once per language. Commercial pages read `commercial:<key>` first and fall back to the shared key, so only copy that differs is written twice.
- Owner-edited content in `plans.js` (plan names, what's included, single cleans, response time) is written as `{ en: "...", es: "..." }`.

## Contact

The phone number and email in `plans.js` appear in the top bar (tap to call, tap to text), the FAQ, the closing banner, the quote page, and the footer. Links are built from the digits, so write the number however you like it displayed.

## Logo

`brand/` holds the logo as outlined SVG (no font needed) plus PNG exports:

| File | Use |
|---|---|
| `logo-badge.svg` / `-1024.png` | Full circular badge (ink ring, pine centre, lemon sparkles). Footer, invoices, print, social posts. |
| `logo-badge-mono.svg` / `-1024.png` | One-colour ink line version for stamps, embroidery, black-and-white print. |
| `logo-badge-reverse.svg` / `-1024.png` | White version for dark backgrounds (transparent). |
| `logo-mark.svg` / `-512.png` / `-192.png` | Compact mark (disc, sparkles, MKG). Header, favicon, social avatars, app icons. |
| `logo-full-1024.png` / `-640` / `-320` (+ `.webp`) | The detailed illustrated badge (skyline, house, cleaning tools). Used in the header, footer, favicon, home-screen icon and the "Charlotte's own" section of the home page. The 3000 px original is in `brand/source/` (not deployed). |
| `favicon-*.png`, `apple-touch-icon.png`, root `favicon.ico` | Browser and home-screen icons made from the illustrated logo; linked from every page. |

The legal suffix is left off the mark on purpose: "MKG Services" is the brand, "MKG Services, LLC" stays on invoices, contracts and the footer. `brand/make-logo.py` regenerates every file from the site's typeface (Bricolage Grotesque); edit its `WORDS` block to change the ring text, e.g. to add "LLC".

## Files the owner edits

- **`plans.js`** is the single source of truth: business details, then one block per service line (`segments.residential`, `segments.commercial`) with its size inputs (`dims`), plans and per-unit prices, schedule discounts, comparison rows, single cleans, and follow-up tiers. Pages read it; no markup edits needed for those changes.
- **`i18n.js`** for any fixed sentence on the pages, in both languages.
- `styles.css` holds the colors and type at the top in `:root`.

- `plans.js` also holds the calendar settings (`availability`: windows, capacity per window, weekdays, lead time, horizon), the optional email copy of each request (`formEndpoint`), and the optional Stripe payment link (`payments.link`). Days off and blocked windows are set on `admin.html`, not in code.
- `firestore.rules` decides who can read and write the database; paste it into the Firebase console whenever it changes (see `docs/SETUP-firebase.md`).

Everything else (`app.js`, `quote.js`, `backend.js`, `calendar.js`, `admin.js`, `account.js`, `availability.js`) is behaviour and should not need touching. `docs/make-pages.py` regenerates the availability, account, admin, privacy, and terms pages from the shared header and footer in `quote.html`.

## Deploying (Firebase Hosting, free plan)

Every push to `main` deploys the site through the GitHub Action in `.github/workflows/firebase-hosting-merge.yml`. Pull requests get a temporary preview URL. One-time setup:

1. Create a project at console.firebase.google.com and open **Build → Hosting → Get started** once so the site exists.
2. Put the project ID in `.firebaserc` (replace `REPLACE_WITH_YOUR_FIREBASE_PROJECT_ID`).
3. In Firebase, **Project settings → Service accounts → Generate new private key**. Add the downloaded JSON as a GitHub repository secret named `FIREBASE_SERVICE_ACCOUNT` (Settings → Secrets and variables → Actions). Never commit that file.
4. Push to `main`. The site appears at `https://<project-id>.web.app`; add `mkgservices.com` under Hosting → Add custom domain when ready.

The same setup can be done from a terminal with `firebase init hosting:github`, which creates the key and secret for you.

## Live address

The site is live at https://mkgservices.com (domain bought at Cloudflare Registrar, DNS only, pointing at Firebase Hosting). Keep every DNS record on "DNS only" (grey cloud) or Firebase cannot renew the HTTPS certificate. Share previews and canonical links in each page's `<head>` use this address.

## Before launch

1. **Replace the placeholder pricing** in `plans.js` (`base` and `per` amounts for both residential and commercial plans; the commercial visit-ladder discounts too). The site labels prices as estimates until then.
2. **Do the Firebase setup** in `docs/SETUP-firebase.md` (database, rules, sign-in, admin account). Until then the quote form can't save and tells visitors to email instead. Optionally also set `formEndpoint` for an email per request.
3. **Add the service area** (`serviceArea`, in both languages) in `plans.js` if you want it shown in the footer. Phone and email are already in.
4. **Set `serviceZips`** if you want the ZIP step to check coverage. Empty means every ZIP is accepted and coverage is confirmed by reply.
5. **Confirm the policies in the copy and in `terms.html`**: no contracts, skip/pause without a fee, supplies included, price confirmed before the first visit, reply time (`responseTime`), 24-hour change/cancel notice and the late-cancel charge, the come-back-and-fix promise, insurance. Change the wording in `i18n.js` (`terms.*`) if any of it isn't how you work.
6. Add a logo if you have one (the header uses a simple mark), real photos if wanted, and customer reviews once there are real ones. The site deliberately has no invented reviews, ratings, or guarantees.

See `docs/PLAN.md` for the competitor research and the phased roadmap (accounts, recurring billing, admin view).
