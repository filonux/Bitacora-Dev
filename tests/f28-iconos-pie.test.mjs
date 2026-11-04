import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, APP_URL } from './helpers.mjs';

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });

const IDS = ['saveBtn', 'backupBtn', 'exportBtn', 'importBtn'];

// 2× context to measure the icon's real pixels (13.65 CSS px).
async function abrir() {
  const ctx = await browser.newContext({ deviceScaleFactor: 2, viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(APP_URL);
  return { page, ctx };
}

test('T28.1 los cuatro iconos son SVG de 24×24, decorativos (aria-hidden) y de dibujo distinto', async () => {
  const { page, ctx } = await abrir();
  const info = await page.evaluate((ids) => ids.map((id) => {
    const s = document.querySelector(`#${id} svg.ic`);
    return { id, vb: s.getAttribute('viewBox'), oculto: s.getAttribute('aria-hidden'), formas: s.querySelectorAll('path,ellipse,rect').length, trazo: s.innerHTML };
  }), IDS);
  for (const i of info) {
    assert.equal(i.vb, '0 0 24 24', `${i.id}: viewBox`);
    assert.equal(i.oculto, 'true', `${i.id}: debe ser decorativo`);
    assert.ok(i.formas >= 2, `${i.id}: icono demasiado pobre (${i.formas} formas)`);
  }
  assert.equal(new Set(info.map((i) => i.trazo)).size, 4, 'hay iconos repetidos');
  await ctx.close();
});

test('T28.2 cada icono cabe en su lienzo con margen para el trazo y lo aprovecha (≥ 13 de 24 unidades)', async () => {
  const { page, ctx } = await abrir();
  const caja = await page.evaluate((ids) => ids.map((id) => { const r = document.querySelector(`#${id} svg.ic`).getBBox(); return { id, x: r.x, y: r.y, w: r.width, h: r.height }; }), IDS);
  for (const b of caja) {
    assert.ok(b.x >= 0.95 && b.y >= 0.95, `${b.id}: el trazo se recorta por arriba/izquierda (${b.x}, ${b.y})`);
    assert.ok(b.x + b.w <= 23.05 && b.y + b.h <= 23.05, `${b.id}: el trazo se recorta por abajo/derecha`);
    assert.ok(b.w >= 13 && b.h >= 13, `${b.id}: icono pequeño (${b.w}×${b.h})`);
  }
  await ctx.close();
});

test('T28.3 a tamaño real los iconos se leen (cobertura de tinta 10–40 %) y se distinguen entre sí', async () => {
  const { page, ctx } = await abrir();
  const fotos = {};
  for (const id of IDS) fotos[id] = (await page.locator(`#${id} svg.ic`).screenshot()).toString('base64');
  // The ink mask is read by the browser itself: the stroke's red channel (#baeecc) exceeds 100; the button background's does not.
  const masks = await page.evaluate(async (fotos) => {
    const out = {};
    for (const [id, b64] of Object.entries(fotos)) {
      const bmp = await createImageBitmap(await (await fetch('data:image/png;base64,' + b64)).blob());
      const g = new OffscreenCanvas(bmp.width, bmp.height).getContext('2d');
      g.drawImage(bmp, 0, 0);
      const d = g.getImageData(0, 0, bmp.width, bmp.height).data;
      out[id] = Array.from({ length: bmp.width * bmp.height }, (_, i) => (d[i * 4] > 100 ? 1 : 0));
    }
    return out;
  }, fotos);
  const dif = (a, b) => { const n = Math.min(a.length, b.length); let union = 0, distintos = 0; for (let i = 0; i < n; i++) { if (a[i] || b[i]) union++; if (a[i] !== b[i]) distintos++; } return distintos / union; };
  for (const id of IDS) {
    const c = masks[id].reduce((s, v) => s + v, 0) / masks[id].length;
    assert.ok(c >= 0.10 && c <= 0.40, `${id}: cobertura de tinta ${(c * 100).toFixed(1)} %`);
  }
  for (let i = 0; i < IDS.length; i++) for (let j = i + 1; j < IDS.length; j++) {
    const par = [IDS[i], IDS[j]], d = dif(masks[par[0]], masks[par[1]]);
    // Export and Import share a box and differ only in arrow direction: it is enough that they are not identical.
    const minimo = par.includes('exportBtn') && par.includes('importBtn') ? 0.20 : 0.50;
    assert.ok(d >= minimo, `${par.join(' / ')}: se parecen demasiado (${(d * 100).toFixed(0)} % de diferencia, mínimo ${minimo * 100} %)`);
  }
  await ctx.close();
});

test('T28.4 el trazo hereda el color del botón, también al pasar el ratón; el relleno solo puede ser un tinte del mismo color (≤ 20 % de opacidad)', async () => {
  const { page, ctx } = await abrir();
  const leer = (id) => page.evaluate((id) => {
    const b = document.getElementById(id), formas = [...b.querySelectorAll('svg.ic > *')];
    return { texto: getComputedStyle(b).color, trazos: formas.map((e) => getComputedStyle(e).stroke), rellenos: formas.map((e) => { const s = getComputedStyle(e); return { fill: s.fill, op: parseFloat(s.fillOpacity) }; }) };
  }, id);
  for (const id of IDS) {
    for (const estado of ['reposo', 'hover']) {
      if (estado === 'hover') await page.hover(`#${id}`);
      const l = await leer(id);
      assert.ok(l.trazos.every((t) => t === l.texto), `${id} (${estado}): trazo ${l.trazos} ≠ texto ${l.texto}`);
      // Outline icon: each shape has no fill, or the text color at very low opacity (the icon body).
      assert.ok(l.rellenos.every((f) => f.fill === 'none' || (f.fill === l.texto && f.op <= 0.2)), `${id} (${estado}): relleno opaco o de otro color ${JSON.stringify(l.rellenos)}`);
      assert.ok(l.rellenos.filter((f) => f.fill === 'none').length >= 2, `${id} (${estado}): el icono debe ser sobre todo de contorno`);
    }
  }
  await ctx.close();
});
