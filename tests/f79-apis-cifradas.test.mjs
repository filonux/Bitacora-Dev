// F79 · Password-encryption core (shared by the APIs and the backup), openModal({onClose}) and the password dialog.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { launch, openApp, makeDb, sampleProject } from './helpers.mjs';
import { pedir, confirmar } from './helpers-asistente.mjs';

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });

const abrir = () => openApp(browser, { open: false });
const PASS = 'clave-segura-1';

test('T79.1 el sobre v2 cifra y descifra; no deja el texto a la vista y cada cifrado usa sal y vector nuevos', async () => {
  const { page, errors, ctx } = await abrir();
  const texto = 'sk-SECRETA-123 · ñ 日本語';
  const r = await page.evaluate(async ({ texto, PASS }) => {
    const a = await encryptEnvelope(ENC_TYPES.apis, texto, PASS), b = await encryptEnvelope(ENC_TYPES.apis, texto, PASS);
    return { a, b, back: await decryptEnvelope(a, PASS), len: [atob(a.salt).length, atob(a.iv).length] };
  }, { texto, PASS });
  assert.deepEqual([r.a.type, r.a.v, r.a.kdf, r.a.iterations], ['bitacora-dev-providers-enc', 2, 'PBKDF2-SHA256', 600000]);
  assert.deepEqual(r.len, [16, 12]);
  assert.equal(r.back, texto);
  assert.ok(!JSON.stringify(r.a).includes('SECRETA'));
  assert.notEqual(r.a.salt, r.b.salt);
  assert.notEqual(r.a.iv, r.b.iv);
  assert.notEqual(r.a.data, r.b.data);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('T79.2 contraseña errónea o archivo alterado (datos, sal, vector, tipo, iteraciones): siempre «decrypt»', async () => {
  const { page, errors, ctx } = await abrir();
  const r = await page.evaluate(async (PASS) => {
    const env = await encryptEnvelope(ENC_TYPES.backup, 'hola', PASS);
    const code = async (e, p = PASS) => { try { await decryptEnvelope(e, p); return 'ok'; } catch (x) { return x.message; } };
    const flip = (b64) => { const a = [...atob(b64)]; a[0] = String.fromCharCode(a[0].charCodeAt(0) ^ 1); return btoa(a.join('')); };
    return {
      buena: await code(env), mala: await code(env, 'otra-clave-123'),
      tipo: await code({ ...env, type: ENC_TYPES.apis }), iter: await code({ ...env, iterations: env.iterations + 1 }),
      data: await code({ ...env, data: flip(env.data) }), sal: await code({ ...env, salt: flip(env.salt) }), iv: await code({ ...env, iv: flip(env.iv) }),
    };
  }, PASS);
  assert.deepEqual(r, { buena: 'ok', mala: 'decrypt', tipo: 'decrypt', iter: 'decrypt', data: 'decrypt', sal: 'decrypt', iv: 'decrypt' });
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('T79.3 la contraseña se normaliza (NFC), se cuenta en caracteres y no se cifra con menos de 8', async () => {
  const { page, errors, ctx } = await abrir();
  const r = await page.evaluate(async () => {
    const comp = 'caf\u00e9-secreto', deco = 'cafe\u0301-secreto';
    const e1 = await encryptEnvelope(ENC_TYPES.apis, 'uno', comp), e2 = await encryptEnvelope(ENC_TYPES.apis, 'dos', deco);
    const code = async (f) => { try { await f(); return 'ok'; } catch (x) { return x.message; } };
    return {
      a: await decryptEnvelope(e1, deco), b: await decryptEnvelope(e2, comp),
      len: [passLength('1234567'), passLength('12345678'), passLength('😀'.repeat(8)), passLength('e\u0301'.repeat(8)), passLength(null)],
      corta: await code(() => encryptEnvelope(ENC_TYPES.apis, 'x', '1234567')), vacia: await code(() => encryptEnvelope(ENC_TYPES.apis, 'x', '')),
      nula: await code(() => encryptEnvelope(ENC_TYPES.apis, 'x', null)), tipo: await code(() => encryptEnvelope('otro', 'x', 'clave-segura-1')),
    };
  });
  assert.deepEqual([r.a, r.b], ['uno', 'dos']);
  assert.deepEqual(r.len, [7, 8, 8, 8, 0]);
  assert.deepEqual([r.corta, r.vacia, r.nula, r.tipo], ['weak-password', 'weak-password', 'weak-password', 'bad-type']);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('T79.4 los archivos de APIs v1 (sin datos autenticados, contraseña sin normalizar, desde 6 caracteres) se siguen leyendo', async () => {
  const { page, errors, ctx } = await abrir();
  const r = await page.evaluate(async () => {
    const enc = new TextEncoder(), b64 = (u) => btoa(String.fromCharCode(...u));
    const hacer = async (pw, iterations, extra = {}) => {
      const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
      const base = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveKey']);
      const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
      const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode('{"providers":{}}')));
      return { type: 'bitacora-dev-providers-enc', kdf: 'PBKDF2-SHA256', iterations, salt: b64(salt), iv: b64(iv), data: b64(data), ...extra };
    };
    const corta = await hacer('abc123', 1000, { v: 1 }), deco = await hacer('cafe\u0301123', 1000), code = async (f) => { try { return await f(); } catch (x) { return x.message; } };
    return {
      corta: await decryptEnvelope(corta, 'abc123'), sinV: await decryptEnvelope((({ v, ...o }) => o)(corta), 'abc123'),
      tal: await decryptEnvelope(deco, 'cafe\u0301123'), nfc: await decryptEnvelope(deco, 'caf\u00e9123'),
      mala: await code(() => decryptEnvelope(corta, 'abc124')), copia: await code(() => parseEnvelope({ ...corta, type: ENC_TYPES.backup }).v),
    };
  });
  assert.deepEqual(r, { corta: '{"providers":{}}', sinV: '{"providers":{}}', tal: '{"providers":{}}', nfc: '{"providers":{}}', mala: 'decrypt', copia: 'format' });
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('T79.5 parseEnvelope rechaza lo mal formado sin derivar nada (kdf, iteraciones, sal, vector, base64, versión, tipo)', async () => {
  const { page, errors, ctx } = await abrir();
  const r = await page.evaluate(async (PASS) => {
    const env = await encryptEnvelope(ENC_TYPES.apis, '{}', PASS), b = (n) => btoa('x'.repeat(n));
    const f = (o) => { try { parseEnvelope({ ...env, ...o }); return 'ok'; } catch (e) { return e.message; } };
    return {
      base: f({}), kdf: f({ kdf: 'otro' }), it0: f({ iterations: 0 }), itMax: f({ iterations: 5000001 }), itFrac: f({ iterations: 1.5 }), itTexto: f({ iterations: '600000' }),
      sal: f({ salt: b(15) }), iv: f({ iv: b(13) }), b64: f({ data: '***' }), v3: f({ v: 3 }), tipo: f({ type: 'otro' }),
      forma: [isEncEnvelope(null), isEncEnvelope({}), isEncEnvelope({ type: ENC_TYPES.apis }), isEncEnvelope(env)],
    };
  }, PASS);
  assert.deepEqual(r, { base: 'ok', kdf: 'format', it0: 'format', itMax: 'format', itFrac: 'format', itTexto: 'format', sal: 'format', iv: 'format', b64: 'format', v3: 'format', tipo: 'format', forma: [false, false, false, true] });
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('T79.6 sin Web Crypto no se cifra ni se descifra: error «crypto-unavailable» y nada se escribe en claro', async () => {
  const { page, errors, ctx } = await abrir();
  const r = await page.evaluate(async (PASS) => {
    Object.defineProperty(crypto, 'subtle', { get: () => undefined, configurable: true });
    const code = async (f) => { try { await f(); return 'ok'; } catch (x) { return x.message; } };
    return {
      ok: cryptoOk(), enc: await code(() => encryptEnvelope(ENC_TYPES.apis, 'x', PASS)), dec: await code(() => decryptEnvelope({ type: ENC_TYPES.apis, v: 2 }, PASS)),
      texto: encErrorText(new Error('crypto-unavailable')),
    };
  }, PASS);
  assert.deepEqual([r.ok, r.enc, r.dec], [false, 'crypto-unavailable', 'crypto-unavailable']);
  assert.match(r.texto, /no está disponible/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('T79.7 openModal({onClose}) avisa una sola vez, se cierre como se cierre (Esc, ×, fuera, botón, otro diálogo, closeModal)', async () => {
  const { page, errors, ctx } = await abrir();
  const abrirD = (n) => page.evaluate((n) => { window.__c = window.__c || {}; window.__c[n] = 0; openModal({ title: 'T ' + n, bodyHTML: '<p>x</p>', actions: [{ label: 'OK', onClick: closeModal }], onClose: () => { window.__c[n]++; } }); }, n);
  const cuenta = () => page.evaluate(() => ({ ...window.__c }));
  const visible = () => page.evaluate(() => document.querySelector('#modalLayer').classList.contains('open'));
  await abrirD('esc'); await page.keyboard.press('Escape');
  await abrirD('x'); await page.click('.modal-head [data-modal-close]');
  await abrirD('fuera'); await page.click('.modal-scrim', { position: { x: 4, y: 4 } });
  await abrirD('boton'); await page.click('[data-modal-action="0"]');
  assert.equal(await visible(), false);
  await abrirD('a'); await abrirD('b');
  assert.deepEqual(await cuenta(), { esc: 1, x: 1, fuera: 1, boton: 1, a: 1, b: 0 }, 'abrir otro diálogo cierra el anterior y lo avisa');
  await page.evaluate(() => { closeModal(); closeModal(); });
  assert.deepEqual(await cuenta(), { esc: 1, x: 1, fuera: 1, boton: 1, a: 1, b: 1 });
  assert.deepEqual(errors, []);
  await ctx.close();
});

/** Opens askPassword in the page; the result goes to window.__pw (undefined while it is open). */
const preguntar = (page, opts = {}) => page.evaluate((o) => { window.__pw = undefined; askPassword({ title: 'Clave', help: 'Ayuda', ...o }).then((v) => { window.__pw = v; }); }, opts);
const resultado = (page) => page.evaluate(() => window.__pw);
const error = (page) => page.evaluate(() => { const e = document.querySelector('#passError'); return e && !e.hidden ? e.textContent : ''; });

test('T79.8 askPassword (introducir): estilo de terminal, vacía no pasa, Enter acepta, Esc, Cancelar y × devuelven null', async () => {
  const { page, errors, ctx } = await abrir();
  await preguntar(page);
  await page.waitForSelector('.modal-box.modal-form.modal-pass');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'passInput', 'el foco está en el campo');
  assert.equal(await page.getAttribute('#passInput', 'type'), 'password');
  assert.equal(await page.locator('#passConfirm').count(), 0);
  await page.click('.modal-foot .btn.primary');
  assert.match(await error(page), /Escribe la contraseña/);
  assert.equal(await resultado(page), undefined, 'sigue abierto');
  await page.fill('#passInput', 'abc'); await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__pw === 'abc');
  assert.equal(await page.evaluate(() => document.querySelector('#modalLayer').classList.contains('open')), false);
  for (const cerrar of [() => page.keyboard.press('Escape'), () => page.click('.modal-foot .btn.ghost'), () => page.click('.modal-head [data-modal-close]')]) {
    await preguntar(page); await page.waitForSelector('#passInput'); await cerrar();
    await page.waitForFunction(() => window.__pw === null);
  }
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('T79.9 askPassword (crear): exige 8 caracteres y que coincidan (NFC) antes de aceptar', async () => {
  const { page, errors, ctx } = await abrir();
  await preguntar(page, { confirm: true, submitLabel: 'Guardar' });
  await page.waitForSelector('#passConfirm');
  assert.equal(await page.textContent('.modal-foot .btn.primary'), 'Guardar');
  await page.fill('#passInput', '1234567'); await page.fill('#passConfirm', '1234567'); await page.click('.modal-foot .btn.primary');
  assert.match(await error(page), /al menos 8 caracteres/);
  await page.fill('#passInput', '12345678'); await page.fill('#passConfirm', '12345679'); await page.click('.modal-foot .btn.primary');
  assert.match(await error(page), /no coinciden/);
  assert.equal(await resultado(page), undefined);
  await page.fill('#passInput', 'caf\u00e9-secreto'); await page.fill('#passConfirm', 'cafe\u0301-secreto'); await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__pw === 'caf\u00e9-secreto');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('T79.10 askPassword con comprobación: una contraseña errónea mantiene el diálogo (con el campo listo para reintentar); cerrarlo durante la comprobación devuelve null', async () => {
  const { page, errors, ctx } = await abrir();
  const conCheck = () => page.evaluate(() => { window.__pw = undefined; askPassword({ title: 'Clave', check: async (p) => { await new Promise((r) => setTimeout(r, 250)); return p === 'buena-clave-1' ? '' : 'MAL'; } }).then((v) => { window.__pw = v; }); });
  await conCheck(); await page.waitForSelector('#passInput');
  await page.fill('#passInput', 'mala'); await page.keyboard.press('Enter');
  assert.equal(await page.getAttribute('.modal-pass', 'aria-busy'), 'true');
  assert.equal(await page.isDisabled('#passInput'), true, 'ocupado: no se puede editar');
  await page.waitForFunction(() => !document.querySelector('#passError').hidden);
  assert.equal(await error(page), 'MAL');
  assert.equal(await page.getAttribute('.modal-pass', 'aria-busy'), 'false');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'passInput');
  await page.fill('#passInput', 'buena-clave-1'); await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__pw === 'buena-clave-1');
  await conCheck(); await page.waitForSelector('#passInput');
  await page.fill('#passInput', 'buena-clave-1'); await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__pw === null);
  await page.waitForTimeout(400);
  assert.equal(await resultado(page), null, 'la comprobación que acaba tarde no lo cambia');
  assert.deepEqual(errors, []);
  await ctx.close();
});

const subir = (page, selector, env) => page.setInputFiles(selector, { name: 'apis.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(env)) });
const toastTxt = (page) => page.locator('#toast').textContent();

test('T79.11 importar APIs cifradas: Cancelar no cambia nada, la contraseña errónea no pierde el archivo y la buena aplica la configuración', async () => {
  const { page, errors, ctx } = await abrir();
  const env = await page.evaluate(async (PASS) => encryptEnvelope(ENC_TYPES.apis, JSON.stringify({ activeProvider: 'openai', providers: { openai: { key: 'sk-IMPORTADA', model: 'gpt-x' } } }), PASS), PASS);
  await subir(page, '#importProvidersFile', env);
  await page.waitForSelector('.modal-pass');
  await page.click('.modal-foot .btn.ghost');
  assert.equal(await page.evaluate(() => db.settings.providers.openai.key), '');
  await subir(page, '#importProvidersFile', env);
  await page.waitForSelector('.modal-pass');
  await page.fill('#passInput', 'incorrecta-123'); await page.keyboard.press('Enter');
  await page.waitForFunction(() => !document.querySelector('#passError').hidden);
  assert.match(await error(page), /incorrecta o archivo dañado/);
  await page.fill('#passInput', PASS); await page.keyboard.press('Enter');
  await page.waitForFunction(() => db.settings.providers.openai.key === 'sk-IMPORTADA');
  assert.deepEqual(await page.evaluate(() => [db.settings.activeProvider, db.settings.providers.openai.model]), ['openai', 'gpt-x']);
  assert.match(await toastTxt(page), /importada/);
  assert.equal(await page.evaluate(() => document.querySelector('#modalLayer').classList.contains('open')), false);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('T79.12 un archivo de APIs cifrado dañado, o cuyo contenido no es una configuración de APIs, se avisa sin tocar los ajustes', async () => {
  const { page, errors, ctx } = await abrir();
  await subir(page, '#importProvidersFile', { type: 'bitacora-dev-providers-enc', v: 2 });
  await page.waitForFunction(() => /dañado/.test(document.querySelector('#toast').textContent));
  assert.equal(await page.locator('.modal-pass').count(), 0, 'sin sobre válido no se pide contraseña');
  const env = await page.evaluate(async (PASS) => encryptEnvelope(ENC_TYPES.apis, JSON.stringify({ otra: 'cosa' }), PASS), PASS);
  await subir(page, '#importProvidersFile', env);
  await page.waitForSelector('.modal-pass');
  await page.fill('#passInput', PASS); await page.keyboard.press('Enter');
  await page.waitForFunction(() => !document.querySelector('.modal-pass'));
  assert.match(await toastTxt(page), /dañado o no es compatible/);
  assert.equal(await page.evaluate(() => db.settings.activeProvider), 'none');
  assert.deepEqual(errors, []);
  await ctx.close();
});

const api = (page, op, args = {}) => page.evaluate(([o, a]) => window.BitacoraAPI[o](a), [op, args]);
const SEMILLA = { activeProvider: 'openai', providers: { openai: { key: 'sk-SECRETA-123', model: 'gpt-x' } } };

test('T79.13 API: setApiEncryption, exportApis e importApis con contraseña: con la casilla activa no sale nada en claro; errores con código estable; ida y vuelta', async () => {
  const { page, errors, ctx } = await openApp(browser, { open: false, seed: { schema: 2, projects: [], settings: { uiLang: 'es', ...SEMILLA } } });
  assert.equal((await api(page, 'setApiEncryption', { enabled: 'sí' })).error.code, 'invalid-argument');
  assert.deepEqual((await api(page, 'setApiEncryption', { enabled: true })).data, { encryptApis: true });
  assert.equal((await api(page, 'state')).data.encryptApis, true);
  await page.evaluate(() => openSettings());
  assert.equal(await page.locator('#encryptApiExportChk').isChecked(), true, 'la casilla de Configuración lo refleja');
  assert.equal((await api(page, 'exportApis')).error.code, 'password-required', 'con la casilla activa no se exporta en claro');
  assert.equal((await api(page, 'exportApis', { password: 'corta' })).error.code, 'weak-password');
  const ex = await api(page, 'exportApis', { password: PASS });
  assert.equal(ex.ok, true);
  assert.equal(ex.data.encrypted, true);
  const env = JSON.parse(ex.data.json);
  assert.deepEqual([env.type, env.v], ['bitacora-dev-providers-enc', 2]);
  assert.equal(/sk-SECRETA|gpt-x/.test(ex.data.json), false, 'no se ve ni la clave ni el modelo');
  const malos = [[env, undefined, 'password-required'], [env, 5, 'password-required'], [env, 'otra-clave-1', 'wrong-password'], [{ ...env, data: env.data.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A')) }, PASS, 'wrong-password'], [{ type: env.type, v: 2, kdf: 'x', iterations: 1, salt: 'AA==', iv: 'AA==', data: 'AA==' }, PASS, 'invalid-encrypted-file']];
  for (const [json, password, code] of malos) assert.equal((await api(page, 'importApis', { json, password, confirm: true })).error.code, code);
  assert.equal((await api(page, 'importApis', { json: env, password: PASS })).error.code, 'confirm-required');
  await page.evaluate(() => { db.settings.providers.openai.key = 'otra'; });
  const im = await api(page, 'importApis', { json: ex.data.json, password: PASS, confirm: true });
  // The file carries every provider (each with its default settings), not only the one with a key.
  assert.deepEqual([im.ok, im.data.providers.includes('openai'), im.data.providers.length > 1, im.data.activeProvider], [true, true, true, 'openai']);
  assert.equal(await page.evaluate(() => db.settings.providers.openai.key), 'sk-SECRETA-123');
  assert.equal(JSON.stringify(im).includes('sk-SECRETA'), false);
  assert.equal((await api(page, 'importApis', { json: { type: 'bitacora-dev-backup-enc', salt: 'AA==', iv: 'AA==', data: 'AA==' }, confirm: true })).error.code, 'invalid-apis-file', 'una copia cifrada no es un archivo de APIs');
  assert.deepEqual((await api(page, 'setApiEncryption', { enabled: false })).data, { encryptApis: false });
  assert.equal((await api(page, 'exportApis', { password: PASS })).data.encrypted, true, 'con una contraseña explícita siempre se cifra');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('T79.14 API sin Web Crypto: setApiEncryption(true) y exportApis con contraseña dan «crypto-unavailable»; importar un archivo cifrado también; apagar la casilla sigue pudiendo', async () => {
  const { page, errors, ctx } = await openApp(browser, { open: false, seed: { schema: 2, projects: [], settings: { uiLang: 'es', encryptApiExport: true, ...SEMILLA } } });
  const env = JSON.stringify(await page.evaluate(([pass]) => encryptEnvelope(ENC_TYPES.apis, '{"providers":{}}', pass), [PASS]));
  await page.evaluate(() => Object.defineProperty(crypto, 'subtle', { get: () => undefined, configurable: true }));
  assert.equal((await api(page, 'exportApis')).error.code, 'password-required', 'con la casilla activa tampoco sin Web Crypto sale en claro');
  assert.equal((await api(page, 'exportApis', { password: PASS })).error.code, 'crypto-unavailable');
  assert.equal((await api(page, 'importApis', { json: env, password: PASS, confirm: true })).error.code, 'crypto-unavailable');
  assert.equal((await api(page, 'setApiEncryption', { enabled: false })).ok, true);
  assert.equal((await api(page, 'setApiEncryption', { enabled: true })).error.code, 'crypto-unavailable');
  assert.equal((await api(page, 'exportApis')).data.encrypted, false, 'con la casilla apagada el archivo es en claro, como siempre');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('T79.15 asistente: activar el cifrado de las APIs no abre diálogo; exportar pide la contraseña en el diálogo (nunca en el chat ni en el almacenamiento) y sale cifrado; «exporta las APIs cifradas» cifra solo esa vez; desactivar pide permiso', async () => {
  const { page, errors, ctx, aiRequests } = await openApp(browser, { ai: async () => 'No debería llamarse.', seed: makeDb({ projects: [sampleProject()], settings: SEMILLA }) });
  const exportar = async (orden) => {
    const hecha = pedir(page, orden);
    await page.waitForSelector('.modal-pass');
    await page.fill('#passInput', PASS); await page.fill('#passConfirm', PASS);
    const [dl, m] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Enter').then(() => hecha)]);
    await page.waitForFunction(() => !document.querySelector('.modal-pass'));
    return { m, raw: fs.readFileSync(await dl.path(), 'utf8') };
  };
  const cifrado = () => page.evaluate(() => db.settings.encryptApiExport);
  let m = await pedir(page, 'activa el cifrado de las APIs');
  assert.deepEqual([m.name, m.state, m.perm], ['set-apis-encryption', 'ok', 'auto']);
  assert.equal(await cifrado(), true);
  assert.equal(await page.locator('.modal-pass').count(), 0, 'la contraseña se pide al exportar, no al activar');
  let x = await exportar('exporta las APIs');
  assert.equal(x.m.state, 'ok');
  assert.match(x.m.result, /· cifrado$/);
  const env = JSON.parse(x.raw);
  assert.deepEqual([env.type, env.v], ['bitacora-dev-providers-enc', 2]);
  assert.equal(x.raw.includes('sk-SECRETA'), false);
  assert.equal((await page.evaluate(async ({ env, PASS }) => JSON.parse(await decryptEnvelope(env, PASS)), { env, PASS })).providers.openai.key, 'sk-SECRETA-123');
  const rastro = await page.evaluate(() => JSON.stringify(getProject().chat) + localStorage.getItem('bitacora-dev-v2'));
  assert.equal(rastro.includes(PASS), false, 'la contraseña no queda en el chat ni en el almacenamiento');
  m = await pedir(page, 'desactiva el cifrado de las APIs');
  assert.deepEqual([m.state, m.perm], ['ask', 'confirm']);
  assert.equal((await confirmar(page, 'no')).state, 'cancel');
  assert.equal(await cifrado(), true, 'Cancelar lo deja activo');
  await pedir(page, 'desactiva el cifrado de las APIs');
  assert.equal((await confirmar(page)).state, 'ok');
  assert.equal(await cifrado(), false);
  x = await exportar('exporta las APIs cifradas');
  assert.equal(JSON.parse(x.raw).type, 'bitacora-dev-providers-enc');
  assert.equal(await cifrado(), false, '«cifradas» vale solo para esa exportación');
  const marcador = await page.evaluate(() => extractActionMarkers('[[ACCION: export-apis encrypted=true password=hunter2hunter2]]').calls[0].args);
  assert.deepEqual(marcador, { encrypted: 'true' }, 'una contraseña escrita en el marcador no se lee');
  assert.equal(aiRequests.length, 0);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('T79.16 askPassword: un Enter en el mismo tick en que se abre el diálogo ya acepta (el atajo no espera a onOpen), también con confirmación', async () => {
  const { page, errors, ctx } = await abrir();
  const enMismoTick = (opts, campos) => page.evaluate(async ([o, c]) => {
    const p = askPassword({ title: 'Clave', ...o });
    for (const [id, v] of Object.entries(c)) document.getElementById(id).value = v;
    document.getElementById(Object.keys(c).at(-1)).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    const r = await Promise.race([p, new Promise((ok) => setTimeout(() => ok('__sin-respuesta__'), 500))]);
    const abierto = document.querySelector('#modalLayer').classList.contains('open');
    if (abierto) closeModal();
    return { r, abierto };
  }, [opts, campos]);
  assert.deepEqual(await enMismoTick({}, { passInput: PASS }), { r: PASS, abierto: false });
  assert.deepEqual(await enMismoTick({ confirm: true }, { passInput: PASS, passConfirm: PASS }), { r: PASS, abierto: false });
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('T79.17 askPassword: onOpen no quita el foco a un campo que ya se alcanzó (el de repetir); sin tocar nada enfoca la contraseña', async () => {
  const { page, errors, ctx } = await abrir();
  const r = await page.evaluate(async () => {
    const espera = () => new Promise((ok) => setTimeout(ok, 60));
    const p = askPassword({ title: 'Clave', confirm: true });
    document.getElementById('passConfirm').focus(); // before onOpen's timer fires
    await espera();
    const conservado = document.activeElement.id;
    closeModal();
    await p;
    const q = askPassword({ title: 'Clave' });
    await espera();
    const inicial = document.activeElement.id;
    closeModal();
    await q;
    return { conservado, inicial };
  });
  assert.deepEqual(r, { conservado: 'passConfirm', inicial: 'passInput' });
  assert.deepEqual(errors, []);
  await ctx.close();
});
