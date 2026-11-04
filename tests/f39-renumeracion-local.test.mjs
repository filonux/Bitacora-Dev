import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { launch, openApp, makeDb, sampleProject } from './helpers.mjs';

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });

const nums = (page) => page.evaluate(() => getProject().versions.map((v) => v.version));
const send = (page, texto) => page.evaluate((t) => { document.querySelector('#aiInput').value = t; return sendAI(); }, texto);
const ultimo = (page) => page.evaluate(() => getProject().chat.at(-1));
const api = (page, op, a) => page.evaluate(([o, x]) => BitacoraAPI[o](x), [op, a]);

test('T39.1 los cuatro esquemas rápidos se calculan en local, sin IA ni proveedor', async () => {
  const { page, ctx, aiRequests } = await openApp(browser);
  const esperado = { semver: ['1.0.0', '1.1.0', '1.2.0'], int: ['1', '2', '3'], minor: ['1.0', '1.1', '1.2'], calver: ['2026.01', '2026.01.1', '2026.01.2'] };
  for (const [scheme, rows] of Object.entries(esperado)) {
    const r = await page.evaluate((s) => proposeRenumber('', s), scheme);
    assert.equal(r.ok, true, scheme);
    assert.deepEqual(r.rows.map((x) => x.new), rows, scheme);
  }
  assert.equal(aiRequests.length, 0);
  assert.equal(await page.locator('.renum').count(), 4);
  await ctx.close();
});

test('T39.2 año.mes usa la fecha de cada nota y numera las del mismo mes', async () => {
  const p = sampleProject({ n: 4 });
  ['2025-11-30T12:00:00', '2025-12-02T12:00:00', '2025-12-20T12:00:00', '2026-01-05T12:00:00'].forEach((d, i) => { p.versions[i].createdAt = p.versions[i].updatedAt = new Date(d).toISOString(); });
  const { page, ctx } = await openApp(browser, { seed: makeDb({ projects: [p] }) });
  const r = await page.evaluate(() => proposeRenumber('', 'calver'));
  assert.deepEqual(r.rows.map((x) => x.new), ['2025.11', '2025.12', '2025.12.1', '2026.01']);
  await ctx.close();
});

test('T39.3 la propuesta local se acepta como la de la IA y cambia los números', async () => {
  const { page, ctx } = await openApp(browser);
  await page.evaluate(() => proposeRenumber('', 'int'));
  await page.click('[data-renum-accept]');
  assert.deepEqual(await nums(page), ['1', '2', '3']);
  await ctx.close();
});

test('T39.4 «1.1 => 3.0» escrito en el chat es una propuesta local (nombre o #posición), sin IA', async () => {
  const { page, ctx, aiRequests } = await openApp(browser, { ai: () => 'no debería llamarse' });
  await send(page, '1.1 => 3.0; #3 -> 3.1');
  await page.waitForSelector('[data-renum-accept]');
  assert.equal(aiRequests.length, 0);
  const m = await ultimo(page);
  assert.deepEqual(m.meta.rows.map((r) => r.new), ['1.0', '3.0', '3.1']);
  assert.equal(m.meta.local, true);
  await page.click('[data-renum-accept]');
  assert.deepEqual(await nums(page), ['1.0', '3.0', '3.1']);
  await ctx.close();
});

test('T39.5 una frase con flecha, o «solo enteros» en «Otro esquema», sigue yendo a la IA', async () => {
  const { page, ctx, aiRequests } = await openApp(browser, { ai: () => 'Respuesta.' });
  await send(page, 'Si hago 1.2 -> 2.0 mañana, ¿qué cambia en el historial?');
  assert.equal(aiRequests.length, 1);
  await page.evaluate(() => proposeRenumber('', 'int'));
  await page.click('[data-renum-other]');
  await send(page, 'solo enteros');
  assert.equal(aiRequests.length, 2);
  await page.evaluate(() => proposeRenumber('', 'int'));
  await page.click('[data-renum-other]');
  await send(page, '1.1 = 5.0'); // in «Otro esquema» «=» is also accepted
  assert.equal(aiRequests.length, 2);
  assert.deepEqual((await ultimo(page)).meta.rows.map((r) => r.new), ['1.0', '5.0', '1.2']);
  await ctx.close();
});

test('T39.6 pares imposibles dan un aviso concreto, sin IA y sin botón Aceptar', async () => {
  const { page, ctx, aiRequests } = await openApp(browser, { ai: () => 'x' });
  await send(page, '1.1 => 2.0, 1.1 => 3.0');
  assert.match((await ultimo(page)).text, /dos números distintos/);
  await send(page, '1.0 => 1.1');
  assert.match((await ultimo(page)).text, /mismo número/);
  await send(page, '9.9 => 2.0');
  assert.match((await ultimo(page)).text, /No reconozco ninguna versión/);
  assert.equal(aiRequests.length, 0);
  assert.equal(await page.locator('[data-renum-accept]').count(), 0);
  await ctx.close();
});

test('T39.7 renumberVersions acepta scheme y claves por id, número o posición, con errores que orientan', async () => {
  const { page, ctx } = await openApp(browser);
  let r = await api(page, 'renumberVersions', { scheme: 'semver' });
  assert.deepEqual(r.data.map((v) => v.version), ['1.0.0', '1.1.0', '1.2.0']);
  r = await api(page, 'renumberVersions', { map: { '1.1.0': '2.0.0', '#3': '2.1.0', 'p1-v1': '0.9.0' } });
  assert.deepEqual(r.data.map((v) => v.version), ['0.9.0', '2.0.0', '2.1.0']);
  assert.equal((await api(page, 'renumberVersions', { scheme: 'inventado' })).error.code, 'invalid-argument');
  r = await api(page, 'renumberVersions', { map: { '7.7': '1.0' } });
  assert.equal(r.error.code, 'version-not-found');
  assert.match(r.error.message, /#position/);
  assert.equal((await api(page, 'renumberVersions', { map: { '#1': 2 } })).error.code, 'invalid-argument');
  assert.equal((await api(page, 'renumberVersions', { map: { '#1': '2.1.0' } })).error.code, 'invalid-numbering');
  assert.deepEqual(await nums(page), ['0.9.0', '2.0.0', '2.1.0']); // errors change nothing
  await ctx.close();
});

test('T39.8 proposeRenumber({scheme}) es local y addVersion/setText escriben una nota completa', async () => {
  const { page, ctx, aiRequests } = await openApp(browser);
  const pr = await api(page, 'proposeRenumber', { scheme: 'int' });
  assert.deepEqual(pr.data.rows.map((r) => r.new), ['1', '2', '3']);
  assert.equal(aiRequests.length, 0);
  const texto = 'Título de la nota\nCuerpo con marca y fin.';
  const a = await api(page, 'addVersion', { version: '2.0', instructions: texto, marks: [{ from: 0, to: 17, b: true }], style: { font: 'serif' } });
  assert.equal(a.ok, true);
  const g = (await api(page, 'getVersion', { id: a.data.id })).data;
  assert.equal(g.instructions, texto);
  assert.equal(g.style.font, 'serif');
  assert.ok(g.marks.some((m) => m.b && m.from === 0 && m.to === 17));
  const s = await api(page, 'setText', { id: a.data.id, text: 'Otra cosa', marks: [{ from: 0, to: 4, i: true }] });
  assert.equal(s.ok, true);
  const g2 = (await api(page, 'getVersion', { id: a.data.id })).data;
  assert.deepEqual(g2.marks.map((m) => [m.from, m.to, !!m.i, !!m.b]), [[0, 4, true, false]]);
  assert.equal((await api(page, 'setText', { id: a.data.id, text: 'x', append: true, marks: [] })).error.code, 'invalid-argument');
  assert.equal((await api(page, 'addVersion', { instructions: 'x', style: { size: 99 } })).error.code, 'invalid-argument');
  assert.equal(await page.evaluate(() => getProject().versions.length), 4); // rejections never leave half-written notes
  await ctx.close();
});

test('T39.9 la ayuda de la app cita la renumeración local', async () => {
  const { page, ctx } = await openApp(browser, { open: false });
  const ayuda = await page.evaluate(() => ({ es: I18N.es.helpItems, en: I18N.en.helpItems }));
  await ctx.close();
  assert.match(ayuda.es, /en local, sin IA/);
  assert.match(ayuda.en, /locally, without AI/);
});
