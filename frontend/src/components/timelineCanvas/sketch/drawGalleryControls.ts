import type p5 from 'p5';
import { resetCanvasEffects } from '../canvasEffects';
import { PRIVATE_BLUR_PX, PRIVATE_PIXEL_CELL_PX } from '../constants';
import type { GalleryNavRegion } from './galleryController';

type Rect = { left: number; top: number; width: number; height: number };

export type ImageDistortion = 'blur' | 'pixelate';

// Downsampled copies of images rendered with the 'pixelate' distortion, keyed
// by the source image so each is only built once.
const pixelatedCache = new WeakMap<p5.Image, p5.Graphics>();

function getPixelatedGraphics(p: p5, img: p5.Image): p5.Graphics | null {
  if (img.width <= 0 || img.height <= 0) {
    return null;
  }
  const cached = pixelatedCache.get(img);
  if (cached) {
    return cached;
  }
  const scale = Math.min(
    1,
    PRIVATE_PIXEL_CELL_PX / Math.max(img.width, img.height)
  );
  const smallW = Math.max(1, Math.round(img.width * scale));
  const smallH = Math.max(1, Math.round(img.height * scale));
  const small = p.createGraphics(smallW, smallH);
  small.image(img, 0, 0, smallW, smallH);
  pixelatedCache.set(img, small);
  return small;
}

/**
 * Draws an image fitted inside a box (contain), preserving aspect ratio so
 * gallery images of differing shapes aren't stretched. `distortion` renders a
 * blurred or pixelated version instead, for content the viewer can't see.
 */
export function drawContainedImage(
  p: p5,
  img: p5.Image,
  box: Rect,
  distortion?: ImageDistortion
): void {
  if (img.width <= 0 || img.height <= 0) {
    p.image(img, box.left, box.top, box.width, box.height);
    return;
  }
  const imgAr = img.width / img.height;
  const boxAr = box.width / box.height;
  let drawW = box.width;
  let drawH = box.height;
  if (imgAr > boxAr) {
    drawH = box.width / imgAr;
  } else {
    drawW = box.height * imgAr;
  }
  const dx = box.left + (box.width - drawW) / 2;
  const dy = box.top + (box.height - drawH) / 2;

  if (!distortion) {
    p.image(img, dx, dy, drawW, drawH);
    return;
  }

  const ctx = p.drawingContext as CanvasRenderingContext2D;
  if (distortion === 'blur') {
    ctx.save();
    ctx.filter = `blur(${PRIVATE_BLUR_PX}px)`;
    p.image(img, dx, dy, drawW, drawH);
    ctx.restore();
    return;
  }

  const small = getPixelatedGraphics(p, img);
  if (!small) {
    p.image(img, dx, dy, drawW, drawH);
    return;
  }
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  p.image(small, dx, dy, drawW, drawH);
  ctx.restore();
}

// True modulo (unlike `%`, always non-negative), so an unbounded displayIndex
// wraps cleanly into a valid array index in either direction.
const wrapIndex = (index: number, count: number): number =>
  ((index % count) + count) % count;

/**
 * Draws only the current gallery image, contained within the box. While
 * navigating (fractional `displayIndex`), the outgoing and incoming images
 * crossfade in place — every other image in the gallery stays fully hidden
 * (opacity 0) rather than being laid out in a scrolling strip. `displayIndex`
 * is unbounded (not clamped to the array) so stepping past either end wraps
 * around to the other, looping the slideshow.
 */
export function drawGalleryStrip(
  p: p5,
  box: Rect,
  images: (p5.Image | null)[],
  displayIndex: number
): void {
  const count = images.length;
  if (count === 0) {
    return;
  }

  const lower = Math.floor(displayIndex);
  const frac = displayIndex - lower;

  const ctx = p.drawingContext as CanvasRenderingContext2D;
  const baseAlpha = ctx.globalAlpha;

  const drawAt = (index: number, alpha: number) => {
    const img = images[wrapIndex(index, count)];
    if (!img || alpha <= 0) {
      return;
    }
    ctx.globalAlpha = baseAlpha * alpha;
    drawContainedImage(p, img, box);
  };

  if (frac <= 0 || count === 1) {
    drawAt(lower, 1);
  } else {
    drawAt(lower, 1 - frac);
    drawAt(lower + 1, frac);
  }

  ctx.globalAlpha = baseAlpha;
}

/**
 * Draws prev/next arrows for the gallery, and returns the world-space hit
 * regions for them.
 */
export function drawGalleryControls(
  p: p5,
  ctx: CanvasRenderingContext2D,
  box: Rect,
  count: number,
  alpha: number
): GalleryNavRegion[] {
  if (alpha <= 0 || count <= 1) {
    return [];
  }

  ctx.globalAlpha = alpha;

  const r = Math.min(box.width, box.height) * 0.07;
  const inset = r + Math.min(box.width, box.height) * 0.04;
  const cy = box.top + box.height / 2;
  const prevCx = box.left + inset;
  const nextCx = box.left + box.width - inset;

  const drawArrow = (cx: number, pointsLeft: boolean) => {
    p.noStroke();
    p.fill(0, 0, 0, 115);
    p.circle(cx, cy, r * 2);
    p.fill(255);
    const s = r * 0.5;
    if (pointsLeft) {
      p.triangle(cx + s * 0.5, cy - s, cx + s * 0.5, cy + s, cx - s * 0.7, cy);
    } else {
      p.triangle(cx - s * 0.5, cy - s, cx - s * 0.5, cy + s, cx + s * 0.7, cy);
    }
  };

  drawArrow(prevCx, true);
  drawArrow(nextCx, false);

  resetCanvasEffects(ctx);

  return [
    { cx: prevCx, cy, r, delta: -1 },
    { cx: nextCx, cy, r, delta: 1 },
  ];
}
