// Shared utilities for the E2E tests (Playwright + node:test, headless Chromium, file://).
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

export const APP_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../script/bitacora-dev.html');
export const APP_URL = pathToFileURL(APP_PATH).href;
// No \r: a CRLF checkout (autocrlf on Windows) changes no result, so the repository needs no .gitattributes.
export const readApp = () => fs.readFileSync(APP_PATH, 'utf8').replace(/\r\n?/g, '\n');
export const APP_KEY = 'bitacora-dev-v2';
// Playwright hides scrollbars in headless mode; they are kept so they can be measured.
export const launch = () => chromium.launch({ ignoreDefaultArgs: ['--hide-scrollbars'] });

/** Sample project with `n` versions (1.0, 1.1, …). `words` sets each note's length. */
export function sampleProject({ id = 'p1', name = 'Proyecto de prueba', n = 3, words = 12 } = {}) {
  const versions = Array.from({ length: n }, (_, i) => ({
    id: `${id}-v${i + 1}`,
    version: `1.${i}`,
    instructions: Array.from({ length: words }, (_, k) => `nota${i + 1}palabra${k + 1}`).join(' '),
    revertsVersionId: '',
    createdAt: new Date(2026, 0, 1 + i).toISOString(),
    updatedAt: new Date(2026, 0, 1 + i).toISOString(),
  }));
  // Fixed dates: without them the app assigns now() to each project on load and the list order (by updatedAt) depends on the millisecond.
  const stamp = new Date(2026, 1, 1).toISOString();
  return { id, name, description: 'Descripción de prueba', createdAt: stamp, updatedAt: stamp, versions };
}

export function makeDb({ projects = [sampleProject()], settings = {} } = {}) {
  return { schema: 2, projects, settings: { uiLang: 'es', ...settings } };
}

/**
 * Opens the app in a fresh context (clean storage).
 * opts: seed (db | null), lang, viewport, blockStorage, reducedMotion, ai (fn(messages)=>string), open (selects the 1st project).
 * Returns { page, ctx, errors, aiRequests, clip() }.
 */
export async function openApp(browser, opts = {}) {
  const {
    seed = makeDb(), lang, viewport = { width: 1280, height: 800 },
    blockStorage = false, reducedMotion = 'no-preference', ai = null, open = true,
  } = opts;
  const ctx = await browser.newContext({ viewport, reducedMotion, acceptDownloads: true });
  const errors = [];
  const aiRequests = [];
  if (ai) {
    const handler = async (route) => {
      const req = route.request();
      const cors = {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': '*',
        'access-control-allow-methods': 'POST, GET, OPTIONS',
      };
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      if (req.method() === 'GET') return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: '{"data":[]}' });
      const body = JSON.parse(req.postData() || '{}');
      aiRequests.push(body);
      const text = await ai(body.messages || [], body);
      return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: text } }] }) });
    };
    await ctx.route('http://localhost:11434/**', handler);
  }
  let data = seed;
  // Pre-F68 batteries test the «full» request: the default model (llama3.2) would trigger the compact profile in Automatic.
  if (data && ai) data = { ...data, settings: { ...data.settings, activeProvider: 'ollama', modelProfile: data.settings?.modelProfile || 'full' } };
  if (lang && data) data = { ...data, settings: { ...data.settings, uiLang: lang } };
  await ctx.addInitScript(({ key, data, block }) => {
    if (block) {
      Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('denied', 'SecurityError'); } });
    } else if (data && !sessionStorage.getItem('__seeded')) {
      // Seeded once per tab: a reload never overwrites what the app saved.
      sessionStorage.setItem('__seeded', '1');
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(data));
    }
    window.__clip = null;
    try {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t) => { window.__clip = String(t); }, readText: async () => window.__clip || '' } });
    } catch {}
  }, { key: APP_KEY, data, block: blockStorage });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
  await page.goto(APP_URL);
  if (open && data?.projects?.length) {
    if (await page.locator('#sidebarToggle').isVisible()) await page.click('#sidebarToggle'); // mobile: menu folded
    await page.locator('.project-item').first().click();
    if (await page.locator('#sidebarToggle').isVisible() && await page.locator('#sidebar.open').count()) await page.click('#sidebarToggle');
  }
  return { page, ctx, errors, aiRequests, clip: () => page.evaluate(() => window.__clip) };
}

/** Reads the JSON saved in localStorage. */
export const stored = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), APP_KEY);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** WCAG contrast between two "rgb(r, g, b)" colors. */
export function contrast(a, b) {
  const lum = (c) => {
    const [r, g, bl] = c.match(/[\d.]+/g).slice(0, 3).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}
/** For `page.evaluate`: horizontal overflows of the notes area (scroll, page, elements outside the container, clipped buttons). */
export const medirDesbordes = () => {
  const ws = document.querySelector('.workspace-scroll');
  const c = document.querySelector('#workspaceContent');
  const cr = c.getBoundingClientRect();
  const nombre = (el) => el.tagName.toLowerCase() + (el.id ? `#${el.id}` : '') + (typeof el.className === 'string' && el.className.trim() ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}` : '');
  const fuera = new Set();
  const recortados = new Set();
  for (const el of c.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) continue;
    if (r.right > cr.right + 1) fuera.add(`${nombre(el)} +${Math.round(r.right - cr.right)}px`);
    if (el.tagName === 'BUTTON' && el.scrollWidth > el.clientWidth + 1) recortados.add(nombre(el));
  }
  return { desborde: ws.scrollWidth - ws.clientWidth, pagina: document.documentElement.scrollWidth - innerWidth, fuera: [...fuera].slice(0, 4), recortados: [...recortados].slice(0, 4) };
};

/* ---- Note editor (F19): contenteditable div + `version.marks` ---- */
/** Plain text and marks of the model of note `idx` in the active project. */
export const noteModel = (page, idx = 0) => page.evaluate((i) => { const v = getProject().versions[i]; return { text: v.instructions, marks: v.marks }; }, idx);
/** Text shown by the editor (must match the model). */
export const noteDom = (page, idx = 0) => page.evaluate((i) => edRead(document.querySelectorAll('.instruction')[i]).text, idx);
/** Focuses note `idx`, selects [a,b) (a caret if b is missing) and waits for the app to register the selection. With `panel` it opens the selection panel. */
export async function selectIn(page, idx, a, b = a, { panel = false } = {}) {
  await page.evaluate(({ i, a, b }) => { const e = document.querySelectorAll('.instruction')[i]; e.focus(); edSetSel(e, a, b); }, { i: idx, a, b });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  if (panel) { await page.keyboard.press('Shift'); await page.waitForSelector('#selectionTools.open'); }
}
/** Picks an option in a custom dropdown (F21): `box` is the `.select-custom` locator; `value` is the option's `data-value` or index. */
export async function pick(box, value) {
  await box.locator('.select-face').click();
  const item = typeof value === 'number' ? box.locator('[role=option]').nth(value) : box.locator(`[role=option][data-value="${value}"]`);
  await item.click();
}
/** Replaces all the text of note `idx` by typing (keeps the focus in the editor). */
export async function typeNote(page, idx, text) {
  const ed = page.locator('.instruction').nth(idx);
  await ed.click(); await page.keyboard.press('Control+a'); await page.keyboard.press('Delete');
  await page.keyboard.insertText(text);
}
/** Computed style of each formatted run (`span.m`) of note `idx`. */
export const spanStyles = (page, idx = 0) => page.evaluate((i) => [...document.querySelectorAll('.instruction')[i].querySelectorAll('.m')].map((e) => { const s = getComputedStyle(e); return { text: e.textContent, family: s.fontFamily, size: s.fontSize, weight: s.fontWeight, style: s.fontStyle, deco: s.textDecorationLine }; }), idx);
