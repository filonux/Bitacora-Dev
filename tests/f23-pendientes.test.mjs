import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openApp, readApp, makeDb, sampleProject, contrast, medirDesbordes } from './helpers.mjs';

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });

const LARGA = 'Revisar la migración de índices antes de publicar y ' + 'x'.repeat(90);
const seed = () => {
  const p = sampleProject();
  p.pending = [
    { id: 'a', text: 'Cerrar la conciliación de ingresos con Finanzas', done: true, source: 'manual', sourceVersionId: '', createdAt: p.createdAt },
    { id: 'b', text: LARGA, done: false, source: 'ai', sourceVersionId: p.versions[0].id, createdAt: p.createdAt },
    { id: 'c', text: 'Evaluar particionado por hora', done: false, source: 'manual', sourceVersionId: '', createdAt: p.createdAt },
  ];
  return makeDb({ projects: [p] });
};

test('T23.1 la fuente Literata va incrustada (OFL, atribuida, ≤ 40 KB) y la app sigue siendo un solo archivo', () => {
  const src = readApp();
  const face = src.match(/@font-face\{font-family:Literata;[^}]*src:url\(data:font\/woff2;base64,([A-Za-z0-9+/=]+)\)/);
  assert.ok(face, 'falta @font-face de Literata con data:');
  assert.ok(face[1].length <= 40000, `la fuente pesa ${face[1].length} caracteres base64`);
  assert.match(src, /Literata Project Authors[\s\S]{0,200}SIL Open Font License 1\.1/, 'falta la atribución OFL junto a @font-face');
  assert.match(src, /--read:Literata,[^;]*Georgia,serif;/, 'la pila --read debe terminar en fuentes del sistema');
});

for (const [lang, ancho] of [['es', 1280], ['en', 390]]) {
  test(`T23.2 las tareas pendientes se leen bien: Literata cargada, ≥ 14 px, interlineado ≥ 1,5 (${lang}, ${ancho})`, async () => {
    const { page, ctx, errors } = await openApp(browser, { seed: seed(), lang, viewport: { width: ancho, height: 800 } });
    await page.waitForSelector('#pendingList .pending-item');
    const m = await page.evaluate(async () => {
      await document.fonts.ready;
      const s = document.querySelector('.pending-item span'), cs = getComputedStyle(s);
      const inp = getComputedStyle(document.querySelector('#pendingAddInput'));
      const caras = [...document.fonts].filter((f) => f.family.replace(/"/g, '') === 'Literata');
      return { fam: cs.fontFamily, px: parseFloat(cs.fontSize), lh: parseFloat(cs.lineHeight) / parseFloat(cs.fontSize), cargada: caras.length === 1 && caras[0].status === 'loaded', inpFam: inp.fontFamily, inpPx: parseFloat(inp.fontSize) };
    });
    assert.match(m.fam, /^"?Literata"?,/);
    assert.ok(m.cargada, 'Literata no se cargó desde el data: incrustado');
    assert.ok(m.px >= 14, `tamaño ${m.px}px`);
    assert.ok(m.lh >= 1.5, `interlineado ${m.lh}`);
    assert.match(m.inpFam, /^"?Literata"?,/); assert.ok(m.inpPx >= 14);
    assert.deepEqual(errors, []);
    await ctx.close();
  });
}

test('T23.3 contraste ≥ 7:1 en pendientes y ≥ 4,5:1 en completadas; casilla alineada con la primera línea', async () => {
  const { page, ctx } = await openApp(browser, { seed: seed() });
  await page.waitForSelector('#pendingList .pending-item');
  const m = await page.evaluate(() => {
    const col = (sel) => getComputedStyle(document.querySelector(sel)).color;
    const items = [...document.querySelectorAll('.pending-item')];
    const geo = items.map((it) => {
      const r = it.querySelector('input').getBoundingClientRect(), s = it.querySelector('span'), lh = parseFloat(getComputedStyle(s).lineHeight), t = s.getBoundingClientRect();
      return Math.abs((r.top + r.height / 2) - (t.top + lh / 2));
    });
    return { activa: col('.pending-item:not(.done) span'), hecha: col('.pending-item.done span'), geo };
  });
  const fondo = 'rgb(11, 22, 15)';
  assert.ok(contrast(m.activa, fondo) >= 7, `contraste activa ${contrast(m.activa, fondo).toFixed(2)}`);
  assert.ok(contrast(m.hecha, fondo) >= 4.5, `contraste completada ${contrast(m.hecha, fondo).toFixed(2)}`);
  for (const d of m.geo) assert.ok(d <= 3, `casilla desalineada ${d.toFixed(1)}px`);
  await ctx.close();
});

for (const ancho of [1280, 390]) {
  test(`T23.4 una tarea con una palabra larguísima no desborda ni solapa el botón de quitar (${ancho})`, async () => {
    const { page, ctx } = await openApp(browser, { seed: seed(), viewport: { width: ancho, height: 800 } });
    await page.waitForSelector('#pendingList .pending-item');
    const d = await page.evaluate(medirDesbordes);
    assert.equal(d.desborde, 0); assert.equal(d.pagina, 0); assert.deepEqual(d.fuera, []);
    const solapa = await page.evaluate(() => [...document.querySelectorAll('.pending-item')].some((it) => {
      const s = it.querySelector('span').getBoundingClientRect(), b = it.querySelector('[data-pending-remove]').getBoundingClientRect();
      return s.right > b.left + 1;
    }));
    assert.equal(solapa, false);
    await ctx.close();
  });
}
