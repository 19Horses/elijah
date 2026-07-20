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

// Constant gap between gallery slides, as a fraction of the focused box width.
const GALLERY_GAP_FRACTION = 0.06;

/** Size an image contained within a box, preserving aspect ratio. */
export function containedSize(
  img: p5.Image | null,
  boxWidth: number,
  boxHeight: number
): { w: number; h: number } {
  if (!img || img.width <= 0 || img.height <= 0) {
    return { w: boxWidth, h: boxHeight };
  }
  const imgAr = img.width / img.height;
  const boxAr = boxWidth / boxHeight;
  return imgAr > boxAr
    ? { w: boxWidth, h: boxWidth / imgAr }
    : { w: boxHeight * imgAr, h: boxHeight };
}

/**
 * Width of the image currently at the focus (node) position, interpolated as
 * the strip slides, so the arrows can span the focused image exactly.
 */
export function galleryFocusWidth(
  images: (p5.Image | null)[],
  displayIndex: number,
  boxWidth: number,
  boxHeight: number
): number {
  if (images.length === 0) {
    return boxWidth;
  }
  const lower = Math.max(
    0,
    Math.min(images.length - 1, Math.floor(displayIndex))
  );
  const upper = Math.min(images.length - 1, lower + 1);
  const frac = displayIndex - lower;
  const wLower = containedSize(images[lower], boxWidth, boxHeight).w;
  const wUpper = containedSize(images[upper], boxWidth, boxHeight).w;
  return wLower + (wUpper - wLower) * frac;
}

/**
 * Draws the gallery as a horizontal row of all its images. Each image keeps its
 * own width (contained to the focused box height) and the gap between images is
 * constant, so the spacing is uniform regardless of their shapes. `displayIndex`
 * (fractional) shifts the whole row; images are left-aligned so the active one's
 * left edge meets the node, and vertical positioning stays centered.
 */
export function drawGalleryStrip(
  p: p5,
  box: Rect,
  images: (p5.Image | null)[],
  displayIndex: number
): void {
  const gap = box.width * GALLERY_GAP_FRACTION;

  // Left offset of each image within the row (constant gap between them).
  const sizes = images.map((img) => containedSize(img, box.width, box.height));
  const lefts: number[] = [];
  let acc = 0;
  sizes.forEach((size, i) => {
    lefts[i] = acc;
    acc += size.w + gap;
  });
  if (lefts.length === 0) {
    return;
  }

  // Interpolate the scroll position between whole-image offsets.
  const lower = Math.max(
    0,
    Math.min(images.length - 1, Math.floor(displayIndex))
  );
  const upper = Math.min(images.length - 1, lower + 1);
  const frac = displayIndex - lower;
  const scrollOffset = lefts[lower] + (lefts[upper] - lefts[lower]) * frac;

  images.forEach((img, i) => {
    if (!img) {
      return;
    }
    const { w, h } = sizes[i];
    const x = box.left - scrollOffset + lefts[i];
    const dy = box.top + (box.height - h) / 2;
    p.image(img, x, dy, w, h);
  });
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
