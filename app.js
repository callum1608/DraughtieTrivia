(() => {
  'use strict';

  const STORAGE_KEY = 'draughty-trivia-v1';
  const OFFLINE_FLAG = 'draughty-trivia-offline-notified';

  const $ = (id) => document.getElementById(id);

  /* ---------- Questions ---------- */

  function hashText(text) {
    let h = 5381;
    for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
    return 'h' + h.toString(36);
  }

  // Accepts [{id?, question, answer}] (also q / a). Drops blanks and duplicate ids.
  function cleanQuestions(list, idPrefix = '') {
    const out = [];
    const ids = new Set();
    for (const item of list) {
      if (!item || typeof item !== 'object') continue;
      const q = String(item.question ?? item.q ?? '').trim();
      const a = String(item.answer ?? item.a ?? '').trim();
      if (!q || !a) continue;
      const rawId = item.id != null && String(item.id).trim() !== '' ? String(item.id).trim() : hashText(q.toLowerCase());
      const id = idPrefix + rawId;
      if (ids.has(id)) continue;
      ids.add(id);
      out.push({ id, q, a });
    }
    return out;
  }

  /* ---------- State (saved in localStorage) ---------- */

  const emptyState = () => ({ seen: [], beers: [], results: [], custom: [], session: null });

  function cleanState(raw) {
    const s = emptyState();
    if (!raw || typeof raw !== 'object') return s;
    if (Array.isArray(raw.seen)) s.seen = [...new Set(raw.seen.map(String))];
    if (Array.isArray(raw.beers)) s.beers = raw.beers.map(Number).filter(Number.isFinite);
    if (Array.isArray(raw.results)) {
      s.results = raw.results
        .filter((r) => r && r.id != null)
        .map((r) => ({ id: String(r.id), ok: !!r.ok, t: Number(r.t) || 0 }));
    }
    if (Array.isArray(raw.custom)) {
      s.custom = raw.custom
        .filter((q) => q && q.id != null && q.q && q.a)
        .map((q) => ({ id: String(q.id), q: String(q.q), a: String(q.a) }));
    }
    const ss = raw.session;
    if (ss && typeof ss === 'object' && ss.id != null) {
      s.session = {
        id: String(ss.id),
        phase: ['question', 'revealed', 'answered'].includes(ss.phase) ? ss.phase : 'question',
        ok: ss.ok === true ? true : ss.ok === false ? false : null,
      };
    }
    return s;
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? cleanState(JSON.parse(raw)) : emptyState();
    } catch {
      return emptyState();
    }
  }

  let state = loadState();
  let baseQuestions = [];
  let current = null;   // the question on screen
  let phase = 'idle';   // idle | question | revealed | answered

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      toast('Could not save. Browser storage may be full or blocked.');
    }
  }

  function allQuestions() {
    const map = new Map();
    for (const q of baseQuestions) map.set(q.id, q);
    for (const q of state.custom) map.set(q.id, q);
    return [...map.values()];
  }

  function unseenQuestions() {
    const seen = new Set(state.seen);
    return allQuestions().filter((q) => !seen.has(q.id));
  }

  function isToday(ts) {
    const d = new Date(ts);
    const n = new Date();
    return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
  }

  function buzz() {
    if (navigator.vibrate) navigator.vibrate(12);
  }

  /* ---------- Toast ---------- */

  let toastTimer;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 3400);
  }

  /* ---------- Rendering ---------- */

  function makeBtn(label, cls, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `btn px ${cls}`;
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  }

  function render() {
    const all = allQuestions();
    const left = unseenQuestions().length;

    // Beers
    const today = state.beers.filter(isToday).length;
    $('beerTotal').textContent = state.beers.length;
    $('beerSub').textContent = `${state.beers.length === 1 ? 'beer' : 'beers'}, ${today} today`;

    // Score
    const total = state.results.length;
    const ok = state.results.filter((r) => r.ok).length;
    $('rate').textContent = total ? `${Math.round((ok / total) * 100)}%` : '-';
    $('rateSub').textContent = total ? `${ok} of ${total} right` : 'no answers yet';

    // Questions left
    $('left').textContent = left;
    $('leftSub').textContent = left === 1 ? 'question left' : 'questions left';

    // Card
    const qEl = $('questionText');
    const hint = $('cardHint');
    const ans = $('answerBlock');
    const verdict = $('verdict');
    ans.hidden = true;
    verdict.hidden = true;

    if (!all.length) {
      qEl.textContent = 'No questions yet';
      hint.textContent = 'Add a questions.json file to the app, or import one from the menu.';
    } else if (!current || phase === 'idle') {
      qEl.textContent = 'Ready for a question?';
      hint.textContent = left
        ? `${left} unasked ${left === 1 ? 'question' : 'questions'} in the bag.`
        : 'Every question has been asked. Start over from the menu.';
    } else {
      qEl.textContent = current.q;
      hint.textContent = '';
      if (phase === 'revealed' || phase === 'answered') {
        ans.textContent = current.a;
        ans.hidden = false;
      }
      if (phase === 'answered') {
        const r = state.session ? state.session.ok : null;
        verdict.textContent = r === true ? 'You got it.' : r === false ? 'Missed this one.' : 'Not scored.';
        verdict.hidden = false;
      }
    }

    renderActions(all.length);
  }

  function renderActions(count) {
    const box = $('actions');
    box.replaceChildren();

    if (!count) {
      box.append(makeBtn('Import questions', 'gold', () => $('fileQuestions').click()));
      return;
    }
    if (phase === 'question') {
      box.append(makeBtn('Reveal answer', 'gold', reveal));
    } else if (phase === 'revealed') {
      const row = document.createElement('div');
      row.className = 'row';
      row.append(makeBtn('Missed it', 'deep', () => answer(false)), makeBtn('Got it', 'gold', () => answer(true)));
      box.append(row, makeBtn('Skip scoring', 'ghost small', skipScoring));
    } else {
      box.append(makeBtn('New question', 'gold', drawQuestion));
      const r = state.session ? state.session.ok : null;
      if (phase === 'answered' && r !== null) {
        box.append(makeBtn(r ? 'Wrong tap? Mark as missed' : 'Wrong tap? Mark as right', 'ghost small', flipAnswer));
      }
    }
  }

  /* ---------- Question flow ---------- */

  function drawQuestion() {
    if (!allQuestions().length) return;
    const pool = unseenQuestions();
    if (!pool.length) {
      openFinished();
      return;
    }
    current = pool[Math.floor(Math.random() * pool.length)];
    phase = 'question';
    state.seen.push(current.id);
    state.session = { id: current.id, phase, ok: null };
    save();
    render();
  }

  function reveal() {
    if (!current) return;
    phase = 'revealed';
    state.session = { id: current.id, phase, ok: null };
    save();
    render();
  }

  function finishAnswer(ok) {
    phase = 'answered';
    state.session = { id: current.id, phase, ok };
    save();
    render();
    buzz();
    if (unseenQuestions().length === 0) openFinished();
  }

  function answer(ok) {
    if (!current || phase !== 'revealed') return;
    state.results.push({ id: current.id, ok, t: Date.now() });
    finishAnswer(ok);
  }

  function skipScoring() {
    if (!current || phase !== 'revealed') return;
    finishAnswer(null);
  }

  function flipAnswer() {
    if (!current || phase !== 'answered' || !state.session || state.session.ok === null) return;
    const ok = !state.session.ok;
    for (let i = state.results.length - 1; i >= 0; i--) {
      if (state.results[i].id === current.id) { state.results[i].ok = ok; break; }
    }
    state.session.ok = ok;
    save();
    render();
  }

  function restoreSession() {
    current = null;
    phase = 'idle';
    const s = state.session;
    if (!s) return;
    const q = allQuestions().find((x) => x.id === s.id);
    if (q) { current = q; phase = s.phase; } else { state.session = null; }
  }

  /* ---------- Beers ---------- */

  function addBeer() {
    state.beers.push(Date.now());
    save();
    render();
    buzz();
  }

  function undoBeer() {
    if (!state.beers.length) { toast('No beers to remove.'); return; }
    state.beers.pop();
    save();
    render();
  }

  /* ---------- Dialogs ---------- */

  function openDialog(dlg) {
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', '');
  }

  function closeDialog(dlg) {
    if (typeof dlg.close === 'function') dlg.close();
    else dlg.removeAttribute('open');
  }

  function openMenu() {
    const base = baseQuestions.length;
    const custom = state.custom.length;
    $('menuInfo').textContent = `${allQuestions().length} questions loaded (${base} built in, ${custom} imported).`;
    openDialog($('menu'));
  }

  function openFinished() {
    const total = state.results.length;
    const ok = state.results.filter((r) => r.ok).length;
    const n = allQuestions().length;
    $('finishedText').textContent =
      `You've been through all ${n} ${n === 1 ? 'question' : 'questions'}.` +
      (total ? ` Overall you got ${ok} of ${total} right.` : '') +
      ' Start over to bring them all back, or add more questions from the menu.';
    openDialog($('finished'));
  }

  function startOver() {
    state.seen = [];
    state.session = null;
    current = null;
    phase = 'idle';
    save();
    render();
  }

  /* ---------- Import / export ---------- */

  async function importQuestionsFile(file) {
    try {
      const data = JSON.parse(await file.text());
      const list = Array.isArray(data) ? data : data && Array.isArray(data.questions) ? data.questions : null;
      if (!list) throw new Error('shape');
      const cleaned = cleanQuestions(list, 'c:');
      if (!cleaned.length) {
        toast('No usable questions found. Each one needs a "question" and an "answer".');
        return;
      }
      const byId = new Map(state.custom.map((q) => [q.id, q]));
      let added = 0;
      for (const q of cleaned) {
        if (!byId.has(q.id)) added++;
        byId.set(q.id, q);
      }
      state.custom = [...byId.values()];
      save();
      restoreSession();
      render();
      const skipped = list.length - cleaned.length;
      toast(`Imported ${added} new, updated ${cleaned.length - added}${skipped ? `, skipped ${skipped}` : ''}.`);
    } catch {
      toast('Could not read that file. It needs to be a JSON list of questions.');
    }
  }

  function exportBackup() {
    const stamp = new Date().toISOString().slice(0, 10);
    const payload = { app: 'draughty-trivia', version: 1, exportedAt: new Date().toISOString(), ...state };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `draughty-trivia-backup-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast('Backup saved to your Downloads folder.');
  }

  async function restoreBackup(file) {
    try {
      const data = JSON.parse(await file.text());
      const looksRight =
        data && typeof data === 'object' && !Array.isArray(data) &&
        (!data.app || data.app === 'draughty-trivia') &&
        ['seen', 'beers', 'results', 'custom'].some((k) => Array.isArray(data[k]));
      if (!looksRight) throw new Error('shape');
      if (!confirm('Replace everything in the app with this backup?')) return;
      state = cleanState(data);
      save();
      restoreSession();
      render();
      toast('Backup restored.');
    } catch {
      toast("That doesn't look like a Draughty Trivia backup.");
    }
  }

  /* ---------- Install prompt ---------- */

  let installEvent = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installEvent = e;
    $('menuInstall').hidden = false;
  });
  window.addEventListener('appinstalled', () => {
    installEvent = null;
    $('menuInstall').hidden = true;
  });

  /* ---------- Wiring ---------- */

  function bind() {
    $('beerAdd').addEventListener('click', addBeer);
    $('beerUndo').addEventListener('click', undoBeer);
    $('menuBtn').addEventListener('click', openMenu);
    $('menuClose').addEventListener('click', () => closeDialog($('menu')));

    for (const id of ['menu', 'finished']) {
      const dlg = $(id);
      dlg.addEventListener('click', (e) => { if (e.target === dlg) closeDialog(dlg); });
    }

    $('menuImportQ').addEventListener('click', () => { closeDialog($('menu')); $('fileQuestions').click(); });
    $('menuRestore').addEventListener('click', () => { closeDialog($('menu')); $('fileBackup').click(); });
    $('menuExport').addEventListener('click', () => { closeDialog($('menu')); exportBackup(); });

    $('menuStartOver').addEventListener('click', () => {
      closeDialog($('menu'));
      if (confirm('Bring every question back into the bag? Your score and beer count stay as they are.')) startOver();
    });
    $('menuResetScore').addEventListener('click', () => {
      closeDialog($('menu'));
      if (!confirm('Reset your score and beer count to zero?')) return;
      state.results = [];
      state.beers = [];
      if (state.session) state.session.ok = null;
      save();
      render();
    });
    $('menuClearCustom').addEventListener('click', () => {
      closeDialog($('menu'));
      if (!state.custom.length) { toast('No imported questions to remove.'); return; }
      if (!confirm('Remove all questions you imported from the menu? Built-in questions stay.')) return;
      state.custom = [];
      save();
      restoreSession();
      render();
    });
    $('menuInstall').addEventListener('click', async () => {
      closeDialog($('menu'));
      if (!installEvent) return;
      installEvent.prompt();
      try { await installEvent.userChoice; } catch { /* ignore */ }
      installEvent = null;
      $('menuInstall').hidden = true;
    });

    $('finishedRestart').addEventListener('click', () => { closeDialog($('finished')); startOver(); });
    $('finishedClose').addEventListener('click', () => closeDialog($('finished')));

    $('fileQuestions').addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (f) importQuestionsFile(f);
    });
    $('fileBackup').addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (f) restoreBackup(f);
    });
  }

  /* ---------- Startup ---------- */

  async function loadBase() {
    try {
      const res = await fetch('questions.json');
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      const list = Array.isArray(data) ? data : data && Array.isArray(data.questions) ? data.questions : [];
      baseQuestions = cleanQuestions(list);
    } catch {
      baseQuestions = [];
      toast("Couldn't load questions.json.");
    }
  }

  function registerWorker() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('sw.js').then(() => navigator.serviceWorker.ready).then(() => {
      try {
        if (!localStorage.getItem(OFFLINE_FLAG)) {
          localStorage.setItem(OFFLINE_FLAG, '1');
          toast('Saved for offline use.');
        }
      } catch { /* ignore */ }
    }).catch(() => { /* offline install not available here */ });
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  }

  async function init() {
    bind();
    await loadBase();
    restoreSession();
    render();
    registerWorker();
  }

  init();
})();
