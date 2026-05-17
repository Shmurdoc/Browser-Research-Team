// Design Pattern Multiverse - Web UI Client

const API = '/api';

// State
let allPatterns = [];
let currentPattern = null;

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
$('.modal-close').addEventListener('click', () => $('#pattern-modal').classList.add('hidden'));
$('#pattern-modal').addEventListener('click', (e) => {
  if (e.target === $('#pattern-modal')) $('#pattern-modal').classList.add('hidden');
});

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
  $('#loading').classList.remove('hidden');
  $('#patterns-grid').innerHTML = '';
  $('#empty-state').classList.add('hidden');

  try {
    const res = await fetch(`${API}/patterns/all`);
    const data = await res.json();
    allPatterns = data.patterns || [];
    renderPatterns(allPatterns);
  } catch (e) {
    console.error('Failed to load patterns:', e);
  } finally {
    $('#loading').classList.add('hidden');
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
    card.innerHTML = `
      <h3>${escapeHtml(p.title)}</h3>
      <div class="meta">
        <span class="badge source">${p.source}</span>
        <span class="badge">${p.layout.type}</span>
      </div>
      <p style="font-size:0.85rem;color:var(--text-muted);margin-bottom:0.5rem;">
        ${p.components.slice(0, 4).join(', ')}${p.components.length > 4 ? '...' : ''}
      </p>
      <div class="quality-score">
        Quality: <span class="score">${p.qualityScore.toFixed(1)}</span>/10
      </div>
    `;
    card.addEventListener('click', () => showPatternDetail(p));
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
      p.title.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.tags.some(t => t.toLowerCase().includes(q))
    );
  }

  if (source) filtered = filtered.filter(p => p.source === source);
  if (layout) filtered = filtered.filter(p => p.layout.type === layout);

  renderPatterns(filtered);
}

async function showPatternDetail(pattern) {
  currentPattern = pattern;
  const modal = $('#pattern-modal');
  const body = $('#modal-body');

  body.innerHTML = `
    <h2>${escapeHtml(pattern.title)}</h2>
    <p style="color:var(--text-muted);margin-bottom:1rem;">${escapeHtml(pattern.description)}</p>

    <div class="detail-section">
      <h3>Layout</h3>
      <p>Type: <strong>${pattern.layout.type}</strong></p>
      <p>Zones: ${(pattern.layout.zones || []).join(', ') || 'None detected'}</p>
    </div>

    <div class="detail-section">
      <h3>Colors</h3>
      <div class="color-swatches">
        ${Object.entries(pattern.colors || {}).filter(([k]) => k !== 'additional').map(([name, color]) => `
          <div class="color-swatch" style="background:${color}" data-color="${name}: ${color}" title="${name}: ${color}"></div>
        `).join('')}
      </div>
    </div>

    <div class="detail-section">
      <h3>Components</h3>
      <div class="components-list">
        ${(pattern.components || []).map(c => `<span class="badge">${c}</span>`).join('')}
      </div>
    </div>

    <div class="detail-section">
      <h3>Typography</h3>
      <p>Heading: ${pattern.typography?.heading?.family || 'N/A'} (${pattern.typography?.heading?.weight || ''} ${pattern.typography?.heading?.size || ''})</p>
      <p>Body: ${pattern.typography?.body?.family || 'N/A'} (${pattern.typography?.body?.weight || ''} ${pattern.typography?.body?.size || ''})</p>
    </div>

    <div class="detail-section">
      <h3>Rate this pattern</h3>
      <div class="rating-stars" id="rating-stars">
        ${[1,2,3,4,5].map(i => `<span class="star" data-rating="${i}">&#9733;</span>`).join('')}
      </div>
      <p style="font-size:0.85rem;color:var(--text-muted);margin-top:0.5rem;">Click to rate 1-5 stars</p>
    </div>

    <div class="detail-section">
      <h3>Generate Code</h3>
      <div style="display:flex;gap:0.5rem;margin-bottom:0.5rem;">
        <select id="code-framework">
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
    star.addEventListener('click', async () => {
      const rating = parseInt(star.dataset.rating);
      $$('#rating-stars .star').forEach(s => {
        s.classList.toggle('active', parseInt(s.dataset.rating) <= rating);
      });

      try {
        await fetch(`${API}/patterns/${pattern.id}/rate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rating }),
        });
        alert(`Rated ${rating} stars!`);
      } catch (e) {
        alert('Failed to rate pattern');
      }
    });
  });

  // Generate code
  $('#generate-code-btn').addEventListener('click', async () => {
    const framework = $('#code-framework').value;
    const output = $('#code-output');
    output.classList.remove('hidden');
    output.textContent = 'Generating code...';

    try {
      const res = await fetch(`${API}/patterns/${pattern.id}/code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ framework, style: 'tailwind' }),
      });
      const data = await res.json();

      if (data.files && data.files.length > 0) {
        output.textContent = data.files.map(f => `// ${f.path}\n\n${f.content}`).join('\n\n---\n\n');
      } else {
        output.textContent = 'No code generated. Try with a different framework.';
      }
    } catch (e) {
      output.textContent = 'Failed to generate code.';
    }
  });

  // Delete pattern
  $('#delete-pattern-btn').addEventListener('click', async () => {
    if (!confirm('Delete this pattern?')) return;

    try {
      await fetch(`${API}/patterns/${pattern.id}`, { method: 'DELETE' });
      modal.classList.add('hidden');
      loadPatterns();
    } catch (e) {
      alert('Failed to delete pattern');
    }
  });

  modal.classList.remove('hidden');
}

async function vectorSearch() {
  const query = $('#vector-search').value.trim();
  if (!query) return;

  const results = $('#vector-results');
  results.innerHTML = '<p style="color:var(--text-muted);">Searching...</p>';

  try {
    const res = await fetch(`${API}/search/vectors?q=${encodeURIComponent(query)}`);
    const data = await res.json();

    if (!data.results || data.results.length === 0) {
      results.innerHTML = '<p style="color:var(--text-muted);">No results found.</p>';
      return;
    }

    results.innerHTML = data.results.map(r => `
      <div class="result-item" data-id="${r.pattern.id}">
        <h4>${escapeHtml(r.pattern.title)}</h4>
        <p>Similarity: ${(r.score * 100).toFixed(0)}% | ${r.pattern.layout.type} | Quality: ${r.pattern.qualityScore.toFixed(1)}</p>
      </div>
    `).join('');

    results.querySelectorAll('.result-item').forEach(item => {
      item.addEventListener('click', () => {
        const pattern = data.results.find(r => r.pattern.id === item.dataset.id)?.pattern;
        if (pattern) showPatternDetail(pattern);
      });
    });
  } catch (e) {
    results.innerHTML = '<p style="color:var(--danger);">Search failed.</p>';
  }
}

async function startScout() {
  const query = $('#scout-query').value.trim();
  if (!query) {
    alert('Enter a search query');
    return;
  }

  const sources = Array.from($$('.source-select input:checked')).map(cb => cb.value);
  const status = $('#scout-status');
  const results = $('#scout-results');

  status.classList.remove('hidden');
  status.textContent = `Scouting ${sources.length} source(s) for "${query}"...`;
  results.innerHTML = '';

  try {
    // Scout each source
    for (const source of sources) {
      status.textContent = `Scouting ${source}...`;

      const res = await fetch(`${API}/scout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, source }),
      });

      const data = await res.json();
      results.innerHTML += `
        <div class="result-item">
          <h4>${source}: ${data.found} patterns found</h4>
          ${data.errors.length > 0 ? `<p style="color:var(--warning);">${data.errors.join(', ')}</p>` : ''}
        </div>
      `;
    }

    status.textContent = 'Scouting complete! Refreshing patterns...';
    await loadPatterns();
    status.textContent = `Scouting complete! Check the Browse tab for new patterns.`;
  } catch (e) {
    status.textContent = 'Scouting failed.';
    status.style.borderLeftColor = 'var(--danger)';
  }
}

async function loadStats() {
  const content = $('#stats-content');
  content.innerHTML = '<p style="color:var(--text-muted);">Loading...</p>';

  try {
    const res = await fetch(`${API}/stats`);
    const data = await res.json();

    const lib = data.library || {};
    const sona = data.sona || {};

    content.innerHTML = `
      <div class="stat-card">
        <h3>Total Patterns</h3>
        <div class="value">${lib.totalPatterns || 0}</div>
      </div>
      <div class="stat-card">
        <h3>Average Quality</h3>
        <div class="value">${(lib.averageQuality || 0).toFixed(1)}</div>
        <div class="sub">out of 10</div>
      </div>
      <div class="stat-card">
        <h3>Total Feedback</h3>
        <div class="value">${lib.totalFeedback || 0}</div>
      </div>
      <div class="stat-card">
        <h3>SONA Learned</h3>
        <div class="value">${sona.learnedPatterns || 0}</div>
        <div class="sub">pattern associations</div>
      </div>
      <div class="stat-card">
        <h3>Sources Tracked</h3>
        <div class="value">${sona.sourcesTracked || 0}</div>
      </div>
      <div class="stat-card">
        <h3>Top Layout</h3>
        <div class="value" style="font-size:1.25rem;">${(lib.topLayouts?.[0]?.type || 'N/A')}</div>
        <div class="sub">${lib.topLayouts?.[0]?.count || 0} patterns</div>
      </div>
    `;
  } catch (e) {
    content.innerHTML = '<p style="color:var(--danger);">Failed to load stats.</p>';
  }
}

// Utilities
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
