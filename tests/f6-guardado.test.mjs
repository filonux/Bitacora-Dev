import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launch, openApp, makeDb, sampleProject, stored } from './helpers.mjs';

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });

const download = async (page, selector) => {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click(selector)]);
  const text = fs.readFileSync(await dl.path(), 'utf8');
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bdv-')), dl.suggestedFilename()); // survives closing the context
  fs.writeFileSync(file, text);
  return { name: dl.suggestedFilename(), text, file };
};

test('T6.1 el pie del menú tiene 4 botones en orden: Guardar, Copia seguridad, Exportar, Importar', async () => {
  const { page, ctx } = await openApp(browser);
  const ids = await page.$$eval('.sidebar-footer .tile', (b) => b.map((x) => x.id));
  assert.deepEqual(ids, ['saveBtn', 'backupBtn', 'exportBtn', 'importBtn']);
  assert.deepEqual(await page.$$eval('.sidebar-footer .tile span', (b) => b.map((x) => x.textContent)), ['Guardar', 'Copia seguridad', 'Exportar', 'Importar']);
  await ctx.close();
});

test('T6.2 Guardar persiste en localStorage aunque el autoguardado esté en «off»', async () => {
  const { page, ctx } = await openApp(browser, { seed: makeDb({ settings: { autosave: 'off' } }) });
  await page.locator('.instruction').first().fill('TEXTO-NUEVO-F6');
  await page.waitForTimeout(900);
  assert.doesNotMatch(JSON.stringify(await stored(page)), /TEXTO-NUEVO-F6/);
  await page.click('#saveBtn');
  assert.match(JSON.stringify(await stored(page)), /TEXTO-NUEVO-F6/);
  assert.match(await page.locator('#saveState').innerText(), /guardado/i);
  // Ctrl+S does the same
  await page.locator('.instruction').first().fill('OTRO-F6');
  await page.keyboard.press('Control+s');
  assert.match(JSON.stringify(await stored(page)), /OTRO-F6/);
  await ctx.close();
});

test('T6.3 Copia seguridad descarga JSON válido sin claves de API', async () => {
  const seed = makeDb({ settings: { providers: { openai: { key: 'sk-SECRETA-123' }, anthropic: { apiKey: 'sk-ant-OTRA' } } } });
  const { page, ctx } = await openApp(browser, { seed });
  const { name, text } = await download(page, '#backupBtn');
  assert.match(name, /^bitacora-db-\d{4}-\d{2}-\d{2}\.json$/);
  const json = JSON.parse(text);
  assert.equal(json.projects.length, 1);
  assert.doesNotMatch(text, /sk-SECRETA-123|sk-ant-OTRA/);
  assert.ok(Object.values(json.settings.providers).every((p) => !p.key && !p.apiKey));
  await ctx.close();
});

test('T6.4 el menú Exportar ya no ofrece JSON', async () => {
  const { page, ctx } = await openApp(browser);
  await page.click('#exportBtn');
  await page.waitForSelector('#modalLayer.open [data-export-format]');
  const formats = await page.$$eval('#modalLayer [data-export-format]', (b) => b.map((x) => x.dataset.exportFormat));
  assert.deepEqual(formats.sort(), ['docx', 'pdf', 'txt']);
  assert.doesNotMatch(await page.locator('#modalLayer').innerText(), /json/i);
  await ctx.close();
});

test('T6.5 no queda botón Guardar en la cabecera del proyecto ni en las notas', async () => {
  const { page, ctx } = await openApp(browser);
  assert.equal(await page.locator('.project-header button:text-matches("Guardar|Save")').count(), 0);
  assert.equal(await page.locator('.version-card button:text-matches("Guardar|Save")').count(), 0);
  assert.equal(await page.locator('[data-action="save"], [data-action="saveProject"], [data-action="saveVersion"]').count(), 0);
  await ctx.close();
});

test('T6.6 Importar restaura el JSON descargado (ida y vuelta, con formato por fragmento)', async () => {
  const a = await openApp(browser);
  await a.page.evaluate(() => { const v = getProject().versions[1]; v.marks = restyle(v.instructions, v.marks, 0, 9, { font: 'mono', size: 20, b: true }); });
  const { file, text } = await download(a.page, '#backupBtn');
  const expected = JSON.parse(text).projects[0];
  await a.ctx.close();

  const b = await openApp(browser, { seed: null, open: false });
  await b.page.setInputFiles('#importFile', file);
  await b.page.waitForSelector('.project-item');
  const got = await b.page.evaluate(() => db.projects[0]);
  assert.equal(got.name, expected.name);
  assert.deepEqual(got.versions.map((v) => [v.version, v.instructions, v.marks]), expected.versions.map((v) => [v.version, v.instructions, v.marks]));
  assert.deepEqual(got.versions[1].marks, [{ from: 0, to: 9, font: 'mono', size: 20, b: true }]);
  await b.ctx.close();
});

test('T6.7 Importar conserva las claves de API ya guardadas y se puede deshacer', async () => {
  const a = await openApp(browser);
  const { file } = await download(a.page, '#backupBtn');
  await a.ctx.close();
  const seed = makeDb({ projects: [sampleProject({ id: 'otro', name: 'Proyecto previo' })], settings: { providers: { openai: { key: 'sk-MIA-999' } } } });
  const b = await openApp(browser, { seed, open: false });
  await b.page.setInputFiles('#importFile', file);
  await b.page.waitForFunction(() => db.projects[0]?.name === 'Proyecto de prueba');
  assert.equal(await b.page.evaluate(() => db.settings.providers.openai.key), 'sk-MIA-999');
  await b.page.click('#toastAction');
  assert.equal(await b.page.evaluate(() => db.projects[0].name), 'Proyecto previo');
  assert.equal(b.errors.length, 0);
  await b.ctx.close();
});
