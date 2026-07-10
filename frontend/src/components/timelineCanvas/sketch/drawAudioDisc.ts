import type p5 from 'p5';
import { resetCanvasEffects } from '../canvasEffects';

type DiscBounds = {
  left: number;
  top: number;
  width: number;
  height: number;
};

// Radians per millisecond — a slow spin (~one revolution every 12.5s).
export const AUDIO_DISC_SPIN_SPEED = 0.0005;

/**
 * Draws a blank CD sliding out from behind an item's image, like it's being
 * pulled from a sleeve. Used for the selected (focused) audio track.
 *
 * `reveal` (0..1) drives the slide: at 0 the disc is fully tucked behind the
 * image, at 1 it has slid out to the right. It should be drawn before the image
 * so the hidden portion stays behind it.
 *
 * When the CD image has loaded it is drawn slowly spinning; otherwise a simple
 * vector disc is used as a fallback.
 */
export function drawAudioDisc(
  p: p5,
  ctx: CanvasRenderingContext2D,
  bounds: DiscBounds,
  backgroundColour: string,
  alpha: number,
  cdImage: p5.Image | null,
  reveal: number,
  spin: number
): void {
  if (alpha <= 0) {
    return;
  }

  const { left, top, width, height } = bounds;
  const radius = height * 0.45;
  if (radius <= 0) {
    return;
  }

  const diameter = radius * 2;
  // Slide from fully tucked behind the image (right edge flush) to pulled out
  // to the right.
  const t = Math.max(0, Math.min(1, reveal));
  const hiddenCx = left + width - radius;
  const outCx = left + width + radius * 0.1;
  const cx = hiddenCx + (outCx - hiddenCx) * t;
  const cy = top + height / 2;

  ctx.globalAlpha = alpha;

  if (cdImage) {
    // Soft drop shadow so the disc reads as sitting behind the image.
    ctx.shadowBlur = 16;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';

    p.push();
    p.imageMode(p.CENTER);
    p.translate(cx, cy);
    p.rotate(spin);
    p.image(cdImage, 0, 0, diameter, diameter);
    p.pop();

    resetCanvasEffects(ctx);
    return;
  }

  // Soft drop shadow so the disc reads as sitting behind the image.
  ctx.shadowBlur = 16;
  ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
  p.noStroke();
  p.fill(220);
  p.circle(cx, cy, diameter);
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'rgba(0, 0, 0, 0)';

  // Outer edge.
  p.noFill();
  p.stroke(190);
  p.strokeWeight(Math.max(1, radius * 0.02));
  p.circle(cx, cy, diameter);

  // Concentric sheen rings.
  p.stroke(245);
  p.strokeWeight(Math.max(1, radius * 0.06));
  p.circle(cx, cy, diameter * 0.82);
  p.stroke(205);
  p.strokeWeight(Math.max(1, radius * 0.03));
  p.circle(cx, cy, diameter * 0.7);

  // Hub.
  p.noStroke();
  p.fill(232);
  p.circle(cx, cy, diameter * 0.42);
  p.noFill();
  p.stroke(200);
  p.strokeWeight(Math.max(1, radius * 0.015));
  p.circle(cx, cy, diameter * 0.42);

  // Centre hole punched through to the background.
  p.noStroke();
  p.fill(backgroundColour);
  p.circle(cx, cy, diameter * 0.14);

  resetCanvasEffects(ctx);
}
