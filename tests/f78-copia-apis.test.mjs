// F78 · «Copia de las APIs» block in Settings (terminal look, footer icons) and its encryption checkbox (F79).
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { launch, openApp, makeDb, stored } from './helpers.mjs';
import { pedir, confirmar } from './helpers-asistente.mjs';

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });

const PASS = 'clave-segura-1';
const sembrado = (settings = {}) => makeDb({ settings: { activeProvider: 'openai', providers: { openai: { key: 'sk-SECRETA-123', model: 'gpt-x' } }, ...settings } });
const abrir = (settings = {}, opts = {}) => openApp(browser, { open: false, seed: sembrado(settings), ...opts });
const ajustes = (page) => page.evaluate(() => openSettings());
const descargar = async (page, accion) => {
  const [dl] = await Promise.all([page.waitForEvent('download'), accion()]);
  return { name: dl.suggestedFilename(), raw: fs.readFileSync(await dl.path(), 'utf8') };
};
const toastTxt = (page) => page.locator('#toast').textContent();
const error = (page) => page.evaluate(() => { const e = document.querySelector('#passError'); return e && !e.hidden ? e.textContent : ''; });
const subir = (page, raw) => page.setInputFiles('#importProvidersFile', { name: 'apis.json', mimeType: 'application/json', buffer: Buffer.from(raw) });
const contarDescargas = (page) => { const n = { v: 0 }; page.on('download', () => { n.v++; }); return n; };

for (const [lang, rotulos] of [['es', ['Copia de las APIs', 'Exportar APIs', 'Importar APIs', 'Cifrar el archivo con contraseña']], ['en', ['APIs backup', 'Export APIs', 'Import APIs', 'Encrypt the file with a password']]]) {
  test(`T78.1 el bloque tiene estilo de terminal, los iconos del pie y controles para agentes (${lang})`, async () => {
    const { page, errors, ctx } = await abrir({}, { lang });
    await ajustes(page);
    const r = await page.evaluate(() => {
      const b = document.querySelector('#apisIoBlock'), head = b.querySelector('.copy-head'), ex = b.querySelector('#exportProvidersBtn'), im = b.querySelector('#importProvidersBtn'), chk = b.querySelector('#encryptApiExportChk');
      const icono = (el) => el.querySelector('svg').innerHTML;
      return {
        head: head.textContent.trim(), prompt: getComputedStyle(head, '::before').content, mono: /monospace/.test(getComputedStyle(head).fontFamily),
        ex: ex.textContent.trim(), im: im.textContent.trim(), chk: b.querySelector('#encryptApiExportLabel').textContent.trim(),
        iconoEx: icono(ex) === icono(document.querySelector('#exportBtn')), iconoIm: icono(im) === icono(document.querySelector('#importBtn')),
        tilesBloque: b.querySelectorAll('.tile').length, tilesPie: document.querySelectorAll('.sidebar-footer .tile').length,
        agentes: [ex, im, chk].map((e) => e.dataset.agent), etiquetas: [ex, im, chk].map((e) => e.getAttribute('aria-label')),
        antesDeAjustes: !!(b.compareDocumentPosition(document.querySelector('.settings-grid')) & Node.DOCUMENT_POSITION_FOLLOWING),
        ayuda: b.querySelector('#apisIoHelp').textContent.length > 20,
      };
    });
    assert.equal(r.head, rotulos[0]);
    assert.equal(r.prompt, '"$"');
    assert.ok(r.mono);
    assert.deepEqual([r.ex, r.im, r.chk], rotulos.slice(1));
    assert.deepEqual([r.iconoEx, r.iconoIm], [true, true], 'mismos iconos que Exportar e Importar del pie');
    assert.deepEqual([r.tilesBloque, r.tilesPie], [0, 4], 'los botones del bloque no son .tile: el pie sigue con sus cuatro');
    assert.deepEqual(r.agentes, ['apis-export', 'apis-import', 'apis-encrypt']);
    assert.deepEqual(r.etiquetas, rotulos.slice(1));
    assert.ok(r.antesDeAjustes && r.ayuda);
    assert.deepEqual(errors, []);
    await ctx.close();
  });
}

test('T78.2 el bloque cabe sin desbordar a 1280, 390 y 320 px: dos botones en fila y, con ≤ 420 px, apilados', async () => {
  const { page, errors, ctx } = await abrir();
  await ajustes(page);
  for (const [w, fila] of [[1280, true], [390, false], [320, false]]) {
    await page.setViewportSize({ width: w, height: 800 });
    await page.waitForTimeout(150);
    const r = await page.evaluate(() => {
      const body = document.querySelector('.settings-body'), b = document.querySelector('#apisIoBlock').getBoundingClientRect();
      const ex = document.querySelector('#exportProvidersBtn').getBoundingClientRect(), im = document.querySelector('#importProvidersBtn').getBoundingClientRect();
      return { desborda: body.scrollWidth > body.clientWidth + 1, dentro: ex.left >= b.left - 0.5 && im.right <= b.right + 0.5, mismaFila: Math.abs(ex.top - im.top) < 2, altoMin: Math.min(ex.height, im.height) };
    });
    assert.equal(r.desborda, false, `desborda a ${w} px`);
    assert.ok(r.dentro, `botones fuera del bloque a ${w} px`);
    assert.equal(r.mismaFila, fila, `disposición a ${w} px`);
    assert.ok(r.altoMin >= 40, `botones bajos a ${w} px`);
  }
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('T78.3 sin la casilla, Exportar APIs descarga directo y sin diálogo; el archivo lleva las claves y el aviso lo dice', async () => {
  const { page, errors, ctx } = await abrir();
  await ajustes(page);
  assert.equal(await page.locator('#encryptApiExportChk').isChecked(), false);
  assert.match(await page.locator('#encryptApiExportHelp').textContent(), /texto plano/);
  const d = await descargar(page, () => page.click('#exportProvidersBtn'));
  assert.match(d.name, /^bitacora-apis-\d{4}-\d{2}-\d{2}\.json$/);
  const j = JSON.parse(d.raw);
  assert.deepEqual([j.type, j.v, j.activeProvider, j.providers.openai.key], ['bitacora-dev-providers', 1, 'openai', 'sk-SECRETA-123']);
  assert.equal(await page.evaluate(() => document.querySelector('#modalLayer').classList.contains('open')), false);
  assert.match(await toastTxt(page), /texto plano/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('T78.4 la casilla se guarda en los ajustes, cambia el aviso y sobrevive a otra apertura de Configuración', async () => {
  const { page, errors, ctx } = await abrir();
  await ajustes(page);
  await page.check('#encryptApiExportChk');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('bitacora-dev-v2')).settings.encryptApiExport === true);
  assert.match(await page.locator('#encryptApiExportHelp').textContent(), /AES-256/);
  await page.evaluate(() => { closeSettings(); openSettings(); });
  assert.equal(await page.locator('#encryptApiExportChk').isChecked(), true);
  await page.uncheck('#encryptApiExportChk');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('bitacora-dev-v2')).settings.encryptApiExport === false);
  assert.match(await page.locator('#encryptApiExportHelp').textContent(), /texto plano/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('T78.5 con la casilla, cada exportación pide contraseña con confirmación; Cancelar no escribe nada y el archivo sale cifrado', async () => {
  const { page, errors, ctx } = await abrir({ encryptApiExport: true });
  const n = contarDescargas(page);
  await ajustes(page);
  await page.click('#exportProvidersBtn');
  await page.waitForSelector('.modal-pass');
  assert.equal(await page.locator('#passConfirm').count(), 1, 'pide confirmación');
  assert.match(await page.locator('.modal-head h3').textContent(), /Exportar configuración de APIs/);
  await page.fill('#passInput', 'corta'); await page.fill('#passConfirm', 'corta'); await page.keyboard.press('Enter');
  assert.match(await error(page), /al menos 8/);
  await page.fill('#passInput', PASS); await page.fill('#passConfirm', 'otra-clave-99'); await page.keyboard.press('Enter');
  assert.match(await error(page), /no coinciden/);
  await page.click('.modal-foot .btn.ghost');
  await page.waitForTimeout(300);
  assert.equal(n.v, 0, 'Cancelar no descarga nada');
  await page.click('#exportProvidersBtn');
  await page.waitForSelector('.modal-pass');
  await page.fill('#passInput', PASS); await page.fill('#passConfirm', PASS);
  const d = await descargar(page, () => page.keyboard.press('Enter'));
  const env = JSON.parse(d.raw);
  assert.deepEqual([env.type, env.v, env.kdf, env.iterations], ['bitacora-dev-providers-enc', 2, 'PBKDF2-SHA256', 600000]);
  assert.ok(!d.raw.includes('sk-SECRETA') && !d.raw.includes('openai'), 'nada legible en el archivo');
  const dentro = await page.evaluate(async ({ env, PASS }) => JSON.parse(await decryptEnvelope(env, PASS)), { env, PASS });
  assert.equal(dentro.providers.openai.key, 'sk-SECRETA-123');
  assert.match(await toastTxt(page), /cifradas/);
  await page.waitForFunction(() => !document.querySelector('.modal-pass'));
  await page.click('#exportProvidersBtn');
  await page.waitForSelector('#passInput');
  assert.equal(await page.locator('#passInput').inputValue(), '', 'la contraseña no se recuerda: se pide cada vez');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('T78.6 ida y vuelta: lo exportado cifrado se importa pidiendo la contraseña, que si es errónea no pierde el archivo', async () => {
  const { page, errors, ctx } = await abrir({ encryptApiExport: true });
  await ajustes(page);
  await page.click('#exportProvidersBtn');
  await page.waitForSelector('.modal-pass');
  await page.fill('#passInput', PASS); await page.fill('#passConfirm', PASS);
  const d = await descargar(page, () => page.keyboard.press('Enter'));
  await page.evaluate(() => { db.settings.providers.openai.key = ''; db.settings.activeProvider = 'none'; });
  await subir(page, d.raw);
  await page.waitForSelector('.modal-pass');
  assert.equal(await page.locator('#passConfirm').count(), 0, 'al importar solo se pide una vez');
  await page.fill('#passInput', 'incorrecta-123'); await page.keyboard.press('Enter');
  await page.waitForFunction(() => !document.querySelector('#passError').hidden);
  await page.fill('#passInput', PASS); await page.keyboard.press('Enter');
  await page.waitForFunction(() => db.settings.providers.openai.key === 'sk-SECRETA-123');
  assert.equal(await page.evaluate(() => db.settings.activeProvider), 'openai');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('T78.7 sin Web Crypto: la casilla no se puede activar, y si ya estaba activa no se escribe nada en claro (pero se puede quitar)', async () => {
  const sinCrypto = (page) => page.evaluate(() => { Object.defineProperty(crypto, 'subtle', { get: () => undefined, configurable: true }); renderCopyBlocks(); });
  const a = await abrir();
  await ajustes(a.page); await sinCrypto(a.page);
  assert.equal(await a.page.locator('#encryptApiExportChk').isDisabled(), true);
  assert.match(await a.page.locator('#encryptApiExportHelp').textContent(), /no está disponible/);
  assert.deepEqual(a.errors, []);
  await a.ctx.close();
  const { page, errors, ctx } = await abrir({ encryptApiExport: true });
  const n = contarDescargas(page);
  await ajustes(page); await sinCrypto(page);
  assert.equal(await page.locator('#encryptApiExportChk').isDisabled(), false, 'se puede quitar');
  await page.click('#exportProvidersBtn');
  await page.waitForFunction(() => /no está disponible/.test(document.querySelector('#toast').textContent));
  await page.waitForTimeout(300);
  assert.equal(await page.locator('.modal-pass').count(), 0);
  assert.equal(n.v, 0, 'sin cifrado no se escribe el archivo en claro');
  await page.uncheck('#encryptApiExportChk');
  const d = await descargar(page, () => page.click('#exportProvidersBtn'));
  assert.equal(JSON.parse(d.raw).type, 'bitacora-dev-providers');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('T78.8 ajustes de cifrado: se normalizan, no salen en la copia de seguridad, importar una no los pisa y Restaurar no los toca', async () => {
  const { page, errors, ctx } = await abrir({ encryptApiExport: true, encryptBackup: true, backupPassword: 'clave-copia-1' });
  const r = await page.evaluate(() => {
    const pick = (s) => { const x = normalizeDb({ projects: [], settings: s }).settings; return [x.encryptApiExport, x.encryptBackup, x.backupPassword]; };
    const copia = JSON.parse(redactedDbJson());
    const prev = importDatabaseObject({ projects: [], settings: { encryptApiExport: false, encryptBackup: false, backupPassword: '' } });
    return {
      basura: pick({ encryptApiExport: 'sí', encryptBackup: 1, backupPassword: 'x' }), buena: pick({ encryptBackup: true, backupPassword: 'clave-1234' }),
      sinCifrado: pick({ encryptBackup: false, backupPassword: 'olvidada' }), numero: pick({ encryptBackup: true, backupPassword: 12345678 }),
      copia: LOCAL_ONLY_SETTINGS.map((k) => k in copia.settings), claro: JSON.stringify(copia).includes('clave-copia-1'),
      trasImportar: LOCAL_ONLY_SETTINGS.map((k) => db.settings[k]),
    };
  });
  assert.deepEqual(r.basura, [false, false, '']);
  assert.deepEqual(r.buena, [false, true, 'clave-1234']);
  assert.deepEqual(r.sinCifrado, [false, false, ''], 'sin cifrado no queda una contraseña olvidada');
  assert.deepEqual(r.numero, [false, true, ''], 'la contraseña es siempre texto');
  assert.deepEqual(r.copia, [false, false, false]);
  assert.equal(r.claro, false, 'la contraseña no viaja en la copia');
  assert.deepEqual(r.trasImportar, [true, true, 'clave-copia-1']);
  await page.evaluate(() => resetSettings());
  await page.click('.modal-foot .btn:last-child');
  await page.waitForFunction(() => db.settings.autosave === 'on');
  assert.deepEqual(await page.evaluate(() => LOCAL_ONLY_SETTINGS.map((k) => db.settings[k])), [true, true, 'clave-copia-1']);
  assert.deepEqual(errors, []);
  await ctx.close();
});

const api = (page, op, args = {}) => page.evaluate(([o, a]) => window.BitacoraAPI[o](a), [op, args]);

test('T78.9 API: exportApis e importApis (sin cifrar): el archivo lleva las claves; importar exige confirm y valida; una clave vacía no borra la guardada; nada devuelve la contraseña', async () => {
  const { page, errors, ctx } = await abrir();
  const ops = await page.evaluate(() => Object.fromEntries(BitacoraAPI.describe().operations.filter((o) => /Apis?Encryption|BackupEncryption|^(export|import)Apis$/.test(o.name)).map((o) => [o.name, o.async])));
  assert.deepEqual(ops, { exportApis: true, importApis: true, setApiEncryption: false, setBackupEncryption: false });
  const ex = await api(page, 'exportApis');
  assert.equal(ex.ok, true);
  assert.equal(ex.data.encrypted, false);
  assert.match(ex.data.filename, /^bitacora-apis-\d{4}-\d{2}-\d{2}\.json$/);
  const plano = JSON.parse(ex.data.json);
  assert.deepEqual([plano.type, plano.v, plano.activeProvider, plano.providers.openai.key], ['bitacora-dev-providers', 1, 'openai', 'sk-SECRETA-123']);
  const { name, raw } = await descargar(page, () => api(page, 'exportApis', { download: true }));
  assert.equal(name, ex.data.filename);
  assert.equal(JSON.parse(raw).providers.openai.key, 'sk-SECRETA-123');
  assert.equal((await api(page, 'exportApis', { password: 5 })).error.code, 'invalid-argument');
  assert.equal((await api(page, 'exportApis', { password: 'corta' })).error.code, 'weak-password');
  const archivo = { type: 'bitacora-dev-providers', providers: { openai: { key: '', model: 'gpt-nuevo' }, ollama: { model: 'llama3.1' } }, activeProvider: 'ollama' };
  assert.equal((await api(page, 'importApis', { json: archivo })).error.code, 'confirm-required');
  for (const [json, code] of [['{no', 'invalid-json'], ['null', 'invalid-apis-file'], [{ foo: 1 }, 'invalid-apis-file'], [{ providers: { inexistente: { key: 'x' } } }, 'invalid-apis-file'], [{ providers: [] }, 'invalid-apis-file']]) {
    assert.equal((await api(page, 'importApis', { json, confirm: true })).error.code, code, JSON.stringify(json));
  }
  assert.equal(await page.evaluate(() => db.settings.activeProvider), 'openai', 'lo inválido no cambia nada');
  const im = await api(page, 'importApis', { json: JSON.stringify(archivo), confirm: true });
  assert.equal(im.ok, true);
  assert.deepEqual([[...im.data.providers].sort(), im.data.activeProvider], [['ollama', 'openai'], 'ollama']);
  assert.equal(JSON.stringify(im).includes('sk-SECRETA'), false, 'la respuesta no devuelve claves');
  assert.deepEqual(await page.evaluate(() => [db.settings.providers.openai.key, db.settings.providers.openai.model, db.settings.providers.ollama.model, db.settings.activeProvider]), ['sk-SECRETA-123', 'gpt-nuevo', 'llama3.1', 'ollama']);
  const st = (await api(page, 'state')).data;
  assert.deepEqual([st.encryptApis, st.encryptBackup, st.backupPasswordSet], [false, false, false]);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('T78.10 asistente: «exporta las APIs» pide permiso (saldrían en texto plano) y baja el archivo; «importa la copia de las APIs» abre el selector de las APIs y no el de la bitácora; sin llamar al modelo', async () => {
  const { page, errors, ctx, aiRequests } = await abrir({}, { open: true, ai: async () => 'No debería llamarse.' });
  const n = contarDescargas(page);
  let m = await pedir(page, 'exporta las APIs');
  assert.deepEqual([m.name, m.state, m.perm], ['export-apis', 'ask', 'confirm']);
  assert.match(await page.locator('#aiMessages').innerText(), /texto plano/);
  assert.equal((await confirmar(page, 'no')).state, 'cancel');
  await page.waitForTimeout(200);
  assert.equal(n.v, 0, 'Cancelar no descarga nada');
  await pedir(page, 'exporta las APIs');
  const [dl, hecho] = await Promise.all([page.waitForEvent('download'), confirmar(page)]);
  const j = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
  assert.deepEqual([hecho.state, j.type, j.providers.openai.key], ['ok', 'bitacora-dev-providers', 'sk-SECRETA-123']);
  assert.match(hecho.result, /sin cifrar/);
  m = await pedir(page, 'importa la copia de las APIs');
  assert.deepEqual([m.name, m.state, m.perm], ['import-apis', 'ask', 'file']);
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#aiMessages [data-act="go"]').last().click()]);
  assert.equal(await fc.element().evaluate((e) => e.id), 'importProvidersFile', 'es el selector de las APIs, no el de la bitácora');
  await fc.setFiles({ name: 'apis.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ type: 'bitacora-dev-providers', providers: { openai: { key: '', model: 'gpt-nuevo' } }, activeProvider: 'openai' })) });
  await page.waitForFunction(() => db.settings.providers.openai.model === 'gpt-nuevo');
  assert.equal(await page.evaluate(() => db.settings.providers.openai.key), 'sk-SECRETA-123', 'una clave vacía no borra la guardada');
  assert.equal(aiRequests.length, 0, 'las dos órdenes se resuelven sin modelo');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('T78.11 órdenes locales de APIs y cifrado (ES/EN): se reconocen antes que «importar» y «exportar»; con proyecto o nota, dos objetos o una pregunta, el asunto va al modelo', async () => {
  const { page, errors, ctx } = await abrir({}, { open: true });
  const casos = [
    ['exporta las APIs', 'export-apis', {}], ['descarga mis claves', 'export-apis', {}], ['haz una copia de las APIs', 'export-apis', {}], ['exporta las APIs en texto plano', 'export-apis', {}],
    ['exporta las APIs cifradas', 'export-apis', { encrypted: 'true' }], ['export my API keys with a password', 'export-apis', { encrypted: 'true' }], ['back up the API keys', 'export-apis', {}],
    ['importa la copia de las APIs', 'import-apis', {}], ['restaura las APIs', 'import-apis', {}], ['load my API keys', 'import-apis', {}],
    ['activa el cifrado de las APIs', 'set-apis-encryption', { state: 'on' }], ['cifra las APIs', 'set-apis-encryption', { state: 'on' }],
    ['desactiva el cifrado de las APIs', 'set-apis-encryption', { state: 'off' }], ['turn off API encryption', 'set-apis-encryption', { state: 'off' }],
    ['cifra la copia de seguridad', 'set-backup-encryption', { state: 'on' }], ['quita la contraseña de la copia', 'set-backup-encryption', { state: 'off' }], ['turn on backup encryption', 'set-backup-encryption', { state: 'on' }],
    ['cambia la contraseña de la copia de seguridad', 'change-backup-password', {}], ['change the backup password', 'change-backup-password', {}],
    // The usual commands are unchanged.
    ['importa la copia de seguridad', 'import', {}], ['importa la copia cifrada', 'import', {}], ['haz una copia de seguridad', 'backup', {}], ['exporta todo en txt', 'export', { format: 'txt', scope: 'all' }],
  ];
  const nulos = ['haz una copia de seguridad cifrada', 'exporta las APIs y la copia de seguridad', 'exporta las APIs del proyecto', 'exporta las claves de la nota 1.0', 'borra las claves de las APIs', 'quita la copia de seguridad', 'cambia la contraseña', '¿cómo exporto las APIs?'];
  const r = await page.evaluate(([c, n]) => ({ c: c.map(([t]) => localActionCalls(t)), n: n.map((t) => localActionCalls(t)) }), [casos, nulos]);
  casos.forEach(([t, nombre, args], i) => assert.deepEqual(r.c[i], [{ name: nombre, args }], t));
  nulos.forEach((t, i) => assert.equal(r.n[i], null, t));
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('T78.12 importar APIs normaliza cada proveedor como la copia de seguridad: lo que no es texto no llega a los ajustes y el resto se limpia', async () => {
  const { page, errors, ctx } = await abrir();
  const archivo = { type: 'bitacora-dev-providers', v: 1, activeProvider: 'openai', providers: {
    openai: { key: 12345, model: { x: 1 }, baseUrl: ['https://evil.example'], availableModels: ['gpt-a', 7, null, '', '  gpt-b  ', 'gpt-a'], name: { n: 1 }, kind: 'otro', local: 'sí', extra: 'no-debe-quedar' },
    ollama: { model: '  llama3.1  ', baseUrl: 'http://localhost:11434/v1//', key: null, availableModels: 'no-es-lista' },
  } };
  const im = await api(page, 'importApis', { json: archivo, confirm: true });
  assert.equal(im.ok, true);
  const esperado = {
    openai: { name: 'OpenAI', kind: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-x', key: 'sk-SECRETA-123', local: false, availableModels: ['gpt-a', 'gpt-b'] },
    ollama: { name: 'Ollama', kind: 'openai', baseUrl: 'http://localhost:11434/v1', model: 'llama3.1', key: 'ollama', local: true },
  };
  const ajustes = await page.evaluate(() => structuredClone(db.settings.providers));
  const guardado = (await stored(page)).settings.providers;
  for (const id of Object.keys(esperado)) {
    assert.deepEqual(ajustes[id], esperado[id], `${id} en memoria`);
    assert.deepEqual(guardado[id], esperado[id], `${id} guardado`);
  }
  assert.deepEqual(errors, []);
  await ctx.close();
});
