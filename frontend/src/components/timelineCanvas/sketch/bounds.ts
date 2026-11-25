import {
  BRANCH_LINE_GAP_PX,
  COLLECTED_ROW_EXTRA_GAP,
  ITEM_LABEL_GAP,
  LABEL_HEIGHT_FALLBACK_PX,
  LABEL_ROW_CLEARANCE,
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
  COLLECTION_ROW_GAP,
  MAIN_SLOT_WIDTH,
  ITEM_LABEL_SIZE_ZOOM,
} from '../constants';
import {
  getBranchRoute,
  getMainConnectorPoints,
  polylineLength,
} from '../connectors';
import { itemAppearScale } from './layoutChange';
import {
  getContentBounds,
  getFittedSize,
  itemZoomScale,
  timelineWeight,
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

// One entry (a real collected item in place on the branch, or a collectible
// placed as it would sit once collected) in the isolated view.
export type IsolatedLineEntry = {
  kind: 'collected' | 'preview';
  index: number;
  contentId: string;
  rect: ContentBounds;
  // Same-gap chain predecessor (own item or another collectible) — dotted
  // horizontal link. When absent and branchFromMain, the dotted link leaves
  // the main timeline instead (mirroring a real collect).
  linkedTo?: string;
  branchFromMain?: boolean;
  // When a collectible sits mid-chain, dotted joins into / out of the
  // neighbours it sits between (row peers and/or main) — e.g. Iman Image →
  // Show Collection → Soldering — taking the place of the solid connectors.
  linkFrom?: ConnectorPoint;
  linkOut?: ConnectorPoint;
  // Content ids at the far ends of linkFrom / linkOut (for hiding the solid
  // connectors those dotted lines replace).
  linkFromId?: string;
  linkOutId?: string;
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
  // Where the ends sit with no line thickened by a hover. The route's shape
  // is chosen from these, so hovering a line never re-routes it.
  restFrom?: ConnectorPoint;
  restTo?: ConnectorPoint;
};

// A collector's timeline as its separate stretches, each with how far along
// the timeline (from its earliest item) it starts, and the whole length.
export type TimelineFlashPath = {
  stretches: { points: ConnectorPoint[]; start: number }[];
  length: number;
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
  ) => TimelineFlashPath;
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
  getCollectedBounds: (
    rowGrowthOverride?: number,
    swap?: number
  ) => ContentBounds[];
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
  // Own branch items in place, plus collectibles placed/linked as they would
  // be once collected (same-gap chain, or branch from main).
  // `expanded` grows collection items (by content id) about their centres,
  // each by its own eased 0-1 amount.
  getIsolatedMergedLine: (
    rowIndex: number,
    expanded?: Map<string, number> | null,
    swap?: number
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
    return timelineWeight(runtime) * (1 + grow);
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
  // The same bundle with every line at its resting (unhovered) width.
  const packRestingLines = (count: number): number[] =>
    packLines(new Array<number>(count).fill(timelineWeight(runtime)));
  const halfSpanOf = (offsets: number[]) =>
    Math.max(0, ...offsets.map((offset) => Math.abs(offset)));

  // Items shrink less than the world as the camera zooms out (see
  // itemZoomScale), each growing about its own centre. While a collection is
  // isolated, or an item is focused, pin to base size so the zoom only moves
  // the camera — live growth would reflow items/connectors and jog the view
  // (e.g. the right connector on "Another Test Audio" while focusing).
  const itemScale = () =>
    runtime.branchIsolateRow !== null || runtime.focusTarget !== null
      ? 1
      : itemZoomScale(runtime.zoom, runtime.fitZoomLevel);

  // Viewing a collection hands the main timeline's extra size over to the
  // collection's items, easing with the view (0 = home screen, 1 = swapped).
  const collectionSwap = () =>
    runtime.branchIsolateRow !== null ? runtime.branchIsolate : 0;

  // An item of a timeline shown alone eases from its place on the map to its
  // cell in that timeline's grid, with the solo fade.
  const inSoloGrid = (key: string, natural: ContentBounds): ContentBounds => {
    const cell =
      runtime.branchSolo > 0 ? runtime.soloGrid?.get(key) : undefined;
    if (!cell) {
      return natural;
    }
    const t = runtime.branchSolo;
    const eased = t * t * (3 - 2 * t);
    const lerp = (from: number, to: number) => from + (to - from) * eased;
    const left = lerp(natural.left, cell.left);
    const top = lerp(natural.top, cell.top);
    const width = lerp(natural.width, cell.width);
    const height = lerp(natural.height, cell.height);
    return {
      left,
      right: left + width,
      top,
      width,
      height,
      centerY: top + height / 2,
      dateBottom: top + height + DATE_OFFSET,
    };
  };

  // Main timeline items are drawn a size up from branch items (whether or not
  // a collection is being viewed), still capped (as zooming out grows them)
  // so neighbours never grow into each other.
  const getAllBounds = () => {
    const scale = Math.min(
      itemScale() * MAIN_ITEM_SCALE,
      Math.max(MAIN_ITEM_SCALE, ITEM_ZOOM_OUT_GROWTH_MAX)
    );
    return processed.map((item, index) =>
      inSoloGrid(
        `main:${index}`,
        getContentBounds(
          index,
          item,
          itemOffsets[index],
          slotLeft(index),
          scale
        )
      )
    );
  };

  const slotCenterX = (index: number) => slotLeft(index) + ITEM_WIDTH / 2;

  // Every item on the map, main and collected alike, takes the next column
  // in date order, so neighbours are always one column apart whichever rows
  // they're in (branch items that can't collide may share one, below). A column is as wide as its item's slot (main items are drawn
  // bigger) with the usual gap between columns.
  type Column = { lane: 'main' | 'collected'; index: number; time: number };
  let columnCache: {
    main: number[];
    collected: number[];
    // Each column's date and centre, in order, for placing a date between.
    times: number[];
    centres: number[];
  } | null = null;
  const getColumns = () => {
    if (columnCache) {
      return columnCache;
    }
    const columns: Column[] = [];
    // Main items keep their order (an undated one sits with the one before).
    let mainTime = -Infinity;
    items.forEach((item, index) => {
      const time = item.date ? new Date(item.date).getTime() : Number.NaN;
      if (!Number.isNaN(time)) {
        mainTime = Math.max(mainTime, time);
      }
      columns.push({ lane: 'main', index, time: mainTime });
    });
    // A chained item always comes after the one it's chained onto.
    const chainTimes = new Map<number, number>();
    const chainTime = (index: number): number => {
      const cached = chainTimes.get(index);
      if (cached !== undefined) {
        return cached;
      }
      const predecessor = getChainPredecessorIndex(index);
      const time = Math.max(
        processedCollected[index].anchorTime,
        predecessor >= 0 ? chainTime(predecessor) : -Infinity
      );
      chainTimes.set(index, time);
      return time;
    };
    processedCollected.forEach((_, index) => {
      columns.push({ lane: 'collected', index, time: chainTime(index) });
    });
    // (Ties: main items first, then by position.)
    columns.sort(
      (a, b) =>
        a.time - b.time ||
        (a.lane === b.lane ? a.index - b.index : a.lane === 'main' ? -1 : 1)
    );
    // Branch items needn't each take a column of their own: one shares the
    // column before it when that holds only branch items it can't collide
    // with — on other collectors' rows (sharing no collector, so not chained
    // to it either), or the other branches of the same fork.
    const collectorsOf = (index: number) =>
      new Set(processedCollected[index].sources.map((s) => s.rowIndex));
    const sharesCollector = (a: number, b: number) => {
      const rows = collectorsOf(a);
      return processedCollected[b].sources.some((s) => rows.has(s.rowIndex));
    };
    const forkSiblings = (a: number, b: number) => {
      const predecessor = getChainPredecessorIndex(a);
      return (
        predecessor >= 0 &&
        predecessor === getChainPredecessorIndex(b) &&
        processedCollected[a].anchorTime === processedCollected[b].anchorTime
      );
    };
    type Group = { lane: Column['lane']; members: number[]; time: number };
    const groups: Group[] = [];
    columns.forEach((column) => {
      const last = groups[groups.length - 1];
      if (
        column.lane === 'collected' &&
        last?.lane === 'collected' &&
        last.members.every(
          (member) =>
            !sharesCollector(member, column.index) ||
            forkSiblings(member, column.index)
        )
      ) {
        last.members.push(column.index);
        return;
      }
      groups.push({
        lane: column.lane,
        members: [column.index],
        time: column.time,
      });
    });
    const slotWidth = (group: Group) =>
      group.lane === 'main' ? MAIN_SLOT_WIDTH : ITEM_WIDTH;
    const main = new Array<number>(items.length).fill(0);
    const collected = new Array<number>(processedCollected.length).fill(0);
    const times: number[] = [];
    const centres: number[] = [];
    let centre = PADDING_X + ITEM_WIDTH / 2;
    groups.forEach((group, k) => {
      if (k > 0) {
        centre += (slotWidth(groups[k - 1]) + slotWidth(group)) / 2 + ITEM_GAP;
      }
      group.members.forEach((index) => {
        (group.lane === 'main' ? main : collected)[index] = centre;
      });
      times.push(group.time);
      centres.push(centre);
    });
    columnCache = { main, collected, times, centres };
    return columnCache;
  };

  const slotLeft = (index: number): number =>
    getColumns().main[index] - ITEM_WIDTH / 2;

  // A collected item's column centre.
  const collectedColumnX = (index: number): number =>
    getColumns().collected[index];

  // Where a date falls along the map: between the columns either side of it,
  // or a column beyond the first or last.
  const timeToWorldX = (targetTime: number) => {
    const { times, centres } = getColumns();
    if (centres.length === 0) {
      return 0;
    }
    const step = ITEM_WIDTH + ITEM_GAP;
    const next = times.findIndex((time) => time > targetTime);
    if (next === -1) {
      return centres[centres.length - 1] + step;
    }
    if (next === 0) {
      return centres[0] - step;
    }
    const tPrev = times[next - 1];
    const tNext = times[next];
    const frac =
      Number.isFinite(tPrev) && tNext > tPrev
        ? (targetTime - tPrev) / (tNext - tPrev)
        : 0.5;
    return centres[next - 1] + frac * (centres[next] - centres[next - 1]);
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

  // Where a collected chain's tail would rejoin the main line: the next main
  // item after its gap. Skips items still in the future — user timelines
  // branch from past main content, they shouldn't jump forward onto upcoming
  // events (e.g. mid-2026 collects into a 2027 show).
  const rejoinMainIndex = (gapIndex: number): number => {
    const next = gapIndex + 1;
    if (next < 0 || next >= items.length) {
      return -1;
    }
    const date = items[next]?.date;
    const time = date ? new Date(date).getTime() : Number.NaN;
    if (Number.isNaN(time) || time > Date.now()) {
      return -1;
    }
    return next;
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
    // Match settled focus layout so corridor routes don't thrash mid-zoom.
    const rowGrowth =
      runtime.focusTarget !== null
        ? 1
        : zoomOutGrowth(
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
      const rejoinAt = rejoinMainIndex(gapIndex);
      if (rejoinAt >= 0 && !hasChainSuccessor(index, source.rowIndex)) {
        return rejoinAt;
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
  // `restMap` holds the same ends with no line thickened by a hover, and
  // `halfSpans` each main item's resting bundle half-width. Cached per frame
  // by the bounds array references it was built from.
  let branchNodeXCache: {
    main: ContentBounds[];
    collected: ContentBounds[];
    map: Map<string, number>;
    restMap: Map<string, number>;
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
    const restMap = new Map<string, number>();
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
      const restOffsets = packRestingLines(list.length);
      list.forEach((entry, k) => {
        map.set(entry.key, center + offsets[k]);
        restMap.set(entry.key, center + restOffsets[k]);
      });
      halfSpans.set(mainIndex, halfSpanOf(restOffsets));
    });

    branchNodeXCache = {
      main: mainBounds,
      collected: collectedBounds,
      map,
      restMap,
      halfSpans,
    };
    return map;
  };
  const getBranchRestNodeXMap = (
    mainBounds: ContentBounds[],
    collectedBounds: ContentBounds[]
  ): Map<string, number> => {
    getBranchNodeXMap(mainBounds, collectedBounds);
    return branchNodeXCache?.restMap ?? new Map<string, number>();
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
  // `restY` is the end's y with no line thickened by a hover.
  type ItemAttach = {
    x: number;
    y: number;
    restY: number;
    node: BranchNodeGroup;
  };
  let itemAttachCache: {
    main: ContentBounds[];
    collected: ContentBounds[];
    map: Map<string, ItemAttach>;
  } | null = null;
  const getItemAttachMap = (
    mainBounds: ContentBounds[],
    collectedBounds: ContentBounds[]
  ): Map<string, ItemAttach> => {
    if (
      itemAttachCache &&
      itemAttachCache.main === mainBounds &&
      itemAttachCache.collected === collectedBounds
    ) {
      return itemAttachCache.map;
    }

    // Resting positions pick each end's side and order, so a hover (which
    // nudges the ends apart) can't flip a line to the item's other side.
    const nodeXMap = getBranchRestNodeXMap(mainBounds, collectedBounds);
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
          // Tail rejoin up to the next main item (not a future one).
          const rejoinAt = rejoinMainIndex(gapIndex);
          if (
            rejoinAt >= 0 &&
            mainBounds[rejoinAt] &&
            !hasChainSuccessor(index, source.rowIndex)
          ) {
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

    const map = new Map<string, ItemAttach>();
    groups.forEach((list, groupKey) => {
      const itemIndex = Number(groupKey.slice(0, groupKey.indexOf(':')));
      const centerY = collectedBounds[itemIndex].centerY;
      list.sort((a, b) => a.orderY - b.orderY || a.key.localeCompare(b.key));
      const offsets = packLines(
        list.map((entry) => lineWeightForKey(entry.key))
      );
      const restOffsets = packRestingLines(list.length);
      const halfSpan = halfSpanOf(restOffsets);
      list.forEach((entry, k) => {
        map.set(entry.key, {
          x: entry.x,
          y: centerY + offsets[k],
          restY: centerY + restOffsets[k],
          node: {
            centre: { x: entry.x, y: centerY },
            halfSpan,
            axis: 'y',
          },
        });
      });
    });

    // Same-row chain links: both ends share one y (packed per corridor) so
    // parallel colours stay level. Per-edge packing alone can assign the
    // left and right ends different offsets and draw an angled "straight".
    type ChainLink = {
      fromKey: string;
      toKey: string;
      sourceIndex: number;
    };
    const corridors = new Map<
      string,
      { pred: number; index: number; links: ChainLink[] }
    >();
    processedCollected.forEach((item, index) => {
      if (!collectedBounds[index]) {
        return;
      }
      item.sources.forEach((source, sourceIndex) => {
        const predecessor = findChainPredecessor(index, (other) =>
          other.sources.some((s) => s.rowIndex === source.rowIndex)
        );
        if (predecessor < 0 || !collectedBounds[predecessor]) {
          return;
        }
        const corridorKey = `${predecessor}:${index}`;
        const link: ChainLink = {
          fromKey: `chainFrom:${index}:${sourceIndex}`,
          toKey: `chainTo:${index}:${sourceIndex}`,
          sourceIndex,
        };
        const existing = corridors.get(corridorKey);
        if (existing) {
          existing.links.push(link);
        } else {
          corridors.set(corridorKey, {
            pred: predecessor,
            index,
            links: [link],
          });
        }
      });
    });
    corridors.forEach(({ pred, index, links }) => {
      const pb = collectedBounds[pred];
      const ib = collectedBounds[index];
      // Forked successors sit on other rows — leave metro routing alone.
      if (Math.abs(pb.centerY - ib.centerY) > IMAGE_HEIGHT / 2) {
        return;
      }
      const centerY = (pb.centerY + ib.centerY) / 2;
      links.sort(
        (a, b) =>
          a.sourceIndex - b.sourceIndex || a.fromKey.localeCompare(b.fromKey)
      );
      const offsets = packLines(
        links.map((link) => lineWeightForKey(link.fromKey))
      );
      const restOffsets = packRestingLines(links.length);
      const halfSpan = halfSpanOf(restOffsets);
      links.forEach((link, k) => {
        const y = centerY + offsets[k];
        const restY = centerY + restOffsets[k];
        const from = map.get(link.fromKey);
        const to = map.get(link.toKey);
        if (from) {
          from.y = y;
          from.restY = restY;
          from.node = {
            centre: { x: from.x, y: centerY },
            halfSpan,
            axis: 'y',
          };
        }
        if (to) {
          to.y = y;
          to.restY = restY;
          to.node = {
            centre: { x: to.x, y: centerY },
            halfSpan,
            axis: 'y',
          };
        }
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
    const restNodeX =
      getBranchRestNodeXMap(mainBounds, collectedBounds).get(
        `${index}:${sourceIndex}`
      ) ?? nodeX;
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
        restFrom: chainFromAttach && {
          x: chainFromAttach.x,
          y: chainFromAttach.restY,
        },
        restTo: chainToAttach && { x: chainToAttach.x, y: chainToAttach.restY },
      });

      // The tail of the chain rejoins the main timeline at the next item,
      // unless that item is still in the future.
      const gapIndex = getPreviousMainIndex(item.anchorTime);
      const rejoinAt = rejoinMainIndex(gapIndex);
      const nextMain = rejoinAt >= 0 ? mainBounds[rejoinAt] : null;
      if (nextMain && !hasChainSuccessor(index, source.rowIndex)) {
        const rejoinTitle = processed[rejoinAt]?.title;
        const rejoinTarget: FocusTarget = { lane: 'main', index: rejoinAt };
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
              rejoinAt,
              rejoinFrom.y,
              mainBounds,
              collectedBounds
            ),
            toNode: rejoinTo.node,
            restFrom: { x: restNodeX ?? nodeX, y: rejoinFrom.y },
            restTo: { x: rejoinTo.x, y: rejoinTo.restY },
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
          restFrom: { x: restNodeX ?? nodeX, y: branchFrom.y },
          restTo: { x: branchTo.x, y: branchTo.restY },
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
  ): TimelineFlashPath => {
    // Every stretch of the timeline — its lines to and from collected items,
    // and the main line it runs along between them — each running from its
    // earlier item to its later one.
    const timeOf = (target: FocusTarget | undefined): number => {
      if (!target) {
        return Number.NaN;
      }
      if (target.lane === 'collected') {
        return processedCollected[target.index]?.anchorTime ?? Number.NaN;
      }
      const date = items[target.index]?.date;
      return date ? new Date(date).getTime() : Number.NaN;
    };
    const keyOf = (target: FocusTarget | undefined) =>
      target ? `${target.lane}:${target.index}` : '';
    const stretches: {
      from: number;
      to: number;
      fromKey: string;
      toKey: string;
      points: ConnectorPoint[];
    }[] = [];
    processedCollected.forEach((item, index) => {
      item.sources.forEach((source, sourceIndex) => {
        if (source.rowIndex !== rowIndex) {
          return;
        }
        getSourceBranchSegments(
          index,
          sourceIndex,
          mainBounds,
          collectedBounds
        ).forEach((segment) => {
          const fromTime = timeOf(segment.fromItemTarget);
          const toTime = timeOf(segment.toItemTarget);
          const points = getBranchRoute(segment.from, segment.to, segment);
          const fromKey = keyOf(segment.fromItemTarget);
          const toKey = keyOf(segment.toItemTarget);
          stretches.push(
            toTime < fromTime
              ? {
                  from: toTime,
                  to: fromTime,
                  fromKey: toKey,
                  toKey: fromKey,
                  points: [...points].reverse(),
                }
              : { from: fromTime, to: toTime, fromKey, toKey, points }
          );
        });
      });
    });
    getBranchMainTravel(rowIndex).forEach((connector) => {
      const from = mainBounds[connector];
      const to = mainBounds[connector + 1];
      if (!from || !to) {
        return;
      }
      stretches.push({
        from: timeOf({ lane: 'main', index: connector }),
        to: timeOf({ lane: 'main', index: connector + 1 }),
        fromKey: `main:${connector}`,
        toKey: `main:${connector + 1}`,
        points: getMainConnectorPoints(
          { x: from.right, y: from.centerY },
          { x: to.left, y: to.centerY }
        ),
      });
    });
    // How far along the timeline (from its earliest item) the flash reaches
    // each item, earliest first; each stretch starts where its earlier item
    // is reached, so where the timeline branches the flash splits and runs
    // down every branch at once.
    stretches.sort((a, b) => a.from - b.from || a.to - b.to);
    const reached = new Map<string, number>();
    const laid = stretches.map((stretch) => {
      const start = reached.get(stretch.fromKey) ?? 0;
      const end = start + polylineLength(stretch.points);
      reached.set(
        stretch.toKey,
        Math.min(reached.get(stretch.toKey) ?? end, end)
      );
      return { points: stretch.points, start };
    });
    return {
      stretches: laid,
      length: Math.max(
        0,
        ...laid.map((stretch) => stretch.start + polylineLength(stretch.points))
      ),
    };
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
      const rejoinAt = rejoinMainIndex(gap);
      const rejoins = (picksPerGap.get(gap) ?? 0) >= 2 && rejoinAt >= 0;
      const resumeAt = rejoins ? rejoinAt : Math.max(0, gap);
      for (let index = resumeAt; index < gaps[k + 1]; index++) {
        travel.add(index);
      }
    }
    return travel;
  };

  // Which row each collector's timeline sits in. Each keeps its side of the
  // main line (by its own row's parity), but collectors whose lines don't
  // overlap left to right share a row, nearest the main line first, rather
  // than each taking a row of its own further out.
  const collectorLanes = (): Map<number, number> => {
    const mainBounds = getAllBounds();
    type Extent = { left: number; right: number };
    // What each row holds: the stretches of line to its items, each running
    // from the main item before it to the one after. (A line to an item
    // several collected runs along that item's row, which is its first
    // collector's.)
    const stretches = new Map<number, Extent[]>();
    processedCollected.forEach((item, index) => {
      // One chained onto another sits beside it, in that one's row.
      if (getChainPredecessorIndex(index) >= 0) {
        return;
      }
      const centre = collectedColumnX(index);
      let left = centre - ITEM_WIDTH / 2;
      let right = centre + ITEM_WIDTH / 2;
      const prev = getPreviousMainIndex(item.anchorTime);
      if (prev >= 0 && mainBounds[prev]) {
        left = Math.min(left, mainBounds[prev].right);
      }
      if (mainBounds[prev + 1]) {
        right = Math.max(right, mainBounds[prev + 1].left);
      }
      const row = item.rowIndex;
      stretches.set(row, [...(stretches.get(row) ?? []), { left, right }]);
    });
    const apart = (a: Extent, b: Extent) =>
      a.right + ITEM_GAP <= b.left || a.left >= b.right + ITEM_GAP;
    const allApart = (as: Extent[], bs: Extent[]) =>
      as.every((a) => bs.every((b) => apart(a, b)));
    const lanes = new Map<number, number>();
    // Per side, what's already in each of its rows (nearest first).
    const taken: { stretches: Extent[] }[][] = [[], []];
    [...stretches.keys()]
      .sort((a, b) => a - b)
      .forEach((rowIndex) => {
        const ownStretches = stretches.get(rowIndex) ?? [];
        const side = rowIndex % 2;
        const slots = taken[side];
        // Its lines clear of those already in the row. (Rows stay evenly
        // spaced, with none left empty between them.)
        const fits = (slot: number) =>
          allApart(ownStretches, slots[slot]?.stretches ?? []);
        let slot = 0;
        while (!fits(slot)) {
          slot += 1;
        }
        while (slots.length <= slot) {
          slots.push({ stretches: [] });
        }
        slots[slot].stretches.push(...ownStretches);
        lanes.set(rowIndex, slot * 2 + side);
      });
    return lanes;
  };

  const getCollectedBounds = (
    rowGrowthOverride?: number,
    swap = collectionSwap()
  ): ContentBounds[] => {
    // Grows the row spacing as the camera zooms out, faster than the
    // nodes/lines themselves thicken (LANE_GAP_GROWTH_POWER > the line/node
    // growth power), so rows keep pulling further apart at extreme zoom-out
    // rather than just barely staying clear of the bigger nodes/lines. A
    // caller can pin the growth (e.g. 1 = settled) rather than tracking the
    // live zoom.
    // Isolation also pins row spacing (same reason as itemScale above).
    const rowGrowth =
      rowGrowthOverride ??
      (runtime.branchIsolateRow !== null
        ? 1
        : zoomOutGrowth(
            runtime.zoom,
            runtime.fitZoomLevel,
            LANE_GAP_GROWTH_POWER
          ));
    // The nearest rows also clear the main items' extra size.
    const rowGap =
      LANE_GAP * rowGrowth + (IMAGE_HEIGHT * (MAIN_ITEM_SCALE - 1)) / 2;
    const rowHeight = IMAGE_HEIGHT + COLLECTED_ROW_EXTRA_GAP * rowGrowth;
    // A pinned (settled) layout is at or past the fit level, where items are
    // their base size.
    const scale = rowGrowthOverride === undefined ? itemScale() : 1;

    const bounds: ContentBounds[] = new Array(processedCollected.length);
    const placedRow = new Array<number>(processedCollected.length).fill(-1);
    const swapping = new Array<boolean>(processedCollected.length).fill(false);
    // Rightmost edge used so far per row, to keep items from overlapping.
    const rowPrevRight = new Map<number, number>();
    // How many items already attach to a given predecessor, so a fork (one
    // item feeding several) stacks its branches into separate rows.
    const successorCount = new Map<number, number>();
    const laneFor = collectorLanes();

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
      // Centred in its own column (see getColumns).
      let baseLeft = collectedColumnX(index) - width / 2;
      if (predecessor >= 0 && bounds[predecessor]) {
        // In the chained predecessor's row, to its right. The first branch
        // shares that row; extra branches (a fork) stack into rows below it.
        const branch = successorCount.get(predecessor) ?? 0;
        successorCount.set(predecessor, branch + 1);
        rowIndex = placedRow[predecessor] + branch;
      } else {
        rowIndex = laneFor.get(item.rowIndex) ?? item.rowIndex;
      }

      const prevRight = rowPrevRight.get(rowIndex) ?? -Infinity;
      if (baseLeft < prevRight + ITEM_GAP) {
        baseLeft = prevRight + ITEM_GAP;
      }
      rowPrevRight.set(rowIndex, baseLeft + width);
      placedRow[index] = rowIndex;

      // Own branch items stay where they already sit — isolation only adds
      // collectibles stemming off them (see getIsolatedMergedLine).
      // Image middles share the row centreline so same-row chain connectors
      // run level into each other (height only changes top/bottom crop).
      const rowTop = rowTopForRowIndex(rowIndex, rowGap, rowHeight);
      const rowCenterY = rowTop + IMAGE_HEIGHT / 2;
      const offset = collectedOffsets[index];
      // Laid out at base size, then grown about its centre.
      const grow = scale * itemAppearScale(deps, item.contentId);
      const scaledWidth = width * grow;
      const scaledHeight = height * grow;
      const left = baseLeft + offset.dx - (scaledWidth - width) / 2;
      const centerY = rowCenterY + offset.dy;
      const top = centerY - scaledHeight / 2;
      bounds[index] = inSoloGrid(`collected:${index}`, {
        left,
        right: left + scaledWidth,
        centerY,
        top,
        width: scaledWidth,
        height: scaledHeight,
        dateBottom: top + scaledHeight + DATE_OFFSET,
      });
    }

    makeRoomForLabels(bounds, placedRow, swapping, swap);
    return bounds;
  };

  // Rows sit their usual distance apart unless an item's label (hung away
  // from the main line: under items below it, on top of those above) would
  // reach the next row out where something sits across from it; then that
  // row, and every row past it, moves out just enough to clear it.
  const makeRoomForLabels = (
    bounds: ContentBounds[],
    placedRow: number[],
    swapping: boolean[],
    swap: number
  ) => {
    // Each side's rows, nearest the main line first, holding their items.
    const slots: number[][][] = [[], []];
    placedRow.forEach((row, index) => {
      if (row < 0 || !bounds[index]) {
        return;
      }
      // (Items moving over to view a collection keep out of it.)
      if (swapping[index] && swap > 0) {
        return;
      }
      const side = row % 2;
      const slot = Math.floor(row / 2);
      (slots[side][slot] ??= []).push(index);
    });
    // Item labels are a fixed size on the map (see drawFrame), measured in
    // world units, so the rows hold still whatever the zoom.
    const labelHeight = (index: number) =>
      runtime.labelHeights.get(processedCollected[index].contentId) ??
      LABEL_HEIGHT_FALLBACK_PX / ITEM_LABEL_SIZE_ZOOM;
    const labelSpan = (b: ContentBounds) => {
      const half = ITEM_WIDTH / 2;
      const centre = (b.left + b.right) / 2;
      return { left: centre - half, right: centre + half };
    };
    const across = (a: ContentBounds, b: ContentBounds) => {
      const span = labelSpan(a);
      return span.left < b.right && span.right > b.left;
    };
    const shiftBySlot: number[][] = [[], []];
    [0, 1].forEach((side) => {
      let shift = 0;
      const rows = slots[side];
      for (let slot = 0; slot < rows.length; slot++) {
        const inner = rows[slot - 1] ?? [];
        let need = 0;
        (rows[slot] ?? []).forEach((outerIndex) => {
          const outer = bounds[outerIndex];
          inner.forEach((innerIndex) => {
            const near = bounds[innerIndex];
            if (!across(near, outer)) {
              return;
            }
            const reach =
              ITEM_LABEL_GAP + labelHeight(innerIndex) + LABEL_ROW_CLEARANCE;
            const room =
              side === 0
                ? outer.top - (near.top + near.height)
                : near.top - (outer.top + outer.height);
            need = Math.max(need, reach - room);
          });
        });
        shift += need;
        shiftBySlot[side][slot] = shift;
      }
    });
    placedRow.forEach((row, index) => {
      const b = bounds[index];
      if (row < 0 || !b) {
        return;
      }
      const side = row % 2;
      const shift =
        (shiftBySlot[side][Math.floor(row / 2)] ?? 0) *
        (swapping[index] ? 1 - swap : 1);
      if (shift === 0) {
        return;
      }
      const dy = side === 0 ? shift : -shift;
      b.top += dy;
      b.centerY += dy;
      b.dateBottom += dy;
    });
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

  // Own branch items stay put; collectibles are placed as a real collect on
  // this row would be (skipping any already collected onto the branch).
  // When the same content already sits on the map — main timeline or any
  // collector's copy — the collectible overlays that spot (a real collect
  // merges into that tile and stays put). Only content with no map copy yet
  // gets a new stem on this row.
  const getIsolatedMergedLine = (
    rowIndex: number,
    expanded: Map<string, number> | null = null,
    swap = collectionSwap()
  ): IsolatedLine | null => {
    const cb = getCollectedBounds(undefined, swap);
    const mainBounds = getAllBounds();
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

    // Own items stay put. Collectibles are placed as they would be once
    // collected on this row: same-gap successors chain to the right of the
    // previous pick; otherwise they sit at their date and branch from the
    // main timeline (through main, then out — not a sideways stem off an
    // existing user item in another gap).
    const own = isolatedCollected
      .map(({ item, index }) => ({
        kind: 'collected' as const,
        index,
        contentId: item.contentId,
        anchorTime: item.anchorTime,
        rect: cb[index],
      }))
      .sort((a, b) => a.anchorTime - b.anchorTime);
    const previews = previewEntries
      .map(({ item, index }) => ({ item, index }))
      .sort((a, b) => a.item.anchorTime - b.item.anchorTime);
    if (own.length === 0 && previews.length === 0) {
      return null;
    }

    const previewSize = (item: (typeof previews)[number]['item']) => {
      const fitted = getFittedSize(item.aspectRatio, ITEM_WIDTH, IMAGE_HEIGHT);
      // The same size as the items around them.
      const sizeScale = itemScale();
      return {
        width: fitted.width * sizeScale,
        height: fitted.height * sizeScale,
        expand:
          1 + (PREVIEW_EXPAND_SCALE - 1) * (expanded?.get(item.contentId) ?? 0),
      };
    };

    // Where this content already lives on the map: main first, else the
    // (single, merged) collected tile — collecting would join that tile.
    const mapCounterpart = (
      contentId: string
    ): { rect: ContentBounds; onMain: boolean } | null => {
      const mainIndex = items.findIndex((entry) => entry._id === contentId);
      if (mainIndex >= 0 && mainBounds[mainIndex]) {
        return { rect: mainBounds[mainIndex], onMain: true };
      }
      const collectedIndex = processedCollected.findIndex(
        (entry) => entry.contentId === contentId
      );
      if (collectedIndex >= 0 && cb[collectedIndex]) {
        return { rect: cb[collectedIndex], onMain: false };
      }
      return null;
    };

    const rectAtCounterpart = (
      item: (typeof previews)[number]['item'],
      counterpart: ContentBounds
    ): ContentBounds => {
      const {
        width: baseWidth,
        height: baseHeight,
        expand,
      } = previewSize(item);
      const width = baseWidth * expand;
      const height = baseHeight * expand;
      const left = counterpart.left + counterpart.width / 2 - width / 2;
      const top = counterpart.centerY - height / 2;
      return {
        left,
        right: left + width,
        top,
        centerY: counterpart.centerY,
        width,
        height,
        dateBottom: top + height + DATE_OFFSET,
      };
    };

    // Main-timeline dates: a collectible chains from the previous pick on
    // the same row only when no main item falls strictly between them. A
    // main item in between means a real collect would rejoin main and
    // branch out again — use a stem from main for that case.
    const mainTimes = items
      .map((entry) =>
        entry.date ? new Date(entry.date).getTime() : Number.NaN
      )
      .filter((t) => !Number.isNaN(t));
    const mainBetween = (earlier: number, later: number) =>
      mainTimes.some((t) => t > earlier && t < later);

    // Immediate spatial neighbours a collectible sits between. Same-row tiles
    // must be adjacent (chain spacing) — packed-row strangers further away
    // don't count, or chain-starts like Drum Break grow a dotted line out
    // into empty space. Main items only fill the missing side when the other
    // side is already an adjacent row peer (branch tail → next main, e.g.
    // Iman Image → Show Collection → Soldering). Through-join only with both
    // sides; a chain start stems from main.
    type ThroughPeer = { contentId: string; rect: ContentBounds };
    const chainGap = ITEM_GAP * 1.5;
    const throughJoinAt = (
      rect: ContentBounds,
      contentId: string,
      rowPeers: ThroughPeer[],
      opts?: { onMain?: boolean; allowMainSucc?: boolean }
    ): Pick<
      IsolatedLineEntry,
      | 'linkedTo'
      | 'linkFrom'
      | 'linkOut'
      | 'linkFromId'
      | 'linkOutId'
      | 'branchFromMain'
    > => {
      const sameRow = (r: ContentBounds) =>
        Math.abs(r.centerY - rect.centerY) < IMAGE_HEIGHT / 2;
      const row = rowPeers.filter(
        (p) => p.contentId !== contentId && sameRow(p.rect)
      );
      const mainPeers: ThroughPeer[] = items
        .map((entry, mainIndex) =>
          mainBounds[mainIndex]
            ? { contentId: entry._id, rect: mainBounds[mainIndex] }
            : null
        )
        .filter((p): p is ThroughPeer => p !== null);
      // Adjacent only — ignores other collectors sharing the row further out.
      const earlierRow = row
        .filter(
          (p) =>
            p.rect.right <= rect.left + 1 &&
            rect.left - p.rect.right <= chainGap
        )
        .sort((a, b) => b.rect.right - a.rect.right);
      const laterRow = row
        .filter(
          (p) =>
            p.rect.left >= rect.right - 1 &&
            p.rect.left - rect.right <= chainGap
        )
        .sort((a, b) => a.rect.left - b.rect.left);
      const earlierMain = mainPeers
        .filter((p) => p.rect.right <= rect.left + 1)
        .sort((a, b) => b.rect.right - a.rect.right);
      const laterMain = mainPeers
        .filter((p) => p.rect.left >= rect.right - 1)
        .sort((a, b) => a.rect.left - b.rect.left);

      let pred = earlierRow[0];
      let succ = laterRow[0];
      if (opts?.onMain) {
        pred = pred ?? earlierMain[0];
        succ = succ ?? laterMain[0];
      } else if (opts?.allowMainSucc && pred && !succ) {
        // Free-placed into a rejoin slot: dotted out to the next main item.
        succ = laterMain[0];
      } else if (!pred && succ) {
        // Adjacent row peer only on the right: chain start — stem from main,
        // no dotted line out to that neighbour alone.
        return { branchFromMain: true };
      }

      if (pred && succ) {
        return {
          linkedTo: pred.contentId,
          linkFrom: { x: pred.rect.right, y: pred.rect.centerY },
          linkOut: { x: succ.rect.left, y: succ.rect.centerY },
          linkFromId: pred.contentId,
          linkOutId: succ.contentId,
        };
      }
      if (pred) {
        // Mid-chain overlay with only a left neighbour: keep linking in, but
        // do NOT invent a long dotted line out to a distant main item (that
        // was the Drum Break stray). A real chain-start overlay with no
        // adjacent peers falls through to branchFromMain below.
        return {
          linkedTo: pred.contentId,
          linkFrom: { x: pred.rect.right, y: pred.rect.centerY },
          linkFromId: pred.contentId,
        };
      }
      // Chain start / lone overlay — keep the stem from the main timeline.
      return { branchFromMain: true };
    };

    // Overlay a collectible on an existing map tile. Main-timeline overlays
    // through-join adjacent main items when mid-line; collected overlays
    // through-join their row (and main, when that's the next neighbour).
    const placeOnCounterpart = (
      item: (typeof previews)[number]['item'],
      index: number,
      counterpart: { rect: ContentBounds; onMain: boolean }
    ): IsolatedLineEntry => {
      const rect = rectAtCounterpart(item, counterpart.rect);
      const rowPeers: ThroughPeer[] = [];
      if (!counterpart.onMain) {
        processedCollected.forEach((other, otherIndex) => {
          const otherRect = cb[otherIndex];
          if (!otherRect || other.contentId === item.contentId) {
            return;
          }
          // Only neighbours still shown while the collection is viewed (the
          // viewer's own items): other collectors' fade away, and a line
          // joining one would run out to nothing.
          if (!other.sources.some((s) => s.rowIndex === rowIndex)) {
            return;
          }
          rowPeers.push({ contentId: other.contentId, rect: otherRect });
        });
      }
      placed.forEach((p) => {
        rowPeers.push({ contentId: p.contentId, rect: p.rect });
      });
      const join = throughJoinAt(rect, item.contentId, rowPeers, {
        onMain: counterpart.onMain,
      });
      return {
        kind: 'preview',
        index,
        contentId: item.contentId,
        rect,
        ...join,
      };
    };

    const placed: IsolatedLineEntry[] = [];
    if (own.length === 0) {
      // No branch yet: collection items sit in a row just above the main
      // timeline, spaced evenly along its length — unless a counterpart
      // already exists on the map, in which case they overlay it.
      const start = mainBounds[0]?.left ?? 0;
      const end = mainBounds[mainBounds.length - 1]?.right ?? start;
      const free = previews.filter(
        ({ item }) => !mapCounterpart(item.contentId)
      );
      const step = (end - start) / Math.max(free.length, 1);
      const centerY =
        MAIN_LINE_Y -
        (IMAGE_HEIGHT * (1 + MAIN_ITEM_SCALE)) / 2 -
        COLLECTION_ROW_GAP;
      let freeIndex = 0;
      previews.forEach(({ item, index }) => {
        const counterpart = mapCounterpart(item.contentId);
        if (counterpart) {
          placed.push(placeOnCounterpart(item, index, counterpart));
          return;
        }
        const {
          width: baseWidth,
          height: baseHeight,
          expand,
        } = previewSize(item);
        const width = baseWidth * expand;
        const height = baseHeight * expand;
        const left = start + step * (freeIndex + 0.5) - width / 2;
        freeIndex += 1;
        const top = centerY - height / 2;
        placed.push({
          kind: 'preview',
          index,
          contentId: item.contentId,
          rect: {
            left,
            right: left + width,
            top,
            centerY,
            width,
            height,
            dateBottom: top + height + DATE_OFFSET,
          },
          branchFromMain: true,
        });
      });
    } else {
      const centerY = own[0].rect.centerY;
      // Occupied spans on this row (own items + placed collectibles), so new
      // picks don't overlap. Counterparts on other rows don't reserve space.
      const occupied: { left: number; right: number }[] = own.map((o) => ({
        left: o.rect.left,
        right: o.rect.right,
      }));
      const clearLeft = (width: number, preferredLeft: number) => {
        let left = preferredLeft;
        let guard = 0;
        while (guard++ < occupied.length + 2) {
          const hit = occupied.find(
            (o) => left < o.right + ITEM_GAP && left + width > o.left - ITEM_GAP
          );
          if (!hit) {
            break;
          }
          left = hit.right + ITEM_GAP;
        }
        return left;
      };

      previews.forEach(({ item, index }) => {
        const counterpart = mapCounterpart(item.contentId);
        if (counterpart) {
          placed.push(placeOnCounterpart(item, index, counterpart));
          return;
        }
        const {
          width: baseWidth,
          height: baseHeight,
          expand,
        } = previewSize(item);
        const width = baseWidth * expand;
        const height = baseHeight * expand;
        const time = item.anchorTime;
        type Pred = { contentId: string; right: number; time: number };
        const candidates: Pred[] = [
          ...own
            .filter(
              (o) => o.anchorTime < time && !mainBetween(o.anchorTime, time)
            )
            .map((o) => ({
              contentId: o.contentId,
              right: o.rect.right,
              time: o.anchorTime,
            })),
          ...placed
            .filter((p) => Math.abs(p.rect.centerY - centerY) < IMAGE_HEIGHT)
            .map((p) => {
              const pt = previews.find((e) => e.item.contentId === p.contentId)
                ?.item.anchorTime;
              return pt !== undefined && pt < time && !mainBetween(pt, time)
                ? {
                    contentId: p.contentId,
                    right: p.rect.right,
                    time: pt,
                  }
                : null;
            })
            .filter((p): p is Pred => p !== null),
        ];
        candidates.sort((a, b) => b.time - a.time);
        const chainPred = candidates[0];
        // No same-gap chain pred, but this row already has picks in this main
        // gap that rejoin the next main item: sit in that rejoin slot (after
        // the chain tail) so the dotted line can replace the solid rejoin —
        // e.g. Iman Image → Show Collection → Soldering.
        const gapIndex = getPreviousMainIndex(time);
        const rejoinAt = rejoinMainIndex(gapIndex);
        const gapOwn = own
          .filter((o) => getPreviousMainIndex(o.anchorTime) === gapIndex)
          .sort(
            (a, b) => a.anchorTime - b.anchorTime || a.rect.left - b.rect.left
          );
        const rejoinTail =
          !chainPred &&
          rejoinAt >= 0 &&
          mainBounds[rejoinAt] &&
          gapOwn.length > 0
            ? gapOwn[gapOwn.length - 1]
            : null;
        const preferredLeft = rejoinTail
          ? rejoinTail.rect.right + ITEM_GAP
          : chainPred
          ? chainPred.right + ITEM_GAP
          : timeToWorldX(time) - width / 2;
        const left = clearLeft(width, preferredLeft);
        const top = centerY - height / 2;
        const rect: ContentBounds = {
          left,
          right: left + width,
          top,
          centerY,
          width,
          height,
          dateBottom: top + height + DATE_OFFSET,
        };
        const rowPeers: ThroughPeer[] = [
          ...own.map((o) => ({ contentId: o.contentId, rect: o.rect })),
          ...placed.map((p) => ({ contentId: p.contentId, rect: p.rect })),
        ];
        const join = throughJoinAt(rect, item.contentId, rowPeers, {
          // Only the rejoin-slot insert may dotted-out to main (Soldering).
          allowMainSucc: rejoinTail !== null,
        });
        placed.push({
          kind: 'preview',
          index,
          contentId: item.contentId,
          rect,
          ...join,
        });
        occupied.push({ left, right: left + width });
        occupied.sort((a, b) => a.left - b.left);
      });
    }

    const entries: IsolatedLineEntry[] = [
      ...own.map(({ kind, index, contentId, rect }) => ({
        kind,
        index,
        contentId,
        rect,
      })),
      ...placed,
    ];
    const minX = Math.min(...entries.map((e) => e.rect.left));
    const maxX = Math.max(...entries.map((e) => e.rect.right));
    const centroid = (minX + maxX) / 2;

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
      columnCache = null;
      branchNodeXCache = null;
      itemAttachCache = null;
    },
  };
}
