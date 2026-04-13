/**
 * 在「答卷恰好匹配 COMP 模板（距离 0）」前提下，统计 COMP→JOKE / COMP→BODY / 仍为 COMP 的触发频率。
 * 用于核对 engine.js 中 COMP_TO_JOKE_CHANCE、COMP_TO_BODY_CHANCE 与实现一致。
 *
 * 理论概率（独立两次 randomFn 判定）：
 *   P(JOKE) = j
 *   P(BODY) = (1 - j) * b
 *   P(COMP) = (1 - j) * (1 - b)
 *
 * 用法: node scripts/simulate-comp-extra-endings.mjs [模拟次数，默认 100_000]
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  resolveOutcome,
  stripPattern,
  COMP_TO_JOKE_CHANCE,
  COMP_TO_BODY_CHANCE,
} from '../js/engine.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const patterns = JSON.parse(readFileSync(join(root, 'data/patterns.json'), 'utf8')).patterns;
const outcomesData = JSON.parse(readFileSync(join(root, 'data/outcomes.json'), 'utf8'));
const { matchThreshold, fallbackCode } = outcomesData;

const compTmpl = patterns.COMP;
if (!compTmpl) {
  throw new Error('patterns.json missing COMP');
}
const userBuckets = stripPattern(compTmpl).split('');

const j = COMP_TO_JOKE_CHANCE;
const b = COMP_TO_BODY_CHANCE;
const pJokeTheory = j;
const pBodyTheory = (1 - j) * b;
const pCompTheory = (1 - j) * (1 - b);

function oneRun() {
  const { outcomeCode, reason } = resolveOutcome({
    gateOutcomeOverride: null,
    userBuckets,
    patterns,
    matchThreshold,
    fallbackCode,
    randomFn: Math.random,
  });
  return { outcomeCode, reason };
}

const runs = Math.max(1, parseInt(process.argv[2], 10) || 100_000);

const counts = Object.create(null);
let reasonMismatch = 0;

for (let i = 0; i < runs; i++) {
  const { outcomeCode, reason } = oneRun();
  counts[outcomeCode] = (counts[outcomeCode] ?? 0) + 1;

  const expectedReason =
    outcomeCode === 'JOKE'
      ? 'comp-joke'
      : outcomeCode === 'BODY'
        ? 'comp-body'
        : outcomeCode === 'COMP'
          ? 'match'
          : null;
  if (expectedReason && reason !== expectedReason) {
    reasonMismatch += 1;
  }
}

const pct = (n) => ((n / runs) * 100).toFixed(2);
const nJoke = counts.JOKE ?? 0;
const nBody = counts.BODY ?? 0;
const nComp = counts.COMP ?? 0;
const other = runs - nJoke - nBody - nComp;

console.log('COMP 分支模拟（固定答卷 = COMP 模板精确匹配，无闸门覆盖）\n');
console.log(`模拟次数: ${runs}`);
console.log(`COMP 模板: ${compTmpl} → ${userBuckets.join('')}`);
console.log(`引擎常量: COMP_TO_JOKE_CHANCE=${j}, COMP_TO_BODY_CHANCE=${b}\n`);

console.log('理论概率:');
console.log(
  `  JOKE  ${(pJokeTheory * 100).toFixed(2)}%  |  BODY  ${(pBodyTheory * 100).toFixed(2)}%  |  仍为 COMP  ${(pCompTheory * 100).toFixed(2)}%\n`,
);

console.log('模拟结果:');
for (const [label, n, theory] of [
  ['JOKE', nJoke, pJokeTheory],
  ['BODY', nBody, pBodyTheory],
  ['COMP', nComp, pCompTheory],
]) {
  const deltaPct = ((n / runs - theory) * 100).toFixed(2);
  console.log(`  ${label.padEnd(4)} ${String(n).padStart(String(runs).length)}  (${pct(n).padStart(6)}%)  理论 ${(theory * 100).toFixed(2)}%  Δ经验−理论 ${deltaPct}pp`);
}
if (other > 0) {
  console.log(`  其他结局 ${other}（预期应为 0；若出现请检查 patterns / 匹配阈值）`);
}
if (reasonMismatch > 0) {
  console.log(`\n警告: ${reasonMismatch} 次 outcomeCode 与 reason 组合异常`);
}
