// F49 · Re-analyzing a version must not move the page: the analyzed note keeps its viewport position while loading and after the result.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openApp, makeDb, sampleProject, sleep } from './helpers.mjs';

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });

test('T49.1 re-analyzing three times keeps the analyzed note in place (no jump, no smooth scroll back)', async () => {
  const text = 'RESULT: CHANGES\n' + 'Summary of the change between versions. '.repeat(25);
  const seed = makeDb({ projects: [sampleProject({ n: 4, words: 60 })] });
  const { page, errors } = await openApp(browser, { seed, ai: async () => { await sleep(500); return text; } });
  const card = page.locator('.version-card').nth(3);
  await card.locator('[data-action="diff"]').click();
  await card.locator('.diff-analysis-body').waitFor();
  await page.evaluate(() => { const s = document.querySelector('.workspace-scroll'); s.scrollTop = s.scrollHeight; });
  await sleep(700);
  const top = () => page.evaluate(() => Math.round(document.querySelectorAll('.version-card')[3].getBoundingClientRect().top - document.querySelector('.workspace-scroll').getBoundingClientRect().top));
  const start = await top();
  for (let k = 1; k <= 3; k++) {
    await card.locator('[data-analysis-action="reanalyze"]').click();
    for (let i = 0; i < 14; i++) { assert.ok(Math.abs((await top()) - start) <= 2, `run ${k}, sample ${i}`); await sleep(50); }
    await card.locator('.diff-analysis-body').waitFor();
    await sleep(700);
  }
  assert.deepEqual(errors, []);
});
