# mkgservices.com

Website for MKG Services, LLC, a residential cleaning service. Static site, no build step: open `index.html` in a browser, or serve the folder with any static host (GitHub Pages, Netlify, Cloudflare Pages).

## Pages

| File | What it is |
|---|---|
| `index.html` | Home: hero with the live plan dial, how a plan works, plans, single cleans, FAQ |
| `plans.html` | Plans with the estimator, full comparison table, pricing notes |
| `quote.html` | Five-step quote request (ZIP, home, plan and schedule, contact, review) |

## Files the owner edits

- **`plans.js`** is the single source of truth: business details, plan names and what they include, pricing formula, recurring discounts, comparison table rows, service ZIPs, and the form endpoint. Pages read it; no markup edits needed for those changes.
- `styles.css` holds the colors and type at the top in `:root`.

Everything else (`app.js`, `quote.js`) is behaviour and should not need touching.

## Before launch

1. **Replace the placeholder pricing** in `plans.js` (`base`, `perBedroom`, `perBathroom`) with real rates. The site labels prices as estimates until then.
2. **Connect the quote form.** Set `formEndpoint` in `plans.js` to a Formspree/Basin/serverless endpoint that accepts a JSON POST. Until it's set, the form shows a demo confirmation and sends nothing.
3. **Add contact details** (`phone`, `email`, `serviceArea`) in `plans.js`. They're hidden while empty.
4. **Set `serviceZips`** if you want the ZIP step to check coverage. Empty means every ZIP is accepted and coverage is confirmed by reply.
5. **Confirm the policies in the copy**: no contracts, skip/pause without a fee, supplies included, price confirmed before the first visit, reply time (`responseTime`).
6. Add a logo if you have one (the header uses a simple mark), real photos if wanted, and customer reviews once there are real ones. The site deliberately has no invented reviews, ratings, or guarantees.

See `docs/PLAN.md` for the competitor research and the phased roadmap (accounts, recurring billing, admin view).
