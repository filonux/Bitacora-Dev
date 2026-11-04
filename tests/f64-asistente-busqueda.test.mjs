// F64 · The assistant searches like the user: types into the project or history search box and summarizes what remains.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openApp, makeDb, sampleProject } from './helpers.mjs';
import { pedir } from './helpers-asistente.mjs';

let browser;
let reply = '';
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });

const abrir = () => openApp(browser, {
  seed: makeDb({ projects: [sampleProject({ id: 'p1', name: 'Stratus Backup', n: 10, words: 120 }), sampleProject({ id: 'p2', name: 'Pokemascota china', n: 6, words: 60 })] }),
  ai: async () => reply,
});
const proyectosVisibles = (page) => page.evaluate(() => [...document.querySelectorAll('.project-item')].map((e) => e.textContent.trim()));
const notasVisibles = (page) => page.evaluate(() => [...document.querySelectorAll('.version-entry')].filter((e) => e.dataset.searchHidden === 'false').map((e) => e.querySelector('.version-card').dataset.version));

test('T64.1 órdenes locales: «busca «x» en los proyectos / en las notas» escribe en el buscador, resume lo que queda y deja a la vista la primera nota que coincide', async () => {
  const { page, aiRequests, errors } = await abrir();
  const a = await pedir(page, 'busca «pokemascota» en los proyectos');
  assert.equal(a.state, 'ok', a.result);
  assert.equal(a.name, 'search-projects');
  assert.match(a.result, /1\/2.*Pokemascota china/);
  assert.equal(await page.inputValue('#projectSearch'), 'pokemascota');
  assert.deepEqual((await proyectosVisibles(page)).map((s) => s.replace(/\d+.*$/, '')), ['Pokemascota china']);
  const b = await pedir(page, 'busca «nota3palabra1» en las notas');
  assert.equal(b.name, 'search-notes');
  assert.match(b.result, /Stratus Backup.*1\/10.*1\.2/);
  assert.equal(await page.inputValue('#versionSearch'), 'nota3palabra1');
  assert.deepEqual(await notasVisibles(page), ['p1-v3']);
  const dentro = await page.evaluate(() => { const c = document.querySelector('.version-card[data-version="p1-v3"]').getBoundingClientRect(), s = document.querySelector('.workspace-scroll').getBoundingClientRect(); return c.top >= s.top - 2 && c.top < s.bottom; });
  assert.ok(dentro, 'la primera nota que coincide queda a la vista');
  assert.equal(aiRequests.length, 0, 'sin llamar al modelo');
  assert.deepEqual(errors, []);
});

test('T64.2 lo ambiguo llega al modelo, que usa las acciones; sin texto se limpia el buscador y con project abre ese proyecto', async () => {
  const { page, aiRequests } = await abrir();
  reply = '[[ACCION: search-notes query="nota2palabra1"]]';
  const a = await pedir(page, 'busca algo sobre la segunda nota');
  assert.equal(aiRequests.length, 1, 'sin comillas ni destino explícito no hay orden local');
  assert.equal(a.state, 'ok', a.result);
  assert.deepEqual(await notasVisibles(page), ['p1-v2']);
  reply = '[[ACCION: search-notes]]';
  assert.equal((await pedir(page, 'quita el filtro')).state, 'ok');
  assert.equal(await page.inputValue('#versionSearch'), '');
  assert.equal((await notasVisibles(page)).length, 10);
  reply = '[[ACCION: search-projects query="poke"]]';
  await pedir(page, 'encuentra el de las mascotas');
  assert.equal(await page.inputValue('#projectSearch'), 'poke');
  reply = '[[ACCION: search-projects]]';
  await pedir(page, 'muestra todos');
  assert.equal(await page.inputValue('#projectSearch'), '');
  assert.equal((await proyectosVisibles(page)).length, 2);
  reply = '[[ACCION: search-notes project="Pokemascota china" query="nota2palabra1"]]';
  const d = await pedir(page, 'mira en el otro proyecto');
  assert.equal(d.state, 'ok', d.result);
  assert.equal(await page.evaluate(() => getProject().name), 'Pokemascota china');
  assert.deepEqual(await notasVisibles(page), ['p2-v2']);
  reply = '[[ACCION: search-notes project="No existe" query="x"]]';
  assert.equal((await pedir(page, 'busca en uno que no existe')).state, 'err');
});

test('T64.3 API searchProjects y searchVersions: filtran como el usuario, validan y constan en describe()', async () => {
  const { page, errors } = await abrir();
  const r = await page.evaluate(() => BitacoraAPI.searchProjects({ query: 'poke' }));
  assert.equal(r.ok, true);
  assert.deepEqual([r.data.query, r.data.count, r.data.total], ['poke', 1, 2]);
  assert.equal(await page.inputValue('#projectSearch'), 'poke');
  const v = await page.evaluate(() => BitacoraAPI.searchVersions({ projectId: 'p2', query: 'nota2palabra1' }));
  assert.equal(v.ok, true, JSON.stringify(v));
  assert.deepEqual([v.data.count, v.data.total], [1, 6]);
  assert.equal(await page.inputValue('#versionSearch'), 'nota2palabra1');
  const mal = await page.evaluate(() => BitacoraAPI.searchVersions({ projectId: 'nope', query: 'x' }));
  assert.equal(mal.ok, false);
  assert.ok(mal.error.code);
  const d = await page.evaluate(() => JSON.stringify(BitacoraAPI.describe()));
  assert.ok(d.includes('searchProjects') && d.includes('searchVersions'));
  assert.deepEqual(errors, []);
});
