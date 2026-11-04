// F43 · Footer tiles (Save · Backup · Export · Import): legible text and icon in the same box, filled like Help but with a lighter border.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openApp } from './helpers.mjs';

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });

const IDS = ['saveBtn', 'backupBtn', 'exportBtn', 'importBtn'];
async function abrir() {
  const app = await openApp(browser, { open: false });
  if (await app.page.locator('#sidebarToggle').isVisible()) await app.page.click('#sidebarToggle');
  await app.page.waitForTimeout(250);
  return app;
}

test('T43.1 texto ≥ 12 px e icono de 17–20 px con la caja de 39,1 × 128,5 px', async () => {
  const { page, ctx } = await abrir();
  const tiles = await page.evaluate((ids) => ids.map((id) => {
    const e = document.getElementById(id), r = e.getBoundingClientRect();
    return { id, w: r.width, h: r.height, font: parseFloat(getComputedStyle(e).fontSize), ic: e.querySelector('.ic').getBoundingClientRect().width };
  }), IDS);
  for (const t of tiles) {
    assert.ok(t.font >= 12, `${t.id}: texto ${t.font}px`);
    assert.ok(t.ic >= 17 && t.ic <= 20, `${t.id}: icono ${t.ic}px`);
    assert.ok(Math.abs(t.h - 39.1) <= 0.3 && Math.abs(t.w - 128.5) <= 0.5, `${t.id}: caja ${t.w}×${t.h}`);
  }
  await ctx.close();
});

test('T43.2 relleno a ±8 por canal del de Ayuda (mezclado con el menú) y borde más claro que el de Ayuda', async () => {
  const { page, ctx } = await abrir();
  const r = await page.evaluate((ids) => {
    const rgba = (c) => c.match(/[\d.]+/g).map(Number);
    // Menu colour under the footer: last stop of the sidebar gradient.
    const base = rgba(getComputedStyle(document.getElementById('sidebar')).backgroundImage.match(/rgba?\([^)]+\)/g).at(-1));
    const mix = ([r, g, b, a = 1]) => [r * a + base[0] * (1 - a), g * a + base[1] * (1 - a), b * a + base[2] * (1 - a)];
    const help = getComputedStyle(document.getElementById('helpBtn'));
    return {
      help: mix(rgba(help.backgroundColor)), helpBorder: rgba(help.borderTopColor),
      tiles: ids.map((id) => { const s = getComputedStyle(document.getElementById(id)); return { id, fill: mix(rgba(s.backgroundColor)), border: rgba(s.borderTopColor) }; }),
    };
  }, IDS);
  const lum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  for (const t of r.tiles) {
    t.fill.forEach((v, i) => assert.ok(Math.abs(v - r.help[i]) <= 8, `${t.id}: canal ${i} ${v.toFixed(1)} vs Ayuda ${r.help[i].toFixed(1)}`));
    assert.ok(lum(t.border) > lum(r.helpBorder), `${t.id}: el borde no es más claro que el de Ayuda`);
  }
  await ctx.close();
});
