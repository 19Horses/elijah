import type p5 from 'p5';
import { resetCanvasEffects } from '../canvasEffects';
import type { GalleryNavRegion } from './galleryController';

type Rect = { left: number; top: number; width: number; height: number };

/**
 * Draws an image fitted inside a box (contain), preserving aspect ratio so
 * gallery images of differing shapes aren't stretched.
 */
export function drawContainedImage(
  p: p5,
  img: p5.Image,
  box: Rect
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
  p.image(img, dx, dy, drawW, drawH);
}

/**
 * Draws prev/next arrows and dot indicators for the gallery, and returns the
 * world-space hit regions for the arrows.
 */
export function drawGalleryControls(
  p: p5,
  ctx: CanvasRenderingContext2D,
  box: Rect,
  activeIndex: number,
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

  // Dot indicators along the bottom.
  const dotR = Math.max(2, Math.min(box.width, box.height) * 0.012);
  const gap = dotR * 3;
  const totalWidth = (count - 1) * gap;
  const startX = box.left + box.width / 2 - totalWidth / 2;
  const dotY = box.top + box.height - dotR * 4;
  for (let i = 0; i < count; i++) {
    p.noStroke();
    p.fill(255, i === activeIndex ? 255 : 110);
    p.circle(startX + i * gap, dotY, dotR * 2);
  }

  resetCanvasEffects(ctx);

  return [
    { cx: prevCx, cy, r, delta: -1 },
    { cx: nextCx, cy, r, delta: 1 },
  ];
}
