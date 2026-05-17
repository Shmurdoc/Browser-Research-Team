// Design Pattern Multiverse — Web UI Client
// Production-grade: XSS-safe, error-handled, race-condition-free

const API = '/api';

// State
let allPatterns = [];
let currentPattern = null;
let isGenerating = false;
let isRating = false;
let isDeleting = false;

// DOM Elements
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// Tabs
$$('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    $$('.tab').forEach(t => t.classList.remove('active'));
    $$('.tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    $(`#${tab.dataset.tab}`).classList.add('active');

    if (tab.dataset.tab === 'browse') loadPatterns();
    if (tab.dataset.tab === 'stats') loadStats();
  });
});

// Modal
$('.modal-close').addEventListener('click', closeModal);
$('#pattern-modal').addEventListener('click', (e) => {
  if (e.target === $('#pattern-modal')) closeModal();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

function closeModal() {
  $('#pattern-modal').classList.add('hidden');
  currentPattern = null;
}

// Quick Search
$('#quick-search').addEventListener('input', debounce((e) => {
  filterPatterns(e.target.value);
}, 300));

$('#filter-source').addEventListener('change', () => filterPatterns($('#quick-search').value));
$('#filter-layout').addEventListener('change', () => filterPatterns($('#quick-search').value));

// Vector Search
$('#vector-search-btn').addEventListener('click', vectorSearch);
$('#vector-search').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') vectorSearch();
});

// Scout
$('#scout-start-btn').addEventListener('click', startScout);
$('#scout-btn').addEventListener('click', () => {
  $$('.tab')[2].click();
});

// Load patterns on start
loadPatterns();

// ============================================================
// Functions
// ============================================================

async function loadPatterns() {
  const loading = $('#loading');
  const grid = $('#patterns-grid');
  const empty = $('#empty-state');

  loading.classList.remove('hidden');
  grid.innerHTML = '';
  empty.classList.add('hidden');
  hideError('patterns-error');

  try {
    const res = await safeFetch(`${API}/patterns/all`);
    const data = await res.json();
    allPatterns = data.patterns || [];
    renderPatterns(allPatterns);
  } catch (e) {
    showError('patterns-error', `Failed to load patterns: ${e.message}`);
  } finally {
    loading.classList.add('hidden');
  }
}

function renderPatterns(patterns) {
  const grid = $('#patterns-grid');
  grid.innerHTML = '';

  if (patterns.length === 0) {
    $('#empty-state').classList.remove('hidden');
    return;
  }

  patterns.forEach(p => {
    const card = document.createElement('div');
    card.className = 'pattern-card';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', `View pattern: ${p.title}`);
    card.innerHTML = `
      <h3>${escapeHtml(p.title)}</h3>
      <div class="meta">
        <span class="badge source">${escapeHtml(p.source)}</span>
        <span class="badge">${escapeHtml(String(p.layout?.type || 'unknown'))}</span>
      </div>
      <p style="font-size:0.85rem;color:var(--text-muted);margin-bottom:0.5rem;">
        ${escapeHtml((p.components || []).slice(0, 4).join(', '))}${(p.components || []).length > 4 ? '...' : ''}
      </p>
      <div class="quality-score">
        Quality: <span class="score">${Number(p.qualityScore || 0).toFixed(1)}</span>/10
      </div>
    `;
    card.addEventListener('click', () => showPatternDetail(p));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        showPatternDetail(p);
      }
    });
    grid.appendChild(card);
  });
}

function filterPatterns(query) {
  const source = $('#filter-source').value;
  const layout = $('#filter-layout').value;

  let filtered = allPatterns;

  if (query) {
    const q = query.toLowerCase();
    filtered = filtered.filter(p =>
      (p.title || '').toLowerCase().includes(q) ||
      (p.description || '').toLowerCase().includes(q) ||
      (p.tags || []).some(t => t.toLowerCase().includes(q))
    );
  }

  if (source) filtered = filtered.filter(p => p.source === source);
  if (layout) filtered = filtered.filter(p => (p.layout?.type || '') === layout);

  renderPatterns(filtered);
}

async function showPatternDetail(pattern) {
  currentPattern = pattern;
  isGenerating = false;
  isRating = false;
  isDeleting = false;

  const modal = $('#pattern-modal');
  const body = $('#modal-body');

  const layoutType = escapeHtml(String(pattern.layout?.type || 'unknown'));
  const zones = (pattern.layout?.zones || []).map(z => escapeHtml(String(z))).join(', ') || 'None detected';
  const colors = Object.entries(pattern.colors || {})
    .filter(([k]) => k !== 'additional')
    .map(([name, color]) => {
      const safeName = escapeHtml(String(name));
      const safeColor = escapeHtml(String(color));
      return `<div class="color-swatch" style="background:${safeColor}" data-color="${safeName}: ${safeColor}" title="${safeName}: ${safeColor}" role="img" aria-label="${safeName} color: ${safeColor}"></div>`;
    }).join('');
  const components = (pattern.components || []).map(c => `<span class="badge">${escapeHtml(String(c))}</span>`).join('');
  const headingFamily = escapeHtml(String(pattern.typography?.heading?.family || 'N/A'));
  const headingWeight = escapeHtml(String(pattern.typography?.heading?.weight || ''));
  const headingSize = escapeHtml(String(pattern.typography?.heading?.size || ''));
  const bodyFamily = escapeHtml(String(pattern.typography?.body?.family || 'N/A'));
  const bodyWeight = escapeHtml(String(pattern.typography?.body?.weight || ''));
  const bodySize = escapeHtml(String(pattern.typography?.body?.size || ''));

  body.innerHTML = `
    <h2>${escapeHtml(pattern.title)}</h2>
    <p style="color:var(--text-muted);margin-bottom:1rem;">${escapeHtml(pattern.description)}</p>

    <div class="detail-section">
      <h3>Layout</h3>
      <p>Type: <strong>${layoutType}</strong></p>
      <p>Zones: ${zones}</p>
    </div>

    <div class="detail-section">
      <h3>Colors</h3>
      <div class="color-swatches">
        ${colors}
      </div>
    </div>

    <div class="detail-section">
      <h3>Components</h3>
      <div class="components-list">
        ${components}
      </div>
    </div>

    <div class="detail-section">
      <h3>Typography</h3>
      <p>Heading: ${headingFamily} (${headingWeight} ${headingSize})</p>
      <p>Body: ${bodyFamily} (${bodyWeight} ${bodySize})</p>
    </div>

    <div class="detail-section">
      <h3>Rate this pattern</h3>
      <div class="rating-stars" id="rating-stars" role="radiogroup" aria-label="Rate this pattern 1 to 5 stars">
        ${[1,2,3,4,5].map(i => `<span class="star" data-rating="${i}" role="radio" aria-checked="false" tabindex="0" aria-label="${i} star${i > 1 ? 's' : ''}">&#9733;</span>`).join('')}
      </div>
      <p style="font-size:0.85rem;color:var(--text-muted);margin-top:0.5rem;">Click to rate 1-5 stars</p>
    </div>

    <div class="detail-section">
      <h3>Generate Code</h3>
      <div style="display:flex;gap:0.5rem;margin-bottom:0.5rem;">
        <select id="code-framework" aria-label="Framework">
          <option value="react">React + Tailwind</option>
          <option value="vue">Vue + Tailwind</option>
        </select>
        <button class="btn primary" id="generate-code-btn">Generate</button>
      </div>
      <div id="code-output" class="code-block hidden"></div>
    </div>

    <div style="display:flex;gap:0.5rem;margin-top:1rem;">
      <button class="btn secondary" id="delete-pattern-btn">Delete Pattern</button>
    </div>
  `;

  // Rating stars
  $$('#rating-stars .star').forEach(star => {
    const handler = async () => {
      if (isRating) return;
      isRating = true;
      const rating = parseInt(star.dataset.rating);
      $$('#rating-stars .star').forEach(s => {
        s.classList.toggle('active', parseInt(s.dataset.rating) <= rating);
        s.setAttribute('aria-checked', parseInt(s.dataset.rating) <= rating ? 'true' : 'false');
      });

      try {
        const res = await safeFetch(`${API}/patterns/${pattern.id}/rate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rating }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Rating failed');
        }
        showToast(`Rated ${rating} stars!`);
      } catch (e) {
        showToast(`Failed to rate: ${e.message}`, 'error');
      } finally {
        isRating = false;
      }
    };
    star.addEventListener('click', handler);
    star.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handler();
      }
    });
  });

  // Generate code
  $('#generate-code-btn').addEventListener('click', async () => {
    if (isGenerating) return;
    isGenerating = true;

    const framework = $('#code-framework').value;
    const output = $('#code-output');
    const btn = $('#generate-code-btn');
    output.classList.remove('hidden');
    output.textContent = 'Generating code...';
    btn.disabled = true;
    btn.textContent = 'Generating...';

    try {
      const res = await safeFetch(`${API}/patterns/${pattern.id}/code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ framework, style: 'tailwind' }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Code generation failed');
      }
      const data = await res.json();

      if (data.files && data.files.length > 0) {
        output.textContent = data.files.map(f => `// ${f.path}\n\n${f.content}`).join('\n\n---\n\n');
      } else {
        output.textContent = 'No code generated. Try with a different framework.';
      }
    } catch (e) {
      output.textContent = `Failed to generate code: ${e.message}`;
    } finally {
      isGenerating = false;
      btn.disabled = false;
      btn.textContent = 'Generate';
    }
  });

  // Delete pattern
  $('#delete-pattern-btn').addEventListener('click', async () => {
    if (isDeleting) return;
    if (!confirm('Delete this pattern? This cannot be undone.')) return;
    isDeleting = true;

    const btn = $('#delete-pattern-btn');
    btn.disabled = true;
    btn.textContent = 'Deleting...';

    try {
      const res = await safeFetch(`${API}/patterns/${pattern.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Delete failed');
      }
      closeModal();
      await loadPatterns();
      showToast('Pattern deleted');
    } catch (e) {
      showToast(`Failed to delete: ${e.message}`, 'error');
    } finally {
      isDeleting = false;
      btn.disabled = false;
      btn.textContent = 'Delete Pattern';
    }
  });

  modal.classList.remove('hidden');
  // Focus first element in modal for accessibility
  const firstFocusable = modal.querySelector('h2, button, select, input');
  if (firstFocusable) firstFocusable.focus();
}

async function vectorSearch() {
  const query = $('#vector-search').value.trim();
  if (!query) return;

  const results = $('#vector-results');
  results.innerHTML = '<p style="color:var(--text-muted);">Searching...</p>';

  try {
    const res = await safeFetch(`${API}/search/vectors?q=${encodeURIComponent(query)}`);
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Search failed');
    }
    const data = await res.json();

    if (!data.results || data.results.length === 0) {
      results.innerHTML = '<p style="color:var(--text-muted);">No results found.</p>';
      return;
    }

    results.innerHTML = data.results.map(r => {
      const safeTitle = escapeHtml(r.pattern.title);
      const safeLayout = escapeHtml(String(r.pattern.layout?.type || 'unknown'));
      const safeScore = Number(r.pattern.qualityScore || 0).toFixed(1);
      const similarity = (r.score * 100).toFixed(0);
      return `
        <div class="result-item" data-id="${escapeHtml(r.pattern.id)}" role="button" tabindex="0" aria-label="View pattern: ${safeTitle}">
          <h4>${safeTitle}</h4>
          <p>Similarity: ${similarity}% | ${safeLayout} | Quality: ${safeScore}</p>
        </div>
      `;
    }).join('');

    results.querySelectorAll('.result-item').forEach(item => {
      const handler = () => {
        const pattern = data.results.find(r => r.pattern.id === item.dataset.id)?.pattern;
        if (pattern) showPatternDetail(pattern);
      };
      item.addEventListener('click', handler);
      item.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handler();
        }
      });
    });
  } catch (e) {
    results.innerHTML = `<p style="color:var(--danger);">Search failed: ${escapeHtml(e.message)}</p>`;
  }
}

async function startScout() {
  const query = $('#scout-query').value.trim();
  if (!query) {
    showToast('Enter a search query', 'error');
    return;
  }

  const sources = Array.from($$('.source-select input:checked')).map(cb => cb.value);
  const status = $('#scout-status');
  const results = $('#scout-results');

  status.classList.remove('hidden');
  status.textContent = `Scouting ${sources.length} source(s) for "${query}"...`;
  results.innerHTML = '';

  try {
    const promises = sources.map(async (source) => {
      status.textContent = `Scouting ${source}...`;
      const res = await safeFetch(`${API}/scout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, source }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `${source} failed`);
      }
      return res.json();
    });

    const resultsData = await Promise.allSettled(promises);

    resultsData.forEach((result, i) => {
      const source = sources[i];
      if (result.status === 'fulfilled') {
        const data = result.value;
        const safeSource = escapeHtml(source);
        const errors = (data.errors || []).map(e => escapeHtml(String(e))).join(', ');
        results.innerHTML += `
          <div class="result-item">
            <h4>${safeSource}: ${data.found || 0} patterns found</h4>
            ${errors ? `<p style="color:var(--warning);">${errors}</p>` : ''}
          </div>
        `;
      } else {
        results.innerHTML += `
          <div class="result-item">
            <h4>${escapeHtml(source)}: Failed</h4>
            <p style="color:var(--danger);">${escapeHtml(result.reason?.message || 'Unknown error')}</p>
          </div>
        `;
      }
    });

    status.textContent = 'Scouting complete! Refreshing patterns...';
    await loadPatterns();
    status.textContent = `Scouting complete! Check the Browse tab for new patterns.`;
  } catch (e) {
    status.textContent = `Scouting failed: ${e.message}`;
    status.style.borderLeftColor = 'var(--danger)';
  }
}

async function loadStats() {
  const content = $('#stats-content');
  content.innerHTML = '<p style="color:var(--text-muted);">Loading...</p>';

  try {
    const res = await safeFetch(`${API}/stats`);
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to load stats');
    }
    const data = await res.json();

    const lib = data.library || {};
    const sona = data.sona || {};

    const safeTopLayout = escapeHtml(String(lib.topLayouts?.[0]?.type || 'N/A'));
    const safeTopLayoutCount = Number(lib.topLayouts?.[0]?.count || 0);

    content.innerHTML = `
      <div class="stat-card">
        <h3>Total Patterns</h3>
        <div class="value">${Number(lib.totalPatterns || 0)}</div>
      </div>
      <div class="stat-card">
        <h3>Average Quality</h3>
        <div class="value">${Number(lib.averageQuality || 0).toFixed(1)}</div>
        <div class="sub">out of 10</div>
      </div>
      <div class="stat-card">
        <h3>Total Feedback</h3>
        <div class="value">${Number(lib.totalFeedback || 0)}</div>
      </div>
      <div class="stat-card">
        <h3>SONA Learned</h3>
        <div class="value">${Number(sona.learnedPatterns || 0)}</div>
        <div class="sub">pattern associations</div>
      </div>
      <div class="stat-card">
        <h3>Sources Tracked</h3>
        <div class="value">${Number(sona.sourcesTracked || 0)}</div>
      </div>
      <div class="stat-card">
        <h3>Top Layout</h3>
        <div class="value" style="font-size:1.25rem;">${safeTopLayout}</div>
        <div class="sub">${safeTopLayoutCount} patterns</div>
      </div>
    `;
  } catch (e) {
    content.innerHTML = `<p style="color:var(--danger);">Failed to load stats: ${escapeHtml(e.message)}</p>`;
  }
}

// ============================================================
// Utilities
// ============================================================

/** Escape HTML to prevent XSS — the ONLY safe way to insert dynamic content */
function escapeHtml(text) {
  if (text == null) return '';
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
}

/** Safe fetch wrapper with HTTP status validation */
async function safeFetch(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}: ${res.statusText}`);
    err.status = res.status;
    try {
      const body = await res.json();
      err.message = body.error || err.message;
    } catch {
      // Response not JSON
    }
    throw err;
  }
  return res;
}

/** Show a toast notification */
function showToast(message, type = 'success') {
  const existing = document.querySelector('.toast-notification');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `toast-notification toast-${type}`;
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed; bottom: 20px; right: 20px; padding: 12px 20px;
    border-radius: 8px; color: #fff; font-size: 0.9rem; z-index: 10000;
    background: ${type === 'error' ? 'var(--danger)' : 'var(--success, #22c55e)'};
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    animation: toastIn 0.3s ease;
  `;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

/** Show inline error message */
function showError(elementId, message) {
  let el = document.getElementById(elementId);
  if (!el) {
    el = document.createElement('div');
    el.id = elementId;
    el.className = 'error-message';
    el.style.cssText = 'color:var(--danger);padding:1rem;text-align:center;';
    $('#patterns-grid').parentNode.insertBefore(el, $('#patterns-grid'));
  }
  el.textContent = message;
  el.classList.remove('hidden');
}

/** Hide inline error message */
function hideError(elementId) {
  const el = document.getElementById(elementId);
  if (el) el.classList.add('hidden');
}

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
