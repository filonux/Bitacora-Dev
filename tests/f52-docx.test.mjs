// F52 · Own DOCX writer: valid ZIP, clean XML, styles, runs and line blocks (one paragraph per block, not per line).
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { launch, openApp, makeDb, sampleProject } from './helpers.mjs';

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });
const abrir = (settings = {}) => openApp(browser, { seed: makeDb({ projects: [sampleProject({ id: 'p1', name: 'Pulsar', n: 1 })], settings }) });

/** ZIP → { name: text }; checks each entry's CRC-32 (stored or deflate-raw). */
function leerZip(buf) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06])), n = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16); const out = {};
  for (let i = 0; i < n; i++) {
    const m = buf.readUInt16LE(p + 10), crc = buf.readUInt32LE(p + 16), cs = buf.readUInt32LE(p + 20), nl = buf.readUInt16LE(p + 28), el = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), lo = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nl), ds = lo + 30 + buf.readUInt16LE(lo + 26) + buf.readUInt16LE(lo + 28), raw = buf.subarray(ds, ds + cs);
    const data = m === 8 ? zlib.inflateRawSync(raw) : raw;
    assert.equal(zlib.crc32(data), crc, `CRC de ${name}`);
    out[name] = data.toString('utf8'); p += 46 + nl + el + cl;
  }
  return out;
}
/** Exports the notes `notas` ({text, marks?}) of the first project as DOCX and returns its parts. */
async function docx(page, notas) {
  const b64 = await page.evaluate(async (ns) => {
    const p = db.projects[0]; p.versions = ns.map((n, i) => ({ id: 'v' + i, version: '1.' + i, instructions: n.text, marks: n.marks || [] }));
    const bytes = new Uint8Array(await (await zipBlob(docxParts([{ p, list: p.versions, desc: false }], 'T'), DOCX_MIME)).arrayBuffer());
    let s = ''; for (let i = 0; i < bytes.length; i += 32768) s += String.fromCharCode(...bytes.subarray(i, i + 32768));
    return btoa(s);
  }, notas);
  return leerZip(Buffer.from(b64, 'base64'));
}
const textoDe = (xml) => [...xml.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br\/>|<\/w:p>|<w:p\/>/g)].map((m) => (m[1] !== undefined ? m[1] : m[0] === '<w:tab/>' ? '\t' : '\n')).join('').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

test('T52.1 ZIP con CRC válido, las 9 partes y XML bien formado', async () => {
  const { page, errors } = await abrir();
  const z = await docx(page, [{ text: 'uno\ndos' }]);
  assert.deepEqual(Object.keys(z).sort(), ['[Content_Types].xml', '_rels/.rels', 'docProps/app.xml', 'docProps/core.xml', 'word/_rels/document.xml.rels', 'word/document.xml', 'word/footer1.xml', 'word/settings.xml', 'word/styles.xml'].sort());
  const malos = await page.evaluate((xs) => xs.filter((x) => new DOMParser().parseFromString(x, 'application/xml').querySelector('parsererror')).length, Object.values(z));
  assert.equal(malos, 0);
  assert.deepEqual(errors, []);
});

test('T52.2 un carácter de control o una mitad de par sustituto no estropea el archivo (LibreOffice lo rechazaría entero)', async () => {
  const { page, errors } = await abrir();
  const z = await docx(page, [{ text: 'a\u0000b\u0007c\u001bd \ud800 e 🚀' }]);
  assert.ok(!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(z['word/document.xml']));
  assert.ok(z['word/document.xml'].includes('abcd \ufffd e 🚀'));
  const malos = await page.evaluate((x) => !!new DOMParser().parseFromString(x, 'application/xml').querySelector('parsererror'), z['word/document.xml']);
  assert.equal(malos, false);
  assert.deepEqual(errors, []);
});

test('T52.3 estilos Normal, heading 1/2 y Footer; lengua según la interfaz; proyecto = Heading1 y versión = Heading2', async () => {
  for (const [ui, lang] of [['es', 'es-ES'], ['en', 'en-US']]) {
    const { page, errors } = await abrir({ uiLang: ui });
    const z = await docx(page, [{ text: 'hola' }]);
    for (const id of ['Normal', 'Heading1', 'Heading2', 'Footer']) assert.ok(z['word/styles.xml'].includes(`w:styleId="${id}"`), id);
    assert.ok(z['word/styles.xml'].includes(`<w:lang w:val="${lang}"`));
    assert.ok(z['word/document.xml'].includes('w:val="Heading1"') && z['word/document.xml'].includes('w:val="Heading2"'));
    assert.deepEqual(errors, []);
  }
});

test('T52.4 tramo sin formato = solo <w:t>; con formato solo lo distinto; tramos contiguos iguales se fusionan', async () => {
  const { page, errors } = await abrir();
  const z = await docx(page, [{ text: 'abcdef', marks: [{ from: 0, to: 2, b: true }, { from: 2, to: 4, b: true }] }]);
  const d = z['word/document.xml'];
  assert.ok(d.includes('<w:r><w:rPr><w:b/><w:bCs/></w:rPr><w:t xml:space="preserve">abcd</w:t></w:r><w:r><w:t xml:space="preserve">ef</w:t></w:r>'));
  assert.equal((d.match(/<w:b\/>/g) || []).length, 1);
  assert.deepEqual(errors, []);
});

test('T52.5 las marcas de una nota con CRLF se mueven con el texto', async () => {
  const { page, errors } = await abrir();
  const z = await docx(page, [{ text: 'uno\r\ndos', marks: [{ from: 5, to: 8, b: true }] }]);
  assert.ok(z['word/document.xml'].includes('<w:b/><w:bCs/></w:rPr><w:t xml:space="preserve">dos</w:t>'));
  assert.deepEqual(errors, []);
});

test('T52.6 bloques: las líneas seguidas comparten párrafo con <w:br/> dentro del último tramo (con su estilo), las vacías son párrafos vacíos y un bloque no pasa de 40 líneas', async () => {
  const { page, errors } = await abrir();
  const xs = Array.from({ length: 45 }, (_, i) => 'x' + i);
  const z = await docx(page, [{ text: ['a', 'b', '', 'c', 'd', ...xs].join('\n'), marks: [{ from: 0, to: 1, b: true }] }]);
  const cuerpo = z['word/document.xml'].split('Versión 1.0')[1];
  assert.equal((cuerpo.match(/<w:p>/g) || []).length, 3, '[a,b] · [c,d,x0…x37] (40 líneas) · [x38…x44]');
  assert.equal((cuerpo.match(/<w:p\/>/g) || []).length, 1);
  assert.equal((cuerpo.match(/<w:br\/>/g) || []).length, 1 + 39 + 6);
  assert.ok(cuerpo.includes('<w:rPr><w:b/><w:bCs/></w:rPr><w:t xml:space="preserve">a</w:t><w:br/></w:r>'), 'el salto toma el estilo de la línea que cierra');
  assert.deepEqual(errors, []);
});

test('T52.7 una nota de 6 000 líneas con formato: pocos párrafos y el mismo texto, línea a línea', async () => {
  const { page, errors } = await abrir();
  const lineas = Array.from({ length: 6000 }, (_, i) => (i % 9 === 0 ? '' : `${i % 11 === 0 ? '\t' : ''}línea ${i} <&> ñ 🚀`));
  let off = 0; const marks = []; lineas.forEach((l, i) => { if (i % 5 === 0 && l) marks.push({ from: off, to: off + 4, font: 'mono' }); off += l.length + 1; });
  const text = lineas.join('\n'), z = await docx(page, [{ text, marks }]);
  const cuerpo = z['word/document.xml'].split('Versión 1.0')[1].split('<w:sectPr>')[0].split('</w:p>').slice(1).join('</w:p>');
  assert.ok((cuerpo.match(/<w:p>/g) || []).length < 800, 'un párrafo por bloque (≈ 667 separados por líneas vacías); antes, uno por línea (6 000)');
  assert.equal(textoDe(cuerpo), text + '\n');
  assert.deepEqual(errors, []);
});

test('T52.8 120 notas de 50 líneas y una línea de 300 000 caracteres: se genera en < 5 s, sin tablas y sin perder la línea larga', async () => {
  const { page, errors } = await abrir();
  const notas = Array.from({ length: 120 }, (_, i) => ({ text: Array.from({ length: 50 }, (_, l) => `v${i} línea ${l} texto de prueba`).join('\n') + (i === 7 ? '\n' + 'x'.repeat(300000) : ''), marks: [{ from: 0, to: 3, b: true }] }));
  const t0 = Date.now(), z = await docx(page, notas);
  assert.ok(Date.now() - t0 < 5000);
  assert.ok(z['word/document.xml'].includes('x'.repeat(300000)) && !z['word/document.xml'].includes('<w:tbl>'));
  assert.deepEqual(errors, []);
});

test('T52.9 downloadBlob: el enlace está en el documento al pulsar, se retira después (también si el clic falla) y la URL vive 60 s', async () => {
  const { page, errors } = await abrir();
  const r = await page.evaluate(() => {
    const out = { created: [], revoked: [], delays: [], clicks: [] };
    const crear = URL.createObjectURL, revocar = URL.revokeObjectURL, timer = window.setTimeout, click = HTMLAnchorElement.prototype.click;
    URL.createObjectURL = (b) => { const u = crear.call(URL, b); out.created.push(u); return u; };
    URL.revokeObjectURL = (u) => { out.revoked.push(u); };
    window.setTimeout = (f, ms, ...a) => { if (ms >= 1000) { out.delays.push({ ms, f }); return 0; } return timer(f, ms, ...a); };
    let fallar = false;
    HTMLAnchorElement.prototype.click = function () { out.clicks.push({ dentro: document.body.contains(this), href: this.href.slice(0, 5), name: this.download, oculto: this.hidden }); if (fallar) throw new Error('clic fallido'); };
    try {
      downloadBlob('hola', 'text/plain', 'a.txt');
      out.trasOk = document.querySelectorAll('a[download]').length;
      fallar = true;
      try { downloadBlob('x', 'text/plain', 'b.txt'); out.lanzo = false; } catch (e) { out.lanzo = e.message; }
      out.trasFallo = document.querySelectorAll('a[download]').length;
      out.viva = out.revoked.length;
      out.ms = out.delays.map((d) => d.ms);
      out.delays.forEach((d) => d.f());
      out.revocadas = out.revoked.length;
    } finally { URL.createObjectURL = crear; URL.revokeObjectURL = revocar; window.setTimeout = timer; HTMLAnchorElement.prototype.click = click; }
    return { ...out, delays: undefined, f: undefined };
  });
  assert.deepEqual(r.clicks.map((c) => [c.dentro, c.href, c.name, c.oculto]), [[true, 'blob:', 'a.txt', true], [true, 'blob:', 'b.txt', true]]);
  assert.equal(r.trasOk, 0); assert.equal(r.trasFallo, 0);
  assert.equal(r.lanzo, 'clic fallido');
  assert.equal(r.viva, 0, 'la URL no se revoca al terminar');
  assert.ok(r.ms.length === 2 && r.ms.every((m) => m >= 60000), `espera ${r.ms}`);
  assert.deepEqual(r.revoked, r.created);
  assert.deepEqual(errors, []);
});
