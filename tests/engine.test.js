import test from 'node:test';
import assert from 'node:assert/strict';
import {
  rawToBucket,
  stripPattern,
  manhattanDistanceBuckets,
  similarityFromDistance,
  rankPatterns,
  resolveOutcome,
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
