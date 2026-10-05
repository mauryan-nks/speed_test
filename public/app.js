const $ = (id) => document.getElementById(id);

const CF_BASE = 'https://speed.cloudflare.com';
let running = false;
let timer = null;
let startedAt = 0;

const fmt = (n, digits = 1) => Number.isFinite(n) ? n.toFixed(digits) : '—';
const nowTag = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

function setStatus(text, kind = '') {
  $('status').textContent = text;
  $('status').dataset.kind = kind;
}

function setGauge(mbps) {
  const max = 1000;
  const pct = Math.max(0, Math.min(1, (mbps || 0) / max));
  $('needle').style.transform = `rotate(${-120 + pct * 240}deg)`;
}

function resetResult() {
  ['download', 'upload', 'latency', 'jitter'].forEach((id) => $(id).textContent = '—');
  $('duration').textContent = '—';
  $('elapsed').textContent = '0s';
  setGauge(0);
}

function startElapsed() {
  startedAt = performance.now();
  clearInterval(timer);
  timer = setInterval(() => {
    $('elapsed').textContent = `${Math.floor((performance.now() - startedAt) / 1000)}s`;
  }, 250);
}

function stopElapsed() {
  clearInterval(timer);
  timer = null;
}

async function measureLatency(samples = 8) {
  const values = [];
  for (let i = 0; i < samples; i++) {
    const start = performance.now();
    const res = await fetch(`${CF_BASE}/__down?bytes=0&t=${nowTag()}`, {
      cache: 'no-store',
      mode: 'cors'
    });
    if (!res.ok) throw new Error(`Latency request failed (${res.status})`);
    await res.arrayBuffer();
    values.push(performance.now() - start);
    await new Promise((resolve) => setTimeout(resolve, 80));
  }

  const sorted = [...values].sort((a, b) => a - b);
  const latency = sorted[Math.floor(sorted.length / 2)];
  const diffs = [];
  for (let i = 1; i < values.length; i++) diffs.push(Math.abs(values[i] - values[i - 1]));
  const jitter = diffs.length ? diffs.reduce((a, b) => a + b, 0) / diffs.length : 0;
  return { latency, jitter };
}

async function downloadOnce(bytes) {
  const start = performance.now();
  const res = await fetch(`${CF_BASE}/__down?bytes=${bytes}&t=${nowTag()}`, {
    cache: 'no-store',
    mode: 'cors'
  });
  if (!res.ok) throw new Error(`Download request failed (${res.status})`);
  const data = await res.arrayBuffer();
  const seconds = (performance.now() - start) / 1000;
  return (data.byteLength * 8) / seconds / 1_000_000;
}

async function measureDownload() {
  const sizes = [1_000_000, 5_000_000, 10_000_000, 25_000_000];
  const results = [];

  for (const bytes of sizes) {
    const mbps = await downloadOnce(bytes);
    results.push(mbps);
    $('download').textContent = fmt(mbps);
    setGauge(mbps);
  }

  const usable = results.slice(-3);
  return usable.reduce((a, b) => a + b, 0) / usable.length;
}

function randomBlob(size) {
  // Zero-filled bytes are sufficient for transfer-speed measurement and avoid expensive RNG work.
  return new Blob([new Uint8Array(size)], { type: 'application/octet-stream' });
}

async function uploadOnce(bytes) {
  const body = randomBlob(bytes);
  const start = performance.now();
  const res = await fetch(`${CF_BASE}/__up?t=${nowTag()}`, {
    method: 'POST',
    body,
    cache: 'no-store',
    mode: 'cors'
  });
  if (!res.ok) throw new Error(`Upload request failed (${res.status})`);
  await res.text();
  const seconds = (performance.now() - start) / 1000;
  return (bytes * 8) / seconds / 1_000_000;
}

async function measureUpload() {
  const sizes = [500_000, 2_000_000, 5_000_000, 10_000_000];
  const results = [];

  for (const bytes of sizes) {
    const mbps = await uploadOnce(bytes);
    results.push(mbps);
    $('upload').textContent = fmt(mbps);
  }

  const usable = results.slice(-3);
  return usable.reduce((a, b) => a + b, 0) / usable.length;
}

async function loadMeta() {
  try {
    const res = await fetch(`${CF_BASE}/meta?t=${nowTag()}`, { cache: 'no-store', mode: 'cors' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const meta = await res.json();
    $('ip').textContent = meta.clientIp || '—';
    $('isp').textContent = meta.asOrganization || '—';
    $('pop').textContent = meta.colo || '—';
    $('location').textContent = [meta.city, meta.region, meta.country].filter(Boolean).join(', ') || '—';
  } catch (err) {
    console.warn('Cloudflare metadata unavailable:', err);
    $('ip').textContent = 'Unavailable';
    $('isp').textContent = 'Unavailable';
    $('pop').textContent = '—';
    $('location').textContent = '—';
  }
}

async function startTest() {
  if (running) return;
  running = true;
  resetResult();
  startElapsed();
  $('start').disabled = true;
  $('start').textContent = 'Testing…';

  try {
    setStatus('Measuring latency…', 'running');
    const { latency, jitter } = await measureLatency();
    $('latency').textContent = fmt(latency);
    $('jitter').textContent = fmt(jitter);

    setStatus('Measuring download…', 'running');
    const download = await measureDownload();
    $('download').textContent = fmt(download);
    setGauge(download);

    setStatus('Measuring upload…', 'running');
    const upload = await measureUpload();
    $('upload').textContent = fmt(upload);

    const total = (performance.now() - startedAt) / 1000;
    $('duration').textContent = `${total.toFixed(1)}s`;
    setStatus('Test complete', 'done');
    $('start').textContent = 'Test Again';
  } catch (err) {
    console.error(err);
    setStatus(`Test failed: ${err.message || err}`, 'error');
    $('start').textContent = 'Try Again';
  } finally {
    running = false;
    stopElapsed();
    $('start').disabled = false;
  }
}

$('start').addEventListener('click', startTest);
loadMeta();
