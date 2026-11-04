// F61 · The assistant formats existing notes (format-note) and changes their version number (set-version), repeated numbers included.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openApp, makeDb, sampleProject } from './helpers.mjs';

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });

// Three notes: 1.0.0 and two with 2.0.0 (the real case the assistant could not move).
const seed = () => {
  const p = sampleProject({ id: 'p1', name: 'Pulsar Observability', n: 3 });
  ['1.0.0', '2.0.0', '2.0.0'].forEach((v, i) => { p.versions[i].version = v; });
  return makeDb({ projects: [p] });
};
let reply = '';
const abrir = () => openApp(browser, { seed: seed(), ai: async () => reply });
/** Sends `texto` (the model answers `resp`) and returns the meta of the last action card once it is no longer running. */
async function pedir(page, texto, resp) {
  const n = await page.evaluate(() => getProject().chat.filter((m) => m.kind === 'action').length);
  reply = resp;
  await page.fill('#aiInput', texto);
  await page.click('#aiSend');
  const h = await page.waitForFunction((n) => {
    const a = getProject().chat.filter((m) => m.kind === 'action');
    return a.length > n && a[a.length - 1].meta.state !== 'run' ? { ...a[a.length - 1].meta } : false;
  }, n);
  return h.jsonValue();
}
const versiones = (page) => page.evaluate(() => getProject().versions.map((v) => v.version));
const estilo = (page, i) => page.evaluate((i) => BitacoraAPI.getStyle({ id: getProject().versions[i].id }).data, i);
const marks = (page, i) => page.evaluate((i) => getProject().versions[i].marks, i);

test('T61.1 format-note da formato a toda una nota ya existente (tamaño, negrita, cursiva, subrayado, fuente) y la tarjeta lo resume', async () => {
  const { page, errors } = await abrir();
  const m = await pedir(page, 'pon la primera nota con tamaño de letra 16, negrita, subrayado, cursiva y tipo Mono', 'Hecho. [[ACCION: format-note note=#1 size=16 bold=true italic=true underline=true font=Mono]]');
  assert.equal(m.state, 'ok', m.result);
  assert.ok(m.result.includes('mono 16 B I U'), m.result);
  assert.deepEqual(await estilo(page, 0), { font: 'mono', size: 16, b: true, i: true, u: true, s: false });
  assert.equal((await estilo(page, 1)).b, false, 'las demás notas no cambian');
  assert.deepEqual(errors, []);
});

test('T61.2 format-note con fragment formatea solo ese trozo, sin note usa la nota abierta y bold=false lo quita', async () => {
  const { page, errors } = await abrir();
  let m = await pedir(page, 'pon en negrita nota2palabra3', '[[ACCION: format-note note=#2 fragment=nota2palabra3 bold=true]]');
  assert.equal(m.state, 'ok', m.result);
  const txt = await page.evaluate(() => getProject().versions[1].instructions), from = txt.indexOf('nota2palabra3');
  assert.deepEqual((await marks(page, 1)).map(({ from, to, b }) => ({ from, to, b })), [{ from, to: from + 'nota2palabra3'.length, b: true }]);
  assert.equal((await estilo(page, 1)).b, null, 'la nota mezcla negrita y texto normal');
  m = await pedir(page, 'quítale la negrita', '[[ACCION: format-note note=#2 fragment=NOTA2PALABRA3 bold=false]]');
  assert.equal(m.state, 'ok', m.result);
  assert.equal((await estilo(page, 1)).b, false);
  const sel = await page.evaluate(() => getProject().versions.findIndex((v) => v.id === selectedVersionId));
  assert.ok(sel >= 0);
  m = await pedir(page, 'cursiva a la nota abierta', '[[ACCION: dar-formato tamano=18 cursiva=si]]');
  assert.equal(m.state, 'ok', m.result);
  const e = await estilo(page, sel);
  assert.equal(e.size, 18); assert.equal(e.i, true);
  assert.deepEqual(errors, []);
});

test('T61.3 format-note rechaza tamaño o valor inválido, fragmento y nota inexistentes sin tocar nada', async () => {
  const { page, errors } = await abrir();
  const antes = JSON.stringify(await page.evaluate(() => getProject().versions.map((v) => v.marks)));
  for (const [resp, texto] of [['note=#1 size=15', '12|13|14|16|18|20|24'], ['note=#1 bold=quizás', 'bold'], ['note=#1 font=comic', 'sans|serif|mono'], ['note=#1 fragment=NoExiste bold=true', 'fragment'], ['note=#9 bold=true', '#9'], ['note=#1', 'style property']]) {
    const m = await pedir(page, 'formato raro', `[[ACCION: format-note ${resp}]]`);
    assert.equal(m.state, 'err', resp);
    assert.ok(m.result.includes(texto), `${resp} → ${m.result}`);
  }
  assert.equal(JSON.stringify(await page.evaluate(() => getProject().versions.map((v) => v.marks))), antes);
  assert.deepEqual(errors, []);
});

test('T61.4 set-version cambia el número aunque ya exista (todas las notas con ese número), o solo una por #posición o id', async () => {
  const { page, errors } = await abrir();
  let m = await pedir(page, 'la versión 2.0.0 tendría que ser la 1.0.0, haz el cambio', 'Hecho. [[ACCION: set-version note=2.0.0 version=1.0.0]]');
  assert.equal(m.state, 'ok', m.result);
  assert.ok(m.result.includes('2.0.0, 2.0.0 → 1.0.0'), m.result);
  assert.deepEqual(await versiones(page), ['1.0.0', '1.0.0', '1.0.0']);
  m = await pedir(page, 'la última, 1.1.0', '[[ACCION: set-version note=#3 version=1.1.0]]');
  assert.equal(m.state, 'ok', m.result);
  m = await pedir(page, 'la segunda, 1.0.1', '[[ACCION: cambiar-version note=p1-v2 version=1.0.1]]');
  assert.equal(m.state, 'ok', m.result);
  assert.deepEqual(await versiones(page), ['1.0.0', '1.0.1', '1.1.0']);
  for (const [args, texto] of [['note=9.9 version=3.0', '9.9'], ['note=#1', 'version'], ['note=#1 version=""', 'empty']]) {
    m = await pedir(page, 'cambia', `[[ACCION: set-version ${args}]]`);
    assert.equal(m.state, 'err', args);
    assert.ok(m.result.includes(texto), `${args} → ${m.result}`);
  }
  assert.deepEqual(await versiones(page), ['1.0.0', '1.0.1', '1.1.0']);
  assert.deepEqual(errors, []);
});

test('T61.5 nota nueva y formato en la misma respuesta: format-note sin note formatea la nota recién creada', async () => {
  const { page, errors } = await abrir();
  await pedir(page, 'crea la 3.0.0 en cursiva', '[[ACCION: new-note version=3.0.0 text="Hola mundo"]] [[ACCION: format-note italic=true font=serif]]');
  await page.waitForFunction(() => getProject().chat.filter((m) => m.kind === 'action' && m.meta.state === 'ok').length === 2);
  const n = (await versiones(page)).length;
  assert.equal(n, 4);
  assert.deepEqual(await estilo(page, 3), { font: 'serif', size: 14, b: false, i: true, u: false, s: false });
  assert.deepEqual(errors, []);
});

test('T61.6 el modelo recibe las dos acciones y la regla que lo dirige a set-version/format-note en vez de [[VERSION]]', async () => {
  const { page, aiRequests, errors } = await abrir();
  reply = 'Entendido.';
  await page.fill('#aiInput', 'dame formato a la nota');
  await page.click('#aiSend');
  await page.waitForFunction(() => getProject().chat.some((m) => m.role === 'assistant' && m.text === 'Entendido.'));
  const prompt = JSON.stringify(aiRequests[0].messages);
  for (const k of ['format-note', 'set-version', 'REGLA DE VERSIONES Y FORMATO']) assert.ok(prompt.includes(k), `falta «${k}» en el prompt`);
  assert.deepEqual(errors, []);
});

test('T61.7 duplicate-note copia la nota al final y set-reverts marca (o quita) la versión que revierte, con #posición', async () => {
  const { page, errors } = await abrir();
  let m = await pedir(page, 'duplica la primera', '[[ACCION: duplicate-note note=#1]]');
  assert.equal(m.state, 'ok', m.result);
  assert.equal(await page.evaluate(() => getProject().versions.length), 4);
  assert.equal(await page.evaluate(() => getProject().versions[3].instructions === getProject().versions[0].instructions), true);
  const rv = () => page.evaluate(() => getProject().versions[2].revertsVersionId);
  m = await pedir(page, 'la 3 revierte la 1', '[[ACCION: set-reverts note=#3 reverts=#1]]');
  assert.equal(m.state, 'ok', m.result);
  assert.equal(await rv(), 'p1-v1');
  m = await pedir(page, 'ya no revierte', '[[ACCION: set-reverts note=#3 reverts=none]]');
  assert.equal(m.state, 'ok', m.result);
  assert.equal(await rv(), '');
  m = await pedir(page, 'revierte una posterior', '[[ACCION: set-reverts note=#1 reverts=#3]]');
  assert.equal(m.state, 'err', 'solo puede revertir una versión anterior');
  m = await pedir(page, 'revierte algo que no existe', '[[ACCION: set-reverts note=#3 reverts=9.9]]');
  assert.equal(m.state, 'err');
  assert.ok(m.result.includes('9.9'), m.result);
  assert.deepEqual(errors, []);
});

test('T61.8 «cambia la versión X a Y» y «la versión X tendría que ser la Y, haz el cambio» se resuelven sin el modelo; si X no existe, la petición llega al modelo y no cambia nada', async () => {
  for (const orden of ['cambia la versión 2.0.0 a 1.0.0', 'la versión 2.0.0 tendría que ser la 1.0.0, haz el cambio']) {
    const { page, aiRequests, errors } = await abrir();
    const m = await pedir(page, orden, 'no debería llamarse');
    assert.equal(m.state, 'ok', m.result);
    assert.deepEqual(await versiones(page), ['1.0.0', '1.0.0', '1.0.0'], orden);
    assert.equal(aiRequests.length, 0, 'orden local: el modelo no interviene');
    assert.deepEqual(errors, []);
  }
  const { page, aiRequests } = await abrir();
  reply = 'No hay una versión 9.9.';
  await page.fill('#aiInput', 'cambia la versión 9.9 a 1.0');
  await page.click('#aiSend');
  await page.waitForFunction(() => getProject().chat.some((m) => m.role === 'assistant' && m.text === 'No hay una versión 9.9.'));
  assert.equal(aiRequests.length, 1);
  assert.deepEqual(await versiones(page), ['1.0.0', '2.0.0', '2.0.0']);
});

test('T61.9 las órdenes de formato claras se resuelven sin el modelo (nota abierta, nota por número, quitar); si el objetivo es ambiguo, la petición llega al modelo y no cambia nada', async () => {
  const { page, aiRequests, errors } = await abrir();
  const idx = await page.evaluate(() => getProject().versions.findIndex((v) => v.id === selectedVersionId));
  const otro = idx === 2 ? 1 : 2, resto = [0, 1, 2].find((i) => i !== idx && i !== otro);
  let m = await pedir(page, 'dale tamaño de letra 16, en negrita, subrayado y cursiva, tipo de letra Mono', 'no debería llamarse');
  assert.equal(m.state, 'ok', m.result);
  assert.deepEqual(await estilo(page, idx), { font: 'mono', size: 16, b: true, i: true, u: true, s: false });
  // «Quitar» goes before the numbered command: a command on another note leaves it open (F63), and «quita la negrita» without a note acts on the open one.
  m = await pedir(page, 'quita la negrita', 'x');
  assert.equal(m.state, 'ok', m.result);
  assert.equal((await estilo(page, idx)).b, false);
  m = await pedir(page, `ponle subrayado a la nota ${otro + 1}`, 'x');
  assert.equal(m.state, 'ok', m.result);
  assert.equal((await estilo(page, otro)).u, true);
  assert.equal(aiRequests.length, 0, 'órdenes locales: el modelo no interviene');
  for (const texto of ['pon tachado la palabra importante', 'ponle tachado a la nota del login', 'pon una nota nueva tachada']) {
    const n = await page.evaluate(() => getProject().chat.filter((x) => x.role === 'assistant').length);
    reply = 'Entendido.';
    await page.fill('#aiInput', texto);
    await page.click('#aiSend');
    await page.waitForFunction((n) => getProject().chat.filter((x) => x.role === 'assistant').length > n, n);
  }
  assert.equal(aiRequests.length, 3, 'lo ambiguo llega al modelo');
  for (const i of [idx, otro, resto]) assert.equal((await estilo(page, i)).s, false, `nota ${i + 1} sin tachar`);
  assert.deepEqual(errors, []);
});
