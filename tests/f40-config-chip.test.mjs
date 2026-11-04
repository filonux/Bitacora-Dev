import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openApp, makeDb, pick, stored, sleep } from './helpers.mjs';

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });

const MODELOS = ['llama3.2', 'qwen3:8b', 'mistral-small', 'gemma3:4b'];
const conIA = (extra = {}) => makeDb({ settings: { activeProvider: 'ollama', providers: { ollama: { availableModels: MODELOS }, ...extra } } });
const chip = (page) => page.evaluate(() => {
  const c = document.getElementById('aiChip'), cs = getComputedStyle(c), led = getComputedStyle(c.querySelector('.chip-led'));
  return { cls: c.className, txt: c.innerText.replace(/\s+/g, ' ').trim(), aria: c.getAttribute('aria-label'), borde: cs.borderTopStyle, h: c.getBoundingClientRect().height, led: led.backgroundColor, ledBorde: led.borderTopWidth };
});
const menuOculto = (page) => page.evaluate(() => document.getElementById('aiChipMenu').hidden);

/* ---------- F40 · Settings ---------- */

test('T40.1 «Proveedor activo» va primero, con etiqueta ≥ 17 px, selector ≥ 50 px con LED; sin lista de proveedores ni «Configurar»', async () => {
  const { page, ctx, errors } = await openApp(browser);
  await page.click('#settingsBtn');
  const d = await page.evaluate(() => {
    const hero = document.querySelector('#providers .provider-hero');
    return {
      primero: document.querySelector('#providers').firstElementChild === hero,
      fuente: parseFloat(getComputedStyle(hero.querySelector('.provider-hero-label')).fontSize),
      alto: hero.querySelector('.select-face').getBoundingClientRect().height,
      led: getComputedStyle(hero.querySelector('.dd-val'), '::before').width,
      tarjetas: document.querySelectorAll('[data-provider-card]').length,
      botones: [...document.querySelectorAll('#providers button')].map((b) => b.textContent.trim()),
    };
  });
  assert.ok(d.primero, 'el selector no es lo primero');
  assert.ok(d.fuente >= 17, `etiqueta ${d.fuente}px`);
  assert.ok(d.alto >= 50, `selector ${d.alto}px`);
  assert.equal(d.led, '10px');
  assert.equal(d.tarjetas, 0, 'sin proveedor no hay tarjeta');
  assert.deepEqual(d.botones.filter((b) => /configur/i.test(b)), []);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('T40.2 al elegir un proveedor su configuración aparece justo debajo; «Sin IA» solo deja una línea de aviso', async () => {
  const { page, ctx } = await openApp(browser);
  await page.click('#settingsBtn');
  assert.equal(await page.locator('#providers .provider-off').count(), 1);
  await pick(page.locator('#activeProviderSelect'), 'openai');
  const d = await page.evaluate(() => {
    const hero = document.querySelector('#providers .provider-hero'), card = hero.nextElementSibling;
    return {
      justoDebajo: card?.matches('[data-provider-card="openai"]'), on: hero.classList.contains('on'),
      campos: [...card.querySelectorAll('[data-pfield]')].map((i) => i.dataset.pfield),
      detectar: !!card.querySelector('[data-refresh="openai"]'), avisos: document.querySelectorAll('.provider-off').length,
      led: getComputedStyle(hero.querySelector('.dd-val'), '::before').backgroundColor, activo: db.settings.activeProvider,
    };
  });
  assert.ok(d.justoDebajo && d.on && d.detectar);
  assert.deepEqual(d.campos, ['baseUrl', 'model', 'key']);
  assert.equal(d.avisos, 0);
  assert.equal(d.led, 'rgb(85, 220, 137)');
  assert.equal(d.activo, 'openai');
  await pick(page.locator('#activeProviderSelect'), 'none');
  assert.equal(await page.locator('[data-provider-card]').count(), 0);
  assert.equal(await page.locator('#providers .provider-off').count(), 1);
  assert.equal((await stored(page)).settings.activeProvider, 'none');
  await ctx.close();
});

/* ---------- F41 · Model chip ---------- */

test('T41.1 estados: sin IA (discontinuo, LED hueco), listo (verde), nube sin clave (ámbar), con clave (verde); ES/EN', async () => {
  let { page, ctx } = await openApp(browser);
  let c = await chip(page);
  assert.ok(c.cls.includes('off') && c.borde === 'dashed' && c.led === 'rgba(0, 0, 0, 0)' && c.ledBorde !== '0px', JSON.stringify(c));
  assert.match(c.txt, /Sin IA/);
  await ctx.close();
  ({ page, ctx } = await openApp(browser, { seed: conIA(), lang: 'en' }));
  await page.evaluate(() => document.getElementById('aiClose').click());
  await page.waitForFunction(() => document.getElementById('aiChipWrap').dataset.fit === 'full'); // the panel folds with a transition
  c = await chip(page);
  assert.ok(c.cls.includes('on'), c.cls);
  assert.equal(c.txt, 'Ollama ▸ llama3.2 ▾');
  assert.equal(c.led, 'rgb(85, 220, 137)');
  assert.match(c.aria, /^AI on: Ollama ▸ llama3\.2/);
  await page.click('#langEs');
  assert.match((await chip(page)).aria, /^IA activa: Ollama ▸ llama3\.2/);
  await page.evaluate(() => { db.settings.activeProvider = 'openai'; renderAI(); });
  c = await chip(page);
  assert.ok(c.cls.includes('warn') && c.led === 'rgb(240, 184, 74)', JSON.stringify(c));
  assert.match(c.aria, /falta la clave API/);
  await page.evaluate(() => { db.settings.providers.openai.key = 'sk-test'; renderAI(); });
  assert.ok((await chip(page)).cls.includes('on'));
  await ctx.close();
});

test('T41.2 queda a la izquierda del botón IA, misma fila y 38 px; apagado, al pulsarlo abre Configuración', async () => {
  const { page, ctx } = await openApp(browser);
  const g = await page.evaluate(() => { const a = document.getElementById('aiChip').getBoundingClientRect(), b = document.getElementById('aiToggle').getBoundingClientRect(); return { gap: b.left - a.right, dy: Math.abs((a.top + a.height / 2) - (b.top + b.height / 2)), h: a.height }; });
  assert.ok(g.gap >= 0 && g.gap <= 16 && g.dy <= 1 && g.h === 38, JSON.stringify(g));
  await page.click('#aiChip');
  await page.waitForSelector('#settingsDrawer.open');
  assert.ok(await menuOculto(page));
  await ctx.close();
});

test('T41.3 menú de terminal: filtro, ratón y teclado (↑↓ Intro Esc), clic fuera; no se cierra al abrirse', async () => {
  const { page, ctx, errors } = await openApp(browser, { seed: conIA() });
  await page.click('#aiChip');
  await page.waitForSelector('#aiChipFilter');
  await sleep(350);
  assert.equal(await menuOculto(page), false, 'el menú se cerró solo');
  const m = await page.evaluate(() => { const r = document.getElementById('aiChipMenu').getBoundingClientRect(); return { head: document.querySelector('.chip-head').innerText, grep: document.querySelector('.chip-filter').innerText, filas: [...document.querySelectorAll('.chip-opt')].map((o) => o.textContent), cur: document.querySelector('.chip-opt.cur').textContent, sel: document.querySelector('.chip-opt[aria-selected=true]').textContent, foco: document.activeElement.id, exp: document.getElementById('aiChip').getAttribute('aria-expanded'), dentro: r.left >= 0 && r.right <= innerWidth }; });
  assert.match(m.head, /^\$\s*models --provider ollama$/);
  assert.match(m.grep, /\$ grep/);
  assert.deepEqual(m.filas, MODELOS);
  assert.ok(m.cur === 'llama3.2' && m.sel === 'llama3.2' && m.foco === 'aiChipFilter' && m.exp === 'true' && m.dentro, JSON.stringify(m));
  await page.keyboard.type('qw');
  assert.deepEqual(await page.locator('.chip-opt').allInnerTexts(), ['qwen3:8b']);
  await page.keyboard.press('Escape');
  assert.ok(await menuOculto(page));
  assert.equal(await page.evaluate(() => document.activeElement.id), 'aiChip');
  await page.click('#aiChip');
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowUp');
  assert.equal(await page.locator('.chip-opt.hl').innerText(), 'qwen3:8b');
  await page.keyboard.press('Enter');
  assert.ok(await menuOculto(page));
  assert.equal(await page.evaluate(() => getActiveProvider().model), 'qwen3:8b');
  assert.match((await chip(page)).aria, /Ollama ▸ qwen3:8b/);
  await page.click('#aiChip');
  await page.locator('.chip-opt', { hasText: 'gemma3:4b' }).click();
  assert.equal(await page.evaluate(() => getActiveProvider().model), 'gemma3:4b');
  assert.equal((await stored(page)).settings.providers.ollama.model, 'gemma3:4b');
  await page.click('#aiChip');
  await page.mouse.click(300, 500);
  assert.ok(await menuOculto(page), 'clic fuera no cierra');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('T41.4 «Detectar modelos» actualiza la lista sin cerrar el menú; «Configuración» abre los ajustes; el chip sigue lo que se edita allí', async () => {
  const { page, ctx } = await openApp(browser, { seed: conIA(), ai: async () => 'ok' });
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, GET, OPTIONS' };
  await ctx.route('http://localhost:11434/**', (r) => {
    const q = r.request();
    if (q.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
    if (q.method() === 'GET') return r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ data: [{ id: 'llama3.2' }, { id: 'phi4:14b' }] }) });
    return r.fallback();
  });
  await page.click('#aiChip');
  await page.locator('[data-chip=detect]').click();
  await page.waitForFunction(() => [...document.querySelectorAll('.chip-opt')].length === 2);
  assert.equal(await menuOculto(page), false);
  assert.deepEqual(await page.locator('.chip-opt').allInnerTexts(), ['llama3.2', 'phi4:14b']);
  await page.locator('[data-chip=settings]').click();
  await page.waitForSelector('#settingsDrawer.open');
  assert.ok(await menuOculto(page));
  await page.fill('[data-pfield=model]', 'modelo-manual');
  assert.match((await chip(page)).aria, /Ollama ▸ modelo-manual/);
  await ctx.close();
});

test('T41.5 procesando: LED y cursor de bloque parpadean; con prefers-reduced-motion queda el cursor fijo; vuelve a reposo', async () => {
  for (const reducedMotion of ['no-preference', 'reduce']) {
    const { page, ctx } = await openApp(browser, { seed: conIA(), reducedMotion });
    const anim = () => page.evaluate(() => document.getAnimations().filter((a) => a.effect.getComputedTiming().iterations === Infinity && a.effect.target.closest('#aiChip')).length);
    assert.equal(await anim(), 0, 'en reposo no anima');
    await page.evaluate(() => setAiBusy(true));
    const c = await chip(page);
    assert.ok(c.cls.includes('busy'));
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.chip-cursor')).display), 'block');
    assert.equal(await anim(), reducedMotion === 'reduce' ? 0 : 2);
    await page.evaluate(() => setAiBusy(false));
    assert.ok(!(await chip(page)).cls.includes('busy'));
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.chip-cursor')).display), 'none');
    await ctx.close();
  }
});

test('T41.6 el chip cede espacio y no añade desborde en la barra (7 anchos, panel abierto y cerrado)', async () => {
  for (const width of [1280, 1100, 1000, 901, 640, 390, 360]) {
    for (const panel of [true, false]) {
      const { page, ctx } = await openApp(browser, { seed: conIA(), viewport: { width, height: 800 } });
      if (!panel) await page.evaluate(() => closeAiPanel());
      // Wait for the panel transition (every finite animation) and then for the ResizeObserver delivery (data-fit). Two equal width reads do not
      // prove that the transition ended: on a loaded machine its first frame can come late and the width keeps the old value until then.
      await page.evaluate(async () => {
        const fin = document.getAnimations().filter((a) => a.effect && a.effect.getComputedTiming().iterations !== Infinity);
        await Promise.all(fin.map((a) => a.finished.catch(() => {})));
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      });
      const d = await page.evaluate(() => {
        const bar = document.querySelector('.topbar'), w = document.getElementById('aiChipWrap'), c = document.getElementById('aiChip');
        const con = bar.scrollWidth - bar.clientWidth, ancho = bar.clientWidth, fit = w.dataset.fit, txt = c.innerText, cw = c.getBoundingClientRect().width, vis = getComputedStyle(w).display !== 'none';
        w.style.display = 'none'; const sin = bar.scrollWidth - bar.clientWidth; w.style.display = '';
        return { con, sin, ancho, fit, txt, cw, vis };
      });
      const esperado = d.ancho <= 520 && width > 900 ? 'off' : d.ancho <= 560 ? 'dot' : d.ancho <= 820 ? 'short' : 'full';
      const id = `${width}px panel ${panel ? 'abierto' : 'cerrado'}`;
      assert.equal(d.fit, esperado, `${id} (barra de ${d.ancho}px)`);
      assert.ok(d.con <= d.sin, `${id}: el chip añade ${d.con - d.sin}px de desborde`);
      if (d.fit === 'off') assert.equal(d.vis, false, id);
      if (d.fit === 'dot') assert.ok(d.cw <= 40 && !/llama|Ollama/.test(d.txt), `${id}: ${d.cw}px «${d.txt}»`);
      if (d.fit === 'short') assert.ok(/llama3\.2/.test(d.txt) && !/Ollama/.test(d.txt), `${id}: «${d.txt}»`);
      if (d.fit === 'full') assert.match(d.txt, /Ollama\s*▸\s*llama3\.2/, id);
      await ctx.close();
    }
  }
});

test('T41.7 `setAIProvider` (38.ª operación): elige proveedor y modelo, lo refleja el chip, valida y apaga con «none»', async () => {
  const { page, ctx } = await openApp(browser);
  const r = await page.evaluate(() => {
    const A = BitacoraAPI, ops = A.describe().operations;
    return {
      n: ops.length, op: ops.find((o) => o.name === 'setAIProvider'),
      mal: [A.setAIProvider({ provider: 'nope' }), A.setAIProvider({ provider: 'constructor' }), A.setAIProvider({}), A.setAIProvider({ provider: 'none', model: 'x' }), A.setAIProvider({ provider: 'openai', model: '  ' })].map((x) => x.error?.code),
      ok: A.setAIProvider({ provider: 'ollama', model: 'qwen3:8b' }), chip: document.getElementById('aiChip').getAttribute('aria-label'),
      sin: A.setAIProvider({ provider: 'openai' }), apaga: A.setAIProvider({ provider: 'none' }), off: document.getElementById('aiChip').classList.contains('off'),
    };
  });
  assert.ok(r.n >= 38 && r.op && r.op.args === 'provider, model?' && !r.op.async);
  assert.deepEqual(r.mal, Array(5).fill('invalid-argument'));
  assert.deepEqual(r.ok, { ok: true, data: { provider: 'ollama', model: 'qwen3:8b', ai: true } });
  assert.match(r.chip, /Ollama ▸ qwen3:8b/);
  assert.equal(r.sin.data.model, 'gpt-5.6-luna');
  assert.deepEqual(r.apaga.data, { provider: 'none', model: null, ai: false });
  assert.ok(r.off);
  assert.equal((await stored(page)).settings.activeProvider, 'none');
  await ctx.close();
});

test('T41.8 textos del chip y de la ayuda en ES y EN; los controles del menú tienen data-agent y aria-label únicos', async () => {
  const { page, ctx } = await openApp(browser, { seed: conIA() });
  const k = await page.evaluate(() => { const claves = ['chipTitleOn', 'chipTitleOff', 'chipKeyMissing', 'chipBusy', 'chipAria', 'chipFilter', 'chipNoModels']; return { faltan: claves.filter((c) => !I18N.es[c] || !I18N.en[c]), es: I18N.es.helpItems, en: I18N.en.helpItems }; });
  assert.deepEqual(k.faltan, []);
  assert.match(k.es, /indicador junto al botón IA/);
  assert.match(k.en, /indicator next to the AI button/);
  await page.click('#aiChip');
  await page.waitForSelector('#aiChipFilter');
  const c = await page.evaluate(() => [...document.querySelectorAll('#aiChipWrap button, #aiChipWrap input')].map((e) => ({ a: e.dataset.agent, l: e.getAttribute('aria-label') })));
  assert.equal(c.length, 4);
  assert.ok(c.every((x) => x.a && x.l));
  assert.equal(new Set(c.map((x) => x.a)).size, 4);
  assert.equal(new Set(c.map((x) => x.l)).size, 4);
  await ctx.close();
});

test('T41.9 Esc cierra el menú también con el foco en el chip (tras Mayús+Tab); Tab fuera del chip lo cierra', async () => {
  const { page, ctx, errors } = await openApp(browser, { seed: conIA() });
  await page.click('#aiChip');
  await page.waitForSelector('#aiChipFilter');
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'aiChip');
  assert.equal(await menuOculto(page), false, 'Mayús+Tab dentro del chip no debe cerrar el menú');
  await page.keyboard.press('Escape');
  assert.ok(await menuOculto(page), 'Esc con el foco en el chip no cierra el menú');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'aiChip');
  assert.equal(await page.getAttribute('#aiChip', 'aria-expanded'), 'false');
  await page.keyboard.press('ArrowDown');
  assert.equal(await menuOculto(page), false);
  for (let i = 0; i < 3; i++) await page.keyboard.press('Tab');
  assert.ok(await menuOculto(page), 'Tab fuera del chip deja el menú abierto');
  assert.deepEqual(errors, []);
  await ctx.close();
});
