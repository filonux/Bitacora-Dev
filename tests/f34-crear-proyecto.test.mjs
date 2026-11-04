import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openApp, makeDb, contrast } from './helpers.mjs';

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });

// «Crear proyecto» of the empty state (#emptyNew). Before F34: 14 px, weight 750, padding 0 11 px, flat green.
const abrir = (opts = {}) => openApp(browser, { seed: makeDb({ projects: [] }), open: false, ...opts });

/** Measures the button and, as a reference, a clone with the previous CSS (no id: plain `.btn.primary`). */
const medir = (page) => page.evaluate(() => {
  const e = document.getElementById('emptyNew'), r = e.getBoundingClientRect(), card = e.closest('.empty-card').getBoundingClientRect();
  const c = e.cloneNode(true); c.removeAttribute('id');
  c.style.cssText = 'position:absolute;visibility:hidden;transition:none;font-size:14px;font-weight:750;padding:0 11px';
  document.body.append(c); const antes = c.getBoundingClientRect(); c.remove();
  const rg = document.createRange(); rg.selectNodeContents(e);
  return {
    w: r.width, h: r.height, wAntes: antes.width, hAntes: antes.height, font: parseFloat(getComputedStyle(e).fontSize),
    lineas: new Set([...rg.getClientRects()].map((x) => Math.round(x.top))).size, cortado: e.scrollWidth > e.clientWidth + 0.5,
    descentrado: Math.abs(r.left + r.width / 2 - (card.left + card.width / 2)), texto: e.textContent,
  };
});

const hue = (c) => { const [r, g, b] = c.match(/[\d.]+/g).slice(0, 3).map((v) => v / 255); const mx = Math.max(r, g, b), d = mx - Math.min(r, g, b); const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return (h * 60 + 360) % 360; };
const estilo = (page, id) => page.evaluate((i) => { const s = getComputedStyle(document.getElementById(i)); return { img: s.backgroundImage, color: s.color, borde: s.borderTopColor, peso: s.fontWeight, fuente: s.fontSize, sombraTexto: s.textShadow, sombra: s.boxShadow, radio: s.borderRadius }; }, id);

for (const lang of ['es', 'en']) for (const width of [1280, 390, 320]) {
  test(`T34.1 fuente de 15 px (antes 14) sin agrandar el botón: 34 px de alto, no más ancho que antes, una línea y centrado (${lang}, ${width} px)`, async () => {
    const { page, ctx } = await abrir({ lang, viewport: { width, height: 800 } });
    const m = await medir(page);
    assert.equal(m.font, 15, 'fuente');
    assert.ok(Math.abs(m.h - 34) <= 0.2 && Math.abs(m.hAntes - 34) <= 0.2, `alto ${m.h} (antes ${m.hAntes})`);
    assert.ok(m.w <= m.wAntes + 0.5, `ancho ${m.w.toFixed(1)} > antes ${m.wAntes.toFixed(1)}`);
    assert.equal(m.lineas, 1, 'etiqueta en más de una línea'); assert.equal(m.cortado, false, 'etiqueta cortada');
    assert.ok(m.descentrado <= 1, `descentrado ${m.descentrado.toFixed(1)} px`);
    assert.equal(m.texto, lang === 'es' ? 'Crear proyecto' : 'Create project');
    await ctx.close();
  });
}

test('T34.2 misma receta que «+ Proyecto»: degradado, borde, color, peso, sombra del texto y luz interior idénticos; contraste ≥ 4,5:1 y matiz verde (130–160°)', async () => {
  const { page, ctx } = await abrir();
  const a = await estilo(page, 'emptyNew'), b = await estilo(page, 'newProjectBtn');
  for (const k of ['img', 'color', 'borde', 'peso', 'fuente', 'sombraTexto', 'sombra', 'radio']) assert.equal(a[k], b[k], k);
  const tramos = a.img.match(/rgb\([^)]+\)/g) || [];
  assert.ok(a.img.startsWith('linear-gradient') && tramos.length >= 2 && !a.img.includes('rgb(44, 125, 82)'), `sin degradado nuevo (${a.img})`);
  for (const t of tramos) assert.ok(contrast(a.color, t) >= 4.5, `contraste ${contrast(a.color, t).toFixed(2)} con ${t}`);
  for (const c of [...tramos, a.borde]) assert.ok(hue(c) >= 130 && hue(c) <= 160, `${c} fuera del verde (${hue(c)}°)`);
  assert.match(a.sombra, /inset/, 'falta la luz interior');
  await ctx.close();
});

test('T34.3 hover: el borde y el brillo se intensifican y el botón sube 1 px; con prefers-reduced-motion no hay transición ni desplazamiento', async () => {
  const normal = await abrir();
  const antes = await estilo(normal.page, 'emptyNew');
  await normal.page.hover('#emptyNew'); await normal.page.waitForTimeout(450);
  const despues = await estilo(normal.page, 'emptyNew');
  const claro = (c) => c.match(/[\d.]+/g).slice(0, 3).map(Number).reduce((x, y) => x + y, 0);
  assert.ok(claro(despues.borde) > claro(antes.borde), `borde ${antes.borde} → ${despues.borde}`);
  assert.notEqual(despues.sombra, antes.sombra, 'el brillo no cambia');
  assert.ok(contrast(despues.color, (despues.img.match(/rgb\([^)]+\)/g) || [])[0]) >= 4.5, 'contraste en hover');
  assert.notEqual(await normal.page.$eval('#emptyNew', (e) => getComputedStyle(e).transform), 'none', 'no sube en hover');
  await normal.ctx.close();
  const quieto = await abrir({ reducedMotion: 'reduce' });
  assert.ok(parseFloat(await quieto.page.$eval('#emptyNew', (e) => getComputedStyle(e).transitionDuration)) <= 0.001, 'transición activa');
  await quieto.page.hover('#emptyNew'); await quieto.page.waitForTimeout(100);
  assert.equal(await quieto.page.$eval('#emptyNew', (e) => getComputedStyle(e).transform), 'none', 'se desplaza con prefers-reduced-motion');
  await quieto.ctx.close();
});

test('T34.4 el botón sigue abriendo el formulario de proyecto nuevo y su nombre cambia con el idioma', async () => {
  const { page, ctx, errors } = await abrir({ lang: 'es' });
  assert.equal(await page.$eval('#emptyNew', (e) => e.getAttribute('aria-label')), 'Crear proyecto');
  await page.click('#langEn'); await page.waitForTimeout(200);
  assert.equal(await page.$eval('#emptyNew', (e) => e.getAttribute('aria-label')), 'Create project');
  await page.click('#emptyNew');
  await page.waitForSelector('.modal-box');
  assert.equal(await page.$eval('.modal-box', (e) => e.getAttribute('aria-label')), 'Create project');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('T34.5 el resto de .btn.primary comparte la receta de los botones de crear proyecto (F20; antes conservaba su verde plano)', async () => {
  const { page, ctx } = await abrir();
  assert.ok((await estilo(page, 'saveSettingsBtn')).img.includes('rgb(35, 128, 82)'), 'saveSettingsBtn sin la receta');
  await ctx.close();
});
