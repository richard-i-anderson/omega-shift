/** Fixed-timestep simulation with rendering once per animation frame. */
export function startLoop(update: (dt: number) => void, render: () => void, hz: number): void {
  const step = 1 / hz;
  let acc = 0;
  let last = performance.now();
  const frame = (now: number) => {
    // Clamp long gaps (tab switches, breakpoints) so we don't spiral.
    acc += Math.min(0.25, (now - last) / 1000);
    last = now;
    while (acc >= step) {
      update(step);
      acc -= step;
    }
    render();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
