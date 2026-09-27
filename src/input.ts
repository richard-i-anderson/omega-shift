const GAME_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space']);

/**
 * Keyboard state keyed by KeyboardEvent.code. On-screen touch controls feed
 * the same codes (`hold`, `press`), plus `aim`, so the game can't tell them
 * from keys.
 */
export class Input {
  private readonly down = new Set<string>();
  private readonly pressed = new Set<string>();
  /** Codes held down by on-screen controls. */
  private readonly held = new Set<string>();
  /**
   * The heading the touch stick is pointing at (radians, screen orientation),
   * or null when it isn't. The ship turns towards it at its normal rate.
   */
  aim: number | null = null;

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
      this.releaseAll();
    });
  }

  isDown(...codes: string[]): boolean {
    return codes.some((c) => this.down.has(c) || this.held.has(c));
  }

  /** An on-screen control holding `code` down (or letting it go). */
  hold(code: string, on: boolean): void {
    if (on) this.held.add(code);
    else this.held.delete(code);
  }

  /** An on-screen control pressing `code` once. */
  press(code: string): void {
    this.pressed.add(code);
  }

  /** Let go of every on-screen control (e.g. when the page loses focus). */
  releaseAll(): void {
    this.held.clear();
    this.aim = null;
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
