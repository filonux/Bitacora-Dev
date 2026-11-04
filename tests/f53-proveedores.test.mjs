// F53 · AI providers: Mistral and Together AI added, Anthropic updated, and a retry without `temperature` (models that only accept the default).
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openApp } from './helpers.mjs';

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, GET, OPTIONS' };
const TEMP_ERR = { error: { message: "Unsupported value: 'temperature' does not support 0.25 with this model. Only the default (1) value is supported." } };

/** Intercepts `host`: each POST gets the next entry of `replies` ([status, body]) and its body is recorded. */
async function mockHost(page, host, replies) {
  const bodies = [];
  await page.route(`https://${host}/**`, async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    bodies.push(JSON.parse(req.postData() || '{}'));
    const [status, body] = replies[Math.min(bodies.length - 1, replies.length - 1)];
    return route.fulfill({ status, headers: CORS, contentType: 'application/json', body: JSON.stringify(body) });
  });
  return bodies;
}
const call = (page, cfg) => page.evaluate((c) => callOpenAICompatible(c, { mode: 'chat', messages: [{ role: 'user', content: 'hola' }] }).then((r) => ({ ok: true, text: r.text }), (e) => ({ ok: false, error: e.message })), cfg);
const OK = [200, { choices: [{ message: { content: 'respuesta' } }] }];

test('T53.1 presets: Mistral y Together AI (OpenAI-compatibles, remotos), Anthropic claude-sonnet-5-5 y pista en ES/EN para todos', async () => {
  const { page, errors } = await openApp(browser, { open: false });
  const r = await page.evaluate(() => ({
    p: PROVIDERS,
    notes: Object.keys(PROVIDERS).map((id) => [id, PROVIDER_NOTES.es[id], PROVIDER_NOTES.en[id]]),
  }));
  assert.deepEqual({ ...r.p.mistral }, { name: 'Mistral AI', kind: 'openai', baseUrl: 'https://api.mistral.ai/v1', model: 'mistral-large-latest', key: '', local: false });
  assert.deepEqual({ ...r.p.together }, { name: 'Together AI', kind: 'openai', baseUrl: 'https://api.together.ai/v1', model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', key: '', local: false });
  assert.equal(r.p.anthropic.model, 'claude-sonnet-5-5');
  assert.equal(Object.keys(r.p).length, 11);
  for (const [id, es, en] of r.notes) assert.ok(es && en, `${id}: falta la pista en ES o EN`);
  assert.deepEqual(errors, []);
});

test('T53.2 los hosts de Mistral y Together fuerzan https (como el resto de proveedores remotos); los locales no se tocan', async () => {
  const { page } = await openApp(browser, { open: false });
  const r = await page.evaluate(() => [
    normalizeProviderBaseUrl({ baseUrl: 'http://api.mistral.ai/v1/', local: false }),
    normalizeProviderBaseUrl({ baseUrl: 'http://api.together.xyz/v1', local: false }),
    normalizeProviderBaseUrl({ baseUrl: 'http://api.together.ai/v1', local: false }),
    normalizeProviderBaseUrl({ baseUrl: 'http://localhost:1234/v1', local: true }),
  ]);
  assert.deepEqual(r, ['https://api.mistral.ai/v1', 'https://api.together.xyz/v1', 'https://api.together.ai/v1', 'http://localhost:1234/v1']);
});

test('T53.3 un 400 por `temperature` (GPT-5 y otros) se reintenta una vez sin ella y la respuesta llega', async () => {
  const { page } = await openApp(browser, { open: false });
  const bodies = await mockHost(page, 'api.mistral.ai', [[400, TEMP_ERR], OK]);
  const r = await call(page, { baseUrl: 'https://api.mistral.ai/v1', model: 'mistral-large-latest', key: 'k', local: false });
  assert.deepEqual(r, { ok: true, text: 'respuesta' });
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0].temperature, 0.25);
  assert.equal('temperature' in bodies[1], false, 'el reintento no lleva temperature');
  assert.deepEqual({ ...bodies[1], temperature: 0.25 }, bodies[0], 'el resto de la petición es idéntico');
});

test('T53.4 otros errores no se reintentan: un 400 sin relación con `temperature` y un 401 salen con su mensaje y HTTP', async () => {
  for (const [status, message] of [[400, 'Invalid model'], [401, 'Unauthorized']]) {
    const { page } = await openApp(browser, { open: false });
    const bodies = await mockHost(page, 'api.together.xyz', [[status, { error: { message } }]]);
    const r = await call(page, { baseUrl: 'https://api.together.xyz/v1', model: 'm', key: 'k', local: false });
    assert.deepEqual(r, { ok: false, error: `${message} (HTTP ${status})` });
    assert.equal(bodies.length, 1, `HTTP ${status}: no debe reintentar`);
  }
  // If the retry also fails, the retry's error is reported and there is no third attempt.
  const { page } = await openApp(browser, { open: false });
  const bodies = await mockHost(page, 'api.openai.com', [[400, TEMP_ERR], [429, { error: { message: 'Rate limit' } }]]);
  const r = await call(page, { baseUrl: 'https://api.openai.com/v1', model: 'm', key: 'k', local: false });
  assert.deepEqual(r, { ok: false, error: 'Rate limit (HTTP 429)' });
  assert.equal(bodies.length, 2);
});

test('T53.5 «Detectar modelos»: Together responde con un array y mezcla modelos que no son de chat; Mistral conserva `type: base`; Gemini pide 1000 por página', async () => {
  const { page, errors } = await openApp(browser);
  const urls = [];
  await page.route('https://**/*', async (route) => {
    const req = route.request(), u = req.url();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    urls.push(u);
    const body = u.includes('together') ? [{ id: 'org/chat-a', type: 'chat' }, { id: 'org/embed', type: 'embedding' }, { id: 'org/img', type: 'image' }, { id: 'org/lm', type: 'language' }]
      : u.includes('mistral') ? { data: [{ id: 'mistral-large-latest', type: 'base' }, { id: 'ministral-8b-latest', type: 'base' }] }
        : { models: [{ name: 'models/gemini-x', supportedGenerationMethods: ['generateContent'] }] };
    return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify(body) });
  });
  const r = await page.evaluate(async () => {
    const out = {};
    for (const id of ['together', 'mistral', 'gemini']) { db.settings.providers[id].key = 'k'; await refreshModels(id); out[id] = db.settings.providers[id].availableModels; }
    return out;
  });
  assert.deepEqual(r.together, ['org/chat-a', 'org/lm']);
  assert.deepEqual(r.mistral, ['mistral-large-latest', 'ministral-8b-latest']);
  assert.deepEqual(r.gemini, ['gemini-x']);
  assert.ok(urls.some((u) => u.endsWith('api.together.ai/v1/models')) && urls.some((u) => u.endsWith('/v1beta/models?pageSize=1000')));
  assert.deepEqual(errors, []);
});
