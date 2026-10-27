import {
  BRANCH_LINE_GAP_PX,
  COLLECTED_ROW_EXTRA_GAP,
  DATE_OFFSET,
  IMAGE_HEIGHT,
  ITEM_GAP,
  ITEM_WIDTH,
  ITEM_ZOOM_OUT_GROWTH_MAX,
  LANE_GAP,
  LANE_GAP_GROWTH_POWER,
  MAIN_ITEM_SCALE,
  MAIN_LINE_Y,
  PADDING_X,
  PADDING_Y,
  PREVIEW_EXPAND_SCALE,
} from '../constants';
import { getBranchRoute } from '../connectors';
import {
  connectorWeight,
  getContentBounds,
  getFittedSize,
  itemZoomScale,
  zoomOutGrowth,
} from '../geometry';
import type {
  BranchNodeGroup,
  ConnectorPoint,
  RouteDir,
  ContentBounds,
  FocusTarget,
  ProcessedCollected,
  TimelineSketchDeps,
} from '../types';

// One entry (a real collected item, or a collectible from the active
// collection) in the isolated view's merged, date-ordered straight line.
export type IsolatedLineEntry = {
  kind: 'collected' | 'preview';
  index: number;
  contentId: string;
  rect: ContentBounds;
};

export type IsolatedLine = {
  entries: IsolatedLineEntry[];
  centroid: number;
  minX: number;
  maxX: number;
};

export type BranchSegment = {
  from: ConnectorPoint;
  to: ConnectorPoint;
  // Which way the line leaves `from` and meets `to`: vertical at an item's
  // top or bottom, horizontal at its side.
  fromDir: RouteDir;
  toDir: RouteDir;
  // Set when running along the target's row would cross another item on it:
  // the line runs along the gap beside the row at this y instead.
  corridorY?: number;
  // Titles of the items at each end, for labelling the endpoint nodes.
  fromItemTitle?: string;
  toItemTitle?: string;
  // The items at each end, for focusing when an endpoint node is clicked.
  fromItemTarget?: FocusTarget;
  toItemTarget?: FocusTarget;
  // The node each end shares with other lines meeting the same item edge;
  // ends without one get their own dot.
  fromNode?: BranchNodeGroup;
  toNode?: BranchNodeGroup;
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
  getBranchMainTravel: (rowIndex: number) => Set<number>;
  getBranchMainItems: (
    rowIndex: number,
    mainBounds: ContentBounds[],
    collectedBounds: ContentBounds[]
  ) => Set<number>;
  // Row spacing grows as the camera zooms out (see getCollectedBounds), so
  // collected-item Y positions are zoom-dependent. Pass rowGrowthOverride (1 =
  // settled) to get the positions at a fixed growth instead of the live zoom —
  // needed when framing a focus target, since the focus zoom settles growth to 1.
  getCollectedBounds: (rowGrowthOverride?: number) => ContentBounds[];
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
  // The isolated branch's own items, merged by date with the active
  // collection's not-yet-collected items, evenly spaced and straightened onto
  // the main line — the single source of truth for both where those items are
  // drawn and where the camera frames/focuses them.
  getIsolatedMergedLine: (
    rowIndex: number,
    expandedContentId?: string | null,
    expandProgress?: number
  ) => IsolatedLine | null;
  invalidateCollected: () => void;
};

// The edge of a main item a branch springs from: the top when the collected
// item sits above the main line, otherwise the underside.
function mainBranchEdgeY(
  main: ContentBounds,
  itemBounds: ContentBounds
): number {
  return itemBounds.centerY < main.centerY ? main.top : main.top + main.height;
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
  // Not destructured like the others above — reloadPreviewRef swaps
  // deps.processedPreview in place (see getIsolatedMergedLine below), so it
  // must be read fresh off deps each call rather than snapshotted once here.

  // How wide the line of the collector at `${index}:${sourceIndex}` (a
  // segment key's last two parts) is drawn: thickened while its timeline is
  // hovered, easing with its name tag (see drawCollectedLaneConnectors).
  const lineWeightForKey = (key: string): number => {
    const [index, sourceIndex] = key.split(':').slice(-2).map(Number);
    const rowIndex = processedCollected[index]?.sources[sourceIndex]?.rowIndex;
    const grow =
      rowIndex === undefined
        ? 0
        : runtime.lineBlobs.get(`row:${rowIndex}`)?.scale ?? 0;
    return connectorWeight(runtime.zoom, runtime.fitZoomLevel) * (1 + grow);
  };

  // Centre offsets for parallel lines of the given widths laid side by side,
  // each a fixed on-screen gap clear of the next (whatever their widths or the
  // zoom), the bundle centred on 0. A thickened line pushes its neighbours out.
  const packLines = (weights: number[]): number[] => {
    const gap = runtime.zoom > 0 ? BRANCH_LINE_GAP_PX / runtime.zoom : 0;
    const total =
      weights.reduce((sum, weight) => sum + weight, 0) +
      gap * Math.max(0, weights.length - 1);
    let edge = -total / 2;
    return weights.map((weight) => {
      const centre = edge + weight / 2;
      edge += weight + gap;
      return centre;
    });
  };
  const halfSpanOf = (offsets: number[]) =>
    Math.max(0, ...offsets.map((offset) => Math.abs(offset)));

  // Items shrink less than the world as the camera zooms out (see
  // itemZoomScale), each growing about its own centre.
  const itemScale = () => itemZoomScale(runtime.zoom, runtime.fitZoomLevel);

  // Main timeline items are drawn a size up from branch items, still capped
  // (as zooming out grows them) so neighbours never grow into each other.
  const getAllBounds = () => {
    const scale = Math.min(
      itemScale() * MAIN_ITEM_SCALE,
      Math.max(MAIN_ITEM_SCALE, ITEM_ZOOM_OUT_GROWTH_MAX)
    );
    return processed.map((item, index) =>
      getContentBounds(index, item, itemOffsets[index], slotLeft(index), scale)
    );
  };

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

  // A line from the main timeline into a collected item's side normally runs
  // along that item's row; when another item on the row sits in its way, it
  // runs along the gap beside the row (on the main line's side) instead,
  // turning into the row just before its item. Returns that gap's y, or
  // undefined when the row is clear.
  const rowCorridorY = (
    from: ConnectorPoint,
    index: number,
    collectedBounds: ContentBounds[]
  ): number | undefined => {
    const itemBounds = collectedBounds[index];
    const rowY = itemBounds.centerY;
    const minX = Math.min(from.x, itemBounds.left);
    const maxX = Math.max(from.x, itemBounds.right);
    const blocked = collectedBounds.some(
      (other, otherIndex) =>
        otherIndex !== index &&
        other.top < rowY &&
        other.top + other.height > rowY &&
        other.right > minX &&
        other.left < maxX
    );
    if (!blocked) {
      return undefined;
    }
    const towardMain = Math.sign(MAIN_LINE_Y - rowY) || 1;
    const rowGrowth = zoomOutGrowth(
      runtime.zoom,
      runtime.fitZoomLevel,
      LANE_GAP_GROWTH_POWER
    );
    const gap = Math.min(LANE_GAP, COLLECTED_ROW_EXTRA_GAP) * rowGrowth;
    return rowY + towardMain * (IMAGE_HEIGHT / 2 + gap / 2);
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

  // Whether a chain's head links back to the main item before it. A chain that
  // starts before the first main item has no earlier item to spring from, so
  // it only joins the timeline where its tail rejoins; a lone item there still
  // links to the first main item so it isn't left floating.
  const branchesFromMain = (index: number, collectorRowIndex: number) =>
    getPreviousMainIndex(processedCollected[index].anchorTime) >= 0 ||
    !hasChainSuccessor(index, collectorRowIndex);

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
    return mainBounds.length > 0 && branchesFromMain(index, source.rowIndex)
      ? Math.max(0, gapIndex)
      : -1;
  };

  // Every branch that meets a main item's underside gets an evenly spaced line
  // end across that item's width, ordered left-to-right by the branch's target,
  // so the lines run side by side. Keyed by `${index}:${sourceIndex}`;
  // `halfSpans` holds each main item's bundle half-width. Cached per frame by
  // the bounds array references it was built from.
  let branchNodeXCache: {
    main: ContentBounds[];
    collected: ContentBounds[];
    map: Map<string, number>;
    halfSpans: Map<number, number>;
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
    const halfSpans = new Map<number, number>();
    perMain.forEach((list, mainIndex) => {
      const mb = mainBounds[mainIndex];
      // Left-to-right by target so the branches fan out without crossing each
      // other (like metro lines leaving a station).
      list.sort(
        (a, b) => a.targetX - b.targetX || a.sourceIndex - b.sourceIndex
      );
      const center = mb.left + mb.width / 2;
      // Tight, fixed gaps centred on the item. A fixed gap (rather than one
      // scaled to the item width) keeps the lines clearly separated even on
      // the first main item, which collects many branches; the bundle is
      // allowed to extend past a narrow item rather than collapsing.
      const offsets = packLines(
        list.map((entry) => lineWeightForKey(entry.key))
      );
      list.forEach((entry, k) => {
        map.set(entry.key, center + offsets[k]);
      });
      halfSpans.set(mainIndex, halfSpanOf(offsets));
    });

    branchNodeXCache = {
      main: mainBounds,
      collected: collectedBounds,
      map,
      halfSpans,
    };
    return map;
  };

  // The bundle branches form on a main item's top or underside (at `y`).
  const mainNodeGroup = (
    mainIndex: number,
    y: number,
    mainBounds: ContentBounds[],
    collectedBounds: ContentBounds[]
  ): BranchNodeGroup => {
    getBranchNodeXMap(mainBounds, collectedBounds);
    const mb = mainBounds[mainIndex];
    return {
      centre: { x: mb.left + mb.width / 2, y },
      halfSpan: branchNodeXCache?.halfSpans.get(mainIndex) ?? 0,
      axis: 'x',
    };
  };

  // Which side of a collected item a branch coming from `fromX` attaches to.
  const branchEdgeSide = (
    fromX: number,
    itemBounds: ContentBounds
  ): 'left' | 'right' =>
    fromX <= (itemBounds.left + itemBounds.right) / 2 ? 'left' : 'right';

  // Order along a collected item's edge for a branch from a main node at
  // `nodeX`: it turns the corner from vertical to horizontal, so the line on
  // the inside of that turn at the main item stays on the inside at the item
  // and neighbouring lines never cross.
  const mainBranchOrder = (
    nodeX: number,
    side: 'left' | 'right',
    itemBounds: ContentBounds
  ): number => {
    const dirX = side === 'left' ? 1 : -1;
    const dirY = itemBounds.centerY > MAIN_LINE_Y ? 1 : -1;
    return -dirX * dirY * nodeX;
  };

  // Mirror of getBranchNodeXMap for the collected-item side: every branch
  // endpoint that meets an item's edge gets an evenly spaced y along that edge,
  // grouped by (item, side), so the lines into/out of one item stay visible
  // side by side. `node` describes the bundle they're part of. Keyed `${role}:${index}:${sourceIndex}`,
  // value is the resolved {x, y}. Cached per frame by the bounds references.
  let itemAttachCache: {
    main: ContentBounds[];
    collected: ContentBounds[];
    map: Map<string, { x: number; y: number; node: BranchNodeGroup }>;
  } | null = null;
  const getItemAttachMap = (
    mainBounds: ContentBounds[],
    collectedBounds: ContentBounds[]
  ): Map<string, { x: number; y: number; node: BranchNodeGroup }> => {
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
            const side = branchEdgeSide(nodeX, itemBounds);
            add(
              index,
              side,
              `rejoinTo:${index}:${sourceIndex}`,
              mainBranchOrder(nodeX, side, itemBounds)
            );
          }
        } else if (branchesFromMain(index, source.rowIndex)) {
          // Branch straight out from a main item.
          const nodeX =
            nodeXMap.get(`${index}:${sourceIndex}`) ??
            (itemBounds.left + itemBounds.right) / 2;
          const side = branchEdgeSide(nodeX, itemBounds);
          add(
            index,
            side,
            `branchTo:${index}:${sourceIndex}`,
            mainBranchOrder(nodeX, side, itemBounds)
          );
        }
      });
    });

    const map = new Map<
      string,
      { x: number; y: number; node: BranchNodeGroup }
    >();
    groups.forEach((list, groupKey) => {
      const itemIndex = Number(groupKey.slice(0, groupKey.indexOf(':')));
      const centerY = collectedBounds[itemIndex].centerY;
      list.sort((a, b) => a.orderY - b.orderY || a.key.localeCompare(b.key));
      const offsets = packLines(
        list.map((entry) => lineWeightForKey(entry.key))
      );
      const halfSpan = halfSpanOf(offsets);
      list.forEach((entry, k) => {
        map.set(entry.key, {
          x: entry.x,
          y: centerY + offsets[k],
          node: {
            centre: { x: entry.x, y: centerY },
            halfSpan,
            axis: 'y',
          },
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
      // ends use spaced line ends so several chains never pile on one point.
      const chainFromAttach = attach.get(`chainFrom:${index}:${sourceIndex}`);
      const chainToAttach = attach.get(`chainTo:${index}:${sourceIndex}`);
      const chainFromPt = chainFromAttach
        ? { x: chainFromAttach.x, y: chainFromAttach.y }
        : { x: chainFrom.right, y: chainFrom.centerY };
      const chainToPt = chainToAttach
        ? { x: chainToAttach.x, y: chainToAttach.y }
        : { x: itemBounds.left, y: itemBounds.centerY };
      segments.push({
        from: chainFromPt,
        to: chainToPt,
        fromDir: 'horizontal',
        toDir: 'horizontal',
        fromItemTitle: processedCollected[predIndex]?.title,
        toItemTitle: thisTitle,
        fromItemTarget: { lane: 'collected', index: predIndex },
        toItemTarget: thisTarget,
        fromNode: chainFromAttach?.node,
        toNode: chainToAttach?.node,
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
            to: { x: rejoinTo.x, y: rejoinTo.y },
            fromDir: 'vertical',
            corridorY: rowCorridorY(rejoinFrom, index, collectedBounds),
            toDir: 'horizontal',
            fromItemTitle: rejoinTitle,
            toItemTitle: thisTitle,
            fromItemTarget: rejoinTarget,
            toItemTarget: thisTarget,
            fromNode: mainNodeGroup(
              gapIndex + 1,
              rejoinFrom.y,
              mainBounds,
              collectedBounds
            ),
            toNode: rejoinTo.node,
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
            fromDir: 'vertical',
            corridorY: rowCorridorY(spread.from, index, collectedBounds),
            toDir: 'horizontal',
            fromItemTitle: rejoinTitle,
            toItemTitle: thisTitle,
            fromItemTarget: rejoinTarget,
            toItemTarget: thisTarget,
          });
        }
      }
    } else if (branchesFromMain(index, source.rowIndex)) {
      // Branch straight from the main line.
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
          to: { x: branchTo.x, y: branchTo.y },
          fromDir: 'vertical',
          corridorY: rowCorridorY(branchFrom, index, collectedBounds),
          toDir: 'horizontal',
          fromItemTitle: mainTitle,
          toItemTitle: thisTitle,
          fromItemTarget: mainTarget,
          toItemTarget: thisTarget,
          fromNode: mainNodeGroup(
            mainIndex,
            branchFrom.y,
            mainBounds,
            collectedBounds
          ),
          toNode: branchTo.node,
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
          fromDir: 'vertical',
          corridorY: rowCorridorY(spread.from, index, collectedBounds),
          toDir: 'horizontal',
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
      const poly = getBranchRoute(backward.from, backward.to, backward);
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

  // Main connectors (by index: connector k joins main items k and k+1) that a
  // collector's timeline runs along between its branches: from where one
  // stretch of their picks rejoins the main line to where the next branches
  // off it. A stretch of two or more picks rejoins at the main item after its
  // gap; a lone pick is a spur, so the timeline carries on from where it left.
  // Main items that are part of a collector's timeline: ones they collected,
  // ones their branches leave from or rejoin at, and ones their timeline runs
  // along the main line through.
  const getBranchMainItems = (
    rowIndex: number,
    mainBounds: ContentBounds[],
    collectedBounds: ContentBounds[]
  ): Set<number> => {
    const onTimeline = new Set<number>();
    let username: string | undefined;
    processedCollected.forEach((item, index) => {
      const sourceIndex = item.sources.findIndex(
        (s) => s.rowIndex === rowIndex
      );
      if (sourceIndex < 0) {
        return;
      }
      username = item.sources[sourceIndex].username;
      getSourceBranchSegments(
        index,
        sourceIndex,
        mainBounds,
        collectedBounds
      ).forEach(({ fromItemTarget, toItemTarget }) => {
        [fromItemTarget, toItemTarget].forEach((target) => {
          if (target?.lane === 'main') {
            onTimeline.add(target.index);
          }
        });
      });
    });
    getBranchMainTravel(rowIndex).forEach((connector) => {
      onTimeline.add(connector);
      onTimeline.add(connector + 1);
    });
    if (username !== undefined) {
      items.forEach((item, index) => {
        const collectors = deps.refs.collectorsRef.current?.get(item._id);
        if (collectors?.some((c) => c.username === username)) {
          onTimeline.add(index);
        }
      });
    }
    return onTimeline;
  };

  const getBranchMainTravel = (rowIndex: number): Set<number> => {
    const picksPerGap = new Map<number, number>();
    processedCollected.forEach((item) => {
      if (item.sources.some((s) => s.rowIndex === rowIndex)) {
        const gap = getPreviousMainIndex(item.anchorTime);
        picksPerGap.set(gap, (picksPerGap.get(gap) ?? 0) + 1);
      }
    });
    const gaps = [...picksPerGap.keys()].sort((a, b) => a - b);
    const travel = new Set<number>();
    for (let k = 0; k < gaps.length - 1; k++) {
      const gap = gaps[k];
      const rejoins =
        (picksPerGap.get(gap) ?? 0) >= 2 && gap + 1 < processed.length;
      const resumeAt = rejoins ? gap + 1 : Math.max(0, gap);
      for (let index = resumeAt; index < gaps[k + 1]; index++) {
        travel.add(index);
      }
    }
    return travel;
  };

  const getCollectedBounds = (rowGrowthOverride?: number): ContentBounds[] => {
    // Grows the row spacing as the camera zooms out, faster than the
    // nodes/lines themselves thicken (LANE_GAP_GROWTH_POWER > the line/node
    // growth power), so rows keep pulling further apart at extreme zoom-out
    // rather than just barely staying clear of the bigger nodes/lines. A
    // caller can pin the growth (e.g. 1 = settled) rather than tracking the
    // live zoom.
    const rowGrowth =
      rowGrowthOverride ??
      zoomOutGrowth(runtime.zoom, runtime.fitZoomLevel, LANE_GAP_GROWTH_POWER);
    // The nearest rows also clear the main items' extra size.
    const rowGap =
      LANE_GAP * rowGrowth + (IMAGE_HEIGHT * (MAIN_ITEM_SCALE - 1)) / 2;
    const rowHeight = IMAGE_HEIGHT + COLLECTED_ROW_EXTRA_GAP * rowGrowth;
    // A pinned (settled) layout is at or past the fit level, where items are
    // their base size.
    const scale = rowGrowthOverride === undefined ? itemScale() : 1;

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
      // Laid out at base size, then grown about its centre.
      const scaledWidth = width * scale;
      const scaledHeight = height * scale;
      const left = baseLeft + offset.dx - (scaledWidth - width) / 2;
      const top = baseTop + offset.dy - (scaledHeight - height) / 2;
      bounds[index] = {
        left,
        right: left + scaledWidth,
        centerY: top + scaledHeight / 2,
        top,
        width: scaledWidth,
        height: scaledHeight,
        dateBottom: top + scaledHeight + DATE_OFFSET,
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

  // The isolated branch's own items merged by date with the active
  // collection's not-yet-collected items (skipping any the viewer has
  // already collected onto this branch), evenly spaced at a fixed step and
  // straightened onto the main line. Single source of truth for both where
  // these items are drawn (drawFrame.ts) and where the camera frames/focuses
  // them (view.ts) — kept in bounds.ts so the two can never drift apart.
  const getIsolatedMergedLine = (
    rowIndex: number,
    expandedContentId: string | null = null,
    expandProgress = 0
  ): IsolatedLine | null => {
    const cb = getCollectedBounds();
    const isolatedCollected = processedCollected
      .map((item, index) => ({ item, index }))
      .filter(
        ({ item, index }) =>
          cb[index] && item.sources.some((s) => s.rowIndex === rowIndex)
      );
    const isolatedContentIds = new Set(
      isolatedCollected.map(({ item }) => item.contentId)
    );
    const previewEntries = deps.processedPreview
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => !isolatedContentIds.has(item.contentId));

    const merged = [
      ...isolatedCollected.map(({ item, index }) => ({
        kind: 'collected' as const,
        index,
        anchorTime: item.anchorTime,
        cx: (cb[index].left + cb[index].right) / 2,
      })),
      ...previewEntries.map(({ item, index }) => ({
        kind: 'preview' as const,
        index,
        anchorTime: item.anchorTime,
        cx: timeToWorldX(item.anchorTime),
      })),
    ].sort((a, b) => a.anchorTime - b.anchorTime);

    const n = merged.length;
    if (n === 0) {
      return null;
    }

    const step = ITEM_WIDTH + ITEM_GAP;
    const centroid = merged.reduce((sum, e) => sum + e.cx, 0) / n;
    const startX = centroid - ((n - 1) * step) / 2;

    const resolveEntryContentId = (e: (typeof merged)[number]): string =>
      e.kind === 'collected'
        ? processedCollected[e.index].contentId
        : deps.processedPreview[e.index].contentId;
    const expandedK =
      expandedContentId && expandProgress > 0
        ? merged.findIndex(
            (e) => resolveEntryContentId(e) === expandedContentId
          )
        : -1;
    let expandHalfExtra = 0;
    if (expandedK >= 0) {
      const expanded = merged[expandedK];
      const baseWidth =
        expanded.kind === 'collected'
          ? cb[expanded.index].width
          : getFittedSize(
              deps.processedPreview[expanded.index].aspectRatio,
              ITEM_WIDTH,
              IMAGE_HEIGHT
            ).width;
      expandHalfExtra =
        (baseWidth * (PREVIEW_EXPAND_SCALE - 1) * expandProgress) / 2;
    }

    let minX = Infinity;
    let maxX = -Infinity;
    const entries: IsolatedLineEntry[] = merged.map((e, k) => {
      const nudge =
        expandedK < 0 || k === expandedK
          ? 0
          : k < expandedK
          ? -expandHalfExtra
          : expandHalfExtra;
      const targetCenterX = startX + k * step + nudge;
      const sizeScale =
        k === expandedK ? 1 + (PREVIEW_EXPAND_SCALE - 1) * expandProgress : 1;
      if (e.kind === 'collected') {
        const b = cb[e.index];
        const width = b.width * sizeScale;
        const height = b.height * sizeScale;
        const left = targetCenterX - width / 2;
        const top = MAIN_LINE_Y - height / 2;
        const rect: ContentBounds = {
          left,
          right: left + width,
          top,
          centerY: MAIN_LINE_Y,
          width,
          height,
          dateBottom: top + height + DATE_OFFSET,
        };
        minX = Math.min(minX, rect.left);
        maxX = Math.max(maxX, rect.right);
        return {
          kind: 'collected',
          index: e.index,
          contentId: processedCollected[e.index].contentId,
          rect,
        };
      }
      const item = deps.processedPreview[e.index];
      const fitted = getFittedSize(item.aspectRatio, ITEM_WIDTH, IMAGE_HEIGHT);
      const width = fitted.width * sizeScale * itemScale();
      const height = fitted.height * sizeScale * itemScale();
      const left = targetCenterX - width / 2;
      const top = MAIN_LINE_Y - height / 2;
      const rect: ContentBounds = {
        left,
        right: left + width,
        top,
        centerY: MAIN_LINE_Y,
        width,
        height,
        dateBottom: top + height + DATE_OFFSET,
      };
      minX = Math.min(minX, rect.left);
      maxX = Math.max(maxX, rect.right);
      return {
        kind: 'preview',
        index: e.index,
        contentId: item.contentId,
        rect,
      };
    });

    return { entries, centroid, minX, maxX };
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
    getBranchMainTravel,
    getBranchMainItems,
    getCollectedBounds,
    getIsolatedLineTargets,
    getIsolatedMergedLine,
    invalidateCollected: () => {
      gapExtraSlotsCache = null;
      branchNodeXCache = null;
      itemAttachCache = null;
    },
  };
}
