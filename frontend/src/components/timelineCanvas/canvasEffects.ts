import type p5 from 'p5';
import {
  LOAD_INITIAL_DELAY_MS,
  PRIVATE_OVERLAY_ALPHA,
  TYPE_DIM_ALPHA,
  TYPE_DIM_OVERLAY,
} from './constants';
import type { ContentType } from '../../types/content';

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
