/**
 * WOTI 匹配引擎：7 维 L/M/H，与标准模板 Manhattan 距离；
 * 相似度 = 1 - distance/(dimCount×2)；低于阈值走兜底；闸门题可覆盖隐藏结局。
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

/**
 * @param {string|null|undefined} gateOutcomeOverride
 */
export function resolveOutcome({
  gateOutcomeOverride,
  userBuckets,
  patterns,
  matchThreshold,
  fallbackCode,
}) {
  if (gateOutcomeOverride) {
    return {
      outcomeCode: gateOutcomeOverride,
      reason: 'gate',
      rank: rankPatterns(userBuckets, patterns),
    };
  }
  const rank = rankPatterns(userBuckets, patterns);
  const best = rank[0];
  if (!best) {
    return { outcomeCode: fallbackCode, reason: 'fallback', rank };
  }
  if (best.similarity < matchThreshold) {
    return { outcomeCode: fallbackCode, reason: 'fallback', best, rank };
  }
  return { outcomeCode: best.code, reason: 'match', best, rank };
}
