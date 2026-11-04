// Common utilities for the assistant batteries (F63 onward). F62 keeps its own.
import assert from 'node:assert/strict';

/** Sends `texto` to the chat and waits until the last action card of THAT chat (the action may switch project) stops running; returns its `meta`. */
export async function pedir(page, texto) {
  const pid = await page.evaluate(() => getProject().id);
  const n = await page.evaluate((pid) => db.projects.find((p) => p.id === pid).chat.filter((m) => m.kind === 'action').length, pid);
  await page.fill('#aiInput', texto);
  await page.click('#aiSend');
  const h = await page.waitForFunction(([pid, n]) => {
    const a = db.projects.find((p) => p.id === pid).chat.filter((m) => m.kind === 'action');
    return a.length > n && a[a.length - 1].meta.state !== 'run' ? { ...a[a.length - 1].meta } : false;
  }, [pid, n]);
  return h.jsonValue();
}

/** Clicks «Confirmar» (`go`) or «Cancelar» (`no`) on the card awaiting permission and returns its resolved `meta`. */
export async function confirmar(page, boton = 'go') {
  await page.click(`.msg.action .btn[data-act="${boton}"]`);
  const h = await page.waitForFunction(() => { const m = getProject().chat.filter((x) => x.kind === 'action').at(-1).meta; return m.state !== 'ask' && m.state !== 'run' ? { ...m } : false; });
  return h.jsonValue();
}

/** The selected note and where it sits in the notes area (px from its top edge). */
export const notaAbierta = (page) => page.evaluate(() => {
  const c = document.querySelector('.version-card.selected'), sc = document.querySelector('.workspace-scroll');
  if (!c) return null;
  const a = c.getBoundingClientRect(), b = sc.getBoundingClientRect();
  return { id: c.dataset.version, top: Math.round(a.top - b.top), alto: Math.round(b.height), alFinal: sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 2, filtro: document.querySelector('#versionSearch')?.value, proyecto: getProject().name };
});

/** Checks that note `id` is selected and starts in the upper part of the view (a short last note cannot rise further: staying inside is enough). */
export async function alFrente(page, id) {
  const n = await notaAbierta(page);
  assert.ok(n, 'hay una nota seleccionada');
  assert.equal(n.id, id);
  assert.ok(n.top >= -2 && n.top < n.alto && (n.top <= 60 || n.alFinal), `la nota queda arriba de la vista (top ${n.top})`);
  assert.equal(await page.evaluate(() => selectedVersionId), id);
}

/** Scrolls back to the top of the notes list without animation (`.workspace-scroll` is `smooth`: a half-finished animation skews the measurement). */
export const alPrincipio = (page) => page.evaluate(() => { document.querySelector('.workspace-scroll').scrollTo({ top: 0, behavior: 'instant' }); });

/** Text of the assistant's last reply in the active project. */
export const ultimoAsistente = (page) => page.evaluate(() => getProject().chat.filter((m) => m.role === 'assistant').at(-1)?.text || '');
