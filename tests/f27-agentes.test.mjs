import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openApp, makeDb, sampleProject } from './helpers.mjs';

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });

// F27 · Agent review after F10 (rule 5): fields with data-agent, English API, AI and icon operations.
const api = (page, op, args) => page.evaluate(([o, a]) => window.BitacoraAPI[o](a), [op, args]);
const settle = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 30)))));
const seed = (o = {}) => makeDb({ projects: [sampleProject({ n: 3, ...o })] });
const text = async (page, id) => (await api(page, 'getVersion', { id })).data.instructions;
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

for (const lang of ['es', 'en']) {
  test(`T27.1 campos de texto y casilla de pendientes: data-agent estable y aria-label en el idioma de la interfaz (${lang})`, async () => {
    const { page, ctx } = await openApp(browser, { lang, seed: seed() });
    const a = (await api(page, 'addPending', { text: 'Revisar índice' })).data, b = (await api(page, 'addPending', { text: 'Probar exportación' })).data;
    await settle(page);
    const r = await page.evaluate(() => Object.fromEntries(['projectSearch', 'aiInput', 'commandInput', 'versionSearch', 'pendingAddInput'].map((id) => {
      const e = document.getElementById(id); return [id, e && { agent: e.dataset.agent, label: e.getAttribute('aria-label'), ph: e.placeholder }];
    })));
    assert.deepEqual(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v?.agent])),
      { projectSearch: 'project-search', aiInput: 'ai-input', commandInput: 'command-input', versionSearch: 'history-search', pendingAddInput: 'pending-input' });
    for (const [k, v] of Object.entries(r)) assert.ok((v.label || '').trim().length > 2, `${k} sin aria-label`);
    assert.equal(r.projectSearch.label, r.projectSearch.ph); assert.equal(r.commandInput.label, r.commandInput.ph);
    assert.equal(r.aiInput.label, lang === 'es' ? 'Mensaje para el asistente de IA' : 'Message to the AI assistant');
    const tg = await page.evaluate(() => [...document.querySelectorAll('[data-pending-toggle]')].map((e) => ({ agent: e.dataset.agent, target: e.dataset.target, label: e.getAttribute('aria-label') })));
    assert.deepEqual(tg, [{ agent: 'pending-toggle', target: a.id, label: 'Revisar índice' }, { agent: 'pending-toggle', target: b.id, label: 'Probar exportación' }]);
    await ctx.close();
  });
}

test('T27.1b al cambiar el idioma se reetiquetan los campos', async () => {
  const { page, ctx } = await openApp(browser, { lang: 'es', seed: seed() });
  const lbl = () => page.$eval('#aiInput', (e) => e.getAttribute('aria-label'));
  assert.equal(await lbl(), 'Mensaje para el asistente de IA');
  await page.click('#langEn'); await settle(page);
  assert.equal(await lbl(), 'Message to the AI assistant');
  await ctx.close();
});

test('T27.2 describe() y los mensajes de error salen siempre en inglés (interfaz en español), con código estable', async () => {
  const { page, ctx } = await openApp(browser, { lang: 'es', seed: seed() });
  const d = await page.evaluate(() => window.BitacoraAPI.describe());
  const names = d.operations.map((o) => o.name);
  for (const n of ['analyzeChanges', 'deleteAnalysis', 'askAI', 'rewriteText', 'applyRewrite', 'setProjectIcon']) assert.ok(names.includes(n), n);
  assert.ok(names.length >= 37, `${names.length} operaciones`);
  // Accents or common Spanish words: «booleanos» (no accents) once slipped into describe() while only accents were checked.
  const es = /[áéíóúñ¿¡]|\b(el|la|los|las|del|para|una|que|segun|booleanos?|obligatori[oa]s?|opcionales?|notas?|versiones|proyectos?|texto|todas?|cuando|tambien|tareas?|pendientes?)\b/i, limpio = (s) => String(s).replaceAll('Bitácora', 'Bitacora').replace(/\[\[[A-ZÑ]+\]\]/g, '');   // the [[PENDIENTE]] / [[HECHO]] / [[ELIMINAR]] markers are part of the AI protocol
  assert.deepEqual([d.convention, ...d.operations.flatMap((o) => [o.description, o.args])].filter((s) => es.test(limpio(s))), [], 'texto en español en describe()');
  const fallos = [['getProject', { id: 'x' }, 'project-not-found'], ['getVersion', { id: 'x' }, 'version-not-found'], ['askAI', {}, 'invalid-argument'],
    ['askAI', { action: 'x' }, 'invalid-argument'], ['rewriteText', { id: 'p1-v1', from: 5, to: 2, tone: 'concise' }, 'invalid-range'], ['analyzeChanges', { id: 'p1-v1' }, 'first-version'],
    ['setProjectIcon', { icon: 'x' }, 'invalid-icon'], ['setProjectIcon', { icon: 5 }, 'invalid-argument'], ['deleteProject', { id: 'p1' }, 'confirm-required'], ['applyRewrite', { messageId: 'x' }, 'proposal-not-found']];
  for (const [op, args, code] of fallos) {
    const r = await api(page, op, args);
    assert.equal(r.ok, false, op); assert.equal(r.error.code, code, op);
    assert.ok(!es.test(limpio(r.error.message)), `${op}: «${r.error.message}» en español`);
  }
  await ctx.close();
});

test('T27.3 sin proveedor de IA, las operaciones de IA fallan con ai-not-configured y no tocan nada', async () => {
  const { page, ctx } = await openApp(browser, { seed: seed() });
  assert.equal((await api(page, 'state')).data.ai, false);
  for (const [op, args] of [['analyzeChanges', { id: 'p1-v2' }], ['askAI', { action: 'summary' }], ['rewriteText', { id: 'p1-v1', from: 0, to: 5, tone: 'concise' }]]) {
    const r = await api(page, op, args); assert.equal(r.error?.code, 'ai-not-configured', op);
  }
  assert.equal((await api(page, 'getProject', {})).data.versions.length, 3);
  await ctx.close();
});

test('T27.4 analyzeChanges compara con la anterior, guarda solo con save, reutiliza lo guardado y deleteAnalysis lo borra', async () => {
  const { page, ctx, aiRequests } = await openApp(browser, { seed: seed(), ai: async () => 'RESULT: CHANGES\nSe añadió el paso de verificación.' });
  const id = 'p1-v2';
  let r = await api(page, 'analyzeChanges', { id });
  assert.deepEqual([r.ok, r.data?.status, r.data?.cached, r.data?.saved], [true, 'changes', false, false], JSON.stringify(r));
  assert.equal(aiRequests.length, 1); assert.equal((await api(page, 'getVersion', { id })).data.analyses, 0, 'sin save no se guarda');
  r = await api(page, 'analyzeChanges', { id, save: true });
  assert.deepEqual([r.data.saved, aiRequests.length], [true, 2]); const aid = r.data.analysisId; assert.ok(aid);
  r = await api(page, 'analyzeChanges', { id });
  assert.deepEqual([r.data.cached, r.data.analysisId, aiRequests.length], [true, aid, 2], 'reutiliza el guardado sin pedir');
  r = await api(page, 'analyzeChanges', { id, force: true });
  assert.deepEqual([r.data.cached, aiRequests.length], [false, 3]);
  r = await api(page, 'deleteAnalysis', { id });
  assert.deepEqual([r.ok, r.data?.deleted, r.data?.remaining], [true, aid, 0]);
  assert.equal((await api(page, 'deleteAnalysis', { id })).error.code, 'analysis-not-found');
  assert.equal((await api(page, 'analyzeChanges', { id: 'p1-v1' })).error.code, 'first-version');
  await ctx.close();
});

test('T27.5 askAI: texto y acción rápida pasan por el chat y los marcadores actualizan los pendientes', async () => {
  const { page, ctx, aiRequests } = await openApp(browser, { seed: seed(), ai: async () => 'Resumen listo.\n[[PENDIENTE: Revisar el índice]]' });
  let r = await api(page, 'askAI', { action: 'summary' });
  assert.equal(r.ok, true, JSON.stringify(r)); assert.match(r.data.reply, /Resumen listo/); assert.equal(r.data.pendingChanged, true);
  assert.deepEqual((await api(page, 'listPending', {})).data.map((x) => x.text), ['Revisar el índice']);
  assert.ok(await page.evaluate(() => getProject().chat.length >= 2), 'el intercambio queda en el chat');
  r = await api(page, 'askAI', { text: '¿Qué cambió en la última versión?' });
  assert.equal(r.ok, true); assert.equal(aiRequests.length, 2);
  assert.ok(JSON.stringify(aiRequests.at(-1)).includes('¿Qué cambió en la última versión?'));
  assert.equal((await api(page, 'state')).data.aiBusy, false);
  await ctx.close();
});

test('T27.6 askAI con historial largo usa las tandas de F26: una petición por tanda y devuelve la final', async () => {
  const { page, ctx, aiRequests } = await openApp(browser, { seed: seed({ words: 3400 }), ai: async () => `respuesta ${aiRequests.length}` });
  const n = await page.evaluate(() => contextBatches().length);
  assert.ok(n >= 2, `tandas ${n}`);
  const r = await api(page, 'askAI', { action: 'changes' });
  assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(aiRequests.length, n); assert.equal(r.data.reply, `respuesta ${n}`);
  await ctx.close();
});

test('T27.7 rewriteText propone sin tocar la nota; applyRewrite la aplica y la rechaza si el fragmento cambió', async () => {
  const { page, ctx } = await openApp(browser, { seed: seed(), ai: async () => 'Fragmento ajustado' });
  const orig = await text(page, 'p1-v1');
  let r = await api(page, 'rewriteText', { id: 'p1-v1', from: 0, to: 13, tone: 'concise' });
  assert.equal(r.ok, true, JSON.stringify(r)); assert.deepEqual([r.data.text, r.data.original], ['Fragmento ajustado', orig.slice(0, 13)]);
  assert.equal(await text(page, 'p1-v1'), orig, 'la nota no cambia hasta applyRewrite');
  const a = await api(page, 'applyRewrite', { messageId: r.data.messageId });
  assert.equal(a.ok, true); assert.equal(a.data.instructions, 'Fragmento ajustado' + orig.slice(13));
  r = await api(page, 'rewriteText', { id: 'p1-v2', from: 0, to: 13, instruction: 'Hazlo más corto' });
  assert.equal(r.ok, true, JSON.stringify(r));
  await page.evaluate(() => { getProject().versions[1].instructions = 'otro texto distinto'; });
  assert.equal((await api(page, 'applyRewrite', { messageId: r.data.messageId })).error.code, 'text-changed');
  for (const [args, code] of [[{ id: 'p1-v1', from: 3, to: 3, tone: 'concise' }, 'invalid-range'], [{ id: 'p1-v1', from: 0, to: 5, tone: 'x' }, 'invalid-argument']])
    assert.equal((await api(page, 'rewriteText', args)).error.code, code);
  await ctx.close();
});

test('T27.8 setProjectIcon guarda la imagen como WebP, la quita con "" y rechaza lo que no es imagen', async () => {
  const { page, ctx } = await openApp(browser, { seed: seed() });
  let r = await api(page, 'setProjectIcon', { icon: PNG });
  assert.deepEqual([r.ok, r.data?.hasIcon], [true, true], JSON.stringify(r));
  assert.ok((await page.evaluate(() => getProject().icon)).startsWith('data:image/webp;base64,'));
  assert.equal((await api(page, 'listProjects')).data[0].hasIcon, true);
  r = await api(page, 'setProjectIcon', { icon: '' });
  assert.deepEqual([r.ok, r.data?.hasIcon], [true, false]);
  assert.equal((await api(page, 'setProjectIcon', { icon: 'data:text/html;base64,AAAA' })).error.code, 'invalid-icon');
  await ctx.close();
});

test('T27.9 rewriteText: si la IA solo devuelve un encabezado (vacío tras sanearlo) no hay propuesta que aplicar y devuelve ai-error', async () => {
  const { page, ctx } = await openApp(browser, { seed: seed(), ai: async () => 'Texto reescrito' });
  const orig = await text(page, 'p1-v1');
  const r = await api(page, 'rewriteText', { id: 'p1-v1', from: 0, to: 13, tone: 'concise' });
  assert.equal(r.error?.code, 'ai-error', JSON.stringify(r)); assert.ok(!/[áéíóúñ]/i.test(r.error.message), r.error.message);
  assert.equal(await page.evaluate(() => getProject().chat.some((m) => m.kind === 'rewrite-result')), false, 'no debe haber propuesta vacía');
  assert.equal(await page.evaluate(() => !!document.querySelector('[data-ai-apply]')), false, 'ni botón de aplicar');
  assert.equal(await text(page, 'p1-v1'), orig);
  await ctx.close();
});
