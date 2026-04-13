/**
 * 随机选题，多次运行 resolveOutcome，统计结局代码频率（用于分布观察）。
 * 用法: node scripts/simulate-random-outcomes.mjs [次数，默认 200]
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  aggregateRawScores,
  sumsToBuckets,
  resolveOutcome,
} from '../js/engine.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const questions = JSON.parse(readFileSync(join(root, 'data/questions.json'), 'utf8'));
const patterns = JSON.parse(readFileSync(join(root, 'data/patterns.json'), 'utf8')).patterns;
const outcomesData = JSON.parse(readFileSync(join(root, 'data/outcomes.json'), 'utf8'));

const dimensionOrder = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7'];
const { matchThreshold, fallbackCode } = outcomesData;

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function oneRun() {
  const rows = [];
  for (const q of questions.main) {
    const opt = pick(q.options);
    rows.push({ dimensionId: q.dimensionId, score: opt.score });
  }
  let gateOutcomeOverride = null;
  const gatePick = pick(questions.gate.options);
  if (gatePick.outcomeOverride) {
    gateOutcomeOverride = gatePick.outcomeOverride;
  }
  const sums = aggregateRawScores(rows, dimensionOrder);
  const buckets = sumsToBuckets(sums, dimensionOrder);
  const { outcomeCode } = resolveOutcome({
    gateOutcomeOverride,
    userBuckets: buckets,
    patterns,
    matchThreshold,
    fallbackCode,
    randomFn: Math.random,
  });
  return outcomeCode;
}

const runs = Math.max(1, parseInt(process.argv[2], 10) || 200);
const counts = Object.create(null);
for (let i = 0; i < runs; i++) {
  const code = oneRun();
  counts[code] = (counts[code] ?? 0) + 1;
}

const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
console.log(`模拟次数: ${runs}\n`);
for (const [code, n] of sorted) {
  const pct = ((n / runs) * 100).toFixed(1);
  console.log(`${code.padEnd(8)} ${String(n).padStart(4)}  (${pct}%)`);
}
