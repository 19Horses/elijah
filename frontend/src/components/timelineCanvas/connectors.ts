import type p5 from 'p5';
import { DOT_RADIUS } from './constants';
import type { ConnectorPoint } from './types';

const MAIN_CONNECTOR_HORIZONTAL_STUB = 16;
const BRANCH_HORIZONTAL_STUB = 16;
const BRANCH_VERTICAL_STUB = 16;
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

export function getMainConnectorPoints(
  from: ConnectorPoint,
  to: ConnectorPoint
): ConnectorPoint[] {
  const dirX = Math.sign(to.x - from.x) || 1;
  const dirY = Math.sign(to.y - from.y) || 1;
  const adx = Math.abs(to.x - from.x);
  const ady = Math.abs(to.y - from.y);
  const diag = Math.max(0, Math.min(adx - MAIN_CONNECTOR_HORIZONTAL_STUB, ady));
  const hStub = adx - diag;
  const elbowX = from.x + dirX * hStub;
  return [
    { x: from.x, y: from.y },
    { x: elbowX, y: from.y },
    { x: elbowX + dirX * diag, y: from.y + dirY * diag },
    { x: to.x, y: to.y },
  ];
}

function drawPolylineSegment(
  p: p5,
  points: ConnectorPoint[],
  dashed: boolean,
  weight = 1
): void {
  const ctx = p.drawingContext as CanvasRenderingContext2D;
  p.stroke(255);
  p.strokeWeight(weight);
  p.noFill();
  if (dashed) {
    ctx.setLineDash(DASH_PATTERN);
    // Negative, looping offset marches the dashes toward the future end.
    ctx.lineDashOffset = -((p.millis() * DASH_SPEED) % DASH_PERIOD);
  } else {
    ctx.setLineDash([]);
  }
  p.beginShape();
  points.forEach((point) => p.vertex(point.x, point.y));
  p.endShape();
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;
}

export function drawMainConnector(
  p: p5,
  from: ConnectorPoint,
  to: ConnectorPoint,
  startFuture: boolean,
  endFuture: boolean,
  weight = 1
): void {
  const points = getMainConnectorPoints(from, to);
  // A connector touching a future item is dashed for its whole length.
  drawPolylineSegment(p, points, startFuture || endFuture, weight);
}

export function getBranchPoints(
  from: ConnectorPoint,
  to: ConnectorPoint
): BranchLine {
  const dirX = Math.sign(to.x - from.x) || 1;
  const dirY = Math.sign(to.y - from.y) || 1;
  const adx = Math.abs(to.x - from.x);
  const ady = Math.abs(to.y - from.y);
  // Reserve a stub of both the vertical and horizontal so the shape is always
  // vert -> diag -> hor (a leading vertical, then the 45° diagonal, then the
  // horizontal into the target) rather than dropping the leading straight.
  const diag = Math.max(
    0,
    Math.min(adx - BRANCH_HORIZONTAL_STUB, ady - BRANCH_VERTICAL_STUB)
  );
  const vStub = ady - diag;
  const elbowY = from.y + dirY * vStub;
  return [
    { x: from.x, y: from.y },
    { x: from.x, y: elbowY },
    { x: from.x + dirX * diag, y: elbowY + dirY * diag },
    { x: to.x, y: to.y },
  ];
}

// A stepped route used when a branch jumps from the main line to an item that
// other chains also reach. Like every connector it alternates straight and 45°
// diagonal segments (straight -> diagonal -> straight -> diagonal -> straight),
// so it reads as part of the diagonal network while staying unambiguous.
export function getSteppedBranchPoints(
  from: ConnectorPoint,
  to: ConnectorPoint
): ConnectorPoint[] {
  const dirX = Math.sign(to.x - from.x) || 1;
  const dirY = Math.sign(to.y - from.y) || 1;
  const dx = Math.abs(to.x - from.x);
  const dy = Math.abs(to.y - from.y);
  const vStub = BRANCH_VERTICAL_STUB;
  const hStub = BRANCH_HORIZONTAL_STUB;

  if (dy >= dx) {
    // Vertical-dominant (e.g. crossing the main line): the straights alternate
    // hor -> diag -> vert -> diag -> hor, so both ends are horizontal stubs.
    const diag = (dx - 2 * hStub) / 2;
    const middle = dy - 2 * diag;
    if (diag >= 0 && middle >= 0) {
      const p1 = { x: from.x + dirX * hStub, y: from.y };
      const p2 = { x: p1.x + dirX * diag, y: p1.y + dirY * diag };
      const p3 = { x: p2.x, y: p2.y + dirY * middle };
      const p4 = { x: p3.x + dirX * diag, y: p3.y + dirY * diag };
      return [{ x: from.x, y: from.y }, p1, p2, p3, p4, { x: to.x, y: to.y }];
    }
  } else {
    // Horizontal-dominant: vert -> diag -> hor -> diag -> vert, so both ends are
    // vertical stubs.
    const diag = (dy - 2 * vStub) / 2;
    const middle = dx - 2 * diag;
    if (diag >= 0 && middle >= 0) {
      const p1 = { x: from.x, y: from.y + dirY * vStub };
      const p2 = { x: p1.x + dirX * diag, y: p1.y + dirY * diag };
      const p3 = { x: p2.x + dirX * middle, y: p2.y };
      const p4 = { x: p3.x + dirX * diag, y: p3.y + dirY * diag };
      return [{ x: from.x, y: from.y }, p1, p2, p3, p4, { x: to.x, y: to.y }];
    }
  }

  return getBranchPoints(from, to);
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
  from: ConnectorPoint,
  to: ConnectorPoint,
  colour: string,
  stepped = false,
  weight = 1
): void {
  const ctx = p.drawingContext as CanvasRenderingContext2D;
  const points = stepped
    ? getSteppedBranchPoints(from, to)
    : getBranchPoints(from, to);
  ctx.setLineDash([]);
  p.stroke(colour);
  p.strokeWeight(weight);
  p.noFill();
  p.beginShape();
  points.forEach((point) => p.vertex(point.x, point.y));
  p.endShape();
}

// `scale` grows the dot beyond its base radius (e.g. when zoomed out — see
// zoomOutGrowth) so nodes stay legible instead of shrinking with the world.
export function drawDot(
  p: p5,
  x: number,
  y: number,
  colour: string,
  scale = 1
): void {
  const ctx = p.drawingContext as CanvasRenderingContext2D;
  const radius = DOT_RADIUS * scale;
  p.noStroke();
  p.fill(colour);
  p.circle(x, y, radius * 2);

  const prevBlur = ctx.shadowBlur;
  ctx.shadowBlur = 0;
  p.fill(255);
  p.circle(x, y, radius);
  ctx.shadowBlur = prevBlur;
}
