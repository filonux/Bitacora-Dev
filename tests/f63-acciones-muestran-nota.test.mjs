// F63 · Every assistant action on a note leaves it selected and in view, as when picking it with the mouse.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openApp, makeDb, sampleProject } from './helpers.mjs';
import { pedir, alFrente, alPrincipio } from './helpers-asistente.mjs';

let browser;
let reply = '';
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });

const abrir = (opts = {}) => openApp(browser, { seed: makeDb({ projects: [sampleProject({ id: 'p1', name: 'Stratus Backup', n: 10, words: 120 })] }), ai: async () => reply, ...opts });
/** The model answers with the marker; the user's command matches no local command. */
const orden = (page, marcador) => { reply = marcador; return pedir(page, 'hazlo'); };

test('T63.1 format-note, set-version, set-reverts y write-note dejan la nota seleccionada y arriba de la vista; con varias notas, la primera', async () => {
  const { page, errors } = await abrir();
  for (const [marcador, id] of [
    ['[[ACCION: format-note note=1.8 bold=true]]', 'p1-v9'],
    ['[[ACCION: set-version note=1.7 version=7.7]]', 'p1-v8'],
    ['[[ACCION: set-reverts note=1.6 reverts=1.2]]', 'p1-v7'],
    ['[[ACCION: write-note note=1.5 text="añadido" mode=append]]', 'p1-v6'],
  ]) {
    await alPrincipio(page);
    const r = await orden(page, marcador);
    assert.equal(r.state, 'ok', r.result);
    await alFrente(page, id);
  }
  await alPrincipio(page);
  assert.equal((await orden(page, '[[ACCION: set-version note=1.2 version=1.3]]')).state, 'ok'); // there are now two «1.3» notes
  await alPrincipio(page);
  const r = await orden(page, '[[ACCION: format-note note=1.3 italic=true]]');
  assert.equal(r.state, 'ok', r.result);
  await alFrente(page, 'p1-v3');
  assert.deepEqual(await page.evaluate(() => getProject().versions.filter((v) => v.version === '1.3').map((v) => (v.marks || []).length > 0)), [true, true], 'se formatean las dos');
  assert.deepEqual(errors, []);
});

test('T63.2 duplicate-note y new-note muestran la nota nueva, no la de origen', async () => {
  const { page, errors } = await abrir();
  await alPrincipio(page);
  const d = await pedir(page, 'duplica la nota 1.8');
  assert.equal(d.state, 'ok', d.result);
  const copia = await page.evaluate(() => selectedVersionId);
  assert.notEqual(copia, 'p1-v9', 'queda seleccionada la copia');
  await alFrente(page, copia);
  await alPrincipio(page);
  const n = await orden(page, '[[ACCION: new-note version=2.0 text="Nota nueva"]]');
  assert.equal(n.state, 'ok', n.result);
  await alFrente(page, await page.evaluate(() => getProject().versions.find((v) => v.version === '2.0').id));
  assert.deepEqual(errors, []);
});

test('T63.3 móvil: la tarjeta de duplicar nota lleva «Ver nota» sin código adicional', async () => {
  const { page } = await abrir({ viewport: { width: 390, height: 800 } });
  await page.click('#aiToggle');
  const d = await orden(page, '[[ACCION: duplicate-note note=1.4]]');
  assert.equal(d.state, 'ok', d.result);
  assert.equal(await page.locator('.msg.action [data-act="view"]').count(), 1);
  await page.locator('.msg.action [data-act="view"]').click();
  assert.equal(await page.locator('#aiPanel.open').count(), 0);
  await alFrente(page, await page.evaluate(() => selectedVersionId));
});
