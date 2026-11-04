import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openApp, makeDb, sampleProject, contrast } from './helpers.mjs';

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });
/** Elements of the last note whose visible part does not receive the click (covered by the arrow or clipped). */
const coveredInLastNote = (page) => page.evaluate(() => {
  const last = [...document.querySelectorAll('.version-card')].at(-1);
  return [...last.querySelectorAll('.card-foot button, .instruction')].filter((b) => {
    const r = b.getBoundingClientRect(), top = Math.max(r.top, 0), bottom = Math.min(r.bottom, innerHeight);
    if (bottom - top < 4) return false;
    const el = document.elementFromPoint(r.left + r.width / 2, (top + bottom) / 2);
    return el !== b && !b.contains(el);
  }).length;
});
const long = () => makeDb({ projects: [sampleProject({ n: 12, words: 120 })] });

test('T2.1 la barra de .workspace-scroll mide ≥ 14 px', async () => {
  const { page, ctx } = await openApp(browser, { seed: long() });
  const w = await page.$eval('.workspace-scroll', (e) => e.offsetWidth - e.clientWidth);
  assert.ok(w >= 14, `ancho de barra ${w}`);
  await ctx.close();
});

for (const width of [1280, 390]) {
  test(`T3.1/T3.3 flecha «bajar» (ancho ${width})`, async () => {
    const viewport = { width, height: 800 };
    // Without overflow it does not appear.
    let app = await openApp(browser, { viewport: { width, height: 2400 }, seed: makeDb({ projects: [sampleProject({ n: 1, words: 5 })] }) });
    assert.equal(await app.page.locator('#workspaceDown').isVisible(), false);
    await app.ctx.close();

    app = await openApp(browser, { viewport, seed: long() });
    const { page } = app;
    const down = page.locator('#workspaceDown');
    await page.waitForTimeout(150);
    assert.equal(await down.isVisible(), true, 'visible al inicio con contenido debajo');
    await page.evaluate(() => { const e = document.querySelector('.workspace-scroll'); e.style.scrollBehavior = 'auto'; e.scrollTop = (e.scrollHeight - e.clientHeight) / 2; });
    await page.waitForTimeout(150);
    assert.equal(await down.isVisible(), true, 'visible a mitad');
    // Just below the threshold: the arrow stays visible but does not cover the last note's buttons.
    await page.evaluate(() => { const e = document.querySelector('.workspace-scroll'); e.scrollTop = e.scrollHeight - e.clientHeight - 62; });
    await page.waitForTimeout(150);
    assert.equal(await coveredInLastNote(page), 0, 'la flecha tapa botones de la última nota');
    await page.evaluate(() => { const e = document.querySelector('.workspace-scroll'); e.scrollTop = e.scrollHeight; });
    await page.waitForTimeout(150);
    assert.equal(await down.isVisible(), false, 'oculta al llegar al final');
    assert.equal(await coveredInLastNote(page), 0, 'algo tapa o recorta la última nota');
    await app.ctx.close();
  });
}

test('T3.2 un clic en la flecha desplaza hacia abajo', async () => {
  const { page, ctx } = await openApp(browser, { seed: long() });
  const before = await page.$eval('.workspace-scroll', (e) => e.scrollTop);
  await page.click('#workspaceDown');
  await page.waitForFunction((b) => document.querySelector('.workspace-scroll').scrollTop > b + 100, before);
  await ctx.close();
});

test('T4.1 #commandBtn y #aiToggle tienen clases distintas y contraste ≥ 4.5:1', async () => {
  const { page, ctx } = await openApp(browser);
  const info = async () => page.evaluate(() => ['commandBtn', 'aiToggle'].map((id) => {
    const el = document.getElementById(id), s = getComputedStyle(el);
    const stops = (s.backgroundImage.match(/rgba?\([^)]+\)/g) || []).concat(s.backgroundColor);
    return { id, cls: el.className, color: s.color, stops: stops.filter((c) => !/, 0\)$/.test(c)) };
  }));
  const [cmd, ai] = await info();
  assert.notEqual(cmd.cls, ai.cls);
  for (const b of [cmd, ai]) for (const st of b.stops) assert.ok(contrast(b.color, st) >= 4.5, `${b.id}: ${b.color} sobre ${st} = ${contrast(b.color, st).toFixed(2)}`);
  await page.click('#aiToggle'); // closed panel: different style, same requirement
  await page.waitForTimeout(400); // wait for the CSS transition to end
  const [, ai2] = await info();
  for (const st of ai2.stops) assert.ok(contrast(ai2.color, st) >= 4.5, `IA cerrada: ${ai2.color} sobre ${st} = ${contrast(ai2.color, st).toFixed(2)}`);
  await ctx.close();
});

test('T4.2 Ctrl+K abre la paleta de comandos', async () => {
  const { page, ctx } = await openApp(browser);
  await page.keyboard.press('Control+k');
  await page.waitForSelector('#commandPalette.open');
  await ctx.close();
});
