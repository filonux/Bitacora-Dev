import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openApp, makeDb, sampleProject, stored, medirDesbordes, selectIn } from './helpers.mjs';

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });

// F30 · UI zoom: CSS `zoom` on <html> + `--z`, stored in settings.uiZoom (%). Media queries are rewritten to measure the usable width (window ÷ zoom).
const ESCALA = [50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200];
const api = (page, op, args = {}) => page.evaluate(([o, a]) => window.BitacoraAPI[o](a), [op, args]);
const poner = async (page, z) => { const r = await api(page, 'setSettings', { zoom: z }); await page.waitForTimeout(250); return r; };
const estado = (page) => page.evaluate(() => { const r = document.documentElement; return { z: r.style.getPropertyValue('--z'), zoom: r.style.zoom, pct: BitacoraAPI.state().data.zoom }; });
const menuAbierto = (page) => page.evaluate(() => [!document.getElementById('zoomMenu').hidden, document.getElementById('zoomBtn').getAttribute('aria-expanded')]);

test('T30.1 por defecto la interfaz va al 100 %: sin `zoom` en <html>, --z = 1, settings.uiZoom = 100 y el menú cerrado', async () => {
  const { page, ctx, errors } = await openApp(browser);
  assert.deepEqual(await estado(page), { z: '1', zoom: '', pct: 100 });
  assert.deepEqual(await menuAbierto(page), [false, 'false']);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('T30.2 la lupa abre y cierra el menú (segundo clic, clic fuera, Esc con el foco de vuelta) y lo anuncia con aria-expanded', async () => {
  const { page, ctx } = await openApp(browser);
  const at = await page.evaluate(() => { const b = document.getElementById('zoomBtn'); return [b.getAttribute('aria-haspopup'), b.getAttribute('aria-controls'), document.getElementById('zoomMenu').getAttribute('role')]; });
  assert.deepEqual(at, ['true', 'zoomMenu', 'group']);
  await page.click('#zoomBtn'); assert.deepEqual(await menuAbierto(page), [true, 'true']);
  await page.click('#zoomBtn'); assert.deepEqual(await menuAbierto(page), [false, 'false']);
  await page.click('#zoomBtn'); await page.mouse.click(700, 500);
  assert.deepEqual(await menuAbierto(page), [false, 'false'], 'un clic fuera no lo cierra');
  await page.click('#zoomBtn'); await page.keyboard.press('Escape');
  assert.deepEqual(await menuAbierto(page), [false, 'false'], 'Esc no lo cierra');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'zoomBtn', 'el foco no vuelve a la lupa');
  await ctx.close();
});

test('T30.3 «+» y «−» recorren la escala 50-67-75-80-90-100-110-125-150-175-200 y se desactivan en los extremos; «100 %» restablece; --z y zoom de <html> siguen el valor', async () => {
  const { page, ctx } = await openApp(browser);
  await page.click('#zoomBtn');
  const sube = [];
  for (let i = 0; i < 5; i++) {
    await page.click('#zoomIn'); await page.waitForTimeout(120);
    const e = await estado(page); sube.push(e.pct);
    assert.equal(e.z, String(e.pct / 100), `--z con ${e.pct} %`); assert.equal(e.zoom, String(e.pct / 100), `zoom con ${e.pct} %`);
  }
  assert.deepEqual(sube, [110, 125, 150, 175, 200]);
  assert.equal(await page.isDisabled('#zoomIn'), true, '«+» sigue activo en 200 %');
  assert.equal(await page.isDisabled('#zoomOut'), false);
  await page.click('#zoomReset'); await page.waitForTimeout(120);
  assert.deepEqual(await estado(page), { z: '1', zoom: '', pct: 100 });
  const baja = [];
  for (let i = 0; i < 5; i++) { await page.click('#zoomOut'); await page.waitForTimeout(120); baja.push((await estado(page)).pct); }
  assert.deepEqual(baja, [90, 80, 75, 67, 50]);
  assert.equal(await page.isDisabled('#zoomOut'), true, '«−» sigue activo en 50 %');
  assert.equal(await page.isDisabled('#zoomIn'), false);
  // an API value outside the scale snaps to the nearest level
  await poner(page, 133); await page.click('#zoomIn'); await page.waitForTimeout(120); assert.equal((await estado(page)).pct, 150);
  await poner(page, 133); await page.click('#zoomOut'); await page.waitForTimeout(120); assert.equal((await estado(page)).pct, 125);
  assert.deepEqual(ESCALA.filter((v) => v > 100 && v < 150), [110, 125]);
  await ctx.close();
});

test('T30.4 el zoom se guarda y sobrevive a recargar, a Copia seguridad → Importar y a «Restablecer configuración»', async () => {
  let { page, ctx } = await openApp(browser);
  await poner(page, 125);
  const db = await stored(page);
  assert.equal(db.settings.uiZoom, 125, 'no se guardó en localStorage');
  // "Reload" = reopen the app with the saved data: with file:// headless Chromium loses storage in ~1 of 40 real reloads.
  await ctx.close(); ({ page, ctx } = await openApp(browser, { seed: db })); await page.waitForTimeout(300);
  assert.deepEqual(await estado(page), { z: '1.25', zoom: '1.25', pct: 125 });
  const { json } = (await api(page, 'backup')).data;
  assert.equal(JSON.parse(json).settings.uiZoom, 125, 'la copia de seguridad no lleva el zoom');
  await poner(page, 75);
  assert.equal((await api(page, 'importDatabase', { json, confirm: true })).ok, true);
  await page.waitForTimeout(250);
  assert.equal((await estado(page)).pct, 125, 'Importar no restauró el zoom');
  await page.click('#settingsBtn'); await page.click('#resetSettingsBtn'); await page.click('[data-modal-action="1"]'); await page.waitForTimeout(250);
  assert.equal((await estado(page)).pct, 125, 'Restablecer configuración cambió el zoom');
  await ctx.close();
});

test('T30.5 un zoom guardado no válido se normaliza: nulo, vacío, texto, booleano o lista → 100 %; fuera de rango se acota; decimales se redondean', async () => {
  const { page, ctx } = await openApp(browser);
  const casos = [[null, 100], ['', 100], ['abc', 100], [true, 100], [[150], 100], [{}, 100], [5, 50], [999, 200], [99.6, 100], [124.4, 124], ['125', 125], [' 80 ', 80]];
  for (const [v, esperado] of casos) {
    const got = await page.evaluate((x) => normalizeDb({ settings: { uiZoom: x } }).settings.uiZoom, v);
    assert.equal(got, esperado, `uiZoom ${JSON.stringify(v)} → ${got}, esperado ${esperado}`);
  }
  await ctx.close();
  // real load with a null value: the UI must not shrink to 50 %
  const seeded = await openApp(browser, { seed: makeDb({ settings: { uiZoom: null } }) });
  assert.deepEqual(await estado(seeded.page), { z: '1', zoom: '', pct: 100 });
  await seeded.ctx.close();
});

// In a 390 px window only zooms with a usable width ≥ 320 px (the minimum supported) are tested.
for (const [lang, width, zooms] of [['es', 1280, [50, 75, 125, 150, 200]], ['en', 390, [50, 75, 110]]]) for (const z of zooms) {
  test(`T30.6 al ${z} % la interfaz escala sin desbordes y llena la ventana (${lang}, ${width} px)`, async () => {
    const { page, ctx, errors } = await openApp(browser, { lang, viewport: { width, height: 800 } });
    await poner(page, z);
    const m = await page.evaluate(() => {
      const r = (s) => document.querySelector(s).getBoundingClientRect(), app = r('.app'), root = document.documentElement;
      const movil = getComputedStyle(document.getElementById('sidebarToggle')).display !== 'none';
      return {
        app: [app.width, app.height], win: [innerWidth, innerHeight], pagina: [root.scrollWidth - innerWidth, root.scrollHeight - innerHeight], movil,
        side: r('#sidebar').width, nuevo: r('#newProjectBtn').height,
        cortadas: [...document.querySelectorAll('.tile span')].filter((e) => e.scrollWidth > e.clientWidth + 0.5).map((e) => e.textContent),
      };
    });
    assert.ok(Math.abs(m.app[0] - m.win[0]) <= 1 && Math.abs(m.app[1] - m.win[1]) <= 1, `.app mide ${m.app.map(Math.round)} en una ventana de ${m.win}`);
    assert.ok(m.pagina[0] <= 1 && m.pagina[1] <= 1, `la página desborda ${m.pagina}`);
    if (!m.movil) assert.ok(Math.abs(m.side - 284 * z / 100) <= 1.5, `menú de ${m.side} px, esperado ${284 * z / 100}`);
    assert.ok(Math.abs(m.nuevo - 34 * z / 100) <= 0.6, `«+ Proyecto» mide ${m.nuevo} px, esperado ${34 * z / 100}`);
    assert.deepEqual(m.cortadas, [], 'etiquetas del pie cortadas');
    const d = await page.evaluate(medirDesbordes);
    assert.deepEqual([d.desborde, d.pagina, d.fuera, d.recortados], [0, 0, [], []], 'desbordes en el área de notas');
    assert.deepEqual(errors, []);
    await ctx.close();
  });
}

test('T30.7 los puntos de corte siguen el ancho útil (ventana ÷ zoom): 125 % panel fijo · 150 % panel de IA en cajón · 200 % diseño móvil; al volver a 100 % se restablece', async () => {
  const { page, ctx } = await openApp(browser);   // 1280 px
  const ver = () => page.evaluate(() => ({
    movil: getComputedStyle(document.getElementById('sidebarToggle')).display !== 'none',
    ia: document.getElementById('aiToggle').getAttribute('aria-expanded'),
    cols: getComputedStyle(document.getElementById('mainShell')).gridTemplateColumns.split(' ').length,
    lateral: document.getElementById('sidebar').getBoundingClientRect().right,
  }));
  const quieto = async (z) => { await poner(page, z); return ver(); };
  assert.deepEqual(await ver(), { movil: false, ia: 'true', cols: 2, lateral: 284 });
  const z125 = await quieto(125); assert.deepEqual([z125.movil, z125.ia, z125.cols], [false, 'true', 2], '1024 px útiles: escritorio con panel de IA');
  const z150 = await quieto(150); assert.deepEqual([z150.movil, z150.ia, z150.cols], [false, 'false', 1], '853 px útiles (≤ 900): panel de IA en cajón');
  const z200 = await quieto(200); assert.equal(z200.movil, true, '640 px útiles (≤ 640): botón de menú visible');
  assert.ok(z200.lateral <= 1, `el menú móvil debería estar fuera de pantalla (borde derecho ${z200.lateral})`);
  const z100 = await quieto(100); assert.deepEqual([z100.movil, z100.ia, z100.cols, z100.lateral], [false, 'true', 2, 284]);
  await ctx.close();
});

test('T30.8 el menú de zoom conserva su tamaño real (≈ 146 × 42 px) y queda dentro de la ventana a cualquier zoom (1280 y 390 px)', async () => {
  for (const [width, zooms] of [[1280, [50, 100, 200]], [390, [50, 100]]]) {
    const { page, ctx } = await openApp(browser, { viewport: { width, height: 800 } });
    const tamanos = [];
    for (const z of zooms) {
      await poner(page, z);
      if ((await menuAbierto(page))[0] === false) await page.click('#zoomBtn');
      await page.waitForTimeout(200);
      const m = await page.evaluate(() => { const r = document.getElementById('zoomMenu').getBoundingClientRect(); return { w: r.width, h: r.height, x: r.x, y: r.y, r: r.right, b: r.bottom, win: [innerWidth, innerHeight] }; });
      assert.ok(m.x >= -0.5 && m.y >= -0.5 && m.r <= m.win[0] + 0.5 && m.b <= m.win[1] + 0.5, `${width} px · ${z} %: menú fuera de la ventana ${JSON.stringify(m)}`);
      tamanos.push([m.w, m.h]);
    }
    for (const [w, h] of tamanos) assert.ok(w >= 138 && w <= 154 && h >= 38 && h <= 46, `${width} px: menú de ${w} × ${h}`);
    assert.ok(Math.max(...tamanos.map((s) => s[0])) - Math.min(...tamanos.map((s) => s[0])) <= 1.5, `${width} px: el ancho cambia con el zoom ${JSON.stringify(tamanos)}`);
    await ctx.close();
  }
});

test('T30.9 ayuda, paleta, configuración y aviso quedan dentro de la ventana a 50 % y a 200 %', async () => {
  const { page, ctx } = await openApp(browser);
  const dentro = (sel) => page.evaluate((s) => { const e = document.querySelector(s), r = e.getBoundingClientRect(); return { ok: r.width > 40 && r.height > 12 && r.x >= -0.5 && r.y >= -0.5 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5, r: [r.x, r.y, r.right, r.bottom].map(Math.round), win: [innerWidth, innerHeight] }; }, sel);
  for (const z of [50, 200]) {
    await poner(page, z);
    await page.click('#helpBtn'); await page.waitForTimeout(350);
    let d = await dentro('.modal-box'); assert.ok(d.ok, `${z} %: ayuda ${JSON.stringify(d)}`);
    await page.keyboard.press('Escape'); await page.waitForTimeout(150);
    await page.keyboard.press('Control+k'); await page.waitForTimeout(350);
    d = await dentro('.command-box'); assert.ok(d.ok, `${z} %: paleta ${JSON.stringify(d)}`);
    await page.keyboard.press('Escape'); await page.waitForTimeout(150);
    if (await page.locator('#sidebarToggle').isVisible()) await page.click('#sidebarToggle');
    await page.click('#settingsBtn'); await page.waitForTimeout(400);
    d = await dentro('.settings-panel'); assert.ok(d.ok, `${z} %: configuración ${JSON.stringify(d)}`);
    await page.evaluate(() => closeSettings()); await page.waitForTimeout(150);
    await page.evaluate(() => toast('Aviso de prueba')); await page.waitForTimeout(450);
    d = await dentro('#toast'); assert.ok(d.ok, `${z} %: aviso ${JSON.stringify(d)}`);
    await page.waitForTimeout(2600);
  }
  await ctx.close();
});

test('T30.10 el panel de selección sale dentro de la ventana, sin tapar el texto seleccionado ni la barra de formato, a 50, 125, 150 y 200 %', async () => {
  const seed = makeDb({ projects: [sampleProject({ n: 2, words: 160 })] });
  for (const z of [50, 125, 150, 200]) {
    const { page, ctx } = await openApp(browser, { seed });
    await poner(page, z);
    await page.evaluate(() => { document.querySelector('.workspace-scroll').scrollTo({ top: 0, behavior: 'instant' }); });
    await selectIn(page, 0, 300, 312);   // 12 characters on one line, away from the editor's top edge
    await page.evaluate((zz) => {   // centers the selection in the notes area
      const ws = document.querySelector('.workspace-scroll'), r = getSelection().getRangeAt(0).getBoundingClientRect(), w = ws.getBoundingClientRect();
      ws.scrollTo({ top: ws.scrollTop + (r.top - w.top - w.height / 2) / zz, behavior: 'instant' });
    }, z / 100);
    await page.waitForTimeout(200); await page.keyboard.press('Shift'); await page.waitForSelector('#selectionTools.open'); await page.waitForTimeout(500);   // after its entry animation
    const g = await page.evaluate(() => {
      const q = (r) => ({ x: r.x, y: r.y, r: r.right, b: r.bottom }), sel = q(getSelection().getRangeAt(0).getBoundingClientRect());
      return { win: [innerWidth, innerHeight], sel, panel: q(document.getElementById('selectionTools').getBoundingClientRect()), fmt: q(document.querySelector('.version-card .fmt-bar').getBoundingClientRect()) };
    });
    const corta = (a, b) => a.x < b.r - 0.5 && a.r > b.x + 0.5 && a.y < b.b - 0.5 && a.b > b.y + 0.5;
    assert.ok(g.panel.x >= -0.5 && g.panel.y >= -0.5 && g.panel.r <= g.win[0] + 0.5 && g.panel.b <= g.win[1] + 0.5, `${z} %: panel fuera de la ventana ${JSON.stringify(g)}`);
    assert.ok(!corta(g.panel, g.sel), `${z} %: el panel tapa el texto seleccionado ${JSON.stringify(g)}`);
    assert.ok(!corta(g.panel, g.fmt), `${z} %: el panel tapa la barra de formato ${JSON.stringify(g)}`);
    await ctx.close();
  }
});

test('T30.11 API: setSettings({zoom}) aplica (con redondeo) y state() lo refleja; los valores no válidos se rechazan sin cambiar nada', async () => {
  const { page, ctx } = await openApp(browser);
  let r = await api(page, 'setSettings', { zoom: 125 }); assert.deepEqual([r.ok, r.data.zoom], [true, 125]);
  assert.equal((await api(page, 'state')).data.zoom, 125);
  r = await api(page, 'setSettings', { zoom: '110' }); assert.equal(r.data.zoom, 110);
  r = await api(page, 'setSettings', { zoom: 125.6 }); assert.equal(r.data.zoom, 126);
  for (const malo of [49, 201, 'x', null, '', true, [150], {}]) {
    r = await api(page, 'setSettings', { zoom: malo });
    assert.deepEqual([r.ok, r.error?.code], [false, 'invalid-argument'], `zoom ${JSON.stringify(malo)} debería rechazarse`);
    assert.match(r.error.message, /zoom must be between 50 and 200/);
    assert.equal((await api(page, 'state')).data.zoom, 126, `zoom ${JSON.stringify(malo)} cambió el valor`);
  }
  assert.equal((await estado(page)).z, '1.26');
  await ctx.close();
});

test('T30.12 la lupa y sus botones tienen data-agent y nombre accesible en ES y EN, y se reetiquetan al cambiar de idioma y de zoom', async () => {
  const { page, ctx } = await openApp(browser, { lang: 'es' });
  const leer = () => page.evaluate(() => ['zoomBtn', 'zoomOut', 'zoomReset', 'zoomIn'].map((id) => { const e = document.getElementById(id); return [e.dataset.agent, e.getAttribute('aria-label'), e.title]; }));
  const nb = '\u00a0';
  assert.deepEqual(await leer(), [['zoom', `Zoom de la interfaz: 100${nb}%`, `Zoom de la interfaz: 100${nb}%`], ['zoom-out', 'Reducir zoom', 'Reducir zoom'],
    ['zoom-reset', `Restablecer zoom (ahora 100${nb}%)`, `Restablecer zoom (ahora 100${nb}%)`], ['zoom-in', 'Aumentar zoom', 'Aumentar zoom']]);
  await page.click('#langEn'); await poner(page, 125);
  assert.deepEqual((await leer()).map((x) => x.slice(0, 2)), [['zoom', 'Interface zoom: 125%'], ['zoom-out', 'Zoom out'], ['zoom-reset', 'Reset zoom (now 125%)'], ['zoom-in', 'Zoom in']]);
  assert.equal(await page.textContent('#zoomReset'), '125%');
  await page.click('#langEs'); await page.waitForTimeout(200);
  assert.equal(await page.textContent('#zoomReset'), `125${nb}%`);
  assert.equal(await page.getAttribute('#zoomMenu', 'aria-label'), 'Zoom de la interfaz');
  await ctx.close();
});

test('T30.13 mientras cambia el zoom no hay transiciones (clase .zooming) y la clase se retira enseguida', async () => {
  const { page, ctx } = await openApp(browser);
  const durante = await page.evaluate(() => { BitacoraAPI.setSettings({ zoom: 150 }); return document.documentElement.classList.contains('zooming'); });
  assert.equal(durante, true, 'sin .zooming durante el cambio');
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('zooming')), false, '.zooming no se retira');
  await ctx.close();
});
