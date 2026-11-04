import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openApp, makeDb, sampleProject } from './helpers.mjs';

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });

test('T5.1 cabecera de nota: 3 botones (Analizar, Duplicar, Eliminar), ≥ 36 px y color propio', async () => {
  const { page, ctx } = await openApp(browser);
  const info = await page.$$eval('.version-card:first-child .version-head-actions button, .version-card .version-head-actions button', (bs) => bs.slice(0, 3).map((b) => {
    const r = b.getBoundingClientRect(), s = getComputedStyle(b);
    return { action: b.dataset.action, w: r.width, h: r.height, color: s.color };
  }));
  assert.deepEqual(info.map((i) => i.action), ['diff', 'duplicate', 'delete']);
  assert.equal(await page.locator('.version-card').first().locator('.version-head-actions button').count(), 3);
  for (const i of info) assert.ok(i.w >= 36 && i.h >= 36, `${i.action} ${i.w}x${i.h}`);
  assert.equal(new Set(info.map((i) => i.color)).size, 3, 'colores repetidos');
  await ctx.close();
});

test('T5.2 el pie tiene Copiar y ya no tiene Guardar', async () => {
  const { page, ctx } = await openApp(browser);
  const foot = page.locator('.version-card').first().locator('.card-foot');
  assert.equal(await foot.locator('[data-action="copy"]').count(), 1);
  assert.equal(await foot.locator('[data-action="save"]').count(), 0);
  assert.doesNotMatch(await foot.innerText(), /Guardar/);
  await ctx.close();
});

for (const lang of ['es', 'en']) {
  test(`T5.3 Copiar deja «Versión X + instrucciones» en el portapapeles (${lang})`, async () => {
    const { page, ctx, clip } = await openApp(browser, { lang });
    await page.locator('.version-card').nth(1).locator('[data-action="copy"]').click();
    await page.waitForFunction(() => window.__clip);
    const text = await clip();
    const instr = await page.evaluate(() => getProject().versions[1].instructions);
    assert.match(text, lang === 'es' ? /^VERSIÓN 1\.1\n/ : /^VERSION 1\.1\n/);
    assert.ok(text.endsWith(instr));
    await ctx.close();
  });
}

test('T5.4 Duplicar y Eliminar (con deshacer) funcionan', async () => {
  const { page, ctx } = await openApp(browser);
  const n = () => page.evaluate(() => getProject().versions.length);
  assert.equal(await n(), 3);
  await page.evaluate(() => { const v = getProject().versions[0]; v.marks = restyle(v.instructions, v.marks, 0, 5, { font: 'serif' }); renderWorkspace(); });
  await page.locator('.version-card').first().locator('[data-action="duplicate"]').click();
  assert.equal(await n(), 4);
  const copy = await page.evaluate(() => { const v = getProject().versions[3]; return { marks: v.marks, text: v.instructions === getProject().versions[0].instructions, shared: v.marks === getProject().versions[0].marks }; });
  assert.deepEqual(copy.marks, [{ from: 0, to: 5, font: 'serif' }], 'la copia conserva el formato por fragmento');
  assert.equal(copy.shared, false, 'la copia no comparte el array de marcas con el original');
  assert.ok(copy.text);
  await page.locator('.version-card').nth(3).locator('[data-action="delete"]').click();
  await page.click('#modalLayer .btn.danger');
  assert.equal(await n(), 3);
  await page.click('#toastAction');
  assert.equal(await n(), 4);
  await ctx.close();
});
