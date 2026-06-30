'use strict';

/**
 * WaveformViewer — canvas-based digital signal viewer.
 * Handles large captures smoothly via canvas redraw instead of DOM nodes per sample.
 */
class WaveformViewer {
  constructor(container, opts = {}) {
    this.container   = container;
    this.channels     = [];   // [{ name, samples: Uint8Array }]
    this.sampleRate   = opts.sampleRate || 1_000_000;
    this.totalSamples = 0;

    // view state
    this.offset  = 0;     // first visible sample index
    this.scale   = 1;     // samples per pixel (>=1 zoomed out, <1 zoomed in not allowed — min 1 px/sample logical handled via pxPerSample)
    this.pxPerSample = 4; // pixels per sample at zoom level 1
    this.cursorX = null;  // sample index of placed cursor, or null

    this._buildDOM();
    this._bindEvents();
  }

  // ── Public API ────────────────────────────────────────────────────────────
  loadData(channels, sampleRate) {
    this.channels     = channels;
    this.sampleRate   = sampleRate;
    this.totalSamples = channels.length ? channels[0].samples.length : 0;
    this.offset  = 0;
    this.cursorX = null;
    this.fitToWindow();
  }

  fitToWindow() {
    const w = this.canvas.clientWidth || 600;
    if (this.totalSamples > 0) {
      this.pxPerSample = Math.max(w / this.totalSamples, 0.002);
    }
    this.offset = 0;
    this._render();
  }

  zoomIn()  { this._zoomAt(this.canvas.clientWidth / 2, 1.5); }
  zoomOut() { this._zoomAt(this.canvas.clientWidth / 2, 1 / 1.5); }

  destroy() {
    this._ro && this._ro.disconnect();
  }

  // ── DOM scaffold ──────────────────────────────────────────────────────────
  _buildDOM() {
    this.container.innerHTML = '';
    this.container.classList.add('wv-root');

    // toolbar
    this.toolbar = document.createElement('div');
    this.toolbar.className = 'wv-toolbar';
    this.toolbar.innerHTML = `
      <button class="wv-btn" data-act="zoom-out" title="Zoom out (-)">−</button>
      <button class="wv-btn" data-act="zoom-in"  title="Zoom in (+)">+</button>
      <button class="wv-btn" data-act="fit"       title="Fit to window (0)">⤢</button>
      <span class="wv-sep"></span>
      <span class="wv-readout" id="wv-readout">—</span>
      <span class="wv-spacer"></span>
      <span class="wv-meta" id="wv-meta"></span>
    `;
    this.container.appendChild(this.toolbar);

    // scroll/canvas area
    this.viewport = document.createElement('div');
    this.viewport.className = 'wv-viewport';
    this.container.appendChild(this.viewport);

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'wv-canvas';
    this.viewport.appendChild(this.canvas);

    this.ctx = this.canvas.getContext('2d');

    // horizontal scrollbar (custom, since we render to canvas not native scroll)
    this.scrollbar = document.createElement('div');
    this.scrollbar.className = 'wv-scrollbar';
    this.scrollThumb = document.createElement('div');
    this.scrollThumb.className = 'wv-scroll-thumb';
    this.scrollbar.appendChild(this.scrollThumb);
    this.container.appendChild(this.scrollbar);

    // resize observer keeps canvas crisp on container resize
    this._ro = new ResizeObserver(() => this._resizeCanvas());
    this._ro.observe(this.viewport);
    this._resizeCanvas();
  }

  _resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const w = this.viewport.clientWidth;
    const h = this.viewport.clientHeight;
    this.canvas.width  = w * dpr;
    this.canvas.height = h * dpr;
    this.canvas.style.width  = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._render();
  }

  // ── Events ────────────────────────────────────────────────────────────────
  _bindEvents() {
    this.toolbar.addEventListener('click', e => {
      const btn = e.target.closest('.wv-btn');
      if (!btn) return;
      if (btn.dataset.act === 'zoom-in')  this.zoomIn();
      if (btn.dataset.act === 'zoom-out') this.zoomOut();
      if (btn.dataset.act === 'fit')      this.fitToWindow();
    });

    // wheel = zoom (ctrl/cmd or plain wheel both zoom; shift+wheel = pan)
    this.canvas.addEventListener('wheel', e => {
      e.preventDefault();
      if (e.shiftKey) {
        this._panByPixels(e.deltaY);
      } else {
        const factor = e.deltaY < 0 ? 1.2 : 1 / 1.2;
        this._zoomAt(e.offsetX, factor);
      }
    }, { passive: false });

    // drag to pan
    let dragging = false, lastX = 0;
    this.canvas.addEventListener('mousedown', e => {
      dragging = true; lastX = e.clientX;
      this.canvas.style.cursor = 'grabbing';
    });
    window.addEventListener('mousemove', e => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      lastX = e.clientX;
      this._panByPixels(-dx);
    });
    window.addEventListener('mouseup', () => {
      dragging = false;
      this.canvas.style.cursor = 'crosshair';
    });

    // click (no drag) = place cursor
    let downX = 0, downY = 0;
    this.canvas.addEventListener('mousedown', e => { downX = e.clientX; downY = e.clientY; });
    this.canvas.addEventListener('click', e => {
      if (Math.abs(e.clientX - downX) > 3 || Math.abs(e.clientY - downY) > 3) return; // was a drag
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      this.cursorX = Math.round(this.offset + x / this.pxPerSample);
      this._render();
    });

    // keyboard shortcuts when canvas focused
    this.canvas.setAttribute('tabindex', '0');
    this.canvas.addEventListener('keydown', e => {
      if (e.key === '+' || e.key === '=') this.zoomIn();
      if (e.key === '-')                  this.zoomOut();
      if (e.key === '0')                  this.fitToWindow();
      if (e.key === 'ArrowLeft')          this._panByPixels(-40);
      if (e.key === 'ArrowRight')         this._panByPixels(40);
    });

    // custom scrollbar drag
    let sbDragging = false;
    this.scrollThumb.addEventListener('mousedown', e => {
      sbDragging = true; e.stopPropagation();
    });
    window.addEventListener('mousemove', e => {
      if (!sbDragging) return;
      const rect = this.scrollbar.getBoundingClientRect();
      const ratio = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
      this.offset = Math.round(ratio * this.totalSamples);
      this._clampOffset();
      this._render();
    });
    window.addEventListener('mouseup', () => sbDragging = false);
  }

  // ── View math ─────────────────────────────────────────────────────────────
  _zoomAt(pxX, factor) {
    if (!this.totalSamples) return;
    const sampleAtCursor = this.offset + pxX / this.pxPerSample;
    this.pxPerSample = Math.min(Math.max(this.pxPerSample * factor, 0.0005), 200);
    this.offset = sampleAtCursor - pxX / this.pxPerSample;
    this._clampOffset();
    this._render();
  }

  _panByPixels(dx) {
    if (!this.totalSamples) return;
    this.offset += dx / this.pxPerSample;
    this._clampOffset();
    this._render();
  }

  _clampOffset() {
    const visibleSamples = this.canvas.clientWidth / this.pxPerSample;
    const maxOffset = Math.max(0, this.totalSamples - visibleSamples);
    this.offset = Math.min(Math.max(this.offset, 0), maxOffset);
  }

  // ── Rendering ────────────────────────────────────────────────────────────
  _render() {
    const ctx = this.ctx;
    const w   = this.canvas.clientWidth;
    const h   = this.canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);

    if (!this.channels.length) {
      ctx.fillStyle = '#6e7681';
      ctx.font = '13px Inter, sans-serif';
      ctx.fillText('No capture loaded', 16, 24);
      this._updateMeta();
      return;
    }

    const styles    = getComputedStyle(this.container);
    const colTx1    = styles.getPropertyValue('--tx1').trim()   || '#e6edf3';
    const colTx3    = styles.getPropertyValue('--tx3').trim()   || '#6e7681';
    const colBorder = styles.getPropertyValue('--border').trim()|| '#30363d';
    const colSig    = styles.getPropertyValue('--blue').trim()  || '#58a6ff';
    const colCursor = styles.getPropertyValue('--amber').trim() || '#d29922';

    const labelW   = 56;
    const rowH     = Math.min(46, (h - 28) / this.channels.length);
    const top      = 8;

    // grid: time ruler at top
    this._drawRuler(ctx, labelW, w, colTx3, colBorder);

    this.channels.forEach((ch, i) => {
      const y0 = top + 22 + i * rowH;
      const yHi = y0 + 6;
      const yLo = y0 + rowH - 12;

      // label
      ctx.fillStyle = colTx1;
      ctx.font = '500 11px JetBrains Mono, monospace';
      ctx.textBaseline = 'middle';
      ctx.fillText(ch.name, 8, (yHi + yLo) / 2);

      // row separator
      ctx.strokeStyle = colBorder;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y0 + rowH - 2);
      ctx.lineTo(w, y0 + rowH - 2);
      ctx.stroke();

      this._drawSignal(ctx, ch.samples, labelW, w, yHi, yLo, colSig);
    });

    // cursor line + readout
    if (this.cursorX !== null) {
      const px = labelW + (this.cursorX - this.offset) * this.pxPerSample;
      if (px >= labelW && px <= w) {
        ctx.strokeStyle = colCursor;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(px, 0);
        ctx.lineTo(px, h);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    this._updateMeta();
  }

  _drawRuler(ctx, labelW, w, colTx3, colBorder) {
    ctx.strokeStyle = colBorder;
    ctx.beginPath();
    ctx.moveTo(0, 20);
    ctx.lineTo(w, 20);
    ctx.stroke();

    const visibleSamples = (w - labelW) / this.pxPerSample;
    const period = 1 / this.sampleRate;

    // choose a "nice" tick spacing in samples
    const targetPxPerTick = 90;
    const samplesPerTick  = Math.max(1, Math.round(targetPxPerTick / this.pxPerSample));

    ctx.fillStyle = colTx3;
    ctx.font = '10px JetBrains Mono, monospace';

    const startTick = Math.floor(this.offset / samplesPerTick) * samplesPerTick;
    for (let s = startTick; s < this.offset + visibleSamples + samplesPerTick; s += samplesPerTick) {
      const px = labelW + (s - this.offset) * this.pxPerSample;
      if (px < labelW || px > w) continue;
      ctx.strokeStyle = colBorder;
      ctx.beginPath();
      ctx.moveTo(px, 14);
      ctx.lineTo(px, 20);
      ctx.stroke();
      const t = s * period;
      ctx.fillText(this._fmtTime(t), px + 3, 12);
    }
  }

  _drawSignal(ctx, samples, labelW, w, yHi, yLo, color) {
    const n = samples.length;
    if (n === 0) return;

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();

    const visibleSamples = (w - labelW) / this.pxPerSample;
    const startIdx = Math.max(0, Math.floor(this.offset));
    const endIdx   = Math.min(n, Math.ceil(this.offset + visibleSamples) + 1);

    if (this.pxPerSample >= 2) {
      // zoomed in enough — draw true square wave
      let prevVal = samples[startIdx];
      let x0 = labelW + (startIdx - this.offset) * this.pxPerSample;
      ctx.moveTo(x0, prevVal ? yHi : yLo);
      for (let i = startIdx; i < endIdx; i++) {
        const val = samples[i];
        const x = labelW + (i - this.offset) * this.pxPerSample;
        if (val !== prevVal) {
          ctx.lineTo(x, prevVal ? yHi : yLo);
          ctx.lineTo(x, val ? yHi : yLo);
          prevVal = val;
        }
      }
      const xEnd = labelW + (endIdx - this.offset) * this.pxPerSample;
      ctx.lineTo(xEnd, prevVal ? yHi : yLo);
    } else {
      // zoomed out — min/max envelope per pixel column to avoid aliasing
      const colCount = Math.ceil(w - labelW);
      const samplesPerCol = Math.max(1, (endIdx - startIdx) / colCount);
      let prevHigh = null;
      for (let col = 0; col < colCount; col++) {
        const sIdx0 = Math.floor(startIdx + col * samplesPerCol);
        const sIdx1 = Math.min(n, Math.floor(startIdx + (col + 1) * samplesPerCol));
        let any0 = false, any1 = false;
        for (let i = sIdx0; i < sIdx1; i++) {
          if (samples[i]) any1 = true; else any0 = true;
        }
        const x = labelW + col;
        if (any0 && any1) {
          // both states present in this column — draw full bar (fast toggling)
          ctx.moveTo(x, yHi);
          ctx.lineTo(x, yLo);
          prevHigh = null;
        } else {
          const y = any1 ? yHi : yLo;
          if (prevHigh !== null && prevHigh !== y) ctx.lineTo(x, prevHigh);
          ctx.moveTo(x, y);
          ctx.lineTo(x, y);
          prevHigh = y;
        }
      }
    }
    ctx.stroke();
  }

  _fmtTime(t) {
    const at = Math.abs(t);
    if (at >= 1)        return t.toFixed(3) + ' s';
    if (at >= 1e-3)      return (t * 1e3).toFixed(2) + ' ms';
    if (at >= 1e-6)      return (t * 1e6).toFixed(2) + ' µs';
    return (t * 1e9).toFixed(0) + ' ns';
  }

  _updateMeta() {
    const readout = this.container.querySelector('#wv-readout');
    const meta    = this.container.querySelector('#wv-meta');

    if (this.cursorX !== null && this.sampleRate) {
      const t = this.cursorX / this.sampleRate;
      readout.textContent = 'cursor: sample ' + this.cursorX + '  (' + this._fmtTime(t) + ')';
    } else {
      readout.textContent = 'click waveform to place cursor';
    }

    if (this.totalSamples) {
      const visible = Math.min(this.totalSamples, Math.round(this.canvas.clientWidth / this.pxPerSample));
      meta.textContent = visible.toLocaleString() + ' / ' + this.totalSamples.toLocaleString() + ' samples shown';
    } else {
      meta.textContent = '';
    }

    // scrollbar thumb
    if (this.totalSamples > 0) {
      const visibleSamples = this.canvas.clientWidth / this.pxPerSample;
      const ratio = Math.min(visibleSamples / this.totalSamples, 1);
      const left  = (this.offset / this.totalSamples) * 100;
      this.scrollThumb.style.width = Math.max(ratio * 100, 3) + '%';
      this.scrollThumb.style.left  = left + '%';
      this.scrollbar.style.display = ratio < 0.999 ? 'block' : 'none';
    } else {
      this.scrollbar.style.display = 'none';
    }
  }
}

window.WaveformViewer = WaveformViewer;
