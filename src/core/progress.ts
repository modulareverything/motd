const FRAMES = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏";
// Fully cached runs finish within this, so they never flash a spinner.
const SHOW_AFTER_MS = 300;
const FRAME_MS = 80;
const CLEAR_LINE = "\r\x1b[2K";
const HIDE_CURSOR = "\x1b[?25l";
const SHOW_CURSOR = "\x1b[?25h";

export interface Progress {
  update(message: string): void;
  warn(message: string): void;
  /** Clears the line. A later `update` starts it again. */
  stop(): void;
}

/** Draws only when `out` is a terminal, so piped output stays clean. */
export function spinner(out: NodeJS.WriteStream = process.stderr): Progress {
  let message = "";
  let frame = 0;
  let pending: Timer | undefined;
  let ticking: Timer | undefined;

  const draw = () => {
    const line = `${FRAMES[frame++ % FRAMES.length]} ${message}`;
    out.write(`${CLEAR_LINE}${line.slice(0, (out.columns ?? 80) - 1)}`);
  };
  const show = () => {
    pending = undefined;
    out.write(HIDE_CURSOR);
    draw();
    ticking = setInterval(draw, FRAME_MS);
  };

  return {
    update(next) {
      if (!out.isTTY) return;
      message = next;
      if (ticking) draw();
      else pending ??= setTimeout(show, SHOW_AFTER_MS);
    },
    warn(text) {
      if (ticking) out.write(CLEAR_LINE);
      out.write(`${text}\n`);
      if (ticking) draw();
    },
    stop() {
      clearTimeout(pending);
      pending = undefined;
      if (!ticking) return;
      clearInterval(ticking);
      ticking = undefined;
      out.write(`${CLEAR_LINE}${SHOW_CURSOR}`);
    },
  };
}
