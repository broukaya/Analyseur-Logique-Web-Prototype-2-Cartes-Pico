'use strict';

// ── Socket ────────────────────────────────────────────────────────────────────
const socket = io();

// connection dot — must be wired up immediately, before any other code runs,
// otherwise a fast localhost connect fires before the listener exists.
const connDot = document.getElementById('conn-dot');
function setConnDot(state) { connDot.className = 'conn-dot ' + state; }
setConnDot(socket.connected ? 'connected' : 'disconnected');
socket.on('connect',    () => setConnDot('connected'));
socket.on('disconnect', () => setConnDot('disconnected'));

// ── Tab switching ─────────────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// LOG ENGINE  (plain-div log — fully selectable & copyable)
// ══════════════════════════════════════════════════════════════════════════════
function createLogger(containerId) {
  const el        = document.getElementById(containerId);
  let   lineCount = 0;
  let   autoScroll= true;
  let   rawLines  = [];

  // pause auto-scroll when user scrolls up
  el.addEventListener('scroll', () => {
    autoScroll = el.scrollTop + el.clientHeight >= el.scrollHeight - 8;
  });

  function classify(msg) {
    if (msg.includes('[SUCCÈS]'))                       return 't-success';
    if (msg.includes('[ERREUR]'))                       return 't-error';
    if (msg.includes('[BUILD ERR]'))                    return 't-warn';
    if (msg.includes('[BUILD]'))                        return 't-build';
    if (msg.includes('[INFO]') || msg.includes('[VLAB]')) return 't-info';
    if (msg.includes('[DEBUG]'))                        return 't-debug';
    if (msg.includes('[SIGROK]') || msg.includes('[ANALYSER]')) return 't-sigrok';
    return 't-build';
  }

  function now() {
    return new Date().toLocaleTimeString('fr-FR', { hour12: false });
  }

  function append(msg) {
    rawLines.push(msg);
    lineCount++;

    const row  = document.createElement('div');
    row.className = 'log-line ' + classify(msg);

    const ts   = document.createElement('span');
    ts.className = 'log-ts';
    ts.textContent = now();

    const txt  = document.createElement('span');
    txt.className = 'log-text';
    txt.textContent = msg;

    row.appendChild(ts);
    row.appendChild(txt);
    el.appendChild(row);

    if (autoScroll) el.scrollTop = el.scrollHeight;
    return lineCount;
  }

  function clear() {
    el.innerHTML = '';
    lineCount = 0;
    rawLines  = [];
  }

  function getRaw() { return rawLines.join('\n'); }

  function forceScroll() {
    autoScroll = true;
    el.scrollTop = el.scrollHeight;
  }

  return { append, clear, getRaw, forceScroll, get count() { return lineCount; } };
}

// ══════════════════════════════════════════════════════════════════════════════
// EDITOR TAB
// ══════════════════════════════════════════════════════════════════════════════
const log         = createLogger('log-container');
const stepCounter = document.getElementById('step-counter');
const lineCountEl = document.getElementById('line-count');
const statusBar   = document.getElementById('status-bar');
const statusText  = document.getElementById('status-text');
const compileBtn  = document.getElementById('compile-btn');
const targetSelect= document.getElementById('target-select');

// status bar helper
function setStatus(state, text) {
  statusBar.className = 'status-bar status-' + state;
  statusText.textContent = text;
}

// step counter parser — reads "[X/1087]" from BUILD lines
function tryParseStep(msg) {
  const m = msg.match(/\[(\d+)\/(\d+)\]/);
  if (m) stepCounter.textContent = m[1] + ' / ' + m[2];
}

// toolbar buttons
document.getElementById('clear-btn').addEventListener('click', () => {
  log.clear();
  stepCounter.textContent = '';
  lineCountEl.textContent = '';
  setStatus('idle', 'Prêt');
});

document.getElementById('copy-btn').addEventListener('click', () => {
  navigator.clipboard.writeText(log.getRaw()).then(() => {
    const btn = document.getElementById('copy-btn');
    btn.textContent = '✓';
    setTimeout(() => btn.textContent = '⎘', 1500);
  });
});

const scrollLockBtn = document.getElementById('scroll-lock-btn');
scrollLockBtn.addEventListener('click', () => {
  scrollLockBtn.classList.toggle('btn-icon-active');
  log.forceScroll();
});

// ── Examples per target ───────────────────────────────────────────────────────
const EXAMPLES = {
  esp32: `#include <stdio.h>
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

static const char *TAG = "MAIN";

extern "C" void app_main(void) {
    printf("Hello from VLAB!\\n");
    ESP_LOGI(TAG, "ESP32 ready");

    int counter = 0;
    while (1) {
        printf("count: %d\\n", counter++);
        vTaskDelay(pdMS_TO_TICKS(1000));
    }
}`,
  stm32: `#include <stdint.h>

int main(void) {
    volatile uint32_t counter = 0;
    while (1) { counter++; }
    return 0;
}`,
};

targetSelect.addEventListener('change', () => {
  if (window._editor) window._editor.setValue(EXAMPLES[targetSelect.value]);
  log.append('[VLAB] Cible : ' + targetSelect.value.toUpperCase());
  lineCountEl.textContent = log.count + ' lignes';
});

// ── Monaco ────────────────────────────────────────────────────────────────────
require(['vs/editor/editor.main'], () => {
  window._editor = monaco.editor.create(document.getElementById('editor-container'), {
    value:    EXAMPLES.esp32,
    language: 'cpp',
    theme:    'vs-dark',
    fontSize:  14,
    fontFamily:'JetBrains Mono, Consolas, monospace',
    minimap:  { enabled: false },
    automaticLayout: true,
    scrollBeyondLastLine: false,
    lineNumbersMinChars: 3,
  });
});

// ── Compile ───────────────────────────────────────────────────────────────────
compileBtn.addEventListener('click', () => {
  if (!window._editor) return;
  log.clear();
  stepCounter.textContent = '';
  setStatus('running', 'Compilation en cours…');
  compileBtn.disabled = true;
  compileBtn.textContent = '⏳ En cours…';
  socket.emit('code-submit', { code: window._editor.getValue(), target: targetSelect.value });
});

socket.on('log', msg => {
  const n = log.append(msg);
  lineCountEl.textContent = n + ' lignes';
  tryParseStep(msg);
});

socket.on('compile-done', ({ success }) => {
  compileBtn.disabled = false;
  compileBtn.textContent = '▶ Compiler';
  if (success) {
    setStatus('success', 'Build réussi');
    log.append('[VLAB] ✓ Compilation terminée avec succès.');
  } else {
    setStatus('error', 'Build échoué');
    log.append('[VLAB] ✗ Compilation échouée — voir les erreurs ci-dessus.');
  }
  lineCountEl.textContent = log.count + ' lignes';
});

// ══════════════════════════════════════════════════════════════════════════════
// ANALYSER TAB
// ══════════════════════════════════════════════════════════════════════════════
const alog         = createLogger('analyser-log');
const captureBtn   = document.getElementById('capture-btn');
const stopBtn      = document.getElementById('stop-btn');
const captureStatus= document.getElementById('capture-status');
const sampleCount  = document.getElementById('sample-count');

let signalRows     = [];
let activeChannels = [];

// instantiate the interactive viewer once, reuse across captures
const wfViewer = new WaveformViewer(document.getElementById('waveform-container'));

captureBtn.addEventListener('click', () => {
  activeChannels = [...document.querySelectorAll('.ch-box:checked')].map(c => c.value);
  if (!activeChannels.length) { alog.append('[ERREUR] Sélectionne au moins un canal.'); return; }

  signalRows = [];
  wfViewer.loadData([], 0);   // clear previous capture
  sampleCount.textContent = '';
  captureBtn.disabled = true;
  stopBtn.disabled    = false;
  captureStatus.textContent = '● capture';
  captureStatus.style.color = 'var(--amber)';

  socket.emit('capture-start', {
    samplerate: Number(document.getElementById('samplerate-select').value),
    numSamples: Number(document.getElementById('samples-input').value),
    channels:   activeChannels.join(','),
  });
});

stopBtn.addEventListener('click', () => {
  socket.emit('capture-stop');
  stopBtn.disabled = true;
});

document.getElementById('clear-analyser-btn').addEventListener('click', () => alog.clear());

socket.on('signal-data', row => {
  signalRows.push(row);
  if (signalRows.length % 500 === 0)
    sampleCount.textContent = signalRows.length + ' samples';
});

socket.on('capture-done', ({ success }) => {
  captureBtn.disabled = false;
  stopBtn.disabled    = true;

  if (success && signalRows.length > 0) {
    captureStatus.textContent = '✓ ' + signalRows.length + ' samples';
    captureStatus.style.color = 'var(--green)';
    sampleCount.textContent   = signalRows.length + ' samples';
    loadCaptureIntoViewer(signalRows, activeChannels);
  } else {
    captureStatus.textContent = '✗ erreur';
    captureStatus.style.color = 'var(--red)';
  }
});

// mirror sigrok logs to analyser log panel
socket.on('log', msg => {
  if (msg.startsWith('[SIGROK]') || msg.startsWith('[ANALYSER]') || msg.startsWith('[ERREUR]'))
    alog.append(msg);
});

// ── Feed captured CSV rows into the interactive viewer ─────────────────────────
function loadCaptureIntoViewer(rows, channels) {
  const allCh = ['D0','D1','D2','D3','D4','D5','D6','D7'];
  const cols  = channels.map(ch => allCh.indexOf(ch));
  const data  = channels.map(() => new Uint8Array(rows.length));

  rows.forEach((row, rIdx) => {
    const vals = row.split(',');
    cols.forEach((ci, i) => {
      if (ci >= 0 && ci < vals.length) data[i][rIdx] = parseInt(vals[ci], 10);
    });
  });

  const sr = Number(document.getElementById('samplerate-select').value);
  const channelObjs = channels.map((name, i) => ({ name, samples: data[i] }));
  wfViewer.loadData(channelObjs, sr);
}


// connection status is handled at the top of this file, right after socket creation
