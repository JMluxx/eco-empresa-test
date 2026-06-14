// Verificaciones del banco de preguntas: que las opciones no delaten la
// respuesta correcta por su longitud y que el examen se mantenga realista.
//
// Ejecutar con:  npm test   (o:  node --test )
//
// No requiere dependencias: lee el array QUESTIONS directamente de index.html.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// --- Carga del banco de preguntas desde index.html (sin ejecutar la app) ---
function loadQuestions() {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const lines = html
    .split('\n')
    .filter((l) => /^\s*\{ id:\d+, topic:/.test(l))
    .map((l) => l.replace(/,\s*$/, ''));
  // Cada línea es un objeto literal JS válido; los unimos en un array.
  // eslint-disable-next-line no-eval
  const arr = eval('[' + lines.join(',') + ']');
  return arr;
}

const QUESTIONS = loadQuestions();

// Frases-muletilla genéricas: si aparecen apiladas delatan al distractor.
const FILLERS = [
  'según las circunstancias concretas del mercado',
  'de acuerdo con lo que establece la teoría',
  'tal y como suele suceder en la mayoría',
  'a lo largo de los distintos ejercicios económicos',
  'con independencia del tamaño y la dimensión',
  'dentro del marco general de la gestión',
];

const lens = (q) => q.opts.map((o) => o.length);
const correctLen = (q) => q.opts[q.correct].length;
const maxDistractorLen = (q) =>
  Math.max(...q.opts.filter((_, i) => i !== q.correct).map((o) => o.length));
const isLongest = (q) => {
  const l = lens(q);
  const m = Math.max(...l);
  return l.filter((x) => x === m).length === 1 && l.indexOf(m) === q.correct;
};
const isShortest = (q) => {
  const l = lens(q);
  const m = Math.min(...l);
  return l.filter((x) => x === m).length === 1 && l.indexOf(m) === q.correct;
};

test('el banco se carga y tiene un tamaño razonable', () => {
  assert.ok(QUESTIONS.length >= 300, `solo se cargaron ${QUESTIONS.length} preguntas`);
});

test('cada pregunta tiene estructura válida (4 opciones, índice correcto, sin duplicados)', () => {
  for (const q of QUESTIONS) {
    assert.equal(q.opts.length, 4, `id ${q.id}: no tiene 4 opciones`);
    assert.ok(
      Number.isInteger(q.correct) && q.correct >= 0 && q.correct < 4,
      `id ${q.id}: índice 'correct' fuera de rango`,
    );
    assert.ok(
      q.opts.every((o) => typeof o === 'string' && o.trim().length > 0),
      `id ${q.id}: opción vacía`,
    );
    const set = new Set(q.opts.map((o) => o.trim()));
    assert.equal(set.size, 4, `id ${q.id}: opciones duplicadas`);
  }
});

test('la respuesta correcta NO es la más larga en más del 42% de las preguntas', () => {
  const hits = QUESTIONS.filter(isLongest).length;
  const pct = Math.round((100 * hits) / QUESTIONS.length);
  assert.ok(pct <= 42, `elegir la opción más larga acierta el ${pct}% (límite 42%)`);
});

test('la respuesta correcta tampoco es siempre la más corta (pista inversa)', () => {
  const hits = QUESTIONS.filter(isShortest).length;
  const pct = Math.round((100 * hits) / QUESTIONS.length);
  assert.ok(pct <= 25, `elegir la opción más corta acierta el ${pct}% (límite 25%)`);
});

test('ninguna respuesta correcta larga "torrea" sobre los distractores (>1.6x)', () => {
  const offenders = QUESTIONS.filter(
    (q) => maxDistractorLen(q) >= 90 && correctLen(q) > maxDistractorLen(q) * 1.6,
  ).map((q) => q.id);
  assert.deepEqual(offenders, [], `correcta visualmente dominante en: ${offenders.join(', ')}`);
});

test('ningún distractor acumula 2+ muletillas genéricas (redacción no homogénea)', () => {
  const offenders = [];
  for (const q of QUESTIONS) {
    q.opts.forEach((o, i) => {
      if (i === q.correct) return;
      const n = FILLERS.filter((f) => o.includes(f)).length;
      if (n >= 2) offenders.push(q.id);
    });
  }
  assert.deepEqual(offenders, [], `distractores con relleno apilado en: ${offenders.join(', ')}`);
});

test('las opciones se barajan en tiempo de ejecución en todos los modos', () => {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  assert.match(html, /function shuffleQuestionOptions\(/, 'falta la función de barajado');
  const calls = (html.match(/shuffleQuestionOptions\(/g) || []).length;
  // 1 definición + al menos 4 usos en los distintos constructores de examen.
  assert.ok(calls >= 5, `shuffleQuestionOptions se usa solo ${calls} veces; ¿algún modo no baraja?`);
});
