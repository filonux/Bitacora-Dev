// F81 · F78–F80 review: backup dialog title, passwords kept out of the chat, and focus on closing dialogs.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openApp, makeDb } from './helpers.mjs';

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });

const abrir = (settings = {}, opts = {}) => openApp(browser, { open: false, seed: makeDb({ settings }), ...opts });
const ajustes = (page) => page.evaluate(() => openSettings());

for (const [lang, rotulo] of [['es', 'Guardar contraseña'], ['en', 'Save password']]) {
  test(`T81.1 el diálogo de la contraseña de la copia ofrece «${rotulo}» al activar el cifrado y al cambiarla (${lang})`, async () => {
    const { page, errors, ctx } = await abrir({}, { lang });
    await ajustes(page);
    await page.check('#encryptBackupChk');
    await page.waitForSelector('.modal-pass');
    assert.equal(await page.locator('.modal-pass .modal-foot .btn.primary').textContent(), rotulo);
    await page.click('.modal-foot .btn.ghost');
    await page.evaluate(() => { db.settings.encryptBackup = true; db.settings.backupPassword = 'clave-copia-1'; renderCopyBlocks(); });
    await page.click('#changeBackupPassBtn');
    await page.waitForSelector('.modal-pass');
    assert.equal(await page.locator('.modal-pass .modal-foot .btn.primary').textContent(), rotulo);
    await page.click('.modal-foot .btn.ghost');
    assert.deepEqual(errors, []);
    await ctx.close();
  });
}

// ── Passwords typed in the chat ──
import { pedir } from './helpers-asistente.mjs';

const MASCARA = '••••••';
const api = (page, op, args = {}) => page.evaluate(([o, a]) => BitacoraAPI[o](a), [op, args]);
const rastros = (page, secreto) => page.evaluate(async (s) => {
  const memoria = JSON.stringify(BitacoraAPI.exportMemory({ all: true }));
  return { db: JSON.stringify(db).includes(s), memoria: memoria.includes(s), pantalla: document.body.innerText.includes(s), almacen: localStorage.getItem('bitacora-dev-v2').includes(s) };
}, secreto);
const sinRastro = { db: false, memoria: false, pantalla: false, almacen: false };

test('T81.2 hideSecrets oculta el valor tras contraseña/password/API key y deja intacto lo que no es un secreto', async () => {
  const { page, errors, ctx } = await abrir();
  const ocultas = [
    ['cifra la copia de seguridad con la contraseña Secreta123', `cifra la copia de seguridad con la contraseña ${MASCARA}`],
    ['usa la contraseña "mi frase larga" para la copia', `usa la contraseña ${MASCARA} para la copia`],
    ['La CONTRASEÑA es Hunter2!', `La CONTRASEÑA es ${MASCARA}`],
    ['contraseña: MiClave', `contraseña: ${MASCARA}`],
    ['password=hunter', `password=${MASCARA}`],
    ['PASSWORD 12345678', `PASSWORD ${MASCARA}`],
    ['the password is Hunter2, thanks', `the password is ${MASCARA} thanks`],
    ['mi API key es sk-proj-AbC123xyz', `mi API key es ${MASCARA}`],
    ['clave de la API: sk-test-12345678', `clave de la API: ${MASCARA}`],
    ['api_key = "abc"', `api_key = ${MASCARA}`],
    ['dos: contraseña Abc12345 y password=xyz', `dos: contraseña ${MASCARA} y password=${MASCARA}`],
  ];
  const intactas = [
    'cambia la contraseña de la copia de seguridad',
    '¿por qué dice que la contraseña es incorrecta?',
    'valida la contraseña de 8 caracteres',
    'añade pendiente: contraseña: validar longitud',
    'busca "contraseña" en las notas',
    'el campo password_hash no cambia',
    'reset password 2FA',
    'what is the password policy?',
    'la contraseña es obligatoria',
    'exporta las APIs cifradas',
    'la clave primaria de la tabla',
  ];
  const salida = await page.evaluate(([o, i]) => ({ o: o.map(([a]) => hideSecrets(a)), i: i.map((a) => hideSecrets(a)) }), [ocultas, intactas]);
  assert.deepEqual(salida.o, ocultas.map(([, b]) => b));
  assert.deepEqual(salida.i, intactas);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('T81.3 orden local con la contraseña en la frase: la orden sigue pidiéndola en su diálogo y ni el chat, ni «Exportar memoria», ni la pantalla, ni el almacenamiento la conservan', async () => {
  const SECRETO = 'Secreta-Clave-123';
  const { page, errors, ctx, aiRequests } = await abrir({}, { open: true, ai: async () => 'No debería llamarse.' });
  const hecha = pedir(page, `cifra la copia de seguridad con la contraseña ${SECRETO}`);
  await page.waitForSelector('.modal-pass');
  assert.equal(await page.locator('#passInput').inputValue(), '', 'el diálogo no recibe la contraseña de la frase');
  await page.click('.modal-foot .btn.ghost');
  const m = await hecha;
  assert.deepEqual([m.name, m.state], ['set-backup-encryption', 'err']);
  assert.equal(await page.evaluate(() => getProject().chat.find((x) => x.role === 'user').text), `cifra la copia de seguridad con la contraseña ${MASCARA}`);
  await page.waitForFunction((k) => localStorage.getItem('bitacora-dev-v2').includes(k), MASCARA);
  assert.deepEqual(await rastros(page, SECRETO), sinRastro);
  assert.equal(aiRequests.length, 0, 'una orden local no consulta al modelo');
  assert.deepEqual(errors, []);
  await ctx.close();
});

for (const [lang, frase, aviso] of [
  ['es', (s) => `¿Qué opinas de usar la contraseña ${s} en este proyecto?`, /Clave o contraseña ocultada/],
  ['en', (s) => `What do you think of using the password ${s} in this project?`, /Key or password hidden/],
]) {
  test(`T81.4 con una frase que no es orden local el proveedor no recibe la contraseña, ni en la pregunta ni en el historial; se avisa (${lang})`, async () => {
    const SECRETO = 'Hunter2-Secreto';
    const { page, errors, ctx, aiRequests } = await abrir({}, { lang, open: true, ai: async () => 'Entendido.' });
    await page.fill('#aiInput', frase(SECRETO));
    await page.click('#aiSend');
    await page.waitForFunction((re) => new RegExp(re).test(document.querySelector('#toast.show')?.textContent || ''), aviso.source);
    await page.waitForFunction(() => getProject().chat.some((x) => x.role === 'assistant' && x.text === 'Entendido.'));
    assert.equal(aiRequests.length, 1);
    assert.equal(JSON.stringify(aiRequests).includes(SECRETO), false, 'el proveedor no la recibe');
    assert.ok(JSON.stringify(aiRequests).includes(MASCARA), 'la pregunta llega con la máscara');
    await page.fill('#aiInput', lang === 'es' ? 'Gracias, ¿algo más?' : 'Thanks, anything else?');
    await page.click('#aiSend');
    await page.waitForFunction(() => getProject().chat.filter((x) => x.role === 'assistant').length === 2);
    assert.equal(JSON.stringify(aiRequests).includes(SECRETO), false, 'el historial que viaja con la siguiente tampoco');
    assert.deepEqual(await rastros(page, SECRETO), sinRastro);
    assert.deepEqual(errors, []);
    await ctx.close();
  });
}

test('T81.5 la API askAI aplica el mismo enmascarado que el chat', async () => {
  const { page, errors, ctx, aiRequests } = await abrir({}, { open: true, ai: async () => 'Hecho.' });
  const r = await api(page, 'askAI', { text: 'usa password=zq7vw y dime qué opinas' });
  assert.equal(r.ok, true);
  assert.equal(JSON.stringify(aiRequests).includes('zq7vw'), false);
  assert.equal(await page.evaluate(() => getProject().chat.find((x) => x.role === 'user').text), `usa password=${MASCARA} y dime qué opinas`);
  assert.deepEqual(await rastros(page, 'zq7vw'), sinRastro);
  assert.deepEqual(errors, []);
  await ctx.close();
});

// ── Focus on closing dialogs ──
const foco = (page) => page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName);

test('T81.6 al cerrar el diálogo de contraseña (Esc, Cancelar, Guardar o ×) el foco vuelve a la casilla o al botón que lo abrió, no a BODY', async () => {
  const { page, errors, ctx } = await abrir();
  await ajustes(page);
  await page.check('#encryptBackupChk');
  await page.waitForSelector('.modal-pass');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('.modal-pass'));
  assert.equal(await foco(page), 'encryptBackupChk', 'Esc');
  assert.equal(await page.locator('#encryptBackupChk').isChecked(), false, 'Esc deja la casilla desmarcada');
  await page.check('#encryptBackupChk');
  await page.click('.modal-foot .btn.ghost');
  assert.equal(await foco(page), 'encryptBackupChk', 'Cancelar');
  await page.check('#encryptBackupChk');
  await page.fill('#passInput', 'clave-copia-1');
  await page.fill('#passConfirm', 'clave-copia-1');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => !document.querySelector('.modal-pass'));
  assert.equal(await foco(page), 'encryptBackupChk', 'Guardar');
  assert.equal(await page.locator('#encryptBackupChk').isChecked(), true);
  await page.click('#changeBackupPassBtn');
  await page.waitForSelector('.modal-pass');
  await page.click('.modal-head [data-modal-close]');
  assert.equal(await foco(page), 'changeBackupPassBtn', '×');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('T81.7 el foco vuelve también en los demás diálogos con campos (+ Proyecto); uno que sustituye a otro conserva el control original', async () => {
  const { page, errors, ctx } = await abrir();
  await page.click('#newProjectBtn');
  await page.waitForSelector('.modal-box');
  assert.notEqual(await foco(page), 'newProjectBtn', 'el formulario se queda con el foco');
  await page.keyboard.press('Escape');
  assert.equal(await foco(page), 'newProjectBtn');
  await page.click('#newProjectBtn');
  await page.waitForSelector('.modal-box');
  await page.evaluate(() => openModal({ title: 'Otro', bodyHTML: '<input id="otroCampo" />', onOpen: () => document.querySelector('#otroCampo').focus() }));
  await page.waitForFunction(() => document.activeElement?.id === 'otroCampo');
  await page.keyboard.press('Escape');
  assert.equal(await foco(page), 'newProjectBtn', 'el diálogo que sustituye al primero devuelve el foco al control original');
  await page.evaluate(() => { document.activeElement.blur(); openModal({ title: 'Sin origen', bodyHTML: '<p>x</p>' }); });
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.modal-box').count(), 0);
  assert.deepEqual(errors, []);
  await ctx.close();
});
