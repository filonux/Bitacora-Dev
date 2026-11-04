import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openApp, readApp } from './helpers.mjs';

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });

// On narrow screens the AI panel is closed by default.
async function abrir(opts) {
  const app = await openApp(browser, opts);
  if (opts.viewport.width <= 900) await app.page.click('#aiToggle');
  await app.page.waitForSelector('.ai-quick .btn', { state: 'visible' });
  return app;
}

const medir = (page) => page.evaluate(() => {
  const caja = (a) => { const b = document.querySelector(`.ai-quick [data-ai-action=${a}]`); const r = b.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, texto: b.textContent, recortado: b.scrollWidth > b.clientWidth, marca: getComputedStyle(b, '::before').content }; };
  return { orden: [...document.querySelectorAll('.ai-quick .btn')].map((b) => b.dataset.aiAction), summary: caja('summary'), renumber: caja('renumber'), changes: caja('changes') };
});

test('T29.1 «Renumerar versiones» va a la derecha de Resumen, en su misma fila y con su misma forma (ES y EN)', async () => {
  for (const [lang, texto] of [['es', 'Renumerar versiones'], ['en', 'Renumber versions']]) {
    const { page, ctx } = await abrir({ lang, viewport: { width: 1280, height: 800 } });
    const m = await medir(page);
    assert.deepEqual(m.orden, ['summary', 'renumber', 'changes', 'contradictions'], `${lang}: orden de las acciones`);
    assert.equal(m.renumber.texto, texto);
    assert.equal(m.renumber.y, m.summary.y, `${lang}: no está en la misma fila que Resumen`);
    assert.ok(m.renumber.x > m.summary.x + m.summary.w - 1, `${lang}: no queda a su derecha`);
    assert.equal(m.renumber.w, m.summary.w, `${lang}: ancho distinto`);
    assert.equal(m.renumber.h, m.summary.h, `${lang}: alto distinto`);
    assert.equal(m.changes.x, m.summary.x, `${lang}: Cambios debe quedar bajo Resumen`);
    await ctx.close();
  }
});

test('T29.2 conserva el mini icono «#» y no recorta la etiqueta (1280, 390 y 320 px, ES y EN)', async () => {
  for (const lang of ['es', 'en']) {
    for (const width of [1280, 390, 320]) {
      const { page, ctx } = await abrir({ lang, viewport: { width, height: 800 } });
      const m = await medir(page);
      assert.equal(m.renumber.marca, '"#"', `${lang} ${width}: falta el mini icono`);
      assert.equal(m.renumber.recortado, false, `${lang} ${width}: etiqueta recortada`);
      assert.equal(m.renumber.y, m.summary.y, `${lang} ${width}: salta de fila`);
      await ctx.close();
    }
  }
});

test('T29.3 la fila ancha antigua ya no existe y el botón sigue lanzando la propuesta', async () => {
  assert.ok(!readApp().includes('ai-quick-wide'), 'quedan restos de .ai-quick-wide');
  const { page, ctx, errors } = await abrir({ lang: 'es', viewport: { width: 1280, height: 800 }, ai: () => 'VERSIÓN: 1 => 1.0' });
  assert.equal(await page.locator('[data-agent="renumber-versions"]').count(), 1);
  await page.click('.ai-quick [data-ai-action=renumber]');
  await page.waitForSelector('#aiMessages .msg', { timeout: 5000 });
  assert.deepEqual(errors, []);
  await ctx.close();
});
