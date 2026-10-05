import SpeedTest from '@cloudflare/speedtest';

const $ = (id) => document.getElementById(id);
const state = {
  running: false,
  test: null,
  raf: null,
  startedAt: 0
};

const fmtMbps = (bps) => Number.isFinite(bps) ? (bps / 1_000_000).toFixed(1) : '—';
const fmtMs = (ms) => Number.isFinite(ms) ? ms.toFixed(1) : '—';

function setStatus(text, kind = '') {
  $('status').textContent = text;
  $('status').dataset.kind = kind;
}

function gauge(value) {
  const max = 1000;
  const pct = Math.max(0, Math.min(1, (value || 0) / max));
  $('needle').style.transform = `rotate(${(-120 + pct * 240)}deg)`;
}

function drawProgress() {
  if (!state.running || !state.test) return;
  const r = state.test.results;
  const down = r?.getDownloadBandwidth?.();
  const up = r?.getUploadBandwidth?.();
  const latency = r?.getUnloadedLatency?.();
  const jitter = r?.getUnloadedJitter?.();

  if (Number.isFinite(down)) {
    $('download').textContent = fmtMbps(down);
    gauge(down / 1_000_000);
  }
  if (Number.isFinite(up)) $('upload').textContent = fmtMbps(up);
  if (Number.isFinite(latency)) $('latency').textContent = fmtMs(latency);
  if (Number.isFinite(jitter)) $('jitter').textContent = fmtMs(jitter);

  const sec = Math.floor((performance.now() - state.startedAt) / 1000);
  $('elapsed').textContent = `${sec}s`;
  state.raf = requestAnimationFrame(drawProgress);
}

async function loadMeta() {
  try {
    const res = await fetch('https://speed.cloudflare.com/meta', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const meta = await res.json();
    $('ip').textContent = meta.clientIp || '—';
    $('isp').textContent = meta.asOrganization || '—';
    $('pop').textContent = meta.colo || '—';
    $('location').textContent = [meta.city, meta.region, meta.country].filter(Boolean).join(', ') || '—';
  } catch {
    $('ip').textContent = 'Unavailable';
    $('isp').textContent = 'Unavailable';
    $('pop').textContent = '—';
    $('location').textContent = '—';
  }
}

function resetResult() {
  for (const id of ['download', 'upload', 'latency', 'jitter']) $(id).textContent = '—';
  $('elapsed').textContent = '0s';
  $('duration').textContent = '—';
  gauge(0);
}

function startTest() {
  if (state.running) return;

  resetResult();
  state.running = true;
  state.startedAt = performance.now();
  $('start').disabled = true;
  $('start').textContent = 'Testing…';
  setStatus('Connecting to Cloudflare edge…', 'running');

  const test = new SpeedTest({
    autoStart: false,
    measureDownloadLoadedLatency: true,
    measureUploadLoadedLatency: true
  });

  state.test = test;

  test.onRunningChange = (running) => {
    if (running) setStatus('Measuring your connection…', 'running');
  };

  test.onFinish = (results) => {
    state.running = false;
    cancelAnimationFrame(state.raf);

    $('download').textContent = fmtMbps(results.getDownloadBandwidth());
    $('upload').textContent = fmtMbps(results.getUploadBandwidth());
    $('latency').textContent = fmtMs(results.getUnloadedLatency());
    $('jitter').textContent = fmtMs(results.getUnloadedJitter());
    $('duration').textContent = `${(results.getTotalDurationMs() / 1000).toFixed(1)}s`;

    const down = results.getDownloadBandwidth();
    gauge(Number.isFinite(down) ? down / 1_000_000 : 0);

    $('start').disabled = false;
    $('start').textContent = 'Test Again';
    setStatus('Test complete', 'done');
  };

  test.onError = (error) => {
    state.running = false;
    cancelAnimationFrame(state.raf);
    $('start').disabled = false;
    $('start').textContent = 'Try Again';
    setStatus(`Test failed: ${error?.message || error}`, 'error');
  };

  test.play();
  drawProgress();
}

$('start').addEventListener('click', startTest);
loadMeta();
