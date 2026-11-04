// F58 · Change-analysis header: title +1.5 pt and a calmer green, version pair +2 pt and more legible; nothing clipped when narrow.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openApp, makeDb, sampleProject, contrast } from './helpers.mjs';

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });

const seed = () => makeDb({ projects: [sampleProject({ id: 'p1', name: 'Pulsar Observability', n: 2 })] });
const rgb = (hex) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(',')})`;
/** Inserts the analysis block's real markup after the first note and measures its header. */
async function head(page) {
  return page.evaluate(() => {
    const el = document.createElement('div');
    el.className = 'version-diff diff-analysis';
    el.innerHTML = `<div class="diff-analysis-head"><strong>${t('diffAnalysisTitle')}</strong><span>1.2.0 → 1.3.0</span></div>`;
    document.querySelector('.instruction').insertAdjacentElement('afterend', el);
    const h = el.firstChild, s = h.querySelector('strong'), p = h.querySelector('span');
    const cs = getComputedStyle(s), cp = getComputedStyle(p), r = (e) => e.getBoundingClientRect();
    return {
      title: { size: parseFloat(cs.fontSize), color: cs.color },
      pair: { size: parseFloat(cp.fontSize), color: cp.color, family: cp.fontFamily, nums: cp.fontVariantNumeric, ws: cp.whiteSpace, h: r(p).height },
      panel: getComputedStyle(document.documentElement).getPropertyValue('--panel-2').trim(),
      sameRow: Math.abs(r(s).top - r(p).top) < 8, clipped: r(p).right > r(h).right + 0.5 || h.scrollWidth > h.clientWidth,
    };
  });
}

test('T58.1 title 12 px in a calmer green and pair 12.7 px (+2 pt) in mono, lining/tabular/slashed-zero and more legible, in ES and EN', async () => {
  for (const lang of ['es', 'en']) {
    const { page, errors } = await openApp(browser, { seed: seed(), lang });
    const m = await head(page), bg = rgb(m.panel);
    assert.ok(Math.abs(m.title.size - 12) < 0.05, `${lang} title ${m.title.size}`);
    assert.ok(Math.abs(m.pair.size - 12.67) < 0.05, `${lang} pair ${m.pair.size}`);
    const [r, g, b] = m.title.color.match(/\d+/g).map(Number);
    assert.notEqual(m.title.color, 'rgb(143, 240, 173)', `${lang} the old neon mint is gone`);
    assert.ok(g - Math.min(r, b) < 90 && g < 215, `${lang} calmer green ${m.title.color}`);
    assert.ok(contrast(m.title.color, bg) >= 4.5 && contrast(m.pair.color, bg) >= 7, `${lang} contrast`);
    assert.ok(/mono|consolas|courier/i.test(m.pair.family) && /slashed-zero/.test(m.pair.nums) && m.pair.ws === 'nowrap', `${lang} pair typography`);
    assert.ok(m.sameRow && !m.clipped, `${lang} one row, nothing clipped`);
    assert.deepEqual(errors, []);
    await page.context().close();
  }
});

test('T58.2 at 320 px the pair stays on one line, fully visible, and drops under the title if it does not fit', async () => {
  for (const lang of ['es', 'en']) {
    const { page, errors } = await openApp(browser, { seed: seed(), lang, viewport: { width: 320, height: 700 } });
    const m = await head(page);
    assert.ok(!m.clipped, `${lang} clipped`);
    assert.ok(m.pair.h < m.pair.size * 1.9, `${lang} the pair wrapped inside itself (${m.pair.h})`);
    assert.deepEqual(errors, []);
    await page.context().close();
  }
});
