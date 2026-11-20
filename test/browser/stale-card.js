// Stale request card vs. a customer reschedule, every card action that can change the booking,
// the status or the response owed. Fictional records; in-memory backend; clock Mon Dec 7 10:00 Charlotte.
const NOW = Date.parse('2026-12-07T10:00:00-05:00'), wait = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, failN = 0; const results = [];
function check(name, ok, info) { console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || info === undefined ? '' : '  -> ' + JSON.stringify(info))); ok ? pass++ : failN++; results.push([name, ok]); }
module.exports = async function (browser, base) {
  const ctx = await browser.createBrowserContext(), p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept(d.type() === 'prompt' ? 'delete' : undefined));
  await p.evaluateOnNewDocument((now) => { const real = Date.now.bind(Date), off = now - real(), R = Date;
    function D(...a) { return a.length ? new R(...a) : new R(real() + off); } D.prototype = R.prototype; D.now = () => real() + off; D.parse = R.parse; D.UTC = R.UTC; window.Date = D; }, NOW);
  await p.setViewport({ width: 1300, height: 1000 });
  await p.goto(base + '/admin.html', { waitUntil: 'networkidle0' }); await wait(400);
  await p.evaluate(() => { const t = document.querySelector('[data-view-tab="requests"]'); if (t) t.click(); }); await wait(300);
  await p.evaluate(() => document.querySelector('[data-filter="all"]').click()); await wait(200);
  const state = (id) => p.evaluate((id) => { const B = window.MKG.backend, r = B._store.requests.find(x => x.id === id) || { status: 'DELETED' }, q = (B._store.internal[id] || {}).queue || null;
    const row = document.querySelector('[data-qid="' + id + '"]'), card = document.querySelector('[data-id="' + id + '"]');
    return { status: r.status, date: r.date, slot: r.slot, moved: !!r.movedByClientAt, repliedMs: q && q.repliedMs || null, inQueue: !!row, queueText: row ? row.innerText.replace(/\s+/g, ' ').slice(0, 160) : '', cardMsg: card ? (card.innerText.match(/[^\n]*moved this visit[^\n]*/i) || [''])[0] : '' }; }, id);
  // Customer moves Thu Dec 10 8:00 -> Wed Dec 9 11:30 while the dispatcher's card still shows the old booking.
  const customerMoves = (id) => p.evaluate((id) => { const B = window.MKG.backend; B._hold = true; return B.reschedule(B._store.requests.find(x => x.id === id), '2026-12-09', '1130', true); }, id);
  const deliver = () => p.evaluate(() => { const B = window.MKG.backend; B._hold = false; B._emit(); });
  const openCard = (id) => p.evaluate((id) => { const a = document.querySelector('[data-id="' + id + '"]'); a.querySelector('details.admin-edit').open = true; }, id);
  const click = (id, act) => p.evaluate((id, act) => document.querySelector('[data-id="' + id + '"] [data-act="' + act + '"]').click(), id, act);
  const type = (id, f, v) => p.evaluate((id, f, v) => { const el = document.querySelector('[data-id="' + id + '"] [data-f="' + f + '"]'); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, id, f, v);
  async function scenario(label, id, before, action) {
    await openCard(id); if (before) await before();
    await customerMoves(id); await action(); await wait(300); await deliver(); await wait(300);
    const s = await state(id);
    const kept = s.status === 'new' && s.date === '2026-12-09' && s.slot === '1130' && s.moved;
    const owed = s.repliedMs === null && s.inQueue && /RESCHEDULE/i.test(s.queueText);
    check(label + ': customer\'s new booking preserved (new, Wed Dec 9 11:30)', kept, s);
    check(label + ': reschedule stays in the queue, still owed a response', owed, s);
    check(label + ': dispatcher told to review the move', /moved this visit/i.test(s.cardMsg), s.cardMsg);
    return s;
  }
  await scenario('Mark done', 'CARDDONE01', null, () => click('CARDDONE01', 'done'));
  await scenario('Confirm', 'CARDCONF02', null, () => click('CARDCONF02', 'confirmed'));
  await scenario('Decline', 'CARDDECL03', null, () => click('CARDDECL03', 'declined'));
  await scenario('Save with a date/window change typed before the move', 'CARDDATE04', async () => { await type('CARDDATE04', 'date', '2026-12-11'); }, () => click('CARDDATE04', 'save'));
  await scenario('Save with a reply to the customer typed before the move', 'CARDREPL05', async () => { await type('CARDREPL05', 'replyNote', 'See you Thursday at 8!'); }, () => click('CARDREPL05', 'save'));
  await scenario('Delete (owner, word typed)', 'CARDDELE06', null, () => click('CARDDELE06', 'delete'));
  // After review: acting again on the refreshed card goes through on purpose.
  await click('CARDCONF02', 'confirmed'); await wait(300);
  const rev = await state('CARDCONF02');
  check('after review, Confirm on the refreshed card confirms the customer\'s new time', rev.status === 'confirmed' && rev.date === '2026-12-09' && rev.slot === '1130' && !rev.inQueue, rev);
  await p.evaluate(() => { const i = document.querySelector('[data-id="CARDREPL05"] [data-f="replyNote"]'); i.value = 'Wednesday 11:30 works, see you then.'; i.dispatchEvent(new Event('input', { bubbles: true })); });
  await click('CARDREPL05', 'save'); await wait(300);
  const rev2 = await state('CARDREPL05');
  check('after review, a reply about the new time clears the response owed', rev2.repliedMs !== null && rev2.date === '2026-12-09', rev2);
  // How an existing request with no repliedAt appears.
  const leg = await state('LEGACY0008');
  console.log('LEGACY row:', leg.queueText);
  check('existing answered request with no repliedAt shows as an overdue new quote', leg.inQueue && /Overdue since/i.test(leg.queueText) && /NEW QUOTE/i.test(leg.queueText), leg);
  check('no page errors', errs.length === 0, errs);
  console.log(`\n${pass} passed, ${failN} failed`);
  await ctx.close();
  return { pass, fail: failN };
};
