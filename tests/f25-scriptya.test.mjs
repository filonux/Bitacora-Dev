// F25 · English header, Scriptya metadata and Literata's OFL license. No browser needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readApp } from './helpers.mjs';

/** Replica of Scriptya's `read_metadata` (Filonux-Box branch) for .html scripts: uppercase DOCTYPE, one metadata item per line, stops at the first line that does not fit. */
function scriptyaMeta(src, file = 'bitacora-dev.html') {
  const meta = { MENU: path.basename(file, '.html'), DESCRIPTION: '', CONFIRM: 'false', TERMINAL: 'false', SUDO: 'false', ICON: '', ORDER: '500', ASK: [] };
  const reDoctype = /^\s*<!DOCTYPE\s[^>]*>\s*$/;
  const reMeta = /^\s*<!--\s*([A-Z]+):\s*(.*)\s*-->\s*$/;
  for (let line of src.split('\n')) {
    line = line.replace(/\r$/, '').replace(/^\uFEFF/, '');
    if (/^#!/.test(line) || /^\s*$/.test(line) || reDoctype.test(line)) continue;
    const m = line.match(reMeta);
    if (!m) break;
    const key = m[1], value = m[2].trimEnd();
    if (['CONFIRM', 'TERMINAL', 'SUDO'].includes(key)) meta[key] = value.toLowerCase();
    else if (key === 'ASK') meta.ASK.push(value);
    else if (key === 'ORDER') { const o = value.match(/^(-?)0*(\d+)$/); if (o) meta.ORDER = o[1] + o[2]; }
    else if (key in meta) meta[key] = value;
  }
  return meta;
}
const header = (src) => src.slice(0, src.indexOf('<html'));
const SPANISH = /[ñ¿¡áéíóúü]|\b(el|la|los|las|de|del|que|para|con|una?|se|es|y)\b/i;

test('T25.1 Scriptya lee MENU, DESCRIPTION, CONFIRM, ORDER e ICON de la cabecera', () => {
  const m = scriptyaMeta(readApp());
  assert.equal(m.MENU, 'Dev Log');
  assert.match(m.DESCRIPTION, /^[\x20-\x7e]{20,120}$/, 'descripción en inglés y de una línea');
  assert.equal(m.CONFIRM, 'false');
  assert.equal(m.ORDER, '10');
  assert.equal(m.ICON, '../assets/icons/icon.png');
  assert.equal(m.TERMINAL, 'false');
  assert.equal(m.SUDO, 'false');
});

test('T25.2 ICON es una ruta relativa a script/ que acaba en .png (no se abre ningún archivo fuera del programa)', () => {
  assert.match(scriptyaMeta(readApp()).ICON, /^\.\.\/[\w./-]+\.png$/);
});

test('T25.3 con <!doctype> en minúsculas Scriptya no leería nada (el test reproduce de verdad su parser)', () => {
  const roto = scriptyaMeta(readApp().replace('<!DOCTYPE html>', '<!doctype html>'));
  assert.equal(roto.MENU, 'bitacora-dev');
  assert.equal(roto.DESCRIPTION, '');
  assert.equal(roto.ICON, '');
});

test('T25.4 cabecera, explicación y licencia están en inglés (solo el nombre «Bitácora» lleva tilde)', () => {
  const h = header(readApp()).replaceAll('Bitácora', 'Bitacora');
  assert.ok(h.includes('SPDX-License-Identifier: GPL-3.0-or-later') && h.includes('Copyright (C) 2026 Filonux'));
  assert.doesNotMatch(h, SPANISH);
});

test('T25.5 la licencia OFL de Literata va completa y en inglés junto al @font-face', () => {
  const src = readApp();
  const i = src.indexOf('----- OFL.txt -----'), j = src.indexOf('----- end of OFL.txt -----');
  assert.ok(i > 0 && j > i && src.indexOf('@font-face{font-family:Literata') > j, 'la OFL debe ir antes del @font-face');
  const ofl = src.slice(i, j);
  for (const k of ['Copyright 2017 The Literata Project Authors', 'SIL OPEN FONT LICENSE Version 1.1', 'PREAMBLE', 'DEFINITIONS', 'PERMISSION & CONDITIONS', 'TERMINATION', 'DISCLAIMER']) assert.ok(ofl.includes(k), `falta «${k}»`);
  assert.ok(ofl.length > 4000, 'texto incompleto');
  assert.doesNotMatch(src.slice(src.indexOf('/* Literata'), j), /[ñ¿¡áéíóúü]/);
});

