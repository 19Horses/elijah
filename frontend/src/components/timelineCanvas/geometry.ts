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
