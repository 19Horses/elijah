import type p5 from 'p5';
import { drawNodeFlare } from '../connectors';
import {
  DOT_RADIUS,
  EDGE_NODE_GAP_PX,
  EDGE_NODE_HIT_PAD_PX,
  EDGE_NODE_HOLE_RATIO,
  EDGE_NODE_INSET_PX,
  EDGE_NODE_CARD_CLEARANCE_PX,
  EDGE_NODE_RADIUS_PX,
  NODE_GROW_LERP,
} from '../constants';
import type {
  ConnectorPoint,
  ContentBounds,
  FocusTarget,
  NodeHoverRegion,
  TimelineRuntime,
  TimelineSketchDeps,
} from '../types';
import type { BoundsContext } from './bounds';

export type EdgeSide = 'top' | 'right' | 'bottom' | 'left';

// Where a branch node settles once its item is focused: a world position that
// lands on the viewport edge matching the side of the item it sat on.
// `hidden`: another node on the same edge leads to the same item, so this one
// shares its spot and isn't drawn (or hoverable) itself. `others`: on the one
// shown, how many other timelines share it.
export type EdgeNode = ConnectorPoint & {
  side: EdgeSide;
  hidden?: boolean;
  others?: number;
};

export type EdgeNodeLayout = {
  // Sprung 0-1: 0 leaves the nodes on the item's edges, 1 has them fully out at
  // the viewport edges; briefly past 1 as they overshoot. Drives everything
  // but the nodes' horizontal movement, which follows the overshoot-free
  // `progressX`.
  progress: number;
  progressX: number;
  nodes: Map<string, EdgeNode>;
};

type SegmentEnd = 'from' | 'to';

export function edgeNodeKey(
  index: number,
  sourceIndex: number,
  segmentIndex: number,
  end: SegmentEnd
): string {
  return `${index}:${sourceIndex}:${segmentIndex}:${end}`;
}

// Key for an end of the main-line connector from main item `index` to the next.
export function mainEdgeNodeKey(index: number, end: SegmentEnd): string {
  return `main:${index}:${end}`;
}

// How much further a moving end's last straight runs on, so its line carries
// on past the viewport edge once the node is out there.
export function edgeNodeRunOn(layout: EdgeNodeLayout, zoom: number): number {
  return (layout.progress * EDGE_NODE_INSET_PX * 2) / zoom;
}

// The side of the item an endpoint sits on: whichever edge it is closest to.
function nearestSide(pt: ConnectorPoint, bounds: ContentBounds): EdgeSide {
  const distances: [EdgeSide, number][] = [
    ['top', Math.abs(pt.y - bounds.top)],
    ['bottom', Math.abs(pt.y - (bounds.top + bounds.height))],
    ['left', Math.abs(pt.x - bounds.left)],
    ['right', Math.abs(pt.x - bounds.right)],
  ];
  return distances.reduce((best, entry) =>
    entry[1] < best[1] ? entry : best
  )[0];
}

// Evenly spaced screen positions along one viewport edge, centred on `centre`
// but kept clear of the corners; the gap tightens if they wouldn't otherwise
// fit.
function spreadAlongEdge(
  count: number,
  centre: number,
  span: number
): number[] {
  const margin = EDGE_NODE_INSET_PX * 2;
  const room = Math.max(0, span - margin * 2);
  const gap = count > 1 ? Math.min(EDGE_NODE_GAP_PX, room / (count - 1)) : 0;
  const half = (gap * (count - 1)) / 2;
  const clamped = Math.min(
    Math.max(centre, margin + half),
    Math.max(margin + half, span - margin - half)
  );
  return Array.from({ length: count }, (_, k) => clamped - half + k * gap);
}

// Lays out every branch node attached to the focused item along the viewport
// edge matching the side of the item it sits on, keeping each side's order.
// Returns null when no item's nodes are out at the edges.
export function buildEdgeNodeLayout(
  p: p5,
  deps: TimelineSketchDeps,
  boundsCtx: BoundsContext,
  mainBounds: ContentBounds[],
  collectedBounds: ContentBounds[]
): EdgeNodeLayout | null {
  const { runtime } = deps;
  const target = runtime.edgeNodesTarget;
  if (!target || runtime.edgeNodes <= 0) {
    runtime.edgeNodePush.clear();
    return null;
  }
  const itemBounds =
    target.lane === 'main'
      ? mainBounds[target.index]
      : collectedBounds[target.index];
  if (!itemBounds) {
    return null;
  }

  const isTarget = (other: FocusTarget | undefined) =>
    other !== undefined &&
    other.lane === target.lane &&
    other.index === target.index;

  type SideEntry = {
    key: string;
    along: number;
    // The item at the line's far end, and which timeline's line it is (the
    // main line first, then collectors by row), so several nodes on one edge
    // leading to the same item can show as one — the earliest timeline's.
    far: string;
    rank: number;
  };
  const sides: Record<EdgeSide, SideEntry[]> = {
    top: [],
    right: [],
    bottom: [],
    left: [],
  };
  const add = (
    key: string,
    pt: ConnectorPoint,
    far: FocusTarget | undefined,
    rank: number
  ) => {
    const side = nearestSide(pt, itemBounds);
    const along = side === 'top' || side === 'bottom' ? pt.x : pt.y;
    sides[side].push({
      key,
      along,
      far: far ? `${far.lane}:${far.index}` : key,
      rank,
    });
  };

  deps.processedCollected.forEach((item, index) => {
    item.sources.forEach((source, sourceIndex) => {
      const rank = source.rowIndex + 1;
      boundsCtx
        .getSourceBranchSegments(
          index,
          sourceIndex,
          mainBounds,
          collectedBounds
        )
        .forEach((segment, segmentIndex) => {
          if (isTarget(segment.fromItemTarget)) {
            add(
              edgeNodeKey(index, sourceIndex, segmentIndex, 'from'),
              segment.from,
              segment.toItemTarget,
              rank
            );
          }
          if (isTarget(segment.toItemTarget)) {
            add(
              edgeNodeKey(index, sourceIndex, segmentIndex, 'to'),
              segment.to,
              segment.fromItemTarget,
              rank
            );
          }
        });
    });
  });
  // The main line's ends on a focused main item: the line in from the previous
  // item meets its left side, the line on to the next leaves its right.
  if (target.lane === 'main') {
    if (target.index > 0) {
      add(
        mainEdgeNodeKey(target.index - 1, 'to'),
        { x: itemBounds.left, y: itemBounds.centerY },
        { lane: 'main', index: target.index - 1 },
        0
      );
    }
    if (target.index < mainBounds.length - 1) {
      add(
        mainEdgeNodeKey(target.index, 'from'),
        { x: itemBounds.right, y: itemBounds.centerY },
        { lane: 'main', index: target.index + 1 },
        0
      );
    }
  }

  const toWorld = (screenX: number, screenY: number): ConnectorPoint => ({
    x: runtime.cameraX + screenX / runtime.zoom,
    y: runtime.cameraY + screenY / runtime.zoom,
  });
  const centreX =
    ((itemBounds.left + itemBounds.right) / 2 - runtime.cameraX) * runtime.zoom;
  const centreY =
    (itemBounds.top + itemBounds.height / 2 - runtime.cameraY) * runtime.zoom;

  const nodes = new Map<string, EdgeNode>();
  (Object.keys(sides) as EdgeSide[]).forEach((side) => {
    // One node per far item on this edge: the earliest timeline's. The rest
    // share its spot, hidden.
    const shown = new Map<string, SideEntry>();
    sides[side].forEach((entry) => {
      const current = shown.get(entry.far);
      if (!current || entry.rank < current.rank) {
        shown.set(entry.far, entry);
      }
    });
    const list = [...shown.values()];
    list.sort((a, b) => a.along - b.along || a.key.localeCompare(b.key));
    const horizontal = side === 'top' || side === 'bottom';
    const slots = horizontal
      ? spreadAlongEdge(list.length, centreX, p.width)
      : spreadAlongEdge(list.length, centreY, p.height);
    // Nodes either side of the hovered one move apart to clear its card. Each
    // node eases to its push, so they glide aside and back as the hover moves
    // from node to node (this eased state carries over between frames).
    const hovered = list.findIndex(
      (entry) => entry.key === runtime.hoverEdgeNodeKey
    );
    const gap = list.length > 1 ? Math.abs(slots[1] - slots[0]) : 0;
    const push =
      hovered >= 0
        ? Math.max(
            0,
            runtime.hoverCardExtent / 2 +
              EDGE_NODE_RADIUS_PX +
              EDGE_NODE_CARD_CLEARANCE_PX -
              gap
          )
        : 0;
    list.forEach((entry, k) => {
      const target =
        k < hovered ? -push : hovered >= 0 && k > hovered ? push : 0;
      const current = runtime.edgeNodePush.get(entry.key) ?? 0;
      const eased = current + (target - current) * NODE_GROW_LERP;
      runtime.edgeNodePush.set(entry.key, eased);
      slots[k] += eased;
    });
    list.forEach((entry, k) => {
      const world =
        side === 'top'
          ? toWorld(slots[k], EDGE_NODE_INSET_PX)
          : side === 'bottom'
          ? toWorld(slots[k], p.height - EDGE_NODE_INSET_PX)
          : side === 'left'
          ? toWorld(EDGE_NODE_INSET_PX, slots[k])
          : toWorld(p.width - EDGE_NODE_INSET_PX, slots[k]);
      const others = new Set(
        sides[side]
          .filter(
            (other) => other.far === entry.far && other.rank !== entry.rank
          )
          .map((other) => other.rank)
      ).size;
      nodes.set(entry.key, { ...world, side, others });
    });
    sides[side].forEach((entry) => {
      const primary = shown.get(entry.far);
      const spot = primary && nodes.get(primary.key);
      if (primary && spot && primary.key !== entry.key) {
        nodes.set(entry.key, { ...spot, hidden: true, others: 0 });
      }
    });
  });

  // Already sprung (see drawFrame), so it's used as is, overshoot included.
  return { progress: runtime.edgeNodes, progressX: runtime.edgeNodesX, nodes };
}

// Where a node is drawn this frame: on its way from the item's edge to its
// viewport-edge slot, springing vertically and easing horizontally.
export function edgeNodePosition(
  from: ConnectorPoint,
  node: EdgeNode,
  layout: EdgeNodeLayout
): ConnectorPoint {
  return {
    x: from.x + (node.x - from.x) * layout.progressX,
    y: from.y + (node.y - from.y) * layout.progress,
  };
}

// drawDot scale for a node on its way out: grows from nothing (lines meet
// their items without a dot) to a fixed on-screen radius, however far the
// camera has zoomed in.
export function edgeNodeDotScale(zoom: number, progress: number): number {
  return (EDGE_NODE_RADIUS_PX / (DOT_RADIUS * zoom)) * progress;
}

export function edgeNodeHoleRatio(progress: number): number {
  return 0.5 + (EDGE_NODE_HOLE_RATIO - 0.5) * progress;
}

// The short line tying an edge node to the viewport edge beside it, so its
// connector always carries on off-screen, even when it reaches the node from
// inside the view. Drawn at the connector's `weight`, it flares into the node
// (of world radius `dotRadius`), and reaches `extent` (0-1) of the way out to
// the edge, so it grows out with the node rather than appearing.
export function drawEdgeNodeStub(
  p: p5,
  runtime: TimelineRuntime,
  at: ConnectorPoint,
  side: EdgeSide,
  colour: string,
  dotRadius: number,
  weight: number,
  extent: number
): void {
  const edge =
    side === 'top'
      ? { x: at.x, y: runtime.cameraY }
      : side === 'bottom'
      ? { x: at.x, y: runtime.cameraY + p.height / runtime.zoom }
      : side === 'left'
      ? { x: runtime.cameraX, y: at.y }
      : { x: runtime.cameraX + p.width / runtime.zoom, y: at.y };
  const end = {
    x: at.x + (edge.x - at.x) * extent,
    y: at.y + (edge.y - at.y) * extent,
  };
  p.stroke(colour);
  p.strokeWeight(weight);
  p.strokeCap(p.SQUARE);
  p.noFill();
  p.line(at.x, at.y, end.x, end.y);
  drawNodeFlare(p, at, end, colour, dotRadius, weight);
}

// Hit-tests the nodes out at the viewport edges. Each side's nodes share one
// band along that edge, split between neighbours at their midpoints, so their
// hit zones touch and moving from one node to the next never drops the hover;
// past either end of a row the band reaches just beyond the outermost node.
// `regions` carry screen positions. Returns null when the cursor is in no band.
export function findEdgeNodeHit<
  T extends { x: number; y: number; side?: EdgeSide }
>(
  regions: T[],
  mouseX: number,
  mouseY: number,
  width: number,
  height: number
): T | null {
  const reach = EDGE_NODE_RADIUS_PX + EDGE_NODE_HIT_PAD_PX;
  const depth = EDGE_NODE_INSET_PX + reach;
  const inBand: Record<EdgeSide, boolean> = {
    top: mouseY <= depth,
    bottom: mouseY >= height - depth,
    left: mouseX <= depth,
    right: mouseX >= width - depth,
  };
  for (const side of Object.keys(inBand) as EdgeSide[]) {
    if (!inBand[side]) {
      continue;
    }
    const alongEdge = side === 'top' || side === 'bottom';
    const cursor = alongEdge ? mouseX : mouseY;
    const row = regions.filter((region) => region.side === side);
    if (row.length === 0) {
      continue;
    }
    const along = row.map((region) => (alongEdge ? region.x : region.y));
    let nearest = 0;
    along.forEach((value, k) => {
      if (Math.abs(value - cursor) < Math.abs(along[nearest] - cursor)) {
        nearest = k;
      }
    });
    const first = Math.min(...along);
    const last = Math.max(...along);
    if (cursor >= first - reach && cursor <= last + reach) {
      return row[nearest];
    }
  }
  return null;
}

// A stable identity for a node's hover region across frames: its edge-node key
// when it's out at the screen edge, else the line end it marks.
export function nodeRegionKey(region: NodeHoverRegion): string {
  return (
    region.edgeKey ??
    `${region.target.lane}:${region.target.index}:${
      region.timeline
    }:${Math.round(region.x)}:${Math.round(region.y)}`
  );
}
