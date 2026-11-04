// F50 · Notes and pending polish: pending edit, footer buttons, «Revierte», copy/export text, footer counter, per-project position.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openApp, makeDb, sampleProject, stored, contrast, sleep } from './helpers.mjs';

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });

const api = (page, op, args) => page.evaluate(([o, a]) => window.BitacoraAPI[o](a), [op, args]);
const css = (page, sel, prop) => page.locator(sel).first().evaluate((el, p) => getComputedStyle(el)[p], prop);
const px = async (page, sel, prop) => parseFloat(await css(page, sel, prop));
const mk = (id, text, done = false) => ({ id, text, done, source: 'manual', createdAt: new Date(2026, 0, 1).toISOString() });
const withPending = (extra = {}) => makeDb({ projects: [{ ...sampleProject(), pending: [mk('a', 'primero'), mk('b', 'hecho', true)], ...extra }] });
const texts = (page) => page.$$eval('.pending-item > span', (n) => n.map((e) => e.textContent));

test('T50.1a pending edit: 24×24 pencil on open and completed items; Enter or blur saves, Esc cancels', async () => {
  const { page, errors } = await openApp(browser, { seed: withPending() });
  for (const id of ['a', 'b']) {
    const box = await page.locator(`[data-pending-edit="${id}"]`).boundingBox();
    assert.ok(Math.abs(box.width - 24) <= 0.5 && Math.abs(box.height - 24) <= 0.5, `pencil ${id}: ${box.width}×${box.height}`);
  }
  await page.click('[data-pending-edit="a"]');
  await page.fill('.pending-edit-input', 'editado con Intro');
  await page.press('.pending-edit-input', 'Enter');
  assert.deepEqual(await texts(page), ['editado con Intro', 'hecho']);
  await page.click('[data-pending-edit="b"]');
  await page.fill('.pending-edit-input', 'editado al perder foco');
  await page.click('#pendingAddInput');
  assert.deepEqual(await texts(page), ['editado con Intro', 'editado al perder foco']);
  await page.click('[data-pending-edit="a"]');
  await page.fill('.pending-edit-input', 'cancelado');
  await page.press('.pending-edit-input', 'Escape');
  assert.deepEqual(await texts(page), ['editado con Intro', 'editado al perder foco']);
  assert.equal((await stored(page)).projects[0].pending[0].text, 'editado con Intro');
  assert.deepEqual(errors, []);
});

test('T50.1b pending edit: an empty or unchanged text keeps the previous one', async () => {
  const { page } = await openApp(browser, { seed: withPending() });
  await page.click('[data-pending-edit="a"]');
  await page.fill('.pending-edit-input', '   ');
  await page.press('.pending-edit-input', 'Enter');
  await page.click('[data-pending-edit="a"]');
  await page.press('.pending-edit-input', 'Enter');
  assert.equal((await texts(page))[0], 'primero');
});

test('T50.1c BitacoraAPI.editPending: edits, rejects unknown ids, and describe() lists at least 42 operations', async () => {
  const { page } = await openApp(browser, { seed: withPending() });
  assert.equal((await api(page, 'editPending', { id: 'a', text: 'por API' })).ok, true);
  assert.equal((await api(page, 'editPending', { id: 'zz', text: 'x' })).ok, false);
  assert.equal((await texts(page))[0], 'por API');
  assert.ok(await page.evaluate(() => window.BitacoraAPI.describe().operations.length) >= 42);
});

test('T50.1d BitacoraAPI.movePending: by position and by direction; done tasks cannot be moved', async () => {
  const seed = makeDb({ projects: [{ ...sampleProject(), pending: [mk('a', 'uno'), mk('b', 'dos'), mk('c', 'tres'), mk('d', 'hecho', true)] }] });
  const { page } = await openApp(browser, { seed });
  assert.equal((await api(page, 'movePending', { id: 'c', to: 1 })).data.n, 1);
  assert.equal((await api(page, 'movePending', { id: 'c', direction: 'down' })).data.n, 2);
  assert.equal((await api(page, 'movePending', { id: 'd', to: 1 })).error.code, 'invalid-argument');
  assert.deepEqual((await texts(page)).slice(0, 3), ['uno', 'tres', 'dos']);
});

test('T50.2a Export and Select note: mono 11 px (Copy 12 px), shorter than Copy, green glyph', async () => {
  const { page } = await openApp(browser);
  const sec = '.card-foot .nb-sec';
  assert.equal(await css(page, sec, 'fontSize'), '11px');
  assert.equal(await css(page, '.card-foot .nb-copy', 'fontSize'), '12px');
  assert.match(await css(page, sec, 'fontFamily'), /mono/i);
  assert.ok(await px(page, sec, 'height') < await px(page, '.card-foot .nb-copy', 'height'));
  const [r, g, b] = (await css(page, `${sec} i`, 'color')).match(/[\d.]+/g).map(Number);
  assert.ok(g > r + 40 && g > b + 20, `glyph colour ${r},${g},${b}`);
  assert.deepEqual((await page.$$eval(`${sec} i`, (n) => n.map((e) => e.textContent))).slice(0, 2), ['↧', '▍']);
});

test('T50.2b when the footer wraps, «Seleccionar nota» stays right-aligned', async () => {
  const { page } = await openApp(browser, { viewport: { width: 420, height: 800 } });
  const m = await page.evaluate(() => {
    const f = document.querySelector('.card-foot'), b = f.querySelector('.nb-sec:last-child');
    const cs = getComputedStyle(f), fr = f.getBoundingClientRect(), br = b.getBoundingClientRect();
    const first = f.querySelector('.foot-meta').getBoundingClientRect();
    return { gap: fr.right - parseFloat(cs.paddingRight) - br.right, wrapped: br.top > first.bottom - 2 };
  });
  assert.ok(m.wrapped, 'the footer should wrap at 420 px');
  assert.ok(Math.abs(m.gap) <= 1.5, `right gap ${m.gap}`);
});

test('T50.3 «Revierte» label: 12 px, no forced uppercase, contrast ≥ 7:1', async () => {
  const { page } = await openApp(browser);
  const l = '.version-relation label';
  assert.equal(await css(page, l, 'fontSize'), '12px');
  assert.equal(await css(page, l, 'textTransform'), 'none');
  assert.ok(contrast(await css(page, l, 'color'), 'rgb(11, 20, 14)') >= 7);
});

test('T50.7 «Revierte» version number: 15 px (11 px + 3 pt), mono, lining tabular slashed-zero digits, in the face and the list', async () => {
  const seed = makeDb({ projects: [sampleProject({ n: 3 })] });
  const { page } = await openApp(browser, { seed });
  const rv = page.locator('.version-card').nth(2).locator('.version-revert-select');
  await rv.locator('.select-face').click();
  for (const el of [rv.locator('.select-face'), rv.locator('.select-item').first()]) {
    const s = await el.evaluate((el) => { const c = getComputedStyle(el); return { size: c.fontSize, weight: c.fontWeight, family: c.fontFamily, num: c.fontVariantNumeric }; });
    assert.equal(s.size, '15px');
    assert.ok(Number(s.weight) >= 600, `weight ${s.weight}`);
    assert.match(s.family, /mono/i);
    for (const k of ['tabular-nums', 'slashed-zero', 'lining-nums']) assert.ok(s.num.includes(k), s.num);
  }
  const face = await rv.locator('.select-face').boundingBox();
  assert.ok(face.height >= 30, `face height ${face.height}`);
});

test('T50.4a copy and export carry only the version number and the text (no «INSTRUCCIONES Y NOTAS»)', async () => {
  const seed = makeDb({ projects: [{ ...sampleProject({ n: 1 }), versions: [{ ...sampleProject({ n: 1 }).versions[0], version: 'A', instructions: 'hola mundo' }] }] });
  const { page, clip } = await openApp(browser, { seed });
  await page.locator('.version-card').first().locator('[data-action="copy"]').click();
  await sleep(100);
  assert.equal(await clip(), 'VERSIÓN A\nhola mundo');
  const v = (await api(page, 'exportVersion', { id: 'p1-v1' })).data.text;
  assert.equal(v, 'VERSIÓN A\nhola mundo');
});

test('T50.4b project TXT has no «INSTRUCCIONES», «====» or «----» lines', async () => {
  const { page } = await openApp(browser);
  const t = (await api(page, 'exportProject', { id: 'p1', format: 'txt' })).data.text;
  assert.doesNotMatch(t, /INSTRUCCIONES/i);
  assert.doesNotMatch(t, /^\s*[=-]{3,}\s*$/m);
  assert.match(t, /nota1palabra1/);
});

test('T50.5 footer counter reads «1/3 versiones · 12 palabras» at 13 px', async () => {
  const { page } = await openApp(browser);
  const t = await page.locator('.version-card').first().locator('.card-foot').evaluate((f) => [...f.querySelectorAll('.foot-meta')].map((e) => e.textContent.trim()).join(' '));
  assert.equal(t.replace(/\s+/g, ' '), '1/3 versiones · 12 palabras');
  assert.equal(await css(page, '.card-foot .foot-meta', 'fontSize'), '13px');
});

test('T50.6 switching projects restores the note and exact scroll position; a never-opened project starts at the top', async () => {
  const mkP = (id, name, day) => ({ ...sampleProject({ id, name, n: 6, words: 150 }), updatedAt: new Date(2026, 1, day).toISOString() });
  const seed = makeDb({ projects: [mkP('pa', 'Alfa', 3), mkP('pb', 'Beta', 2), mkP('pc', 'Gamma', 1)] });
  const { page, errors } = await openApp(browser, { seed });
  const top = () => page.evaluate(() => Math.round(document.querySelector('.workspace-scroll').scrollTop));
  const go = async (name) => { await page.locator('.project-item', { hasText: name }).click(); await sleep(250); };
  await go('Alfa');
  await page.evaluate(() => { document.querySelector('.workspace-scroll').scrollTo({ top: 700, behavior: 'instant' }); });
  await sleep(250);
  const a = await top();
  assert.ok(a > 300, `Alfa scroll ${a}`);
  await go('Beta');
  assert.equal(await top(), 0, 'Beta never opened: starts at the top');
  await page.evaluate(() => { document.querySelector('.workspace-scroll').scrollTo({ top: 350, behavior: 'instant' }); });
  await sleep(250);
  const b = await top();
  await go('Alfa');
  assert.ok(Math.abs(await top() - a) <= 2, `Alfa restored ${await top()} vs ${a}`);
  await go('Beta');
  assert.ok(Math.abs(await top() - b) <= 2, `Beta restored ${await top()} vs ${b}`);
  await go('Gamma');
  assert.equal(await top(), 0, 'Gamma never opened: starts at the top');
  assert.deepEqual(errors, []);
});

test('T50.8 history bar: title 15 px and meta 16 px (+3 pt), mono tabular digits, never clipped, layout by width', async () => {
  const seed = makeDb({ projects: [{ ...sampleProject({ n: 25, words: 6 }), updatedAt: new Date(2026, 9, 27, 5, 5).toISOString() }] });
  for (const [width, layout] of [[1920, 'columns'], [1280, 'stacked'], [390, 'narrow']]) {
    const { page } = await openApp(browser, { seed, viewport: { width, height: 800 } });
    const r = await page.evaluate(() => {
      const t = document.querySelector('.history-toolbar-title'), m = document.querySelector('.history-toolbar-meta'), tb = document.querySelector('.history-toolbar');
      const ct = getComputedStyle(t), cm = getComputedStyle(m), tr = t.getBoundingClientRect(), mr = m.getBoundingClientRect(), br = tb.getBoundingClientRect();
      return {
        tSize: ct.fontSize, tCase: ct.textTransform, mSize: cm.fontSize, mFam: cm.fontFamily, mNum: cm.fontVariantNumeric, text: m.textContent,
        clipped: tb.scrollWidth > tb.clientWidth + 1 || mr.right > br.right + 1 || m.scrollWidth > m.clientWidth + 1,
        sameRow: Math.abs((tr.top + tr.bottom) / 2 - (mr.top + mr.bottom) / 2) < 8,
        searchBelow: document.querySelector('.history-search').getBoundingClientRect().top > mr.bottom - 2,
      };
    });
    assert.equal(r.tSize, '15px');
    assert.equal(r.mSize, '16px');
    assert.equal(r.tCase, 'none');
    assert.match(r.mFam, /mono/i);
    for (const k of ['tabular-nums', 'slashed-zero', 'lining-nums']) assert.ok(r.mNum.includes(k), r.mNum);
    assert.equal(r.text, '25 versiones · actualizado 27/10/26, 5:05');
    assert.equal(r.clipped, false, `clipped at ${width}`);
    assert.equal(r.searchBelow, layout !== 'columns', `search position at ${width}`);
    if (layout === 'stacked') assert.ok(r.sameRow, 'title and meta share a row');
    if (layout === 'narrow') assert.equal(r.sameRow, false, 'narrow: title above meta');
    await page.context().close();
  }
});
