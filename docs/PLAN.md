# MKG Services: Site Plan and Competitor Guide

Goal: build a residential cleaning site for MKG Services, LLC that pairs a clean, easy-to-use layout (inspired by what works on mollymaid.com) with a **cleaning plans** feature (inspired by maids.com) that rewards recurring customers with discounts.

> **Originality rule:** We borrow *patterns* (page order, flow, plan concept), not branding. MKG gets its own name, visual identity, wording, imagery, and plan names. No copied text, logos, images, badges, guarantees, or ratings. Do not use competitor trademarks or claims (e.g. "Done Right Promise", "44-point checklist", "22-step process", Newsweek badge).

Research date: 2026-10-15. Sources: public pages at mollymaid.com and maids.com, summarized in our own words. Details can vary by franchise and location.

---

## 1. What mollymaid.com does well (UX patterns to learn from)

- **Persistent conversion path:** a "free quote" button and a click-to-call number sit in the header and repeat through the page and footer.
- **Local-first flow:** a ZIP/"use my location" step finds the nearest provider before the quote form. The flow is advertised as taking under 2 minutes.
- **Homepage order:** hero, rating/trust, promise explainer, customer reviews, service tiles, local finder, stats and value points, service list, content (blog/tips), FAQ, careers, footer.
- **Trust stack:** satisfaction promise, a checklist, screened/insured staff, local ownership, years in business, reviews.
- **Service breadth:** recurring, one-time, occasional, apartment/condo, move-in, move-out, special event, eco-friendly, plus light commercial.
- **Mega menu and FAQ accordion** keep the page scannable.
- **Weak spots to avoid:** no visible recurring discount or pricing, rating widget that can fail to load, inconsistent stats between sections.

## 2. What maids.com does well (the plans feature)

- **Four plan cards** sized by *how much of the home is cleaned*:
  - Core: 3 rooms, for condos and small spaces
  - Essential: 5 rooms, for busy families
  - Ultimate: whole home, for kids, pets, or allergies
  - Ultimate Plus: whole home plus bonus services, for hosting and busy times
- Each card has an expandable "what's included" list and a **Select This Plan** button, followed by a free quote.
- **Three-step explainer:** find your office, pick your plan, enjoy your clean.
- **Frequency options:** weekly (most popular), bi-weekly, monthly. Recurring plans include a monthly deep clean.
- **Flexibility messaging:** cancel anytime, switch to a one-time clean.
- **Offer:** 10% off a first clean for starting a quote. No discount for recurring customers is stated, and no prices are listed. **This is our opening to differentiate.**
- **Weak spots to avoid:** no pricing logic shown, duplicated sections, placeholder links, leftover loading/error text.

## 3. Our differentiator: plans that reward recurring customers

Combine room-based **plans** (what gets cleaned) with **frequency** (how often) and show a **transparent recurring discount**.

### Proposed structure (placeholder names and numbers; decide against real costs)

| Plan | Scope | Best for |
|---|---|---|
| Essentials | Core rooms (kitchen, bathrooms, main living areas) | Small homes, condos |
| Family | Whole-home standard clean | Most households |
| Complete | Whole home plus extras (e.g. inside fridge/oven, windows rotation) | Hosting, pets, allergies |

| Frequency | Suggested discount off the one-time rate |
|---|---|
| One-time | 0% |
| Monthly | 5% |
| Bi-weekly | 10% |
| Weekly | 15% |

- **Loyalty tier (optional):** a small extra discount after N completed cleanings or 6 months as a member.
- **First-clean offer:** a modest welcome discount, shown clearly.
- **Free-quote fallback:** every plan also has "Get an exact quote" since price depends on home size and condition.
- **Price display:** show "from" prices or a price estimator by bedrooms/bathrooms/sq ft, so customers see numbers before submitting anything. Needs real pricing from the owner.
- **Terms:** no long-term contract, skip or pause a visit, cancel anytime (confirm that MKG can actually honor this).

## 4. Site architecture

1. Home: hero, three value points, plans preview, how it works, services, reviews (real ones only, once collected), FAQ, final CTA.
2. Plans: comparison table and cards, frequency toggle that updates the displayed discount, "Select plan" leading to the quote flow.
3. Services: standard, deep, move-in/move-out, add-ons.
4. Get a quote / book: short multi-step form (see below).
5. Existing customers: "My plan" page (phase 2/3), see Section 6.
6. About, Contact, FAQ, Privacy, Terms.

## 5. Quote and booking flow

1. ZIP/service-area check (confirms MKG serves the area).
2. Home details: type, bedrooms, bathrooms, approximate size, pets.
3. Pick a plan and frequency; show estimated price with recurring discount applied.
4. Contact details and preferred days or times.
5. Confirmation and follow-up message.

Target under 2 minutes, mobile-first, autosave progress.

## 6. Features by phase

**Phase 1: Marketing site (done in part)**
- Static HTML/CSS/JS in this repo (initial version already pushed).
- Rework home page structure per Section 4, add Plans and Services pages, make the layout fully responsive and accessible.

**Phase 2: Working quote flow**
- Connect forms to email and a spreadsheet or CRM via a form service or a small backend.
- Price estimator using the plan and frequency matrix.

**Phase 3: Accounts and membership**
- Customer login, view upcoming visits, change plan or frequency, skip/pause, see discount status.
- Payments for recurring billing (e.g. Stripe), with discount logic applied automatically.
- Admin view for the owner to manage customers, plans, and schedules.
- Requires a backend, database, and auth. Decide stack at that point.

## 7. Tech notes

- Keep Phase 1 static for fast, cheap hosting (GitHub Pages, Netlify, Cloudflare Pages).
- If Phase 3 is a go, consider a framework (e.g. Next.js) with a hosted database and Stripe. Not needed yet.
- Keep plan data (names, scopes, discounts) in one JSON/JS config so prices and discounts can change without editing page markup.

## 8. Open questions for the owner

1. Service area (cities/ZIPs) and whether quotes are by ZIP.
2. Real prices or a pricing formula per home size.
3. Final plan names, what each includes, and discount percentages.
4. Brand: logo, colors, photos, tone.
5. Licensing, insurance, and background-check claims that are accurate and can be stated.
6. Contact info: phone, email, hours.
7. Do you want online payments and customer accounts at launch, or later?
8. Cancellation and pause policy.

## 9. Next steps

1. Owner answers Section 8 (or approves placeholders).
2. Build the new home page, Plans page, and quote flow in this repo with MKG's own design.
3. Wire up forms (Phase 2), then scope Phase 3.
