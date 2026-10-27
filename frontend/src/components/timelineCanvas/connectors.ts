import type p5 from 'p5';
import {
  DOT_RADIUS,
  LINE_CORNER_RADIUS_PX,
  MAIN_LINE_COLOUR,
  NODE_FLARE_REACH,
} from './constants';
import type { BranchNodeGroup, ConnectorPoint, RouteDir } from './types';

// Shortest straight a connector runs along out of (or into) an item before
// turning.
const ROUTE_STUB = 40;
// Dash pattern and marching-ants animation for future (dashed) connectors.
const DASH_PATTERN = [6, 6];
const DASH_PERIOD = DASH_PATTERN[0] + DASH_PATTERN[1];
const DASH_SPEED = 0.02; // px per ms

export type BranchLine = [
  ConnectorPoint,
  ConnectorPoint,
  ConnectorPoint,
  ConnectorPoint
];

// Item side to item side, so horizontal at both ends. `fromStubExtra` /
// `toStubExtra` lengthen the straight at each end.
export function getMainConnectorPoints(
  from: ConnectorPoint,
  to: ConnectorPoint,
  fromStubExtra = 0,
  toStubExtra = 0
): ConnectorPoint[] {
  return getHorizontalEndsPoints(
    from,
    to,
    ROUTE_STUB + fromStubExtra,
    ROUTE_STUB + toStubExtra
  );
}

// Widens a line into the node it meets, so the two join along a smooth concave
// curve (a fillet tangent to both the line's edge and the dot) instead of the
// line butting straight into the dot. `toward` is the next point along the
// line from the node; the taper never runs past it. It starts `reachRadii` dot
// radii out from the node's centre.
export function drawNodeFlare(
  p: p5,
  node: ConnectorPoint,
  toward: ConnectorPoint,
  colour: string | number,
  dotRadius: number,
  weight: number,
  reachRadii = NODE_FLARE_REACH
): void {
  const dx = toward.x - node.x;
  const dy = toward.y - node.y;
  const halfWeight = weight / 2;
  const reach = Math.min(dotRadius * reachRadii, Math.hypot(dx, dy));
  // Nothing to blend if the line is already as wide as the dot, or there's no
  // straight run beyond the dot's edge to taper along.
  if (halfWeight >= dotRadius || reach <= dotRadius) {
    return;
  }
  // Radius of the fillet circle that touches the line's edge at `reach` and
  // the dot's outline; it sits `filletY` off the line's centre.
  const filletRadius =
    (reach * reach - dotRadius * dotRadius + halfWeight * halfWeight) /
    (2 * (dotRadius - halfWeight));
  const filletY = halfWeight + filletRadius;
  // Where the fillet meets the dot's outline.
  const k = dotRadius / (dotRadius + filletRadius);
  const touchX = reach * k;
  const touchY = filletY * k;

  const ctx = p.drawingContext as CanvasRenderingContext2D;
  // Set through p5 before saving, so its cached fill stays in step with the
  // context once it's restored.
  p.noStroke();
  p.fill(colour as string);
  ctx.save();
  // Local frame: origin on the node, x running out along the line.
  ctx.translate(node.x, node.y);
  ctx.rotate(Math.atan2(dy, dx));
  ctx.beginPath();
  ctx.moveTo(reach, halfWeight);
  ctx.arc(
    reach,
    filletY,
    filletRadius,
    -Math.PI / 2,
    Math.atan2(-filletY, -reach),
    true
  );
  ctx.lineTo(touchX, -touchY);
  ctx.arc(
    reach,
    -filletY,
    filletRadius,
    Math.atan2(filletY, -reach),
    Math.PI / 2,
    true
  );
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// Flares both ends of a polyline into their nodes, each along the line's first
// straight run out of that node. A radius of 0 leaves that end plain.
export function polylineLength(points: ConnectorPoint[]): number {
  let length = 0;
  for (let i = 0; i < points.length - 1; i++) {
    length += Math.hypot(
      points[i + 1].x - points[i].x,
      points[i + 1].y - points[i].y
    );
  }
  return length;
}

// The portion of the polyline between two arc-length distances, with the
// endpoints interpolated so the strip has exact, smooth ends.
export function extractSubPath(
  points: ConnectorPoint[],
  fromDist: number,
  toDist: number
): ConnectorPoint[] {
  const result: ConnectorPoint[] = [];
  let acc = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (seg <= 0) {
      continue;
    }
    const segStart = acc;
    const segEnd = acc + seg;
    acc = segEnd;
    if (segEnd < fromDist || segStart > toDist) {
      continue;
    }
    const t0 = Math.max(0, (fromDist - segStart) / seg);
    const t1 = Math.min(1, (toDist - segStart) / seg);
    if (result.length === 0) {
      result.push({ x: a.x + (b.x - a.x) * t0, y: a.y + (b.y - a.y) * t0 });
    }
    result.push({ x: a.x + (b.x - a.x) * t1, y: a.y + (b.y - a.y) * t1 });
  }
  return result;
}

// Traces `points` as a path, rounding each bend with an arc of up to `radius`
// (smaller where the straights either side are too short for it).
function traceRoundedPath(
  ctx: CanvasRenderingContext2D,
  points: ConnectorPoint[],
  radius: number
): void {
  const pts = points.filter(
    (pt, i) =>
      i === 0 ||
      Math.hypot(pt.x - points[i - 1].x, pt.y - points[i - 1].y) > 1e-6
  );
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1];
    const corner = pts[i];
    const next = pts[i + 1];
    const inLength = Math.hypot(corner.x - prev.x, corner.y - prev.y);
    const outLength = Math.hypot(next.x - corner.x, next.y - corner.y);
    const turn = Math.acos(
      Math.max(
        -1,
        Math.min(
          1,
          ((corner.x - prev.x) * (next.x - corner.x) +
            (corner.y - prev.y) * (next.y - corner.y)) /
            (inLength * outLength)
        )
      )
    );
    // How far back from the corner the arc starts, for a given radius.
    const reachPerRadius = Math.tan(turn / 2);
    const fitted =
      reachPerRadius > 1e-6
        ? Math.min(radius, Math.min(inLength, outLength) / 2 / reachPerRadius)
        : 0;
    if (fitted > 0) {
      ctx.arcTo(corner.x, corner.y, next.x, next.y, fitted);
    } else {
      ctx.lineTo(corner.x, corner.y);
    }
  }
  const last = pts[pts.length - 1];
  ctx.lineTo(last.x, last.y);
}

// Strokes a polyline in `colour` with its bends slightly rounded. `dashed`
// dashes it, marching toward the far end.
function strokePolyline(
  p: p5,
  points: ConnectorPoint[],
  colour: string,
  weight: number,
  dashed = false
): void {
  const ctx = p.drawingContext as CanvasRenderingContext2D;
  if (points.length < 2) {
    return;
  }
  p.stroke(colour);
  p.strokeWeight(weight);
  p.strokeCap(p.SQUARE);
  p.noFill();
  // Corners round to a fixed on-screen radius, whatever the zoom.
  const cornerRadius =
    (LINE_CORNER_RADIUS_PX * p.pixelDensity()) / ctx.getTransform().a;
  if (dashed) {
    ctx.setLineDash(DASH_PATTERN);
    // Negative, looping offset marches the dashes toward the future end.
    ctx.lineDashOffset = -((p.millis() * DASH_SPEED) % DASH_PERIOD);
  } else {
    ctx.setLineDash([]);
  }
  ctx.beginPath();
  traceRoundedPath(ctx, points, cornerRadius);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;
}

export function drawMainConnector(
  p: p5,
  from: ConnectorPoint,
  to: ConnectorPoint,
  startFuture: boolean,
  endFuture: boolean,
  weight = 1,
  fromStubExtra = 0,
  toStubExtra = 0,
  colour = MAIN_LINE_COLOUR
): ConnectorPoint[] {
  const points = getMainConnectorPoints(from, to, fromStubExtra, toStubExtra);
  // A connector touching a future item is dashed for its whole length.
  strokePolyline(p, points, colour, weight, startFuture || endFuture);
  return points;
}

// Vertical out of `from`, horizontal into `to`, with at least `fromStub` /
// `toStub` of straight at each end.
function getBranchPoints(
  from: ConnectorPoint,
  to: ConnectorPoint,
  fromStub: number,
  toStub: number
): BranchLine {
  const dirX = Math.sign(to.x - from.x) || 1;
  const dirY = Math.sign(to.y - from.y) || 1;
  const adx = Math.abs(to.x - from.x);
  const ady = Math.abs(to.y - from.y);
  // Reserve a stub of both the vertical and horizontal so the shape is always
  // vert -> diag -> hor (a leading vertical, then the 45° diagonal, then the
  // horizontal into the target) rather than dropping the leading straight.
  const diag = Math.max(0, Math.min(adx - toStub, ady - fromStub));
  const vStub = ady - diag;
  const elbowY = from.y + dirY * vStub;
  return [
    { x: from.x, y: from.y },
    { x: from.x, y: elbowY },
    { x: from.x + dirX * diag, y: elbowY + dirY * diag },
    { x: to.x, y: to.y },
  ];
}

// Leaves `from` and meets `to` horizontally: a straight stub, a 45° diagonal,
// then straight on into `to`, keeping at least `fromStub` / `toStub` of
// straight at each end. Too steep for one diagonal, it steps
// straight -> diagonal -> vertical -> diagonal -> straight; too close for
// diagonals at all, a square step.
function getHorizontalEndsPoints(
  from: ConnectorPoint,
  to: ConnectorPoint,
  fromStub: number,
  toStub: number
): ConnectorPoint[] {
  const dirX = Math.sign(to.x - from.x) || 1;
  const dirY = Math.sign(to.y - from.y) || 1;
  const dx = Math.abs(to.x - from.x);
  const dy = Math.abs(to.y - from.y);
  const start = { x: from.x, y: from.y };
  const end = { x: to.x, y: to.y };
  if (dy <= dx - fromStub - toStub) {
    const elbowX = from.x + dirX * fromStub;
    return [
      start,
      { x: elbowX, y: from.y },
      { x: elbowX + dirX * dy, y: to.y },
      end,
    ];
  }
  const diag = (dx - fromStub - toStub) / 2;
  if (diag >= 0) {
    const p1 = { x: from.x + dirX * fromStub, y: from.y };
    const p2 = { x: p1.x + dirX * diag, y: p1.y + dirY * diag };
    const p3 = { x: p2.x, y: to.y - dirY * diag };
    const p4 = { x: p3.x + dirX * diag, y: to.y };
    return [start, p1, p2, p3, p4, end];
  }
  const midX = from.x + (dirX * dx * fromStub) / (fromStub + toStub);
  return [start, { x: midX, y: from.y }, { x: midX, y: to.y }, end];
}

const transpose = (point: ConnectorPoint): ConnectorPoint => ({
  x: point.y,
  y: point.x,
});

// A 0/45/90° route that leaves `from` and meets `to` along the given
// directions: vertical at an item's top or bottom, horizontal at its side.
// `fromStubExtra` / `toStubExtra` lengthen the straight at each end, e.g. to
// leave room for a bundle of parallel lines to turn the corners without
// folding over.
// `corridorY` (vertical out of `from`, horizontal into `to` only) runs the line
// along that y instead, turning into `to`'s row with a diagonal just before it.
export function getRoutePoints(
  from: ConnectorPoint,
  to: ConnectorPoint,
  fromDir: RouteDir,
  toDir: RouteDir,
  fromStubExtra = 0,
  toStubExtra = 0,
  corridorY?: number
): ConnectorPoint[] {
  const fromStub = ROUTE_STUB + fromStubExtra;
  const toStub = ROUTE_STUB + toStubExtra;
  if (
    corridorY !== undefined &&
    fromDir === 'vertical' &&
    toDir === 'horizontal'
  ) {
    const corridor = getCorridorPoints(from, to, fromStub, toStub, corridorY);
    if (corridor) {
      return corridor;
    }
  }
  if (fromDir === 'horizontal' && toDir === 'horizontal') {
    return getHorizontalEndsPoints(from, to, fromStub, toStub);
  }
  if (fromDir === 'vertical' && toDir === 'vertical') {
    return getHorizontalEndsPoints(
      transpose(from),
      transpose(to),
      fromStub,
      toStub
    ).map(transpose);
  }
  if (fromDir === 'vertical') {
    return getBranchPoints(from, to, fromStub, toStub);
  }
  return getBranchPoints(to, from, toStub, fromStub).reverse();
}

// Vertical out of `from`, then along `corridorY` (between `from` and `to`), then
// a 45° diagonal into `to`'s row and a `toStub` straight into `to`. null when
// the corridor isn't between the ends or there's no room to reach it.
function getCorridorPoints(
  from: ConnectorPoint,
  to: ConnectorPoint,
  fromStub: number,
  toStub: number,
  corridorY: number
): ConnectorPoint[] | null {
  if (
    (corridorY - from.y) * (to.y - corridorY) <= 0 ||
    Math.abs(corridorY - from.y) < fromStub
  ) {
    return null;
  }
  const dirX = Math.sign(to.x - from.x) || 1;
  const drop = Math.abs(to.y - corridorY);
  const entry = { x: to.x - dirX * (toStub + drop), y: corridorY };
  if ((entry.x - from.x) * dirX < 0) {
    return null;
  }
  return [
    ...getBranchPoints(from, entry, fromStub, 0),
    { x: to.x - dirX * toStub, y: to.y },
    { x: to.x, y: to.y },
  ];
}

// Routes a line parallel to `base` (the route between its nodes' centres) out
// to its own ends, keeping a constant sideways distance through every bend
// (mitred corners) so neighbouring lines stay evenly spaced, like a metro map.
// The line holds its start's sideways offset up to the last straight, which
// takes its end's, so a line meeting differently ordered bundles at each end
// still lands on both of its ends. null when the base route is one straight
// with no corner to absorb a change of offset.
function offsetRoute(
  base: ConnectorPoint[],
  from: ConnectorPoint,
  to: ConnectorPoint,
  fromAxis?: 'x' | 'y',
  toAxis?: 'x' | 'y'
): ConnectorPoint[] | null {
  const pts = base.filter(
    (pt, i) =>
      i === 0 || Math.hypot(pt.x - base[i - 1].x, pt.y - base[i - 1].y) > 1e-6
  );
  if (pts.length < 3) {
    return null;
  }
  const dirs = pts.slice(1).map((pt, i) => {
    const length = Math.hypot(pt.x - pts[i].x, pt.y - pts[i].y);
    return { x: (pt.x - pts[i].x) / length, y: (pt.y - pts[i].y) / length };
  });
  // Signed sideways distance of `pt` from the line through `origin` along `d`.
  const side = (
    pt: ConnectorPoint,
    origin: ConnectorPoint,
    d: ConnectorPoint
  ) => -(pt.x - origin.x) * d.y + (pt.y - origin.y) * d.x;
  const last = dirs.length - 1;
  const startOffset = side(from, pts[0], dirs[0]);
  const endOffset = side(to, pts[pts.length - 1], dirs[last]);
  // An end's place in its bundle as a sideways offset for the middle of the
  // route: its full distance from the node's centre (so the bundle keeps the
  // same spacing on a diagonal), on the side it sits. null when the ends are
  // spread along the straight leaving them rather than across it, which gives
  // no sideways place to keep.
  const slotOffset = (
    pt: ConnectorPoint,
    origin: ConnectorPoint,
    d: ConnectorPoint,
    axis: 'x' | 'y' | undefined,
    offset: number
  ): number | null => {
    if (!axis) {
      return offset;
    }
    const across = axis === 'x' ? -d.y : d.x;
    if (Math.abs(across) < 1e-6) {
      return null;
    }
    const along = axis === 'x' ? pt.x - origin.x : pt.y - origin.y;
    return along * Math.sign(across);
  };
  const midOffset =
    slotOffset(from, pts[0], dirs[0], fromAxis, startOffset) ??
    slotOffset(to, pts[pts.length - 1], dirs[last], toAxis, endOffset) ??
    0;
  const offsetAt = (i: number) =>
    i === 0 ? startOffset : i === last ? endOffset : midOffset;

  const out: ConnectorPoint[] = [{ x: from.x, y: from.y }];
  for (let i = 1; i <= last; i++) {
    const a = dirs[i - 1];
    const b = dirs[i];
    const sa = offsetAt(i - 1);
    const sb = offsetAt(i);
    // A point on each offset straight, at the base route's corner.
    const pa = { x: pts[i].x - a.y * sa, y: pts[i].y + a.x * sa };
    const pb = { x: pts[i].x - b.y * sb, y: pts[i].y + b.x * sb };
    const cross = a.x * b.y - a.y * b.x;
    if (Math.abs(cross) < 1e-6) {
      out.push(pa);
      if (Math.abs(sa - sb) > 1e-6) {
        out.push(pb);
      }
      continue;
    }
    const t = ((pb.x - pa.x) * b.y - (pb.y - pa.y) * b.x) / cross;
    out.push({ x: pa.x + a.x * t, y: pa.y + a.y * t });
  }
  out.push({ x: to.x, y: to.y });
  return out;
}

// How a branch segment is routed: the directions it meets each end in, the
// bundles its ends belong to, and an optional corridor (see getRoutePoints).
export type BranchRouteSpec = {
  fromDir: RouteDir;
  toDir: RouteDir;
  fromNode?: BranchNodeGroup;
  toNode?: BranchNodeGroup;
  corridorY?: number;
};

// The polyline a branch segment draws along. Ends sharing a node are routed
// as an evenly spaced bundle around the route between the node centres.
// `fromStubExtra` / `toStubExtra` lengthen the straight at each end.
export function getBranchRoute(
  from: ConnectorPoint,
  to: ConnectorPoint,
  { fromDir, toDir, fromNode, toNode, corridorY }: BranchRouteSpec,
  fromStubExtra = 0,
  toStubExtra = 0
): ConnectorPoint[] {
  const direct = () =>
    getRoutePoints(
      from,
      to,
      fromDir,
      toDir,
      fromStubExtra,
      toStubExtra,
      corridorY
    );
  if (!fromNode && !toNode) {
    return direct();
  }
  const fromCentre = fromNode?.centre ?? from;
  const toCentre = toNode?.centre ?? to;
  const bundleExtra = Math.max(fromNode?.halfSpan ?? 0, toNode?.halfSpan ?? 0);
  const base = getRoutePoints(
    fromCentre,
    toCentre,
    fromDir,
    toDir,
    bundleExtra + fromStubExtra,
    bundleExtra + toStubExtra,
    corridorY
  );
  // A straight base (e.g. a chain link between neighbouring items) can't be
  // offset into differently spaced ends while keeping to 0/45/90°, so it routes
  // directly between its own ends instead.
  return offsetRoute(base, from, to, fromNode?.axis, toNode?.axis) ?? direct();
}

// How far along a polyline (arc length from its start) its closest point to
// `point` lies.
export function nearestArcLength(
  points: ConnectorPoint[],
  point: ConnectorPoint
): number {
  let best = 0;
  let bestDist = Infinity;
  let travelled = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    if (length > 0) {
      const t = Math.max(
        0,
        Math.min(
          1,
          ((point.x - a.x) * dx + (point.y - a.y) * dy) / (length * length)
        )
      );
      const dist = Math.hypot(
        point.x - (a.x + t * dx),
        point.y - (a.y + t * dy)
      );
      if (dist < bestDist) {
        bestDist = dist;
        best = travelled + t * length;
      }
    }
    travelled += length;
  }
  return best;
}

// The point `distance` along a polyline (clamped to its ends).
export function pointAtArcLength(
  points: ConnectorPoint[],
  distance: number
): ConnectorPoint {
  let remaining = Math.max(0, distance);
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (remaining <= length && length > 0) {
      const t = remaining / length;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    remaining -= length;
  }
  return points[points.length - 1];
}

export function distanceToSegment(
  point: ConnectorPoint,
  a: ConnectorPoint,
  b: ConnectorPoint
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) {
    return Math.hypot(point.x - a.x, point.y - a.y);
  }
  let t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}

export function distanceToPolyline(
  points: ConnectorPoint[],
  point: ConnectorPoint
): number {
  let min = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    min = Math.min(min, distanceToSegment(point, points[i], points[i + 1]));
  }
  return min;
}

export function drawBranchConnector(
  p: p5,
  points: ConnectorPoint[],
  colour: string,
  weight = 1
): void {
  strokePolyline(p, points, colour, weight);
}

// `scale` grows the dot beyond its base radius (e.g. when zoomed out — see
// zoomOutGrowth) so nodes stay legible instead of shrinking with the world.
// `holeRatio` is the white centre's size as a fraction of the dot.
export function drawDot(
  p: p5,
  x: number,
  y: number,
  colour: string,
  scale = 1,
  holeRatio = 0.5
): void {
  const ctx = p.drawingContext as CanvasRenderingContext2D;
  const radius = DOT_RADIUS * scale;
  p.noStroke();
  p.fill(colour);
  p.circle(x, y, radius * 2);

  const prevBlur = ctx.shadowBlur;
  ctx.shadowBlur = 0;
  p.fill(255);
  p.circle(x, y, radius * 2 * holeRatio);
  ctx.shadowBlur = prevBlur;
}
