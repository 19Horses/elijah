import {
  BRANCH_MERGE_TRANSITION_FACTOR,
  BRANCH_MERGE_ZOOM_FACTOR,
  BRANCH_NODE_GAP,
  COLLECTED_ROW_EXTRA_GAP,
  DATE_OFFSET,
  IMAGE_HEIGHT,
  ITEM_GAP,
  ITEM_WIDTH,
  LANE_GAP,
  LANE_GAP_GROWTH_POWER,
  MAIN_LINE_Y,
  PADDING_X,
  PADDING_Y,
} from '../constants';
import { getBranchPoints, getSteppedBranchPoints } from '../connectors';
import {
  getContentBounds,
  getFittedSize,
  zoomMergeProgress,
  zoomOutGrowth,
} from '../geometry';
import type {
  ConnectorPoint,
  ContentBounds,
  FocusTarget,
  ProcessedCollected,
  TimelineSketchDeps,
} from '../types';

export type BranchSegment = {
  from: ConnectorPoint;
  to: ConnectorPoint;
  // Draw as a stepped 5-point line instead of the default branch shape.
  stepped?: boolean;
  // Titles of the items at each end, for labelling the endpoint nodes.
  fromItemTitle?: string;
  toItemTitle?: string;
  // The items at each end, for focusing when an endpoint node is clicked.
  fromItemTarget?: FocusTarget;
  toItemTarget?: FocusTarget;
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
  // Main-connector indices a branch detours below (has collected items in that
  // gap). The rest of the main line — before, after, and gaps it skips over —
  // is left untouched.
  getBranchDetouredGaps: (rowIndex: number) => Set<number>;
  getCollectedBounds: () => ContentBounds[];
  // The evenly-spaced straight-line layout for an isolated branch: all main
  // items plus that branch's collected items, ordered chronologically, laid out
  // on the main line at a fixed step. Keyed `${lane}:${index}` → target centre X.
  getIsolatedLineTargets: (
    rowIndex: number,
    mainBounds: ContentBounds[],
    collectedBounds: ContentBounds[]
  ) => {
    targetX: Map<string, number>;
    order: { lane: 'main' | 'collected'; index: number }[];
    frame: ContentBounds | null;
  };
};

// The edge of a main item a branch springs from: the top when the collected
// item sits above the main line, otherwise the underside.
function mainBranchEdgeY(
  main: ContentBounds,
  itemBounds: ContentBounds
): number {
  return itemBounds.centerY < main.centerY ? main.top : main.top + main.height;
}

// Whether a segment's ends sit on opposite sides of the main line (one above,
// one below) — such a branch is drawn stepped so the crossing reads clearly.
function crossesMainLine(from: ConnectorPoint, to: ConnectorPoint): boolean {
  return (from.y - MAIN_LINE_Y) * (to.y - MAIN_LINE_Y) < 0;
}

// Branch rows alternate sides of the main line: even rows stack downward below
// it, odd rows stack upward above it, so the main timeline sits in the middle.
// `gap` (main line to nearest row) and `rowHeight` (between further rows)
// grow as the camera zooms out, so the enlarged nodes/lines still clear each
// other instead of crowding together (see the caller in getCollectedBounds).
function rowTopForRowIndex(
  rowIndex: number,
  gap: number,
  rowHeight: number
): number {
  const sideSlot = Math.floor(rowIndex / 2);
  if (rowIndex % 2 === 1) {
    return PADDING_Y - gap - IMAGE_HEIGHT - sideSlot * rowHeight;
  }
  return PADDING_Y + IMAGE_HEIGHT + gap + sideSlot * rowHeight;
}

export function createBoundsContext(deps: TimelineSketchDeps): BoundsContext {
  const {
    runtime,
    items,
    processed,
    processedCollected,
    itemOffsets,
    collectedOffsets,
  } = deps;

  // Fan-out spacing for parallel branch nodes/lines eases down to 0 below
  // BRANCH_MERGE_ZOOM_FACTOR (of the fit-to-screen zoom), so lines sharing the
  // same route converge into what reads as a single line at low zoom, then
  // ease back out to their normal fan as you zoom in past the threshold.
  const branchOffsetScale = (): number =>
    1 -
    zoomMergeProgress(
      runtime.zoom,
      runtime.fitZoomLevel,
      BRANCH_MERGE_ZOOM_FACTOR,
      BRANCH_MERGE_TRANSITION_FACTOR
    );

  const getAllBounds = () =>
    processed.map((item, index) =>
      getContentBounds(index, item, itemOffsets[index], slotLeft(index))
    );

  const slotCenterX = (index: number) => slotLeft(index) + ITEM_WIDTH / 2;

  // Gaps that contain a chain of collected items are widened by the chain's
  // length so the chained items have room to sit side by side between two
  // main-timeline items. Indexed by the gap's left main index. A chain dated
  // before the very first main item gets analogous treatment via
  // `extraBeforeFirst`, pushed further left of that item's own position
  // instead of overlapping it (see timeToWorldX) — unlike a chain after the
  // last main item, which has nothing later to collide with and so is left
  // alone.
  let gapExtraSlotsCache: { extra: number[]; extraBeforeFirst: number } | null =
    null;
  const getGapExtraSlots = (): {
    extra: number[];
    extraBeforeFirst: number;
  } => {
    if (gapExtraSlotsCache) {
      return gapExtraSlotsCache;
    }
    const extra = new Array<number>(Math.max(items.length, 1)).fill(0);
    let extraBeforeFirst = 0;
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
      if (gap === -1) {
        const depth = depthOf(index);
        if (depth > 1 && depth > extraBeforeFirst) {
          extraBeforeFirst = depth;
        }
        return;
      }
      // Only widen gaps that sit between two main items.
      if (gap >= items.length - 1) {
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
    gapExtraSlotsCache = { extra, extraBeforeFirst };
    return gapExtraSlotsCache;
  };

  const slotLeft = (index: number): number => {
    const { extra } = getGapExtraSlots();
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
      // A chain rooted here grows rightward from this point (see
      // getCollectedBounds), so a deep chain needs a head start further left
      // of the first main item, not just a single step, to clear it entirely.
      const { extraBeforeFirst } = getGapExtraSlots();
      return slotCenterX(0) - step * extraBeforeFirst - step / 2;
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

  // A branch line from a main item's near edge (its underside for branches
  // below the main line, its top for branches above) to the nearest edge of a
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
    return { from: { x: fromX, y: mainBranchEdgeY(main, itemBounds) }, to };
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

  // Which main item, if any, a branch attaches to (its underside): the item it
  // springs out from, or — for a chain's tail — the next item it rejoins.
  const getBranchMainIndex = (
    index: number,
    sourceIndex: number,
    mainBounds: ContentBounds[],
    collectedBounds: ContentBounds[]
  ): number => {
    const item = processedCollected[index];
    const source = item.sources[sourceIndex];
    const gapIndex = getPreviousMainIndex(item.anchorTime);
    const chainFrom = getCollectorChainBounds(
      index,
      source.rowIndex,
      collectedBounds
    );
    if (chainFrom) {
      // Tail rejoin into the next main item (only if this is the chain's tail).
      if (
        mainBounds[gapIndex + 1] &&
        !hasChainSuccessor(index, source.rowIndex)
      ) {
        return gapIndex + 1;
      }
      return -1;
    }
    // Branches straight out from the previous main item.
    return mainBounds.length > 0 ? Math.max(0, gapIndex) : -1;
  };

  // Every branch that meets a main item's underside gets an evenly spaced node
  // across that item's width, ordered left-to-right by the branch's target, so
  // the nodes never pile up at the centre. Keyed by `${index}:${sourceIndex}`.
  // Cached per frame by the bounds array references it was built from.
  let branchNodeXCache: {
    main: ContentBounds[];
    collected: ContentBounds[];
    map: Map<string, number>;
  } | null = null;
  const getBranchNodeXMap = (
    mainBounds: ContentBounds[],
    collectedBounds: ContentBounds[]
  ): Map<string, number> => {
    if (
      branchNodeXCache &&
      branchNodeXCache.main === mainBounds &&
      branchNodeXCache.collected === collectedBounds
    ) {
      return branchNodeXCache.map;
    }

    const perMain = new Map<
      number,
      { key: string; targetX: number; sourceIndex: number }[]
    >();
    processedCollected.forEach((item, index) => {
      const itemBounds = collectedBounds[index];
      if (!itemBounds) {
        return;
      }
      const targetX = (itemBounds.left + itemBounds.right) / 2;
      item.sources.forEach((_source, sourceIndex) => {
        const mainIndex = getBranchMainIndex(
          index,
          sourceIndex,
          mainBounds,
          collectedBounds
        );
        if (mainIndex < 0) {
          return;
        }
        const entry = { key: `${index}:${sourceIndex}`, targetX, sourceIndex };
        const list = perMain.get(mainIndex);
        if (list) {
          list.push(entry);
        } else {
          perMain.set(mainIndex, [entry]);
        }
      });
    });

    const map = new Map<string, number>();
    perMain.forEach((list, mainIndex) => {
      const mb = mainBounds[mainIndex];
      // Left-to-right by target so the branches fan out without crossing each
      // other (like metro lines leaving a station).
      list.sort(
        (a, b) => a.targetX - b.targetX || a.sourceIndex - b.sourceIndex
      );
      const n = list.length;
      const center = mb.left + mb.width / 2;
      // Tight, fixed, equal spacing centred on the item. A fixed gap (rather
      // than one scaled to the item width) keeps the nodes clearly separated
      // even on the first main item, which collects many branches; the bundle
      // is allowed to extend past a narrow item rather than collapsing.
      const offsetScale = branchOffsetScale();
      list.forEach((entry, k) => {
        map.set(
          entry.key,
          center + (k - (n - 1) / 2) * BRANCH_NODE_GAP * offsetScale
        );
      });
    });

    branchNodeXCache = { main: mainBounds, collected: collectedBounds, map };
    return map;
  };

  // Which side of a collected item a branch coming from `fromX` attaches to.
  const branchEdgeSide = (
    fromX: number,
    itemBounds: ContentBounds
  ): 'left' | 'right' =>
    fromX <= (itemBounds.left + itemBounds.right) / 2 ? 'left' : 'right';

  // Mirror of getBranchNodeXMap for the collected-item side: every branch
  // endpoint that meets an item's edge gets an evenly spaced y along that edge,
  // grouped by (item, side), so multiple lines into/out of one item don't
  // collapse onto a single node. Keyed `${role}:${index}:${sourceIndex}`,
  // value is the resolved {x, y}. Cached per frame by the bounds references.
  let itemAttachCache: {
    main: ContentBounds[];
    collected: ContentBounds[];
    map: Map<string, { x: number; y: number }>;
  } | null = null;
  const getItemAttachMap = (
    mainBounds: ContentBounds[],
    collectedBounds: ContentBounds[]
  ): Map<string, { x: number; y: number }> => {
    if (
      itemAttachCache &&
      itemAttachCache.main === mainBounds &&
      itemAttachCache.collected === collectedBounds
    ) {
      return itemAttachCache.map;
    }

    const nodeXMap = getBranchNodeXMap(mainBounds, collectedBounds);
    // group key `${itemIndex}:${side}` -> attachments, each with an order key
    // (the y it arrives from, so lines stack in arrival order) and edge x.
    const groups = new Map<
      string,
      { key: string; orderY: number; x: number }[]
    >();
    const add = (
      itemIndex: number,
      side: 'left' | 'right',
      key: string,
      orderY: number
    ) => {
      const ib = collectedBounds[itemIndex];
      if (!ib) {
        return;
      }
      const x = side === 'left' ? ib.left : ib.right;
      const groupKey = `${itemIndex}:${side}`;
      const entry = { key, orderY, x };
      const list = groups.get(groupKey);
      if (list) {
        list.push(entry);
      } else {
        groups.set(groupKey, [entry]);
      }
    };

    processedCollected.forEach((item, index) => {
      const itemBounds = collectedBounds[index];
      if (!itemBounds) {
        return;
      }
      const gapIndex = getPreviousMainIndex(item.anchorTime);
      item.sources.forEach((source, sourceIndex) => {
        const predecessor = findChainPredecessor(index, (other) =>
          other.sources.some((s) => s.rowIndex === source.rowIndex)
        );
        if (predecessor >= 0 && collectedBounds[predecessor]) {
          const pb = collectedBounds[predecessor];
          // Chain link: predecessor's right edge -> this item's left edge.
          add(
            predecessor,
            'right',
            `chainFrom:${index}:${sourceIndex}`,
            itemBounds.centerY
          );
          add(index, 'left', `chainTo:${index}:${sourceIndex}`, pb.centerY);
          // Tail rejoin up to the next main item.
          const nextMain = mainBounds[gapIndex + 1];
          if (nextMain && !hasChainSuccessor(index, source.rowIndex)) {
            const nodeX =
              nodeXMap.get(`${index}:${sourceIndex}`) ??
              (itemBounds.left + itemBounds.right) / 2;
            add(
              index,
              branchEdgeSide(nodeX, itemBounds),
              `rejoinTo:${index}:${sourceIndex}`,
              nodeX
            );
          }
        } else {
          // Branch straight out from a main item.
          const nodeX =
            nodeXMap.get(`${index}:${sourceIndex}`) ??
            (itemBounds.left + itemBounds.right) / 2;
          add(
            index,
            branchEdgeSide(nodeX, itemBounds),
            `branchTo:${index}:${sourceIndex}`,
            nodeX
          );
        }
      });
    });

    const map = new Map<string, { x: number; y: number }>();
    const offsetScale = branchOffsetScale();
    groups.forEach((list, groupKey) => {
      const itemIndex = Number(groupKey.slice(0, groupKey.indexOf(':')));
      const centerY = collectedBounds[itemIndex].centerY;
      list.sort((a, b) => a.orderY - b.orderY || a.key.localeCompare(b.key));
      const n = list.length;
      list.forEach((entry, k) => {
        map.set(entry.key, {
          x: entry.x,
          y: centerY + (k - (n - 1) / 2) * BRANCH_NODE_GAP * offsetScale,
        });
      });
    });

    itemAttachCache = { main: mainBounds, collected: collectedBounds, map };
    return map;
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

    const nodeX = getBranchNodeXMap(mainBounds, collectedBounds).get(
      `${index}:${sourceIndex}`
    );
    const attach = getItemAttachMap(mainBounds, collectedBounds);

    // The `to` end of every segment sits on this collected item; label its
    // node with whichever item lives at the far (`from`) end.
    const thisTitle = item.title;
    const thisTarget: FocusTarget = { lane: 'collected', index };

    const predIndex = findChainPredecessor(index, (other) =>
      other.sources.some((s) => s.rowIndex === source.rowIndex)
    );
    const chainFrom = predIndex >= 0 ? collectedBounds[predIndex] : null;

    if (chainFrom) {
      // Chained items sit side by side, so link the predecessor's right edge
      // to this item's left edge rather than branching off the main line. Both
      // ends use spaced edge nodes so several chains never pile on one point.
      const chainFromPt = attach.get(`chainFrom:${index}:${sourceIndex}`) ?? {
        x: chainFrom.right,
        y: chainFrom.centerY,
      };
      const chainToPt = attach.get(`chainTo:${index}:${sourceIndex}`) ?? {
        x: itemBounds.left,
        y: itemBounds.centerY,
      };
      segments.push({
        from: chainFromPt,
        to: chainToPt,
        stepped: crossesMainLine(chainFromPt, chainToPt),
        fromItemTitle: processedCollected[predIndex]?.title,
        toItemTitle: thisTitle,
        fromItemTarget: { lane: 'collected', index: predIndex },
        toItemTarget: thisTarget,
      });

      // The tail of the chain rejoins the main timeline at the next item.
      const gapIndex = getPreviousMainIndex(item.anchorTime);
      const nextMain = mainBounds[gapIndex + 1];
      if (nextMain && !hasChainSuccessor(index, source.rowIndex)) {
        const rejoinTitle = processed[gapIndex + 1]?.title;
        const rejoinTarget: FocusTarget = { lane: 'main', index: gapIndex + 1 };
        const rejoinTo = attach.get(`rejoinTo:${index}:${sourceIndex}`);
        if (nodeX !== undefined && rejoinTo) {
          const rejoinFrom = {
            x: nodeX,
            y: mainBranchEdgeY(nextMain, itemBounds),
          };
          segments.push({
            from: rejoinFrom,
            to: rejoinTo,
            stepped: crossesMainLine(rejoinFrom, rejoinTo),
            fromItemTitle: rejoinTitle,
            toItemTitle: thisTitle,
            fromItemTarget: rejoinTarget,
            toItemTarget: thisTarget,
          });
        } else {
          const spread = applySpread(
            branchToMain(nextMain, itemBounds),
            sourceIndex,
            sourceCount,
            itemBounds.width
          );
          segments.push({
            ...spread,
            stepped: crossesMainLine(spread.from, spread.to),
            fromItemTitle: rejoinTitle,
            toItemTitle: thisTitle,
            fromItemTarget: rejoinTarget,
            toItemTarget: thisTarget,
          });
        }
      }
    } else {
      // Branch straight from the main line. If this item is also reached by
      // another collector's chain, route it as a stepped 5-point line so the
      // long jump from the main item reads clearly.
      const stepped = getChainPredecessorIndex(index) >= 0;
      const prevIndex = getPreviousMainIndex(item.anchorTime);
      const mainIndex = prevIndex >= 0 ? prevIndex : 0;
      const mainTitle = processed[mainIndex]?.title;
      const mainTarget: FocusTarget = { lane: 'main', index: mainIndex };
      const branchTo = attach.get(`branchTo:${index}:${sourceIndex}`);
      if (nodeX !== undefined && mainBounds.length > 0 && branchTo) {
        const main = mainBounds[mainIndex];
        const branchFrom = { x: nodeX, y: mainBranchEdgeY(main, itemBounds) };
        segments.push({
          from: branchFrom,
          to: branchTo,
          stepped: stepped || crossesMainLine(branchFrom, branchTo),
          fromItemTitle: mainTitle,
          toItemTitle: thisTitle,
          fromItemTarget: mainTarget,
          toItemTarget: thisTarget,
        });
      } else {
        const spread = applySpread(
          getBranchEndpoints(item.anchorTime, itemBounds, mainBounds),
          sourceIndex,
          sourceCount,
          itemBounds.width
        );
        segments.push({
          ...spread,
          stepped: stepped || crossesMainLine(spread.from, spread.to),
          fromItemTitle: mainTitle,
          toItemTitle: thisTitle,
          fromItemTarget: mainTarget,
          toItemTarget: thisTarget,
        });
      }
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
      .filter(({ item }) => item.sources.some((s) => s.rowIndex === rowIndex))
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

  // Gaps a branch detours below the main line for (has collected items in). The
  // matching main connector is the diverted part of the timeline; the rest of
  // the main line stays as-is.
  const getBranchDetouredGaps = (rowIndex: number): Set<number> => {
    const gaps = new Set<number>();
    processedCollected.forEach((item) => {
      if (item.sources.some((s) => s.rowIndex === rowIndex)) {
        gaps.add(getPreviousMainIndex(item.anchorTime));
      }
    });
    return gaps;
  };

  const getCollectedBounds = (): ContentBounds[] => {
    // Grows the row spacing as the camera zooms out, faster than the
    // nodes/lines themselves thicken (LANE_GAP_GROWTH_POWER > the line/node
    // growth power), so rows keep pulling further apart at extreme zoom-out
    // rather than just barely staying clear of the bigger nodes/lines.
    const rowGrowth = zoomOutGrowth(
      runtime.zoom,
      runtime.fitZoomLevel,
      LANE_GAP_GROWTH_POWER
    );
    const rowGap = LANE_GAP * rowGrowth;
    const rowHeight = IMAGE_HEIGHT + COLLECTED_ROW_EXTRA_GAP * rowGrowth;

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

      const rowTop = rowTopForRowIndex(rowIndex, rowGap, rowHeight);
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

  const getIsolatedLineTargets = (
    rowIndex: number,
    mainBounds: ContentBounds[],
    collectedBounds: ContentBounds[]
  ) => {
    const entries: {
      lane: 'main' | 'collected';
      index: number;
      centerX: number;
      width: number;
      height: number;
    }[] = [];
    mainBounds.forEach((b, index) => {
      if (b) {
        entries.push({
          lane: 'main',
          index,
          centerX: (b.left + b.right) / 2,
          width: b.width,
          height: b.height,
        });
      }
    });
    processedCollected.forEach((item, index) => {
      const b = collectedBounds[index];
      if (b && item.sources.some((s) => s.rowIndex === rowIndex)) {
        entries.push({
          lane: 'collected',
          index,
          centerX: (b.left + b.right) / 2,
          width: b.width,
          height: b.height,
        });
      }
    });
    entries.sort((a, b) => a.centerX - b.centerX);

    const targetX = new Map<string, number>();
    const order: { lane: 'main' | 'collected'; index: number }[] = [];
    const n = entries.length;
    if (n === 0) {
      return { targetX, order, frame: null };
    }

    const step = ITEM_WIDTH + ITEM_GAP;
    const centroid = entries.reduce((sum, e) => sum + e.centerX, 0) / n;
    const startX = centroid - ((n - 1) * step) / 2;
    let minX = Infinity;
    let maxX = -Infinity;
    let maxHeight = 0;
    entries.forEach((e, k) => {
      const cx = startX + k * step;
      targetX.set(`${e.lane}:${e.index}`, cx);
      order.push({ lane: e.lane, index: e.index });
      minX = Math.min(minX, cx - e.width / 2);
      maxX = Math.max(maxX, cx + e.width / 2);
      maxHeight = Math.max(maxHeight, e.height);
    });

    const frame: ContentBounds = {
      left: minX,
      right: maxX,
      width: maxX - minX,
      top: MAIN_LINE_Y - maxHeight / 2,
      centerY: MAIN_LINE_Y,
      height: maxHeight,
      dateBottom: MAIN_LINE_Y + maxHeight / 2 + DATE_OFFSET,
    };
    return { targetX, order, frame };
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
    getBranchDetouredGaps,
    getCollectedBounds,
    getIsolatedLineTargets,
  };
}
