import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openApp } from './helpers.mjs';

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });

const IDS = ['saveBtn', 'backupBtn', 'exportBtn', 'importBtn'];
// F31 measurements, the reference for the reduction: card 46.8 px; block of four 101.59 px (2 × 46.8 + 8).
const F31 = { alto: 46.8, bloque: 101.59 };
const recorte = (antes, ahora) => 1 - ahora / antes;

async function abrir(opts = {}) {
  const app = await openApp(browser, { open: false, ...opts });
  if (await app.page.locator('#sidebarToggle').isVisible()) await app.page.click('#sidebarToggle');
  await app.page.waitForTimeout(250);
  return app;
}

const medir = (page) => page.evaluate((ids) => {
  const caja = (e) => { const r = e.getBoundingClientRect(); return { w: r.width, h: r.height }; };
  const rejilla = document.querySelector('.foot-tiles'), gs = getComputedStyle(rejilla);
  return {
    tarjetas: ids.map((id) => { const e = document.getElementById(id), s = getComputedStyle(e); return { id, ...caja(e), font: parseFloat(s.fontSize), icono: caja(e.querySelector('.ic')).w }; }),
    bloque: caja(rejilla), colGap: parseFloat(gs.columnGap), rowGap: parseFloat(gs.rowGap), menu: caja(document.getElementById('sidebar')).w,
  };
}, IDS);

test('T32.1 cada tarjeta mide 39,1 px de alto (fuente 12,5 px, icono 18 px) y tanto ella como el bloque de cuatro quedan entre un 15 y un 20 % por debajo de F31', async () => {
  const { page, ctx } = await abrir();
  const m = await medir(page);
  for (const t of m.tarjetas) {
    assert.ok(Math.abs(t.h - 39.1) <= 0.3, `${t.id}: alto ${t.h}`);
    const r = recorte(F31.alto, t.h);
    assert.ok(r >= 0.15 && r <= 0.20, `${t.id}: recorte de alto ${(r * 100).toFixed(1)} %`);
    assert.equal(t.font, 12.5, `${t.id}: fuente`);
    assert.equal(t.icono, 18, `${t.id}: icono`);
    assert.ok(t.h >= 36 && t.font >= 10, `${t.id}: por debajo del mínimo cómodo de pulsar y leer`);
  }
  const rb = recorte(F31.bloque, m.bloque.h);
  assert.ok(rb >= 0.15 && rb <= 0.20, `bloque: recorte ${(rb * 100).toFixed(1)} % (${m.bloque.h} px)`);
  await ctx.close();
});

for (const lang of ['es', 'en']) for (const width of [1280, 390, 320]) {
  test(`T32.2 las cuatro tarjetas miden lo mismo y ninguna etiqueta se parte en dos líneas (${lang}, ${width} px)`, async () => {
    const { page, ctx } = await abrir({ lang, viewport: { width, height: 800 } });
    const { tarjetas } = await medir(page);
    const alturas = tarjetas.map((t) => t.h), anchos = tarjetas.map((t) => t.w);
    assert.ok(Math.max(...alturas) - Math.min(...alturas) <= 0.1, `alturas distintas: ${alturas}`);
    assert.ok(Math.max(...alturas) <= 40, `una etiqueta ocupa dos líneas: ${alturas}`);
    assert.ok(Math.max(...anchos) - Math.min(...anchos) <= 0.5, `columnas desiguales: ${anchos}`);
    await ctx.close();
  });
}

test('T32.3 el menú sigue midiendo 284 px, las tarjetas se separan 6 px y la rejilla ocupa todo el ancho del pie', async () => {
  const { page, ctx } = await abrir();
  const m = await medir(page);
  assert.ok(Math.abs(m.menu - 284) <= 1, `ancho del menú ${m.menu}`);
  assert.equal(m.colGap, 6); assert.equal(m.rowGap, 6);
  assert.ok(Math.abs(m.tarjetas[0].w * 2 + 6 - m.bloque.w) <= 1, 'las dos columnas no suman el ancho de la rejilla');
  await ctx.close();
});
