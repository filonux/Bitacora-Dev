import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openApp, makeDb, sampleProject, stored } from './helpers.mjs';

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });

const api = (page, op, args) => page.evaluate(([o, a]) => window.BitacoraAPI[o](a), [op, args]);
const shapeOk = (r, label) => {
  assert.ok(r && typeof r.ok === 'boolean', `${label}: sin ok`);
  if (r.ok) assert.ok('data' in r, `${label}: falta data`);
  else assert.ok(r.error?.code && r.error?.message, `${label}: falta error.code/message`);
};
const enteros = '[[VERSION: 1 => 1]]\n[[VERSION: 2 => 2]]\n[[VERSION: 3 => 3]]';

test('T10.1 describe() lista todas las operaciones', async () => {
  const { page, ctx } = await openApp(browser);
  const r = await page.evaluate(() => ({ keys: Object.keys(window.BitacoraAPI), d: window.BitacoraAPI.describe(), frozen: Object.isFrozen(window.BitacoraAPI) }));
  const listed = r.d.operations.map((o) => o.name);
  const exposed = r.keys.filter((k) => !['describe', 'version'].includes(k));
  assert.deepEqual([...listed].sort(), [...exposed].sort());
  for (const must of ['createProject', 'updateProject', 'deleteProject', 'addVersion', 'updateVersion', 'setText', 'setStyle', 'renumberVersions', 'proposeRenumber', 'acceptRenumber', 'save', 'backup', 'exportProject', 'importDatabase']) assert.ok(listed.includes(must), `falta ${must}`);
  assert.ok(r.d.operations.every((o) => o.description.length > 10));
  assert.equal(r.d.version, '3.2.2');
  assert.equal(r.frozen, true);
  await ctx.close();
});

test('T10.2 cada operación devuelve {ok,data|error} y no abre diálogos', async () => {
  const { page, ctx, errors } = await openApp(browser, { ai: async () => enteros });
  let dialogs = 0;
  page.on('dialog', (d) => { dialogs++; d.dismiss(); });
  const calls = [];
  const call = async (op, args) => { const r = await api(page, op, args); shapeOk(r, op); calls.push(op); assert.equal(await page.locator('#modalLayer.open').count(), 0, `${op} abrió un modal`); return r; };

  assert.equal((await call('state')).ok, true);
  const pr = await call('createProject', { name: 'Proyecto API', description: 'creado por agente' });
  assert.equal(pr.ok, true);
  const pid = pr.data.id;
  assert.equal((await call('createProject', { name: '  ' })).error.code, 'invalid-argument');
  assert.equal((await call('updateProject', { id: pid, name: 'Proyecto API 2' })).data.name, 'Proyecto API 2');
  assert.equal((await call('getProject', { id: 'no-existe' })).error.code, 'project-not-found');
  await call('listProjects');
  await call('selectProject', { id: pid });

  const v1 = (await call('listVersions', { projectId: pid })).data[0].id;
  const v2 = (await call('addVersion', { projectId: pid, instructions: 'segunda' })).data;
  assert.equal(v2.version, '1.1');
  assert.equal((await call('updateVersion', { id: v2.id, revertsVersionId: v1 })).data.revertsVersionId, v1);
  assert.equal((await call('updateVersion', { id: v1, revertsVersionId: v2.id })).error.code, 'invalid-argument', 'solo versiones anteriores');
  const v3 = (await call('duplicateVersion', { id: v2.id })).data;
  assert.equal(v3.instructions, 'segunda');
  await call('getVersion', { id: v3.id });

  await call('setText', { id: v1, text: 'hola' });
  await call('setText', { id: v1, text: ' mundo', append: true });
  assert.equal((await call('getText', { id: v1 })).data.text, 'hola mundo');
  assert.equal((await call('setText', { id: v1, text: 5 })).error.code, 'invalid-argument');

  assert.deepEqual((await call('setStyle', { id: v1, font: 'mono', size: 18, b: true })).data, { font: 'mono', size: 18, b: true, i: false, u: false, s: false });
  assert.equal((await call('setStyle', { id: v1, font: 'toString' })).error.code, 'invalid-argument');
  assert.equal((await call('setStyle', { id: v1, size: 99 })).error.code, 'invalid-argument');
  assert.equal((await call('setStyle', { id: v1, b: 'sí' })).error.code, 'invalid-argument');
  await call('getStyle', { id: v1 });

  const ren = await call('renumberVersions', { map: { [v1]: 'A', [v2.id]: 'B' } });
  assert.deepEqual(ren.data.map((v) => v.version), ['A', 'B', '1.2']);
  assert.equal((await call('renumberVersions', { map: { [v1]: 'B' } })).error.code, 'invalid-numbering', 'repetido');
  assert.equal((await call('renumberVersions', { map: { [v1]: 'a b' } })).error.code, 'invalid-numbering', 'espacios');
  assert.equal((await call('renumberVersions', { map: { zzz: 'X' } })).error.code, 'version-not-found');

  const pe = (await call('addPending', { text: 'revisar' })).data;
  assert.equal((await call('setPending', { id: pe.id, done: true })).data.done, true);
  assert.equal((await call('listPending')).data.length, 1);
  await call('removePending', { id: pe.id });
  assert.equal((await call('setSettings', { lang: 'fr' })).error.code, 'invalid-argument');
  assert.equal((await call('setSettings', { autosave: 'off', saveDelay: 300 })).data.autosave, 'off');

  assert.equal((await call('save')).data.storage, 'local');
  const bk = (await call('backup')).data;
  assert.ok(JSON.parse(bk.json).projects.length >= 2 && /^bitacora-db-.*\.json$/.test(bk.filename));
  const ep = (await call('exportProject', { id: pid })).data;
  assert.match(ep.text, /Proyecto API 2/);
  assert.equal((await call('exportProject', { id: pid, format: 'pdf' })).error.code, 'unsupported-format');
  assert.match((await call('exportVersion', { id: v1 })).data.text, /^VERSIÓN A\nhola mundo$/i);

  assert.equal((await call('deleteVersion', { id: v3.id })).error.code, 'confirm-required');
  assert.equal((await call('deleteVersion', { id: v3.id, confirm: true })).ok, true);
  assert.equal((await call('importDatabase', { json: bk.json })).error.code, 'confirm-required');
  assert.equal((await call('importDatabase', { json: '{no', confirm: true })).error.code, 'invalid-json');
  assert.equal((await call('importDatabase', { json: '{"a":1}', confirm: true })).error.code, 'invalid-database');
  assert.equal((await call('importDatabase', { json: bk.json, confirm: true })).data.projects, 2);
  assert.equal((await call('deleteProject', { id: pid })).error.code, 'confirm-required');
  assert.equal((await call('deleteProject', { id: pid, confirm: true })).ok, true);
  assert.equal((await call('getProject', { id: pid })).error.code, 'project-not-found');

  const prop = await call('proposeRenumber');
  assert.equal(prop.ok, true, JSON.stringify(prop));
  assert.equal((await call('acceptRenumber', { messageId: prop.data.messageId })).ok, true);
  assert.equal((await call('acceptRenumber', { messageId: 'nope' })).error.code, 'proposal-not-found');

  assert.ok(calls.length >= 40 && dialogs === 0, `diálogos nativos: ${dialogs}`);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('T10.3 los cambios por API aparecen en la UI y persisten', async () => {
  let { page, ctx } = await openApp(browser, { seed: makeDb({ projects: [sampleProject({ n: 2 })] }) });
  const v = (await api(page, 'listVersions', {})).data;
  await api(page, 'setText', { id: v[0].id, text: 'texto del agente' });
  await api(page, 'setStyle', { id: v[0].id, font: 'mono', size: 20, i: true });
  await api(page, 'formatText', { id: v[0].id, from: 0, to: 5, b: true });
  await api(page, 'addVersion', { instructions: 'nota nueva' });
  await api(page, 'updateProject', { name: 'Renombrado por API' });
  assert.equal(await page.locator('.project-title').textContent(), 'Renombrado por API', 'título en la UI');
  assert.equal(await page.locator('.version-card').count(), 3);
  const ta = page.locator('.version-card').first().locator('.instruction');
  assert.equal(await ta.innerText(), 'texto del agente');
  const css = await page.evaluate(() => [...document.querySelector('.version-card .instruction').querySelectorAll('.m')].map((el) => { const s = getComputedStyle(el); return { t: el.textContent, f: s.fontFamily, z: s.fontSize, i: s.fontStyle, w: s.fontWeight }; }));
  assert.equal(css.length, 2); assert.equal(css[0].t, 'texto'); assert.equal(css[0].w, '700'); assert.equal(css[1].w, '400');
  for (const c of css) { assert.match(c.f, /Courier/); assert.equal(c.z, '20px'); assert.equal(c.i, 'italic'); }
  // persisted without waiting for autosave, also after a reload
  const db = await stored(page);
  assert.equal(db.projects[0].name, 'Renombrado por API', 'localStorage');
  assert.deepEqual(db.projects[0].versions[0].marks, [{ from: 0, to: 5, font: 'mono', size: 20, b: true, i: true }, { from: 5, to: 16, font: 'mono', size: 20, i: true }]);
  // "Reload" = reopen the app with the saved data: with file:// headless Chromium loses storage in ~1 of 40 real reloads.
  await ctx.close();
  ({ page, ctx } = await openApp(browser, { seed: db }));
  const again = await api(page, 'getProject', { id: db.projects[0].id });
  assert.equal(again.data.name, 'Renombrado por API', 'tras recargar');
  assert.equal(again.data.versions.length, 3);
  assert.equal(again.data.versions[0].instructions, 'texto del agente');
  // language through the API
  await api(page, 'setSettings', { lang: 'en' });
  assert.equal(await page.evaluate(() => document.documentElement.lang), 'en');
  await ctx.close();
});

test('T10.3b importDatabase por API conserva las claves de API guardadas', async () => {
  const { page, ctx } = await openApp(browser);
  await page.evaluate(() => { db.settings.providers.openai.key = 'sk-secreta'; persist(); });
  const bk = (await api(page, 'backup', {})).data;
  assert.ok(!bk.json.includes('sk-secreta'));
  await api(page, 'importDatabase', { json: bk.json, confirm: true });
  assert.equal(await page.evaluate(() => db.settings.providers.openai.key), 'sk-secreta');
  await ctx.close();
});

async function scanControls(page) {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 30))))); // the label pass runs in rAF
  return page.evaluate(() => {
    const els = [...document.querySelectorAll('button,.instruction,.version-input,.project-item[data-project],input:not([type=hidden]):not([type=file]),textarea')];
    const dup = (arr) => arr.filter((x, i) => arr.indexOf(x) !== i);
    return {
      n: els.length,
      noAgent: els.filter((e) => !e.dataset.agent).map((e) => e.id || e.className),
      noLabel: els.filter((e) => !(e.getAttribute('aria-label') || '').trim()).map((e) => e.id || e.className),
      dupLabel: dup(els.map((e) => e.getAttribute('aria-label'))),
      dupAgent: dup(els.map((e) => `${e.dataset.agent}|${e.dataset.target || ''}`)),
    };
  });
}

test('T10.4 los controles tienen data-agent y aria-label únicos (ES y EN, en todos los paneles)', async () => {
  for (const lang of ['es', 'en']) {
    const { page, ctx } = await openApp(browser, { lang, seed: makeDb({ projects: [sampleProject({ n: 3 }), sampleProject({ id: 'p2', name: 'Otro', n: 2 })] }), ai: async () => enteros });
    const check = async (state) => { const r = await scanControls(page); assert.ok(r.n > 40, `${lang}/${state}: pocos controles (${r.n})`); assert.deepEqual({ a: r.noAgent, l: r.noLabel, dl: r.dupLabel, da: r.dupAgent }, { a: [], l: [], dl: [], da: [] }, `${lang}/${state}`); };
    await check('base');
    await page.click('[data-action="diff"]'); await check('análisis abierto');
    await page.click('#helpBtn'); await check('ayuda'); await page.keyboard.press('Escape');
    await page.click('#settingsBtn'); await check('configuración'); await page.click('#settingsClose');
    await page.click('#commandBtn'); await check('paleta'); await page.keyboard.press('Escape');
    await page.waitForFunction(() => !aiBusy); // the diff analysis uses the mock AI
    await page.click('[data-ai-action="renumber"]'); await page.waitForSelector('[data-renum-accept]'); await check('propuesta de renumeración');
    await api(page, 'addVersion', {}); await check('versión añadida por API');
    // stable, concrete values on the main buttons
    const ag = await page.evaluate(() => Object.fromEntries(['saveBtn', 'backupBtn', 'exportBtn', 'importBtn', 'helpBtn', 'commandBtn', 'aiToggle'].map((id) => [id, document.getElementById(id).dataset.agent])));
    assert.deepEqual(ag, { saveBtn: 'save', backupBtn: 'backup', exportBtn: 'export', importBtn: 'import', helpBtn: 'help', commandBtn: 'commands', aiToggle: 'ai-toggle' });
    await ctx.close();
  }
});

test('T10.4b el aria-label cambia con el idioma y los proyectos se abren con teclado', async () => {
  const { page, ctx } = await openApp(browser, { seed: makeDb({ projects: [sampleProject({ n: 2 }), sampleProject({ id: 'p2', name: 'Otro', n: 1 })] }), open: false });
  await page.waitForTimeout(120);
  const lbl = () => page.$eval('#commandBtn', (e) => e.getAttribute('aria-label'));
  assert.equal(await lbl(), 'Comandos');
  await page.click('#langEn'); await page.waitForTimeout(120);
  assert.equal(await lbl(), 'Commands');
  const item = page.locator('.project-item[data-project="p2"]');
  assert.equal(await item.getAttribute('role'), 'button');
  await item.focus(); await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => activeProjectId), 'p2');
  await ctx.close();
});
