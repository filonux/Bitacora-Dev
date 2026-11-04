// F66 · Pending tasks under the assistant's control: numbered list as in the UI, complete actions and local commands.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openApp, makeDb, sampleProject } from './helpers.mjs';
import { pedir, ultimoAsistente } from './helpers-asistente.mjs';

let browser;
let reply = '';
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });

const SELLO = '2026-02-01T10:00:00.000Z';
const TAREAS = [
  ['t1', 'Alertar si la verificación semanal tarda más de 3 h', false],
  ['t2', 'Documentar la conmutación a la región secundaria', false],
  ['t3', 'Repetir el simulacro de restauración total', false],
  ['t4', 'Revisar la política de retención', true],
];
const proyecto = () => ({
  ...sampleProject({ id: 'p1', name: 'Stratus Backup', n: 3, words: 40 }),
  pending: TAREAS.map(([id, text, done]) => ({ id, text, done, source: 'manual', createdAt: SELLO })),
});
const abrir = (lang = 'es') => openApp(browser, { seed: makeDb({ projects: [proyecto()] }), lang, ai: async () => reply });
const abiertos = (page) => page.evaluate(() => getProject().pending.filter((x) => !x.done).map((x) => x.id));
const textos = (page) => page.evaluate(() => getProject().pending.filter((x) => !x.done).map((x) => x.text));
const hechos = (page) => page.evaluate(() => getProject().pending.filter((x) => x.done).map((x) => x.id).sort());
/** Order of the open rows as the person sees them in the Pendientes list. */
const filas = (page) => page.evaluate(() => [...document.querySelectorAll('#pendingList .pending-item:not(.done) span')].map((e) => e.textContent.trim()));
/** The row of pending item `id` is inside the screen. */
const aLaVista = (page, id) => page.evaluate((id) => {
  const r = document.querySelector(`[data-pending-toggle="${id}"]`)?.closest('.pending-item')?.getBoundingClientRect();
  return !!r && r.width > 0 && r.top >= 0 && r.bottom <= innerHeight;
}, id);

test('T66.1 las acciones del chat gestionan la lista: listar, añadir en una posición, editar, marcar hecho, reabrir, mover y quitar (por número, #n, texto o id)', async () => {
  const { page, errors } = await abrir();
  const acc = (marcador) => { reply = `[[ACCION: ${marcador}]]`; return pedir(page, 'haz algo con los pendientes'); };

  let a = await acc('list-pending');
  assert.equal(a.state, 'ok', a.result);
  assert.equal(a.name, 'list-pending');
  assert.match(a.result, /Stratus Backup: 3\/4/);
  assert.equal(await ultimoAsistente(page), `1. ${TAREAS[0][1]}\n2. ${TAREAS[1][1]}\n3. ${TAREAS[2][1]}\n✓ ${TAREAS[3][1]}`);

  a = await acc('add-pending text="Probar la restauración en frío" position=2');
  assert.equal(a.state, 'ok', a.result);
  assert.match(a.result, /: 2\. Probar la restauración en frío$/);
  assert.deepEqual(await abiertos(page), ['t1', await page.evaluate(() => getProject().pending[1].id), 't2', 't3']);
  const nuevo = (await abiertos(page))[1];
  assert.deepEqual(await filas(page), [TAREAS[0][1], 'Probar la restauración en frío', TAREAS[1][1], TAREAS[2][1]]);
  assert.ok(await aLaVista(page, nuevo), 'la fila nueva queda a la vista');

  a = await acc('edit-pending pending=3 text="Documentar la conmutación manual"'); // the 3rd open item is t2
  assert.equal(a.state, 'ok', a.result);
  assert.match(a.result, /: 3\. Documentar la conmutación manual$/);
  assert.equal((await textos(page))[2], 'Documentar la conmutación manual');

  a = await acc('done-pending pending="#1"');
  assert.equal(a.state, 'ok', a.result);
  assert.match(a.result, /: ✓ Alertar si la verificación/);
  assert.deepEqual(await abiertos(page), [nuevo, 't2', 't3']);
  assert.deepEqual(await hechos(page), ['t1', 't4']);

  a = await acc('done-pending pending="Alertar si la verificación semanal" done=false'); // by text; reopens
  assert.equal(a.state, 'ok', a.result);
  assert.match(a.result, /: ↺ Alertar si la verificación/);
  assert.deepEqual(await abiertos(page), [nuevo, 't2', 't3', 't1'], 'reabrir deja la tarea al final de las abiertas');
  assert.deepEqual(await hechos(page), ['t4']);

  a = await acc('move-pending pending=4 to=first');
  assert.match(a.result, /: 1\. Alertar si la verificación/);
  assert.deepEqual(await abiertos(page), ['t1', nuevo, 't2', 't3']);
  a = await acc('move-pending pending=1 to=down');
  assert.deepEqual(await abiertos(page), [nuevo, 't1', 't2', 't3']);
  a = await acc('move-pending pending=2 to=last');
  assert.deepEqual(await abiertos(page), [nuevo, 't2', 't3', 't1']);
  a = await acc('move-pending pending=t3 to=2');
  assert.deepEqual(await abiertos(page), [nuevo, 't3', 't2', 't1']);
  assert.deepEqual(await filas(page), (await textos(page)), 'la lista que ve la persona es la del dato');
  assert.ok(await aLaVista(page, 't3'), 'la fila movida queda a la vista');

  a = await acc('remove-pending pending=t4'); // a done one, by id
  assert.equal(a.state, 'ok', a.result);
  a = await acc('remove-pending pending="#2"');
  assert.equal(a.state, 'ok', a.result);
  assert.deepEqual(await abiertos(page), [nuevo, 't2', 't1']);
  assert.deepEqual(await hechos(page), []);

  for (const m of ['done-pending pending=9', 'move-pending pending=1 to=banana', 'remove-pending pending="no existe esa tarea"', 'edit-pending pending=1']) {
    a = await acc(m);
    assert.equal(a.state, 'err', `${m} → ${a.result}`);
  }
  assert.deepEqual(await abiertos(page), [nuevo, 't2', 't1'], 'los errores no tocan la lista');
  assert.deepEqual(errors, []);
});

test('T66.2 «Extraer pendientes» y [[PENDIENTE n: …]] enseñan en el chat la numeración real de la lista (✓ las hechas)', async () => {
  const { page, errors } = await abrir();
  reply = `- ${TAREAS[1][1]}\n- Probar la restauración en frío\n- ${TAREAS[3][1]}`; // an existing open one, a new one and a done one
  await page.evaluate(() => aiAction('pending'));
  await page.waitForFunction(() => getProject().chat.some((m) => m.role === 'assistant' && /Probar la restauración/.test(m.text)));
  assert.equal(await ultimoAsistente(page), `2. ${TAREAS[1][1]}\n4. Probar la restauración en frío\n✓ ${TAREAS[3][1]}`);
  assert.deepEqual((await textos(page)).slice(2), [TAREAS[2][1], 'Probar la restauración en frío'], 'la nueva va tras las abiertas; la que ya estaba no se duplica');
  assert.equal(await page.evaluate(() => getProject().pending.length), 5);

  reply = 'Anotado. [[PENDIENTE 1: Revisar los logs de anoche]]';
  await page.fill('#aiInput', 'apunta una tarea urgente');
  await page.click('#aiSend');
  await page.waitForFunction(() => getProject().pending.some((x) => /logs de anoche/.test(x.text)));
  await page.waitForFunction(() => !aiBusy);
  const texto = await ultimoAsistente(page);
  assert.match(texto, /^Anotado\.\s+1\. Revisar los logs de anoche$/);
  assert.equal((await textos(page))[0], 'Revisar los logs de anoche');
  // each «n. text» in the chat is row n of the UI list
  const visibles = await filas(page);
  for (const [, n, t] of texto.matchAll(/^(\d+)\. (.+)$/gm)) assert.equal(visibles[n - 1], t);
  assert.deepEqual(errors, []);
});

test('T66.3 órdenes locales con cifras y con palabras (ES y EN): mueven, marcan, quitan, añaden y listan sin llamar al modelo; un número que no existe lo decide el modelo', async () => {
  const { page, aiRequests, errors } = await abrir();
  const a = async (texto, nombre) => { const r = await pedir(page, texto); assert.equal(r.state, 'ok', `${texto} → ${r.result}`); assert.equal(r.name, nombre, texto); return r; };

  await a('sube el pendiente 3', 'move-pending');
  assert.deepEqual(await abiertos(page), ['t1', 't3', 't2']);
  assert.ok(await aLaVista(page, 't3'));
  await a('el pendiente dos pase a la última posición', 'move-pending');
  assert.deepEqual(await abiertos(page), ['t1', 't2', 't3']);
  await a('pon el pendiente tres en la posición 1', 'move-pending');
  assert.deepEqual(await abiertos(page), ['t3', 't1', 't2']);
  await a('baja el pendiente 1', 'move-pending');
  assert.deepEqual(await abiertos(page), ['t1', 't3', 't2']);
  await a('marca el pendiente 1 como hecho', 'done-pending');
  assert.deepEqual(await abiertos(page), ['t3', 't2']);
  await a('añade el pendiente «Probar la restauración en frío»', 'add-pending');
  assert.deepEqual(await textos(page), [TAREAS[2][1], TAREAS[1][1], 'Probar la restauración en frío']);
  const nuevo = (await abiertos(page)).at(-1);
  await a('quita el pendiente 2', 'remove-pending');
  assert.deepEqual(await abiertos(page), ['t3', nuevo]);
  const l = await a('lista los pendientes', 'list-pending');
  assert.match(l.result, /Stratus Backup: 2\/4/);
  assert.equal(aiRequests.length, 0, 'ninguna llegó al modelo');

  for (const t of ['el pendiente 9 pasa a la primera', 'sube el pendiente', 'marca el pendiente 7 como hecho', 'qué pendiente va primero']) {
    assert.equal(await page.evaluate((x) => localActionCalls(x), t), null, t);
  }
  reply = 'Ese pendiente no existe: solo hay dos abiertos.';
  await page.fill('#aiInput', 'el pendiente 9 pasa a la primera');
  await page.click('#aiSend');
  await page.waitForFunction(() => getProject().chat.some((m) => m.role === 'assistant' && /no existe/.test(m.text)));
  assert.equal(aiRequests.length, 1, 'el número fuera de rango se deja al modelo');

  const en = await abrir('en');
  const e = async (texto, nombre) => { const r = await pedir(en.page, texto); assert.equal(r.state, 'ok', `${texto} → ${r.result}`); assert.equal(r.name, nombre, texto); return r; };
  await e('move pending 2 to first', 'move-pending');
  assert.deepEqual(await abiertos(en.page), ['t2', 't1', 't3']);
  await e('move task 1 to the last position', 'move-pending');
  assert.deepEqual(await abiertos(en.page), ['t1', 't3', 't2']);
  await e('mark pending 1 as done', 'done-pending');
  assert.deepEqual(await hechos(en.page), ['t1', 't4']);
  await e('add the task «Test the cold restore»', 'add-pending');
  assert.equal((await textos(en.page)).at(-1), 'Test the cold restore');
  const nuevoEn = (await abiertos(en.page)).at(-1);
  await e('remove task 1', 'remove-pending');
  assert.deepEqual(await abiertos(en.page), ['t2', nuevoEn]);
  await e('list the pending tasks', 'list-pending');
  assert.equal(en.aiRequests.length, 0);
  assert.deepEqual(errors, []); assert.deepEqual(en.errors, []);
});
