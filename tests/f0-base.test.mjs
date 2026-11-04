import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openApp, readApp } from './helpers.mjs';

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });

test('T0.1 el archivo empieza por <!DOCTYPE html> (mayúsculas: es lo único que lee Scriptya)', () => {
  assert.match(readApp().replace(/^\uFEFF/, ''), /^<!DOCTYPE html>/);
});

test('T0.2 carga sin errores de consola (vacío y con datos)', async () => {
  for (const seed of [null, undefined]) {
    const { page, ctx, errors } = await openApp(browser, { seed });
    await page.waitForTimeout(300);
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});

test('T0.3 no referencia archivos locales (archivo único)', () => {
  const full = readApp();
  const src = full.replace(/<script[\s\S]*?<\/script>/gi, ''); // The JS builds templates with ${...}: only the static HTML/CSS is checked.
  const refs = [...src.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]);
  const bad = refs.filter((r) => !/^(data:|#|https?:|mailto:|blob:)/i.test(r));
  assert.deepEqual(bad, []);
  const css = [...src.matchAll(/url\(\s*["']?([^"')]+)/gi)].map((m) => m[1]).filter((u) => !/^(data:|#|https?:)/i.test(u));
  assert.deepEqual(css, []);
  assert.doesNotMatch(src, /@import/i);
});

test('T0.4 I18N.es e I18N.en tienen las mismas claves', async () => {
  const { page, ctx } = await openApp(browser, { open: false });
  const diff = await page.evaluate(() => {
    const es = Object.keys(I18N.es), en = Object.keys(I18N.en);
    return { soloEs: es.filter((k) => !en.includes(k)), soloEn: en.filter((k) => !es.includes(k)) };
  });
  assert.deepEqual(diff, { soloEs: [], soloEn: [] });
  await ctx.close();
});
