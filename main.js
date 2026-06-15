/* ══ GenomeHub landing — live data (vanilla) ══ */
(() => {
  'use strict';

  // ── network endpoints ────────────────────────────────────────────────
  // Content is served from the Cloudflare R2 backbone (the origin node is retired);
  // the box keeps only the P2P tracker on :9000.
  const ORIGIN     = 'https://pub-0d606518eb99438ea971b92f0721f593.r2.dev';
  const TRACKER    = 'https://genomehub.duckdns.org:9000';
  const VERIFY_KEY = 'f6208cf8aceecaab4bda26f254e714f646e22b5a3209070f08701f756df31d29';
  // Fetched same-origin via the Netlify /r2 proxy to dodge r2.dev's missing CORS.
  const REGISTRY_URL = '/r2/registry.json';
  const NODES_URL    = TRACKER + '/nodes';

  // ── bind helpers ─────────────────────────────────────────────────────
  const binds = {};
  document.querySelectorAll('[data-bind]').forEach(el => {
    const k = el.getAttribute('data-bind');
    (binds[k] ||= []).push(el);
  });
  const set = (k, v) => (binds[k] || []).forEach(el => { el.textContent = v; });

  const p2 = n => String(n).padStart(2, '0');
  const fmtT = d => `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
  const tickClock = () => {
    const now = new Date();
    set('clock', fmtT(now));
    set('prevSec', fmtT(new Date(now - 1000)));
    set('prev2Sec', fmtT(new Date(now - 2000)));
  };

  const humanBytes = n => {
    if (!n) return '0 B';
    const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0, v = n;
    while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
    return v.toFixed(v < 10 && i > 0 ? 1 : 0) + ' ' + u[i];
  };

  const dlCmd = a =>
    `genomehub download --server ${ORIGIN} --tracker ${TRACKER} --assembly ${a} --output ${a}.fa --verify-key ${VERIFY_KEY}`;

  // ── DNA decoration ───────────────────────────────────────────────────
  const seqEl = document.getElementById('hero-seq');
  if (seqEl) {
    seqEl.textContent =
      'ATGCGATCGTACGATCGATCGATCGCTAGCTAGCATGCATGCATGCGATCGATCGCGATCGTACGAT'.repeat(12);
  }

  // ── live: genomes from the registry ──────────────────────────────────
  const PAGE = 9; // 3×3 grid per page
  let allGenomes = [];
  let query = '';
  let limit = PAGE;

  function makeCard(g) {
    const cmd = dlCmd(g.assembly);
    const card = document.createElement('div');
    card.className = 'genome-card';
    card.innerHTML =
      `<div class="gc-top"><span class="gc-asm"></span><span class="gc-ver">v${g.version || 1}</span></div>
       <div class="gc-org"></div>
       <div class="gc-meta"><span>${(g.segments || 0).toLocaleString()} segments</span><span>${humanBytes(g.bases || 0)}</span><span>${g.kind || 'manifest'}</span></div>
       <div class="gc-cmd"><code></code><button class="gc-copy">copy</button></div>`;
    card.querySelector('.gc-asm').textContent = g.assembly;
    card.querySelector('.gc-org').textContent = g.organism || '';
    card.querySelector('.gc-cmd code').textContent = cmd;
    const btn = card.querySelector('.gc-copy');
    btn.addEventListener('click', () => {
      navigator.clipboard.writeText(cmd).then(() => {
        btn.textContent = 'copied';
        setTimeout(() => { btn.textContent = 'copy'; }, 1200);
      });
    });
    return card;
  }

  function renderGenomes() {
    const host = document.getElementById('genomes-list');
    const more = document.getElementById('genomes-more');
    const countEl = document.getElementById('genomes-count');
    if (!host) return;
    const q = query.trim().toLowerCase();
    const matches = allGenomes.filter(g =>
      !q || (g.assembly + ' ' + (g.organism || '')).toLowerCase().includes(q));
    if (countEl) countEl.textContent = q ? `${matches.length} of ${allGenomes.length}` : `${allGenomes.length} genomes`;
    if (more) more.innerHTML = '';
    if (!allGenomes.length) { host.innerHTML = '<div class="genomes-loading">No genomes published yet.</div>'; return; }
    if (!matches.length) { host.innerHTML = '<div class="genomes-loading">No matches.</div>'; return; }
    host.innerHTML = '';
    matches.slice(0, limit).forEach(g => host.appendChild(makeCard(g)));
    if (matches.length > limit && more) {
      more.innerHTML = '<button>Show more</button>';
      more.querySelector('button').onclick = () => { limit += PAGE; renderGenomes(); };
    }
  }

  async function loadGenomes() {
    const host = document.getElementById('genomes-list');
    try {
      const res = await fetch(REGISTRY_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error('status ' + res.status);
      allGenomes = await res.json();
      allGenomes.sort((a, b) => (a.organism || a.assembly).localeCompare(b.organism || b.assembly));
      set('assemblyCount', allGenomes.length);
      set('dataAvail', humanBytes(allGenomes.reduce((s, g) => s + (g.bases || 0), 0)));
      set('netStatus', 'online');
      renderGenomes();
      renderTicker();
    } catch (e) {
      set('netStatus', 'offline');
      const ticker = document.getElementById('ticker');
      if (ticker) ticker.querySelectorAll('span').forEach(s => { s.textContent = 'Registry offline · '; });
      if (host) {
        host.innerHTML =
          `<div class="genomes-error">Couldn't reach the registry. The origin may be offline — try again shortly.</div>`;
      }
    }
  }

  // ── live: scrolling ticker of available assemblies ───────────────────
  function renderTicker() {
    const ticker = document.getElementById('ticker');
    if (!ticker) return;
    const names = allGenomes.map(g => g.assembly).filter(Boolean);
    const text = names.length
      ? names.join(' · ') + ' · '
      : 'No genomes published yet · ';
    // two identical spans = seamless scroll loop
    ticker.innerHTML = '';
    for (let i = 0; i < 2; i++) {
      const span = document.createElement('span');
      span.textContent = text;
      ticker.appendChild(span);
    }
  }

  const searchEl = document.getElementById('genomes-search');
  if (searchEl) {
    searchEl.addEventListener('input', () => { query = searchEl.value; limit = PAGE; renderGenomes(); });
  }

  // ── live: node count from the tracker ────────────────────────────────
  async function loadNodes() {
    try {
      const res = await fetch(NODES_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error();
      const nodes = await res.json();
      const online = nodes.filter(n => n.online).length;
      set('nodeCount', online);
      set('swOnline', online);
      set('swOffline', nodes.length - online);
      set('swFull', online);
      buildNetwork(nodes);
    } catch (e) {
      set('nodeCount', '0');
      set('swOnline', '0');
      buildNetwork([]);
    }
  }

  // ── network illustration (abstract; sized by real online count) ──────
  function buildNetwork(nodes) {
    const hostEl = document.getElementById('network-graph');
    if (!hostEl) return;
    hostEl.innerHTML = '';
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '300');
    svg.setAttribute('viewBox', '0 0 900 300');
    svg.style.display = 'block';
    svg.style.background = '#0b0f16';

    const count = Math.max(1, (nodes || []).filter(n => n.online).length);
    const pts = [];
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2;
      pts.push([450 + Math.cos(ang) * 230, 150 + Math.sin(ang) * 110]);
    }
    // edges: ring + spokes to center
    const center = [450, 150];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      [[a, b], [a, center]].forEach(([p, q]) => {
        const line = document.createElementNS(NS, 'line');
        line.setAttribute('x1', p[0]); line.setAttribute('y1', p[1]);
        line.setAttribute('x2', q[0]); line.setAttribute('y2', q[1]);
        line.setAttribute('stroke', '#1e3448');
        line.setAttribute('stroke-width', '0.7');
        line.setAttribute('opacity', '0.6');
        svg.appendChild(line);
      });
    }
    const drawDot = (x, y, r, c) => {
      const dot = document.createElementNS(NS, 'circle');
      dot.setAttribute('cx', x); dot.setAttribute('cy', y);
      dot.setAttribute('r', r); dot.setAttribute('fill', c);
      svg.appendChild(dot);
    };
    drawDot(center[0], center[1], 6, '#3fc7e0'); // origin
    pts.forEach(([x, y]) => drawDot(x, y, 4.5, '#1ed183'));

    const label = document.createElementNS(NS, 'text');
    label.setAttribute('x', '860'); label.setAttribute('y', '290');
    label.setAttribute('fill', '#5c86a0'); label.setAttribute('font-size', '10');
    label.setAttribute('font-family', 'monospace'); label.setAttribute('text-anchor', 'end');
    label.textContent = `${count} online`;
    svg.appendChild(label);
    hostEl.appendChild(svg);
  }

  // ── boot ─────────────────────────────────────────────────────────────
  tickClock();
  setInterval(tickClock, 1000);
  loadGenomes();
  loadNodes();
  setInterval(() => { loadGenomes(); loadNodes(); }, 30000);
})();
