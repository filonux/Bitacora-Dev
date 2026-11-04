import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openApp, contrast } from './helpers.mjs';

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });

// Reference before F33: 34 px high, full row width (minus 24 px padding), 14 px font.
async function abrir(opts = {}) {
  const app = await openApp(browser, { open: false, ...opts });
  if (await app.page.locator('#sidebarToggle').isVisible()) await app.page.click('#sidebarToggle');
  await app.page.waitForTimeout(250);
  return app;
}

const medir = (page) => page.evaluate(() => {
  const b = document.getElementById('newProjectBtn'), s = getComputedStyle(b), r = b.getBoundingClientRect();
  const ic = b.querySelector('svg.ic').getBoundingClientRect(), tx = b.querySelector('span'), tr = tx.getBoundingClientRect();
  const fila = document.querySelector('.sidebar-actions');
  return {
    w: r.width, h: r.height, font: parseFloat(s.fontSize), filaW: fila.clientWidth, filaH: fila.getBoundingClientRect().height,
    cortado: tx.scrollWidth > tx.clientWidth + 0.5, lineas: Math.round(tr.height / parseFloat(getComputedStyle(tx).lineHeight)),
    descentrado: Math.abs((ic.left + tr.right) / 2 - (r.left + r.width / 2)),
    texto: tx.textContent, aria: b.getAttribute('aria-label'), agent: b.dataset.agent,
  };
});

const hue = (c) => { const [r, g, b] = c.match(/[\d.]+/g).slice(0, 3).map((v) => v / 255); const mx = Math.max(r, g, b), d = mx - Math.min(r, g, b); const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return Math.round(((h * 60) + 360) % 360); };

for (const lang of ['es', 'en']) for (const width of [1280, 390, 320]) {
  test(`T33.1 la fuente sube a 15 px (antes 14) sin agrandar el botón: 34 px de alto, toda la fila, etiqueta en una línea y grupo centrado (${lang}, ${width} px)`, async () => {
    const { page, ctx } = await abrir({ lang, viewport: { width, height: 800 } });
    const m = await medir(page);
    assert.equal(m.font, 15, 'fuente');
    assert.ok(Math.abs(m.h - 34) <= 0.2, `alto ${m.h}`);
    assert.ok(Math.abs(m.filaH - 59) <= 0.5, `la fila de acciones cambió de alto: ${m.filaH}`);
    assert.ok(Math.abs(m.w - (m.filaW - 24)) <= 1, `ancho ${m.w} ≠ fila ${m.filaW} − 24`);
    assert.equal(m.cortado, false, 'etiqueta cortada');
    assert.equal(m.lineas, 1, 'la etiqueta ocupa más de una línea');
    assert.ok(m.descentrado <= 1.5, `icono + etiqueta descentrados ${m.descentrado.toFixed(1)} px`);
    await ctx.close();
  });
}

test('T33.2 el nombre accesible sigue siendo «+ Proyecto» / «+ Project», se actualiza al cambiar de idioma y conserva data-agent', async () => {
  const { page, ctx } = await abrir({ lang: 'es' });
  let m = await medir(page);
  assert.deepEqual([m.aria, m.texto, m.agent], ['+ Proyecto', 'Proyecto', 'new-project']);
  await page.click('#langEn'); await page.waitForTimeout(200);
  m = await medir(page);
  assert.deepEqual([m.aria, m.texto, m.agent], ['+ Project', 'Project', 'new-project']);
  await page.click('#langEs'); await page.waitForTimeout(200);
  assert.equal((await medir(page)).aria, '+ Proyecto');
  await ctx.close();
});

test('T33.3 el «+» es un SVG decorativo de trazo redondeado que hereda el color del texto; la etiqueta va en un <span>', async () => {
  const { page, ctx } = await abrir();
  const r = await page.evaluate(() => {
    const b = document.getElementById('newProjectBtn'), ic = b.querySelector('svg.ic'), p = getComputedStyle(ic.querySelector('path'));
    return { hijos: [...b.children].map((e) => e.tagName.toLowerCase()), oculto: ic.getAttribute('aria-hidden'), vb: ic.getAttribute('viewBox'), trazo: p.stroke, texto: getComputedStyle(b).color, cap: p.strokeLinecap, fill: p.fill };
  });
  assert.deepEqual(r.hijos, ['svg', 'span']);
  assert.equal(r.oculto, 'true'); assert.equal(r.vb, '0 0 24 24');
  assert.equal(r.trazo, r.texto); assert.equal(r.cap, 'round'); assert.equal(r.fill, 'none');
  await ctx.close();
});

test('T33.4 degradado esmeralda con luz cenital: tramos y borde verdes (130–160°), sombra interior y contraste del texto ≥ 4,5:1 en reposo y en hover', async () => {
  const { page, ctx } = await abrir();
  const leer = () => page.evaluate(() => { const s = getComputedStyle(document.getElementById('newProjectBtn')); return { img: s.backgroundImage, color: s.color, borde: s.borderTopColor, sombra: s.boxShadow }; });
  for (const estado of ['reposo', 'hover']) {
    if (estado === 'hover') { await page.hover('#newProjectBtn'); await page.waitForTimeout(450); }
    const l = await leer(), tramos = l.img.match(/rgb\([^)]+\)/g) || [];
    assert.ok(l.img.startsWith('linear-gradient') && tramos.length >= 2, `${estado}: sin degradado (${l.img})`);
    assert.ok(!l.img.includes('rgb(44, 125, 82)'), `${estado}: sigue el verde plano anterior`);
    for (const t of tramos) assert.ok(contrast(l.color, t) >= 4.5, `${estado}: contraste ${contrast(l.color, t).toFixed(2)} con ${t}`);
    for (const c of [...tramos, l.borde]) assert.ok(hue(c) >= 130 && hue(c) <= 160, `${estado}: ${c} fuera del verde (${hue(c)}°)`);
    assert.match(l.sombra, /inset/, `${estado}: falta la luz interior`);
  }
  await ctx.close();
});

test('T33.5 al pasar el ratón el «+» gira y crece (≈ 250 ms); con prefers-reduced-motion no hay transición', async () => {
  const normal = await abrir();
  const dur = (p) => p.$eval('#newProjectBtn .ic', (e) => getComputedStyle(e).transitionDuration);
  assert.equal(await dur(normal.page), '0.25s');
  const antes = await normal.page.$eval('#newProjectBtn .ic', (e) => getComputedStyle(e).transform);
  await normal.page.hover('#newProjectBtn'); await normal.page.waitForTimeout(450);
  const despues = await normal.page.$eval('#newProjectBtn .ic', (e) => getComputedStyle(e).transform);
  assert.notEqual(despues, antes, 'el icono no cambia en hover');
  await normal.ctx.close();
  const quieto = await abrir({ reducedMotion: 'reduce' });
  assert.ok(parseFloat(await dur(quieto.page)) <= 0.001, 'transición activa con prefers-reduced-motion');
  await quieto.ctx.close();
});
