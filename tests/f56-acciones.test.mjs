// F56 · The assistant drives the program: «[[ACCION: …]]» is removed from the text and run by ASSISTANT_ACTIONS; the result stays in the chat as a card.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { launch, openApp, makeDb, sampleProject } from './helpers.mjs';

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });

const seed = () => makeDb({ projects: [sampleProject({ id: 'p1', name: 'Pulsar Observability', n: 2 }), sampleProject({ id: 'p2', name: 'Gamma', n: 1 })] });
let reply = '';
const abrir = () => openApp(browser, { seed: seed(), ai: async () => reply });
const enviar = async (page, texto, resp) => { reply = resp; await page.fill('#aiInput', texto); await page.click('#aiSend'); };
/** Sends `texto` to the assistant (which answers `resp`) and returns the new action card (text + meta) once it is no longer running. */
async function pedir(page, texto, resp) {
  const pid = await page.evaluate(() => getProject().id);
  const cuenta = (i) => db.projects.find((p) => p.id === i).chat.filter((m) => m.kind === 'action').length;
  const n = await page.evaluate(cuenta, pid);
  await enviar(page, texto, resp);
  const h = await page.waitForFunction(({ i, n }) => {
    const a = db.projects.find((p) => p.id === i).chat.filter((m) => m.kind === 'action');
    return a.length > n && a[a.length - 1].meta.state !== 'run' ? { text: a[a.length - 1].text, ...a[a.length - 1].meta } : false;
  }, { i: pid, n });
  return h.jsonValue();
}

test('T56.1 lectura de [[ACCION: …]]: alias, comillas, tope de 3, claves ignoradas, marcador fuera del texto y acción desconocida con ✗', async () => {
  const { page, errors } = await abrir();
  const r = await page.evaluate(() => extractActionMarkers('Hola [[ACCION: exportar formato=.txt proyecto="Pulsar Observability"]] y [[ACTION: nota-x api_key=sk-1 token=abc]] [[ACCION: guardar]] [[ACCION: ayuda]] fin'));
  assert.deepEqual(r.calls.map((c) => c.name), ['export', 'nota-x', 'save']);
  assert.deepEqual(r.calls[0].args, { format: '.txt', project: 'Pulsar Observability' });
  assert.deepEqual(r.calls[1].args, {}, 'las claves y tokens no se leen');
  assert.ok(!r.cleaned.includes('[[') && r.cleaned.startsWith('Hola') && r.cleaned.endsWith('fin'));
  const m = await pedir(page, 'haz algo raro', 'No puedo. [[ACCION: volar-a-la-luna]]');
  assert.equal(m.state, 'err');
  const chat = await page.locator('#aiMessages').innerText();
  assert.ok(chat.includes('✗') && !chat.includes('[['));
  assert.deepEqual(errors, []);
});

test('T56.2 «exportar una copia del proyecto … en .txt» baja el mismo archivo que el botón y no pega el contenido en el chat', async () => {
  const { page, errors } = await abrir();
  const [dl] = await Promise.all([page.waitForEvent('download'), pedir(page, 'exportar una copia del proyecto PUlsar Observability en .txt', 'Listo. [[ACCION: exportar formato=.txt proyecto="PUlsar Observability"]]')]);
  const ia = { name: dl.suggestedFilename(), raw: fs.readFileSync(await dl.path(), 'utf8') };
  await page.locator('.project-item', { hasText: 'Pulsar Observability' }).click();
  await page.click('#projectExportBtn');
  const [d2] = await Promise.all([page.waitForEvent('download'), page.click('[data-export-format="txt"]')]);
  assert.equal(ia.name, d2.suggestedFilename());
  assert.equal(ia.raw, fs.readFileSync(await d2.path(), 'utf8'));
  assert.ok(ia.raw.includes('nota1palabra1'));
  const chat = await page.locator('#aiMessages').innerText();
  assert.ok(chat.includes('✓') && !chat.includes('nota1palabra1'));
  assert.deepEqual(errors, []);
});

test('T56.3 copia de seguridad, guardar, proyecto y nota nuevos, idioma, zoom, autoguardado, Ayuda y Configuración se ejecutan al pedirlo', async () => {
  const { page, errors } = await abrir();
  const hecho = async (txt, marca) => { const m = await pedir(page, txt, marca); assert.equal(m.state, 'ok', `${marca}: ${m.result}`); return m; };
  const [dl] = await Promise.all([page.waitForEvent('download'), hecho('necesito un respaldo', '[[ACCION: copia]]')]);
  assert.match(dl.suggestedFilename(), /^bitacora-db-\d{4}-\d{2}-\d{2}\.json$/);
  await hecho('persiste los cambios', '[[ACCION: guardar]]');
  await hecho('proyecto nuevo', '[[ACCION: nuevo-proyecto nombre="Delta" descripcion="prueba"]]');
  assert.ok(await page.evaluate(() => db.projects.some((p) => p.name === 'Delta')));
  await hecho('nota nueva', '[[ACCION: nueva-nota proyecto="Pulsar Observability" texto="hola mundo"]]');
  assert.deepEqual(await page.evaluate(() => { const v = db.projects.find((p) => p.id === 'p1').versions; return [v.length, v.at(-1).instructions]; }), [3, 'hola mundo']);
  await hecho('zoom y autoguardado', '[[ACTION: config zoom=110 autosave=off]]');
  assert.deepEqual(await page.evaluate(() => [db.settings.autosave, db.settings.uiZoom, normZoom(110)]).then(([a, z, n]) => [a, z === n]), ['off', true]);
  await hecho('en inglés', '[[ACCION: idioma idioma=inglés]]');
  assert.equal(await page.evaluate(() => db.settings.uiLang), 'en');
  await hecho('ayuda', '[[ACCION: ayuda]]');
  assert.ok(await page.locator('#modalLayer.open .modal-box').isVisible());
  await page.keyboard.press('Escape');
  await page.waitForSelector('#modalLayer:not(.open)', { state: 'attached' });
  await hecho('ajustes', '[[ACCION: ajustes]]');
  assert.ok(await page.locator('#settingsDrawer.open').count());
  assert.deepEqual(errors, []);
});

test('T56.4 importar e importar memoria muestran la tarjeta y su botón abre el selector de archivos', async () => {
  const { page, errors } = await abrir();
  for (const marca of ['[[ACCION: importar]]', '[[ACCION: memoria-importar ambito=todos]]']) {
    const m = await pedir(page, 'importa', marca);
    assert.deepEqual([m.state, m.perm], ['ask', 'file'], marca);
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#aiMessages [data-act="go"]').last().click()]);
    assert.ok(fc, marca);
  }
  assert.deepEqual(errors, []);
});

test('T56.5 borrar, reemplazar texto y quitar la IA piden confirmación: Cancelar no cambia nada y Confirmar sí', async () => {
  const { page, errors } = await abrir();
  const foto = () => page.evaluate(() => JSON.stringify([db.projects.map((p) => [p.name, p.versions.map((v) => v.instructions)]), db.settings.activeProvider]));
  const base = await foto();
  const casos = ['[[ACCION: borrar-proyecto proyecto=Gamma]]', '[[ACCION: borrar-nota proyecto="Pulsar Observability" nota=1.0]]', '[[ACCION: escribir-nota nota=1.0 proyecto="Pulsar Observability" texto="otro" modo=replace]]', '[[ACCION: ai-provider provider=none]]'];
  for (const marca of casos) {
    const m = await pedir(page, 'hazlo', marca);
    assert.deepEqual([m.state, m.perm], ['ask', 'confirm'], marca);
    await page.locator('#aiMessages [data-act="no"]').last().click();
    assert.equal(await foto(), base, `Cancelar cambió algo: ${marca}`);
    assert.ok(await page.locator('#aiMessages .msg.action.cancel').count(), marca);
  }
  const sin = await pedir(page, 'añade', '[[ACCION: escribir-nota nota=1.1 proyecto="Pulsar Observability" texto=extra]]');
  assert.equal(sin.state, 'ok', 'añadir texto no pide confirmación');
  await pedir(page, 'borra Gamma', '[[ACCION: borrar-proyecto proyecto=Gamma]]');
  await page.locator('#aiMessages [data-act="go"]').last().click();
  await page.waitForFunction(() => !db.projects.some((p) => p.name === 'Gamma'));
  await pedir(page, 'reemplaza', '[[ACCION: escribir-nota nota=1.0 proyecto="Pulsar Observability" texto="otro" modo=replace]]');
  await page.locator('#aiMessages [data-act="go"]').last().click();
  await page.waitForFunction(() => db.projects.find((p) => p.id === 'p1').versions[0].instructions === 'otro');
  assert.deepEqual(errors, []);
});

test('T56.6 el prompt lleva el catálogo (salvo en acciones rápidas), nunca claves API, y el resultado de una acción no vuelve al modelo', async () => {
  const { page, aiRequests, errors } = await abrir();
  await page.evaluate(() => { for (const p of Object.values(db.settings.providers || {})) p.apiKey = 'SECRETO-123'; });
  const cat = await page.evaluate(() => actionCatalogText());
  assert.ok(/export/.test(cat) && /backup/.test(cat) && /delete-project\*/.test(cat) && !cat.includes('SECRETO-123'));
  await pedir(page, 'deja todo guardado', 'ok [[ACCION: guardar]]');
  await enviar(page, 'otra cosa', 'vale');
  await page.waitForFunction(() => getProject().chat.some((m) => m.role === 'assistant' && m.text === 'vale'));
  await page.click('[data-ai-action="summary"]');
  await page.waitForFunction(() => document.querySelector('#aiSend') && !document.querySelector('#aiSend').disabled);
  assert.equal(aiRequests.length, 3);
  const [a, b, c] = aiRequests.map((r) => JSON.stringify(r));
  assert.ok(a.includes('APP ACTIONS') && b.includes('APP ACTIONS') && !c.includes('APP ACTIONS'));
  assert.ok(!b.includes('$ save'), 'la tarjeta de la acción no se reenvía al modelo');
  assert.ok(![a, b, c].some((x) => x.includes('SECRETO-123')));
  assert.deepEqual(errors, []);
});

test('T56.7 la Ayuda viaja en el prompt solo ante preguntas de uso (ES y EN), no ante órdenes ni en acciones rápidas', async () => {
  const { page, aiRequests, errors } = await abrir();
  const ayuda = (q) => page.evaluate((x) => helpContextText(x), q);
  const es = await ayuda('¿Cómo hago una copia de seguridad?');
  assert.ok(es.includes('APP HELP') && es.includes('Copia seguridad: Descarga un JSON') && !es.includes('::'));
  for (const q of ['¿Dónde está Guardar?', 'revisa la Ayuda', 'what does Export do?', 'explícame qué botones hay', 'dame los pasos para importar', 'show me the guide']) assert.ok((await ayuda(q)).includes('APP HELP'), q);
  for (const q of ['guarda el proyecto', 'exporta una copia del proyecto Pulsar Observability en .txt', 'crea una nota nueva']) assert.equal(await ayuda(q), '', q);
  await enviar(page, '¿Cómo se hace una copia de seguridad?', 'Pulsa «Copia seguridad».');
  await page.waitForFunction(() => getProject().chat.some((m) => m.role === 'assistant' && m.text.startsWith('Pulsa')));
  await pedir(page, 'deja el proyecto guardado', 'ok [[ACCION: guardar]]');
  await page.click('[data-ai-action="summary"]');
  await page.waitForFunction(() => document.querySelector('#aiSend') && !document.querySelector('#aiSend').disabled);
  assert.equal(aiRequests.length, 3);
  const [a, b, c] = aiRequests.map((r) => JSON.stringify(r));
  assert.ok(a.includes('APP HELP') && a.includes('Copia seguridad: Descarga un JSON'));
  assert.ok(!b.includes('APP HELP') && !c.includes('APP HELP'));
  assert.deepEqual(errors, []);
  const en = await openApp(browser, { seed: seed(), lang: 'en', ai: async () => reply });
  const h = await en.page.evaluate(() => helpContextText('how do I import a backup?'));
  assert.ok(h.includes('APP HELP') && h.includes('Backup: Downloads a JSON') && !h.includes('Copia seguridad'));
  assert.equal(await en.page.evaluate(() => helpContextText('save the project')), '');
  assert.deepEqual(en.errors, []);
});

test('T56.8 órdenes claras (exportar en txt/docx/pdf, copia, guardar, proyecto nuevo, idioma, Ayuda, quitar IA) se ejecutan sin llamar al modelo; lo ambiguo no se intercepta', async () => {
  const { page, errors } = await abrir();
  let reqs = 0;
  await page.route('https://**/*', (r) => { if (r.request().method() === 'POST') reqs++; return r.abort(); });
  const calls = (txt) => page.evaluate((t) => localActionCalls(t), txt);
  assert.deepEqual(await calls('exportar una copia del proyecto PUlsar Observability en .txt'), [{ name: 'export', args: { format: 'txt', scope: 'project', project: 'Pulsar Observability' } }]);
  assert.deepEqual(await calls('¿Puedes exportar Gamma a Word?'), [{ name: 'export', args: { format: 'docx', scope: 'project', project: 'Gamma' } }]);
  assert.deepEqual(await calls('please export everything as pdf'), [{ name: 'export', args: { format: 'pdf', scope: 'all' } }]);
  assert.deepEqual(await calls('exporta todo el proyecto en texto plano'), [{ name: 'export', args: { format: 'txt', scope: 'project' } }]);
  assert.deepEqual(await calls('hazme una copia de seguridad'), [{ name: 'backup', args: {} }]);
  assert.deepEqual(await calls('Guarda.'), [{ name: 'save', args: {} }]);
  assert.deepEqual(await calls('crea un proyecto llamado Delta Ops'), [{ name: 'new-project', args: { name: 'Delta Ops' } }]);
  assert.deepEqual(await calls('create a new project'), [{ name: 'new-project', args: {} }]);
  assert.deepEqual(await calls('cambia el idioma del programa a inglés'), [{ name: 'config', args: { lang: 'en' } }]);
  assert.deepEqual(await calls('abre la ayuda'), [{ name: 'help', args: {} }]);
  assert.deepEqual(await calls('quita la IA'), [{ name: 'ai-provider', args: { provider: 'none' } }]);
  assert.deepEqual(await calls('importa una copia de seguridad'), [{ name: 'import', args: {} }]);
  assert.deepEqual(await calls('exporta la memoria de todos los proyectos'), [{ name: 'memory-export', args: { scope: 'all' } }]);
  for (const t of ['exporta la nota 1.0 en pdf', 'exporta el resumen en una lista', 'traduce esta nota al inglés', '¿Cómo se hace una copia de seguridad?', 'crea un proyecto para analizar los logs de nginx', 'guarda esta idea para después'])
    assert.equal(await calls(t), null, t);
  const [dl] = await Promise.all([page.waitForEvent('download'), (async () => { await page.fill('#aiInput', 'exportar una copia del proyecto PUlsar Observability en .txt'); await page.click('#aiSend'); })()]);
  assert.match(dl.suggestedFilename(), /\.txt$/);
  await page.waitForFunction(() => getProject().chat.some((m) => m.kind === 'action' && m.meta.state === 'ok'));
  assert.equal(reqs, 0, 'sin llamadas al modelo');
  assert.deepEqual(await page.evaluate(() => getProject().chat.map((m) => m.role)), ['user', 'system']);
  assert.deepEqual(errors, []);
});
