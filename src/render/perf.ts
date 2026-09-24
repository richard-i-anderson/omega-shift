import type { FrameStats } from '../loop';

const HISTORY = 240;
const FONT = '11px ui-monospace, "Courier New", monospace';
const W = 300;
const GRAPH_H = 70;
/** Graph's vertical range, ms. */
const GRAPH_MAX_MS = 50;
/** Common refresh rates the estimate snaps to when it's close. */
const COMMON_HZ = [30, 48, 50, 60, 72, 75, 90, 100, 120, 144, 165, 240];

/**
 * Debug overlay (F under ?debug): the last few seconds of frame intervals, the
 * display's refresh rate estimated from them, how many simulation steps each
 * frame ran, and the time spent updating and rendering.
 */
export class PerfOverlay {
  visible = false;
  private readonly intervals = new Float32Array(HISTORY);
  private readonly steps = new Uint8Array(HISTORY);
  private readonly updateMs = new Float32Array(HISTORY);
  private readonly renderMs = new Float32Array(HISTORY);
  private head = 0;
  private count = 0;

  record(s: FrameStats): void {
    const i = this.head;
    this.intervals[i] = s.interval;
    this.steps[i] = Math.min(s.steps, 255);
    this.updateMs[i] = s.updateMs;
    this.renderMs[i] = s.renderMs;
    this.head = (i + 1) % HISTORY;
    this.count = Math.min(this.count + 1, HISTORY);
  }

  /** Median frame interval, as a refresh rate (snapped to a common one within 3%). */
  refreshHz(): number {
    if (!this.count) return 0;
    const sorted = Array.from(this.intervals.subarray(0, this.count)).sort((a, b) => a - b);
    const hz = 1000 / (sorted[sorted.length >> 1] || 1);
    const near = COMMON_HZ.find((c) => Math.abs(hz - c) / c < 0.03);
    return near ?? hz;
  }

  /** Drawn in world coordinates at the top-left corner. */
  draw(ctx: CanvasRenderingContext2D): void {
    if (!this.visible) return;
    const n = this.count;
    const x0 = 8;
    const y0 = 8;
    const hist = [0, 0, 0, 0];
    let upd = 0;
    let rnd = 0;
    let updMax = 0;
    let rndMax = 0;
    let long = 0;
    for (let k = 0; k < n; k++) {
      hist[Math.min(this.steps[k], 3)]++;
      upd += this.updateMs[k];
      rnd += this.renderMs[k];
      updMax = Math.max(updMax, this.updateMs[k]);
      rndMax = Math.max(rndMax, this.renderMs[k]);
    }
    const hz = this.refreshHz();
    const expected = hz > 0 ? 1000 / hz : 16.7;
    for (let k = 0; k < n; k++) if (this.intervals[k] > expected * 1.5) long++;

    ctx.save();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.fillRect(x0, y0, W, GRAPH_H + 86);
    ctx.strokeStyle = '#335';
    ctx.lineWidth = 1;
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, W - 1, GRAPH_H + 85);

    // Frame intervals, oldest on the left; guide lines at 60 and 120 Hz and the estimated rate.
    const gx = x0 + 10;
    const gy = y0 + 8;
    const gw = W - 20;
    const yAt = (ms: number) => gy + GRAPH_H - (Math.min(ms, GRAPH_MAX_MS) / GRAPH_MAX_MS) * GRAPH_H;
    ctx.setLineDash([2, 3]);
    for (const [ms, color] of [
      [1000 / 60, '#557'],
      [1000 / 120, '#557'],
      [expected, '#6aa9bb'],
    ] as const) {
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(gx, yAt(ms));
      ctx.lineTo(gx + gw, yAt(ms));
      ctx.stroke();
    }
    ctx.setLineDash([]);
    const bw = gw / HISTORY;
    for (let k = 0; k < n; k++) {
      const idx = (this.head - n + k + HISTORY) % HISTORY;
      const ms = this.intervals[idx];
      ctx.fillStyle = ms > expected * 1.5 ? '#ff4040' : ms < expected * 0.67 ? '#ffe14f' : '#35e0ff';
      const y = yAt(ms);
      ctx.fillRect(gx + k * bw, y, Math.max(bw, 1), gy + GRAPH_H - y);
    }

    ctx.font = FONT;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#d8f6ff';
    const ty = gy + GRAPH_H + 6;
    const pct = (c: number) => (n ? Math.round((100 * c) / n) : 0);
    ctx.fillText(`display ~${hz.toFixed(hz % 1 ? 1 : 0)} Hz   long frames ${long}/${n}`, gx, ty);
    ctx.fillText(`steps/frame  0:${pct(hist[0])}%  1:${pct(hist[1])}%  2:${pct(hist[2])}%  3+:${pct(hist[3])}%`, gx, ty + 15);
    ctx.fillText(`update ${(upd / (n || 1)).toFixed(2)} ms (max ${updMax.toFixed(1)})`, gx, ty + 30);
    ctx.fillText(`render ${(rnd / (n || 1)).toFixed(2)} ms (max ${rndMax.toFixed(1)})`, gx, ty + 45);
    ctx.fillStyle = '#6aa9bb';
    ctx.fillText(`last ${n} frames, graph 0-${GRAPH_MAX_MS} ms`, gx, ty + 60);
    ctx.restore();
  }
}
