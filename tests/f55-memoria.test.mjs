// F55 · Assistant memory: «Importar memoria» and «Exportar memoria» buttons in the AI panel header, and the exportMemory / importMemory operations.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { launch, openApp, makeDb, sampleProject } from './helpers.mjs';

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });

const TS = new Date(2026, 1, 1).toISOString();
const msg = (id, role, text) => ({ id, role, text, ts: TS });
const proj = (id, name, chat) => ({ ...sampleProject({ id, name, n: 1 }), chat });
const seed = () => makeDb({ projects: [
  proj('p1', 'Alfa', [msg('a1', 'user', 'hola alfa'), msg('a2', 'assistant', 'qué tal')]),
  proj('p2', 'Beta', [msg('b1', 'user', 'hola beta')]),
] });
const chatOf = (page, id) => page.evaluate((i) => db.projects.find((p) => p.id === i).chat.map((m) => m.text), id);
const AMBITO = { project: 0, all: 1 };

/** Clicks «Exportar memoria», picks the scope and returns the downloaded file. */
async function bajar(page, ambito) {
  await page.click('#aiMemExport');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click(`[data-modal-action="${AMBITO[ambito]}"]`)]);
  return { name: dl.suggestedFilename(), raw: fs.readFileSync(await dl.path(), 'utf8') };
}
/** Clicks «Importar memoria», picks the scope and supplies `contenido` to the file chooser. */
async function importar(page, ambito, contenido) {
  await page.click('#aiMemImport');
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click(`[data-modal-action="${AMBITO[ambito]}"]`)]);
  await fc.setFiles({ name: 'memoria.json', mimeType: 'application/json', buffer: Buffer.from(typeof contenido === 'string' ? contenido : JSON.stringify(contenido)) });
}
const memoria = (...projects) => ({ kind: 'bitacora-memory', schema: 1, scope: 'all', projects });

test('T55.1 Importar y Exportar memoria (38 px) a la izquierda de Limpiar chat y Cerrar panel (34 px); nombre accesible y data-agent en ES y EN; cabecera sin recortes', async () => {
  const nombres = { es: ['Importar memoria', 'Exportar memoria'], en: ['Import memory', 'Export memory'] };
  for (const lang of ['es', 'en']) {
    const { page, ctx, errors } = await openApp(browser, { seed: seed(), lang });
    const d = await page.evaluate(() => [...document.querySelectorAll('.ai-head-actions .btn')].map((b) => {
      const r = b.getBoundingClientRect();
      return { id: b.id, w: r.width, h: r.height, ic: b.querySelector('svg').getBoundingClientRect().width, x: r.x, label: b.getAttribute('aria-label'), title: b.title, agent: b.dataset.agent };
    }));
    assert.deepEqual(d.map((b) => b.id), ['aiMemImport', 'aiMemExport', 'aiClear', 'aiClose'], 'orden');
    for (const b of d.slice(0, 2)) { assert.equal(b.w, 38, `${lang} ${b.id} ancho`); assert.equal(b.h, 38, `${lang} ${b.id} alto`); assert.equal(b.ic, 19, `${lang} ${b.id} icono`); }
    for (const b of d.slice(2)) { assert.equal(b.w, 34, `${lang} ${b.id} ancho`); assert.equal(b.h, 34, `${lang} ${b.id} alto`); assert.equal(b.ic, 17, `${lang} ${b.id} icono`); }
    assert.deepEqual(d.slice(0, 2).map((b) => b.label), nombres[lang]);
    assert.deepEqual(d.slice(0, 2).map((b) => b.title), nombres[lang]);
    assert.deepEqual(d.slice(0, 2).map((b) => b.agent), ['ai-memory-import', 'ai-memory-export']);
    assert.equal(new Set(d.map((b) => b.label)).size, 4, 'etiquetas únicas');
    const c = await page.evaluate(() => {
      const h = document.querySelector('.ai-header').getBoundingClientRect(), ti = document.getElementById('aiTitle'), pr = document.getElementById('aiProviderLabel');
      return { alto: h.height, titulo: ti.scrollWidth <= ti.clientWidth, prov: pr.scrollWidth <= pr.clientWidth, dentro: [...document.querySelectorAll('.ai-head-actions .btn')].every((b) => b.getBoundingClientRect().right <= h.right + 0.5), arriba: ti.getBoundingClientRect().bottom <= pr.getBoundingClientRect().top + 1 };
    });
    assert.ok(c.titulo && c.prov && c.dentro && c.arriba && c.alto < 100, `${lang}: ${JSON.stringify(c)}`);
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});

test('T55.2 exportar: «Este proyecto» o «Todos los proyectos» bajan un JSON solo con los chats (sin notas ni claves API); un chat vacío no baja nada', async () => {
  const s = seed();
  s.settings.providers = { openai: { key: 'sk-SECRETA-123' } };
  const { page, ctx, errors } = await openApp(browser, { seed: s });
  assert.equal(await page.evaluate(() => getProject().id), 'p1');
  const uno = await bajar(page, 'project');
  assert.match(uno.name, /^bitacora-memoria-Alfa-\d{4}-\d{2}-\d{2}\.json$/);
  const j1 = JSON.parse(uno.raw);
  assert.deepEqual([j1.kind, j1.schema, j1.scope, j1.projects.length], ['bitacora-memory', 1, 'project', 1]);
  assert.deepEqual([j1.projects[0].id, j1.projects[0].name, j1.projects[0].chat.map((m) => m.text)], ['p1', 'Alfa', ['hola alfa', 'qué tal']]);
  const todos = await bajar(page, 'all');
  assert.match(todos.name, /^bitacora-memoria-todos-\d{4}-\d{2}-\d{2}\.json$/);
  const j2 = JSON.parse(todos.raw);
  assert.deepEqual([j2.scope, j2.projects.map((p) => p.id)], ['all', ['p1', 'p2']]);
  for (const raw of [uno.raw, todos.raw]) {
    assert.ok(!raw.includes('SECRETA') && !/api.?key/i.test(raw), 'sin claves API');
    assert.ok(!raw.includes('nota1palabra1'), 'sin el texto de las notas');
    assert.deepEqual(Object.keys(JSON.parse(raw).projects[0]).sort(), ['chat', 'id', 'name']);
  }
  await page.evaluate(() => { for (const p of db.projects) p.chat = []; });
  await page.click('#aiMemExport');
  let bajo = false; page.once('download', () => { bajo = true; });
  await page.click('[data-modal-action="1"]');
  await page.waitForTimeout(500);
  assert.equal(bajo, false, 'sin mensajes no hay descarga');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('T55.3 importar: reemplazar, añadir (sin duplicar ids), Deshacer, emparejado por id y por nombre, mensajes saneados', async () => {
  const { page, ctx, errors } = await openApp(browser, { seed: seed() });
  const hist = () => chatOf(page, 'p1');
  // Append: a message whose id is already present is not duplicated.
  await importar(page, 'project', memoria({ id: 'p1', name: 'Alfa', chat: [msg('a1', 'user', 'hola alfa'), msg('a3', 'user', 'nuevo')] }));
  await page.waitForSelector('.modal-box');
  await page.click('[data-modal-action="1"]');
  assert.deepEqual(await hist(), ['hola alfa', 'qué tal', 'nuevo']);
  await page.click('#toastAction');
  assert.deepEqual(await hist(), ['hola alfa', 'qué tal'], 'Deshacer restaura el chat anterior');
  // Replace + Undo.
  await importar(page, 'project', memoria({ id: 'p1', name: 'Alfa', chat: [msg('x1', 'user', 'solo esto')] }));
  await page.waitForSelector('.modal-box');
  await page.click('[data-modal-action="0"]');
  assert.deepEqual(await hist(), ['solo esto']);
  await page.click('#toastAction');
  assert.deepEqual(await hist(), ['hola alfa', 'qué tal']);
  // All: p1 by id, p2 by name (case-insensitive); «Gamma» does not exist and is not created.
  await importar(page, 'all', memoria({ id: 'p1', name: 'otro nombre', chat: [msg('n1', 'user', 'alfa nuevo')] }, { id: 'zzz', name: ' BETA ', chat: [msg('n2', 'assistant', 'beta nuevo')] }, { id: 'g', name: 'Gamma', chat: [msg('n3', 'user', 'perdido')] }));
  await page.waitForSelector('.modal-box');
  await page.click('[data-modal-action="0"]');
  assert.deepEqual([await hist(), await chatOf(page, 'p2')], [['alfa nuevo'], ['beta nuevo']]);
  assert.equal(await page.evaluate(() => db.projects.length), 2, 'no se crean proyectos');
  assert.match(await page.textContent('#toast'), /2 mensajes en 2 proyecto/);
  await page.click('#toastAction');
  assert.deepEqual([await hist(), await chatOf(page, 'p2')], [['hola alfa', 'qué tal'], ['hola beta']]);
  // Empty target: imported without asking. Messages are sanitized like normalizeDb.
  await page.evaluate(() => { getProject().chat = []; });
  await importar(page, 'project', memoria({ id: 'p1', name: 'Alfa', chat: [{ id: 'm1', role: 'hacker', text: 'rol raro', meta: { k: 1 } }, { id: 'm2', role: 'user' }, null, { role: 'assistant', text: 5 }] }));
  await page.waitForSelector('#toastAction');
  const m = await page.evaluate(() => getProject().chat.map((x) => ({ role: x.role, text: x.text, ok: !!x.id && !!x.ts, meta: x.meta })));
  assert.deepEqual(m, [{ role: 'system', text: 'rol raro', ok: true, meta: { k: 1 } }, { role: 'assistant', text: '5', ok: true, meta: undefined }]);
  assert.equal(await page.locator('.modal-box').count(), 0, 'sin diálogo con el chat vacío');
  // Unusable files: a warning and nothing changes.
  const antes = await chatOf(page, 'p2');
  for (const [raro, aviso] of [['{no es json', /no es una memoria/], [JSON.stringify({ kind: 'otro', projects: [] }), /no es una memoria/], [JSON.stringify(memoria({ id: 'q', name: 'Otro', chat: [msg('z', 'user', 'x')] }, { id: 'r', name: 'Otro2', chat: [] })), /Ningún proyecto/]]) {
    await importar(page, 'project', raro);
    await page.waitForFunction((re) => new RegExp(re).test(document.getElementById('toast').textContent), aviso.source);
  }
  assert.deepEqual(await chatOf(page, 'p2'), antes);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('T55.4 API: exportMemory e importMemory en describe() (≥ 42 operaciones); replace sobre un chat con contenido pide confirm; errores estables', async () => {
  const { page, ctx, errors } = await openApp(browser, { seed: seed() });
  const api = (op, args) => page.evaluate(([o, a]) => BitacoraAPI[o](a), [op, args]);
  const ops = await page.evaluate(() => BitacoraAPI.describe().operations);
  assert.ok(ops.length >= 42);
  for (const n of ['exportMemory', 'importMemory']) assert.ok(ops.find((o) => o.name === n && o.description && /^[\x20-\x7e]+$/.test(o.description)), `${n} descrito en inglés`);
  const todo = await api('exportMemory', { all: true });
  assert.deepEqual([todo.ok, todo.data.scope, todo.data.projects.map((p) => p.id)], [true, 'all', ['p1', 'p2']]);
  const dos = await api('exportMemory', { projectId: 'p2' });
  assert.deepEqual([dos.data.scope, dos.data.projects.map((p) => p.name)], ['project', ['Beta']]);
  assert.equal((await api('exportMemory', { projectId: 'nada' })).error.code, 'project-not-found');
  assert.ok(!JSON.stringify(todo).includes('nota1palabra1'), 'sin notas');
  const [dl] = await Promise.all([page.waitForEvent('download'), api('exportMemory', { download: true })]);
  assert.match(dl.suggestedFilename(), /^bitacora-memoria-Alfa-/);
  const file = JSON.stringify(dos.data);
  assert.equal((await api('importMemory', { json: file })).error.code, 'invalid-argument', 'mode obligatorio');
  assert.equal((await api('importMemory', { json: file, mode: 'replace', projectId: 'p1' })).error.code, 'confirm-required');
  assert.deepEqual(await chatOf(page, 'p1'), ['hola alfa', 'qué tal'], 'sin confirm no cambia nada');
  const r = await api('importMemory', { json: file, mode: 'replace', projectId: 'p1', confirm: true });
  assert.deepEqual([r.ok, r.data.projects, r.data.messages], [true, 1, 1]);
  assert.deepEqual(await chatOf(page, 'p1'), ['hola beta'], 'el JSON de Beta se empareja con Alfa porque el archivo solo trae un proyecto');
  const a = await api('importMemory', { json: todo.data, mode: 'append', all: true });
  assert.deepEqual([a.ok, a.data.projects, a.data.messages], [true, 2, 2 + 0], 'añadir no pide confirm');
  assert.deepEqual(await chatOf(page, 'p1'), ['hola beta', 'hola alfa', 'qué tal']);
  assert.equal((await api('importMemory', { json: '{roto', mode: 'append' })).error.code, 'invalid-json');
  assert.equal((await api('importMemory', { json: { kind: 'x', projects: [] }, mode: 'append' })).error.code, 'invalid-file');
  assert.equal((await api('importMemory', { json: memoria({ id: 'q', name: 'Q', chat: [] }), mode: 'append', all: true })).error.code, 'nothing-to-import');
  assert.deepEqual(errors, []);
  await ctx.close();
});
