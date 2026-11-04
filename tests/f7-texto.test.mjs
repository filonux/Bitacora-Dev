// F7 · Fluid height and format bar. Per-note style was replaced by per-fragment formatting (F19, see f19-formato.test.mjs).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openApp, makeDb, sampleProject, noteModel, selectIn, pick } from './helpers.mjs';

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });

test('T7.1 al escribir y pegar texto largo la altura se ajusta sin saltos de scroll', async () => {
  const { page, ctx } = await openApp(browser, { viewport: { width: 1280, height: 900 } });
  const ed = page.locator('.instruction').nth(1);
  await ed.scrollIntoViewIfNeeded();
  await page.evaluate(() => { const e = document.querySelector('.workspace-scroll'); e.style.scrollBehavior = 'auto'; });
  await ed.click();
  await page.keyboard.press('Control+Home');
  const h0 = await ed.evaluate((e) => e.offsetHeight);
  const long = Array.from({ length: 80 }, (_, i) => `línea larga número ${i} con bastante texto para ocupar espacio`).join('\n');
  await page.keyboard.insertText(long); // same as pasting
  const m = await ed.evaluate((e) => ({ h: e.offsetHeight, sh: e.scrollHeight, ch: e.clientHeight }));
  assert.ok(m.h > h0 + 500, `no creció: ${h0} → ${m.h}`);
  assert.ok(m.sh - m.ch <= 1, `queda scroll interno: ${m.sh} > ${m.ch}`);
  // the browser scrolls just enough to keep the caret (at the end of the pasted text) in view
  const visible = () => page.evaluate(() => { const r = getSelection().getRangeAt(0).getBoundingClientRect(), w = document.querySelector('.workspace-scroll').getBoundingClientRect(); return r.bottom > w.top && r.top < w.bottom; });
  assert.ok(await visible(), 'el cursor queda fuera de la vista tras pegar');
  await page.keyboard.press('Control+Home');
  assert.ok(await visible(), 'el cursor queda fuera de la vista al volver al inicio');
  await page.evaluate(() => { document.querySelector('.workspace-scroll').scrollTop -= 300; }); // caret at mid-screen
  const top0 = await page.$eval('.workspace-scroll', (e) => e.scrollTop);
  for (let i = 0; i < 5; i++) { await page.keyboard.type('x'); await page.keyboard.press('Enter'); }
  assert.ok(Math.abs((await page.$eval('.workspace-scroll', (e) => e.scrollTop)) - top0) <= 1, 'salto de scroll al teclear');
  await page.keyboard.press('Control+a'); await page.keyboard.press('Delete');
  assert.ok((await ed.evaluate((e) => e.offsetHeight)) <= 160, 'no vuelve a encoger');
  assert.equal((await noteModel(page, 1)).text, '');
  await ctx.close();
});

test('T7.1b cambiar el ancho de la ventana reajusta la altura', async () => {
  const seed = makeDb({ projects: [sampleProject({ n: 1, words: 400 })] });
  const { page, ctx } = await openApp(browser, { seed, viewport: { width: 1280, height: 900 } });
  const wide = await page.locator('.instruction').evaluate((e) => e.offsetHeight);
  await page.setViewportSize({ width: 700, height: 900 });
  await page.waitForTimeout(250);
  const narrow = await page.locator('.instruction').evaluate((e) => ({ h: e.offsetHeight, sh: e.scrollHeight, ch: e.clientHeight }));
  assert.ok(narrow.h > wide, `estrecho ${narrow.h} ≤ ancho ${wide}`);
  assert.ok(narrow.sh - narrow.ch <= 1);
  await ctx.close();
});

test('T7.4 `instructions` es texto plano: el formato vive en `marks` y el copiado no lo incluye', async () => {
  const { page, ctx, clip } = await openApp(browser);
  const ed = page.locator('.instruction').first();
  await ed.click(); await page.keyboard.press('Control+a'); await page.keyboard.insertText('Texto plano de prueba');
  await selectIn(page, 0, 0, 21);
  const card = page.locator('.version-card').first();
  for (const k of ['b', 'i', 'u', 's']) await card.locator(`.fmt-btn[data-fmt="${k}"]`).click();
  await pick(card.locator('.fmt-dd[data-fmt="font"]'), 'mono');
  await pick(card.locator('.fmt-dd[data-fmt="size"]'), '18');
  const v = await page.evaluate(() => getProject().versions[0]);
  assert.equal(v.instructions, 'Texto plano de prueba');
  assert.deepEqual(v.marks, [{ from: 0, to: 21, font: 'mono', size: 18, b: true, i: true, u: true, s: true }]);
  assert.equal(v.style, undefined, 'el estilo por nota (F7) ya no se guarda');
  await card.locator('[data-action="copy"]').click();
  await page.waitForFunction(() => window.__clip);
  assert.match(await clip(), /Texto plano de prueba$/);
  assert.doesNotMatch(await clip(), /mono|18|<|\*\*|font/i);
  await ctx.close();
});

test('T7.5 un estilo (F7) o unas marcas manipulados en el JSON importado se normalizan', async () => {
  const p = sampleProject({ n: 3 });
  p.versions[0].style = { font: 'toString', size: 999, b: 'sí', i: 0, u: null, s: 1 };
  p.versions[1].instructions = 'abcdefghij';
  p.versions[1].marks = [{ from: -5, to: 4, b: true }, { from: 2, to: 99, i: true }, { from: 'x', to: 3, b: true }, null, { from: 6, to: 6, u: true }, { from: 7, to: 9, font: '__proto__', size: 3 }];
  p.versions[2].marks = 'no soy una lista';
  const { page, ctx, errors } = await openApp(browser, { seed: makeDb({ projects: [p] }) });
  const [a, b, c] = await page.evaluate(() => getProject().versions.map((v) => ({ marks: v.marks, style: v.style })));
  const n = p.versions[0].instructions.length;
  assert.deepEqual(a.marks, [{ from: 0, to: n, b: true, s: true }], 'estilo F7 → una marca que cubre toda la nota');
  assert.deepEqual(b.marks, [{ from: 0, to: 2, b: true }, { from: 2, to: 4, b: true, i: true }, { from: 4, to: 10, i: true }]);
  assert.deepEqual(c.marks, []);
  assert.ok([a, b, c].every((x) => x.style === undefined));
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('T7.6 la barra de formato cabe en móvil (390 px) sin desbordar la tarjeta', async () => {
  const { page, ctx } = await openApp(browser, { viewport: { width: 390, height: 800 } });
  const o = await page.evaluate(() => {
    const bar = document.querySelector('.fmt-bar'), body = bar.closest('.version-body');
    return { bar: bar.scrollWidth <= bar.clientWidth + 1, body: bar.getBoundingClientRect().right <= body.getBoundingClientRect().right + 1, page: document.documentElement.scrollWidth <= innerWidth };
  });
  assert.deepEqual(o, { bar: true, body: true, page: true });
  await ctx.close();
});
