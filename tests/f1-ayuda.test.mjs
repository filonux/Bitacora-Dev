import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openApp } from './helpers.mjs';

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });

const isRed = (c) => { const [r, g, b] = c.match(/[\d.]+/g).map(Number); return r > 200 && g < 150 && b < 150; };

test('T1.1 con almacenamiento normal no hay elemento rojo visible junto a Comandos', async () => {
  const { page, ctx } = await openApp(browser);
  assert.equal(await page.locator('#storageBadge').isVisible(), false);
  const reds = await page.$$eval('.topbar-group > *', (els) => els.filter((e) => e.offsetWidth > 0).map((e) => {
    const s = getComputedStyle(e); return [e.id, s.backgroundColor, s.borderTopColor, s.color];
  }));
  for (const [id, ...colors] of reds) assert.ok(!colors.some(isRed), `${id} tiene color rojo: ${colors}`);
  await ctx.close();
});

test('T1.2 con localStorage bloqueado aparece «Solo en memoria»', async () => {
  const { page, ctx } = await openApp(browser, { blockStorage: true, open: false });
  await page.waitForTimeout(200);
  const badge = page.locator('#storageBadge');
  assert.equal(await badge.isVisible(), true);
  assert.match(await badge.innerText(), /Solo en memoria/);
  await ctx.close();
});

test('T1.3 Ayuda abre el tutorial y Esc lo cierra', async () => {
  const { page, ctx } = await openApp(browser);
  await page.click('#helpBtn');
  await page.waitForSelector('#modalLayer.open .help-item');
  assert.ok((await page.locator('.help-item').count()) >= 8);
  await page.keyboard.press('Escape');
  await page.waitForSelector('#modalLayer.open', { state: 'detached' }).catch(() => {});
  assert.equal(await page.locator('#modalLayer.open').count(), 0);
  await ctx.close();
});

test('T1.4 el tutorial existe en ES y EN, con los mismos apartados y mención de estilos y renumeración', async () => {
  const { page, ctx } = await openApp(browser);
  const d = await page.evaluate(() => ({
    es: I18N.es.helpItems.split('|'), en: I18N.en.helpItems.split('|'),
    titles: [I18N.es.helpTitle, I18N.en.helpTitle],
  }));
  assert.equal(d.es.length, d.en.length);
  assert.ok(d.es.every((x) => x.includes('::')) && d.en.every((x) => x.includes('::')));
  assert.ok(d.titles[0] && d.titles[1] && d.titles[0] !== d.titles[1]);
  assert.match(d.es.join(' '), /Renumerar versiones/);
  assert.match(d.en.join(' '), /Renumber versions/);
  assert.match(d.es.join(' '), /negrita/i);
  assert.match(d.en.join(' '), /bold/i);
  await page.click('#langEn'); await page.click('#helpBtn');
  assert.match(await page.locator('#modalLayer .help-item').first().innerText(), /Start/);
  await ctx.close();
});
