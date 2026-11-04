import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openApp } from './helpers.mjs';

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });

const PIE = ['saveBtn', 'backupBtn', 'exportBtn', 'importBtn'];

test('T31.1 el botón de IA tiene icono propio: SVG 24×24 decorativo, distinto al de las tarjetas del pie', async () => {
  const { page, ctx } = await openApp(browser);
  const d = await page.evaluate((ids) => {
    const s = document.querySelector('#aiToggle svg.ic');
    return { vb: s.getAttribute('viewBox'), oculto: s.getAttribute('aria-hidden'), formas: s.querySelectorAll('path,rect,circle,ellipse').length, dibujo: s.innerHTML, pie: ids.map((i) => document.querySelector(`#${i} svg.ic`).innerHTML) };
  }, PIE);
  assert.equal(d.vb, '0 0 24 24');
  assert.equal(d.oculto, 'true');
  assert.ok(d.formas >= 2, `icono pobre (${d.formas} formas)`);
  assert.ok(!d.pie.includes(d.dibujo), 'comparte dibujo con una tarjeta del pie');
  await ctx.close();
});

test('T31.2 receta esmeralda: degradado de 135°, borde jade, 38 px de alto y sin cambio de tamaño al pasar el ratón', async () => {
  const { page, ctx } = await openApp(browser);
  const medir = () => page.evaluate(() => { const b = document.getElementById('aiToggle'), cs = getComputedStyle(b); return { img: cs.backgroundImage, borde: cs.borderTopColor, h: b.getBoundingClientRect().height, w: b.getBoundingClientRect().width }; });
  const a = await medir();
  assert.ok(a.img.includes('linear-gradient') && a.img.includes('rgb(20, 87, 58)') && a.img.includes('rgb(30, 122, 78)'), a.img);
  assert.equal(a.borde, 'rgb(63, 174, 120)');
  assert.ok(a.h >= 38, `alto ${a.h}`);
  await page.hover('#aiToggle');
  await page.waitForTimeout(300);
  const b = await medir();
  assert.equal(`${b.w}x${b.h}`, `${a.w}x${a.h}`);
  await ctx.close();
});

test('T31.3 el botón de IA abre y cierra el panel y mantiene aria-expanded sincronizado', async () => {
  const { page, ctx } = await openApp(browser);
  assert.equal(await page.getAttribute('#aiToggle', 'aria-controls'), 'aiPanel');
  const estado = () => page.getAttribute('#aiToggle', 'aria-expanded');
  const inicial = await estado();
  await page.click('#aiToggle');
  assert.notEqual(await estado(), inicial);
  await page.click('#aiToggle');
  assert.equal(await estado(), inicial);
  await ctx.close();
});

test('T31.4 las tarjetas del pie ponen el icono sobre la etiqueta (ES y EN)', async () => {
  const { page, ctx } = await openApp(browser);
  const medir = () => page.evaluate((ids) => ids.map((id) => {
    const b = document.getElementById(id), s = b.querySelector('svg.ic').getBoundingClientRect(), sp = b.querySelector('span');
    let top;
    if (sp) top = sp.getBoundingClientRect().top;
    else { const n = [...b.childNodes].filter((x) => x.nodeType === 3 && x.textContent.trim()).pop(), r = document.createRange(); r.selectNodeContents(n); top = r.getBoundingClientRect().top; }
    return { id, col: getComputedStyle(b).flexDirection, encima: s.bottom <= top + 1 };
  }), PIE);
  for (const lang of ['#langEs', '#langEn']) {
    await page.click(lang);
    for (const i of await medir()) assert.ok(i.col === 'column' && i.encima, `${lang} ${i.id}: ${JSON.stringify(i)}`);
  }
  await ctx.close();
});
