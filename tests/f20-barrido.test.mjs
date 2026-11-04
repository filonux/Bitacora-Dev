import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openApp } from './helpers.mjs';

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });

// F20 · Every `.btn.primary` shares the F33–F35 recipe: emerald gradient with top light (#238052 → #1a6342).
const ver = (page, sel) => page.evaluate((s) => {
  const e = document.querySelector(s), c = getComputedStyle(e);
  return { img: c.backgroundImage, borde: c.borderTopColor, peso: c.fontWeight, color: c.color, sombraTexto: c.textShadow, alto: e.getBoundingClientRect().height };
}, sel);
const esReceta = (m, quien, alto) => {
  assert.ok(m.img.includes('rgb(35, 128, 82)') && m.img.includes('rgb(26, 99, 66)'), `${quien}: degradado ${m.img}`);
  assert.equal(m.borde, 'rgb(63, 174, 120)', quien);
  assert.equal(m.peso, '650', quien);
  assert.equal(m.color, 'rgb(242, 255, 247)', quien);
  assert.notEqual(m.sombraTexto, 'none', quien);
  assert.equal(m.alto, alto, `${quien}: la caja no cambia`);
};

test('T20.1 Guardar configuración, Aceptar (renumeración) y Guardar comentario (análisis) usan la receta, sin cambiar de caja', async () => {
  const { page, ctx } = await openApp(browser);
  await page.click('#settingsBtn');
  esReceta(await ver(page, '#saveSettingsBtn'), 'Guardar configuración', 34);
  await page.click('#settingsClose');
  await page.evaluate(() => proposeRenumber('', 'int'));
  await page.waitForSelector('[data-renum-accept]');
  esReceta(await ver(page, '[data-renum-accept]'), 'Aceptar', 26);
  await page.evaluate(() => { // analysis card already generated and not saved
    const id = getProject().versions.at(-1).id;
    openDiffId = id;
    versionAnalysis = { id, status: 'done', text: 'Cambia el alcance de la nota.', error: '', analysisId: null, analysisStatus: 'unknown', saved: false };
    renderAll();
  });
  await page.waitForSelector('[data-analysis-action="save"]');
  esReceta(await ver(page, '[data-analysis-action="save"]'), 'Guardar comentario', 28);
  await ctx.close();
});

test('T20.2 al pasar el ratón los .btn.primary iluminan el borde y al pulsar se hunden, como «+ Proyecto»', async () => {
  const { page, ctx } = await openApp(browser);
  await page.evaluate(() => proposeRenumber('', 'int'));
  await page.waitForSelector('[data-renum-accept]');
  const b = page.locator('[data-renum-accept]');
  await b.hover();
  await page.waitForTimeout(350);
  assert.equal((await ver(page, '[data-renum-accept]')).borde, 'rgb(111, 227, 157)');
  await page.mouse.down();
  await page.waitForTimeout(350);
  const sombra = await page.evaluate(() => getComputedStyle(document.querySelector('[data-renum-accept]')).boxShadow);
  assert.ok(sombra.includes('inset') && sombra.includes('rgba(0, 0, 0, 0.3)'), sombra);
  await page.mouse.up();
  await ctx.close();
});
