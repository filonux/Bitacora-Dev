// F73–F74 · Small models, part 2 (part 1: f68): «Analizar cambios» in compact mode with a local sentence diff (T73.x), and compact rewrite and translation (T74.x).
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openApp, makeDb, sleep } from './helpers.mjs';

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });

const ISO = (d) => new Date(2026, 0, d).toISOString();
const S1 = 'Copias completas nocturnas a almacenamiento de objetos con cifrado en origen.';
const S2 = 'El objetivo de RPO es de 24 horas y el de RTO de 4 horas.';
const S2b = 'El objetivo de RPO es de 4 horas y el de RTO de 1 hora.';
const S3 = 'La verificación de las copias es manual y se hace una vez al mes.';
const S4 = 'Se añade un informe semanal con las copias fallidas.';
function proyecto({ textos = [`${S1} ${S2} ${S3}`, `${S1} ${S2b} ${S3} ${S4}`] } = {}) {
  const versions = textos.map((t, i) => ({ id: `p1-v${i + 1}`, version: `1.${i}`, instructions: t, revertsVersionId: '', createdAt: ISO(i + 1), updatedAt: ISO(i + 1) }));
  const stamp = ISO(28);
  return { id: 'p1', name: 'Stratus Backup', description: 'Copias de seguridad.', createdAt: stamp, updatedAt: stamp, versions, pending: [] };
}
let respuesta = '';
/** Opens the app with the given profile and model; `aiRequests` records each request that reaches the mock server. */
async function abrir({ profile = 'compact', model = 'qwen3.5:2b', p = proyecto(), lang = 'es' } = {}) {
  const seed = makeDb({ projects: [p], settings: { uiLang: lang, modelProfile: profile, providers: { ollama: { model } } } });
  return openApp(browser, { seed, lang, ai: async () => respuesta });
}
const sistema = (req) => req.messages.find((m) => m.role === 'system')?.content || '';
const usuario = (req) => req.messages.filter((m) => m.role === 'user').at(-1).content;
const chars = (req) => req.messages.reduce((n, m) => n + m.content.length, 0);
const api = (page, op, args) => page.evaluate(([o, a]) => BitacoraAPI[o](a), [op, args]);

test('T73.1 «Analizar cambios» compacto: solo las frases quitadas y añadidas, sistema corto, sin razonamiento y con tope de salida; el resultado lo fija el programa', async () => {
  const { page, aiRequests, errors } = await abrir();
  respuesta = 'Baja el RPO de 24 a 4 horas y el RTO de 4 a 1.\nSe añade un informe semanal de copias fallidas.';
  const r = await api(page, 'analyzeChanges', { id: 'p1-v2' });
  assert.deepEqual([r.ok, r.data.status], [true, 'changes'], JSON.stringify(r));
  assert.equal(aiRequests.length, 1);
  const req = aiRequests[0], usr = usuario(req);
  assert.equal(req.messages.length, 2);
  assert.ok(sistema(req).length < 600, `sistema de ${sistema(req).length} caracteres`);
  assert.match(usr, /^\[v1\.0\] → \[v1\.1\]\nREMOVED:\n- El objetivo de RPO es de 24 horas y el de RTO de 4 horas\.\nADDED:\n- El objetivo de RPO es de 4 horas y el de RTO de 1 hora\.\n- Se añade un informe semanal/);
  assert.ok(!usr.includes(S1) && !usr.includes(S3), 'las frases que no cambian no viajan');
  assert.ok(chars(req) < 1300, `petición de ${chars(req)} caracteres`);
  assert.equal(req.max_tokens, 450); assert.equal(req.reasoning_effort, 'none');
  assert.match(sistema(req), /Responde solo en español\.$/);
  assert.match(r.data.text, /RPO de 24 a 4/); assert.ok(!/RESULT/.test(r.data.text), 'la línea RESULT no se muestra');
  assert.deepEqual(errors, []);
});

test('T73.2 el modelo puede declarar RESULT: NO_RELATION o NO_CHANGES (también entre negritas) y se respeta', async () => {
  const { page, errors } = await abrir();
  respuesta = '**RESULT: NO_RELATION**\nLas dos notas hablan de trabajos distintos.';
  let r = await api(page, 'analyzeChanges', { id: 'p1-v2' });
  assert.deepEqual([r.data.status, r.data.text], ['no-relation', 'Las dos notas hablan de trabajos distintos.']);
  respuesta = 'RESULT: NO_CHANGES\nSolo cambia la redacción.';
  r = await api(page, 'analyzeChanges', { id: 'p1-v2', force: true });
  assert.equal(r.data.status, 'no-changes');
  assert.deepEqual(errors, []);
});

test('T73.3 notas iguales (salvo espacios y saltos de línea) no llaman al modelo: «sin cambios» al instante, también desde el botón', async () => {
  const p = proyecto({ textos: [`${S1} ${S2}`, `${S1}\n\n  ${S2}  `] });
  const { page, aiRequests, errors } = await abrir({ p });
  const r = await api(page, 'analyzeChanges', { id: 'p1-v2' });
  assert.deepEqual([r.ok, r.data.status], [true, 'no-changes'], JSON.stringify(r));
  assert.match(r.data.text, /mismo texto/);
  await page.evaluate(() => analyzeVersionChanges('p1-v2', { force: true }));
  await page.waitForFunction(() => versionAnalysis.status === 'done');
  assert.equal(await page.evaluate(() => versionAnalysis.analysisStatus), 'no-changes');
  assert.equal(aiRequests.length, 0);
  assert.deepEqual(errors, []);
});

test('T73.4 completo no cambia: el prompt de siempre con las dos notas enteras, sin parámetros de servidor local ni atajo de notas iguales', async () => {
  const { page, aiRequests, errors } = await abrir({ profile: 'full' });
  respuesta = 'RESULT: CHANGES\nCambia el RPO.';
  const r = await api(page, 'analyzeChanges', { id: 'p1-v2' });
  assert.equal(r.data.status, 'changes');
  const req = aiRequests[0];
  assert.match(sistema(req), /analista de historial/);
  assert.ok(usuario(req).includes(S3) && usuario(req).includes(S4), 'las dos notas van enteras');
  assert.deepEqual(Object.keys(req).sort(), ['messages', 'model', 'temperature']);
  assert.deepEqual(errors, []);
});

test('T73.5 noteDiff: frases cambiadas y añadidas; solo espacios o saltos = igual; una nota enorme no se atasca', async () => {
  const { page, errors } = await abrir();
  const r = await page.evaluate(() => {
    const big = (k) => Array.from({ length: 1800 }, (_, i) => `Frase número ${i} de la nota ${k === 'b' && i % 300 === 0 ? 'cambiada' : 'igual'}.`).join(' ');
    const t0 = performance.now(); const g = noteDiff(big('a'), big('b')); const ms = performance.now() - t0;
    return {
      mod: noteDiff('Uno. Dos. Tres.', 'Uno. Dos cambia. Tres. Cuatro.'),
      iguales: noteDiff('Uno.  Dos.\nTres.', 'Uno. Dos. Tres.').same,
      vacia: noteDiff('', 'Hola.'),
      gran: { removed: g.removed.length, added: g.added.length, ms },
    };
  });
  assert.deepEqual(r.mod, { same: false, removed: ['Dos.'], added: ['Dos cambia.', 'Cuatro.'] });
  assert.equal(r.iguales, true);
  assert.deepEqual(r.vacia, { same: false, removed: [], added: ['Hola.'] });
  assert.deepEqual([r.gran.removed, r.gran.added], [6, 6]);
  assert.ok(r.gran.ms < 1500, `${r.gran.ms} ms`);
  assert.deepEqual(errors, []);
});

test('T73.6 una reescritura total no desborda: cada lista tiene tope y avisa de lo omitido', async () => {
  const largo = (k) => Array.from({ length: 60 }, (_, i) => `Frase ${k} número ${i} con bastante texto de relleno para ocupar espacio.`).join(' ');
  const { page, aiRequests, errors } = await abrir({ p: proyecto({ textos: [largo('vieja'), largo('nueva')] }) });
  respuesta = 'Todo cambia.';
  await api(page, 'analyzeChanges', { id: 'p1-v2' });
  const usr = usuario(aiRequests[0]);
  assert.match(usr, /… \+\d+/);
  assert.ok(chars(aiRequests[0]) < 3200, `petición de ${chars(aiRequests[0])} caracteres`);
  assert.deepEqual(errors, []);
});

// ---- F74 · Compact rewrite and translation ----
const LARGA = Array.from({ length: 70 }, (_, i) => `Frase ${i} de una nota larga con bastante texto de relleno.`).join(' ');
const reescribir = (page, args) => page.evaluate((a) => BitacoraAPI.rewriteText(a), args);

test('T74.1 reescritura compacta: sistema corto, texto etiquetado, sin razonamiento y con tope de salida acorde al texto; la introducción del modelo se quita', async () => {
  const { page, aiRequests, errors } = await abrir();
  respuesta = 'Aquí tienes el texto reescrito:\n\nEl RPO objetivo es de 24 horas.';
  const r = await reescribir(page, { id: 'p1-v1', from: 0, to: S2.length + S1.length + 1, tone: 'concise' });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.data.text, 'El RPO objetivo es de 24 horas.');
  const req = aiRequests[0];
  assert.equal(req.messages.length, 2);
  assert.ok(sistema(req).length < 330, `sistema de ${sistema(req).length} caracteres`);
  assert.match(sistema(req), /Write in Spanish\.$/);
  assert.match(usuario(req), /^INSTRUCTION: Make it concise and direct[^\n]*\n\nTEXT:\n/);
  assert.ok(usuario(req).includes(S1) && !usuario(req).includes(S3), 'solo el fragmento seleccionado');
  const esperado = Math.min(1600, Math.max(200, Math.ceil(r.data.original.length / 2) + 100));
  assert.equal(req.max_tokens, esperado); assert.equal(req.reasoning_effort, 'none');
  assert.ok(!/<text>|<instruction>/.test(todoTexto(req)), 'sin etiquetas XML');
  assert.deepEqual(errors, []);
});
const todoTexto = (req) => req.messages.map((m) => m.content).join('\n');

test('T74.2 traducir compacto: instrucción corta en inglés y «Write in English»; el refinamiento usa la instrucción del usuario', async () => {
  const { page, aiRequests, errors } = await abrir();
  respuesta = 'Translation: The backup runs nightly.';
  // Like the UI: the rewrite stays pending and whatever is typed next in the chat refines it (the API closes it when done).
  await page.evaluate((n) => { window.__rw = rewriteSelection('translate', '', { versionId: 'p1-v1', start: 0, end: n }); }, S1.length);
  for (let i = 0; i < 100 && aiRequests.length < 1; i++) await sleep(50);
  await page.waitForFunction(() => !aiBusy);
  assert.equal(await page.evaluate(() => getProject().chat.findLast((m) => m.kind === 'rewrite-result').text), 'The backup runs nightly.');
  assert.match(usuario(aiRequests[0]), /^INSTRUCTION: Translate the TEXT into English\.\n\nTEXT:\n/);
  assert.match(sistema(aiRequests[0]), /Write in English\.$/);
  respuesta = 'Backups run every night.';
  await page.fill('#aiInput', 'más natural'); await page.click('#aiSend');
  for (let i = 0; i < 100 && aiRequests.length < 2; i++) await sleep(50);
  assert.match(usuario(aiRequests[1]), /^INSTRUCTION: más natural\n\nTEXT:\n/);
  assert.deepEqual(errors, []);
});

test('T74.3 una selección larga se recorta en compacto (2 200 caracteres, con aviso) y en completo no; aplicar reemplaza solo el tramo reescrito', async () => {
  const p = proyecto({ textos: [LARGA, LARGA] });
  const c = await abrir({ p });
  respuesta = 'Tramo reescrito.';
  const r = await reescribir(c.page, { id: 'p1-v2', from: 0, to: LARGA.length, tone: 'professional' });
  assert.equal(r.data.original.length, 2200);
  assert.ok(usuario(c.aiRequests[0]).length < 2300 + 60);
  assert.equal(await c.page.evaluate(() => getProject().chat.filter((m) => m.role === 'system' && /primeros 2200 caracteres/.test(m.text)).length), 1);
  const ap = await c.page.evaluate((id) => BitacoraAPI.applyRewrite({ messageId: id }), r.data.messageId);
  assert.equal(ap.ok, true, JSON.stringify(ap));
  const txt = await c.page.evaluate(() => getProject().versions[1].instructions);
  assert.equal(txt, 'Tramo reescrito.' + LARGA.slice(2200));
  const f = await abrir({ p: proyecto({ textos: [LARGA, LARGA] }), profile: 'full' });
  const rf = await reescribir(f.page, { id: 'p1-v2', from: 0, to: LARGA.length, tone: 'professional' });
  assert.equal(rf.data.original.length, LARGA.length);
  assert.match(sistema(f.aiRequests[0]), /precise text-rewriting engine/);
  assert.match(usuario(f.aiRequests[0]), /^<text>\n/);
  assert.deepEqual(Object.keys(f.aiRequests[0]).sort(), ['messages', 'model', 'temperature']);
  assert.deepEqual(c.errors, []); assert.deepEqual(f.errors, []);
});

test('T74.4 saneado de la respuesta: quita introducciones, etiquetas y comillas; no toca palabras del propio texto', async () => {
  const { page, errors } = await abrir();
  const r = await page.evaluate(() => [
    'Texto reescrito', "Here's the rewritten text:\nEl RPO baja a 4 horas.", 'Aquí tienes el texto reescrito:\n\nEl RPO baja.', 'Resultados finales de la prueba.',
    'Resultado: se añadió X', '<text>\nHola\n</text>', 'Sure! Here you go:\nHola', 'El resultado es:\n- A\n- B', 'Claro, aquí está:\nTexto limpio',
    '"Entre comillas"', '```\ncódigo\n```', 'Okta configurado:\nlos usuarios', 'Aquí tienes:', 'Translation: The backup runs nightly.',
  ].map(sanitizeRewriteOutput));
  assert.deepEqual(r, ['', 'El RPO baja a 4 horas.', 'El RPO baja.', 'Resultados finales de la prueba.', 'se añadió X', 'Hola', 'Hola', 'El resultado es:\n- A\n- B',
    'Texto limpio', 'Entre comillas', 'código', 'Okta configurado:\nlos usuarios', '', 'The backup runs nightly.']);
  assert.deepEqual(errors, []);
});
