import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openApp, makeDb, sampleProject, stored } from './helpers.mjs';

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });

const semver = 'Criterio: proyecto en fase inicial.\n[[VERSION: 1 => 0.1.0]]\n[[VERSION: 2 => 0.2.0]]\n[[VERSION: 3 => 0.3.0]]';
const enteros = 'Solo enteros.\n[[VERSION: 1 => 1]]\n[[VERSION: 2 => 2]]\n[[VERSION: 3 => 3]]';
const mock = (messages) => (JSON.stringify(messages).includes('solo enteros') ? enteros : semver);
const versions = (page) => page.evaluate(() => getProject().versions.map((v) => v.version));
const renumber = (page) => page.click('[data-ai-action="renumber"]');

function seedWithRevert() {
  const p = sampleProject();
  p.versions[2].revertsVersionId = p.versions[0].id;
  return makeDb({ projects: [p] });
}

test('T8.1 el botón envía a la IA las versiones actuales', async () => {
  const { page, ctx, aiRequests } = await openApp(browser, { ai: mock });
  await renumber(page);
  await page.waitForSelector('[data-renum-accept]');
  assert.equal(aiRequests.length, 1);
  const user = aiRequests[0].messages.at(-1).content;
  for (const row of ['1 | 1.0 |', '2 | 1.1 |', '3 | 1.2 |', 'nota1palabra1']) assert.ok(user.includes(row), `falta «${row}»`);
  assert.match(aiRequests[0].messages[0].content, /numeración/);
  await ctx.close();
});

test('T8.2 la propuesta se muestra con Aceptar y no cambia nada hasta pulsar', async () => {
  const { page, ctx } = await openApp(browser, { ai: mock });
  await renumber(page);
  await page.waitForSelector('[data-renum-accept]');
  assert.equal(await page.locator('.renum-row').count(), 3);
  assert.equal(await page.locator('.renum-row.chg').count(), 3);
  assert.deepEqual(await versions(page), ['1.0', '1.1', '1.2']);
  assert.deepEqual(await page.$$eval('.version-input', (i) => i.map((x) => x.value)), ['1.0', '1.1', '1.2']);
  await ctx.close();
});

test('T8.3 Aceptar renombra todas las versiones y conserva revertsVersionId', async () => {
  const { page, ctx, errors } = await openApp(browser, { ai: mock, seed: seedWithRevert() });
  const before = await page.evaluate(() => getProject().versions.map((v) => [v.id, v.revertsVersionId]));
  await renumber(page);
  await page.click('[data-renum-accept]');
  assert.deepEqual(await versions(page), ['0.1.0', '0.2.0', '0.3.0']);
  assert.deepEqual(await page.evaluate(() => getProject().versions.map((v) => [v.id, v.revertsVersionId])), before);
  assert.deepEqual(await page.$$eval('.version-input', (i) => i.map((x) => x.value)), ['0.1.0', '0.2.0', '0.3.0']);
  assert.equal((await page.locator('.version-card').nth(2).locator('.version-revert-select .select-face span').first().innerText()).trim(), '0.1.0');
  assert.deepEqual((await stored(page)).projects[0].versions.map((v) => v.version), ['0.1.0', '0.2.0', '0.3.0']);
  assert.equal(await page.locator('[data-renum-accept]').count(), 0);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('T8.4 si no se acepta, se puede pedir otro esquema y se genera nueva propuesta', async () => {
  const { page, ctx, aiRequests } = await openApp(browser, { ai: mock });
  await renumber(page);
  await page.waitForSelector('[data-renum-accept]');
  await page.click('[data-renum-other]');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'aiInput');
  await page.fill('#aiInput', 'solo enteros');
  await page.click('#aiSend');
  await page.waitForFunction(() => document.querySelectorAll('.renum').length === 2);
  assert.equal(aiRequests.length, 2);
  assert.ok(aiRequests[1].messages.at(-1).content.includes('solo enteros'));
  assert.deepEqual(await versions(page), ['1.0', '1.1', '1.2']);
  await page.locator('[data-renum-accept]').last().click();
  assert.deepEqual(await versions(page), ['1', '2', '3']);
  // The first proposal still offers Aceptar, but it is stale and changes nothing.
  await page.locator('[data-renum-accept]').first().click();
  assert.deepEqual(await versions(page), ['1', '2', '3']);
  assert.equal(await page.locator('[data-renum-accept]').count(), 0);
  await ctx.close();
});

test('T8.5 el renombrado se puede deshacer, sin pisar ediciones manuales posteriores', async () => {
  const { page, ctx } = await openApp(browser, { ai: mock });
  await renumber(page);
  await page.click('[data-renum-accept]');
  assert.deepEqual(await versions(page), ['0.1.0', '0.2.0', '0.3.0']);
  await page.click('#toastAction');
  assert.deepEqual(await versions(page), ['1.0', '1.1', '1.2']);
  assert.equal(await page.locator('[data-renum-accept]').count(), 1, 'la propuesta vuelve a ser aplicable');
  await page.click('[data-renum-accept]');
  assert.deepEqual(await versions(page), ['0.1.0', '0.2.0', '0.3.0']);
  // A later manual edit is not lost on undo.
  await page.locator('.version-input').nth(1).fill('manual');
  await page.click('#toastAction');
  assert.deepEqual(await versions(page), ['1.0', 'manual', '1.2']);
  await ctx.close();
});

test('T8.5b tras editar a mano una versión, una propuesta pendiente queda obsoleta y no se aplica', async () => {
  const { page, ctx } = await openApp(browser, { ai: mock });
  await renumber(page);
  await page.waitForSelector('[data-renum-accept]');
  await page.locator('.version-input').nth(1).fill('manual');
  await page.click('[data-renum-accept]');
  assert.deepEqual(await versions(page), ['1.0', 'manual', '1.2']);
  assert.equal(await page.locator('[data-renum-accept]').count(), 0);
  assert.match(await page.locator('.renum-state').innerText(), /.+/);
  await ctx.close();
});

test('T8.6 sin IA el botón avisa y no rompe nada', async () => {
  const { page, ctx, errors } = await openApp(browser);
  await renumber(page);
  await page.waitForSelector('.msg.assistant');
  assert.equal(await page.locator('[data-renum-accept]').count(), 0);
  assert.deepEqual(await versions(page), ['1.0', '1.1', '1.2']);
  assert.equal(await page.locator('#aiSend').isDisabled(), false);
  await renumber(page); // it can be used again
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('T8.7 una respuesta con números repetidos o sin formato se descarta', async () => {
  for (const reply of ['Sin marcadores.', '[[VERSION: 1 => 2]]\n[[VERSION: 2 => 2]]', '[[VERSION: 9 => 1]]']) {
    const { page, ctx, errors } = await openApp(browser, { ai: () => reply });
    await renumber(page);
    await page.waitForSelector('.msg.system');
    assert.equal(await page.locator('[data-renum-accept]').count(), 0, reply);
    assert.deepEqual(await versions(page), ['1.0', '1.1', '1.2']);
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});

test('T8.8 si la propuesta no cambia nada no ofrece Aceptar', async () => {
  const { page, ctx } = await openApp(browser, { ai: () => 'Ya es coherente.\n[[VERSION: 1 => 1.0]]\n[[VERSION: 2 => 1.1]]\n[[VERSION: 3 => 1.2]]' });
  await renumber(page);
  await page.waitForSelector('.renum');
  assert.equal(await page.locator('[data-renum-accept]').count(), 0);
  assert.equal(await page.locator('.renum-row.chg').count(), 0);
  await ctx.close();
});
