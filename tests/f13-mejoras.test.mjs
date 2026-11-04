import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openApp, makeDb, sampleProject, selectIn, noteModel } from './helpers.mjs';

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });

const largo = () => makeDb({ projects: [sampleProject({ n: 8, words: 140 })] });

test('T13.1 Guardar, Copia seguridad, Exportar e Importar son verdes (120–150°, sin azul) y con la misma forma (el tono único lo fija T24.3)', async () => {
  const { page, ctx } = await openApp(browser);
  const info = await page.evaluate(() => ['saveBtn', 'backupBtn', 'exportBtn', 'importBtn'].map((id) => {
    const s = getComputedStyle(document.getElementById(id));
    const hue = (c) => {
      const [r, g, b] = c.match(/[\d.]+/g).slice(0, 3).map(Number).map((v) => v / 255);
      const mx = Math.max(r, g, b), d = mx - Math.min(r, g, b);
      if (!d) return -1;
      const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
      return Math.round(((h * 60) + 360) % 360);
    };
    return { id, color: s.color, hueColor: hue(s.color), hueBorder: hue(s.borderTopColor), radius: s.borderRadius };
  }));
  for (const b of info) {
    assert.ok(b.hueColor >= 120 && b.hueColor <= 150, `${b.id}: matiz del texto ${b.hueColor}°`);
    assert.ok(b.hueBorder >= 120 && b.hueBorder <= 152, `${b.id}: matiz del borde ${b.hueBorder}°`);
  }
  assert.equal(new Set(info.map((b) => b.radius)).size, 1, 'las cuatro tarjetas deben tener la misma forma');
  await ctx.close();
});

for (const width of [1280, 390]) {
  test(`T13.2 flecha «subir» de las notas, gemela de «bajar» (ancho ${width})`, async () => {
    const { page, ctx } = await openApp(browser, { viewport: { width, height: 800 }, seed: largo() });
    const up = page.locator('#workspaceUp'), down = page.locator('#workspaceDown');
    const scroll = (fn) => page.evaluate((f) => { const e = document.querySelector('.workspace-scroll'); e.style.scrollBehavior = 'auto'; e.scrollTop = eval(f)(e); }, fn.toString());
    // The arrows follow the scroll through requestAnimationFrame and the notes' ResizeObserver, and enter with a 0.18 s animation (nudge-in-up, from 6 px
    // above): wait for those frames and for every finite animation, not for a fixed time (150 ms read the arrow 1 px high on a loaded machine). Same wait as T41.6.
    const settle = () => page.evaluate(async () => {
      const frames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      await frames();
      const fin = document.getAnimations().filter((a) => a.effect && a.effect.getComputedTiming().iterations !== Infinity);
      await Promise.all(fin.map((a) => a.finished.catch(() => {})));
      await frames();
    });
    await settle();
    assert.equal(await up.isVisible(), false, 'oculta al inicio');
    assert.equal(await down.isVisible(), true, 'bajar visible al inicio');
    await scroll((e) => (e.scrollHeight - e.clientHeight) / 2); await settle();
    assert.equal(await up.isVisible(), true, 'visible a mitad');
    // Twin of the «down» arrow and of the left-panel ones: same base classes and look.
    const look = (id) => page.$eval(id, (e) => { const s = getComputedStyle(e); return { cls: e.className.split(' ').filter((c) => c !== 'nudge-up' && c !== 'nudge-down').join(' '), w: s.width, h: s.height, bg: s.backgroundImage, color: s.color, border: s.borderLeftColor }; });
    assert.deepEqual(await look('#workspaceUp'), await look('#workspaceDown'));
    // It covers neither the top bar nor anything outside the notes area.
    const box = await page.evaluate(() => { const u = document.querySelector('#workspaceUp').getBoundingClientRect(), t = document.querySelector('.topbar').getBoundingClientRect(); return { top: u.top, topbarBottom: t.bottom }; });
    assert.ok(box.top >= box.topbarBottom - 1, `la flecha invade la barra superior (${box.top} < ${box.topbarBottom})`);
    const antes = await page.$eval('.workspace-scroll', (e) => e.scrollTop);
    await up.click();
    await page.waitForFunction((b) => document.querySelector('.workspace-scroll').scrollTop < b - 100, antes);
    await scroll((e) => e.scrollHeight); await settle();
    assert.equal(await up.isVisible(), true, 'visible al final');
    assert.equal(await down.isVisible(), false, 'bajar oculta al final');
    await scroll(() => 0); await settle();
    assert.equal(await up.isVisible(), false, 'oculta al volver arriba');
    await ctx.close();
  });
}

test('T13.2b «subir» tiene aria-label y título en ES y EN, y data-agent notes-up', async () => {
  for (const lang of ['es', 'en']) {
    const { page, ctx } = await openApp(browser, { seed: largo(), lang });
    const r = await page.$eval('#workspaceUp', (e) => ({ aria: e.getAttribute('aria-label'), title: e.title, agent: e.dataset.agent }));
    assert.equal(r.agent, 'notes-up');
    assert.equal(r.aria, lang === 'es' ? 'Subir por las notas' : 'Scroll up the notes');
    assert.equal(r.title, r.aria);
    await ctx.close();
  }
});

for (const [width, lang] of [[1280, 'es'], [390, 'en']]) {
  test(`T13.3 panel de selección: compacto y verde oscuro, botones ≥ 20 px, texto ≥ 10 px, contraste ≥ 4.5:1, dentro de pantalla (${width} px, ${lang})`, async () => {
    const { page, ctx } = await openApp(browser, { viewport: { width, height: 800 }, seed: makeDb({ projects: [sampleProject({ n: 3, words: 60 })] }), lang });
    await selectIn(page, 0, 10, 60, { panel: true });
    const r = await page.evaluate(() => {
      const rgba = (c) => c.match(/[\d.]+/g).map(Number);
      const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
      const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
      const hue = ([r, g, b]) => { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), d = mx - Math.min(r, g, b); if (!d) return -1; const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return Math.round(((h * 60) + 360) % 360); };
      const box = document.getElementById('selectionTools'), pr = box.getBoundingClientRect();
      const panel = getComputedStyle(box).backgroundImage.match(/rgba?\([^)]+\)/g).map(rgba).sort((a, b) => lum(b) - lum(a))[0]; // lightest stop of the panel gradient
      const out = { dentro: pr.left >= 0 && pr.right <= innerWidth && pr.top >= 0, alto: pr.height, ancho: pr.width, btns: [] };
      for (const b of box.querySelectorAll('button:not([hidden])')) { // «Traducir al inglés» is hidden when the UI is in English
        const s = getComputedStyle(b), stops = (s.backgroundImage === 'none' ? s.backgroundColor : s.backgroundImage).match(/rgba?\([^)]+\)/g).map(rgba);
        const mezcla = stops.map(([r, g, b, a = 1]) => [r * a + panel[0] * (1 - a), g * a + panel[1] * (1 - a), b * a + panel[2] * (1 - a)]);
        out.btns.push({ id: b.id || b.dataset.tone, h: b.getBoundingClientRect().height, font: parseFloat(s.fontSize), minRatio: Math.min(...mezcla.map((m) => ratio(rgba(s.color), m))), hueBorder: hue(rgba(s.borderTopColor)), solid: s.backgroundImage !== 'none' && stops.every((x) => x.length === 3 || x[3] === 1) });
      }
      out.labelFont = parseFloat(getComputedStyle(box, ':before').fontSize);
      out.panelHue = hue(rgba(getComputedStyle(box).borderTopColor));
      return out;
    });
    assert.ok(r.dentro, 'el panel se sale de la pantalla');
    // was ≈ 880×62 px (≈ 54 000 px²) on desktop and ≈ 374×190 on mobile: must save > 55 %
    assert.ok(r.ancho * r.alto <= (width <= 640 ? 28000 : 22000), `panel demasiado grande: ${r.ancho}×${r.alto}`);
    assert.equal(r.btns.length, lang === 'es' ? 6 : 5);
    const minH = width <= 640 ? 31 : 22; // 28 / 20 px + 10 %
    for (const b of r.btns) {
      assert.ok(b.h >= minH - 0.5, `${b.id}: alto ${b.h}`);
      assert.ok(b.font >= 11.5, `${b.id}: texto ${b.font}px`);
      assert.ok(b.minRatio >= 4.5, `${b.id}: contraste ${b.minRatio.toFixed(2)}`);
      assert.ok(b.hueBorder >= 120 && b.hueBorder <= 160, `${b.id}: borde ${b.hueBorder}° (no es verde)`);
    }
    assert.ok(r.labelFont >= 10, `rótulo ${r.labelFont}px`);
    if (width > 640) { // ≈ 570×28 px + 10 %; width depends on the installed typeface (≈ 575 with Inter, ≈ 650 with the fallback fonts)
      assert.ok(r.ancho >= 540 && r.ancho <= 680, `ancho ${r.ancho}`);
      assert.ok(r.alto >= 30 && r.alto <= 34, `alto ${r.alto}`);
    }
    assert.ok(r.panelHue >= 120 && r.panelHue <= 160, `panel ${r.panelHue}°`);
    // The main action (translate) is the only solid one; in English it does not exist and none is.
    assert.deepEqual(r.btns.filter((b) => b.solid).map((b) => b.id), lang === 'es' ? ['translateSelBtn'] : []);
    await ctx.close();
  });
}

test('T13.3c el panel de selección no tapa la barra de formato y deja cambiar el tamaño con el texto seleccionado', async () => {
  const { page, ctx } = await openApp(browser, { seed: makeDb({ projects: [sampleProject({ n: 2, words: 60 })] }) });
  await page.waitForTimeout(700); // the freshly opened note finishes its entry animation
  await selectIn(page, 0, 0, 30, { panel: true });
  const solape = await page.evaluate(() => {
    const p = document.getElementById('selectionTools').getBoundingClientRect(), f = document.querySelector('.fmt-bar').getBoundingClientRect();
    return !(p.right <= f.left || p.left >= f.right || p.bottom <= f.top || p.top >= f.bottom);
  });
  assert.equal(solape, false, 'el panel cubre la barra de formato');
  const box = page.locator('.fmt-dd[data-fmt="size"]').first();
  await box.locator('.select-face').click(); // Playwright fails if something covers the control
  assert.ok(await page.evaluate(() => !document.getElementById('selectionTools').classList.contains('open')), 'el panel debe cerrarse al pasar a la barra');
  const item = box.locator('[role=option]').nth(3);
  const val = await item.getAttribute('data-value');
  await item.click();
  const { marks } = await noteModel(page, 0);
  assert.ok(marks?.some((m) => m.from <= 0 && m.to >= 30 && String(m.size) === val), `la marca de tamaño ${val} no se aplicó: ${JSON.stringify(marks)}`);
  await ctx.close();
});

const ICON = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test('T13.4 iconos de proyecto: lista ≥ 29 px (+15 %), cabecera de notas ≥ 68 px, sin desbordes', async () => {
  const p = sampleProject({ n: 2 });
  p.icon = ICON;
  for (const width of [1280, 390]) {
    const { page, ctx } = await openApp(browser, { seed: makeDb({ projects: [p] }), viewport: { width, height: 800 } });
    const m = await page.evaluate(() => ({
      sm: document.querySelector('.project-icon').getBoundingClientRect().width,
      lg: document.querySelector('.project-icon-lg').getBoundingClientRect().width,
      over: document.querySelector('.workspace-scroll').scrollWidth - document.querySelector('.workspace-scroll').clientWidth,
    }));
    assert.ok(m.sm >= 25 * 1.15 - 0.5, `lista: ${m.sm}px`);
    assert.ok(m.lg >= 68 - 0.5, `cabecera: ${m.lg}px`);
    assert.ok(m.over <= 0, `desborde horizontal ${m.over}px a ${width}px`);
    await ctx.close();
  }
});

test('T13.4b un icono subido se guarda a 192 px (WebP) y sigue siendo válido', async () => {
  const { page, ctx } = await openApp(browser);
  const r = await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 400; c.height = 300;
    const g = c.getContext('2d'); g.fillStyle = '#49d883'; g.fillRect(0, 0, 400, 300);
    const blob = await new Promise((ok) => c.toBlob(ok, 'image/png'));
    const url = await readImageAsIcon(new File([blob], 'i.png', { type: 'image/png' }));
    const img = new Image(); img.src = url; await img.decode();
    return { url: url.slice(0, 22), w: img.naturalWidth, h: img.naturalHeight, valido: sanitizeIcon(url) === url, kb: Math.round(url.length / 1024) };
  });
  assert.equal(r.url, 'data:image/webp;base64');
  assert.deepEqual([r.w, r.h], [192, 192]);
  assert.ok(r.valido && r.kb < 100, `tamaño ${r.kb} KB`);
  await ctx.close();
});
