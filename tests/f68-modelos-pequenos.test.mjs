// F68–F72 · Small models: Automatic/Compact/Full profile, short per-task requests, action shortcut, local-server parameters and tolerant markers.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openApp, makeDb, sleep, pick } from './helpers.mjs';

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });

const ISO = (d) => new Date(2026, 0, d).toISOString();
const NOTAS = [
  'Copias completas nocturnas a almacenamiento de objetos con cifrado en origen y una clave por cliente; objetivo de RPO de 24 horas y RTO de 4 horas.',
  'Copias incrementales por bloques con snapshots cada 4 horas; el RPO real baja a 4 horas y se mantiene una copia completa semanal como ancla.',
  'Restauración selectiva por archivo o carpeta sin restaurar el volumen entero; recuperar un archivo de 200 MB tarda 40 segundos.',
  'Verificación automática semanal: se restaura una copia aleatoria en un entorno aislado y se compara su hash; un fallo es un incidente grave.',
  'Retención por política con bloqueo de objetos para impedir el borrado antes de tiempo, incluso con credenciales de administrador comprometidas.',
  'Replicación entre dos regiones con verificación independiente. Pendiente: documentar cómo conmutar la replicación a la región secundaria.',
];
function proyecto({ n = NOTAS.length, largo = 0 } = {}) {
  const versions = Array.from({ length: n }, (_, i) => ({
    id: `p1-v${i + 1}`, version: `1.${i}`,
    instructions: (NOTAS[i % NOTAS.length] + (largo ? ' ' + 'relleno de la nota '.repeat(largo) : '')).trim(),
    revertsVersionId: '', createdAt: ISO(i + 1), updatedAt: ISO(i + 1),
  }));
  const stamp = ISO(28);
  return {
    id: 'p1', name: 'Stratus Backup', description: 'Copias de seguridad y recuperación.', createdAt: stamp, updatedAt: stamp, versions,
    pending: [
      { id: 't1', text: 'Alertar si la verificación semanal tarda más de 3 h', done: false, source: 'manual', createdAt: stamp },
      { id: 't2', text: 'Documentar la conmutación a la región secundaria', done: false, source: 'manual', createdAt: stamp },
      { id: 't3', text: 'Repetir el simulacro de restauración total', done: true, source: 'manual', createdAt: stamp },
    ],
  };
}
let respuesta = '';
/** Opens the app with the given profile and model; `aiRequests` records each request that reaches the mock server. */
async function abrir({ profile = 'compact', model = 'qwen3.5:2b', p = proyecto(), lang = 'es' } = {}) {
  const seed = makeDb({ projects: [p], settings: { uiLang: lang, modelProfile: profile, providers: { ollama: { model } } } });
  return openApp(browser, { seed, lang, ai: async () => respuesta });
}
/** Waits for request number `n` to reach the server and for the assistant to finish processing the reply. */
async function esperar(page, aiRequests, n) {
  for (let i = 0; i < 200 && aiRequests.length < n; i++) await sleep(50);
  assert.ok(aiRequests.length >= n, `llegaron ${aiRequests.length} peticiones y se esperaban ${n}`);
  await page.waitForFunction(() => !aiBusy);
}
async function decir(page, aiRequests, texto, resp = 'ok') {
  const n = aiRequests.length + 1; respuesta = resp;
  await page.fill('#aiInput', texto); await page.click('#aiSend');
  await esperar(page, aiRequests, n);
  return aiRequests.at(-1);
}
async function rapida(page, aiRequests, kind, resp) {
  const n = aiRequests.length + 1; respuesta = resp;
  await page.evaluate((k) => aiAction(k), kind);
  await esperar(page, aiRequests, n);
  return aiRequests.at(-1);
}
const sistema = (req) => req.messages.find((m) => m.role === 'system')?.content || '';
const usuario = (req) => req.messages.filter((m) => m.role === 'user').at(-1).content;
const todo = (req) => req.messages.map((m) => m.content).join('\n');
const pendientes = (page) => page.evaluate(() => getProject().pending.map((x) => `${x.done ? 'x' : 'o'} ${x.text}`));
const ultimoChat = (page) => page.evaluate(() => getProject().chat.filter((m) => m.role === 'assistant').at(-1)?.text || '');

test('T68.1 Automático decide por el tamaño que indica el nombre del modelo (≤ 5B compacto); el ajuste manual manda', async () => {
  const { page, errors } = await abrir({ profile: 'auto' });
  const r = await page.evaluate(() => {
    const perfil = (m) => { db.settings.providers.ollama.model = m; db.settings.modelProfile = 'auto'; return modelProfile(); };
    const nombres = ['qwen3.5:0.8b', 'qwen3.5:2b', 'qwen3.5:4b', 'llama3.2', 'llama3.2:1b', 'gemma3:270m', 'gemma3n:e2b', 'phi-4-mini',
      'qwen3.5:9b', 'qwen/qwen3.5-35b-a3b', 'mistral-small-24b', 'llama3.1:8b', 'llama3.2-vision:11b', 'gpt-4o', 'local-model', 'mixtral-8x7b'];
    const auto = Object.fromEntries(nombres.map((m) => [m, perfil(m)]));
    db.settings.providers.ollama.model = 'qwen3.5:9b'; db.settings.modelProfile = 'compact'; const forzadoC = modelProfile();
    db.settings.providers.ollama.model = 'qwen3.5:2b'; db.settings.modelProfile = 'full'; const forzadoF = modelProfile();
    return { auto, forzadoC, forzadoF };
  });
  for (const m of ['qwen3.5:0.8b', 'qwen3.5:2b', 'qwen3.5:4b', 'llama3.2', 'llama3.2:1b', 'gemma3:270m', 'gemma3n:e2b', 'phi-4-mini']) assert.equal(r.auto[m], 'compact', m);
  for (const m of ['qwen3.5:9b', 'qwen/qwen3.5-35b-a3b', 'mistral-small-24b', 'llama3.1:8b', 'llama3.2-vision:11b', 'gpt-4o', 'local-model', 'mixtral-8x7b']) assert.equal(r.auto[m], 'full', m);
  assert.equal(r.forzadoC, 'compact');
  assert.equal(r.forzadoF, 'full');
  assert.deepEqual(errors, []);
});

test('T68.2 Configuración: desplegable «Perfil del modelo» (ES y EN), línea «Ahora…», API setSettings({modelProfile}) y acción config profile=', async () => {
  const { page, errors } = await abrir({ profile: 'auto' });
  await page.click('#settingsBtn');
  assert.match(await page.locator('#modelProfileLabel').innerText(), /Perfil del modelo/);
  assert.match(await page.locator('#modelProfileHelp').innerText(), /Ahora: compacto \(qwen3\.5:2b\)/);
  await pick(page.locator('#modelProfileHost .select-custom'), 'full');
  assert.equal(await page.evaluate(() => db.settings.modelProfile), 'full');
  assert.match(await page.locator('#modelProfileHelp').innerText(), /Ahora: completo/);
  const api = await page.evaluate(() => [BitacoraAPI.setSettings({ modelProfile: 'compact' }), BitacoraAPI.setSettings({ modelProfile: 'enorme' })]);
  assert.equal(api[0].ok, true); assert.equal(api[0].data.modelProfile, 'compact');
  assert.equal(api[1].error.code, 'invalid-argument');
  assert.equal(await page.evaluate(() => db.settings.modelProfile), 'compact');
  const acc = await page.evaluate(async () => { const r = await ASSISTANT_ACTIONS.config.run({ profile: 'auto' }); return [r.ok, db.settings.modelProfile]; });
  assert.deepEqual(acc, [true, 'auto']);
  assert.equal(await page.evaluate(() => ASSISTANT_ACTIONS.config.args.includes('profile=auto|compact|full')), true);
  await page.evaluate(() => BitacoraAPI.setSettings({ lang: 'en' }));
  assert.match(await page.locator('#modelProfileLabel').innerText(), /Model profile/);
  assert.match(await page.locator('#modelProfileHelp').innerText(), /Now: compact/);
  assert.deepEqual(errors, []);
});

test('T68.3 «Extraer pendientes» compacto: sistema corto, solo la nota activa y los pendientes abiertos, sin reglas ajenas; el resultado entra numerado en la lista', async () => {
  const { page, aiRequests, errors } = await abrir();
  const req = await rapida(page, aiRequests, 'pending', '- Probar la restauración en la región secundaria\n- Medir el tiempo de conmutación');
  const sys = sistema(req), usr = usuario(req);
  assert.equal(req.messages.length, 2);
  assert.ok(sys.length < 500, `sistema de ${sys.length} caracteres`);
  assert.match(usr, /\[v1\.5\]/);
  assert.ok(usr.includes(NOTAS[5].slice(0, 60)), 'lleva la nota activa');
  for (const i of [0, 1, 2, 3, 4]) assert.ok(!usr.includes(NOTAS[i].slice(0, 40)), `no lleva la nota ${i}`);
  assert.match(usr, /ALREADY NOTED:\n- Alertar si la verificación semanal tarda más de 3 h\n- Documentar la conmutación/);
  assert.ok(!usr.includes('Repetir el simulacro'), 'los hechos no viajan');
  assert.ok(!/REGLA|\[\[VERSION|\[\[PENDIENTE|CHAT HISTORY|ACTIONS/.test(todo(req)));
  assert.ok(req.messages.reduce((n, m) => n + m.content.length, 0) < 1700, 'petición corta');
  assert.deepEqual(await pendientes(page), ['o Alertar si la verificación semanal tarda más de 3 h', 'o Documentar la conmutación a la región secundaria', 'o Probar la restauración en la región secundaria', 'o Medir el tiempo de conmutación', 'x Repetir el simulacro de restauración total']);
  assert.match(await ultimoChat(page), /^3\. Probar la restauración[\s\S]*\n4\. Medir el tiempo/);
  assert.deepEqual(errors, []);
});

test('T68.4 «Extraer pendientes» completo no cambia: sistema y reglas de siempre y todo el historial', async () => {
  const { page, aiRequests, errors } = await abrir({ profile: 'full' });
  const req = await rapida(page, aiRequests, 'pending', '- Tarea nueva');
  assert.match(sistema(req), /administrativo de una bitácora/);
  assert.match(usuario(req), /REGLA DE CHAT/);
  for (const i of [0, 1, 2, 3, 4, 5]) assert.ok(usuario(req).includes(NOTAS[i].slice(0, 40)), `lleva la nota ${i}`);
  assert.equal(req.reasoning_effort, undefined); assert.equal(req.max_tokens, undefined);
  assert.deepEqual(Object.keys(req).sort(), ['messages', 'model', 'temperature']);
  assert.deepEqual(errors, []);
});

test('T68.5 la lista de pendientes se lee con criterio: NONE, introducciones, <think> y viñetas (compacto y completo)', async () => {
  for (const profile of ['compact', 'full']) {
    const { page, aiRequests, errors } = await abrir({ profile });
    await rapida(page, aiRequests, 'pending', 'NONE');
    assert.equal((await pendientes(page)).length, 3, `${profile}: NONE no añade nada`);
    assert.match(await ultimoChat(page), /No hay tareas pendientes en la nota activa/);
    await rapida(page, aiRequests, 'pending', 'No hay tareas pendientes.');
    assert.equal((await pendientes(page)).length, 3, `${profile}: una frase sin tareas no es una tarea`);
    await rapida(page, aiRequests, 'pending', 'Aquí tienes las tareas:\n- Revisar el cifrado\n- Probar el bloqueo de objetos\nEspero que te sirva.');
    assert.deepEqual((await pendientes(page)).slice(2, 4), ['o Revisar el cifrado', 'o Probar el bloqueo de objetos'], `${profile}: solo líneas con viñeta`);
    assert.equal((await pendientes(page)).length, 5);
    await rapida(page, aiRequests, 'pending', '<think>\n- tarea inventada al pensar\n</think>\n- Revisar logs de la réplica');
    const lista = await pendientes(page);
    assert.ok(lista.includes('o Revisar logs de la réplica') && !lista.some((x) => x.includes('inventada')), `${profile}: el razonamiento no cuenta`);
    await rapida(page, aiRequests, 'pending', 'Tarea suelta sin viñeta\nOtra tarea sin viñeta');
    assert.ok((await pendientes(page)).includes('o Otra tarea sin viñeta'), `${profile}: sin viñetas siguen valiendo todas las líneas`);
    assert.deepEqual(errors, []);
  }
});

test('T68.6 una nota activa sin texto no llama al modelo y lo dice', async () => {
  const p = proyecto(); p.versions.forEach((v) => { v.instructions = ''; });
  const { page, aiRequests, errors } = await abrir({ p });
  await page.evaluate(() => aiAction('pending'));
  await page.waitForFunction(() => !aiBusy && getProject().chat.some((m) => m.role === 'assistant'));
  assert.equal(aiRequests.length, 0);
  assert.match(await ultimoChat(page), /no tiene texto/);
  assert.deepEqual(errors, []);
});

test('T68.7 «Qué cambió» compacto manda solo las tres últimas notas; «Resumen» y «Contradicciones» caben en un presupuesto aunque haya 80 notas', async () => {
  const { page, aiRequests, errors } = await abrir();
  const c = await rapida(page, aiRequests, 'changes', 'Cambios.');
  for (const i of [3, 4, 5]) assert.ok(usuario(c).includes(NOTAS[i].slice(0, 50)), `tercia: nota ${i}`);
  for (const i of [0, 1, 2]) assert.ok(!usuario(c).includes(NOTAS[i].slice(0, 40)), `fuera de la tercia: nota ${i}`);
  assert.ok(!/PENDIENTES/.test(usuario(c)), 'los pendientes no hacen falta para comparar');
  const grande = await abrir({ p: proyecto({ n: 80, largo: 40 }) });
  for (const k of ['summary', 'contradictions', 'changes']) {
    const r = await rapida(grande.page, grande.aiRequests, k, 'x');
    const chars = r.messages.reduce((n, m) => n + m.content.length, 0);
    assert.ok(chars < 7500, `${k}: ${chars} caracteres con 80 notas`);
    if (k !== 'changes') assert.match(usuario(r), /Se han omitido versiones antiguas/);
    assert.ok(usuario(r).includes('[v1.79 ·'), `${k}: la última nota viaja`);
  }
  assert.deepEqual(errors, []); assert.deepEqual(grande.errors, []);
});

test('T68.8 chat libre compacto: sistema corto sin catálogo ante una pregunta, nota citada completa, notas viejas en extracto y seis mensajes de historial', async () => {
  const p = proyecto({ n: 12 });
  p.chat = Array.from({ length: 10 }, (_, i) => ({ id: `c${i}`, role: i % 2 ? 'assistant' : 'user', text: `mensaje previo ${i}`, ts: ISO(2) }));
  const { page, aiRequests, errors } = await abrir({ p });
  const req = await decir(page, aiRequests, '¿Qué decía la 1.2 sobre la restauración?', 'Decía X.');
  const sys = sistema(req);
  assert.ok(sys.length < 400, `sistema de ${sys.length} caracteres`);
  assert.ok(!/APP ACTIONS|APP HELP|\[\[PENDING|\[\[VERSION/.test(sys), 'una pregunta no lleva catálogo ni reglas');
  assert.ok(/\[v1\.2 · [^\]]+\]\nRestauración selectiva por archivo o carpeta sin restaurar el volumen entero; recuperar un archivo de 200 MB tarda 40 segundos\./.test(usuario(req)), 'la nota citada va completa');
  assert.match(usuario(req), /\[v1\.0 · [^\]]+\] Copias completas nocturnas[^\n]*…/, 'las viejas, en extracto de una línea');
  const hist = req.messages.slice(1, -1);
  assert.equal(hist.length, 6);
  assert.equal(hist.at(-1).content, 'mensaje previo 9');
  assert.match(usuario(req), /PREGUNTA DEL DESARROLLADOR: ¿Qué decía la 1\.2/);
  assert.match(usuario(req), /Responde solo en español\.$/);
  assert.deepEqual(errors, []);
});

test('T68.9 el catálogo viaja recortado: solo las acciones que encajan; verbo o frase rara → solo nombres; pregunta → nada', async () => {
  const { page, aiRequests, errors } = await abrir();
  let sys = sistema(await decir(page, aiRequests, 'borra la nota 3'));
  assert.match(sys, /APP ACTIONS: to operate the app write one line \[\[ACTION: name key=value\]\]/);
  assert.match(sys, /\ndelete-note\* note project\? — delete a note/);
  assert.ok(!/\nexport |\nnew-note/.test(sys), 'solo lo que encaja');
  sys = sistema(await decir(page, aiRequests, 'pásame el proyecto a pdf'));
  assert.match(sys, /\nexport format=txt\|docx\|pdf scope=project\|all project\? note\? — /);
  sys = sistema(await decir(page, aiRequests, 'convierte todo a mayúsculas por favor'));
  assert.match(sys, /\nAvailable: export, backup, save,/);
  assert.ok(sys.length < 1300, `solo nombres: ${sys.length} caracteres`);
  sys = sistema(await decir(page, aiRequests, '¿Qué riesgos hay en el proyecto?'));
  assert.ok(!/APP ACTIONS/.test(sys));
  sys = sistema(await decir(page, aiRequests, 'añade un pendiente: revisar los logs'));
  assert.match(sys, /\[\[PENDING: text\]\]/, 'la regla de pendientes viaja con los pendientes');
  assert.match(sys, /\nadd-pending /);
  sys = sistema(await decir(page, aiRequests, 'propón una numeración para las versiones'));
  assert.match(sys, /\[\[VERSION: current number => new number\]\]/);
  assert.match(sys, /\nrenumber\* scheme=/);
  assert.deepEqual(errors, []);
});

test('T68.10 la Ayuda viaja recortada a las entradas que encajan (compacto) y entera en el perfil completo', async () => {
  const { page, aiRequests, errors } = await abrir();
  const compacta = sistema(await decir(page, aiRequests, '¿Cómo exporto el proyecto a Word?'));
  assert.match(compacta, /APP HELP/);
  assert.match(compacta, /Exportar: /);
  assert.ok(!/APP ACTIONS/.test(compacta), 'una pregunta de uso no lleva catálogo: la Ayuda basta');
  assert.ok(compacta.length < 2600, `ayuda compacta: ${compacta.length} caracteres`);
  const completa = await abrir({ profile: 'full' });
  const sc = sistema(await decir(completa.page, completa.aiRequests, '¿Cómo exporto el proyecto a Word?'));
  assert.ok(sc.length > 5000, `ayuda completa: ${sc.length} caracteres`);
  assert.deepEqual(errors, []); assert.deepEqual(completa.errors, []);
});

test('T68.11 servidor local en compacto: sin razonamiento y con tope de salida; si lo rechaza, un reintento sin esos campos y no se vuelve a probar', async () => {
  const { page, aiRequests, errors } = await abrir();
  let rechazos = 0;
  await page.context().route('http://localhost:11434/**', async (route) => {
    const req = route.request();
    if (req.method() === 'POST' && /reasoning_effort/.test(req.postData() || '')) {
      rechazos++;
      return route.fulfill({ status: 400, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: JSON.stringify({ error: { message: 'unknown field: reasoning_effort' } }) });
    }
    return route.fallback();
  });
  const primera = await decir(page, aiRequests, '¿Qué riesgos hay?', 'Riesgo A.');
  assert.equal(rechazos, 1);
  assert.equal(primera.reasoning_effort, undefined); assert.equal(primera.max_tokens, undefined);
  assert.match(await ultimoChat(page), /Riesgo A\./);
  await decir(page, aiRequests, '¿Y los pendientes?', 'Dos.');
  assert.equal(rechazos, 1, 'no vuelve a mandarlos');
  assert.deepEqual(errors.filter((e) => !/400/.test(e)), []);
});

test('T68.12 servidor local en compacto: reasoning_effort none, enable_thinking false y max_tokens (500 pendientes, 700 análisis, 900 chat); en completo y en la nube, nada', async () => {
  const { page, aiRequests, errors } = await abrir();
  const p = await rapida(page, aiRequests, 'pending', '- A');
  assert.equal(p.reasoning_effort, 'none'); assert.deepEqual(p.chat_template_kwargs, { enable_thinking: false }); assert.equal(p.max_tokens, 500);
  assert.equal((await rapida(page, aiRequests, 'summary', 'x')).max_tokens, 700);
  assert.equal((await decir(page, aiRequests, '¿Qué riesgos hay?')).max_tokens, 900);
  const nube = await page.evaluate(() => { db.settings.modelProfile = 'auto'; db.settings.activeProvider = 'openrouter'; db.settings.providers.openrouter.model = 'qwen/qwen3.5-4b'; return [modelProfile(), getActiveProvider().local === true]; });
  assert.deepEqual(nube, ['compact', false], 'un modelo pequeño en la nube también es compacto, pero no recibe parámetros de servidor local');
  assert.deepEqual(errors, []);
});

test('T68.13 los marcadores [[ACTION]] se leen con tolerancia: corchete simple, sin dos puntos, guion bajo y «clave: valor»; lo que no es una acción se deja', async () => {
  const { page, errors } = await abrir();
  const r = await page.evaluate(() => {
    const e = extractActionMarkers;
    return [
      e('Listo [ACTION: export format=txt]'),
      e('[[ACTION export format: pdf scope: all]] hecho'),
      e('[[ACCION: new_note version=9.9]]'),
      e('Aviso [ACTION REQUIRED] sigue siendo texto'),
      e('Mira [ACTION: volar-a-la-luna] aquí'),
      e('[[ACTION: write-note text="Nota: 10:30" note=2]]'),
    ];
  });
  assert.deepEqual(r[0].calls, [{ name: 'export', args: { format: 'txt' } }]);
  assert.equal(r[0].cleaned, 'Listo');
  assert.deepEqual(r[1].calls, [{ name: 'export', args: { format: 'pdf', scope: 'all' } }]);
  assert.equal(r[1].cleaned, 'hecho');
  assert.deepEqual(r[2].calls.map((c) => [c.name, c.args.version]), [['new-note', '9.9']]);
  assert.equal(r[3].calls.length, 0); assert.equal(r[3].cleaned, 'Aviso [ACTION REQUIRED] sigue siendo texto');
  assert.equal(r[4].calls.length, 0); assert.match(r[4].cleaned, /\[ACTION: volar-a-la-luna\]/);
  assert.deepEqual(r[5].calls[0].args, { text: 'Nota: 10:30', note: '2' });
  assert.deepEqual(errors, []);
});

test('T68.14 «extrae los pendientes», «resume el proyecto», «busca contradicciones» y «compara las últimas versiones» se ejecutan como su botón (cualquier perfil); «lista los pendientes» sigue siendo local', async () => {
  for (const profile of ['compact', 'full']) {
    const { page, aiRequests, errors } = await abrir({ profile });
    await decir(page, aiRequests, 'Por favor, extrae los pendientes de la nota activa', '- Tarea desde el atajo');
    const q = aiRequests.at(-1);
    assert.ok(usuario(q).includes(profile === 'compact' ? 'TASKS:' : 'Extrae las tareas pendientes o acciones requeridas'), `${profile}: pregunta canónica`);
    assert.ok((await pendientes(page)).includes('o Tarea desde el atajo'));
    assert.equal(await page.evaluate(() => getProject().chat.filter((m) => m.role === 'user').at(-1).text), 'Por favor, extrae los pendientes de la nota activa', 'el chat muestra lo que escribió el usuario');
    await decir(page, aiRequests, 'resume el proyecto');
    assert.ok(profile === 'compact' ? /Summarize the current state/.test(sistema(aiRequests.at(-1))) : /Resume el estado actual del proyecto/.test(usuario(aiRequests.at(-1))), `${profile}: resumen`);
    await decir(page, aiRequests, 'busca contradicciones');
    assert.ok(profile === 'compact' ? /Find contradictions/.test(sistema(aiRequests.at(-1))) : /Analiza el historial y detecta contradicciones/.test(usuario(aiRequests.at(-1))), `${profile}: contradicciones`);
    await decir(page, aiRequests, 'compara las últimas tres versiones');
    assert.ok(profile === 'compact' ? /Compare the notes below/.test(sistema(aiRequests.at(-1))) : /Compara las tres versiones más recientes/.test(usuario(aiRequests.at(-1))), `${profile}: cambios`);
    const antes = aiRequests.length;
    await page.fill('#aiInput', 'lista los pendientes'); await page.click('#aiSend');
    await page.waitForFunction(() => getProject().chat.some((m) => m.kind === 'action'));
    assert.equal(aiRequests.length, antes, `${profile}: «lista los pendientes» no llama al modelo`);
    assert.deepEqual(errors, []);
  }
});

test('T68.15 en inglés el compacto manda el mismo esquema y cierra con la regla de idioma inglés', async () => {
  const { page, aiRequests, errors } = await abrir({ lang: 'en' });
  const q = await decir(page, aiRequests, 'What changed in 1.3?', 'It changed.');
  assert.match(usuario(q), /DEVELOPER QUESTION: What changed in 1\.3\?\n\nAnswer in English only\.$/);
  assert.match(usuario(q), /PROJECT: Stratus Backup/);
  const p = await rapida(page, aiRequests, 'pending', 'NONE');
  assert.match(sistema(p), /Answer in English only\.$/);
  assert.match(await ultimoChat(page), /There are no pending tasks in the active note\./);
  assert.deepEqual(errors, []);
});
