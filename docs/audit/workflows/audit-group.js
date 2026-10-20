export const meta = {
  name: 'mkg-audit-group',
  description: 'Audit one area of mkgservices.com: parallel finders, 3-lens adversarial verification, fix proposals, completeness-critic loop until dry',
  phases: [
    { title: 'Find', detail: 'one finder per lens, highest impact first' },
    { title: 'Verify', detail: 'reproduce / impact / refute, majority to survive' },
    { title: 'Propose', detail: 'concrete fix per surviving finding' },
    { title: 'Persist', detail: 'save each verified batch as JSON' },
    { title: 'Critique', detail: 'completeness critic adds lenses until dry' },
  ],
}

const A = args
const SCRATCH = '/tmp/claude-0/-home-user/5cd54e72-5e10-5f26-9ec5-c19b545a368a/scratchpad'

const CTX = [
  'REPOSITORY: /home/user/mkgservices.com (clone of github.com/lasting-oasis/mkgservices.com, branch main, HEAD 4d1bbbf). It is READ-ONLY for you: do not modify, create, or delete any file under it, and do not run git commands that change state (no checkout, commit, stash, reset, clean). Write scratch files, scripts, and screenshots under ' + SCRATCH + '/work/' + A.group + '/<your-lens>/ (create it).',
  'LAYOUT: static pages, no build step. Residential: index.html, plans.html, quote.html. Commercial: commercial.html, commercial-plans.html, commercial-quote.html (they set window.MKG_SEGMENT = "commercial" before plans.js). availability.html (public calendar), account.html (client sign-in and their requests), admin.html (owner and staff: requests, calendar, team, credits, time clock), refer.html, privacy.html, terms.html. Shared JS: plans.js (configuration and the single source of truth: business details, Formspree endpoint, App Check key, pricing per segment, calendar settings, referral amounts, policy), i18n.js (all fixed EN/ES copy plus the translation engine), app.js (estimator, plan cards, comparison table, business details, Formspree notify), quote.js (six-step quote form), backend.js (Firebase Firestore + Auth wrapper exposed as window.MKG.backend; loads the SDK from Firebase Hosting reserved URLs), calendar.js (month grid used by availability, quote, account, admin), admin.js, timeclock.js, account.js, availability.js, referral.js, vendor/qrcode.js (MIT). styles.css (tokens at the top). firestore.rules (server-side access rules, pasted into the console by hand). firebase.json (hosting config, ignore list, cache headers). .github/workflows/ (deploy on push to main; preview per PR). README.md, docs/SETUP-firebase.md (how the Firebase side is set up, data model), docs/PLAN.md (original plan and competitor notes), docs/make-pages.py (regenerates availability, account, admin, privacy, terms pages from the header and footer in quote.html), docs/MKG-pricing-logic.pdf, docs/make-pricing-pdf.py. brand/ (logos, favicons, make-logo.py).',
  'FACTS: The site is LIVE at https://mkgservices.com (Firebase Hosting, Blaze plan). Firestore, Auth (Google, email+password, email link), and App Check (reCAPTCHA Enterprise, monitor-only mode) are set up; Formspree emails the owner on each new request and on client moves/cancels (free tier, 50 emails a month). The pricing numbers in plans.js are the placeholders the README warns about, but they are what visitors see today. Two languages: English default, Spanish via the EN/ES toggle or ?lang=es; the choice is stored in localStorage; the browser language picks the default on first visit. The live site is NOT reachable from this container (the proxy blocks it): do not try to fetch it. A local static copy is served at http://127.0.0.1:8787/ (for example http://127.0.0.1:8787/quote.html or http://127.0.0.1:8787/index.html?lang=es). Locally Firebase is absent, so pages run their documented "not connected" fallback: the calendar shows every window open, the quote form shows a demo confirmation, sign-in pages say they are not connected. Backend behaviour must therefore be reasoned from backend.js, firestore.rules, and the calling code; say so when a claim could only be settled against the live database.',
  'TOOLS: node v22 is on PATH. Playwright 1.56 is installed globally; in a node script use  const { chromium } = require("/opt/node22/lib/node_modules/playwright");  Chromium is preinstalled (never run "playwright install"). axe-core 4.10 is at ' + SCRATCH + '/tools/node_modules/axe-core/axe.min.js (inject with page.addScriptTag({ path })). A working example that loads a page, collects console errors, and runs axe is ' + SCRATCH + '/tools/pwtest.js. Screenshots you save can be viewed with the Read tool. eslint v10 is on PATH (put any config in your scratch dir, never in the repo). pdftotext and python3 with pypdf are available for docs/MKG-pricing-logic.pdf; run python as python3 -I. The npm registry is reachable; install any extra package under ' + SCRATCH + '/tools, never in the repo.',
  'STANDARDS: Every finding must be anchored to one repo-relative file (e.g. "quote.js", "firestore.rules", ".github/workflows/firebase-hosting-merge.yml") and a line number, and be checkable by someone opening that file: quote the code or describe the exact observed behaviour. Prefer findings that would change what the owner or a developer does next. Spanish copy problems are in scope. The audit itself is written in English.',
].join('\n')

const FINDINGS = {
  type: 'object',
  properties: {
    findings: { type: 'array', items: { type: 'object', properties: {
      title: { type: 'string' },
      file: { type: 'string' },
      line: { type: 'integer' },
      category: { type: 'string' },
      severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
      summary: { type: 'string' },
      evidence: { type: 'string' },
      impact: { type: 'string' },
      suggestion: { type: 'string' },
    }, required: ['title', 'file', 'line', 'category', 'severity', 'summary', 'evidence', 'impact'] } },
    strengths: { type: 'array', items: { type: 'string' } },
  },
  required: ['findings'],
}

const VERDICTS = {
  type: 'object',
  properties: {
    verdicts: { type: 'array', items: { type: 'object', properties: {
      id: { type: 'string' },
      real: { type: 'boolean' },
      confidence: { type: 'number' },
      severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
      reasoning: { type: 'string' },
    }, required: ['id', 'real', 'confidence', 'severity', 'reasoning'] } },
  },
  required: ['verdicts'],
}

const PROPOSALS = {
  type: 'object',
  properties: {
    proposals: { type: 'array', items: { type: 'object', properties: {
      id: { type: 'string' },
      approach: { type: 'string' },
      change: { type: 'string' },
      files: { type: 'array', items: { type: 'string' } },
      effort: { type: 'string', enum: ['minutes', 'hours', 'days'] },
      risk: { type: 'string' },
      needsOwnerDecision: { type: 'boolean' },
    }, required: ['id', 'approach', 'change', 'files', 'effort', 'risk', 'needsOwnerDecision'] } },
  },
  required: ['proposals'],
}

const CRITIC = {
  type: 'object',
  properties: {
    done: { type: 'boolean' },
    gaps: { type: 'array', items: { type: 'object', properties: {
      key: { type: 'string' },
      prompt: { type: 'string' },
    }, required: ['key', 'prompt'] } },
    notes: { type: 'string' },
  },
  required: ['done', 'gaps'],
}

const LENSES = {
  reproduce: 'REPRODUCE lens: for each finding, open the cited file at the cited line and decide whether the claim is factually true of THIS code. Load the page in headless Chromium or execute a snippet when that settles it. A finding whose evidence is misquoted, or that describes behaviour the code does not actually have, is NOT real. A true claim with a slightly wrong line number is still real (note the right line in your reasoning).',
  impact: 'IMPACT lens: assume the claim is factually accurate and judge whether it MATTERS: would a visitor, a client, a cleaner, the owner, or the business be measurably affected, or is it theoretical, already mitigated elsewhere (another file, a Firestore rule, hosting config), or a pure style preference? Mark real=false for theoretical, mitigated, or explicitly intended behaviour that causes no harm. Set severity to what the impact actually warrants, which is often lower than claimed.',
  refute: 'REFUTE lens: you are an adversarial skeptic. For each finding, try hard to prove it wrong: a misread of the code, a guard elsewhere, a Firestore rule or hosting header that already blocks it, a platform behaviour the finder misunderstands, a duplicate of a README "Before launch" item with no present-day harm, or a non-issue in practice. If after genuinely looking you cannot refute it, real=true. If you are still uncertain after looking, real=false.',
}

function pick(f) {
  return { id: f.id, title: f.title, file: f.file, line: f.line, category: f.category, severity: f.severity, summary: f.summary, evidence: f.evidence, impact: f.impact, suggestion: f.suggestion }
}
function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() }
function key(f) { return norm(f.file) + '|' + norm(f.title).split(' ').slice(0, 8).join(' ') }
function chunk(arr, n) { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out }
function groupByFile(list) { const m = {}; list.forEach(f => { (m[f.file] = m[f.file] || []).push(f) }); return Object.keys(m).map(k => m[k]) }
const SEV = { critical: 0, high: 1, medium: 2, low: 3 }
function medianSeverity(vs, fallback) {
  const s = vs.map(v => v.severity).filter(x => x in SEV).sort((a, b) => SEV[a] - SEV[b])
  return s.length ? s[Math.floor(s.length / 2)] : fallback
}

function finderPrompt(l, round, seenTitles) {
  return [
    'You are one auditor in a large, multi-lens audit of the MKG Services website (mkgservices.com, a Charlotte, NC cleaning company): static HTML/CSS/JS plus Firebase. The audit answers one question for the owner: where can the site be improved? You look through ONE lens and go deep.',
    'YOUR LENS: ' + l.key,
    l.prompt,
    '',
    CTX,
    '',
    round > 1 ? 'This is round ' + round + '. These findings are already recorded; do NOT repeat them, find what they missed:\n' + seenTitles.join('\n') + '\n' : '',
    'OUTPUT: up to ' + A.maxFindings + ' findings, highest impact first; stop when you run out of real ones and never pad. Each finding: title (specific, under 12 words), file (repo-relative), line (where it is anchored), category (short kebab-case tag such as security, bug, a11y, seo, perf, ux, i18n, pricing, legal, devops, maintainability, content, known-todo), severity (critical = data exposure, money, lost bookings, or legal exposure; high = clearly broken or misleading for some users, or material business impact; medium = noticeable quality, UX, or maintainability problem; low = polish), summary (what is wrong, 1-3 sentences), evidence (the quoted code or the exact observed behaviour, with how you observed it), impact (who is affected and how), suggestion (the fix in one or two sentences). Items the README "Before launch" list already names count only if still unresolved and materially affecting visitors today (category known-todo). Also return up to 5 strengths: things this lens found genuinely well done, so the final report is fair to the author.',
  ].join('\n')
}

function verifyPrompt(batch, lens) {
  return [
    'You are verifying audit findings about the MKG Services website. ' + LENSES[lens],
    '',
    CTX,
    '',
    'FINDINGS TO VERIFY (JSON):',
    JSON.stringify(batch.map(pick), null, 1),
    '',
    'Return exactly one verdict per finding id above. confidence is 0..1. severity is the severity you believe is warranted. reasoning: one to three sentences naming what you checked (file, line, what you ran).',
  ].join('\n')
}

function proposePrompt(list) {
  return [
    'You are proposing concrete fixes for confirmed audit findings about the MKG Services website. Read the relevant code before writing. For each finding id: approach (one or two sentences), change (the actual code, config, rule, or copy change: a unified-diff-style snippet or exact replacement text when small, a precise numbered step list when larger; include Spanish copy where English copy changes), files (touched), effort (minutes, hours, or days), risk (what could break and how to verify it did not), needsOwnerDecision (true when a business choice is involved: pricing, policy, wording of promises, spending money, turning on a paid feature). Keep the site\'s conventions: no build step, plain ES5-style JavaScript in IIFEs, bilingual copy in i18n.js or plans.js as { en, es }, access control enforced in firestore.rules not just in page code, docs/make-pages.py regenerates some pages so header/footer changes go through quote.html. Do NOT edit the repository; describe the change only.',
    '',
    CTX,
    '',
    'CONFIRMED FINDINGS (JSON):',
    JSON.stringify(list.map(pick), null, 1),
  ].join('\n')
}

function criticPrompt(confirmed, rejected, lensesRun) {
  return [
    'You are the completeness critic for the "' + A.group + '" area (' + A.scope + ') of a large audit of the MKG Services website. Lenses already run: ' + lensesRun.join(', ') + '.',
    '',
    'Confirmed findings so far:',
    confirmed.map(f => '- [' + f.severityFinal + '] ' + f.file + ':' + f.line + ' ' + f.title).join('\n') || '(none)',
    '',
    'Rejected findings so far (verified as not real or not material; do not re-propose them):',
    rejected.map(f => '- ' + f.file + ': ' + f.title).join('\n') || '(none)',
    '',
    CTX,
    '',
    'Your job: look at the code yourself and identify what the lenses so far MISSED within this area: a file nobody read closely, a user journey nobody walked end to end, a class of problem nobody checked, a claim that should be settled by actually running the page in Chromium. Propose up to ' + A.maxCriticLenses + ' new finder lenses as {key, prompt}: each a specific, different angle with concrete instructions (which files to read, what to try, what to run). Keys are short kebab-case. If the area is genuinely exhausted, return done=true with an empty gaps list; be honest, an area is rarely exhausted after one round, but do not invent busywork either.',
  ].join('\n')
}

const seen = new Map(), confirmed = [], rejected = [], strengths = [], lensesRun = []
let lenses = A.finders.slice(), round = 0, dry = 0, agents = 0

while (lenses.length && dry < 2 && round < A.maxRounds) {
  round++
  log('[' + A.group + '] round ' + round + ': ' + lenses.length + ' finders (' + lenses.map(l => l.key).join(', ') + ')')
  const seenTitles = Array.from(seen.values()).map(f => f.file + ': ' + f.title)
  const results = await parallel(lenses.map(l => () => agent(finderPrompt(l, round, seenTitles), { label: 'find:' + l.key, phase: 'Find', schema: FINDINGS, effort: A.effort.find })))
  agents += lenses.length
  const found = []
  results.forEach((r, i) => {
    if (!r) { log('[' + A.group + '] finder ' + lenses[i].key + ' returned nothing'); return }
    ;(r.strengths || []).forEach(s => strengths.push({ lens: lenses[i].key, text: s }))
    ;(r.findings || []).forEach(f => found.push(Object.assign({}, f, { lens: lenses[i].key, round: round })))
  })
  lenses.forEach(l => lensesRun.push(l.key))
  const fresh = []
  found.forEach(f => {
    const k = key(f)
    if (seen.has(k)) return
    f.id = A.group + '-r' + round + '-' + (fresh.length + 1)
    seen.set(k, f)
    fresh.push(f)
  })
  log('[' + A.group + '] round ' + round + ': ' + found.length + ' raw findings, ' + fresh.length + ' new after dedup')
  if (!fresh.length) dry++; else dry = 0

  if (fresh.length) {
    const batches = groupByFile(fresh).reduce((acc, g) => acc.concat(chunk(g, A.batchSize)), [])
    log('[' + A.group + '] round ' + round + ': verifying ' + batches.length + ' batches x 3 lenses')
    const verified = await pipeline(batches,
      b => parallel(Object.keys(LENSES).map(lens => () => agent(verifyPrompt(b, lens), { label: 'verify:' + lens + ':' + b[0].file, phase: 'Verify', schema: VERDICTS, effort: A.effort.verify }))),
      (votes, b) => b.map(f => {
        const vs = votes.filter(Boolean).map(v => (v.verdicts || []).find(x => x.id === f.id)).filter(Boolean)
        const yes = vs.filter(v => v.real).length
        const real = vs.length > 0 && yes >= Math.ceil((vs.length + 1) / 2)
        return Object.assign({}, f, { votes: vs, real: real, severityFinal: medianSeverity(vs, f.severity) })
      }),
      tallied => {
        const ok = tallied.filter(t => t.real)
        if (!ok.length) return tallied
        return agent(proposePrompt(ok), { label: 'propose:' + ok[0].file, phase: 'Propose', schema: PROPOSALS, effort: A.effort.propose })
          .then(p => tallied.map(t => Object.assign({}, t, { proposal: t.real && p ? ((p.proposals || []).find(x => x.id === t.id) || null) : null })))
      },
      (done, b, idx) => {
        const path = A.outDir + '/' + A.group + '-r' + round + '-b' + idx + '.json'
        const body = JSON.stringify(done, null, 1)
        return agent('Save these audit results. Use the Write tool to create the file ' + path + ' whose entire content is exactly the JSON below (no commentary, no code fences, nothing added or removed). Then run this check and return the single word ok once it prints valid:\nnode -e "JSON.parse(require(\'fs\').readFileSync(process.argv[1],\'utf8\'));console.log(\'valid\')" ' + path + '\n\nJSON:\n' + body, { label: 'save:r' + round + 'b' + idx, phase: 'Persist', effort: 'low' })
          .then(() => done)
      }
    )
    verified.filter(Boolean).forEach(list => list.forEach(t => { (t.real ? confirmed : rejected).push(t) }))
    agents += batches.length * 5
    log('[' + A.group + '] round ' + round + ': ' + confirmed.length + ' confirmed, ' + rejected.length + ' rejected so far (' + agents + ' agents used)')
  }

  if (round < A.maxRounds) {
    const c = await agent(criticPrompt(confirmed, rejected, lensesRun), { label: 'critic:r' + round, phase: 'Critique', schema: CRITIC, effort: A.effort.critic })
    agents++
    const gaps = c && !c.done && Array.isArray(c.gaps) ? c.gaps.slice(0, A.maxCriticLenses) : []
    lenses = gaps.concat(round === 1 && A.freshEyes ? [A.freshEyes] : [])
    if (c && c.notes) log('[' + A.group + '] critic: ' + c.notes.slice(0, 300))
  } else {
    lenses = []
  }
}

const bySev = { critical: 0, high: 0, medium: 0, low: 0 }
confirmed.forEach(c => { bySev[c.severityFinal] = (bySev[c.severityFinal] || 0) + 1 })
log('[' + A.group + '] done: ' + confirmed.length + ' confirmed (' + JSON.stringify(bySev) + '), ' + rejected.length + ' rejected, ' + round + ' rounds, ' + agents + ' agents')

return {
  group: A.group,
  rounds: round,
  agents: agents,
  lensesRun: lensesRun,
  bySeverity: bySev,
  confirmed: confirmed.map(c => ({ id: c.id, severity: c.severityFinal, category: c.category, file: c.file, line: c.line, title: c.title, lens: c.lens, hasProposal: !!c.proposal })),
  rejectedCount: rejected.length,
  strengths: strengths,
  outDir: A.outDir,
}
