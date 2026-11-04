import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openApp } from './helpers.mjs';

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });

for (const [lang, nombre] of [['es', 'Bitácora Dev'], ['en', 'Dev Log']]) {
  test(`T18.1 la pestaña muestra solo el nombre del programa (${lang})`, async () => {
    const { page, ctx } = await openApp(browser, { open: false, lang });
    assert.equal(await page.title(), nombre);
    await ctx.close();
  });
}

test('T18.3 el favicon es simbólico (≤ 4 formas) y ocupa todo el lienzo', async () => {
  const { page, ctx } = await openApp(browser, { open: false });
  const r = await page.evaluate(() => {
    const href = document.querySelector('link[rel="icon"][type="image/svg+xml"]').getAttribute('href');
    const svg = new DOMParser().parseFromString(decodeURIComponent(href.split(',').slice(1).join(',')), 'image/svg+xml').documentElement;
    const shapes = [...svg.querySelectorAll('rect,path,circle,ellipse,polygon,line')];
    const bg = svg.querySelector('rect');
    return { n: shapes.length, full: bg.getAttribute('width') === '96' && bg.getAttribute('height') === '96' && !bg.getAttribute('x') && !bg.getAttribute('y') };
  });
  assert.ok(r.n <= 4, `demasiadas formas: ${r.n}`);
  assert.ok(r.full, 'el fondo no cubre todo el lienzo');
  await ctx.close();
});

test('T18.4 (F20) Guardar no es sólido: comparte con los otros tres botones del pie fondo translúcido, contorno y grosor de filete', async () => {
  const { page, ctx } = await openApp(browser, { open: false });
  const r = await page.evaluate(() => Object.fromEntries(['saveBtn', 'backupBtn', 'exportBtn', 'importBtn', 'newProjectBtn'].map((id) => {
    const s = getComputedStyle(document.getElementById(id));
    const alpha = (c) => { const m = c.match(/[\d.]+/g).map(Number); return m.length > 3 ? m[3] : 1; };
    return [id, { img: s.backgroundImage, alpha: alpha(s.backgroundColor), border: s.borderTopWidth, style: s.borderTopStyle }];
  })));
  for (const id of ['saveBtn', 'backupBtn', 'exportBtn', 'importBtn']) {
    assert.equal(r[id].img, 'none', `${id}: sin degradado sólido`);
    assert.ok(r[id].alpha > 0 && r[id].alpha <= 0.3, `${id}: fondo translúcido (alfa ${r[id].alpha})`);
    assert.equal(r[id].border, '1px'); assert.equal(r[id].style, 'solid');
  }
  assert.notEqual(r.saveBtn.img, r.newProjectBtn.img, 'Guardar ya no copia el verde sólido de «+ Proyecto»');
  await ctx.close();
});

test('T18.5 los botones de nota (Analizar, Duplicar, Eliminar) tienen tonos suaves y matices distintos', async () => {
  const { page, ctx } = await openApp(browser);
  const cols = await page.evaluate(() => ['.nb-analyze', '.nb-dup', '.nb-del'].map((s) => {
    const [r, g, b] = getComputedStyle(document.querySelector(s)).color.match(/[\d.]+/g).map(Number).map((v) => v / 255);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    const h = d === 0 ? 0 : mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return { hue: Math.round(h * 60), sat: d / (1 - Math.abs(mx + mn - 1) || 1), light: (mx + mn) / 2 };
  }));
  const [an, du, de] = cols;
  assert.ok(an.hue > 170 && an.hue < 200, `Analizar ${an.hue}°`);
  assert.ok(du.hue > 35 && du.hue < 55, `Duplicar ${du.hue}°`);
  assert.ok(de.hue < 15 || de.hue > 345, `Eliminar ${de.hue}°`);
  for (const c of cols) { assert.ok(c.sat <= 0.45, `saturación ${c.sat.toFixed(2)}`); assert.ok(c.light <= 0.76, `claridad ${c.light.toFixed(2)}`); }
  await ctx.close();
});
