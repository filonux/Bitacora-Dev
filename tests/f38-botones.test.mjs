import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openApp, makeDb, sampleProject } from './helpers.mjs';

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });

const conChat = () => {
  const p = sampleProject();
  p.chat = [{ role: 'user', text: 'hola', ts: new Date(2026, 1, 1).toISOString() }, { role: 'assistant', text: 'qué tal', ts: new Date(2026, 1, 1).toISOString() }];
  return makeDb({ projects: [p] });
};
const chatLen = (page) => page.evaluate(() => getProject().chat.length);

test('T38.1 los botones de añadir llevan «+» SVG (no U+FF0B) y la receta esmeralda; el de final de lista es discreto', async () => {
  const { page, ctx } = await openApp(browser);
  const d = await page.evaluate(() => ['addVersionTopBtn', 'pendingAddBtn', 'addVersionBtn'].map((id) => {
    const b = document.getElementById(id), cs = getComputedStyle(b);
    return { id, svg: b.querySelector('svg.ic path')?.getAttribute('d'), fuente: cs.fontSize, img: cs.backgroundImage, estilo: cs.borderTopStyle, fw: cs.fontWeight, fullwidth: b.textContent.includes('\uFF0B') };
  }));
  for (const i of d) { assert.equal(i.svg, 'M12 4.5v15M4.5 12h15', `${i.id}: «+» SVG`); assert.equal(i.fullwidth, false, `${i.id}: queda U+FF0B`); }
  for (const i of d.slice(0, 2)) { assert.ok(i.img.includes('rgb(35, 128, 82)') && i.img.includes('rgb(26, 99, 66)'), `${i.id}: ${i.img}`); assert.equal(i.fuente, '14.5px'); assert.equal(i.fw, '650'); }
  assert.equal(d[2].estilo, 'dashed');
  await ctx.close();
});

test('T38.2 Limpiar chat y Cerrar panel: 34×34 px, iconos y colores distintos, títulos propios (ES y EN)', async () => {
  const { page, ctx } = await openApp(browser);
  const medir = () => page.evaluate(() => ['aiClear', 'aiClose'].map((id) => {
    const b = document.getElementById(id), r = b.getBoundingClientRect();
    return { w: r.width, h: r.height, color: getComputedStyle(b).color, dibujo: b.querySelector('svg.ic').innerHTML, title: b.title, aria: b.getAttribute('aria-label') };
  }));
  const [c, x] = await medir();
  assert.deepEqual([c.w, c.h, x.w, x.h], [34, 34, 34, 34]);
  assert.notEqual(c.dibujo, x.dibujo);
  assert.equal(c.color, 'rgb(217, 158, 160)');
  assert.notEqual(x.color, c.color);
  assert.deepEqual([c.title, c.aria, x.title, x.aria], ['Limpiar chat', 'Limpiar chat', 'Cerrar panel de IA', 'Cerrar panel de IA']);
  await page.click('#langEn');
  const [ce, xe] = await medir();
  assert.deepEqual([ce.title, ce.aria, xe.title, xe.aria], ['Clear chat', 'Clear chat', 'Close AI panel', 'Close AI panel']);
  await ctx.close();
});

test('T38.3 Limpiar chat vacía el chat, avisa y «Deshacer» lo recupera; sin mensajes no hace nada', async () => {
  const { page, ctx } = await openApp(browser, { seed: conChat() });
  await page.click('#aiClear');
  assert.equal(await chatLen(page), 0);
  assert.ok((await page.locator('body').innerText()).includes('Chat limpiado.'));
  await page.click('#toastAction');
  assert.equal(await chatLen(page), 2);
  await ctx.close();
  const vacio = await openApp(browser, { seed: makeDb({ projects: [sampleProject()] }) });
  await vacio.page.click('#aiClear');
  assert.ok(!(await vacio.page.locator('body').innerText()).includes('Chat limpiado.'));
  await vacio.ctx.close();
});

test('T38.4 la tapa de la papelera se abre al pasar el ratón; Cerrar panel cierra el panel', async () => {
  const { page, ctx } = await openApp(browser, { seed: conChat() });
  const tapa = () => page.evaluate(() => getComputedStyle(document.querySelector('#aiClear .lid')).transform);
  assert.equal(await tapa(), 'none');
  await page.hover('#aiClear');
  await page.waitForTimeout(400);
  assert.notEqual(await tapa(), 'none');
  const antes = await page.getAttribute('#aiToggle', 'aria-expanded');
  await page.click('#aiClose');
  assert.notEqual(await page.getAttribute('#aiToggle', 'aria-expanded'), antes);
  await ctx.close();
});
