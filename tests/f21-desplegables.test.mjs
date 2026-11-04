// F21 · Custom dropdowns (`.select-custom`) instead of the native <select>: font, size, autosave, interval, «Revierte» and «IA activa».
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openApp, stored, selectIn, pick, typeNote } from './helpers.mjs';

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });

async function abrir() {
  const app = await openApp(browser);
  app.card = app.page.locator('.version-card').first();
  app.dd = (k) => app.card.locator(`.fmt-dd[data-fmt="${k}"]`);
  return app;
}
const abierto = (box) => box.evaluate((e) => e.classList.contains('open'));
const valor = (box) => box.locator('.dd-val').textContent();
const resaltada = (box) => box.evaluate((b) => [...b.querySelectorAll('[role=option]')].findIndex((x) => x.classList.contains('hl')));

test('T21.1 no queda ningún <select> nativo, ni en la vista principal ni en Configuración', async () => {
  const { page, ctx } = await abrir();
  assert.equal(await page.locator('select').count(), 0);
  assert.ok(await page.locator('.select-custom').count() >= 2);
  await page.click('#settingsBtn');
  await page.waitForSelector('#autosaveSelect');
  assert.equal(await page.locator('select').count(), 0);
  await ctx.close();
});

test('T21.2 contrato ARIA: cara role=combobox con aria-controls a un listbox y una sola opción seleccionada', async () => {
  const { page, ctx } = await abrir();
  const info = await page.evaluate(() => [...document.querySelectorAll('.fmt-dd')].slice(0, 2).map((b) => {
    const f = b.querySelector('.select-face'), l = b.querySelector('.select-list'), o = [...l.querySelectorAll('[role=option]')];
    return { rol: f.getAttribute('role'), popup: f.getAttribute('aria-haspopup'), exp: f.getAttribute('aria-expanded'), ctl: document.getElementById(f.getAttribute('aria-controls')) === l, lrol: l.getAttribute('role'), sel: o.filter((x) => x.getAttribute('aria-selected') === 'true').length, n: o.length, nombre: !!f.getAttribute('aria-label') };
  }));
  assert.equal(info.length, 2);
  for (const i of info) assert.deepEqual({ ...i, n: i.n >= 3 }, { rol: 'combobox', popup: 'listbox', exp: 'false', ctl: true, lrol: 'listbox', sel: 1, n: true, nombre: true });
  await ctx.close();
});

test('T21.3 con el ratón: abre y cierra con la cara, elige una opción y devuelve el foco a la cara', async () => {
  const { page, ctx, dd } = await abrir();
  const font = dd('font'), face = font.locator('.select-face');
  await face.click();
  assert.equal(await abierto(font), true);
  assert.equal(await face.getAttribute('aria-expanded'), 'true');
  await face.click();
  assert.equal(await abierto(font), false);
  assert.equal(await face.getAttribute('aria-expanded'), 'false');
  await pick(font, 'serif');
  assert.equal(await abierto(font), false);
  assert.equal(await valor(font), 'Serif');
  // After choosing a format the focus returns to the editor (to keep typing); it never falls to <body>.
  assert.equal(await page.evaluate(() => document.activeElement.matches('.select-face, .instruction')), true);
  await ctx.close();
});

test('T21.4 con el teclado: ↓ abre en la elegida, ↓ ↑ Inicio Fin mueven, Esc cierra sin cambiar e Intro elige', async () => {
  const { page, ctx, dd } = await abrir();
  const font = dd('font'), face = font.locator('.select-face');
  await face.focus();
  await page.keyboard.press('ArrowDown');
  assert.equal(await abierto(font), true);
  assert.equal(await resaltada(font), 0);
  await page.keyboard.press('ArrowDown');
  assert.equal(await resaltada(font), 1);
  assert.equal(await face.getAttribute('aria-activedescendant'), await font.evaluate((b) => b.querySelectorAll('[role=option]')[1].id));
  await page.keyboard.press('End');
  assert.equal(await resaltada(font), 2);
  await page.keyboard.press('Home');
  assert.equal(await resaltada(font), 0);
  await page.keyboard.press('Escape');
  assert.equal(await abierto(font), false);
  assert.equal(await valor(font), 'Sans');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  assert.equal(await abierto(font), false);
  assert.equal(await valor(font), 'Serif');
  await ctx.close();
});

test('T21.5 una letra salta a la opción que empieza por ella y Tab cierra sin cambiar el valor', async () => {
  const { page, ctx, dd } = await abrir();
  const font = dd('font');
  await font.locator('.select-face').focus();
  await page.keyboard.press('m');
  assert.equal(await abierto(font), true);
  assert.equal(await resaltada(font), 2);
  await page.keyboard.press('Tab');
  assert.equal(await abierto(font), false);
  assert.equal(await valor(font), 'Sans');
  await ctx.close();
});

test('T21.6 solo hay un desplegable abierto a la vez; Esc y perder el foco lo cierran', async () => {
  const { page, ctx, dd } = await abrir();
  await dd('font').locator('.select-face').click();
  await dd('size').locator('.select-face').click();
  assert.equal(await abierto(dd('font')), false);
  assert.equal(await abierto(dd('size')), true);
  assert.equal(await page.locator('.select-custom.open').count(), 1);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.select-custom.open').count(), 0);
  await dd('font').locator('.select-face').click();
  await page.evaluate(() => document.activeElement.blur());
  assert.equal(await page.locator('.select-custom.open').count(), 0);
  await ctx.close();
});

test('T21.7 con una selección mixta la cara muestra «—» y ninguna opción queda seleccionada', async () => {
  const { page, ctx, dd } = await abrir();
  await typeNote(page, 0, 'uno dos tres');
  await selectIn(page, 0, 0, 3);
  await pick(dd('size'), '20');
  const leer = () => dd('size').evaluate((b) => ({ txt: b.querySelector('.dd-val').textContent, sel: b.querySelectorAll('[aria-selected="true"]').length }));
  await selectIn(page, 0, 0, 7);
  assert.deepEqual(await leer(), { txt: '—', sel: 0 });
  await selectIn(page, 0, 0, 3);
  assert.deepEqual(await leer(), { txt: '20', sel: 1 });
  await ctx.close();
});

test('T21.8 los desplegables de Configuración guardan lo elegido', async () => {
  const { page, ctx } = await abrir();
  await page.click('#settingsBtn');
  const box = page.locator('#autosaveHost [data-dd]');
  await box.locator('.select-face').click();
  const ultima = box.locator('[role=option]').last();
  const val = await ultima.getAttribute('data-value');
  await ultima.click();
  assert.equal(await page.evaluate(() => String(db.settings.autosave)), val);
  assert.equal(String((await stored(page)).settings.autosave), val);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'autosaveSelect');
  assert.equal(await box.locator('.dd-val').textContent(), (await ultima.textContent()).trim());
  await ctx.close();
});
