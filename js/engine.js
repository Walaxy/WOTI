/**
 * WOTI 匹配引擎：7 维 L/M/H，与标准模板 Manhattan 距离；
 * 相似度 = 1 - distance/(dimCount×2)；低于阈值走兜底；闸门题可覆盖隐藏结局。
 *
 * COMP（清醒竞技者）仅在与模板距离为 0 时允许命中；距离 >=1 时跳过，避免「差一点」仍判 COMP。
 * 命中 COMP 后：先按 COMP_TO_JOKE_CHANCE 判定 JOKE；否则再按 COMP_TO_BODY_CHANCE 判定 BODY（弹药架梗）；
 * 若 BODY 未触发，再按 COMP_TO_WORM_CHANCE 判定 WORM（高效蛆）；否则仍为 COMP。
 */

export function stripPattern(patternStr) {
  return patternStr.replace(/-/g, '').toUpperCase();
}

export function letterToIndex(ch) {
  const c = String(ch).toUpperCase();
  if (c === 'L') return 0;
  if (c === 'M') return 1;
  if (c === 'H') return 2;
  throw new Error(`Invalid bucket letter: ${ch}`);
}

/** 两题得分之和 raw ∈ [2,6] → L/M/H */
export function rawToBucket(raw) {
  if (raw <= 3) return 'L';
  if (raw === 4) return 'M';
  return 'H';
}

/**
 * @param {Array<{ dimensionId: string, score: number }>} answerRows 按题目顺序，每题含 dimensionId 与 score 1-3
 * @param {string[]} dimensionOrder 长度 15
 */
export function aggregateRawScores(answerRows, dimensionOrder) {
  const sums = Object.fromEntries(dimensionOrder.map((id) => [id, 0]));
  const counts = Object.fromEntries(dimensionOrder.map((id) => [id, 0]));
  for (const row of answerRows) {
    if (!row.dimensionId) continue;
    sums[row.dimensionId] = (sums[row.dimensionId] ?? 0) + row.score;
    counts[row.dimensionId] = (counts[row.dimensionId] ?? 0) + 1;
  }
  for (const id of dimensionOrder) {
    if (counts[id] !== 2) {
      throw new Error(`Dimension ${id} expected 2 answers, got ${counts[id]}`);
    }
  }
  return sums;
}

export function sumsToBuckets(sums, dimensionOrder) {
  return dimensionOrder.map((id) => rawToBucket(sums[id]));
}

export function bucketsToString(buckets) {
  return buckets.join('');
}

export function manhattanDistanceBuckets(userBuckets, templateStr) {
  const t = stripPattern(templateStr);
  if (t.length !== userBuckets.length) {
    throw new Error(`Template length ${t.length} != user ${userBuckets.length}`);
  }
  let d = 0;
  for (let i = 0; i < userBuckets.length; i++) {
    d += Math.abs(letterToIndex(userBuckets[i]) - letterToIndex(t[i]));
  }
  return d;
}

export function similarityFromDistance(distance, dimCount = 7) {
  return 1 - distance / (dimCount * 2);
}

/**
 * @returns {{ code: string, distance: number, similarity: number }[]}
 */
export function rankPatterns(userBuckets, patterns) {
  const dimCount = userBuckets.length;
  const entries = Object.entries(patterns).map(([code, tmpl]) => {
    const distance = manhattanDistanceBuckets(userBuckets, tmpl);
    return {
      code,
      distance,
      similarity: similarityFromDistance(distance, dimCount),
    };
  });
  entries.sort((a, b) => a.distance - b.distance || a.code.localeCompare(b.code));
  return entries;
}

const COMP_STRICT_CODE = 'COMP';
const JOKE_CODE = 'JOKE';
const BODY_CODE = 'BODY';
const WORM_CODE = 'WORM';
/** COMP 命中后替换为 JOKE 的真实概率。界面与文案仍统一为 ±25% 梗，不向用户展示本数值。 */
export const COMP_TO_JOKE_CHANCE = 0.4;
/** 未进入 JOKE 时，COMP 被 BODY（殉爆/尸体）替代的概率。 */
export const COMP_TO_BODY_CHANCE = 0.33;
/** 未进入 JOKE、也未进入 BODY 时，COMP 被 WORM（高效蛆）替代的概率。 */
export const COMP_TO_WORM_CHANCE = 0.1;

/**
 * 去掉「距离 > 0 的 COMP」后再取最佳，压低 COMP 出现率。
 * @param {{ code: string, distance: number, similarity: number }[]} rank
 */
export function rankForOutcomePick(rank) {
  const filtered = rank.filter((e) => e.code !== COMP_STRICT_CODE || e.distance === 0);
  return filtered.length ? filtered : rank;
}

/**
 * @param {string|null|undefined} gateOutcomeOverride
 * @param {() => number} [randomFn] 返回 [0,1)，默认 Math.random；用于 COMP→JOKE / COMP→BODY 的随机判定与测试
 */
export function resolveOutcome({
  gateOutcomeOverride,
  userBuckets,
  patterns,
  matchThreshold,
  fallbackCode,
  randomFn = Math.random,
}) {
  if (gateOutcomeOverride) {
    return {
      outcomeCode: gateOutcomeOverride,
      reason: 'gate',
      rank: rankPatterns(userBuckets, patterns),
    };
  }
  const rank = rankPatterns(userBuckets, patterns);
  const pickRank = rankForOutcomePick(rank);
  const best = pickRank[0];
  if (!best) {
    return { outcomeCode: fallbackCode, reason: 'fallback', rank };
  }
  if (best.similarity < matchThreshold) {
    return { outcomeCode: fallbackCode, reason: 'fallback', best, rank };
  }
  let outcomeCode = best.code;
  let reason = 'match';
  if (outcomeCode === COMP_STRICT_CODE) {
    const rJoke = randomFn();
    if (rJoke < COMP_TO_JOKE_CHANCE) {
      outcomeCode = JOKE_CODE;
      reason = 'comp-joke';
    } else if (randomFn() < COMP_TO_BODY_CHANCE) {
      outcomeCode = BODY_CODE;
      reason = 'comp-body';
    } else if (randomFn() < COMP_TO_WORM_CHANCE) {
      outcomeCode = WORM_CODE;
      reason = 'comp-worm';
    }
  }
  return { outcomeCode, reason, best, rank };
}
