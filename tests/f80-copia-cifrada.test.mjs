// F80 · Optional encrypted backup: checkbox and password in Settings, backups encrypted without asking, and import with a password.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { launch, openApp, makeDb, sampleProject } from './helpers.mjs';
import { pedir, confirmar } from './helpers-asistente.mjs';

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });

const PASS = 'clave-copia-1';
const CLAVE_API = 'sk-SECRETA-123';
const sembrado = (settings = {}, projects) => makeDb({ projects, settings: { activeProvider: 'openai', providers: { openai: { key: CLAVE_API, model: 'gpt-x' } }, ...settings } });
const abrir = (settings = {}, opts = {}) => openApp(browser, { open: false, seed: sembrado(settings), ...opts });
const ajustes = (page) => page.evaluate(() => openSettings());
const descargar = async (page, accion) => {
  const [dl] = await Promise.all([page.waitForEvent('download'), accion()]);
  return { name: dl.suggestedFilename(), raw: fs.readFileSync(await dl.path(), 'utf8') };
};
const contarDescargas = (page) => { const n = { v: 0 }; page.on('download', () => { n.v++; }); return n; };
const toastTxt = (page) => page.locator('#toast').textContent();
const error = (page) => page.evaluate(() => { const e = document.querySelector('#passError'); return e && !e.hidden ? e.textContent : ''; });
const ajusteCifrado = (page) => page.evaluate(() => [db.settings.encryptBackup, db.settings.backupPassword]);
const enGuardado = (page, js) => page.waitForFunction((src) => { const s = JSON.parse(localStorage.getItem('bitacora-dev-v2')).settings; return new Function('s', `return ${src}`)(s); }, js);
// Password dialog: a new one (with confirmation) or the existing one.
const clave = async (page, pass, confirma = pass) => {
  await page.waitForSelector('.modal-pass');
  await page.fill('#passInput', pass);
  if (confirma !== null && await page.locator('#passConfirm').count()) await page.fill('#passConfirm', confirma);
};
const subirCopia = (page, texto, name = 'copia.json') => page.setInputFiles('#importFile', { name, mimeType: 'application/json', buffer: Buffer.from(texto) });
const cifrarCopia = (page, db, pass = PASS) => page.evaluate(async ({ db, pass }) => JSON.stringify(await encryptEnvelope(ENC_TYPES.backup, JSON.stringify(db), pass)), { db, pass });
const copiaB = () => ({ schema: 2, projects: [sampleProject({ id: 'p9', name: 'Importado', n: 2 })], settings: { uiLang: 'es' } });
const nombres = (page) => page.evaluate(() => db.projects.map((p) => p.name));
const LOCAL_KEYS = (settings) => ['encryptApiExport', 'encryptBackup', 'backupPassword'].filter((k) => k in settings);
const CLAVE_API_EN = (obj) => JSON.stringify(obj).includes(CLAVE_API);

for (const [lang, rotulos] of [['es', ['Copia de seguridad', 'Cifrar la copia de seguridad con contraseña', 'Cambiar contraseña']], ['en', ['Backup', 'Encrypt the backup with a password', 'Change password']]]) {
  test(`T80.1 el bloque está bajo el de las APIs, con estilo de terminal; «Cambiar contraseña» solo se ve con el cifrado activo (${lang})`, async () => {
    const { page, errors, ctx } = await abrir({}, { lang });
    await ajustes(page);
    const leer = () => page.evaluate(() => {
      const b = document.querySelector('#backupIoBlock'), btn = document.querySelector('#changeBackupPassBtn'), chk = document.querySelector('#encryptBackupChk');
      return {
        head: b.querySelector('.copy-head').textContent.trim(), prompt: getComputedStyle(b.querySelector('.copy-head'), '::before').content,
        chk: document.querySelector('#encryptBackupLabel').textContent.trim(), btn: btn.textContent.trim(), visible: btn.offsetParent !== null,
        bajoApis: !!(document.querySelector('#apisIoBlock').compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING), antesDeAjustes: !!(b.compareDocumentPosition(document.querySelector('.settings-grid')) & Node.DOCUMENT_POSITION_FOLLOWING),
        agentes: [chk.dataset.agent, btn.dataset.agent], etiquetas: [chk.getAttribute('aria-label'), btn.getAttribute('aria-label')], ayuda: b.querySelector('#backupIoHelp').textContent.length > 40,
        tilesPie: document.querySelectorAll('.sidebar-footer .tile').length,
      };
    });
    const off = await leer();
    assert.equal(off.head, rotulos[0]);
    assert.equal(off.prompt, '"$"');
    assert.deepEqual([off.chk, off.btn], [rotulos[1], rotulos[2]]);
    assert.deepEqual([off.bajoApis, off.antesDeAjustes, off.ayuda, off.tilesPie], [true, true, true, 4]);
    assert.equal(off.visible, false, 'sin cifrado no hay botón de contraseña');
    assert.deepEqual(off.agentes, ['backup-encrypt', 'backup-password']);
    assert.deepEqual(off.etiquetas, [rotulos[1], rotulos[2]]);
    await page.evaluate(() => { db.settings.encryptBackup = true; db.settings.backupPassword = 'clave-copia-1'; renderCopyBlocks(); });
    assert.equal((await leer()).visible, true);
    assert.deepEqual(errors, []);
    await ctx.close();
  });
}

test('T80.2 el bloque no desborda a 390 y 320 px, con y sin el botón de contraseña', async () => {
  const { page, errors, ctx } = await abrir({ encryptBackup: true, backupPassword: PASS });
  await ajustes(page);
  for (const w of [390, 320]) {
    await page.setViewportSize({ width: w, height: 800 });
    await page.waitForTimeout(150);
    const r = await page.evaluate(() => {
      const body = document.querySelector('.settings-body'), b = document.querySelector('#backupIoBlock').getBoundingClientRect(), x = document.querySelector('#changeBackupPassBtn').getBoundingClientRect();
      return { desborda: body.scrollWidth > body.clientWidth + 1, dentro: x.left >= b.left - 0.5 && x.right <= b.right + 0.5 };
    });
    assert.deepEqual([r.desborda, r.dentro], [false, true], `a ${w} px`);
  }
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('T80.3 marcar la casilla pide contraseña con confirmación: Cancelar la deja desmarcada; aceptar la guarda y activa el cifrado', async () => {
  const { page, errors, ctx } = await abrir();
  await ajustes(page);
  await page.check('#encryptBackupChk');
  await clave(page, 'corta');
  await page.keyboard.press('Enter');
  assert.match(await error(page), /al menos 8/);
  await page.fill('#passInput', PASS); await page.fill('#passConfirm', 'otra-clave-99'); await page.keyboard.press('Enter');
  assert.match(await error(page), /no coinciden/);
  await page.click('.modal-foot .btn.ghost');
  await page.waitForFunction(() => !document.querySelector('.modal-pass'));
  assert.equal(await page.locator('#encryptBackupChk').isChecked(), false, 'Cancelar la deja desmarcada');
  assert.deepEqual(await ajusteCifrado(page), [false, '']);
  await page.check('#encryptBackupChk');
  await clave(page, PASS);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => !document.querySelector('.modal-pass'));
  assert.deepEqual(await ajusteCifrado(page), [true, PASS]);
  assert.equal(await page.locator('#encryptBackupChk').isChecked(), true);
  assert.equal(await page.locator('#changeBackupPassBtn').isVisible(), true);
  assert.match(await toastTxt(page), /cifradas: activadas/);
  await enGuardado(page, `s.encryptBackup===true&&s.backupPassword==='${PASS}'`);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('T80.4 desmarcar la casilla borra la contraseña guardada (también del almacenamiento); volver a marcarla la pide de nuevo', async () => {
  const { page, errors, ctx } = await abrir({ encryptBackup: true, backupPassword: PASS });
  await ajustes(page);
  await page.uncheck('#encryptBackupChk');
  assert.deepEqual(await ajusteCifrado(page), [false, '']);
  assert.equal(await page.locator('#changeBackupPassBtn').isVisible(), false);
  await enGuardado(page, "s.encryptBackup===false&&s.backupPassword===''");
  assert.ok(!(await page.evaluate(() => localStorage.getItem('bitacora-dev-v2'))).includes(PASS), 'la contraseña no queda en el almacenamiento');
  await page.check('#encryptBackupChk');
  await page.waitForSelector('.modal-pass');
  assert.equal(await page.locator('#passInput').inputValue(), '', 'se pide de nuevo');
  await page.click('.modal-foot .btn.ghost');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('T80.5 «Cambiar contraseña»: Cancelar no cambia nada; con la nueva, la siguiente copia ya no se abre con la anterior', async () => {
  const { page, errors, ctx } = await abrir({ encryptBackup: true, backupPassword: PASS });
  await ajustes(page);
  await page.click('#changeBackupPassBtn');
  await page.waitForSelector('.modal-pass');
  assert.equal(await page.locator('#passConfirm').count(), 1, 'pide confirmación');
  await page.click('.modal-foot .btn.ghost');
  assert.deepEqual(await ajusteCifrado(page), [true, PASS]);
  await page.click('#changeBackupPassBtn');
  await clave(page, 'nueva-clave-77');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => db.settings.backupPassword === 'nueva-clave-77');
  assert.match(await toastTxt(page), /cambiada/);
  await page.evaluate(() => closeSettings());
  const d = await descargar(page, () => page.click('#backupBtn'));
  const r = await page.evaluate(async ({ env, vieja, nueva }) => {
    const prueba = async (p) => { try { await decryptEnvelope(env, p); return true; } catch { return false; } };
    return { nueva: await prueba(nueva), vieja: await prueba(vieja) };
  }, { env: JSON.parse(d.raw), vieja: PASS, nueva: 'nueva-clave-77' });
  assert.deepEqual(r, { nueva: true, vieja: false });
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('T80.6 con el cifrado activo «Copia seguridad» descarga el archivo cifrado sin preguntar y sin claves API ni contraseña; sin él, igual que siempre', async () => {
  const { page, errors, ctx } = await abrir({ encryptBackup: true, backupPassword: PASS });
  const d = await descargar(page, () => page.click('#backupBtn'));
  assert.match(d.name, /^bitacora-db-\d{4}-\d{2}-\d{2}\.enc\.json$/);
  assert.equal(await page.locator('.modal-pass').count(), 0, 'no pregunta');
  const env = JSON.parse(d.raw);
  assert.deepEqual([env.type, env.v, env.kdf, env.iterations], ['bitacora-dev-backup-enc', 2, 'PBKDF2-SHA256', 600000]);
  for (const claro of [CLAVE_API, 'Proyecto de prueba', PASS, 'openai']) assert.ok(!d.raw.includes(claro), `legible en el archivo: ${claro}`);
  const dentro = JSON.parse(await page.evaluate(async ({ env, PASS }) => decryptEnvelope(env, PASS), { env, PASS }));
  assert.equal(dentro.projects[0].name, 'Proyecto de prueba');
  assert.equal(dentro.settings.providers.openai.key, '', 'las claves API no viajan');
  for (const k of ['encryptApiExport', 'encryptBackup', 'backupPassword']) assert.ok(!(k in dentro.settings), `${k} no debe ir en la copia`);
  assert.match(await toastTxt(page), /cifrada descargada/);
  await page.evaluate(() => { db.settings.encryptBackup = false; db.settings.backupPassword = ''; });
  const p = await descargar(page, () => page.click('#backupBtn'));
  assert.match(p.name, /^bitacora-db-\d{4}-\d{2}-\d{2}\.json$/);
  assert.equal(JSON.parse(p.raw).projects[0].name, 'Proyecto de prueba');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('T80.7 importar una copia cifrada: Cancelar no cambia nada, una contraseña errónea no pierde el archivo, y la buena importa y deja su contraseña para las siguientes (con Deshacer)', async () => {
  const { page, errors, ctx } = await abrir();
  const texto = await cifrarCopia(page, copiaB());
  await subirCopia(page, texto);
  await page.waitForSelector('.modal-pass');
  assert.equal(await page.locator('#passConfirm').count(), 0, 'al importar solo se pide una vez');
  await page.click('.modal-foot .btn.ghost');
  await page.waitForFunction(() => !document.querySelector('.modal-pass'));
  assert.deepEqual(await nombres(page), ['Proyecto de prueba']);
  await subirCopia(page, texto);
  await clave(page, 'incorrecta-123');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => !document.querySelector('#passError').hidden);
  assert.match(await error(page), /incorrecta o archivo dañado/);
  await page.fill('#passInput', PASS); await page.keyboard.press('Enter');
  await page.waitForFunction(() => db.projects[0]?.name === 'Importado');
  assert.deepEqual(await nombres(page), ['Importado']);
  assert.deepEqual(await ajusteCifrado(page), [true, PASS], 'la contraseña queda para las siguientes');
  assert.equal(await page.evaluate(() => db.settings.providers.openai.key), CLAVE_API, 'las claves API se conservan');
  assert.match(await toastTxt(page), /misma contraseña/);
  await page.click('#toastAction');
  await page.waitForFunction(() => db.projects[0]?.name === 'Proyecto de prueba');
  assert.deepEqual(await ajusteCifrado(page), [false, ''], 'Deshacer devuelve también los ajustes de cifrado');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('T80.8 ida y vuelta entre dos navegadores: la copia cifrada se abre con su contraseña y la siguiente sale cifrada con esa misma', async () => {
  const A = await abrir({ encryptBackup: true, backupPassword: PASS });
  const d = await descargar(A.page, () => A.page.click('#backupBtn'));
  assert.deepEqual(A.errors, []);
  await A.ctx.close();
  const B = await abrir({}, { seed: sembrado({}, [sampleProject({ id: 'b1', name: 'Otro proyecto', n: 1 })]) });
  await subirCopia(B.page, d.raw, d.name);
  await clave(B.page, PASS);
  await B.page.keyboard.press('Enter');
  await B.page.waitForFunction(() => db.projects[0]?.name === 'Proyecto de prueba');
  const d2 = await descargar(B.page, () => B.page.click('#backupBtn'));
  const ok = await B.page.evaluate(async ({ env, PASS }) => { try { return JSON.parse(await decryptEnvelope(env, PASS)).projects.length; } catch { return -1; } }, { env: JSON.parse(d2.raw), PASS });
  assert.equal(ok, 1);
  assert.deepEqual(B.errors, []);
  await B.ctx.close();
});

test('T80.9 con el cifrado activo pero sin contraseña válida guardada se pide una antes; Cancelar no escribe nada en claro', async () => {
  const { page, errors, ctx } = await abrir({ encryptBackup: true, backupPassword: '' });
  const n = contarDescargas(page);
  await page.click('#backupBtn');
  await page.waitForSelector('.modal-pass');
  assert.equal(await page.locator('#passConfirm').count(), 1);
  await page.click('.modal-foot .btn.ghost');
  await page.waitForTimeout(400);
  assert.equal(n.v, 0, 'sin contraseña no hay archivo');
  await page.click('#backupBtn');
  await clave(page, PASS);
  const d = await descargar(page, () => page.keyboard.press('Enter'));
  assert.equal(JSON.parse(d.raw).type, 'bitacora-dev-backup-enc');
  assert.deepEqual(await ajusteCifrado(page), [true, PASS]);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('T80.10 sin Web Crypto: la casilla no se activa y, si el cifrado ya estaba activo, no se descarga nada en claro', async () => {
  const sinCrypto = (page) => page.evaluate(() => { Object.defineProperty(crypto, 'subtle', { get: () => undefined, configurable: true }); renderCopyBlocks(); });
  const a = await abrir();
  await ajustes(a.page); await sinCrypto(a.page);
  assert.equal(await a.page.locator('#encryptBackupChk').isDisabled(), true);
  assert.match(await a.page.locator('#encryptBackupHelp').textContent(), /no está disponible/);
  await a.ctx.close();
  const { page, errors, ctx } = await abrir({ encryptBackup: true, backupPassword: PASS });
  const n = contarDescargas(page);
  await sinCrypto(page);
  await page.click('#backupBtn');
  await page.waitForFunction(() => /no está disponible/.test(document.querySelector('#toast').textContent));
  await page.waitForTimeout(300);
  assert.equal(n.v, 0);
  await ajustes(page);
  assert.equal(await page.locator('#encryptBackupChk').isDisabled(), false, 'se puede quitar');
  await page.uncheck('#encryptBackupChk');
  await page.evaluate(() => closeSettings());
  const d = await descargar(page, () => page.click('#backupBtn'));
  assert.match(d.name, /^bitacora-db-[\d-]+\.json$/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('T80.11 archivos defectuosos: sobre dañado, contenido que no es una copia y tipo cambiado se avisan sin tocar los datos', async () => {
  const { page, errors, ctx } = await abrir();
  await subirCopia(page, JSON.stringify({ type: 'bitacora-dev-backup-enc', v: 2 }));
  await page.waitForFunction(() => /dañado/.test(document.querySelector('#toast').textContent));
  assert.equal(await page.locator('.modal-pass').count(), 0, 'sin sobre válido no se pide contraseña');
  await subirCopia(page, await cifrarCopia(page, { otra: 'cosa' }));
  await clave(page, PASS);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => !document.querySelector('.modal-pass'));
  assert.match(await toastTxt(page), /dañado o no es compatible/);
  const real = JSON.parse(await cifrarCopia(page, copiaB()));
  await subirCopia(page, JSON.stringify({ ...real, type: 'bitacora-dev-providers-enc' }));
  await clave(page, PASS);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => !document.querySelector('#passError').hidden);
  assert.match(await error(page), /incorrecta o archivo dañado/, 'el tipo está autenticado: una copia no se hace pasar por APIs');
  await page.click('.modal-foot .btn.ghost');
  assert.deepEqual(await nombres(page), ['Proyecto de prueba']);
  assert.equal(await page.evaluate(() => db.settings.activeProvider), 'openai');
  assert.deepEqual(errors, []);
  await ctx.close();
});

const api = (page, op, args = {}) => page.evaluate(([o, a]) => window.BitacoraAPI[o](a), [op, args]);

test('T80.12 API: setBackupEncryption, backup e importDatabase con cifrado; la contraseña no se devuelve nunca; sin contraseña válida no sale nada en claro', async () => {
  const { page, errors, ctx } = await abrir();
  const descargas = contarDescargas(page);
  assert.equal((await api(page, 'setBackupEncryption', { enabled: 'sí' })).error.code, 'invalid-argument');
  assert.equal((await api(page, 'setBackupEncryption', { enabled: true })).error.code, 'password-required');
  assert.equal((await api(page, 'setBackupEncryption', { enabled: true, password: 'corta' })).error.code, 'weak-password');
  assert.equal((await api(page, 'setBackupEncryption', { enabled: true, password: 5 })).error.code, 'invalid-argument');
  assert.deepEqual(await ajusteCifrado(page), [false, ''], 'lo rechazado no cambia nada');
  assert.deepEqual((await api(page, 'setBackupEncryption', { enabled: true, password: PASS })).data, { encryptBackup: true, backupPasswordSet: true });
  await enGuardado(page, 's.encryptBackup === true && s.backupPassword === "clave-copia-1"');
  const st = await api(page, 'state');
  assert.deepEqual([st.data.encryptBackup, st.data.backupPasswordSet], [true, true]);
  assert.equal(JSON.stringify(st).includes(PASS), false, 'state no devuelve la contraseña');
  assert.deepEqual((await api(page, 'setBackupEncryption', { enabled: true })).data, { encryptBackup: true, backupPasswordSet: true }, 'activar con una contraseña ya guardada no pide otra');
  const bk = await api(page, 'backup');
  assert.equal(bk.ok, true);
  assert.equal(bk.data.encrypted, true);
  assert.match(bk.data.filename, /^bitacora-db-\d{4}-\d{2}-\d{2}\.enc\.json$/);
  const env = JSON.parse(bk.data.json);
  assert.equal(env.type, 'bitacora-dev-backup-enc');
  assert.equal(new RegExp(`${CLAVE_API}|Proyecto de prueba|${PASS}`).test(bk.data.json), false, 'ni claves, ni notas, ni contraseña a la vista');
  assert.equal(JSON.stringify(bk).includes(PASS), false);
  const interior = JSON.parse(await page.evaluate(([e, p]) => decryptEnvelope(e, p), [env, PASS]));
  assert.deepEqual([interior.projects.length, LOCAL_KEYS(interior.settings), CLAVE_API_EN(interior)], [1, [], false]);
  // Import: confirm, password, wrong password, right password.
  assert.equal((await api(page, 'importDatabase', { json: bk.data.json, password: PASS })).error.code, 'confirm-required');
  assert.equal((await api(page, 'importDatabase', { json: bk.data.json, confirm: true })).error.code, 'password-required');
  assert.equal((await api(page, 'importDatabase', { json: bk.data.json, password: 'otra-clave-1', confirm: true })).error.code, 'wrong-password');
  assert.equal((await api(page, 'importDatabase', { json: { ...env, iterations: 7 }, password: PASS, confirm: true })).error.code, 'wrong-password', 'un coste de derivación cambiado invalida el archivo');
  assert.equal((await api(page, 'importDatabase', { json: { type: env.type, v: 2, kdf: 'x', iterations: 1, salt: 'AA==', iv: 'AA==', data: 'AA==' }, password: PASS, confirm: true })).error.code, 'invalid-encrypted-file');
  assert.deepEqual(await nombres(page), ['Proyecto de prueba'], 'lo fallido no toca los datos');
  // An encrypted backup from another database, with encryption off: it imports and keeps its password.
  assert.deepEqual((await api(page, 'setBackupEncryption', { enabled: false })).data, { encryptBackup: false, backupPasswordSet: false });
  assert.deepEqual(await ajusteCifrado(page), [false, '']);
  const otra = await cifrarCopia(page, copiaB(), 'otra-clave-99');
  const im = await api(page, 'importDatabase', { json: otra, password: 'otra-clave-99', confirm: true });
  assert.deepEqual([im.ok, im.data.projects, im.data.encrypted], [true, 1, true]);
  assert.deepEqual(await nombres(page), ['Importado']);
  assert.deepEqual(await ajusteCifrado(page), [true, 'otra-clave-99'], 'como la interfaz: la contraseña de la copia queda para las siguientes');
  assert.equal(JSON.stringify(im).includes('otra-clave-99'), false);
  assert.equal(JSON.parse((await api(page, 'backup')).data.json).type, 'bitacora-dev-backup-enc');
  // Off: plain backup, no stored password.
  await api(page, 'setBackupEncryption', { enabled: false });
  const claro = await api(page, 'backup');
  assert.deepEqual([claro.data.encrypted, JSON.parse(claro.data.json).projects.length, /\.enc\.json$/.test(claro.data.filename)], [false, 1, false]);
  // Encryption on with an unusable stored password: nothing in the clear and no download.
  await page.evaluate(() => { db.settings.encryptBackup = true; db.settings.backupPassword = 'x'; });
  const sin = await api(page, 'backup', { download: true });
  assert.equal(sin.error.code, 'password-needed');
  assert.equal(descargas.v, 0, 'sin contraseña válida no se descarga nada');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('T80.13 API sin Web Crypto: backup cifrado, importDatabase cifrado y setBackupEncryption(true) dan «crypto-unavailable»; apagar el cifrado sigue pudiendo', async () => {
  const { page, errors, ctx } = await abrir({ encryptBackup: true, backupPassword: PASS });
  const env = await cifrarCopia(page, copiaB());
  await page.evaluate(() => Object.defineProperty(crypto, 'subtle', { get: () => undefined, configurable: true }));
  assert.equal((await api(page, 'backup', { download: true })).error.code, 'crypto-unavailable');
  assert.equal((await api(page, 'importDatabase', { json: env, password: PASS, confirm: true })).error.code, 'crypto-unavailable');
  assert.equal((await api(page, 'setBackupEncryption', { enabled: true, password: 'otra-clave-99' })).error.code, 'crypto-unavailable');
  assert.deepEqual(await nombres(page), ['Proyecto de prueba']);
  assert.equal((await api(page, 'setBackupEncryption', { enabled: false })).ok, true);
  assert.equal((await api(page, 'backup')).data.encrypted, false);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('T80.14 asistente: «cifra la copia de seguridad» abre el diálogo de contraseña (nunca en el chat) y la copia sale cifrada sin preguntar; «cambia la contraseña» la renueva; desactivar pide permiso y borra la contraseña', async () => {
  const NUEVA = 'otra-clave-22';
  const { page, errors, ctx, aiRequests } = await abrir({}, { open: true, ai: async () => 'No debería llamarse.' });
  const conClave = async (orden, pass) => {
    const hecha = pedir(page, orden);
    await clave(page, pass);
    await page.keyboard.press('Enter');
    const m = await hecha;
    await page.waitForFunction(() => !document.querySelector('.modal-pass'));
    return m;
  };
  const copia = async () => {
    const [dl, m] = await Promise.all([page.waitForEvent('download'), pedir(page, 'copia de seguridad')]);
    return { m, name: dl.suggestedFilename(), raw: fs.readFileSync(await dl.path(), 'utf8') };
  };
  const abre = (raw, pass) => page.evaluate(async ({ raw, pass }) => { try { return JSON.parse(await decryptEnvelope(JSON.parse(raw), pass)).projects.length; } catch (e) { return e.message; } }, { raw, pass });
  let m = await pedir(page, 'cambia la contraseña de la copia de seguridad');
  assert.deepEqual([m.name, m.state], ['change-backup-password', 'err']);
  assert.match(m.result, /Activa antes el cifrado/);
  m = await conClave('cifra la copia de seguridad', PASS);
  assert.deepEqual([m.name, m.state, m.perm], ['set-backup-encryption', 'ok', 'auto']);
  assert.deepEqual(await ajusteCifrado(page), [true, PASS]);
  let c = await copia();
  assert.deepEqual([c.m.state, JSON.parse(c.raw).type, /\.enc\.json$/.test(c.name)], ['ok', 'bitacora-dev-backup-enc', true]);
  assert.equal(c.raw.includes('Proyecto de prueba') || c.raw.includes(CLAVE_API), false);
  assert.equal(await abre(c.raw, PASS), 1);
  m = await conClave('cambia la contraseña de la copia de seguridad', NUEVA);
  assert.deepEqual([m.state, ...(await ajusteCifrado(page))], ['ok', true, NUEVA]);
  c = await copia();
  assert.equal(await abre(c.raw, NUEVA), 1);
  assert.equal(await abre(c.raw, PASS), 'decrypt', 'la contraseña anterior ya no abre las copias nuevas');
  m = await pedir(page, 'desactiva el cifrado de la copia de seguridad');
  assert.deepEqual([m.state, m.perm], ['ask', 'confirm']);
  assert.equal((await confirmar(page, 'no')).state, 'cancel');
  assert.deepEqual(await ajusteCifrado(page), [true, NUEVA], 'Cancelar no cambia nada');
  await pedir(page, 'desactiva el cifrado de la copia de seguridad');
  assert.equal((await confirmar(page)).state, 'ok');
  assert.deepEqual(await ajusteCifrado(page), [false, ''], 'sin cifrado tampoco queda la contraseña');
  const cancelada = pedir(page, 'cifra la copia de seguridad');
  await page.waitForSelector('.modal-pass');
  await page.click('.modal-foot .btn.ghost');
  m = await cancelada;
  assert.deepEqual([m.state, ...(await ajusteCifrado(page))], ['err', false, ''], 'cancelar el diálogo no activa nada');
  const rastro = await page.evaluate(() => JSON.stringify(getProject().chat));
  assert.equal(rastro.includes(PASS) || rastro.includes(NUEVA), false, 'las contraseñas no quedan en el chat');
  assert.equal(aiRequests.length, 0);
  assert.deepEqual(errors, []);
  await ctx.close();
});
