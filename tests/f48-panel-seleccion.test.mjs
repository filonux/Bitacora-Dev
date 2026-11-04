// F48 · Rewrite panel over the selection: readable label, dark toast-green palette, hover feedback.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openApp, makeDb, sampleProject, selectIn, sleep } from './helpers.mjs';

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });

const abrir = (lang = 'es') => openApp(browser, { seed: makeDb({ projects: [sampleProject({ n: 3, words: 60 })] }), lang }).then(async (app) => { await selectIn(app.page, 0, 10, 60, { panel: true }); return app; });

test('T48.1 etiqueta REESCRIBIR/REWRITE de 10 px, #9fe0b6 y contraste ≥ 7:1 sobre el panel', async () => {
  for (const [lang, label] of [['es', 'REESCRIBIR'], ['en', 'REWRITE']]) {
    const { page, ctx } = await abrir(lang);
    const r = await page.evaluate(() => {
      const box = document.getElementById('selectionTools'), b = getComputedStyle(box, ':before'), rgb = (c) => c.match(/[\d.]+/g).map(Number);
      const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
      const stops = getComputedStyle(box).backgroundImage.match(/rgba?\([^)]+\)/g).map(rgb), top = stops.sort((a, b) => lum(b) - lum(a))[0];
      return { label: box.dataset.label, content: b.content, font: parseFloat(b.fontSize), color: rgb(b.color), ratio: (lum(rgb(b.color)) + 0.05) / (lum(top) + 0.05) };
    });
    assert.equal(r.label, label);
    assert.ok(r.content.includes(label), `contenido ${r.content}`);
    assert.equal(r.font, 10);
    assert.deepEqual(r.color, [159, 224, 182]);
    assert.ok(r.ratio >= 7, `contraste ${r.ratio.toFixed(1)}`);
    await ctx.close();
  }
});

test('T48.2 paleta oscura de toasts: degradado #0f1d15→#09130d, borde #2d6040 y relleno translúcido en los botones', async () => {
  const { page, ctx } = await abrir();
  const r = await page.evaluate(() => {
    const box = document.getElementById('selectionTools'), s = getComputedStyle(box), b = getComputedStyle(box.querySelector('[data-tone]'));
    return { bg: s.backgroundImage, border: s.borderTopColor, btnBg: b.backgroundColor, btnBorder: b.borderTopColor };
  });
  assert.match(r.bg, /rgb\(15, 29, 21\).*rgb\(9, 19, 13\)/);
  assert.equal(r.border, 'rgb(45, 96, 64)');
  assert.equal(r.btnBg, 'rgba(57, 208, 110, 0.07)');
  assert.equal(r.btnBorder, 'rgb(42, 82, 55)');
  await ctx.close();
});

test('T48.3 hover: los botones aclaran relleno y borde; «Traducir al inglés» cambia de degradado y sigue siendo el único opaco', async () => {
  const { page, ctx } = await abrir();
  const style = (sel) => page.evaluate((q) => { const s = getComputedStyle(document.querySelector(q)); return { bg: s.backgroundColor, bgi: s.backgroundImage, border: s.borderTopColor }; }, sel);
  const tone = '#selectionTools [data-tone]', tr = '#translateSelBtn';
  const [t0, tr0] = [await style(tone), await style(tr)];
  await page.hover(tone); await sleep(300);
  const t1 = await style(tone);
  assert.equal(t0.bg, 'rgba(57, 208, 110, 0.07)');
  assert.equal(t1.bg, 'rgba(57, 208, 110, 0.15)');
  assert.equal(t1.border, 'rgb(81, 164, 110)');
  await page.hover(tr); await sleep(300);
  const tr1 = await style(tr);
  assert.notEqual(tr1.bgi, tr0.bgi);
  assert.equal(tr1.border, 'rgb(91, 189, 138)');
  assert.equal(await page.locator('#selectionTools button').evaluateAll((bs) => bs.filter((b) => getComputedStyle(b).backgroundImage !== 'none').map((b) => b.id)).then((a) => a.join()), 'translateSelBtn');
  await ctx.close();
});
