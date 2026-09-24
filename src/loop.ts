/** Longest gap between frames that we simulate; longer ones (tab switches, breakpoints) are clamped so we don't spiral. */
export const MAX_FRAME_GAP = 0.25;

export interface Advance {
  /** Whole simulation steps to run this frame. */
  steps: number;
  /** Time left over, carried into the next frame (seconds, in [0, step)). */
  acc: number;
  /** How far the display time is past the last step, as a fraction of a step, in [0, 1). */
  alpha: number;
}

/**
 * The fixed-timestep maths: given the time carried over (`acc`) and the time
 * since the last frame (both seconds), how many `step`-long updates to run and
 * where the display time falls between the last two simulated states.
 */
export function advance(acc: number, elapsed: number, step: number, maxGap = MAX_FRAME_GAP): Advance {
  let a = acc + Math.min(maxGap, Math.max(0, elapsed));
  let steps = 0;
  while (a >= step) {
    a -= step;
    steps++;
  }
  // Float rounding can leave `a` a hair below 0 or at `step`; keep alpha in [0, 1).
  const alpha = Math.min(Math.max(a / step, 0), 1 - 1e-9);
  return { steps, acc: a, alpha };
}

/** Per-frame timings, for the debug performance overlay. */
export interface FrameStats {
  /** Milliseconds since the previous animation frame. */
  interval: number;
  /** Simulation steps run this frame. */
  steps: number;
  /** Milliseconds spent in `update` this frame (all steps). */
  updateMs: number;
  /** Milliseconds spent in `render`. */
  renderMs: number;
}

/**
 * Fixed-timestep simulation with rendering once per animation frame. `render`
 * gets `alpha`, the fraction of a step the display is past the latest state,
 * so it can draw between the previous and the current one.
 */
export function startLoop(
  update: (dt: number) => void,
  render: (alpha: number) => void,
  hz: number,
  onFrame?: (stats: FrameStats) => void,
): void {
  const step = 1 / hz;
  let acc = 0;
  let last = performance.now();
  const frame = (now: number) => {
    const interval = now - last;
    last = now;
    const adv = advance(acc, interval / 1000, step);
    acc = adv.acc;
    const t0 = performance.now();
    for (let i = 0; i < adv.steps; i++) update(step);
    const t1 = performance.now();
    render(adv.alpha);
    const t2 = performance.now();
    onFrame?.({ interval, steps: adv.steps, updateMs: t1 - t0, renderMs: t2 - t1 });
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
