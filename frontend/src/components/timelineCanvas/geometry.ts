import {
  DATE_OFFSET,
  DETAIL_IMAGE_PADDING_PX,
  DETAIL_LAYOUT_SCALE,
  DETAIL_MIN_SCALE,
  DETAIL_SHIFT_LEFT_BLEND,
  DETAIL_SHIFT_WIDTH_BOOST,
  DETAIL_TEXT_GAP_PX,
  DETAIL_TEXT_VIEWPORT_LEFT,
  IMAGE_HEIGHT,
  ITEM_GAP,
  ITEM_WIDTH,
  PADDING_X,
  PADDING_Y,
} from './constants';
import type {
  ConnectorPoint,
  ContentBounds,
  DrawRect,
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

export function applyDetailLayoutTransform(
  bounds: DrawRect,
  detailLayout: number,
  zoom: number,
  viewportWidth: number,
  cameraX: number
): DrawRect {
  if (detailLayout <= 0) {
    return bounds;
  }

  const textLeftScreen = viewportWidth * DETAIL_TEXT_VIEWPORT_LEFT;
  const maxImageRightScreen = textLeftScreen - DETAIL_TEXT_GAP_PX;
  const minImageLeftScreen = DETAIL_IMAGE_PADDING_PX;
  const baseScreenLeft = (bounds.left - cameraX) * zoom;
  const baseScreenWidth = bounds.width * zoom;
  const maxImageWidthScreen = maxImageRightScreen - minImageLeftScreen;

  let fitScale = 1;
  if (baseScreenWidth > maxImageWidthScreen && maxImageWidthScreen > 0) {
    fitScale = maxImageWidthScreen / baseScreenWidth;
  }
  const targetScale = Math.max(
    DETAIL_MIN_SCALE,
    Math.min(DETAIL_LAYOUT_SCALE, fitScale)
  );

  const scaledScreenWidth = baseScreenWidth * targetScale;
  const leftAligned = minImageLeftScreen;
  const rightAligned = Math.max(
    minImageLeftScreen,
    maxImageRightScreen - scaledScreenWidth
  );
  const detailScreenLeft =
    leftAligned + (rightAligned - leftAligned) * DETAIL_SHIFT_LEFT_BLEND;
  const widthRatio =
    maxImageWidthScreen > 0
      ? Math.min(1, scaledScreenWidth / maxImageWidthScreen + DETAIL_SHIFT_WIDTH_BOOST)
      : 1;
  const targetScreenLeft =
    baseScreenLeft + (detailScreenLeft - baseScreenLeft) * widthRatio;
  const targetShiftScreen = baseScreenLeft - targetScreenLeft;
  const scale = 1 - detailLayout * (1 - targetScale);
  const shiftWorld = (detailLayout * targetShiftScreen) / zoom;
  const width = bounds.width * scale;
  const height = bounds.height * scale;
  const scaleOffsetX = (bounds.width - width) / 2;
  const scaleOffsetY = (bounds.height - height) / 2;

  return {
    left: bounds.left - shiftWorld + scaleOffsetX,
    top: bounds.top + scaleOffsetY,
    width,
    height,
  };
}

export function getContentBounds(
  index: number,
  item: ProcessedItem,
  offset: ItemOffset
): ContentBounds {
  const slotX = getSlotX(index);
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
