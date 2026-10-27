import {
  CONNECTOR_EXTRA_WEIGHT_PX,
  DATE_OFFSET,
  IMAGE_HEIGHT,
  ITEM_GAP,
  ITEM_WIDTH,
  ITEM_ZOOM_OUT_GROWTH_MAX,
  ITEM_ZOOM_OUT_GROWTH_POWER,
  PADDING_X,
  PADDING_Y,
  ZOOM_OUT_GROWTH_POWER,
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

// `scale` grows the item about the centre of its slot (see itemZoomScale).
export function getContentBounds(
  index: number,
  item: ProcessedItem,
  offset: ItemOffset,
  slotX: number = getSlotX(index),
  scale = 1
): ContentBounds {
  const fitted = getFittedSize(item.aspectRatio, ITEM_WIDTH, IMAGE_HEIGHT);
  const width = fitted.width * scale;
  const height = fitted.height * scale;
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

// World-space stroke weight of a connector line: the zoom-out growth, plus a
// fixed number of screen pixels that reads the same at any zoom.
export function connectorWeight(zoom: number, fitZoomLevel: number): number {
  const extra = zoom > 0 ? CONNECTOR_EXTRA_WEIGHT_PX / zoom : 0;
  return zoomOutGrowth(zoom, fitZoomLevel, ZOOM_OUT_GROWTH_POWER) + extra;
}

// How far past a zoom-out threshold the camera is: 0 at/above `thresholdFactor`
// (times fitZoomLevel), easing up to 1 a further `transitionFactor` below that
// as the camera zooms out (e.g. the date labels shrinking slightly).
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

// How much bigger items are drawn as the camera zooms out below the default
// fit level, so they shrink less than the world around them. Stays 1 at/above
// it.
export function itemZoomScale(zoom: number, fitZoomLevel: number): number {
  return Math.min(
    ITEM_ZOOM_OUT_GROWTH_MAX,
    zoomOutGrowth(zoom, fitZoomLevel, ITEM_ZOOM_OUT_GROWTH_POWER)
  );
}
