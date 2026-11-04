// F19 · Per-fragment formatting (contenteditable editor + `version.marks`). The text is plain; marks are [{from,to,font?,size?,b?,i?,u?,s?}].
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openApp, stored, noteModel, noteDom, selectIn, pick, typeNote, spanStyles } from './helpers.mjs';

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });

const TEXTO = 'uno dos tres';
async function abrir(texto = TEXTO) {
  const app = await openApp(browser);
  await typeNote(app.page, 0, texto);
  app.card = app.page.locator('.version-card').first();
  app.fmt = (k) => app.card.locator(`.fmt-btn[data-fmt="${k}"]`);
  return app;
}

test('T19.1 una negrita sobre un fragmento guarda una sola marca; el texto sigue plano', async () => {
  const { page, ctx, fmt } = await abrir();
  await selectIn(page, 0, 4, 7);
  await fmt('b').click();
  assert.deepEqual(await noteModel(page), { text: TEXTO, marks: [{ from: 4, to: 7, b: true }] });
  assert.equal(await noteDom(page), TEXTO);
  await ctx.close();
});

test('T19.2 pulsar de nuevo el mismo formato lo quita y no deja marcas vacías', async () => {
  const { page, ctx, fmt } = await abrir();
  await selectIn(page, 0, 4, 7);
  await fmt('b').click();
  await fmt('b').click();
  assert.deepEqual((await noteModel(page)).marks, []);
  await ctx.close();
});

test('T19.3 la barra refleja la selección: pulsado, no pulsado o mixto', async () => {
  const { page, ctx, fmt } = await abrir();
  await selectIn(page, 0, 4, 7);
  await fmt('b').click();
  const estado = async (a, b) => { await selectIn(page, 0, a, b); return fmt('b').getAttribute('aria-pressed'); };
  assert.equal(await estado(4, 7), 'true');
  assert.equal(await estado(0, 3), 'false');
  assert.equal(await estado(0, 7), 'mixed');
  await ctx.close();
});

test('T19.4 fuente y tamaño se aplican por fragmento desde los desplegables propios', async () => {
  const { page, ctx, card } = await abrir();
  await selectIn(page, 0, 0, 3);
  await pick(card.locator('.fmt-dd[data-fmt="font"]'), 'serif');
  await pick(card.locator('.fmt-dd[data-fmt="size"]'), '20');
  assert.deepEqual((await noteModel(page)).marks, [{ from: 0, to: 3, font: 'serif', size: 20 }]);
  const spans = await spanStyles(page, 0);
  assert.equal(spans.length, 1);
  assert.equal(spans[0].text, 'uno');
  assert.equal(spans[0].size, '20px');
  await ctx.close();
});

test('T19.5 lo que se escribe dentro de un fragmento con formato lo hereda; fuera, no', async () => {
  const { page, ctx, fmt } = await abrir();
  await selectIn(page, 0, 4, 7);
  await fmt('b').click();
  await selectIn(page, 0, 6);
  await page.keyboard.insertText('X');
  assert.deepEqual(await noteModel(page), { text: 'uno doXs tres', marks: [{ from: 4, to: 8, b: true }] });
  await selectIn(page, 0, 13);
  await page.keyboard.insertText('Z');
  assert.deepEqual(await noteModel(page), { text: 'uno doXs tresZ', marks: [{ from: 4, to: 8, b: true }] });
  await ctx.close();
});

test('T19.6 sin selección, el formato queda pendiente y se aplica a lo siguiente que se escribe', async () => {
  const { page, ctx, fmt } = await abrir('abc');
  await selectIn(page, 0, 3);
  await fmt('b').click();
  assert.equal(await fmt('b').getAttribute('aria-pressed'), 'true');
  assert.deepEqual((await noteModel(page)).marks, []);
  await page.keyboard.insertText('d');
  assert.deepEqual(await noteModel(page), { text: 'abcd', marks: [{ from: 3, to: 4, b: true }] });
  await ctx.close();
});

test('T19.7 Ctrl+B, Ctrl+I y Ctrl+U alternan el formato de la selección', async () => {
  const { page, ctx } = await abrir();
  await selectIn(page, 0, 0, 3);
  await page.keyboard.press('Control+b');
  await page.keyboard.press('Control+i');
  await page.keyboard.press('Control+u');
  assert.deepEqual((await noteModel(page)).marks, [{ from: 0, to: 3, b: true, i: true, u: true }]);
  await page.keyboard.press('Control+b');
  assert.deepEqual((await noteModel(page)).marks, [{ from: 0, to: 3, i: true, u: true }]);
  await ctx.close();
});

test('T19.8 deshacer y rehacer recorren los cambios de formato sin tocar el texto', async () => {
  const { page, ctx, fmt } = await abrir();
  await selectIn(page, 0, 4, 7);
  await fmt('b').click();
  await page.keyboard.press('Control+z');
  assert.deepEqual(await noteModel(page), { text: TEXTO, marks: [] });
  await page.keyboard.press('Control+Shift+z');
  assert.deepEqual(await noteModel(page), { text: TEXTO, marks: [{ from: 4, to: 7, b: true }] });
  await ctx.close();
});

test('T19.9 las marcas sobreviven a un guardado y a abrir la app con lo guardado', async () => {
  const { page, ctx, fmt } = await abrir();
  await selectIn(page, 0, 4, 7);
  await fmt('b').click();
  await page.evaluate(() => saveNow());
  const db = await stored(page);
  assert.deepEqual([db.projects[0].versions[0].instructions, db.projects[0].versions[0].marks], [TEXTO, [{ from: 4, to: 7, b: true }]]);
  await ctx.close();
  // "Reload" = reopen the app with the saved data: with file:// headless Chromium loses storage in ~1 of 40 real reloads.
  const again = await openApp(browser, { seed: db });
  await again.page.waitForSelector('.instruction');
  assert.deepEqual(await noteModel(again.page), { text: TEXTO, marks: [{ from: 4, to: 7, b: true }] });
  assert.equal((await spanStyles(again.page, 0))[0].text, 'dos');
  await again.ctx.close();
});

test('T19.10 funciones puras: restyle fusiona y quita, uniformStyle marca la mezcla y remapMarks desplaza', async () => {
  const { page, ctx } = await abrir();
  const r = await page.evaluate(() => {
    const a = restyle('abcdef', [], 1, 4, { b: true });
    return {
      a,
      fusion: restyle('abcdef', a, 2, 6, { b: true }),
      quita: restyle('abcdef', a, 1, 4, { b: false }),
      mezcla: uniformStyle('abcdef', a, 0, 6).b,
      pleno: uniformStyle('abcdef', a, 1, 4).b,
      vacio: uniformStyle('', [], 0, 0),
      desplaza: remapMarks('abcdef', a, 'aXXbcdef'),
    };
  });
  assert.deepEqual(r.a, [{ from: 1, to: 4, b: true }]);
  assert.deepEqual(r.fusion, [{ from: 1, to: 6, b: true }]);
  assert.deepEqual(r.quita, []);
  assert.equal(r.mezcla, null);
  assert.equal(r.pleno, true);
  assert.equal(r.vacio, null);
  assert.deepEqual(r.desplaza, [{ from: 3, to: 6, b: true }]);
  await ctx.close();
});
