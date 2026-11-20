const NOW = Date.parse('2026-12-07T10:00:00-05:00');
const wait = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, failN = 0;
function check(name, ok, info) { console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || info === undefined ? '' : '  -> ' + JSON.stringify(info))); ok ? pass++ : failN++; }
module.exports = async function (browser, base) {
  const ctx = await browser.createBrowserContext(), p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
  await p.evaluateOnNewDocument((now) => { const real = Date.now.bind(Date), off = now - real(), R = Date;
    function D(...a) { return a.length ? new R(...a) : new R(real() + off); } D.prototype = R.prototype; D.now = () => real() + off; D.parse = R.parse; D.UTC = R.UTC; window.Date = D; }, NOW);
  await p.setViewport({ width: 1300, height: 1000 });
  await p.goto(base + '/admin.html', { waitUntil: 'networkidle0' }); await wait(400);
  await p.evaluate(() => { const t = document.querySelector('[data-view-tab="requests"]'); if (t) t.click(); }); await wait(300);
  const rows = () => p.evaluate(() => [...document.querySelectorAll('[data-admin-queue] .q-row')].map(r => ({ id: r.dataset.qid, late: r.classList.contains('is-late'), triage: r.classList.contains('is-triage'), text: r.innerText.replace(/\s+/g, ' ') })));
  const chips = () => p.evaluate(() => [...document.querySelectorAll('[data-admin-queue] .q-chip')].map(c => c.innerText.replace(/\s+/g, ' ')));
  let R = await rows(); const by = id => R.find(r => r.id === id) || {};
  console.log('chips', JSON.stringify(await chips())); R.forEach(r => console.log(' ', r.id, r.late ? 'LATE' : '', r.triage ? 'TRIAGE' : '', '|', r.text.slice(0, 330)));
  check('strip lists the eight open items (incl. legacy + new booking), not the done request', R.length === 8 && !by('DONE000007').id, R.map(r => r.id));
  check('Friday 3:30 pm quote is due Mon 9:30 am and overdue at 10:00', by('FRI0QUOTE1').late && /Mon, Dec 7, 9:30/.test(by('FRI0QUOTE1').text), by('FRI0QUOTE1').text);
  check('...and shows the one-business-day bound Mon 3:30 pm', /3:30\s?PM/.test(by('FRI0QUOTE1').text), by('FRI0QUOTE1').text);
  check('...with no owner it sits with dispatch triage', by('FRI0QUOTE1').triage);
  check('earlier staff promise (9:45) wins over the 12:30 rule and is overdue', by('PROMISE003').late && /9:45/.test(by('PROMISE003').text), by('PROMISE003').text);
  check('...the last promise shown is Carla\'s logged reply in Spanish', /Te llamo antes de las 9:45/.test(by('PROMISE003').text) && /carla/.test(by('PROMISE003').text), by('PROMISE003').text);
  check('reschedule close to the visit is due at the 11:30 visit, not the 1:45 pm rule', /11:30/.test(by('RESCHED004').text) && /1:45/.test(by('RESCHED004').text) && !by('RESCHED004').late, by('RESCHED004').text);
  check('follow-up keeps its staff due Tue 10:00', /Tue, Dec 8, 10:00/.test(by('FOLLOW0005').text), by('FOLLOW0005').text);
  check('new quote without staff time shows the website promise text', /one business day/i.test(by('MON0QUOTE2').text), by('MON0QUOTE2').text);
  check('order: overdue first', R[0].late && R[1].late, R.map(r => r.id));

  // --- Stale edit panel: Ana opens the request card for RACE while Beto owns it.
  await p.evaluate(() => { const a = document.querySelector('[data-id="RACE000006"]'); a.querySelector('details.admin-edit').open = true; });
  // --- Two take-overs at once: Carla (another browser) and Ana's click. Ana's page hasn't seen Carla's write.
  await p.evaluate(() => { const B = window.MKG.backend; B._hold = true;
    window.__carla = B.takeOver('RACE000006', 'crew.beto@example.test', 'dispatch.carla@example.test', 'carla-uid').then(() => 'ok', e => e.code);
    document.querySelector('[data-admin-queue] [data-q-take][data-q-take="RACE000006"]').click(); });
  await wait(300);
  const race = await p.evaluate(async () => { const B = window.MKG.backend; return { carla: await window.__carla, owner: B._store.internal.RACE000006.assignedTo, ownerEvents: (B._store.events.RACE000006 || []).filter(e => e.kind === 'owner').map(e => e.text), msg: (document.querySelector('[data-qid="RACE000006"] .field-error') || {}).textContent }; });
  check('two take-overs at once: exactly one succeeds', race.carla === 'ok' && race.owner === 'dispatch.carla@example.test', race);
  check('...only the winner\'s change has a history event', race.ownerEvents.length === 1 && race.ownerEvents[0] === 'crew.beto@example.test -> dispatch.carla@example.test', race.ownerEvents);
  check('...the loser sees who has it now', /carla/.test(race.msg || ''), race.msg);
  // The older panel (still showing Beto) tries to assign it to Ana.
  await p.evaluate(() => { const a = document.querySelector('[data-id="RACE000006"]'), s = a.querySelector('[data-f="assignedTo"]'); s.value = 'dispatch.ana@example.test'; s.dispatchEvent(new Event('change', { bubbles: true })); s.dispatchEvent(new Event('input', { bubbles: true })); a.querySelector('[data-act="save"]').click(); });
  await wait(300);
  const st = await p.evaluate(() => { const B = window.MKG.backend; return { owner: B._store.internal.RACE000006.assignedTo, err: (document.querySelector('[data-id="RACE000006"] [data-edit-err]') || {}).textContent, ownerEvents: B._store.events.RACE000006.filter(e => e.kind === 'owner').length }; });
  check('older edit panel cannot overwrite the new owner', st.owner === 'dispatch.carla@example.test' && st.ownerEvents === 1, st);
  check('...and says the owner changed', /owner|changed/i.test(st.err || ''), st.err);
  await p.evaluate(() => { const B = window.MKG.backend; B._hold = false; B._emit(); }); await wait(300);
  // Same older panel, notes only: saves, owner untouched.
  await p.evaluate(() => { const a = document.querySelector('[data-id="RACE000006"]'); const d = a.querySelector('details.admin-edit'); d.open = true; const t = a.querySelector('[data-f="adminNotes"]'); t.value = 'Side gate'; t.dispatchEvent(new Event('input', { bubbles: true })); a.querySelector('[data-act="save"]').click(); });
  await wait(300);
  const st2 = await p.evaluate(() => window.MKG.backend._store.internal.RACE000006);
  check('notes-only save after refresh keeps Carla as owner', st2.owner === undefined ? st2.assignedTo === 'dispatch.carla@example.test' && st2.adminNotes === 'Side gate' : false, st2);

  // --- Take-over preserves the due time and last promise (PROMISE003: Carla -> Ana).
  const before = (await rows()).find(r => r.id === 'PROMISE003');
  await p.evaluate(() => document.querySelector('[data-q-take="PROMISE003"]').click()); await wait(300);
  const after = (await rows()).find(r => r.id === 'PROMISE003');
  const pq = await p.evaluate(() => window.MKG.backend._store.internal.PROMISE003);
  check('take-over changes the owner only', pq.assignedTo === 'dispatch.ana@example.test' && pq.queue.dueMs === Date.parse('2026-12-07T09:45:00-05:00'), pq);
  check('...due time and last promise still shown after take-over', /9:45/.test(after.text) && /Te llamo antes/.test(after.text), after.text);

  // --- Queue save, and a stale queue panel.
  await p.evaluate(() => { const d = document.querySelector('[data-q-details="MON0QUOTE2"]'); d.open = true; d.dispatchEvent(new Event('toggle')); }); await wait(100);
  await p.evaluate(() => window.MKG.backend.saveQueue('MON0QUOTE2', { state: 'open', nextAction: 'Carla: price it', dueMs: Date.parse('2026-12-07T12:00:00-05:00') }, null, 'carla-uid', 'open · Carla: price it'));
  await wait(200);
  await p.evaluate(() => { const r = document.querySelector('[data-qid="MON0QUOTE2"]'); const d = r.querySelector('details'); if (!d.open) { d.open = true; } r.querySelector('[data-q-next]').value = 'Ana: text the price'; r.querySelector('[data-q-due]').value = '2026-12-07T11:00'; r.querySelector('[data-q-save="open"]').click(); });
  await wait(300);
  const qs = await p.evaluate(() => ({ q: window.MKG.backend._store.internal.MON0QUOTE2.queue, err: (document.querySelector('[data-qid="MON0QUOTE2"] [data-q-err]') || {}).textContent }));
  check('stale queue panel cannot overwrite Carla\'s newer next action', qs.q.nextAction === 'Carla: price it' && /changed/i.test(qs.err || ''), qs);
  await p.evaluate(() => { const r = document.querySelector('[data-qid="MON0QUOTE2"]'); r.querySelector('[data-q-next]').value = 'Ana: text the price'; r.querySelector('[data-q-due]').value = '2026-12-07T11:00'; r.querySelector('[data-q-save="open"]').click(); });
  await wait(300);
  const qs2 = await p.evaluate(() => ({ q: window.MKG.backend._store.internal.MON0QUOTE2.queue, n: window.MKG.backend._store.events.MON0QUOTE2.length }));
  check('after the refresh the save lands, due 11:00 Charlotte time, two queue events', qs2.q.nextAction === 'Ana: text the price' && qs2.q.dueMs === Date.parse('2026-12-07T11:00:00-05:00') && qs2.n === 2, qs2);
  await p.evaluate(() => { const r = document.querySelector('[data-qid="MON0QUOTE2"]'); r.querySelector('[data-q-due]').value = ''; r.querySelector('[data-q-save="waiting"]').click(); }); await wait(150);
  check('a follow-up without a due time is refused', /due/i.test(await p.evaluate(() => document.querySelector('[data-qid="MON0QUOTE2"] [data-q-err]').textContent)));
  await p.evaluate(() => { const s = document.querySelector('[data-q-owner]'); s.value = 'me'; s.dispatchEvent(new Event('change', { bubbles: true })); }); await wait(150);
  const mine = (await rows()).map(r => r.id);
  check('owner filter "Mine" shows only Ana\'s items', mine.length && mine.every(id => ['FOLLOW0005', 'PROMISE003'].includes(id)), mine);
  await p.evaluate(() => { const s = document.querySelector('[data-q-owner]'); s.value = ''; s.dispatchEvent(new Event('change', { bubbles: true })); });
  // --- A genuine follow-up after a reply (normal save path: the request card's note to the customer).
  await p.evaluate(() => { const a = document.querySelector('[data-id="MON0QUOTE2"]'); a.querySelector('details.admin-edit').open = true; const n = a.querySelector('[data-f="replyNote"]'); n.value = 'Price is $195; reply when you have checked dates.'; n.dispatchEvent(new Event('input', { bubbles: true })); a.querySelector('[data-act="save"]').click(); });
  await wait(300);
  await p.evaluate(() => { const r = document.querySelector('[data-qid="MON0QUOTE2"]'); const d = r.querySelector('details'); d.open = true; });
  await wait(100);
  await p.evaluate(() => { const r = document.querySelector('[data-qid="MON0QUOTE2"]'); r.querySelector('[data-q-next]').value = 'Customer checking dates'; r.querySelector('[data-q-due]').value = '2026-12-09T10:00'; r.querySelector('[data-q-save="waiting"]').click(); });
  await wait(300);
  const fu = (await rows()).find(r => r.id === 'MON0QUOTE2') || {};
  const fuq = await p.evaluate(() => window.MKG.backend._store.internal.MON0QUOTE2.queue);
  check('after a logged reply, a follow-up keeps its own later deadline (Wed 10:00, not late)', !fu.late && /FOLLOW-UP/i.test(fu.text) && /Wed, Dec 9, 10:00/.test(fu.text) && typeof fuq.repliedMs === 'number', { text: fu.text, q: fuq });

  // --- A new customer reschedule against a stale staff panel.
  await p.evaluate(() => { const d = document.querySelector('[data-q-details="FOLLOW0005"]'); d.open = true; }); await wait(100);
  const evBefore = await p.evaluate(() => (window.MKG.backend._store.events.FOLLOW0005 || []).length);
  await p.evaluate(() => { const B = window.MKG.backend; B._hold = true;   // the move hasn't reached this screen yet
    return B.reschedule({ id: 'FOLLOW0005' }, '2026-12-08', '1130', true); });
  await p.evaluate(() => { const r = document.querySelector('[data-qid="FOLLOW0005"]'); const i = r.querySelector('[data-q-next]'); i.value = 'Done, gate code confirmed'; i.dispatchEvent(new Event('input', { bubbles: true })); r.querySelector('[data-q-save="closed"]').click(); });
  await wait(300);
  const mv = await p.evaluate(() => { const B = window.MKG.backend; return { q: B._store.internal.FOLLOW0005.queue, ev: (B._store.events.FOLLOW0005 || []).length }; });
  check('Close on the panel opened before the customer moved the visit is refused', mv.q.state === 'waiting' && mv.ev === evBefore, mv);
  await p.evaluate(() => { const B = window.MKG.backend; B._hold = false; B._emit(); }); await wait(300);
  const mvRow = (await rows()).find(r => r.id === 'FOLLOW0005') || {};
  console.log('  moved row:', (mvRow.text || '').slice(0, 420));
  check('the new reschedule stays visible as a reschedule', /RESCHEDULE/i.test(mvRow.text || ''), mvRow.text);
  check('staff is prompted to review the move', /moved this visit after you opened it/.test(mvRow.text || ''), mvRow.text);
  check('...and the panel is still open with the typed text', await p.evaluate(() => { const r = document.querySelector('[data-qid="FOLLOW0005"]'); return r.querySelector('details').open && r.querySelector('[data-q-next]').value === 'Done, gate code confirmed'; }));
  await p.evaluate(() => document.querySelector('[data-qid="FOLLOW0005"] [data-q-save="closed"]').click()); await wait(300);
  const closed = await p.evaluate(() => ({ q: window.MKG.backend._store.internal.FOLLOW0005.queue.state, shown: !!document.querySelector('[data-qid="FOLLOW0005"]') }));
  check('after the review, Close goes through deliberately', closed.q === 'closed' && !closed.shown, closed);

  // Spanish UI
  await p.evaluate(() => { const l = document.querySelector('[data-lang-switch="es"]'); if (l) l.click(); }); await wait(300);
  console.log('ES strip head:', await p.evaluate(() => (document.querySelector('[data-admin-queue]') || {}).innerText.slice(0, 200).replace(/\s+/g, ' ')));
  check('no page errors', errs.length === 0, errs);
  console.log(`\n${pass} passed, ${failN} failed`);
  await ctx.close();
  return { pass, fail: failN };
};
