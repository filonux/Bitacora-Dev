import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openApp, makeDb, sampleProject, sleep } from './helpers.mjs';

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });

const versions = (page) => page.evaluate(() => getProject().versions.map((v) => v.version));
const lento = (texto = 'ok') => async () => { await sleep(700); return texto; };
const coherente = 'Ya es coherente.\n[[VERSION: 1 => 1.0]]\n[[VERSION: 2 => 1.1]]\n[[VERSION: 3 => 1.2]]';
const semver = 'Semántica.\n[[VERSION: 1 => 0.1.0]]\n[[VERSION: 2 => 0.2.0]]\n[[VERSION: 3 => 0.3.0]]';
const medir = (page) => page.evaluate(() => {
  const b = document.getElementById('aiSend'), f = b.closest('.composer-foot'), cs = getComputedStyle(b);
  return { h: b.getBoundingClientRect().height, fs: parseFloat(cs.fontSize), svg: !!b.querySelector('svg.ic'), txt: b.querySelector('span').textContent, desborda: f.scrollWidth > f.clientWidth + 1 };
});

test('T35.1 Enviar: +10 % de alto y de fuente, icono, etiqueta traducible y pie sin desbordes', async () => {
  const { page, ctx } = await openApp(browser, { ai: lento() });
  const es = await medir(page);
  assert.ok(Math.abs(es.h - 37.4) < 0.6 && es.fs === 15.4 && es.svg && es.txt === 'Enviar' && !es.desborda, JSON.stringify(es));
  await page.click('#langEn');
  assert.equal((await medir(page)).txt, 'Send');
  await page.fill('#aiInput', 'hola');
  await page.click('#aiSend');
  await page.waitForSelector('.msg-typing');
  assert.equal((await medir(page)).desborda, false);
  await ctx.close();
});

test('T35.2 indicador de escritura: prompt «>» fijo, tres puntos en barrido y cursor de bloque', async () => {
  const { page, ctx } = await openApp(browser, { ai: lento() });
  await page.fill('#aiInput', 'hola');
  await page.click('#aiSend');
  await page.waitForSelector('.msg-typing .typing-cursor');
  const d = await page.evaluate(() => {
    const t = document.querySelector('.msg-typing'), dots = [...t.querySelectorAll('.typing-dot')];
    return { prompt: t.querySelector('.typing-prompt')?.textContent, promptAnim: getComputedStyle(t.querySelector('.typing-prompt')).animationName, n: dots.length, delays: dots.map((e) => getComputedStyle(e).animationDelay), cursor: getComputedStyle(t.querySelector('.typing-cursor')).width, anim: document.getAnimations().map((a) => a.animationName).filter(Boolean) };
  });
  assert.equal(d.prompt, '>');
  assert.equal(d.promptAnim, 'none');
  assert.equal(d.n, 3);
  assert.deepEqual(d.delays, ['0s', '0.18s', '0.36s']);
  assert.equal(d.cursor, '6px');
  assert.ok(d.anim.includes('typing-scan') && d.anim.includes('typing-cursor'), d.anim.join());
  await ctx.close();
});

test('T35.3 desde el chat, una respuesta con [[VERSION]] ofrece Aceptar y renumera', async () => {
  const { page, ctx } = await openApp(browser, { ai: () => 'Paso a enteros.\n[[VERSION: 1 => 1]]\n[[VERSION: 2 => 2]]\n[[VERSION: 3 => 3]]' });
  await page.fill('#aiInput', 'renumera las versiones con enteros');
  await page.click('#aiSend');
  await page.waitForSelector('[data-renum-accept]');
  assert.ok(!(await page.locator('#aiMessages').textContent()).includes('[[VERSION'));
  await page.click('[data-renum-accept]');
  assert.deepEqual(await versions(page), ['1', '2', '3']);
  await ctx.close();
});

test('T35.4 «sin cambios» ofrece Otro esquema y esquemas rápidos, nunca Aceptar', async () => {
  const { page, ctx } = await openApp(browser, { ai: () => coherente });
  await page.click('[data-ai-action="renumber"]');
  await page.waitForSelector('.renum');
  assert.equal(await page.locator('[data-renum-accept]').count(), 0);
  assert.equal(await page.locator('[data-renum-other]').count(), 1);
  assert.equal(await page.locator('[data-renum-scheme]').count(), 4);
  await page.click('[data-renum-other]');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'aiInput');
  await ctx.close();
});

test('T35.5 una versión sin cambios con espacios no invalida la propuesta; un cambio con espacios sí', async () => {
  const p = sampleProject();
  p.versions[0].version = '1.0 beta';
  const { page, ctx } = await openApp(browser, { seed: makeDb({ projects: [p] }) });
  const r = await page.evaluate(() => ({ ok: parseRenumber(getProject(), ['2 => 2.0']), mal: parseRenumber(getProject(), ['2 => dos puntos']) }));
  assert.equal(r.ok.length, 3);
  assert.equal(r.ok[0].new, '1.0 beta');
  assert.equal(r.mal, null);
  await ctx.close();
});

test('T35.6 un esquema rápido propone en local, sin llamar a la IA', async () => {
  const { page, ctx, aiRequests } = await openApp(browser, { ai: () => semver });
  await page.click('[data-ai-action="renumber"]');
  await page.waitForSelector('[data-renum-accept]');
  await page.click('[data-renum-scheme="calver"]');
  await page.waitForFunction(() => document.querySelectorAll('.renum').length === 2);
  assert.equal(aiRequests.length, 1); // only the first proposal
  assert.equal(await page.evaluate(() => getProject().chat.at(-1).meta.local), true);
  await ctx.close();
});

test('T35.7 proposeRenumber(extra, scheme): con scheme y sin extra es local; los esquemas desconocidos se descartan', async () => {
  const { page, ctx, aiRequests } = await openApp(browser, { ai: () => semver });
  const r = await page.evaluate(() => proposeRenumber('', 'int'));
  assert.deepEqual([r.ok, aiRequests.length], [true, 0]);
  await page.evaluate(() => proposeRenumber('', 'inventado'));
  assert.equal(aiRequests.length, 1);
  assert.ok(!aiRequests[0].messages.at(-1).content.includes('números enteros'));
  await ctx.close();
});
