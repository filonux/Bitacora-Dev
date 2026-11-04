// F26 · Long AI-chat history sent in batches (older versions are not discarded).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openApp, makeDb, sampleProject, stored } from './helpers.mjs';

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });

const big = () => makeDb({ projects: [sampleProject({ n: 64, words: 200 })] }); // ≈ 205 000 characters of context
/** Mock AI: intermediate batches return partial findings (with a marker that must be ignored); the last one returns the consolidated answer. `fail` = number of the request that returns empty. */
const mock = (fail = 0) => { let k = 0; return (messages) => {
  const user = messages.at(-1).content;
  if (++k === fail) return '';
  const m = user.match(/(?:TANDA|BATCH)\s+(?:FINAL\s+)?(\d+)\s+(?:DE|OF)\s+\d+/);
  if (!m) return 'Respuesta única.';
  return /TANDA FINAL|FINAL BATCH/.test(user) ? 'Respuesta final consolidada.\n[[PENDIENTE: tarea final]]' : `Hallazgos parciales ${m[1]}.\n[[PENDIENTE: tarea parcial ${m[1]}]]`;
}; };
async function ask(page, q) {
  if (!(await page.locator('#aiInput').isVisible())) await page.click('#aiToggle');
  await page.fill('#aiInput', q);
  await page.click('#aiSend');
  await page.waitForFunction(() => !aiBusy && !document.querySelector('.msg-typing'));
}
const msgs = (page) => page.$$eval('#aiMessages .msg.assistant .msg-text', (els) => els.map((e) => e.textContent));
const pendings = (page) => page.evaluate(() => getProject().pending.map((x) => x.text));

test('T26.1 contextBatches: tandas consecutivas y equilibradas, cada versión una sola vez y ≤ 90 000 caracteres', async () => {
  const { page, ctx } = await openApp(browser, { seed: big() });
  const r = await page.evaluate(() => {
    const b = contextBatches(), vs = getProject().versions.map((v) => v.version);
    return { b: b.map((x) => ({ from: x.from, to: x.to, len: x.text.length })), veces: vs.map((v) => b.filter((x) => x.text.includes(`[Versión ${v} |`)).length), total: vs.length };
  });
  assert.ok(r.b.length >= 2 && r.b.length <= 4, `tandas: ${r.b.length}`);
  assert.equal(r.b[0].from, 0); assert.equal(r.b.at(-1).to, r.total - 1);
  r.b.forEach((x, i) => { if (i) assert.equal(x.from, r.b[i - 1].to + 1, 'tandas no consecutivas'); assert.ok(x.len <= 90000, `tanda ${i + 1}: ${x.len}`); });
  assert.ok(r.veces.every((n) => n === 1), 'una versión falta o se repite');
  const lens = r.b.map((x) => x.len);
  assert.ok(Math.max(...lens) - Math.min(...lens) <= 7000, `desequilibrio: ${lens}`);
  await ctx.close();
});

test('T26.1b si el historial cabe: una sola tanda con el contexto completo, una sola petición y sin aviso', async () => {
  const { page, ctx, aiRequests } = await openApp(browser, { ai: mock() });
  const r = await page.evaluate(() => ({ n: contextBatches().length, igual: contextBatches()[0].text === contextText() }));
  assert.deepEqual(r, { n: 1, igual: true });
  assert.equal(await page.locator('.context-warning').count(), 0);
  await ask(page, 'resume');
  assert.equal(aiRequests.length, 1);
  assert.deepEqual(await msgs(page), ['Respuesta única.']);
  await ctx.close();
});

test('T26.2 el chat envía n tandas, muestra cada resultado al terminar y solo la final toca los pendientes', async () => {
  const { page, ctx, aiRequests } = await openApp(browser, { seed: big(), ai: mock() });
  const n = await page.evaluate(() => contextBatches().length);
  await ask(page, 'Analiza todo el historial');
  assert.equal(aiRequests.length, n);
  const users = aiRequests.map((r) => r.messages.at(-1).content);
  users.forEach((u, k) => { assert.match(u, new RegExp(`TANDA ${k === n - 1 ? 'FINAL ' : ''}${k + 1} DE ${n}`)); if (k) assert.ok(u.includes(`Hallazgos parciales ${k}.`), `la tanda ${k + 1} no recibe los hallazgos de la anterior`); });
  assert.ok(!users[0].includes('HALLAZGOS DE LAS TANDAS ANTERIORES'));
  for (let v = 1; v <= 64; v++) assert.equal(users.filter((u) => u.includes(`nota${v}palabra1 `)).length, 1, `la versión ${v} no viaja exactamente una vez`);
  const out = await msgs(page);
  assert.equal(out.length, n);
  out.slice(0, -1).forEach((m, k) => { assert.match(m, new RegExp(`^Tanda ${k + 1} de ${n} · 1\\.\\d+ → 1\\.\\d+`)); assert.ok(!m.includes('[[')); });
  assert.match(out[0], /^Tanda 1 de \d+ · 1\.0 → /); assert.match(out.at(-1), /^Respuesta final consolidada\./);
  assert.deepEqual(await pendings(page), ['tarea final'], 'las tandas parciales no deben tocar los pendientes');
  assert.equal((await stored(page)).projects[0].chat.filter((m) => m.meta?.partial).length, n - 1);
  await ctx.close();
});

test('T26.3 las tandas parciales no entran en el historial de la siguiente pregunta', async () => {
  const { page, ctx, aiRequests } = await openApp(browser, { seed: big(), ai: mock() });
  const n = await page.evaluate(() => contextBatches().length);
  await ask(page, 'primera'); await ask(page, 'segunda');
  assert.equal(aiRequests.length, 2 * n);
  for (const r of aiRequests.slice(n)) {
    const hist = JSON.stringify(r.messages.slice(0, -1));
    assert.ok(!hist.includes('Hallazgos parciales'), 'una tanda parcial entró en el historial');
    assert.ok(hist.includes('Respuesta final consolidada'), 'falta la respuesta final anterior');
  }
  await ctx.close();
});

test('T26.4 si una tanda falla se conservan las anteriores, se muestra el error y no se tocan los pendientes', async () => {
  const { page, ctx, aiRequests } = await openApp(browser, { seed: big(), ai: mock(2) });
  await ask(page, 'Analiza todo');
  assert.equal(aiRequests.length, 2, 'no debe pedir más tandas tras el fallo');
  const out = await msgs(page);
  assert.equal(out.length, 2);
  assert.match(out[0], /^Tanda 1 de \d+/);
  assert.match(out[1], /^Error: La tanda 2 de \d+ .*falló.*Se conservan/);
  assert.deepEqual(await pendings(page), []);
  assert.equal(await page.locator('#aiSend').isDisabled(), false);
  await ctx.close();
});

for (const [lang, aviso, titulo] of [['es', /3 tandas consecutivas/, /^Tanda 1 de 3 · 1\.0 → /], ['en', /3 consecutive batches/, /^Batch 1 of 3 · 1\.0 → /]]) {
  test(`T26.5 aviso del panel y títulos de tanda en ${lang.toUpperCase()}, sin «27 de 64»`, async () => {
    const { page, ctx } = await openApp(browser, { seed: big(), lang, ai: mock() });
    await page.click('#aiToggle').catch(() => {});
    const w = await page.locator('.context-warning').first().textContent();
    assert.match(w, aviso); assert.doesNotMatch(w, /27 de|of 64 versions were included/);
    await ask(page, 'Analyze everything');
    assert.match((await msgs(page))[0], titulo);
    await ctx.close();
  });
}
