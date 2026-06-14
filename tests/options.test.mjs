// Verificaciones del banco de preguntas y de los generadores de examen.
//
// Ejecutar con:  npm test   (o:  node --test )
//
// No requiere dependencias. Carga el banco y EJECUTA los constructores reales
// extraídos de index.html (sin tocar el DOM) para comprobar conteo y reparto.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HTML = readFileSync(join(ROOT, 'index.html'), 'utf8');

// --- Carga estática del array QUESTIONS ---
function loadQuestions() {
  const lines = HTML.split('\n')
    .filter((l) => /^\s*\{ id:\d+, topic:/.test(l))
    .map((l) => l.replace(/,\s*$/, ''));
  // eslint-disable-next-line no-eval
  return eval('[' + lines.join(',') + ']');
}

// --- Carga dinámica de los constructores reales (utils + data + builders) ---
// Se extrae el tramo entre shuffleArray y getCurrentExam, que no usa el DOM.
function loadExamApi() {
  const start = HTML.indexOf('function shuffleArray(arr)');
  const end = HTML.indexOf('function getCurrentExam');
  const block = HTML.slice(start, end);
  const factory = new Function(
    block +
      '\nreturn { buildRandomExamWithSize, buildRealExam, buildThemeExam, QUESTION_BANK, shuffleQuestionOptions };',
  );
  return factory();
}

const QUESTIONS = loadQuestions();
const API = loadExamApi();

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
  const l = lens(q), m = Math.max(...l);
  return l.filter((x) => x === m).length === 1 && l.indexOf(m) === q.correct;
};
const isShortest = (q) => {
  const l = lens(q), m = Math.min(...l);
  return l.filter((x) => x === m).length === 1 && l.indexOf(m) === q.correct;
};

// ----------------------------- ESTRUCTURA ----------------------------------

test('el banco se carga y tiene un tamaño razonable', () => {
  assert.ok(QUESTIONS.length >= 300, `solo se cargaron ${QUESTIONS.length} preguntas`);
});

test('cada pregunta tiene 4 opciones, índice válido y sin duplicados', () => {
  for (const q of QUESTIONS) {
    assert.equal(q.opts.length, 4, `id ${q.id}: no tiene 4 opciones`);
    assert.ok(Number.isInteger(q.correct) && q.correct >= 0 && q.correct < 4, `id ${q.id}: índice fuera de rango`);
    assert.ok(q.opts.every((o) => typeof o === 'string' && o.trim()), `id ${q.id}: opción vacía`);
    assert.equal(new Set(q.opts.map((o) => o.trim())).size, 4, `id ${q.id}: opciones duplicadas`);
  }
});

// -------------------- POSICIÓN DE LA RESPUESTA CORRECTA ---------------------

test('en los datos fuente la correcta se reparte entre A, B, C y D (sin sesgo de letra)', () => {
  const dist = [0, 0, 0, 0];
  QUESTIONS.forEach((q) => dist[q.correct]++);
  dist.forEach((d, i) => {
    const pct = (100 * d) / QUESTIONS.length;
    assert.ok(pct >= 18 && pct <= 32, `letra ${'ABCD'[i]} en ${pct.toFixed(0)}% (esperado 18-32%)`);
  });
});

test('ninguna letra concentra más del 35% (no hay patrón fijo en B o C)', () => {
  const dist = [0, 0, 0, 0];
  QUESTIONS.forEach((q) => dist[q.correct]++);
  const top = Math.max(...dist) / QUESTIONS.length;
  assert.ok(top <= 0.35, `una letra acumula el ${(top * 100).toFixed(0)}% de las respuestas`);
});

test('tras el barajado en runtime la posición correcta es uniforme', () => {
  const tally = [0, 0, 0, 0];
  let tot = 0;
  for (let k = 0; k < 200; k++) {
    API.buildRandomExamWithSize(40).forEach((q) => { tally[q.correct]++; tot++; });
  }
  tally.forEach((t, i) => {
    const pct = (100 * t) / tot;
    assert.ok(pct >= 18 && pct <= 32, `runtime letra ${'ABCD'[i]} en ${pct.toFixed(0)}%`);
  });
});

// ------------------------------- CONTEO ------------------------------------

test('las tablas de distribución por tema suman exactamente 20, 40 y 60', () => {
  const sum = (t) => Object.values(t).reduce((a, b) => a + b, 0);
  const tables = HTML.match(/\{T1:\d+,T2:\d+,T3:\d+,T4:\d+,T5:\d+,T6:\d+,T7:\d+,T8:\d+,T9:\d+,T10:\d+,T11:\d+,T12:\d+\}/g) || [];
  assert.ok(tables.length >= 4, 'no se encontraron las tablas de conteo por tema');
  for (const lit of tables) {
    // eslint-disable-next-line no-eval
    const total = sum(eval('(' + lit + ')'));
    assert.ok([20, 40, 60].includes(total), `una tabla suma ${total} (debe ser 20, 40 o 60)`);
  }
});

test('los constructores devuelven EXACTAMENTE el número pedido (20/40/60)', () => {
  for (const n of [20, 40, 60]) {
    for (let k = 0; k < 30; k++) {
      assert.equal(API.buildRandomExamWithSize(n).length, n, `random(${n}) devolvió otro número`);
      assert.equal(API.buildRealExam(n).length, n, `real(${n}) devolvió otro número`);
      assert.equal(API.buildThemeExam(n, 'all').length, n, `theme(${n}) devolvió otro número`);
    }
  }
});

test('el examen aleatorio del banco completo no repite preguntas', () => {
  for (const n of [20, 40, 60]) {
    const exam = API.buildRandomExamWithSize(n);
    assert.equal(new Set(exam.map((q) => q.id)).size, n, `random(${n}) tiene preguntas repetidas`);
  }
});

// ------------------------------ LONGITUD -----------------------------------

test('la correcta no es la más larga en más del 42% de las preguntas', () => {
  const pct = Math.round((100 * QUESTIONS.filter(isLongest).length) / QUESTIONS.length);
  assert.ok(pct <= 42, `elegir la más larga acierta el ${pct}%`);
});

test('la correcta tampoco es siempre la más corta (pista inversa)', () => {
  const pct = Math.round((100 * QUESTIONS.filter(isShortest).length) / QUESTIONS.length);
  assert.ok(pct <= 25, `elegir la más corta acierta el ${pct}%`);
});

test('ninguna correcta larga "torrea" sobre los distractores (>1.6x)', () => {
  const bad = QUESTIONS.filter((q) => maxDistractorLen(q) >= 90 && correctLen(q) > maxDistractorLen(q) * 1.6).map((q) => q.id);
  assert.deepEqual(bad, [], `correcta dominante en: ${bad.join(', ')}`);
});

test('ningún distractor acumula 2+ muletillas genéricas', () => {
  const bad = [];
  for (const q of QUESTIONS) q.opts.forEach((o, i) => {
    if (i !== q.correct && FILLERS.filter((f) => o.includes(f)).length >= 2) bad.push(q.id);
  });
  assert.deepEqual(bad, [], `relleno apilado en: ${bad.join(', ')}`);
});

// ------------------------------ BARAJADO -----------------------------------

test('las opciones se barajan en runtime en todos los modos', () => {
  assert.match(HTML, /function shuffleQuestionOptions\(/, 'falta la función de barajado');
  const calls = (HTML.match(/shuffleQuestionOptions\(/g) || []).length;
  assert.ok(calls >= 5, `shuffleQuestionOptions se usa solo ${calls} veces`);
});
