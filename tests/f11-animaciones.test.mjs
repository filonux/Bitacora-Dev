import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openApp, makeDb, sampleProject, readApp, sleep } from './helpers.mjs';

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });

const enteros = '[[VERSION: 1 => 1]]\n[[VERSION: 2 => 2]]\n[[VERSION: 3 => 3]]';
const dosProyectos = () => makeDb({ projects: [sampleProject({ n: 3 }), sampleProject({ id: 'p2', name: 'Otro', n: 2 })] });
// Waits a few frames: a 160 ms animation would still be running, a .01 ms transition would not.
const settle = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 40))))));
const running = (page) => page.evaluate(() => document.getAnimations().map((a) => `${a.animationName || a.transitionProperty} @ ${String(a.effect?.target?.className).slice(0, 40)}`));
// Records each animation as it starts, so the result does not depend on machine speed.
const record = (page) => page.evaluate(() => {
  window.__fx = [];
  document.addEventListener('animationstart', (e) => {
    const cs = getComputedStyle(e.target, e.pseudoElement || null);
    window.__fx.push({ name: e.animationName, cls: String(e.target.className), dur: parseFloat(cs.animationDuration) * 1000, delay: parseFloat(cs.animationDelay) * 1000, iter: cs.animationIterationCount });
  }, true);
});
const started = (page, name, cls) => page.waitForFunction(([n, c]) => window.__fx.some((f) => f.name === n && f.cls.includes(c)), [name, cls], { timeout: 3000 });
const log = (page) => page.evaluate(() => window.__fx);

test('T11.1 con prefers-reduced-motion no hay animaciones activas', async () => {
  const { page, ctx, errors } = await openApp(browser, { reducedMotion: 'reduce', ai: async () => enteros, seed: dosProyectos() });
  const steps = [
    ['inicio', async () => {}],
    ['propuesta de renumeración', async () => { await page.click('[data-ai-action="renumber"]'); await page.waitForSelector('[data-renum-accept]'); }],
    ['aceptar propuesta', () => page.click('[data-renum-accept]')],
    ['ayuda', () => page.click('#helpBtn')],
    ['cerrar ayuda', () => page.keyboard.press('Escape')],
    ['guardar', () => page.click('#saveBtn')],
    ['paleta', () => page.click('#commandBtn')],
    ['cerrar paleta', () => page.keyboard.press('Escape')],
    ['añadir nota', () => page.click('#addVersionBtn')],
    ['duplicar nota', () => page.locator('[data-action="duplicate"]').first().click()],
    ['otro proyecto', () => page.locator('.project-item').nth(1).click()],
  ];
  for (const [name, run] of steps) {
    await run();
    await settle(page);
    assert.deepEqual(await running(page), [], `animaciones activas tras «${name}»`);
  }
  const caret = await page.evaluate(() => getComputedStyle(document.querySelector('#commandBtn'), '::before').animationName);
  assert.equal(caret, 'none', 'el cursor de Comandos no parpadea');
  assert.equal(await page.locator('.fx-in, .fx-glow').count(), 0, 'no se añaden clases de efecto');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('T11.2 ninguna animación infinita en elementos de lectura (notas, texto)', async () => {
  // Static check: only the «Comandos» cursor and the «IA procesando» indicators (the model chip included) may be infinite.
  const css = [...readApp().matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
  const selectors = [...css.matchAll(/([^{}]+)\{([^{}]*\binfinite\b[^{}]*)\}/g)].flatMap((m) => m[1].split(',').map((x) => x.trim()));
  assert.ok(selectors.length >= 1, 'se esperaba al menos el cursor de Comandos');
  for (const sel of selectors) assert.match(sel, /cmd-btn:before|\.typing-dot|\.typing-cursor|\.ai-status-dot|\.ai-chip\.busy/, `animación infinita en «${sel}»`);

  // At runtime: idle and while the AI is typing.
  const { page, ctx } = await openApp(browser, { ai: async () => { await sleep(600); return enteros; } });
  const infinite = () => page.evaluate(() => document.getAnimations()
    .filter((a) => a.effect.getComputedTiming().iterations === Infinity)
    .map((a) => ({ cls: String(a.effect.target.className), reading: !!a.effect.target.closest('.version-list,.instruction,.project-title,.workspace-scroll,.project-list,.ai-messages .msg:not(.msg-typing)') })));
  const idle = await infinite();
  assert.ok(idle.some((a) => a.cls.includes('cmd-btn')), 'el cursor de Comandos sí parpadea');
  assert.deepEqual(idle.filter((a) => a.reading), []);
  await page.click('[data-ai-action="renumber"]');
  await page.waitForSelector('.msg-typing');
  const busy = await infinite();
  assert.ok(busy.some((a) => /typing|ai-status-dot/.test(a.cls)), 'el indicador de IA procesando está animado');
  assert.deepEqual(busy.filter((a) => a.reading), []);
  await page.waitForSelector('[data-renum-accept]');
  await ctx.close();
});

test('T11.3 una nota nueva entra con un efecto breve, de una pasada, que no se repite al re-renderizar ni al escribir', async () => {
  const { page, ctx, errors } = await openApp(browser);
  await record(page);
  await page.click('#addVersionBtn');
  await started(page, 'fx-rise', 'version-entry');
  const entry = (await log(page)).find((f) => f.name === 'fx-rise' && f.cls.includes('version-entry'));
  assert.equal(entry.iter, '1');
  assert.ok(entry.dur > 0 && entry.dur + entry.delay <= 400, `dura ${entry.dur} ms`);
  await page.waitForFunction(() => !document.querySelector('.fx-in, .fx-glow'), null, { timeout: 1500 });

  const before = (await log(page)).length;
  await page.locator('.version-card').last().locator('.instruction').fill('texto de prueba');
  await page.evaluate(() => { renderWorkspace(); renderProjects(); renderAI(); });
  await settle(page);
  assert.equal(await page.locator('.fx-in, .fx-glow').count(), 0, 'sin clases de efecto tras re-renderizar');
  assert.equal((await log(page)).filter((f) => f.name.startsWith('fx-')).length, (await log(page)).slice(0, before).filter((f) => f.name.startsWith('fx-')).length, 'no hay efectos nuevos');

  await page.locator('[data-action="duplicate"]').last().click();
  await page.waitForFunction(() => window.__fx.filter((f) => f.name === 'fx-rise' && f.cls.includes('version-entry')).length >= 2, null, { timeout: 3000 });
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('T11.4 los mensajes de IA nuevos se animan una vez y las filas de renumeración entran en cascada', async () => {
  const { page, ctx } = await openApp(browser, { ai: async () => enteros });
  await record(page);
  await page.click('[data-ai-action="renumber"]');
  await page.waitForSelector('[data-renum-accept]');
  await started(page, 'fx-rise', 'msg assistant');
  await page.waitForFunction(() => window.__fx.filter((x) => x.name === 'fx-line').length >= 3, null, { timeout: 3000 }); // they start staggered
  const f = await log(page);
  const rows = f.filter((x) => x.name === 'fx-line');
  assert.equal(rows.length, 3);
  assert.ok(rows.every((r) => r.iter === '1' && r.dur <= 250));
  assert.ok(rows[0].delay < rows[1].delay && rows[1].delay < rows[2].delay, `retardos ${rows.map((r) => r.delay)}`);
  await page.waitForFunction(() => !document.querySelector('.fx-in'), null, { timeout: 1500 });
  // A later re-render does not replay the animation of existing messages.
  await page.evaluate(() => renderAI());
  assert.equal(await page.locator('.msg.fx-in').count(), 0);
  await ctx.close();
});

test('T11.5 Guardar, el diálogo de ayuda y la paleta tienen su efecto de entrada', async () => {
  const { page, ctx } = await openApp(browser);
  await record(page);
  await page.click('#saveBtn');
  await started(page, 'fx-glow', 'tile-save');
  await page.waitForFunction(() => !document.querySelector('.fx-glow'), null, { timeout: 1500 });
  await page.click('#helpBtn');
  await started(page, 'fx-rise', 'modal-box');
  await started(page, 'fx-fade', 'modal-scrim');
  await page.keyboard.press('Escape');
  await page.click('#commandBtn');
  await started(page, 'fx-rise', 'command-box');
  const toast = await page.evaluate(() => getComputedStyle(document.querySelector('#toast'), '::before').content);
  assert.equal(toast, '">"', 'el aviso lleva el prompt «>»');
  const all = (await log(page)).filter((f) => f.name.startsWith('fx-'));
  assert.ok(all.every((f) => f.iter === '1' && f.dur + f.delay <= 600), 'todos de una pasada y de menos de 600 ms');
  await ctx.close();
});
