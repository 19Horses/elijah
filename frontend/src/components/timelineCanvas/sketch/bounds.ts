import {
  COLLECTED_LANE_TOP,
  COLLECTED_ROW_HEIGHT,
  DATE_OFFSET,
  IMAGE_HEIGHT,
  ITEM_GAP,
  ITEM_WIDTH,
  MAIN_LINE_Y,
  PADDING_X,
} from '../constants';
import { getBranchPoints, getSteppedBranchPoints } from '../connectors';
import { getContentBounds, getFittedSize } from '../geometry';
import type {
  ConnectorPoint,
  ContentBounds,
  ProcessedCollected,
  TimelineSketchDeps,
} from '../types';

export type BranchSegment = {
  from: ConnectorPoint;
  to: ConnectorPoint;
  // Draw as a stepped 5-point line instead of the default branch shape.
  stepped?: boolean;
};

export type BoundsContext = {
  getAllBounds: () => ContentBounds[];
  slotLeft: (index: number) => number;
  slotCenterX: (index: number) => number;
  timeToWorldX: (targetTime: number) => number;
  getNowWorldX: () => number;
  getPreviousMainIndex: (targetTime: number) => number;
  getBranchEndpoints: (
    anchorTime: number,
    itemBounds: ContentBounds,
    mainBounds: ContentBounds[]
  ) => { from: ConnectorPoint; to: ConnectorPoint };
  getSourceBranchSegments: (
    index: number,
    sourceIndex: number,
    mainBounds: ContentBounds[],
    collectedBounds: ContentBounds[]
  ) => BranchSegment[];
  getUserTimelinePath: (
    rowIndex: number,
    mainBounds: ContentBounds[],
    collectedBounds: ContentBounds[]
  ) => ConnectorPoint[];
  getCollectedBounds: () => ContentBounds[];
};

export function createBoundsContext(deps: TimelineSketchDeps): BoundsContext {
  const {
    items,
    processed,
    processedCollected,
    itemOffsets,
    collectedOffsets,
  } = deps;

  const getAllBounds = () =>
    processed.map((item, index) =>
      getContentBounds(index, item, itemOffsets[index], slotLeft(index))
    );

  const slotCenterX = (index: number) => slotLeft(index) + ITEM_WIDTH / 2;

  // Gaps that contain a chain of collected items are widened by the chain's
  // length so the chained items have room to sit side by side between two
  // main-timeline items. Indexed by the gap's left main index.
  let gapExtraSlotsCache: number[] | null = null;
  const getGapExtraSlots = (): number[] => {
    if (gapExtraSlotsCache) {
      return gapExtraSlotsCache;
    }
    const extra = new Array<number>(Math.max(items.length, 1)).fill(0);
    const depthCache = new Map<number, number>();
    const depthOf = (index: number): number => {
      const cached = depthCache.get(index);
      if (cached !== undefined) {
        return cached;
      }
      const predecessor = getChainPredecessorIndex(index);
      const depth = predecessor >= 0 ? 1 + depthOf(predecessor) : 1;
      depthCache.set(index, depth);
      return depth;
    };
    processedCollected.forEach((item, index) => {
      const gap = getPreviousMainIndex(item.anchorTime);
      // Only widen gaps that sit between two main items.
      if (gap < 0 || gap >= items.length - 1) {
        return;
      }
      const depth = depthOf(index);
      // Single (unchained) items already fit; widen only for real chains, by
      // the chain's length so the side-by-side items clear the next main item.
      if (depth < 2) {
        return;
      }
      if (depth > extra[gap]) {
        extra[gap] = depth;
      }
    });
    gapExtraSlotsCache = extra;
    return extra;
  };

  const slotLeft = (index: number): number => {
    const extra = getGapExtraSlots();
    const step = ITEM_WIDTH + ITEM_GAP;
    let x = PADDING_X;
    for (let gap = 0; gap < index; gap++) {
      x += step * (1 + (extra[gap] ?? 0));
    }
    return x;
  };

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

  // A branch line from a main item's underside to the nearest edge of a
  // collected item.
  const branchToMain = (
    main: ContentBounds,
    itemBounds: ContentBounds
  ): { from: ConnectorPoint; to: ConnectorPoint } => {
    const fromX = (main.left + main.right) / 2;
    const itemCenterX = (itemBounds.left + itemBounds.right) / 2;
    const to =
      fromX <= itemCenterX
        ? { x: itemBounds.left, y: itemBounds.centerY }
        : { x: itemBounds.right, y: itemBounds.centerY };
    return { from: { x: fromX, y: main.top + main.height }, to };
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
    return branchToMain(mainBounds[prevIndex >= 0 ? prevIndex : 0], itemBounds);
  };

  // The most recent earlier item, within the same gap between two main-timeline
  // dates, that matches a collector predicate — so a collector's picks chain to
  // each other instead of each branching off the main line.
  const findChainPredecessor = (
    index: number,
    matches: (other: ProcessedCollected) => boolean
  ): number => {
    const current = processedCollected[index];
    if (!current) {
      return -1;
    }
    const gapIndex = getPreviousMainIndex(current.anchorTime);
    let bestIndex = -1;
    let bestTime = -Infinity;
    processedCollected.forEach((other, otherIndex) => {
      if (otherIndex === index || other.anchorTime >= current.anchorTime) {
        return;
      }
      if (getPreviousMainIndex(other.anchorTime) !== gapIndex) {
        return;
      }
      if (!matches(other)) {
        return;
      }
      if (other.anchorTime > bestTime) {
        bestTime = other.anchorTime;
        bestIndex = otherIndex;
      }
    });
    return bestIndex;
  };

  // Predecessor for a single collector's branch line.
  const getCollectorChainBounds = (
    index: number,
    collectorRowIndex: number,
    collectedBounds: ContentBounds[]
  ): ContentBounds | null => {
    const predecessor = findChainPredecessor(index, (other) =>
      other.sources.some((s) => s.rowIndex === collectorRowIndex)
    );
    return predecessor >= 0 ? collectedBounds[predecessor] : null;
  };

  // Predecessor used for layout: the previous item that shares any collector,
  // so chained picks sit next to each other horizontally.
  const getChainPredecessorIndex = (index: number): number => {
    const current = processedCollected[index];
    if (!current) {
      return -1;
    }
    const collectorRows = new Set(current.sources.map((s) => s.rowIndex));
    return findChainPredecessor(index, (other) =>
      other.sources.some((s) => collectorRows.has(s.rowIndex))
    );
  };

  // Whether a later item in the same gap was collected by the same collector,
  // i.e. this item is not the tail of that collector's chain.
  const hasChainSuccessor = (
    index: number,
    collectorRowIndex: number
  ): boolean => {
    const current = processedCollected[index];
    const gapIndex = getPreviousMainIndex(current.anchorTime);
    return processedCollected.some(
      (other, otherIndex) =>
        otherIndex !== index &&
        other.anchorTime > current.anchorTime &&
        getPreviousMainIndex(other.anchorTime) === gapIndex &&
        other.sources.some((s) => s.rowIndex === collectorRowIndex)
    );
  };

  const applySpread = (
    endpoints: { from: ConnectorPoint; to: ConnectorPoint },
    sourceIndex: number,
    sourceCount: number,
    itemWidth: number
  ): { from: ConnectorPoint; to: ConnectorPoint } => {
    if (sourceCount <= 1) {
      return endpoints;
    }
    const spread = Math.min(itemWidth * 0.25, 10);
    const offset = (sourceIndex - (sourceCount - 1) / 2) * spread;
    return {
      from: { x: endpoints.from.x + offset, y: endpoints.from.y },
      to: { x: endpoints.to.x, y: endpoints.to.y + offset * 0.5 },
    };
  };

  // All connector segments for one collector's branch through a collected item:
  // the backward link (to its predecessor or the main line) and, for a chain's
  // tail, a forward link back up to the next main-timeline item.
  const getSourceBranchSegments = (
    index: number,
    sourceIndex: number,
    mainBounds: ContentBounds[],
    collectedBounds: ContentBounds[]
  ): BranchSegment[] => {
    const item = processedCollected[index];
    const itemBounds = collectedBounds[index];
    const sourceCount = item.sources.length;
    const source = item.sources[sourceIndex];
    const segments: BranchSegment[] = [];

    const chainFrom = getCollectorChainBounds(
      index,
      source.rowIndex,
      collectedBounds
    );

    if (chainFrom) {
      // Chained items sit side by side, so link the predecessor's right edge
      // to this item's left edge rather than branching off the main line.
      segments.push(
        applySpread(
          {
            from: { x: chainFrom.right, y: chainFrom.centerY },
            to: { x: itemBounds.left, y: itemBounds.centerY },
          },
          sourceIndex,
          sourceCount,
          itemBounds.width
        )
      );

      // The tail of the chain rejoins the main timeline at the next item.
      const gapIndex = getPreviousMainIndex(item.anchorTime);
      const nextMain = mainBounds[gapIndex + 1];
      if (nextMain && !hasChainSuccessor(index, source.rowIndex)) {
        segments.push(
          applySpread(
            branchToMain(nextMain, itemBounds),
            sourceIndex,
            sourceCount,
            itemBounds.width
          )
        );
      }
    } else {
      // Branch straight from the main line. If this item is also reached by
      // another collector's chain, route it as a stepped 5-point line so the
      // long jump from the main item reads clearly.
      const stepped = getChainPredecessorIndex(index) >= 0;
      segments.push({
        ...applySpread(
          getBranchEndpoints(item.anchorTime, itemBounds, mainBounds),
          sourceIndex,
          sourceCount,
          itemBounds.width
        ),
        stepped,
      });
    }

    return segments;
  };

  // The continuous polyline a collector's branch traces: from the main line
  // through each of their collected items in chronological order.
  const getUserTimelinePath = (
    rowIndex: number,
    mainBounds: ContentBounds[],
    collectedBounds: ContentBounds[]
  ): ConnectorPoint[] => {
    const ordered = processedCollected
      .map((item, index) => ({ item, index }))
      .filter(({ item }) =>
        item.sources.some((s) => s.rowIndex === rowIndex)
      )
      .sort((a, b) => a.item.anchorTime - b.item.anchorTime);

    const path: ConnectorPoint[] = [];
    for (const { item, index } of ordered) {
      const sourceIndex = item.sources.findIndex(
        (s) => s.rowIndex === rowIndex
      );
      if (sourceIndex < 0) {
        continue;
      }
      const segments = getSourceBranchSegments(
        index,
        sourceIndex,
        mainBounds,
        collectedBounds
      );
      // The backward segment (to the predecessor or main line) carries the
      // forward flow; appending them in order traces the whole branch.
      const backward = segments[0];
      if (!backward) {
        continue;
      }
      const poly = backward.stepped
        ? getSteppedBranchPoints(backward.from, backward.to)
        : getBranchPoints(backward.from, backward.to);
      path.push(...poly);
    }
    return path;
  };

  const getCollectedBounds = (): ContentBounds[] => {
    const bounds: ContentBounds[] = new Array(processedCollected.length);
    const placedRow = new Array<number>(processedCollected.length).fill(-1);
    // Rightmost edge used so far per row, to keep items from overlapping.
    const rowPrevRight = new Map<number, number>();
    // How many items already attach to a given predecessor, so a fork (one
    // item feeding several) stacks its branches into separate rows.
    const successorCount = new Map<number, number>();

    // Place in chronological order so a chain's predecessor is positioned
    // before the items that attach next to it.
    const order = processedCollected
      .map((_, index) => index)
      .sort((a, b) => {
        const timeA = processedCollected[a].anchorTime;
        const timeB = processedCollected[b].anchorTime;
        return timeA !== timeB ? timeA - timeB : a - b;
      });

    for (const index of order) {
      const item = processedCollected[index];
      const { width, height } = getFittedSize(
        item.aspectRatio,
        ITEM_WIDTH,
        IMAGE_HEIGHT
      );

      const predecessor = getChainPredecessorIndex(index);
      let rowIndex: number;
      let baseLeft: number;
      if (predecessor >= 0 && bounds[predecessor]) {
        // Sit directly to the right of the chained predecessor. The first
        // branch shares the predecessor's row; extra branches (a fork) stack
        // into rows below it. Center each item within a fixed-width column so
        // branches of different widths line up on the same vertical axis.
        const branch = successorCount.get(predecessor) ?? 0;
        successorCount.set(predecessor, branch + 1);
        rowIndex = placedRow[predecessor] + branch;
        const columnLeft = bounds[predecessor].right + ITEM_GAP;
        baseLeft = columnLeft + (ITEM_WIDTH - width) / 2;
      } else {
        rowIndex = item.rowIndex;
        baseLeft = timeToWorldX(item.anchorTime) - width / 2;
      }

      const prevRight = rowPrevRight.get(rowIndex) ?? -Infinity;
      if (baseLeft < prevRight + ITEM_GAP) {
        baseLeft = prevRight + ITEM_GAP;
      }
      rowPrevRight.set(rowIndex, baseLeft + width);
      placedRow[index] = rowIndex;

      const rowTop = COLLECTED_LANE_TOP + rowIndex * COLLECTED_ROW_HEIGHT;
      const baseTop = rowTop + (IMAGE_HEIGHT - height) / 2;
      const offset = collectedOffsets[index];
      const left = baseLeft + offset.dx;
      const top = baseTop + offset.dy;
      bounds[index] = {
        left,
        right: left + width,
        centerY: top + height / 2,
        top,
        width,
        height,
        dateBottom: top + height + DATE_OFFSET,
      };
    }

    return bounds;
  };

  return {
    getAllBounds,
    slotLeft,
    slotCenterX,
    timeToWorldX,
    getNowWorldX,
    getPreviousMainIndex,
    getBranchEndpoints,
    getSourceBranchSegments,
    getUserTimelinePath,
    getCollectedBounds,
  };
}
