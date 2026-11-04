// F59 · Project form (New / Edit): terminal-window look, type ×1.2 over the generic modal, behaviour unchanged.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openApp, makeDb, sampleProject, contrast } from './helpers.mjs';

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });

const seed = () => makeDb({ projects: [sampleProject({ id: 'p1', name: 'Pulsar Observability', n: 2 })] });
const mono = (f) => /mono|consolas|courier/i.test(f);
const measure = (page) => page.evaluate(() => {
  const box = document.querySelector('.modal-box'), cs = (e) => getComputedStyle(e), px = (e) => parseFloat(cs(e).fontSize);
  const h = box.querySelector('h3'), l = box.querySelector('.field label'), i = box.querySelector('#modalPName'), a = box.querySelector('#modalPDesc'), r = box.getBoundingClientRect();
  return {
    cls: box.className, title: h.textContent, hs: px(h), hf: cs(h).fontFamily, hc: cs(h).color, ls: px(l), lf: cs(l).fontFamily, is: px(i), inf: cs(i).fontFamily, as: px(a),
    labels: [...box.querySelectorAll('.field label')].map((e) => e.textContent), bg: cs(box).backgroundColor,
    fits: r.left >= 0 && r.right <= innerWidth && box.scrollWidth <= box.clientWidth,
  };
});

test('T59.1 title 18 px, labels 13.2 px and fields 16.8 px in mono, readable, with the right texts in ES and EN', async () => {
  const want = { es: ['Editar', ['Nombre del proyecto:', 'Descripción del proyecto:', 'Icono del proyecto']], en: ['Edit', ['Project name:', 'Project description:', 'Project icon']] };
  for (const lang of ['es', 'en']) {
    const { page, errors } = await openApp(browser, { seed: seed(), lang });
    await page.click('#editProjectBtn');
    const m = await measure(page);
    assert.ok(m.cls.includes('modal-form'), `${lang} class`);
    assert.equal(m.title, want[lang][0]);
    assert.deepEqual(m.labels, want[lang][1]);
    assert.ok(Math.abs(m.hs - 18) < 0.05 && Math.abs(m.ls - 13.2) < 0.05 && Math.abs(m.is - 16.8) < 0.05 && Math.abs(m.as - 16.8) < 0.05, `${lang} sizes ${m.hs}/${m.ls}/${m.is}/${m.as}`);
    assert.ok(mono(m.hf) && mono(m.lf) && mono(m.inf), `${lang} mono`);
    assert.ok(contrast(m.hc, m.bg) >= 7, `${lang} title contrast`);
    assert.deepEqual(errors, []);
    await page.context().close();
  }
});

test('T59.2 Enter saves name and description, Esc and Cancel keep them', async () => {
  const { page, errors } = await openApp(browser, { seed: seed(), lang: 'es' });
  const title = () => page.textContent('.project-title');
  await page.click('#editProjectBtn');
  await page.fill('#modalPName', 'Descartado');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.modal-layer.open').count(), 0);
  assert.equal(await title(), 'Pulsar Observability');
  await page.click('#editProjectBtn');
  await page.fill('#modalPName', 'Pulsar Core');
  await page.fill('#modalPDesc', 'Telemetría y alertas');
  await page.press('#modalPName', 'Enter');
  await page.waitForFunction(() => !document.querySelector('.modal-layer.open'));
  assert.equal(await title(), 'Pulsar Core');
  assert.ok((await page.textContent('.project-header')).includes('Telemetría y alertas'));
  assert.deepEqual(errors, []);
  await page.context().close();
});

test('T59.3 at 320 px both the Edit and New dialogs fit without sideways scroll', async () => {
  const { page, errors } = await openApp(browser, { seed: seed(), lang: 'en', viewport: { width: 320, height: 640 } });
  for (const btn of ['#editProjectBtn', '#newProjectBtn']) {
    await page.evaluate(() => document.querySelector('#sidebarToggle')?.offsetParent && document.body.classList.contains('sidebar-open') && document.querySelector('#sidebarToggle').click());
    await page.locator(btn).first().dispatchEvent('click');
    const m = await measure(page);
    assert.ok(m.cls.includes('modal-form') && m.fits, `${btn} fits (${m.cls})`);
    await page.keyboard.press('Escape');
  }
  assert.deepEqual(errors, []);
  await page.context().close();
});

test('T59.4 closing the dialog in the same tick it opens raises no error (stale onOpen)', async () => {
  const { page, errors } = await openApp(browser, { seed: seed(), lang: 'es' });
  await page.evaluate(() => { document.querySelector('#editProjectBtn').click(); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
  await page.waitForTimeout(80);
  assert.equal(await page.locator('.modal-layer.open').count(), 0);
  assert.deepEqual(errors, []);
  await page.context().close();
});

test('T59.5 Enter answers in the same tick the dialog opens, before onOpen runs (an agent or a loaded machine can act first)', async () => {
  const { page, errors } = await openApp(browser, { seed: seed(), lang: 'es' });
  await page.evaluate(() => {
    document.querySelector('#editProjectBtn').click();
    const name = document.querySelector('#modalPName');
    name.value = 'Pulsar Rápido';
    name.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  });
  assert.equal(await page.locator('.modal-layer.open').count(), 0, 'Enter submitted at once');
  assert.equal(await page.textContent('.project-title'), 'Pulsar Rápido');
  assert.deepEqual(errors, []);
  await page.context().close();
});

test('T59.6 onOpen does not take the focus back from a field the user already reached (Edit and New)', async () => {
  const { page, errors } = await openApp(browser, { seed: seed(), lang: 'es' });
  for (const btn of ['#editProjectBtn', '#newProjectBtn']) {
    // The description is focused before onOpen's timer fires, as an agent or a loaded machine can do; typing must go there.
    const active = await page.evaluate(async (b) => {
      document.querySelector(b).click();
      document.querySelector('#modalPDesc').focus();
      await new Promise((r) => setTimeout(r, 60));
      const id = document.activeElement.id;
      closeModal();
      return id;
    }, btn);
    assert.equal(active, 'modalPDesc', `${btn} keeps the description focused`);
  }
  // Nothing reached yet: onOpen still puts the cursor in the name, with its text selected.
  await page.click('#editProjectBtn');
  await page.waitForFunction(() => document.activeElement?.id === 'modalPName');
  assert.ok(await page.evaluate(() => { const e = document.activeElement; return e.selectionStart === 0 && e.selectionEnd === e.value.length; }), 'name selected');
  assert.deepEqual(errors, []);
  await page.context().close();
});
