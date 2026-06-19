import {
  COLLECTED_LANE_TOP,
  COLLECTED_ROW_HEIGHT,
  DATE_OFFSET,
  IMAGE_HEIGHT,
  ITEM_GAP,
  ITEM_WIDTH,
  MAIN_LINE_Y,
} from '../constants';
import { getContentBounds, getFittedSize, getSlotX } from '../geometry';
import type {
  ConnectorPoint,
  ContentBounds,
  TimelineSketchDeps,
} from '../types';

export type BoundsContext = {
  getAllBounds: () => ContentBounds[];
  slotCenterX: (index: number) => number;
  timeToWorldX: (targetTime: number) => number;
  getNowWorldX: () => number;
  getPreviousMainIndex: (targetTime: number) => number;
  getBranchEndpoints: (
    anchorTime: number,
    itemBounds: ContentBounds,
    mainBounds: ContentBounds[]
  ) => { from: ConnectorPoint; to: ConnectorPoint };
  getBranchEndpointsForSource: (
    anchorTime: number,
    itemBounds: ContentBounds,
    mainBounds: ContentBounds[],
    sourceIndex: number,
    sourceCount: number
  ) => { from: ConnectorPoint; to: ConnectorPoint };
  getCollectedBounds: () => ContentBounds[];
};

export function createBoundsContext(deps: TimelineSketchDeps): BoundsContext {
  const { items, processed, processedCollected, itemOffsets, collectedOffsets } =
    deps;

  const getAllBounds = () =>
    processed.map((item, index) =>
      getContentBounds(index, item, itemOffsets[index])
    );

  const slotCenterX = (index: number) => getSlotX(index) + ITEM_WIDTH / 2;

  const timeToWorldX = (targetTime: number) => {
    const times = items.map((item) =>
      item.date ? new Date(item.date).getTime() : Number.NaN
    );
    const step = ITEM_WIDTH + ITEM_GAP;

    if (items.length === 0) {
      return 0;
    }

    let firstFuture = -1;
    for (let index = 0; index < times.length; index++) {
      if (!Number.isNaN(times[index]) && times[index] > targetTime) {
        firstFuture = index;
        break;
      }
    }

    if (firstFuture === -1) {
      return slotCenterX(items.length - 1) + step / 2;
    }
    if (firstFuture === 0) {
      return slotCenterX(0) - step / 2;
    }

    const prev = firstFuture - 1;
    const tPrev = times[prev];
    const tNext = times[firstFuture];
    let frac = 0.5;
    if (!Number.isNaN(tPrev) && !Number.isNaN(tNext) && tNext > tPrev) {
      frac = (targetTime - tPrev) / (tNext - tPrev);
    }
    const bounds = getAllBounds();
    const gapStart = bounds[prev].right;
    const gapEnd = bounds[firstFuture].left;
    return gapStart + frac * (gapEnd - gapStart);
  };

  const getNowWorldX = () => timeToWorldX(Date.now());

  const getPreviousMainIndex = (targetTime: number): number => {
    if (processed.length === 0) {
      return -1;
    }
    let prevIndex = -1;
    for (let index = 0; index < items.length; index++) {
      const date = items[index].date;
      const time = date ? new Date(date).getTime() : Number.NaN;
      if (!Number.isNaN(time) && time <= targetTime) {
        prevIndex = index;
      }
    }
    return prevIndex;
  };

  const getBranchEndpoints = (
    anchorTime: number,
    itemBounds: ContentBounds,
    mainBounds: ContentBounds[]
  ): { from: ConnectorPoint; to: ConnectorPoint } => {
    if (mainBounds.length === 0) {
      return {
        from: { x: itemBounds.left, y: MAIN_LINE_Y },
        to: { x: itemBounds.left, y: itemBounds.centerY },
      };
    }
    const prevIndex = getPreviousMainIndex(anchorTime);
    const main = mainBounds[prevIndex >= 0 ? prevIndex : 0];
    const fromX = (main.left + main.right) / 2;
    const itemCenterX = (itemBounds.left + itemBounds.right) / 2;
    const to =
      fromX <= itemCenterX
        ? { x: itemBounds.left, y: itemBounds.centerY }
        : { x: itemBounds.right, y: itemBounds.centerY };
    return {
      from: { x: fromX, y: main.top + main.height },
      to,
    };
  };

  const getBranchEndpointsForSource = (
    anchorTime: number,
    itemBounds: ContentBounds,
    mainBounds: ContentBounds[],
    sourceIndex: number,
    sourceCount: number
  ): { from: ConnectorPoint; to: ConnectorPoint } => {
    const endpoints = getBranchEndpoints(anchorTime, itemBounds, mainBounds);

    if (sourceCount <= 1) {
      return endpoints;
    }

    const spread = Math.min(itemBounds.width * 0.25, 10);
    const offset = (sourceIndex - (sourceCount - 1) / 2) * spread;

    return {
      from: { x: endpoints.from.x + offset, y: endpoints.from.y },
      to: { x: endpoints.to.x, y: endpoints.to.y + offset * 0.5 },
    };
  };

  const getCollectedBounds = (): ContentBounds[] => {
    const bounds: ContentBounds[] = [];
    let prevRight = -Infinity;
    let currentRow = -1;

    processedCollected.forEach((item, index) => {
      if (item.rowIndex !== currentRow) {
        currentRow = item.rowIndex;
        prevRight = -Infinity;
      }

      const { width, height } = getFittedSize(
        item.aspectRatio,
        ITEM_WIDTH,
        IMAGE_HEIGHT
      );
      const anchorX = timeToWorldX(item.anchorTime);
      let baseLeft = anchorX - width / 2;
      if (baseLeft < prevRight + ITEM_GAP) {
        baseLeft = prevRight + ITEM_GAP;
      }
      prevRight = baseLeft + width;

      const rowTop = COLLECTED_LANE_TOP + item.rowIndex * COLLECTED_ROW_HEIGHT;
      const baseTop = rowTop + (IMAGE_HEIGHT - height) / 2;
      const offset = collectedOffsets[index];
      const left = baseLeft + offset.dx;
      const top = baseTop + offset.dy;
      bounds.push({
        left,
        right: left + width,
        centerY: top + height / 2,
        top,
        width,
        height,
        dateBottom: top + height + DATE_OFFSET,
      });
    });

    return bounds;
  };

  return {
    getAllBounds,
    slotCenterX,
    timeToWorldX,
    getNowWorldX,
    getPreviousMainIndex,
    getBranchEndpoints,
    getBranchEndpointsForSource,
    getCollectedBounds,
  };
}
