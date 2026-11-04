// F67 · Assistant–UI parity: every control has an assistant action or a justified exclusion; Undo and Copy note.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openApp, makeDb, sampleProject } from './helpers.mjs';
import { pedir, confirmar } from './helpers-asistente.mjs';

let browser;
let reply = '';
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });

const abrir = (lang = 'es', p = sampleProject({ id: 'p1', name: 'Stratus Backup', n: 3, words: 30 })) => {
  p.pending = [{ id: 't1', text: 'Una tarea', done: false, source: 'manual', createdAt: '2026-02-01T10:00:00.000Z' }];
  return openApp(browser, { seed: makeDb({ projects: [p] }), lang, ai: async () => reply });
};
const versiones = (page) => page.evaluate(() => getProject().versions.map((v) => v.version));

/* Audit: what is on screen → the action that does it from the chat, or why there is none.
   `A(...)` = assistant actions; `X(reason)` = no action, on purpose; `P(phrase)` = shortcut for a request the chat already accepts in writing. */
const A = (...acciones) => ({ acciones });
const X = (motivo) => ({ fuera: motivo });
const P = (frase) => ({ peticion: frase });
const CONTROLES = {
  // Header and project list
  '#newProjectBtn': A('new-project'), '#importBtn': A('import'), '#importFile': A('import'), '#projectSearch': A('search-projects'),
  '[data-project]': A('select'), '#saveBtn': A('save'), '#backupBtn': A('backup'), '#exportBtn': A('export'), '#settingsBtn': A('settings'),
  '#langEs': A('config'), '#langEn': A('config'), '#zoomBtn': A('config'), '#zoomOut': A('config'), '#zoomReset': A('config'), '#zoomIn': A('config'),
  '#helpBtn': A('help'), '#commandBtn': A('commands'), '#aiToggle': A('ai-panel'), '#aiClose': A('ai-panel'),
  '#aiChip': A('ai-provider'), '#aiChipFilter': A('ai-provider'), '#aiChipO*': A('ai-provider'), '[data-chip=settings]': A('settings'),
  '[data-chip=detect]': X('rellena la lista de modelos de la ventana; el asistente ya trabaja con el proveedor activo'),
  // Project, notes and pending tasks
  '#editProjectBtn': A('edit-project'), '#projectExportBtn': A('export'), '#deleteProjectBtn': A('delete-project'), '#versionSearch': A('search-notes'),
  '#addVersionTopBtn': A('new-note'), '#addVersionBtn': A('new-note'), '#workspaceDown': X('solo desplaza la vista; «seleccionar nota» ya lleva la nota a la pantalla'),
  '[data-field=version]': A('set-version'), '#revert-*': A('set-reverts'),
  '[data-action=diff]': A('analyze-changes'), '[data-action=duplicate]': A('duplicate-note'), '[data-action=delete]': A('delete-note'),
  '[data-action=copy]': A('copy-note'), '[data-action=exportVersion]': A('export'), '[data-action=focus]': A('select'),
  '#fmt-*-font': A('format-note'), '#fmt-*-size': A('format-note'), '[data-fmt=b]': A('format-note'), '[data-fmt=i]': A('format-note'), '[data-fmt=u]': A('format-note'), '[data-fmt=s]': A('format-note'),
  '#pendingAddInput': A('add-pending'), '#pendingAddBtn': A('add-pending'), '[data-pending-toggle]': A('done-pending'),
  '[data-pending-up]': A('move-pending'), '[data-pending-down]': A('move-pending'), '[data-pending-edit]': A('edit-pending'), '[data-pending-remove]': A('remove-pending'),
  // Assistant panel
  '#aiInput': P('el propio chat'), '#aiSend': P('el propio chat'), '#aiClear': A('clear-chat'), '#aiMemImport': A('memory-import'), '#aiMemExport': A('memory-export'),
  '[data-ai-action=summary]': P('resume el proyecto'), '[data-ai-action=changes]': P('compara las últimas versiones'), '[data-ai-action=contradictions]': P('busca contradicciones'),
  '[data-ai-action=pending]': P('extrae los pendientes'), '[data-ai-action=renumber]': A('renumber'), '[data-ai-action=addPending]': A('add-pending'),
  '[data-ai-action=donePending]': A('done-pending'), '[data-ai-action=removePending]': A('remove-pending'),
  // Settings
  '#settingsClose': A('settings'), '#activeProviderFace': A('ai-provider'), '[data-pfield=model]': A('ai-provider'),
  '[data-pfield=baseUrl]': X('decide adónde viajan tus notas y claves: solo la cambia la persona'), '[data-pfield=key]': X('claves API: el asistente nunca las ve ni las escribe'),
  '[data-refresh]': X('rellena la lista de modelos de la ventana; el asistente ya trabaja con el proveedor activo'), '[data-ping]': X('prueba la conexión de un proveedor; si el asistente contesta, la activa ya funciona'),
  '#exportProvidersBtn': A('export-apis'), '#importProvidersBtn': A('import-apis'), '#encryptApiExportChk': A('set-apis-encryption'), '#encryptBackupChk': A('set-backup-encryption'),
  '#changeBackupPassBtn': A('change-backup-password'),
  '#autosaveSelect': A('config'), '#saveDelay': A('config'), '#modelProfileSelect': A('config'),
  '#saveSettingsBtn': X('las acciones de configuración ya guardan al ejecutarse'), '#resetSettingsBtn': X('borraría proveedores y claves: solo la persona'),
  // Project and export dialogs
  '#modalPName': A('new-project', 'edit-project'), '#modalPDesc': A('new-project', 'edit-project'),
  '#modalIconUpload': X('el icono necesita una imagen'), '#modalIconRemove': X('el icono necesita una imagen'),
  '[data-export-format]': A('export'), '[data-modal-action]': X('confirma o cancela un diálogo que la acción del asistente ya resuelve'), '[data-modal-close]': X('cierra un diálogo; el asistente no los abre, ejecuta la acción'),
};

/** Keys of the visible controls inside `raiz`: the id (without the per-note part) or the data-* attribute that identifies them. */
const claves = (page, raiz) => page.evaluate((raiz) => {
  const r = document.querySelector(raiz);
  if (!r) return null;
  const CON_VALOR = ['data-action', 'data-fmt', 'data-ai-action', 'data-pfield', 'data-field', 'data-chip'];
  const SIN_VALOR = ['data-project', 'data-export-format', 'data-modal-action', 'data-modal-close', 'data-pending-toggle', 'data-pending-up', 'data-pending-down', 'data-pending-edit', 'data-pending-remove', 'data-refresh', 'data-ping'];
  const out = new Set();
  for (const e of r.querySelectorAll('button, input, select, textarea, summary, [role=button], [role=option], [data-project]')) {
    if (!e.offsetWidth && !e.offsetHeight) continue;
    if (e.id) { out.add('#' + e.id.replace(/^fmt-.+-(font|size)$/, 'fmt-*-$1').replace(/^revert-.+$/, 'revert-*').replace(/^aiChipO\d+$/, 'aiChipO*')); continue; }
    const c = CON_VALOR.find((a) => e.hasAttribute(a)), s = SIN_VALOR.find((a) => e.hasAttribute(a));
    out.add(c ? `[${c}=${e.getAttribute(c)}]` : s ? `[${s}]` : `${e.tagName.toLowerCase()}.${String(e.className).split(' ')[0]}`);
  }
  return [...out].sort();
}, raiz);

test('T67.1 auditoría: todo control visible tiene acción del asistente o una exclusión justificada, y las acciones citadas existen', async () => {
  const { page, errors } = await abrir();
  const vistos = new Map();
  const ver = async (estado, raiz) => { const k = await claves(page, raiz); assert.ok(k && k.length, `${estado}: sin controles en ${raiz}`); for (const c of k) vistos.set(c, estado); };
  await ver('pantalla principal', 'body');
  for (const [estado, boton] of [['menú del modelo', '#aiChip'], ['menú de zoom', '#zoomBtn']]) {
    await page.click(boton); await page.waitForTimeout(300); await ver(estado, 'body'); await page.keyboard.press('Escape');
  }
  for (const [estado, boton] of [['nuevo proyecto', '#newProjectBtn'], ['editar proyecto', '#editProjectBtn'], ['exportar', '#exportBtn']]) {
    await page.click(boton); await page.waitForSelector('#modalLayer.open'); await ver(estado, '#modalLayer.open'); await page.keyboard.press('Escape');
    await page.waitForSelector('#modalLayer.open', { state: 'detached' }).catch(() => {});
  }
  await page.click('#settingsBtn'); await page.waitForSelector('#settingsDrawer.open'); await ver('configuración', '#settingsDrawer.open');
  await page.evaluate(() => { db.settings.encryptBackup = true; db.settings.backupPassword = 'clave-copia-1'; renderCopyBlocks(); }); // with encryption on, «Cambiar contraseña» appears
  await ver('configuración con copia cifrada', '#settingsDrawer.open');
  const acciones = await page.evaluate(() => Object.keys(ASSISTANT_ACTIONS));
  const sinMapa = [...vistos].filter(([c]) => !CONTROLES[c]).map(([c, e]) => `${c} (${e})`);
  assert.deepEqual(sinMapa, [], 'controles nuevos sin acción ni exclusión justificada: añádelos a CONTROLES');
  for (const [c, d] of Object.entries(CONTROLES)) {
    if (d.acciones) for (const a of d.acciones) assert.ok(acciones.includes(a), `${c} cita la acción inexistente «${a}»`);
    else assert.ok(String(d.fuera || d.peticion || '').length > 8, `${c} necesita un motivo o una frase`);
  }
  assert.ok(vistos.size >= 60, `la auditoría vio solo ${vistos.size} controles distintos`);
  assert.deepEqual(errors, []);
});

test('T67.2 «deshacer» revierte lo último que se pueda deshacer (renumerar, borrar una nota), una sola vez y solo durante diez minutos', async () => {
  const { page, aiRequests, errors } = await abrir();
  assert.deepEqual(await versiones(page), ['1.0', '1.1', '1.2']);
  const antes = await page.evaluate(() => getProject().versions.map((v) => v.id));
  assert.equal((await pedir(page, 'deshacer')).state, 'err', 'sin nada que deshacer');

  reply = '[[ACCION: renumber scheme=int]]';
  const r = await pedir(page, 'pon números enteros a las notas');
  assert.equal(r.state, 'ask', 'renumerar pide confirmación');
  assert.equal((await confirmar(page)).state, 'ok');
  assert.deepEqual(await versiones(page), ['1', '2', '3']);
  const u = await pedir(page, 'deshacer');
  assert.equal(u.state, 'ok', u.result);
  assert.equal(u.name, 'undo');
  assert.deepEqual(await versiones(page), ['1.0', '1.1', '1.2']);
  assert.equal((await pedir(page, 'deshacer')).state, 'err', 'ya no queda nada');

  reply = '[[ACCION: delete-note note=1.1]]';
  assert.equal((await pedir(page, 'quita la nota del medio')).state, 'ask');
  assert.equal((await confirmar(page)).state, 'ok');
  assert.deepEqual(await versiones(page), ['1.0', '1.2']);
  const d = await pedir(page, 'deshacer');
  assert.equal(d.state, 'ok', d.result);
  assert.deepEqual(await page.evaluate(() => getProject().versions.map((v) => v.id)), antes, 'la nota vuelve en su sitio');
  assert.equal(await page.evaluate(() => selectedVersionId), antes[1], 'y queda a la vista');

  reply = '[[ACCION: renumber scheme=semver]]';
  await pedir(page, 'pon semver'); await confirmar(page);
  await page.evaluate(() => { lastUndo.at -= 11 * 60 * 1000; });
  assert.equal((await pedir(page, 'undo')).state, 'err', 'pasados diez minutos ya no se deshace');
  assert.equal(aiRequests.filter((x) => /deshacer|undo/i.test(JSON.stringify(x.messages.at(-1)))).length, 0, '«deshacer» y «undo» no llegan al modelo');
  assert.deepEqual(errors, []);
});

test('T67.3 «copiar nota»: lleva «VERSIÓN n» y el texto al portapapeles, por número o la abierta, deja la nota a la vista y avisa si no existe (ES y EN)', async () => {
  const { page, errors } = await abrir();
  const portapapeles = () => page.evaluate(() => window.__clip);
  const textoNota = (n) => page.evaluate((n) => getProject().versions.find((v) => v.version === n).instructions, n);
  reply = '[[ACCION: copy-note note=1.1]]';
  let a = await pedir(page, 'cópiame la segunda');
  assert.equal(a.state, 'ok', a.result);
  assert.match(a.result, /Stratus Backup v1\.1/);
  assert.equal(await portapapeles(), `VERSIÓN 1.1\n${await textoNota('1.1')}`);
  assert.equal(await page.evaluate(() => getProject().versions.find((v) => v.id === selectedVersionId).version), '1.1', 'la nota copiada queda seleccionada');

  await page.evaluate(() => { selectedVersionId = getProject().versions[2].id; });
  reply = '[[ACCION: copy-note]]';
  a = await pedir(page, 'copia esa nota');
  assert.equal(a.state, 'ok', a.result);
  assert.equal(await portapapeles(), `VERSIÓN 1.2\n${await textoNota('1.2')}`, 'sin nota indicada copia la abierta');

  reply = '[[ACCION: copy-note note=9.9]]';
  a = await pedir(page, 'copia la nota nueve');
  assert.equal(a.state, 'err');
  assert.equal(await portapapeles(), `VERSIÓN 1.2\n${await textoNota('1.2')}`, 'un error no toca el portapapeles');
  assert.deepEqual(errors, []);

  const en = await abrir('en');
  reply = '[[ACTION: copy-note note=1.0]]';
  const e = await pedir(en.page, 'copy the first note');
  assert.equal(e.state, 'ok', e.result);
  assert.match(await en.page.evaluate(() => window.__clip), /^VERSION 1\.0\n/);
  assert.deepEqual(en.errors, []);
});
