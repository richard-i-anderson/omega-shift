const GAME_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space']);

/** Keyboard state keyed by KeyboardEvent.code. */
export class Input {
  private readonly down = new Set<string>();
  private readonly pressed = new Set<string>();

  constructor(target: Window) {
    target.addEventListener('keydown', (e) => {
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    target.addEventListener('keyup', (e) => this.down.delete(e.code));
    target.addEventListener('blur', () => {
      this.down.clear();
      this.pressed.clear();
    });
  }

  isDown(...codes: string[]): boolean {
    return codes.some((c) => this.down.has(c));
  }

  /** True once per key press; consumes the press. */
  wasPressed(...codes: string[]): boolean {
    for (const c of codes) {
      if (this.pressed.delete(c)) return true;
    }
    return false;
  }

  /** Drop presses nobody asked about this frame so they don't fire later. */
  endFrame(): void {
    this.pressed.clear();
  }
}
