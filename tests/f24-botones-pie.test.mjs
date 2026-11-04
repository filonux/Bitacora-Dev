import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openApp } from './helpers.mjs';

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });

// Sizes and widths live in f32-pie-compacto.test.mjs; this file covers shape, tone, contrast and uncut labels.
const IDS = ['saveBtn', 'backupBtn', 'exportBtn', 'importBtn'];
const medir = (page) => page.evaluate((ids) => ids.map((id) => {
  const e = document.getElementById(id), s = getComputedStyle(e), sp = e.querySelector('span'), ic = e.querySelector('.ic');
  const rgb = (c) => c.match(/[\d.]+/g).map(Number);
  return {
    id, h: e.getBoundingClientRect().height, font: parseFloat(s.fontSize), icon: ic.getBoundingClientRect().width,
    radius: s.borderRadius, borde: s.borderTopWidth, bordeC: s.borderTopColor, peso: s.fontWeight, color: rgb(s.color), fondo: rgb(s.backgroundColor),
    cortado: sp.scrollWidth > sp.clientWidth + 0.5, ancho: e.getBoundingClientRect().width,
  };
}), IDS);

for (const lang of ['es', 'en']) for (const width of [1280, 390, 320]) {
  test(`T24.2 ninguna etiqueta queda cortada con «…» (${lang}, ${width} px)`, async () => {
    const { page, ctx } = await openApp(browser, { lang, open: false, viewport: { width, height: 800 } });
    if (await page.locator('#sidebarToggle').isVisible()) await page.click('#sidebarToggle');
    await page.waitForTimeout(250);
    for (const b of await medir(page)) assert.equal(b.cortado, false, `${b.id}: etiqueta cortada a ${width} px`);
    await ctx.close();
  });
}

test('T24.3 integradas: misma forma, contorno, peso, altura y relleno translúcido, y el mismo tono (el de Exportar) en texto, borde y fondo', async () => {
  const { page, ctx } = await openApp(browser);
  const m = await medir(page);
  for (const k of ['radius', 'borde', 'peso', 'bordeC']) assert.equal(new Set(m.map((b) => b[k])).size, 1, `${k} difiere entre botones`);
  for (const k of ['color', 'fondo']) assert.equal(new Set(m.map((b) => b[k].join())).size, 1, `${k} difiere entre botones`);
  assert.equal(new Set(m.map((b) => b.h.toFixed(1))).size, 1, 'alturas distintas');
  assert.ok(m[0].fondo[3] > 0 && m[0].fondo[3] < 0.3, 'el relleno es un tinte translúcido, no sólido');
  assert.deepEqual(m[0].color.slice(0, 3), [186, 238, 204], 'el texto debe ser el de Exportar (#baeecc)');
  await ctx.close();
});

test('T24.4 el relleno de los cuatro es verde (120–155°) y el texto sigue contrastando ≥ 4,5:1 sobre el menú', async () => {
  const { page, ctx } = await openApp(browser);
  const hue = ([r, g, b]) => { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), d = mx - Math.min(r, g, b); const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return Math.round(((h * 60) + 360) % 360); };
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  for (const b of await medir(page)) {
    const h = hue(b.fondo); assert.ok(h >= 120 && h <= 155, `${b.id}: matiz del relleno ${h}°`);
    const [x, y] = [lum(b.color), lum([5, 8, 6])].sort((p, q) => q - p);
    assert.ok((x + 0.05) / (y + 0.05) >= 4.5, `${b.id}: contraste bajo`);
  }
  await ctx.close();
});
