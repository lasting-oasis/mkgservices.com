export const meta = {
  name: 'mkg-audit-synthesis',
  description: 'Merge the five audit groups: per-area sections, cross-area dedup, judge-panel prioritisation, final report, accuracy review',
  phases: [
    { title: 'Sections', detail: 'one writer per area reads its JSON and drafts the section' },
    { title: 'Merge', detail: 'cross-area dedup and conflict resolution' },
    { title: 'Prioritise', detail: 'three judges with different lenses, then a merger' },
    { title: 'Write', detail: 'final editor assembles the report' },
    { title: 'Review', detail: 'two reviewers check accuracy and readability; editor fixes' },
  ],
}

const A = args
const SCRATCH = '/tmp/claude-0/-home-user/5cd54e72-5e10-5f26-9ec5-c19b545a368a/scratchpad'
const REPORT = A.reportPath

const CTX = [
  'The subject is the MKG Services website (mkgservices.com, a Charlotte, NC cleaning company): static HTML/CSS/JS with Firebase (Firestore, Auth, App Check, Hosting), bilingual EN/ES, a six-step quote flow, a public availability calendar, a client account page, and an owner/staff admin page. The repository is at /home/user/mkgservices.com (READ-ONLY: never modify it). The README and docs/SETUP-firebase.md describe it.',
  'A multi-agent audit ran five areas in parallel (security, correctness, frontend, product, ops). In each area, finders proposed findings, three independent verifiers (reproduce, impact, refute) voted, findings surviving a majority were kept, and a proposer wrote a concrete fix for each. The per-batch results are JSON files under ' + A.resultsDir + '/<area>/*.json. Each file is an array of finding objects with: id, title, file, line, category, severity (the finder\'s), severityFinal (verifiers\' median), summary, evidence, impact, suggestion, lens, round, votes (array of {id, real, confidence, severity, reasoning}), real (boolean: survived), proposal ({approach, change, files, effort, risk, needsOwnerDecision} or null). Only entries with real=true are confirmed; the others were rejected and must not appear in the report except as a count.',
  'Audience: the site\'s developer and the business owner. Write in plain English, no em-dashes, no marketing tone; every claim must trace to a confirmed finding with its file and line. Spanish copy may be quoted. Do not invent findings and do not soften severities the verifiers set.',
].join('\n')

const SECTION = {
  type: 'object',
  properties: {
    group: { type: 'string' },
    sectionPath: { type: 'string' },
    confirmedCount: { type: 'integer' },
    rejectedCount: { type: 'integer' },
    findings: { type: 'array', items: { type: 'object', properties: {
      id: { type: 'string' }, severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
      category: { type: 'string' }, file: { type: 'string' }, line: { type: 'integer' },
      title: { type: 'string' }, oneLine: { type: 'string' }, fix: { type: 'string' },
      effort: { type: 'string' }, needsOwnerDecision: { type: 'boolean' },
    }, required: ['id', 'severity', 'category', 'file', 'line', 'title', 'oneLine', 'fix', 'effort', 'needsOwnerDecision'] } },
    strengths: { type: 'array', items: { type: 'string' } },
  },
  required: ['group', 'sectionPath', 'confirmedCount', 'rejectedCount', 'findings', 'strengths'],
}

const MERGED = {
  type: 'object',
  properties: {
    canonical: { type: 'array', items: { type: 'object', properties: {
      id: { type: 'string' }, mergedIds: { type: 'array', items: { type: 'string' } },
      area: { type: 'string' }, severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
      category: { type: 'string' }, file: { type: 'string' }, line: { type: 'integer' },
      title: { type: 'string' }, oneLine: { type: 'string' }, fix: { type: 'string' },
      effort: { type: 'string' }, needsOwnerDecision: { type: 'boolean' },
    }, required: ['id', 'mergedIds', 'area', 'severity', 'category', 'file', 'line', 'title', 'oneLine', 'fix', 'effort', 'needsOwnerDecision'] } },
    conflicts: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
  },
  required: ['canonical', 'conflicts'],
}

const RANKED = {
  type: 'object',
  properties: {
    lens: { type: 'string' },
    ranking: { type: 'array', items: { type: 'object', properties: {
      id: { type: 'string' }, rank: { type: 'integer' }, reason: { type: 'string' },
    }, required: ['id', 'rank', 'reason'] } },
    themes: { type: 'array', items: { type: 'string' } },
  },
  required: ['lens', 'ranking', 'themes'],
}

const ROADMAP = {
  type: 'object',
  properties: {
    now: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' }, why: { type: 'string' } }, required: ['id', 'title', 'why'] } },
    next: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' }, why: { type: 'string' } }, required: ['id', 'title', 'why'] } },
    later: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' }, why: { type: 'string' } }, required: ['id', 'title', 'why'] } },
    ownerDecisions: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' }, question: { type: 'string' } }, required: ['id', 'title', 'question'] } },
    themes: { type: 'array', items: { type: 'object', properties: { theme: { type: 'string' }, ids: { type: 'array', items: { type: 'string' } }, summary: { type: 'string' } }, required: ['theme', 'ids', 'summary'] } },
    rationale: { type: 'string' },
  },
  required: ['now', 'next', 'later', 'ownerDecisions', 'themes', 'rationale'],
}

const REVIEW = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    problems: { type: 'array', items: { type: 'object', properties: {
      location: { type: 'string' }, problem: { type: 'string' }, fix: { type: 'string' }, severity: { type: 'string', enum: ['must-fix', 'should-fix', 'nit'] },
    }, required: ['location', 'problem', 'fix', 'severity'] } },
  },
  required: ['ok', 'problems'],
}

const WRITTEN = {
  type: 'object',
  properties: { path: { type: 'string' }, words: { type: 'integer' }, confirmedTotal: { type: 'integer' }, summary: { type: 'string' } },
  required: ['path', 'words', 'confirmedTotal', 'summary'],
}

phase('Sections')
log('Drafting ' + A.groups.length + ' area sections')
const sections = (await parallel(A.groups.map(g => () => agent([
  'You are writing the "' + g.title + '" section of the audit report for the MKG Services website.',
  CTX,
  '',
  'Read every JSON file in ' + A.resultsDir + '/' + g.key + '/ (use Glob then Read; files may be large). Keep only entries with real === true. Merge near-duplicates within this area (same file and same underlying problem found in different rounds) into one entry keeping the best evidence and the richest proposal; keep the id of the first and list the others as merged. Then write the section as Markdown to ' + SCRATCH + '/report/sections/' + g.key + '.md with this shape: a two-paragraph overview of what this area looked at and the state it found; then one subsection per confirmed finding ordered by severityFinal (critical first) then by impact, each with: heading "### [SEVERITY] Title", a line "File: `path:line`", the problem in one short paragraph (from summary, evidence and impact, rewritten plainly), a "Fix:" paragraph from the proposal (approach plus the concrete change; include code or copy snippets in fenced blocks when the proposal has them; include Spanish copy where given), and a final line "Effort: ... | Owner decision needed: yes/no | Verified by: N of 3". After the findings, a short "What is already good" list from the strengths. Also mention, in one line, how many findings were proposed and rejected in verification. Use no em-dashes.',
  'Return the structured summary: group key, sectionPath, confirmedCount, rejectedCount, the list of confirmed findings (id, severity = severityFinal, category, file, line, title, oneLine problem, fix in one line, effort, needsOwnerDecision), and up to 8 strengths.',
].join('\n'), { label: 'section:' + g.key, phase: 'Sections', schema: SECTION, effort: 'high' })))).filter(Boolean)

const all = []
sections.forEach(s => s.findings.forEach(f => all.push(Object.assign({ area: s.group }, f))))
log('Sections done: ' + sections.map(s => s.group + '=' + s.confirmedCount).join(', ') + ' (' + all.length + ' findings in play)')

phase('Merge')
const merged = await agent([
  'You are merging the findings of five audit areas of the MKG Services website into one canonical list.',
  CTX,
  '',
  'Below are the confirmed findings from every area (JSON). Different areas often found the same underlying problem from different angles (for example, hreflang links found by SEO and by i18n; holds being world-readable found by security and by data-model; missing client confirmation email found by product, ops and security). Merge such duplicates into one canonical entry: keep the clearest title, the most precise file and line, the highest severity any area assigned unless the merge shows the higher one was based on the same evidence the others judged lower, the union of the fix text in one sentence, and list every merged id. Keep distinct problems in the same file separate. Record conflicts (two areas disagreeing on whether something is a problem or on severity) in the conflicts list with your resolution. Read the section files under ' + SCRATCH + '/report/sections/ if you need more detail on any item.',
  '',
  JSON.stringify(all, null, 1),
].join('\n'), { label: 'merge', phase: 'Merge', schema: MERGED, effort: 'xhigh' })
const canonical = merged ? merged.canonical : all.map(f => Object.assign({ mergedIds: [] }, f))
log('Merged to ' + canonical.length + ' canonical findings, ' + ((merged && merged.conflicts) || []).length + ' conflicts noted')

phase('Prioritise')
const JUDGES = [
  { key: 'bookings', prompt: 'BOOKINGS lens: rank by expected effect on the number of quote requests that turn into confirmed, paid visits in the next 90 days, for a small cleaning company with a couple of crews. Conversion friction, trust, pricing clarity, mobile and Spanish experience, and silent failures that lose a request weigh most.' },
  { key: 'risk', prompt: 'RISK lens: rank by the damage if left alone: data exposure, money lost or charged wrongly, legal or compliance exposure, bookings lost silently, embarrassing failures in front of clients, and anything that gets worse as the business grows. Likelihood times impact.' },
  { key: 'quick-wins', prompt: 'QUICK-WINS lens: rank by value per hour of developer time: what a developer can ship this week with low risk and clear benefit first; long projects and items needing the owner\'s decision rank lower regardless of value.' },
]
const rankings = (await parallel(JUDGES.map(j => () => agent([
  'You are one of three judges prioritising audit findings for the MKG Services website. ' + j.prompt,
  CTX,
  '',
  'Rank the top 30 of the canonical findings below (JSON) for your lens; give each a one-sentence reason. Also name up to 6 themes you see (groups of findings that share a root cause or a single fix).',
  '',
  JSON.stringify(canonical, null, 1),
].join('\n'), { label: 'judge:' + j.key, phase: 'Prioritise', schema: RANKED, effort: 'xhigh' })))).filter(Boolean)

const roadmap = await agent([
  'You are merging three judges\' rankings of audit findings for the MKG Services website into one roadmap.',
  CTX,
  '',
  'Canonical findings (JSON):', JSON.stringify(canonical, null, 1),
  '',
  'Rankings (JSON):', JSON.stringify(rankings, null, 1),
  '',
  'Produce: now (do this week: at most 12 items, the ones that score high on at least two lenses or are critical on risk), next (this month: at most 15), later (this quarter or when the business needs it), ownerDecisions (items that cannot proceed without the owner answering a question: state the question plainly), themes (merge the judges\' themes: for each, the ids it covers and a two-sentence summary of the single fix or direction), and a rationale paragraph explaining how you weighed the lenses. Every id must come from the canonical list; every canonical id should land in exactly one of now, next, later, or be explicitly dropped with a reason in the rationale.',
].join('\n'), { label: 'roadmap', phase: 'Prioritise', schema: ROADMAP, effort: 'xhigh' })

phase('Write')
const stats = { areas: sections.map(s => ({ group: s.group, confirmed: s.confirmedCount, rejected: s.rejectedCount })), canonical: canonical.length }
const written = await agent([
  'You are the editor assembling the final audit report for the MKG Services website. Write it to ' + REPORT + ' as Markdown with the Write tool.',
  CTX,
  '',
  'Inputs: the roadmap (JSON below), the canonical findings (JSON below), the per-area section files under ' + SCRATCH + '/report/sections/ (read all of them; they hold the detailed write-ups and the fixes), and the stats: ' + JSON.stringify(stats) + '. Today is ' + A.date + '. Repository HEAD is ' + A.head + '.',
  '',
  'Structure the report exactly like this:',
  '1. Title "MKG Services website audit" with date and commit on the next line.',
  '2. "Summary" (under 250 words): what was audited, how (five areas, finders, three-way verification, fix proposals, how many findings proposed, confirmed, rejected), the overall state of the site in two or three sentences that are fair about what is good, and the three or four things that matter most.',
  '3. "Do this week": the roadmap now list as a numbered list; each item: bold title, one sentence why, the file and line in backticks, effort. Keep each item to two lines.',
  '4. "This month" and "This quarter": same format, shorter.',
  '5. "Decisions for the owner": each as a question the owner can answer yes or no or with a number, with the finding it unblocks.',
  '6. "Themes": the roadmap themes, each with a short paragraph and the ids it covers.',
  '7. One section per area, in this order: security, correctness, frontend, product, ops. Paste each section file\'s content (lightly edited for consistency; keep every confirmed finding, its file and line, its fix, and its code snippets; drop nothing). Give findings a stable reference like S-1, C-1, F-1, P-1, O-1 in their headings and use those references in the roadmap and themes sections too (build the mapping from the canonical ids).',
  '8. "What is already good": merged strengths across areas, deduplicated, as a list.',
  '9. "Method and limits": how the audit ran, that the live site and the live database could not be reached from the audit container so backend claims are reasoned from code and rules, that pages ran locally in not-connected mode, that pricing is known to be placeholder, how many agents and rounds per area, and that rejected findings are listed only as counts.',
  '10. "Appendix: all confirmed findings": one table with reference, severity, area, file:line, title, effort, owner decision.',
  'Style: plain English, short sentences, no em-dashes, no exclamation marks, no filler, bold the first words of list items not whole sentences. Use fenced code blocks for code and copy. Spanish copy is quoted as is.',
  '',
  'Roadmap (JSON):', JSON.stringify(roadmap, null, 1),
  '',
  'Canonical findings (JSON):', JSON.stringify(canonical, null, 1),
  '',
  'When done, return the path, the word count (wc -w), the total number of confirmed findings in the appendix, and a 3-sentence summary.',
].join('\n'), { label: 'editor', phase: 'Write', schema: WRITTEN, effort: 'xhigh' })
log('Report drafted: ' + (written ? written.words + ' words, ' + written.confirmedTotal + ' findings' : 'editor returned nothing'))

phase('Review')
const REVIEWERS = [
  { key: 'accuracy', prompt: 'ACCURACY reviewer: for a random sample of at least 25 findings across all areas plus every item in "Do this week", open the cited file at the cited line in /home/user/mkgservices.com and check that the report\'s description matches the code, that the reference labels are consistent between the roadmap, themes, sections, and appendix, that every roadmap item exists in a section, that no finding appears twice under different labels, that severities in the appendix match the section headings, and that the counts in the summary match the appendix. Also check the section JSON sources under ' + A.resultsDir + ' for any confirmed (real=true) finding that is missing from the report.' },
  { key: 'readability', prompt: 'READABILITY reviewer: read the whole report as the business owner (not a developer) and as the developer. Flag: jargon without explanation, items whose fix is not actionable, sentences over 30 words, em-dashes, headings out of order, code blocks that are not fenced, places where the owner cannot tell what to do next, inconsistent reference labels, and anything that reads as padding. Do not flag content choices the verifiers made.' },
]
const reviews = (await parallel(REVIEWERS.map(r => () => agent([
  'You are reviewing the final audit report at ' + REPORT + ' for the MKG Services website. ' + r.prompt,
  CTX,
  '',
  'Return ok=true only if there are no must-fix problems. List every problem with its location (heading or reference label), what is wrong, and the exact fix.',
].join('\n'), { label: 'review:' + r.key, phase: 'Review', schema: REVIEW, effort: 'xhigh' })))).filter(Boolean)
const problems = reviews.reduce((acc, r) => acc.concat(r.problems || []), [])
log('Review: ' + problems.length + ' problems (' + problems.filter(p => p.severity === 'must-fix').length + ' must-fix)')

let fixed = null
if (problems.length) {
  fixed = await agent([
    'You are the editor fixing review problems in the audit report at ' + REPORT + ' (Markdown). Apply every must-fix and should-fix below, and the nits where cheap, using Edit (or rewrite sections with Write if needed). Verify against the repository and the section files under ' + SCRATCH + '/report/sections/ and the JSON under ' + A.resultsDir + ' when a problem is about accuracy; never drop a confirmed finding and never add one that is not in the JSON. Keep the structure.',
    CTX,
    '',
    'Problems (JSON):', JSON.stringify(problems, null, 1),
    '',
    'When done return the path, word count, total confirmed findings in the appendix, and a 3-sentence summary of what you changed.',
  ].join('\n'), { label: 'editor:fix', phase: 'Review', schema: WRITTEN, effort: 'xhigh' })
}

return { report: REPORT, stats: stats, canonical: canonical.length, roadmap: roadmap ? { now: roadmap.now.length, next: roadmap.next.length, later: roadmap.later.length, ownerDecisions: roadmap.ownerDecisions.length } : null, problemsFound: problems.length, final: fixed || written }
