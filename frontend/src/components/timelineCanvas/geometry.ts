import {
  DATE_OFFSET,
  IMAGE_HEIGHT,
  ITEM_GAP,
  ITEM_WIDTH,
  PADDING_X,
  PADDING_Y,
} from './constants';
import type {
  ConnectorPoint,
  ContentBounds,
  ItemOffset,
  ProcessedItem,
} from './types';

export function getFittedSize(
  aspectRatio: number,
  maxWidth: number,
  maxHeight: number
): { width: number; height: number } {
  if (aspectRatio >= maxWidth / maxHeight) {
    return { width: maxWidth, height: maxWidth / aspectRatio };
  }
  return { width: maxHeight * aspectRatio, height: maxHeight };
}

export function getSlotX(index: number): number {
  return PADDING_X + index * (ITEM_WIDTH + ITEM_GAP);
}

export function getContentBounds(
  index: number,
  item: ProcessedItem,
  offset: ItemOffset,
  slotX: number = getSlotX(index)
): ContentBounds {
  const { width, height } = getFittedSize(
    item.aspectRatio,
    ITEM_WIDTH,
    IMAGE_HEIGHT
  );
  const offsetXInSlot = (ITEM_WIDTH - width) / 2;
  const offsetYInSlot = (IMAGE_HEIGHT - height) / 2;
  const left = slotX + offsetXInSlot + offset.dx;
  const top = PADDING_Y + offsetYInSlot + offset.dy;

  return {
    left,
    right: left + width,
    centerY: top + height / 2,
    top,
    width,
    height,
    dateBottom: top + height + DATE_OFFSET,
  };
}

export function hitTest(bounds: ContentBounds, x: number, y: number): boolean {
  return (
    x >= bounds.left &&
    x <= bounds.right &&
    y >= bounds.top &&
    y <= bounds.dateBottom
  );
}

export function screenToWorld(
  x: number,
  y: number,
  cameraX: number,
  cameraY: number,
  zoom: number
): { x: number; y: number } {
  return { x: x / zoom + cameraX, y: y / zoom + cameraY };
}

export function lerpPoint(
  a: ConnectorPoint,
  b: ConnectorPoint,
  t: number
): ConnectorPoint {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

// Multiplier (>=1) that grows as the camera zooms out below the timeline's
// default fit-to-screen level, and stays 1 at/above it. World-space sizes
// (node radius, connector stroke weight, branch-row spacing) are multiplied
// by this so they read as larger — not just less shrunken — the further out
// you zoom, instead of shrinking to illegibility along with everything else.
export function zoomOutGrowth(
  zoom: number,
  fitZoomLevel: number,
  power: number
): number {
  if (zoom <= 0 || fitZoomLevel <= 0) {
    return 1;
  }
  return Math.max(1, fitZoomLevel / zoom) ** power;
}

// How "merged" the branch-line bundling effect is: 0 at/above `thresholdFactor`
// (times fitZoomLevel), easing up to 1 a further `transitionFactor` below that
// as the camera zooms out — the shared basis for both the branch fan-out
// collapse (bounds.ts) and any other zoom-out-merge-linked effect (e.g. the
// date label shrinking slightly once branches have merged).
export function zoomMergeProgress(
  zoom: number,
  fitZoomLevel: number,
  thresholdFactor: number,
  transitionFactor: number
): number {
  const threshold = fitZoomLevel * thresholdFactor;
  const transition = fitZoomLevel * transitionFactor;
  if (transition <= 0) {
    return zoom >= threshold ? 0 : 1;
  }
  return (
    1 - Math.max(0, Math.min(1, (zoom - (threshold - transition)) / transition))
  );
}
