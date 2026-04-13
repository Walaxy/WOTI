import {
  aggregateRawScores,
  sumsToBuckets,
  resolveOutcome,
  rankPatterns,
} from './engine.js';

const OILY_CODE = 'OILY';

const HASH_PREFIX = 'woti=';

let dimensionsData;
let questionsData;
let patternsData;
let outcomesData;

let answersMain = [];
let gateOptionIndex = null;
let lastResult = null;

const el = {
  themeToggle: () => document.getElementById('theme-toggle'),
  main: () => document.getElementById('app-main'),
  welcome: () => document.getElementById('view-welcome'),
  quiz: () => document.getElementById('view-quiz'),
  gate: () => document.getElementById('view-gate'),
  result: () => document.getElementById('view-result'),
  progress: () => document.getElementById('quiz-progress'),
  progressText: () => document.getElementById('quiz-progress-text'),
  questionTitle: () => document.getElementById('question-title'),
  options: () => document.getElementById('question-options'),
  gateTitle: () => document.getElementById('gate-title'),
  gateOptions: () => document.getElementById('gate-options'),
  resultCode: () => document.getElementById('result-code'),
  resultName: () => document.getElementById('result-name'),
  resultTagline: () => document.getElementById('result-tagline'),
  resultDesc: () => document.getElementById('result-desc'),
  resultMeta: () => document.getElementById('result-meta'),
  dimBody: () => document.getElementById('dim-body'),
  dimStrip: () => document.getElementById('dim-strip'),
  resultSection: () => document.getElementById('view-result'),
};

function loadTheme() {
  const saved = localStorage.getItem('woti-theme');
  let mode = saved;
  if (!mode) {
    mode = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.setAttribute('data-theme', mode);
  el.themeToggle().textContent = mode === 'dark' ? '浅色' : '深色';
}

function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('woti-theme', next);
  el.themeToggle().textContent = next === 'dark' ? '浅色' : '深色';
}

function showView(name) {
  el.welcome().classList.toggle('hidden', name !== 'welcome');
  el.quiz().classList.toggle('hidden', name !== 'quiz');
  el.gate().classList.toggle('hidden', name !== 'gate');
  el.result().classList.toggle('hidden', name !== 'result');
  if (name === 'result') {
    requestAnimationFrame(() => {
      el.resultSection()?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
}

function parseHashOutcome() {
  const raw = window.location.hash.replace(/^#/, '');
  if (!raw) return null;
  if (raw.startsWith(HASH_PREFIX)) {
    return decodeURIComponent(raw.slice(HASH_PREFIX.length));
  }
  if (/^[A-Z0-9-]{2,6}$/i.test(raw)) {
    return raw.toUpperCase();
  }
  return null;
}

/** 地址栏 hash 由刚完成的评测写入时，会触发 hashchange；勿用「仅链接」视图覆盖已算好的维度表。 */
function isHashSyncedFromCompletedQuiz(code) {
  return lastResult?.resolved != null && lastResult?.oc?.code === code;
}

function setHashForOutcome(code) {
  window.location.hash = `${HASH_PREFIX}${encodeURIComponent(code)}`;
}

function outcomeByCode(code) {
  return outcomesData.outcomes.find((o) => o.code === code);
}

function dimensionByIdMap() {
  const m = Object.create(null);
  for (const g of dimensionsData.groups) {
    for (const d of g.dimensions) {
      m[d.id] = d;
    }
  }
  return m;
}

function buildDimensionMeter(bucket) {
  const levels = ['L', 'M', 'H'];
  const labels = { L: '低', M: '中', H: '高' };
  return `<div class="dim-meter" role="img" aria-label="分档 ${bucket}（${labels[bucket]}）">${levels
    .map((lv) => `<span class="dim-meter-seg dim-meter-${lv}${lv === bucket ? ' is-active' : ''}" title="${labels[lv]}"></span>`)
    .join('')}</div>`;
}

function buildDimensionStrip(order, buckets, sums) {
  const meta = dimensionByIdMap();
  let html = '<div class="dim-strip" role="list">';
  for (let i = 0; i < order.length; i++) {
    const id = order[i];
    const b = buckets[i];
    const d = meta[id];
    const name = d?.name ?? id;
    html += `<div class="dim-strip-item" role="listitem" title="${escapeHtml(name)} · 合成分 ${sums[id]}">`;
    html += `<span class="dim-strip-id">${id}</span>`;
    html += `<span class="badge badge-${b}">${b}</span>`;
    html += `<span class="dim-strip-sum">${sums[id]}</span>`;
    html += `</div>`;
  }
  html += '</div>';
  return html;
}

function buildDimensionRows(sums, buckets) {
  const order = dimensionsData.order;
  const groups = dimensionsData.groups;

  let html = '';
  for (const g of groups) {
    html += `<div class="dim-group-title">${escapeHtml(g.name)}</div>`;
    html += '<table class="dim-table"><tbody>';
    for (const d of g.dimensions) {
      const idx = order.indexOf(d.id);
      const b = buckets[idx];
      const label = b === 'L' ? d.l : b === 'M' ? d.m : d.h;
      html += `<tr><th>${escapeHtml(d.name)}</th><td><div class="dim-row-inner">`;
      html += buildDimensionMeter(b);
      html += `<span class="dim-raw"><span class="dim-raw-label">合成</span>${sums[d.id]}</span>`;
      html += `<span class="badge badge-${b}">${b}</span>`;
      html += `<span class="dim-tendency">${escapeHtml(label)}</span>`;
      html += `</div></td></tr>`;
    }
    html += '</tbody></table>';
  }
  return html;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function computeMainSumsAndBuckets() {
  const order = dimensionsData.order;
  const sums = aggregateRawScores(
    answersMain.map((a) => ({ dimensionId: a.dimensionId, score: a.score })),
    order,
  );
  const buckets = sumsToBuckets(sums, order);
  return { order, sums, buckets };
}

function resolveWithoutGate(buckets) {
  return resolveOutcome({
    gateOutcomeOverride: null,
    userBuckets: buckets,
    patterns: patternsData.patterns,
    matchThreshold: outcomesData.matchThreshold,
    fallbackCode: outcomesData.fallbackCode,
  });
}

function computeAndRenderResult() {
  const { order, sums, buckets } = computeMainSumsAndBuckets();

  const gateOpt =
    gateOptionIndex != null ? questionsData.gate.options[gateOptionIndex] : null;
  const gateOverride = gateOpt?.outcomeOverride ?? null;

  let resolved;
  if (gateOptionIndex != null && gateOverride == null) {
    const rank = rankPatterns(buckets, patternsData.patterns);
    const oilyEntry = rank.find((r) => r.code === OILY_CODE) ?? rank[0];
    resolved = {
      outcomeCode: OILY_CODE,
      reason: 'oily-after-gate',
      best: oilyEntry,
      rank,
    };
  } else {
    resolved = resolveOutcome({
      gateOutcomeOverride: gateOverride,
      userBuckets: buckets,
      patterns: patternsData.patterns,
      matchThreshold: outcomesData.matchThreshold,
      fallbackCode: outcomesData.fallbackCode,
    });
  }

  const oc = outcomeByCode(resolved.outcomeCode);
  lastResult = { resolved, buckets, sums, oc };

  el.resultCode().textContent = oc.code;
  el.resultName().textContent = oc.nameZh;
  el.resultTagline().textContent = oc.tagline;
  el.resultDesc().textContent = oc.desc;

  const reasonText =
    resolved.reason === 'gate'
      ? '闸门题触发隐藏结局'
      : resolved.reason === 'fallback'
        ? `最高相似度低于 ${Math.round(outcomesData.matchThreshold * 100)}%，已匹配兜底类型`
        : '与标准模板最接近';

  let simLine = '';
  if (
    (resolved.reason === 'match' || resolved.reason === 'oily-after-gate') &&
    resolved.best
  ) {
    simLine = `最佳匹配：${resolved.best.code} · 相似度 ${(resolved.best.similarity * 100).toFixed(1)}%`;
  } else if (resolved.rank?.[0]) {
    simLine = `最接近：${resolved.rank[0].code} · 相似度 ${(resolved.rank[0].similarity * 100).toFixed(1)}%`;
  }

  el.resultMeta().innerHTML = `${escapeHtml(reasonText)}${simLine ? `<br>${escapeHtml(simLine)}` : ''}`;
  el.dimStrip().innerHTML = buildDimensionStrip(order, buckets, sums);
  el.dimBody().innerHTML = buildDimensionRows(sums, buckets);

  setHashForOutcome(oc.code);
}

function renderQuestion(index) {
  const q = questionsData.main[index];
  const n = questionsData.main.length;
  const pct = Math.round(((index + 1) / n) * 100);
  el.progress().style.width = `${pct}%`;
  el.progressText().textContent = `第 ${index + 1} / ${n} 题`;
  el.questionTitle().textContent = q.text;
  el.options().innerHTML = '';
  q.options.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'option-btn';
    btn.textContent = opt.label;
    btn.addEventListener('click', () => {
      answersMain[index] = {
        questionId: q.id,
        dimensionId: q.dimensionId,
        score: opt.score,
        optionIndex: i,
      };
      if (index + 1 < n) {
        renderQuestion(index + 1);
      } else {
        afterMainComplete();
      }
    });
    el.options().appendChild(btn);
  });
}

function afterMainComplete() {
  gateOptionIndex = null;
  const { buckets } = computeMainSumsAndBuckets();
  const prelim = resolveWithoutGate(buckets);
  if (prelim.outcomeCode === OILY_CODE && prelim.reason === 'match') {
    renderGate();
  } else {
    computeAndRenderResult();
    showView('result');
  }
}

function renderGate() {
  showView('gate');
  const g = questionsData.gate;
  el.gateTitle().textContent = g.text;
  el.gateOptions().innerHTML = '';
  g.options.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'option-btn';
    btn.textContent = opt.label;
    btn.addEventListener('click', () => {
      gateOptionIndex = i;
      computeAndRenderResult();
      showView('result');
    });
    el.gateOptions().appendChild(btn);
  });
}

function startQuiz() {
  answersMain = [];
  gateOptionIndex = null;
  showView('quiz');
  renderQuestion(0);
}

function restart() {
  window.location.hash = '';
  answersMain = [];
  gateOptionIndex = null;
  lastResult = null;
  showView('welcome');
}

function showResultFromHash(code) {
  const oc = outcomeByCode(code);
  if (!oc) return false;
  lastResult = { oc, resolved: null };
  el.resultCode().textContent = oc.code;
  el.resultName().textContent = oc.nameZh;
  el.resultTagline().textContent = oc.tagline;
  el.resultDesc().textContent = oc.desc;
  el.resultMeta().innerHTML =
    '仅根据链接展示结局信息；完整维度倾向请重新完成评测。';
  el.dimStrip().innerHTML = '';
  el.dimBody().innerHTML =
    '<p class="lead" style="margin:0">完成全部题目后，将在此显示你在七个维度上的分档与倾向说明。</p>';
  showView('result');
  return true;
}

async function loadJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return res.json();
}

async function init() {
  loadTheme();
  el.themeToggle().addEventListener('click', toggleTheme);

  [dimensionsData, questionsData, patternsData, outcomesData] = await Promise.all([
    loadJson('./data/dimensions.json'),
    loadJson('./data/questions.json'),
    loadJson('./data/patterns.json'),
    loadJson('./data/outcomes.json'),
  ]);

  document.getElementById('btn-start').addEventListener('click', startQuiz);
  document.getElementById('btn-restart').addEventListener('click', restart);

  const hashCode = parseHashOutcome();
  if (hashCode && showResultFromHash(hashCode)) {
    return;
  }

  window.addEventListener('hashchange', () => {
    const c = parseHashOutcome();
    if (c && outcomeByCode(c)) {
      if (isHashSyncedFromCompletedQuiz(c)) return;
      showResultFromHash(c);
    }
  });

  showView('welcome');
}

init().catch((err) => {
  console.error(err);
  el.main().innerHTML = `<div class="card"><p>加载失败：请通过本地静态服务器打开（例如 <code>npx serve .</code>），不要直接用 file:// 打开。</p><p class="lead">${escapeHtml(
    String(err.message),
  )}</p></div>`;
});
