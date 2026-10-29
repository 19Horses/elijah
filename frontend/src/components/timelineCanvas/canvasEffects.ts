import type p5 from 'p5';
import {
  ITEM_HALO_BLUR_PX,
  LOAD_INITIAL_DELAY_MS,
  PAGE_BACKGROUND_BOTTOM,
  PAGE_BACKGROUND_TOP,
  PRIVATE_OVERLAY_ALPHA,
  TYPE_DIM_ALPHA,
  TYPE_DIM_OVERLAY,
  GREY_OUT_LIGHTEN,
  SHEEN_ANGLE,
  SHEEN_PERIOD_MS,
  SHEEN_STRENGTH,
  SHEEN_SWEEP_MS,
} from './constants';
import type { ContentType } from '../../types/content';

// A soft halo in the page background's colour around an item, drawn with it,
// that fades out the lines beneath where they meet the item.
export function applyItemHalo(
  p: p5,
  ctx: CanvasRenderingContext2D,
  alpha: number,
  // Where the item sits on screen (0 top, 1 bottom), so the halo takes the
  // page background's colour there and reads as the page, not a glow.
  screenY = 0
): void {
  ctx.shadowBlur = ITEM_HALO_BLUR_PX * p.pixelDensity();
  ctx.shadowColor = hexToRgba(pageBackgroundAt(screenY), alpha);
}

export function hexToRgba(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  if (value.length !== 6) {
    return hex;
  }
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Blend two 6-digit hex colours; t=0 → from, t=1 → to.
export function mixHex(from: string, to: string, t: number): string {
  const a = from.replace('#', '');
  const b = to.replace('#', '');
  if (a.length !== 6 || b.length !== 6) {
    return from;
  }
  const lerp = (start: number, end: number) =>
    Math.round(start + (end - start) * t);
  const r = lerp(
    Number.parseInt(a.slice(0, 2), 16),
    Number.parseInt(b.slice(0, 2), 16)
  );
  const g = lerp(
    Number.parseInt(a.slice(2, 4), 16),
    Number.parseInt(b.slice(2, 4), 16)
  );
  const c = lerp(
    Number.parseInt(a.slice(4, 6), 16),
    Number.parseInt(b.slice(4, 6), 16)
  );
  return `rgb(${r}, ${g}, ${c})`;
}

export function matchesHighlightedType(
  contentType: ContentType,
  highlightedType: ContentType | null | undefined
): boolean {
  return Boolean(highlightedType && contentType === highlightedType);
}

// Greys out by `amount` (0-1) whatever's already drawn in the rect: blended
// to greyscale and washed out lighter. Done with blend modes
// rather than ctx.filter, which Safari ignores. `alpha` is the opacity the
// item itself is drawn at, so a faded item isn't left a grey box.
export function drawGreyOut(
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  width: number,
  height: number,
  amount: number,
  alpha = 1
): void {
  if (amount <= 0 || alpha <= 0) {
    return;
  }
  ctx.save();
  ctx.globalCompositeOperation = 'saturation';
  ctx.globalAlpha = amount * alpha;
  ctx.fillStyle = '#808080';
  ctx.fillRect(left, top, width, height);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = amount * GREY_OUT_LIGHTEN * alpha;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(left, top, width, height);
  ctx.restore();
}

// A soft diagonal band of light sweeping across the rect, clipped to it, at
// `time` (ms; `offset` staggers one picture's sweep after another's).
export function drawSheen(
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  width: number,
  height: number,
  time: number,
  offset: number,
  alpha: number
): void {
  const phase =
    (((time - offset) % SHEEN_PERIOD_MS) + SHEEN_PERIOD_MS) % SHEEN_PERIOD_MS;
  if (alpha <= 0 || phase > SHEEN_SWEEP_MS) {
    return;
  }
  const t = phase / SHEEN_SWEEP_MS;
  const span = Math.hypot(width, height);
  const band = span * 0.35;
  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top, width, height);
  ctx.clip();
  ctx.translate(left + width / 2, top + height / 2);
  ctx.rotate(SHEEN_ANGLE);
  ctx.translate(-span / 2 - band + t * (span + band * 2), 0);
  const light = ctx.createLinearGradient(-band / 2, 0, band / 2, 0);
  light.addColorStop(0, 'rgba(255, 255, 255, 0)');
  light.addColorStop(0.5, `rgba(255, 255, 255, ${SHEEN_STRENGTH * alpha})`);
  light.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.globalAlpha = 1;
  ctx.fillStyle = light;
  ctx.fillRect(-band / 2, -span, band, span * 2);
  ctx.restore();
}

export function resetCanvasEffects(ctx: CanvasRenderingContext2D): void {
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'rgba(0, 0, 0, 0)';
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

export function getTypeDimAlpha(strength: number): number {
  return 1 - strength * (1 - TYPE_DIM_ALPHA);
}

export function getStaggeredLoadAlpha(
  elapsedMs: number,
  index: number,
  fadeMs: number,
  staggerMs: number,
  baseDelayMs = LOAD_INITIAL_DELAY_MS
): number {
  const start = baseDelayMs + index * staggerMs;
  if (elapsedMs <= start) {
    return 0;
  }
  const t = Math.min(1, (elapsedMs - start) / fadeMs);
  return 1 - (1 - t) ** 3;
}

export function getCombinedAlpha(loadAlpha: number, effectAlpha = 1): number {
  return loadAlpha * effectAlpha;
}

export function drawDimOverlay(
  p: p5,
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  width: number,
  height: number,
  strength = 1
): void {
  p.fill(255);
  p.noStroke();
  ctx.globalAlpha = TYPE_DIM_OVERLAY * strength;
  p.rect(left, top, width, height);
  resetCanvasEffects(ctx);
}

// Fades an item's image by `amount` (0-1) by laying the page background's
// colour (where the item sits on screen, `screenY` 0 at the top to 1 at the
// bottom) over it — the same look as drawing it at (1 - amount) opacity, but
// independent of how the browser handles opacity on shadowed images.
export function drawBackgroundFade(
  p: p5,
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  width: number,
  height: number,
  amount: number,
  screenY: number
): void {
  if (amount <= 0) {
    return;
  }
  p.noStroke();
  p.fill(
    mixHex(
      PAGE_BACKGROUND_TOP,
      PAGE_BACKGROUND_BOTTOM,
      Math.min(1, Math.max(0, screenY))
    )
  );
  // On top of whatever the item itself is faded to (e.g. while loading in).
  ctx.globalAlpha *= amount;
  p.rect(left, top, width, height);
  resetCanvasEffects(ctx);
}

// The page background's colour at a screen height (0 top, 1 bottom), for
// masks that should read as the page showing through.
export function pageBackgroundAt(screenY: number): string {
  return mixHex(
    PAGE_BACKGROUND_TOP,
    PAGE_BACKGROUND_BOTTOM,
    Math.min(1, Math.max(0, screenY))
  );
}

export function drawPrivateOverlay(
  p: p5,
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  width: number,
  height: number,
  alpha = 1
): void {
  p.fill(255);
  p.noStroke();
  ctx.globalAlpha = PRIVATE_OVERLAY_ALPHA * alpha;
  p.rect(left, top, width, height);
  resetCanvasEffects(ctx);
}

export function getContrastText(hex: string): string {
  const value = hex.replace('#', '');
  if (value.length !== 6) {
    return '#ffffff';
  }
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#111827' : '#ffffff';
}
