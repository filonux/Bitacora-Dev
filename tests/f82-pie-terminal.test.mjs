// F82 · Terminal-style menu footer: monospaced label, faint «$» prompt, green side marker and an arrow that moves on Export/Import. Box and colors as in F43.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openApp } from './helpers.mjs';

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });

const IDS = ['saveBtn', 'backupBtn', 'exportBtn', 'importBtn'];
async function abrir(opts = {}) {
  const app = await openApp(browser, { open: false, ...opts });
  if (await app.page.locator('#sidebarToggle').isVisible()) await app.page.click('#sidebarToggle');
  await app.page.waitForTimeout(250);
  return app;
}
// A button's decorations: font, prompt (::before), vertical scale of the marker (::after) and arrow offset (the icon's 3rd stroke).
const leer = (page, id) => page.evaluate((id) => {
  const e = document.getElementById(id), pre = getComputedStyle(e, '::before'), mar = getComputedStyle(e, '::after');
  return {
    fuente: getComputedStyle(e).fontFamily, prompt: pre.content, opPrompt: parseFloat(pre.opacity),
    marcador: new DOMMatrix(mar.transform).d, flecha: new DOMMatrix(getComputedStyle(e.querySelectorAll('svg.ic path')[2]).transform).f,
  };
}, id);

test('T82.1 las cuatro etiquetas van en monoespaciada y llevan el prompt «$» tenue', async () => {
  const { page, ctx } = await abrir();
  for (const id of IDS) {
    const l = await leer(page, id);
    assert.match(l.fuente, /monospace/, `${id}: fuente ${l.fuente}`);
    assert.ok(l.prompt.startsWith('"$"'), `${id}: prompt ${l.prompt}`);
    assert.equal(l.opPrompt, 0.5, `${id}: el prompt debe ser tenue en reposo`);
  }
  await ctx.close();
});

test('T82.2 el marcador lateral y el prompt se avivan al pasar el ratón y al enfocar con el teclado', async () => {
  const { page, ctx } = await abrir();
  for (const id of IDS) {
    const reposo = await leer(page, id);
    assert.deepEqual([reposo.marcador, reposo.opPrompt], [0, 0.5], `${id}: reposo`);
    await page.hover(`#${id}`); await page.waitForTimeout(300);
    const raton = await leer(page, id);
    assert.deepEqual([raton.marcador, raton.opPrompt], [1, 1], `${id}: ratón`);
    await page.mouse.move(640, 700);
    // Tab + Shift+Tab leaves the focus on the button by keyboard (:focus-visible).
    await page.focus(`#${id}`); await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab'); await page.waitForTimeout(300);
    const teclado = await leer(page, id);
    assert.deepEqual([teclado.marcador, teclado.opPrompt], [1, 1], `${id}: teclado`);
    await page.evaluate(() => document.activeElement.blur());
  }
  await ctx.close();
});

test('T82.3 la flecha de Exportar sube y la de Importar baja al pasar el ratón; con movimiento reducido no se mueve', async () => {
  for (const reducedMotion of ['no-preference', 'reduce']) {
    const { page, ctx } = await abrir({ reducedMotion });
    for (const [id, dy] of [['exportBtn', -1.5], ['importBtn', 1.5]]) {
      await page.hover(`#${id}`); await page.waitForTimeout(350);
      assert.equal((await leer(page, id)).flecha, reducedMotion === 'reduce' ? 0 : dy, `${id} (${reducedMotion})`);
    }
    await ctx.close();
  }
});

for (const lang of ['es', 'en']) {
  test(`T82.4 la etiqueta queda por debajo del prompt y entera dentro del botón (${lang}, 320 px)`, async () => {
    const { page, ctx } = await abrir({ lang, viewport: { width: 320, height: 800 } });
    const r = await page.evaluate((ids) => ids.map((id) => {
      const e = document.getElementById(id), s = e.querySelector('span');
      return { id, bajo: s.getBoundingClientRect().top - e.getBoundingClientRect().top, cabe: s.scrollWidth <= s.clientWidth + 0.5 };
    }), IDS);
    // The prompt takes the top 13.5 px (border 1 + margin 3 + line 9.5).
    for (const x of r) { assert.ok(x.bajo >= 13.5, `${x.id}: la etiqueta empieza a ${x.bajo} px del borde, en la zona del prompt`); assert.ok(x.cabe, `${x.id}: etiqueta cortada`); }
    await ctx.close();
  });
}
