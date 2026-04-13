/**
 * 图鉴页：从 outcomes.json / patterns.json 渲染卡片与详情弹窗
 */

const HASH_PREFIX = 'woti=';

function loadTheme() {
  const saved = localStorage.getItem('woti-theme');
  let mode = saved;
  if (!mode) {
    mode = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.setAttribute('data-theme', mode);
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.textContent = mode === 'dark' ? '浅色' : '深色';
}

function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('woti-theme', next);
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.textContent = next === 'dark' ? '浅色' : '深色';
}

function parseHashCode() {
  const raw = window.location.hash.replace(/^#/, '');
  if (!raw) return null;
  if (raw.startsWith(HASH_PREFIX)) {
    return decodeURIComponent(raw.slice(HASH_PREFIX.length)).toUpperCase();
  }
  if (/^[A-Z0-9-]{2,6}$/i.test(raw)) {
    return raw.toUpperCase();
  }
  return null;
}

function setHashCode(code) {
  window.location.hash = `${HASH_PREFIX}${encodeURIComponent(code)}`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function categoryLabel(code, fallbackCode, hiddenCode) {
  if (code === fallbackCode) return { className: 'gallery-badge gallery-badge-fallback', text: '兜底' };
  if (code === hiddenCode) return { className: 'gallery-badge gallery-badge-hidden', text: '隐藏' };
  if (code === 'JOKE') return { className: 'gallery-badge gallery-badge-floating', text: '浮动' };
  if (code === 'BODY') return { className: 'gallery-badge gallery-badge-body', text: '殉爆' };
  if (code === 'WORM') return { className: 'gallery-badge gallery-badge-worm', text: '误解' };
  return { className: 'gallery-badge gallery-badge-standard', text: '标准' };
}

function renderCards(outcomes, patterns, fallbackCode, hiddenCode) {
  const root = document.getElementById('gallery-grid');
  root.innerHTML = '';

  const standard = outcomes.filter((o) => patterns[o.code]);
  const special = outcomes.filter((o) => !patterns[o.code]);
  standard.sort((a, b) => a.code.localeCompare(b.code));
  special.sort((a, b) => {
    const order = (c) =>
      c === fallbackCode
        ? 0
        : c === hiddenCode
          ? 1
          : c === 'JOKE'
            ? 2
            : c === 'BODY'
              ? 3
              : c === 'WORM'
                ? 4
                : 5;
    return order(a.code) - order(b.code);
  });

  const frag = document.createDocumentFragment();
  for (const o of [...standard, ...special]) {
    const cat = categoryLabel(o.code, fallbackCode, hiddenCode);
    const article = document.createElement('article');
    article.className = 'gallery-card';
    article.setAttribute('role', 'listitem');
    article.tabIndex = 0;
    article.dataset.code = o.code;
    article.innerHTML = `
      <div class="gallery-card-top">
        <span class="gallery-code">${escapeHtml(o.code)}</span>
        <span class="${cat.className}">${escapeHtml(cat.text)}</span>
      </div>
      <h2 class="gallery-card-name">${escapeHtml(o.nameZh)}</h2>
      <p class="gallery-card-tagline">${escapeHtml(o.tagline)}</p>
    `;
    const open = () => openDetail(o, patterns, fallbackCode, hiddenCode, { replaceHash: true });
    article.addEventListener('click', open);
    article.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open();
      }
    });
    frag.appendChild(article);
  }
  root.appendChild(frag);
}

function openDetail(o, patterns, fallbackCode, hiddenCode, { replaceHash = true } = {}) {
  const dlg = document.getElementById('detail-dialog');
  const title = document.getElementById('detail-title');
  const body = document.getElementById('detail-body');
  const cat = categoryLabel(o.code, fallbackCode, hiddenCode);

  let extra = '';
  if (patterns[o.code]) {
    extra += `<div class="gallery-detail-block"><h3>标准模板（7 维 H/M/L）</h3><pre class="gallery-pattern">${escapeHtml(
      patterns[o.code],
    )}</pre><p class="gallery-hint">两组依次为：老玩家文化×3 · 游戏价值观×4</p></div>`;
  }

  title.innerHTML = `<span class="gallery-code">${escapeHtml(o.code)}</span> ${escapeHtml(o.nameZh)} <span class="${cat.className}">${escapeHtml(
    cat.text,
  )}</span>`;
  body.innerHTML = `
    <p class="gallery-detail-tagline">${escapeHtml(o.tagline)}</p>
    <p class="gallery-detail-desc">${escapeHtml(o.desc)}</p>
    ${extra}
  `;

  if (replaceHash) setHashCode(o.code);
  if (typeof dlg.showModal === 'function' && !dlg.open) dlg.showModal();
}

function closeDetailDialog() {
  const dlg = document.getElementById('detail-dialog');
  if (dlg?.open) dlg.close();
}

async function init() {
  loadTheme();
  document.getElementById('theme-toggle')?.addEventListener('click', toggleTheme);

  const noCache = { cache: 'no-store' };
  const [outcomesPayload, patternsPayload] = await Promise.all([
    fetch('./data/outcomes.json', noCache).then((r) => {
      if (!r.ok) throw new Error('outcomes.json');
      return r.json();
    }),
    fetch('./data/patterns.json', noCache).then((r) => {
      if (!r.ok) throw new Error('patterns.json');
      return r.json();
    }),
  ]);

  const { fallbackCode, hiddenCode, matchThreshold, outcomes } = outcomesPayload;
  const patterns = patternsPayload.patterns;

  const metaEl = document.getElementById('meta-threshold');
  if (metaEl) {
    metaEl.dataset.threshold = String(matchThreshold);
    metaEl.textContent = `${Math.round(matchThreshold * 100)}%`;
  }

  renderCards(outcomes, patterns, fallbackCode, hiddenCode);

  const dlg = document.getElementById('detail-dialog');
  document.getElementById('detail-close')?.addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', (e) => {
    const t = e.target;
    if (t.nodeName === 'DIALOG') dlg.close();
  });

  const tryOpenFromHash = () => {
    const code = parseHashCode();
    if (!code) {
      closeDetailDialog();
      return;
    }
    const o = outcomes.find((x) => x.code === code);
    if (o) openDetail(o, patterns, fallbackCode, hiddenCode, { replaceHash: false });
  };

  tryOpenFromHash();
  window.addEventListener('hashchange', tryOpenFromHash);
}

init().catch((err) => {
  console.error(err);
  const main = document.getElementById('gallery-main');
  if (main) {
    main.innerHTML = `<div class="card"><p>加载失败：请通过本地静态服务器打开（例如 <code>npm start</code>）。</p><p class="lead">${escapeHtml(
      String(err.message),
    )}</p></div>`;
  }
});
