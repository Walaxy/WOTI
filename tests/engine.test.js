import test from 'node:test';
import assert from 'node:assert/strict';
import {
  rawToBucket,
  stripPattern,
  manhattanDistanceBuckets,
  similarityFromDistance,
  rankPatterns,
  rankForOutcomePick,
  resolveOutcome,
  COMP_TO_JOKE_CHANCE,
  aggregateRawScores,
  sumsToBuckets,
} from '../js/engine.js';

test('rawToBucket matches SBTI-style bands', () => {
  assert.equal(rawToBucket(2), 'L');
  assert.equal(rawToBucket(3), 'L');
  assert.equal(rawToBucket(4), 'M');
  assert.equal(rawToBucket(5), 'H');
  assert.equal(rawToBucket(6), 'H');
});

test('manhattanDistanceBuckets: identical is 0', () => {
  const v = ['H', 'M', 'L', 'M', 'H', 'L', 'H'];
  const p = v.join('');
  assert.equal(manhattanDistanceBuckets(v, p), 0);
});

test('manhattanDistanceBuckets: max is 14 for 7 dims', () => {
  const allL = Array(7).fill('L');
  const allH = Array(7).fill('H');
  assert.equal(manhattanDistanceBuckets(allL, 'HHHHHHH'), 14);
  assert.equal(similarityFromDistance(14, 7), 0);
});

test('rankPatterns picks exact template', () => {
  const patterns = {
    A: 'HHH-HHHH',
    B: 'LLL-LLLL',
  };
  const v = stripPattern(patterns.A).split('');
  const r = rankPatterns(v, patterns);
  assert.equal(r[0].code, 'A');
  assert.equal(r[0].distance, 0);
});

test('resolveOutcome: gate overrides matching', () => {
  const patterns = { A: 'MMM-MMMM' };
  const user = Array(7).fill('L');
  const res = resolveOutcome({
    gateOutcomeOverride: 'YOUSH',
    userBuckets: user,
    patterns,
    matchThreshold: 0.6,
    fallbackCode: 'VOID',
  });
  assert.equal(res.outcomeCode, 'YOUSH');
  assert.equal(res.reason, 'gate');
});

test('resolveOutcome: fallback when similarity low', () => {
  const patterns = {
    ONLY: 'HHH-HHHH',
  };
  const user = Array(7).fill('L');
  const res = resolveOutcome({
    gateOutcomeOverride: null,
    userBuckets: user,
    patterns,
    matchThreshold: 0.99,
    fallbackCode: 'VOID',
  });
  assert.equal(res.outcomeCode, 'VOID');
  assert.equal(res.reason, 'fallback');
});

test('resolveOutcome: COMP only when distance 0', () => {
  const patterns = {
    COMP: 'LLL-LLLL',
    FOO: 'HLL-LLLL',
  };
  const allL = Array(7).fill('L');
  const exact = resolveOutcome({
    gateOutcomeOverride: null,
    userBuckets: allL,
    patterns,
    matchThreshold: 0.6,
    fallbackCode: 'VOID',
    randomFn: () => 1,
  });
  assert.equal(exact.outcomeCode, 'COMP');
  assert.equal(exact.best.distance, 0);

  const oneOff = ['M', 'L', 'L', 'L', 'L', 'L', 'L'];
  const r = rankPatterns(oneOff, patterns);
  assert.equal(r[0].code, 'COMP');
  assert.equal(r[0].distance, 1);
  const soft = resolveOutcome({
    gateOutcomeOverride: null,
    userBuckets: oneOff,
    patterns,
    matchThreshold: 0.6,
    fallbackCode: 'VOID',
  });
  assert.equal(soft.outcomeCode, 'FOO');
  assert.equal(soft.best.code, 'FOO');
});

test('rankForOutcomePick removes soft COMP', () => {
  const rank = [
    { code: 'COMP', distance: 1, similarity: 0.93 },
    { code: 'GROW', distance: 1, similarity: 0.93 },
  ];
  const pick = rankForOutcomePick(rank);
  assert.equal(pick[0].code, 'GROW');
});

test('resolveOutcome: COMP exact may become JOKE via rng', () => {
  const patterns = { COMP: 'LLL-LLLL', FOO: 'HHH-HHHH' };
  const allL = Array(7).fill('L');
  const joke = resolveOutcome({
    gateOutcomeOverride: null,
    userBuckets: allL,
    patterns,
    matchThreshold: 0.6,
    fallbackCode: 'VOID',
    randomFn: () => COMP_TO_JOKE_CHANCE / 2,
  });
  assert.equal(joke.outcomeCode, 'JOKE');
  assert.equal(joke.reason, 'comp-joke');
  assert.equal(joke.best.code, 'COMP');

  const comp = resolveOutcome({
    gateOutcomeOverride: null,
    userBuckets: allL,
    patterns,
    matchThreshold: 0.6,
    fallbackCode: 'VOID',
    randomFn: () => COMP_TO_JOKE_CHANCE + 0.01,
  });
  assert.equal(comp.outcomeCode, 'COMP');
  assert.equal(comp.reason, 'match');
});

test('aggregateRawScores requires 2 answers per dimension', () => {
  const order = ['A1', 'A2'];
  assert.throws(() =>
    aggregateRawScores([{ dimensionId: 'A1', score: 2 }], order),
  );
});

test('aggregateRawScores sums pairs', () => {
  const order = ['A1', 'A2'];
  const rows = [
    { dimensionId: 'A1', score: 2 },
    { dimensionId: 'A1', score: 3 },
    { dimensionId: 'A2', score: 1 },
    { dimensionId: 'A2', score: 1 },
  ];
  const sums = aggregateRawScores(rows, order);
  assert.equal(sums.A1, 5);
  assert.equal(sums.A2, 2);
  const buckets = sumsToBuckets(sums, order);
  assert.deepEqual(buckets, ['H', 'L']);
});
