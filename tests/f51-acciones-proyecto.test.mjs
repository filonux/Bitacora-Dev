// F51 · Project actions (Edit · Export · Delete next to the project name): neutral mono family, +2pt, red only on Delete hover.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openApp, makeDb, sampleProject, contrast } from './helpers.mjs';

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });

const IDS = ['#editProjectBtn', '#projectExportBtn', '#deleteProjectBtn'];
const seed = () => makeDb({ projects: [{ ...sampleProject(), description: 'Descripción de prueba' }] });
const read = (page) => page.evaluate((ids) => ids.map((id) => {
  const el = document.querySelector(id), s = getComputedStyle(el), g = getComputedStyle(el, '::before'), r = el.getBoundingClientRect();
  return { id, text: el.textContent, w: r.width, h: r.height, right: r.right, size: parseFloat(s.fontSize), family: s.fontFamily, weight: s.fontWeight,
    color: s.color, border: s.borderTopColor, bg: s.backgroundImage + s.backgroundColor, glyph: g.content, glyphColor: g.color };
}), IDS);
const rgb = (c) => c.match(/[\d.]+/g).slice(0, 3).map(Number);

test('T51.1 size: 14px + 2pt font, 34px + 2pt box, mono 600, labels intact, no overflow (ES/EN, 1280/390/320)', async () => {
  const labels = { es: ['Editar', 'Exportar', 'Eliminar'], en: ['Edit', 'Export', 'Delete'] };
  for (const lang of ['es', 'en']) for (const width of [1280, 390, 320]) {
    const { page, errors } = await openApp(browser, { seed: seed(), lang, viewport: { width, height: 800 } });
    const b = await read(page);
    assert.deepEqual(b.map((x) => x.text), labels[lang]);
    for (const x of b) {
      assert.ok(Math.abs(x.size - (14 + 2 * 4 / 3)) < 0.05, `${lang} ${width} ${x.id}: ${x.size}px`);
      assert.ok(Math.abs(x.h - (34 + 2 * 4 / 3)) < 0.5, `${x.id} height ${x.h}`);
      assert.match(x.family, /monospace/);
      assert.equal(x.weight, '600');
      assert.ok(x.right <= width + 0.5, `${lang} ${width} ${x.id} cut off at ${x.right}`);
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${lang} ${width} horizontal scroll`);
    assert.deepEqual(errors, []);
  }
});

test('T51.2 at rest: the three look the same (neutral, dark fill), keep a green glyph and readable text', async () => {
  const { page } = await openApp(browser, { seed: seed() });
  const b = await read(page);
  for (const x of b) {
    assert.equal(x.color, b[0].color); assert.equal(x.border, b[0].border); assert.equal(x.bg, b[0].bg);
    assert.ok(x.glyph && x.glyph !== 'none' && x.glyph !== 'normal', `${x.id} has no glyph`);
    const [r, g, bl] = rgb(x.glyphColor);
    assert.ok(g > r + 40 && g > bl + 20, `${x.id} glyph is not green: ${x.glyphColor}`);
    assert.ok(contrast(x.color, 'rgb(9, 18, 13)') >= 7, `${x.id} contrast`);
  }
  const [r, g] = rgb(b[0].border);
  assert.ok(g > r && g < 90, `neutral border expected, got ${b[0].border}`); // not the bright green of the primary buttons
  const primary = await page.evaluate(() => getComputedStyle(document.querySelector('#addVersionTopBtn')).backgroundImage);
  assert.notEqual(b[0].bg, primary);
});

test('T51.3 hover: Edit and Export turn green, Delete turns red; reduced motion keeps everything still', async () => {
  const { page } = await openApp(browser, { seed: seed() });
  const tone = async (id) => { await page.hover(id); await page.waitForTimeout(260); const s = await page.$eval(id, (e) => [getComputedStyle(e).color, getComputedStyle(e).borderTopColor]); return s.map(rgb); };
  for (const id of ['#editProjectBtn', '#projectExportBtn']) {
    const [c, bd] = await tone(id);
    assert.ok(c[1] > c[0] + 40 && bd[1] > bd[0], `${id} hover not green: ${c} / ${bd}`);
  }
  const [c, bd] = await tone('#deleteProjectBtn');
  assert.ok(c[0] > c[1] + 40 && c[0] > c[2] + 40, `Delete hover text not red: ${c}`);
  assert.ok(bd[0] > bd[1] + 30, `Delete hover border not red: ${bd}`);
  const calm = await openApp(browser, { seed: seed(), reducedMotion: 'reduce' });
  await calm.page.hover('#editProjectBtn');
  assert.equal(await calm.page.$eval('#editProjectBtn', (e) => getComputedStyle(e).transform), 'none');
});

test('T51.4 behaviour intact: Edit opens the project form, Export the format menu, Delete asks first', async () => {
  const { page, errors } = await openApp(browser, { seed: seed() });
  const dialog = async (id, name) => { await page.click(id); await page.waitForSelector('#modalLayer.open .modal-box'); const n = await page.$eval('.modal-box', (e) => e.getAttribute('aria-label')); assert.match(n, name); await page.keyboard.press('Escape'); await page.waitForSelector('#modalLayer:not(.open)', { state: 'attached' }); };
  await dialog('#editProjectBtn', /Editar|Edit/);
  await dialog('#projectExportBtn', /Exportar proyecto|Export project/);
  await dialog('#deleteProjectBtn', /Eliminar|Delete/);
  assert.equal(await page.evaluate(() => db.projects.length), 1);
  assert.deepEqual(errors, []);
});
