// F62 · The assistant uses the program like the user: selects and shows notes, and analyzes, re-analyzes, shows and deletes change analyses.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openApp, makeDb, sampleProject } from './helpers.mjs';

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });

const seed = () => makeDb({ projects: [sampleProject({ id: 'p1', name: 'Stratus Backup', n: 10, words: 120 }), sampleProject({ id: 'p2', name: 'Pokemascota china', n: 6, words: 60 })] });
let chatReply = '';
let nAn = 0;
let longNext = false;
/** The chat answers `chatReply`; the analysis request (it carries «RESULT») answers a numbered analysis. */
const ai = async (messages) => {
  if (JSON.stringify(messages).includes('RESULT')) { const n = ++nAn; return `RESULT: CHANGES\n${longNext ? ('Se reordenó el plan de copias. '.repeat(60)) : `Análisis simulado ${n}.`}`; }
  return chatReply;
};
const abrir = (opts = {}) => { nAn = 0; longNext = false; return openApp(browser, { seed: seed(), ai, ...opts }); };
/** Sends `texto` and waits until the last action card of THAT chat (the action may switch project) stops running; returns its meta. */
async function pedir(page, texto, resp = '') {
  const pid = await page.evaluate(() => getProject().id);
  const acciones = (pid) => db.projects.find((p) => p.id === pid).chat.filter((m) => m.kind === 'action');
  const n = await page.evaluate(`(${acciones})(${JSON.stringify(pid)}).length`);
  chatReply = resp;
  await page.fill('#aiInput', texto);
  await page.click('#aiSend');
  const h = await page.waitForFunction(([pid, n]) => {
    const a = db.projects.find((p) => p.id === pid).chat.filter((m) => m.kind === 'action');
    return a.length > n && a[a.length - 1].meta.state !== 'run' ? { ...a[a.length - 1].meta } : false;
  }, [pid, n]);
  return h.jsonValue();
}
const notaAbierta = (page) => page.evaluate(() => {
  const c = document.querySelector('.version-card.selected'), sc = document.querySelector('.workspace-scroll');
  if (!c) return null;
  const a = c.getBoundingClientRect(), b = sc.getBoundingClientRect();
  return { id: c.dataset.version, top: Math.round(a.top - b.top), bottom: Math.round(a.bottom - b.top), alto: Math.round(b.height), filtro: document.querySelector('#versionSearch')?.value, proyecto: getProject().name };
});
const analisis = (page, i = 1) => page.evaluate((i) => getProject().versions[i].changeAnalyses.map((a) => a.text), i);
/** Clicks «Confirmar» (`go`) or «Cancelar» (`no`) on the card awaiting permission and returns its resolved meta. */
async function confirmar(page, boton = 'go') {
  await page.click(`.msg.action .btn[data-act="${boton}"]`);
  const h = await page.waitForFunction(() => { const m = getProject().chat.filter((x) => x.kind === 'action').at(-1).meta; return m.state !== 'ask' && m.state !== 'run' ? { ...m } : false; });
  return h.jsonValue();
}
const ultimoAsistente = (page) => page.evaluate(() => getProject().chat.filter((m) => m.role === 'assistant').at(-1)?.text || '');

test('T62.1 «selecciona la nota X» la elige y la pone delante: visible y seleccionada, sin filtro que la oculte; también en otro proyecto', async () => {
  const { page, errors } = await abrir();
  await page.fill('#versionSearch', 'nota1palabra1'); // leaves only the first note visible
  assert.equal(await page.locator('.version-entry[data-search-hidden="false"]').count(), 1);
  const m = await pedir(page, 'Selecciona la nota 1.8');
  assert.equal(m.state, 'ok', m.result);
  assert.ok(m.result.includes('v1.8'), m.result);
  let n = await notaAbierta(page);
  assert.equal(n.id, 'p1-v9');
  assert.equal(n.filtro, '', 'el filtro que la ocultaba se quita');
  assert.ok(n.top >= -2 && n.top <= 60, `la nota queda arriba de la vista (top ${n.top})`);
  assert.ok(n.bottom > 0 && n.bottom <= n.alto + 4000 && n.top < n.alto, 'empieza dentro de la vista');
  assert.equal(await page.evaluate(() => selectedVersionId), 'p1-v9');
  const m2 = await pedir(page, 'abre la versión 1.4 del proyecto Pokemascota china');
  assert.equal(m2.state, 'ok', m2.result);
  n = await notaAbierta(page);
  assert.deepEqual([n.proyecto, n.id], ['Pokemascota china', 'p2-v5']);
  assert.ok(n.top >= -2 && n.top <= 60, `top ${n.top}`);
  const m3 = await pedir(page, 'selecciona la nota 1.4 del proyecto Stratus Backup'); // local path: the project goes back to Stratus
  assert.equal(m3.state, 'ok', m3.result);
  assert.equal((await notaAbierta(page)).proyecto, 'Stratus Backup');
  assert.deepEqual(errors, []);
});

test('T62.1b select sin nota o con una nota que no existe no cambia nada; el marcador del modelo también la muestra', async () => {
  const { page, aiRequests } = await abrir();
  const m = await pedir(page, 'muéstrame algo', 'Vale. [[ACCION: select note=1.6]]');
  assert.equal(m.state, 'ok', m.result);
  assert.equal((await notaAbierta(page)).id, 'p1-v7');
  const antes = await page.evaluate(() => selectedVersionId);
  const bad = await pedir(page, 've a eso', 'Hecho. [[ACCION: select note=9.9]]');
  assert.equal(bad.state, 'err');
  assert.equal(await page.evaluate(() => selectedVersionId), antes);
  assert.ok(aiRequests.length >= 2);
});

test('T62.2 analizar cambios por orden: calcula, GUARDA el análisis en la nota, abre su bloque y resume en el chat; sin llamar al chat', async () => {
  const { page, aiRequests, errors } = await abrir();
  const m = await pedir(page, 'Analiza los cambios entre la versión 1.0 y la 1.1');
  assert.equal(m.state, 'ok', m.result);
  assert.ok(m.result.includes('1.0 → 1.1'), m.result);
  assert.equal(aiRequests.length, 1, 'solo la petición de análisis: la orden local no pasa por el chat');
  assert.deepEqual(await analisis(page), ['Análisis simulado 1.']);
  const n = await notaAbierta(page);
  assert.equal(n.id, 'p1-v2', 'la nota analizada queda seleccionada y a la vista');
  assert.equal(await page.locator('.version-card.selected .diff-analysis .diff-analysis-body').innerText(), 'Análisis simulado 1.');
  assert.equal(await page.locator('.version-card.selected .analysis-mark').count(), 1, 'la marca «con análisis» aparece');
  const txt = await ultimoAsistente(page);
  assert.ok(txt.startsWith('Análisis 1.0 → 1.1 · ') && txt.includes('Análisis simulado 1.'), txt);
  assert.deepEqual(errors, []);
});

test('T62.3 sin re-analizar reutiliza el guardado; «re-analiza» pide otro y lo añade; mostrar el anterior, y borrar uno o todos', async () => {
  const { page, aiRequests } = await abrir();
  await pedir(page, 'analiza los cambios de la nota 1.1');
  const r2 = await pedir(page, 'analiza los cambios de la 1.1');
  assert.equal(r2.state, 'ok');
  assert.equal(aiRequests.length, 1, 'con análisis guardado solo se abre, sin IA');
  const r3 = await pedir(page, 're-analiza la 1.1');
  assert.equal(r3.state, 'ok', r3.result);
  assert.equal(aiRequests.length, 2);
  assert.deepEqual(await analisis(page), ['Análisis simulado 1.', 'Análisis simulado 2.']);
  assert.equal(await page.locator('.analysis-mark').innerText().then((s) => s.replace(/\s+/g, ' ').trim()), '≠ ANÁLISIS ×2');
  const s = await pedir(page, 'muéstrame el análisis anterior de la 1.1');
  assert.equal(s.state, 'ok', s.result);
  assert.equal(await page.locator('.diff-analysis-body').innerText(), 'Análisis simulado 1.');
  assert.ok((await ultimoAsistente(page)).includes('Análisis simulado 1.'));
  const d = await pedir(page, 'borra el análisis de la 1.1');
  assert.equal(d.state, 'ok', d.result);
  assert.deepEqual(await analisis(page), ['Análisis simulado 1.'], 'quita el último');
  await pedir(page, 're-analiza la 1.1');
  const all = await pedir(page, 'elimina todos los análisis de la 1.1');
  assert.equal(all.state, 'ask', 'borrar todos pide confirmación (uno solo, no)');
  assert.equal((await analisis(page)).length, 2, 'sin confirmar no se borra nada');
  assert.equal((await confirmar(page, 'no')).state, 'cancel');
  assert.equal((await analisis(page)).length, 2, 'cancelar no borra');
  assert.equal((await pedir(page, 'borra todos los análisis de la 1.1')).state, 'ask');
  const ok = await confirmar(page);
  assert.equal(ok.state, 'ok', ok.result);
  assert.deepEqual(await analisis(page), []);
  assert.equal(await page.locator('.analysis-mark').count(), 0);
  const none = await pedir(page, 'borra el análisis de la 1.1');
  assert.equal(none.state, 'err');
  assert.equal(aiRequests.length, 3);
});

test('T62.4 el modelo también lo hace con [[ACCION: analyze-changes]]; busca análisis pasados por texto; un análisis largo se resume en el chat y se guarda entero', async () => {
  const { page } = await abrir();
  longNext = true;
  const m = await pedir(page, 'compara la 1.2 con la anterior', 'Lo analizo. [[ACCION: analyze-changes note=1.2]]');
  assert.equal(m.state, 'ok', m.result);
  const guardado = (await analisis(page, 2))[0];
  assert.ok(guardado.length > 1500, 'se guarda entero');
  const txt = await ultimoAsistente(page);
  assert.ok(txt.length < 900 && txt.includes('…') && txt.includes('Analizar cambios'), `resumen en el chat (${txt.length})`);
  longNext = false;
  await pedir(page, 'analiza los cambios de la nota 1.5');
  const f = await pedir(page, 'busca ese análisis', 'Voy. [[ACCION: show-analysis query="plan de copias"]]');
  assert.equal(f.state, 'ok', f.result);
  assert.equal((await notaAbierta(page)).id, 'p1-v3');
  const lista = await pedir(page, 'qué análisis hay', 'Ahí va. [[ACCION: show-analysis project=2]]');
  assert.equal(lista.state, 'err', 'el proyecto 2 no tiene análisis');
  const l2 = await pedir(page, 'qué análisis hay', 'Ahí va. [[ACCION: show-analysis project=1 query=zzz-no-existe]]');
  assert.equal(l2.state, 'err');
  const catalogo = await page.evaluate(() => actionCatalogText());
  for (const x of ['analyze-changes', 'show-analysis', 'delete-analysis']) assert.ok(catalogo.includes(x), x);
});

test('T62.5 errores claros: primera versión, versión no consecutiva, sin IA y sin análisis; nada se guarda', async () => {
  const { page, aiRequests } = await abrir();
  const a = await pedir(page, 'analiza los cambios de la 1.0');
  assert.deepEqual([a.state, /primera/.test(a.result)], ['err', true], a.result);
  const b = await pedir(page, 'analiza los cambios entre la versión 1.0 y la 1.2');
  assert.deepEqual([b.state, b.result.includes('1.1')], ['err', true], b.result);
  assert.equal(aiRequests.length, 0);
  const c = await pedir(page, 'borra el análisis de la 1.3');
  assert.equal(c.state, 'err');
  const { page: sinIa } = await openApp(browser, { seed: seed() });
  const d = await pedir(sinIa, 'analiza los cambios de la 1.1');
  assert.deepEqual([d.state, /IA activa/.test(d.result)], ['err', true], d.result);
  assert.deepEqual(await analisis(sinIa), []);
});

test('T62.6 órdenes locales: solo las claras y con números que existen; lo demás llega al modelo', async () => {
  const { page } = await abrir();
  const L = (f) => page.evaluate((x) => localActionCalls(x), f);
  const nombres = async (f) => (await L(f))?.map((c) => c.name + ':' + JSON.stringify(c.args));
  assert.deepEqual(await nombres('Analiza los cambios entre la versión 1.0 y la 1.1'), ['analyze-changes:{"note":"1.1","from":"1.0"}']);
  assert.deepEqual(await nombres('vuelve a analizar los cambios de la versión 1.4'), ['analyze-changes:{"note":"1.4","force":"true"}']);
  assert.deepEqual(await nombres('re-analyze 1.2'), ['analyze-changes:{"note":"1.2","force":"true"}']);
  assert.deepEqual(await nombres('muéstrame el análisis anterior de la nota 1.3'), ['show-analysis:{"note":"1.3","which":"previous"}']);
  assert.deepEqual(await nombres('elimina todos los análisis de la 1.3'), ['delete-analysis:{"note":"1.3","which":"all"}']);
  assert.deepEqual(await nombres('Selecciona la nota 1.4 del proyecto Pokemascota china'), ['select:{"note":"1.4","project":"Pokemascota china"}']);
  assert.deepEqual(await nombres('selecciona el proyecto Pokemascota'), ['select:{"project":"Pokemascota china"}']);
  for (const f of ['analiza la 1.1', 'analiza los cambios de la 9.9', 'selecciona la nota 9.9', '¿qué cambios hubo entre la 1.0 y la 1.1?', 'borra el análisis de la 9.9', 'selecciona la nota 1.4 del proyecto Inexistente'])
    assert.equal(await L(f), null, f);
});

test('T62.7 API selectVersion: elige y muestra la nota (con su análisis si se pide), valida y aparece en describe()', async () => {
  const { page } = await abrir();
  const api = (op, a) => page.evaluate(([op, a]) => BitacoraAPI[op](a), [op, a]);
  assert.ok((await page.evaluate(() => BitacoraAPI.describe().operations.map((o) => o.name))).includes('selectVersion'));
  assert.equal((await api('selectVersion', { id: 'nope' })).error.code, 'version-not-found');
  const r = await api('selectVersion', { id: 'p2-v4' });
  assert.deepEqual([r.ok, r.data.version], [true, '1.3']);
  const n = await notaAbierta(await page);
  assert.deepEqual([n.proyecto, n.id], ['Pokemascota china', 'p2-v4']);
  assert.equal((await api('selectVersion', { id: 'p2-v4', analysis: true })).error.code, 'analysis-not-found');
  const an = await page.evaluate(async () => { const r = await BitacoraAPI.analyzeChanges({ id: 'p2-v4', save: true }); return r; });
  assert.equal(an.ok, true);
  await api('selectVersion', { id: 'p1-v1' });
  const r2 = await api('selectVersion', { id: 'p2-v4', analysis: true });
  assert.equal(r2.ok, true);
  assert.equal(await page.locator('.version-card.selected .diff-analysis').count(), 1, 'el análisis guardado queda abierto bajo la nota');
});

test('T62.8 móvil (≤ 900 px): la tarjeta de una acción que muestra una nota lleva «Ver nota»; al pulsarla se cierra el panel y la nota queda delante, y el panel no se cierra solo', async () => {
  const { page, errors } = await abrir({ viewport: { width: 390, height: 800 } });
  await page.click('#aiToggle');
  assert.equal(await page.locator('#aiPanel.open').count(), 1);
  const m = await pedir(page, 'selecciona la nota 1.8');
  assert.equal(m.state, 'ok', m.result);
  assert.equal(await page.locator('#aiPanel.open').count(), 1, 'el panel no se cierra solo');
  const ver = page.locator('.msg.action [data-act="view"]');
  assert.equal(await ver.count(), 1);
  await ver.click();
  assert.equal(await page.locator('#aiPanel.open').count(), 0, 'Ver nota cierra el panel');
  const n = await notaAbierta(page);
  assert.equal(n.id, 'p1-v9');
  assert.ok(n.top >= -2 && n.top <= 60 && n.top < n.alto, `la nota queda delante (top ${n.top})`);
  await page.click('#aiToggle');
  const sin = await pedir(page, 'abre los ajustes'); // an action that shows no note has no button
  assert.equal(sin.state, 'ok', sin.result);
  assert.equal(await page.locator('.msg.action [data-act="view"]').count(), 1, 'solo la tarjeta que mostró una nota');
  assert.deepEqual(errors, []);
});
