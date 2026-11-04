// F65 · Project line in the assistant panel («Stratus Backup · 11 versiones · 2.0.0»): +1 pt and typography matching the project's.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openApp, makeDb, sampleProject } from './helpers.mjs';

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });

const stratus = () => { const p = sampleProject({ id: 'p1', name: 'Stratus Backup', n: 11, words: 30 }); p.versions[10].version = '2.0.0'; return p; };
const medir = (page) => page.evaluate(() => {
  const pill = document.querySelector('#aiContext .context-pill'), cs = (e) => getComputedStyle(e);
  const name = pill.querySelector('.ctx-name'), meta = pill.querySelector('.ctx-meta'), led = pill.querySelector('.ctx-led');
  const r = (e) => e.getBoundingClientRect(), P = r(pill), M = r(meta), N = r(name);
  return {
    texto: pill.innerText.replace(/\s+/g, ' ').trim(), title: pill.title, fs: parseFloat(cs(pill).fontSize), lh: parseFloat(cs(name).lineHeight),
    nombre: { fam: cs(name).fontFamily, peso: +cs(name).fontWeight, alto: N.height }, body: cs(document.body).fontFamily,
    meta: { fam: cs(meta).fontFamily, num: cs(meta).fontVariantNumeric, dentro: M.left >= P.left - 1 && M.right <= P.right + 1 && M.bottom <= P.bottom + 1 && M.height > 0 },
    led: { texto: led.textContent, radio: cs(led).borderRadius, w: r(led).width },
    desborda: pill.scrollWidth > pill.clientWidth, alto: P.height,
  };
});

test('T65.1 la línea del proyecto mide 11 px + 1 pt; nombre en la fuente de la interfaz, datos en mono con cifras fijas y cero cortado, LED dibujado en CSS', async () => {
  const { page, errors } = await openApp(browser, { seed: makeDb({ projects: [stratus()] }), ai: async () => '' });
  const m = await medir(page);
  assert.equal(m.texto, 'Stratus Backup · 11 versiones · 2.0.0');
  assert.ok(Math.abs(m.fs - (11 + 4 / 3)) < 0.05, `tamaño ${m.fs}`);
  assert.equal(m.nombre.fam, m.body, 'el nombre usa la fuente de la interfaz');
  assert.ok(m.nombre.peso >= 600);
  assert.match(m.meta.fam, /mono/i);
  assert.ok(m.meta.num.includes('tabular-nums') && m.meta.num.includes('slashed-zero'), m.meta.num);
  assert.equal(m.led.texto, '', 'sin glifo «◉»: depende de la fuente del sistema');
  assert.equal(m.led.radio, '50%');
  assert.ok(m.led.w >= 8);
  assert.equal(m.title, 'Stratus Backup');
  assert.deepEqual(errors, []);
});

test('T65.2 un nombre largo no desborda: se recorta a dos líneas y los datos siguen visibles, también con 340 px', async () => {
  const largo = sampleProject({ id: 'p2', name: 'Proyecto con un nombre larguísimo para comprobar que no desborda la línea del asistente', n: 3, words: 20 });
  const viewport = { width: 340, height: 800 };
  const { page } = await openApp(browser, { seed: makeDb({ projects: [largo, stratus()] }), ai: async () => '', viewport });
  await page.click('#aiToggle');
  const m = await medir(page);
  assert.equal(m.desborda, false);
  assert.ok(m.nombre.alto <= m.lh * 2 + 2, `el nombre ocupa ${m.nombre.alto} px (máx. 2 líneas)`);
  assert.ok(m.meta.dentro, 'versiones y número de versión quedan dentro de la línea');
  assert.match(m.texto, /3 versiones · 1\.2$/);
  assert.equal(m.title, largo.name, 'el nombre completo queda en el título');
});
