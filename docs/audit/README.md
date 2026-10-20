# Site audit, 20 October 2026

A multi-agent audit of this repository at commit `4d1bbbf`, run with Claude Code
workflows. It was stopped after the discovery round, so this folder holds the raw
findings and everything needed to pick it up again, plus a record of what was fixed.

## What is here

| File | What it is |
|---|---|
| `findings-2026-10-20.md` | All 424 findings, grouped by area and sorted by the finder's severity, each with file and line, evidence, impact, suggestion, and, where verification had run, the three verifiers' votes. |
| `findings-2026-10-20.json` | The same, as data, with the "strengths" each lens reported. |
| `workflows/audit-group.js` | The workflow script for one area: finders, three-way verification, fix proposals, and a completeness critic, looping until nothing new turns up. |
| `workflows/groups.json` | The five areas and their six finder lenses each (the prompts). |
| `workflows/synth.js` | The synthesis workflow that was never run: per-area sections, cross-area merge, a three-judge prioritisation, the report, and an accuracy review. |

## How it ran

Five areas in parallel (security, correctness, frontend, product, ops), six finders
each, every finder reading the code through one lens and driving the pages in headless
Chromium against a local copy served with `http-server`. Each finding then goes to three
independent verifiers (reproduce, impact, refute) and survives on a majority; survivors get
a written fix proposal. Round one finished everywhere; verification had covered about 40
findings when the run was stopped because, on a 4-CPU container that allows two agents per
workflow, the full design was going to take another seven hours.

**Treat unvoted findings as leads, not facts.** The ones the verifiers did vote on mostly
survived, usually with the severity lowered a notch.

## What was fixed right after (branch `audit-fixes`)

- Firestore rules enforce calendar capacity, closed days, blocked windows, the booking
  horizon, and working days for visitors and clients, through a `slots/{date_slot}`
  counter written in the same transaction as every hold (`backend.js`, `firestore.rules`,
  tests in `test/`). The request rule was also made cheaper: it was within about 26
  trivial expressions of Firestore's 1,000-expression limit; now about 80.
- Credit maths uses the owner's final price, not the placeholder estimate; the time clock's
  "done" grants referral credits like the admin button; declined or cancelled visits give
  back the welcome credit and any applied credit; calendar "Remove" also unschedules the
  request; confirming into a full window asks first.
- A refused save no longer shows "Request sent"; a window that filled up is reported and
  cleared instead of failing silently.
- Skip/pause copy, the FAQ, and the terms quote the same notice period, driven by
  `plans.js` `policy.changeNoticeHours`, in both languages.
- Absolute `hreflang` on every public page, the canonical and share URLs follow the
  language, the sitemap lists only indexable pages.
- Quote form errors are announced to screen readers and focus the field; the calendar
  keeps keyboard focus when it redraws.
- The deploy workflow publishes `firestore.rules` before the pages.

## How to resume

The scripts assume the Claude Code `Workflow` tool. Launch one area at a time:

```
Workflow({ scriptPath: "docs/audit/workflows/audit-group.js", args: <one object from groups.json, plus>
  { outDir: "<where to save JSON>", maxFindings: 15, batchSize: 4, maxRounds: 3, maxCriticLenses: 4,
    effort: { find: "xhigh", verify: "high", propose: "high", critic: "xhigh" } } })
```

`audit-group.js` has the scratch directory and the local server URL hard-coded near the
top (`SCRATCH`, and `http://127.0.0.1:8787/` in the context text); change them for the new
session, serve the repository with `npx http-server . -p 8787 -s` first, and give the
finders the titles already in `findings-2026-10-20.md` if you want them to skip those. When
every area has JSON, run `synth.js` with `{ groups, resultsDir, reportPath, date, head }`.

A cheaper way to continue: pick the unvoted high-severity findings from
`findings-2026-10-20.md`, check each against the code by hand, and fix the real ones.
