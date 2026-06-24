import type p5 from 'p5';
import { resetCanvasEffects } from '../canvasEffects';

/**
 * Draws a play/pause control centred on an item's image. `playing` selects the
 * pause (two bars) vs play (triangle) glyph.
 */
export function drawPlayPauseButton(
  p: p5,
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  playing: boolean,
  alpha: number
): void {
  if (alpha <= 0 || r <= 0) {
    return;
  }

  ctx.globalAlpha = alpha;

  // Translucent backdrop disc.
  p.noStroke();
  p.fill(0, 0, 0, 115);
  p.circle(cx, cy, r * 2);

  p.fill(255);
  if (playing) {
    const barW = r * 0.26;
    const barH = r * 0.86;
    const gap = r * 0.2;
    p.rect(cx - gap - barW, cy - barH / 2, barW, barH, 2);
    p.rect(cx + gap, cy - barH / 2, barW, barH, 2);
  } else {
    // Play triangle, nudged right so it looks optically centred.
    const s = r * 0.6;
    const offset = r * 0.12;
    p.triangle(
      cx - s * 0.55 + offset,
      cy - s,
      cx - s * 0.55 + offset,
      cy + s,
      cx + s * 0.85 + offset,
      cy
    );
  }

  resetCanvasEffects(ctx);
}
