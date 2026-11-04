// F44 · «≠ ANÁLISIS» mark in the note header: shown only for saved analyses (×n), opens and closes them without AI, same height and row as the status pill.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openApp, makeDb, sampleProject, medirDesbordes } from './helpers.mjs';

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });

const STAMP = new Date(2026, 1, 2).toISOString();
const an = (id, text, status = 'changes') => ({ id, status, text, savedAt: STAMP });
/** Five notes with 0, 1, 2, 1 and 3 saved analyses (#4 is the current one). #0 can never have one: nothing to compare it with. */
const seed = () => {
  const p = sampleProject({ id: 'p1', name: 'Pulsar Observability', n: 5, words: 40 });
  p.versions[1].changeAnalyses = [an('a1', 'Cambio uno.')];
  p.versions[2].changeAnalyses = [an('a2', 'Primero.'), an('a3', 'Segundo.', 'no-changes')];
  p.versions[3].changeAnalyses = [an('a4', 'Solo uno.')];
  p.versions[4].changeAnalyses = [an('a5', 'Uno.'), an('a6', 'Dos.'), an('a7', 'Tres.')];
  return makeDb({ projects: [p] });
};
const card = (page, i) => page.locator('.version-card').nth(i);
const mark = (page, i) => card(page, i).locator('.analysis-mark');
const label = (page, i) => mark(page, i).locator('span').textContent();
const expanded = (page, i) => mark(page, i).getAttribute('aria-expanded');
const block = (page, i) => card(page, i).locator('.diff-analysis');
const body = (page, i) => card(page, i).locator('.diff-analysis-body');
const analyses = (page) => page.evaluate(() => getProject().versions.map((v) => v.changeAnalyses.length));

test('T44.1 la marca sale solo en las notas con análisis guardados, con ×n; es un botón con nombre accesible y data-agent estable (ES y EN)', async () => {
  const text = {
    es: { word: 'ANÁLISIS', one: 'Ver el análisis guardado', many: 'Ver los análisis guardados' },
    en: { word: 'ANALYSIS', one: 'Show the saved analysis', many: 'Show the saved analyses' },
  };
  for (const lang of ['es', 'en']) {
    const x = text[lang];
    const { page, errors } = await openApp(browser, { seed: seed(), lang });
    const found = await page.evaluate(() => [...document.querySelectorAll('.version-card')].map((c) => {
      const m = c.querySelector('.analysis-mark');
      if (!m) return null;
      const glyph = m.querySelector('i');
      return {
        tag: m.tagName, type: m.type, label: m.querySelector('span').textContent, glyph: glyph.textContent, glyphHidden: glyph.getAttribute('aria-hidden'),
        expanded: m.getAttribute('aria-expanded'), title: m.title, agent: m.dataset.agent, aria: m.getAttribute('aria-label'), version: c.querySelector('.version-input').value,
      };
    }));
    assert.equal(found.length, 5);
    assert.deepEqual(found.map((m) => m?.label ?? null), [null, x.word, `${x.word} ×2`, x.word, `${x.word} ×3`], `${lang}: marks per note`);
    const marks = found.filter(Boolean);
    assert.deepEqual(marks.map((m) => m.title), [x.one, `${x.many} (2)`, x.one, `${x.many} (3)`], `${lang}: titles`);
    for (const m of marks) {
      assert.ok(m.tag === 'BUTTON' && m.type === 'button' && m.glyph === '≠' && m.glyphHidden === 'true', `${lang}: a button with a decorative ≠`);
      assert.equal(m.expanded, 'false', `${lang}: closed`);
      assert.equal(m.agent, 'note-analysis-mark', `${lang}: stable data-agent`);
      assert.ok(m.aria.startsWith(m.title) && m.aria.includes(m.version), `${lang}: accessible name «${m.aria}»`);
    }
    assert.equal(new Set(marks.map((m) => m.aria)).size, marks.length, `${lang}: unique accessible names`);
    assert.deepEqual(errors, []);
    await page.context().close();
  }
});

test('T44.2 la marca abre y cierra el análisis guardado sin IA, igual que «Analizar cambios»; con varios abre el último y deja elegir; solo uno abierto', async () => {
  // With AI configured: nothing is requested.
  const { page, aiRequests, errors } = await openApp(browser, { seed: seed(), ai: async () => 'RESULT: CHANGES\nNo debería pedirse.' });
  await mark(page, 1).click();
  assert.equal(await expanded(page, 1), 'true');
  assert.equal(await body(page, 1).textContent(), 'Cambio uno.');
  assert.ok(await mark(page, 1).evaluate((m) => m.classList.contains('open')), 'open state');
  await mark(page, 1).click();
  assert.equal(await expanded(page, 1), 'false');
  assert.equal(await block(page, 1).count(), 0);
  // The mark and the «Analizar cambios» button are the same toggle, in both directions.
  await mark(page, 1).click();
  await card(page, 1).locator('[data-action="diff"]').click();
  assert.equal(await expanded(page, 1), 'false');
  await card(page, 1).locator('[data-action="diff"]').click();
  assert.equal(await expanded(page, 1), 'true');
  // Several analyses: the latest, with its history; picking the previous one keeps the mark open.
  await mark(page, 2).click();
  assert.equal(await body(page, 2).textContent(), 'Segundo.');
  assert.equal(await card(page, 2).locator('.diff-analysis-history .btn').count(), 2);
  await card(page, 2).locator('.diff-analysis-history .btn').first().click();
  assert.equal(await body(page, 2).textContent(), 'Primero.');
  assert.equal(await expanded(page, 2), 'true');
  assert.equal(await expanded(page, 1), 'false', 'opening another note closes the previous analysis');
  assert.equal(await page.locator('.diff-analysis').count(), 1, 'only one analysis open');
  // Keyboard: a real button.
  await mark(page, 4).focus();
  await page.keyboard.press('Enter');
  assert.equal(await expanded(page, 4), 'true');
  assert.equal(await expanded(page, 2), 'false');
  assert.equal(aiRequests.length, 0, 'opening and closing saved analyses never calls the AI');
  assert.deepEqual(errors, []);
  await page.context().close();

  // Without AI configured it opens just the same.
  const sinIA = await openApp(browser, { seed: seed() });
  assert.equal(await sinIA.page.evaluate(() => getActiveProvider()), null);
  await mark(sinIA.page, 3).click();
  assert.equal(await expanded(sinIA.page, 3), 'true');
  assert.equal(await body(sinIA.page, 3).textContent(), 'Solo uno.');
  assert.deepEqual(sinIA.errors, []);
  await sinIA.page.context().close();
});

/** Rects of the pill, mark, version field, label and actions of every note that has a mark (null for the others). */
const geometry = (page) => page.evaluate(() => [...document.querySelectorAll('.version-card')].map((c) => {
  const m = c.querySelector('.analysis-mark');
  if (!m) return null;
  const r = (el) => { const b = el.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, left: b.left, right: b.right, h: b.height }; };
  return {
    version: c.querySelector('.version-input').value, many: m.textContent.includes('×'), clipped: m.scrollWidth > m.clientWidth + 1,
    state: r(c.querySelector('.version-state')), mark: r(m), head: r(c.querySelector('.version-head')),
    others: ['.version-label', '.version-input', '.version-head-actions'].map((s) => [s, r(c.querySelector(s))]),
  };
}));
const middle = (r) => (r.top + r.bottom) / 2;
const overlap = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
/** «left,top → right,bottom» in px: a failure can be read without reproducing it. */
const box = (r) => `${r.left.toFixed(1)},${r.top.toFixed(1)} → ${r.right.toFixed(1)},${r.bottom.toFixed(1)}`;
/** The mark has the pill's height; it shares its row (a single analysis must; with ×n it may drop to the next row), never overlapping or leaving the head. */
function checkGeometry(notes, width, where) {
  const marked = notes.filter(Boolean);
  assert.equal(marked.length, 4, `${where}: four notes with a mark`);
  for (const n of marked) {
    const at = `${where} · ${n.version}`;
    assert.ok(Math.abs(n.mark.h - n.state.h) < 0.5, `${at}: mark ${n.mark.h} px, pill ${n.state.h} px`);
    const sameRow = Math.abs(middle(n.mark) - middle(n.state)) <= 1;
    if (sameRow) assert.ok(n.mark.left >= n.state.right - 0.5, `${at}: the mark goes after the pill (mark ${box(n.mark)}; pill ${box(n.state)})`);
    else assert.ok(n.mark.top >= n.state.bottom - 0.5, `${at}: it wrapped but not below the pill (mark ${box(n.mark)}; pill ${box(n.state)})`);
    if (!n.many || width === 1280) assert.ok(sameRow, `${at}: it must share the pill's row (mark middle ${middle(n.mark).toFixed(1)}; pill middle ${middle(n.state).toFixed(1)})`);
    assert.ok(!overlap(n.mark, n.state), `${at}: overlaps the pill (mark ${box(n.mark)}; pill ${box(n.state)})`);
    for (const [sel, rect] of n.others) assert.ok(!overlap(n.mark, rect), `${at}: overlaps ${sel} (mark ${box(n.mark)}; ${sel} ${box(rect)})`);
    assert.ok(n.mark.left >= n.head.left - 0.5 && n.mark.right <= n.head.right + 0.5, `${at}: leaves the note header (mark ${box(n.mark)}; header ${box(n.head)})`);
    assert.ok(!n.clipped, `${at}: clipped text`);
  }
}

test('T44.3 misma altura que la pastilla de estado y en su fila (con ×n puede bajar si no cabe), sin recortes ni desbordes; 1280, 390 y 320 px, ES y EN', async () => {
  for (const lang of ['es', 'en']) {
    for (const width of [1280, 390, 320]) {
      const where = `${lang} ${width} px`;
      const { page, errors } = await openApp(browser, { seed: seed(), lang, viewport: { width, height: 800 } });
      const flow = async (when) => {
        checkGeometry(await geometry(page), width, `${where} ${when}`);
        const o = await page.evaluate(medirDesbordes);
        assert.ok(o.desborde <= 0 && o.pagina <= 0 && !o.fuera.length && !o.recortados.length, `${where} ${when}: overflow ${JSON.stringify(o)}`);
      };
      await flow('closed');
      await mark(page, 1).click(); // the open state keeps the same geometry
      await flow('open');
      assert.deepEqual(errors, []);
      await page.context().close();
    }
  }
});

test('T44.4 guardar un análisis hace aparecer la marca (sin guardar no la hay) y eliminarlo la quita; igual por la API', async () => {
  let n = 0;
  const db = makeDb({ projects: [sampleProject({ id: 'p1', name: 'Pulsar Observability', n: 3, words: 40 })] });
  const { page, errors } = await openApp(browser, { seed: db, ai: async () => `RESULT: CHANGES\nAnálisis simulado ${++n}.` });
  const api = (op, args) => page.evaluate(([o, a]) => window.BitacoraAPI[o](a), [op, args]);
  assert.equal(await mark(page, 1).count(), 0);
  // Generated but not saved: the block is open and there is still no mark.
  await card(page, 1).locator('[data-action="diff"]').click();
  await body(page, 1).waitFor();
  assert.equal(await mark(page, 1).count(), 0, 'an unsaved analysis paints no mark');
  assert.deepEqual(await analyses(page), [0, 0, 0]);
  // Saving it: the mark appears (open, because its block is) and the analysis is stored.
  await card(page, 1).locator('[data-analysis-action="save"]').click();
  assert.equal(await label(page, 1), 'ANÁLISIS');
  assert.equal(await expanded(page, 1), 'true');
  assert.deepEqual(await analyses(page), [0, 1, 0]);
  // A second one: re-analyzing does not count until it is saved; then ×2.
  await card(page, 1).locator('[data-analysis-action="reanalyze"]').click();
  await card(page, 1).locator('[data-analysis-action="save"]').waitFor();
  assert.equal(await label(page, 1), 'ANÁLISIS');
  await card(page, 1).locator('[data-analysis-action="save"]').click();
  assert.equal(await label(page, 1), 'ANÁLISIS ×2');
  // Removing them one by one: ×2 → one → none (the mark and the block go away).
  await card(page, 1).locator('[data-analysis-action="remove"]').click();
  assert.equal(await label(page, 1), 'ANÁLISIS');
  await card(page, 1).locator('[data-analysis-action="remove"]').click();
  assert.equal(await mark(page, 1).count(), 0);
  assert.equal(await block(page, 1).count(), 0);
  assert.deepEqual(await analyses(page), [0, 0, 0]);
  // The same through the API (agents): analyzeChanges({save}) paints the mark and deleteAnalysis removes it.
  const r = await api('analyzeChanges', { id: 'p1-v3', save: true });
  assert.ok(r.ok && r.data.saved, JSON.stringify(r));
  assert.equal(await label(page, 2), 'ANÁLISIS');
  const d = await api('deleteAnalysis', { id: 'p1-v3' });
  assert.ok(d.ok && d.data.remaining === 0, JSON.stringify(d));
  assert.equal(await mark(page, 2).count(), 0);
  assert.deepEqual(errors, []);
  await page.context().close();
});

test('T44.5 editar una nota quita la marca (y el bloque abierto) de ella y de la siguiente, no la de las demás, y el editor conserva el foco', async () => {
  const { page, errors } = await openApp(browser, { seed: seed() });
  await mark(page, 2).click(); // its block is open too
  assert.equal(await block(page, 2).count(), 1);
  assert.deepEqual(await analyses(page), [0, 1, 2, 1, 3]);
  // An analysis compares a note with the previous one: editing #2 invalidates #2 and #3; #1 and #4 are unaffected.
  await card(page, 2).locator('.instruction').click();
  await page.keyboard.press('Control+End');
  await page.evaluate(() => { window.__editor = document.activeElement; });
  assert.ok(await page.evaluate(() => window.__editor.classList.contains('instruction')), 'the editor has focus');
  await page.keyboard.type(' primera');
  for (const [i, n] of [[1, 1], [2, 0], [3, 0], [4, 1]]) assert.equal(await mark(page, i).count(), n, `mark of #${i}`);
  assert.equal(await block(page, 2).count(), 0, 'the open analysis goes away');
  assert.deepEqual(await analyses(page), [0, 1, 0, 0, 3]);
  // Nothing was repainted under the editor: same node, still focused, and typing carries on in it.
  assert.ok(await page.evaluate(() => window.__editor.isConnected && document.activeElement === window.__editor), 'focus kept');
  await page.keyboard.type(' segunda');
  assert.ok((await page.evaluate(() => getProject().versions[2].instructions)).endsWith(' primera segunda'));
  assert.ok(await page.evaluate(() => document.activeElement === window.__editor), 'focus kept while typing on');
  assert.deepEqual(errors, []);
  await page.context().close();
});
