// F54 · Assistant header: title and provider +2 pt, keeping their difference, nothing clipped, and the provider status dot.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openApp, makeDb, sampleProject } from './helpers.mjs';

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });

const seed = () => makeDb({ projects: [sampleProject({ id: 'p1', name: 'Pulsar Observability', n: 2 })] });
/** Opens the AI panel if the width leaves it folded. */
async function panel(page) {
  if (!(await page.locator('#aiTitle').isVisible())) {
    if (await page.locator('#sidebar.open').count()) await page.click('#sidebarToggle');
    await page.click('#aiToggle');
    await page.waitForSelector('#aiTitle', { state: 'visible' });
  }
}
const estilo = (page, sel) => page.evaluate((s) => {
  const e = document.querySelector(s), c = getComputedStyle(e);
  return { size: parseFloat(c.fontSize), weight: Number(c.fontWeight), color: c.color, family: c.fontFamily, text: e.textContent };
}, sel);

test('T54.1 título 16,67 px y proveedor 12,67 px (+2 pt) con su diferencia de tamaño, peso, color y familia, en ES y EN', async () => {
  for (const lang of ['es', 'en']) {
    const { page, errors } = await openApp(browser, { seed: seed(), lang });
    await panel(page);
    const t = await estilo(page, '#aiTitle'), p = await estilo(page, '#aiProviderLabel');
    assert.ok(Math.abs(t.size - 16.67) < 0.05, `${lang} título ${t.size}`);
    assert.ok(Math.abs(p.size - 12.67) < 0.05, `${lang} proveedor ${p.size}`);
    assert.ok(t.weight >= 700 && p.weight <= 500, `${lang} pesos ${t.weight}/${p.weight}`);
    assert.notEqual(t.color, p.color, `${lang} color`);
    assert.ok(/mono|consolas|courier/i.test(p.family) && !/mono|consolas|courier/i.test(t.family), `${lang} familias`);
    assert.equal(t.text, lang === 'es' ? 'Asistente de bitácora' : 'Logbook assistant');
    assert.deepEqual(errors, []);
  }
});

test('T54.2 sin recortes ni desbordes a 1280, 901, 390 y 320 px, con los cuatro botones dentro de la cabecera', async () => {
  for (const width of [1280, 901, 390, 320]) {
    const { page, errors } = await openApp(browser, { seed: seed(), viewport: { width, height: 800 } });
    await panel(page);
    const m = await page.evaluate(() => {
      const h = document.querySelector('.ai-header').getBoundingClientRect();
      const dentro = (e) => { const r = e.getBoundingClientRect(); return r.left >= h.left - 1 && r.right <= h.right + 1 && r.top >= h.top - 1 && r.bottom <= h.bottom + 1; };
      const cortado = (e) => e.scrollWidth > e.clientWidth + 1;
      const btn = [...document.querySelectorAll('.ai-head-actions .btn')];
      return { n: btn.length, fuera: btn.filter((b) => !dentro(b)).map((b) => b.id), cortes: ['#aiTitle', '#aiProviderLabel'].filter((s) => cortado(document.querySelector(s))), solapan: btn.some((b) => { const a = b.getBoundingClientRect(), t = document.querySelector('#aiTitle').getBoundingClientRect(), p = document.querySelector('#aiProviderLabel').getBoundingClientRect(); return !(a.left >= t.right || a.right <= t.left || a.top >= t.bottom || a.bottom <= t.top) || !(a.left >= p.right || a.right <= p.left || a.top >= p.bottom || a.bottom <= p.top); }), pagina: document.documentElement.scrollWidth - innerWidth };
    });
    assert.equal(m.n, 4, `${width} botones`);
    assert.deepEqual(m.fuera, [], `${width} botones fuera`);
    assert.deepEqual(m.cortes, [], `${width} texto cortado`);
    assert.equal(m.solapan, false, `${width} botones sobre el texto`);
    assert.ok(m.pagina <= 0, `${width} desborde de página ${m.pagina}`);
    assert.deepEqual(errors, []);
  }
});

test('T54.3 el proveedor lleva un punto de estado: anillo sin IA y encendido en verde con IA conectada', async () => {
  const dot = (page) => page.evaluate(() => {
    const e = document.querySelector('#aiProviderLabel'), b = getComputedStyle(e, '::before');
    return { on: e.classList.contains('on'), content: b.content, bg: b.backgroundColor, border: b.borderTopWidth, shadow: b.boxShadow, color: getComputedStyle(e).color, text: e.textContent };
  });
  const off = await openApp(browser, { seed: seed() });
  const a = await dot(off.page);
  assert.equal(a.on, false);
  assert.ok(a.content !== 'none' && a.border !== '0px', 'anillo');
  assert.equal(a.bg, 'rgba(0, 0, 0, 0)', 'hueco');
  assert.equal(a.shadow, 'none');
  const on = await openApp(browser, { seed: seed(), ai: async () => 'ok' });
  const b = await dot(on.page);
  assert.equal(b.on, true);
  assert.notEqual(b.bg, 'rgba(0, 0, 0, 0)', 'relleno');
  assert.notEqual(b.shadow, 'none', 'brillo');
  assert.notEqual(b.color, a.color, 'color');
  assert.deepEqual([...off.errors, ...on.errors], []);
});
