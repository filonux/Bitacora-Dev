import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openApp } from './helpers.mjs';

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser.close(); });

test('T9.1 #brandMark sin borde ni fondo y ≥ 72 px', async () => {
  const { page, ctx } = await openApp(browser, { open: false });
  const m = await page.$eval('#brandMark', (el) => {
    const s = getComputedStyle(el), r = el.getBoundingClientRect(), svg = el.querySelector('svg').getBoundingClientRect();
    return { borders: [s.borderTopWidth, s.borderRightWidth, s.borderBottomWidth, s.borderLeftWidth], bg: s.backgroundColor, bgImg: s.backgroundImage, shadow: s.boxShadow, w: r.width, h: r.height, svgW: svg.width, framed: el.querySelectorAll('svg rect[stroke]').length };
  });
  assert.deepEqual(m.borders, ['0px', '0px', '0px', '0px']);
  assert.equal(m.bg, 'rgba(0, 0, 0, 0)');
  assert.equal(m.bgImg, 'none');
  assert.equal(m.shadow, 'none');
  assert.ok(m.w >= 72 && m.h >= 72 && m.svgW >= 72, `${m.w}x${m.h}, svg ${m.svgW}`);
  assert.equal(m.framed, 0, 'el SVG no debe llevar marco con trazo');
  // the icon does not overflow the menu header
  assert.equal(await page.evaluate(() => { const b = document.querySelector('.brand').getBoundingClientRect(), n = document.getElementById('brandName').getBoundingClientRect(); return n.bottom <= b.bottom; }), true);
  await ctx.close();
});

test('T9.2 el favicon SVG es válido, de mismo viewBox que el icono del menú, y los PNG derivan de él', async () => {
  const { page, ctx } = await openApp(browser, { open: false });
  const r = await page.evaluate(async () => {
    // Canonical structure (tag + attributes, no xmlns): innerHTML differs between the HTML and XML parsers.
    const canon = (el) => `<${el.localName}${[...el.attributes].filter((x) => x.name !== 'xmlns').map((x) => ` ${x.name}="${x.value}"`).sort().join('')}>${[...el.children].map(canon).join('')}</${el.localName}>`;
    const norm = (svg) => [...svg.children].map(canon).join('');
    const href = document.querySelector('link[rel="icon"][type="image/svg+xml"]').getAttribute('href');
    const fav = new DOMParser().parseFromString(decodeURIComponent(href.split(',').slice(1).join(',')), 'image/svg+xml');
    const menu = document.querySelector('#brandMark svg');
    const px = (url) => new Promise((res, rej) => { const i = new Image(); i.onload = () => { const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; const g = c.getContext('2d'); g.drawImage(i, 0, 0); const d = g.getImageData(0, 0, i.width, i.height).data; let on = 0; for (let k = 3; k < d.length; k += 4) if (d[k] > 200) on++; res({ w: i.width, h: i.height, opaque: on / (i.width * i.height) }); }; i.onerror = rej; i.src = url; });
    return {
      parseError: !!fav.querySelector('parsererror'),
      same: norm(fav.documentElement) === norm(menu) && norm(menu).length > 1500,
      viewBox: [fav.documentElement.getAttribute('viewBox'), menu.getAttribute('viewBox')],
      png: await px(document.querySelector('link[rel="icon"][type="image/png"]').href),
      apple: await px(document.querySelector('link[rel="apple-touch-icon"]').href),
      appleSizes: document.querySelector('link[rel="apple-touch-icon"]').getAttribute('sizes'),
    };
  });
  assert.equal(r.parseError, false);
  assert.equal(r.viewBox[0], r.viewBox[1]);
  assert.deepEqual([r.png.w, r.png.h], [32, 32]);
  assert.ok(r.png.opaque > 0.85, `PNG 32 vacío o macizo: ${r.png.opaque}`);
  assert.deepEqual([r.apple.w, r.apple.h], [180, 180]);
  assert.ok(r.apple.opaque > 0.99, 'apple-touch-icon debe ser opaco');
  assert.equal(r.appleSizes, '180x180');
  await ctx.close();
});
