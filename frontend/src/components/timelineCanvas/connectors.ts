import type p5 from 'p5';
import { DOT_RADIUS } from './constants';
import type { ConnectorPoint } from './types';
import { lerpPoint } from './geometry';

const MAIN_CONNECTOR_HORIZONTAL_STUB = 16;
const BRANCH_HORIZONTAL_STUB = 16;

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

function splitPolylineAtX(
  points: ConnectorPoint[],
  targetX: number
): { left: ConnectorPoint[]; right: ConnectorPoint[] } {
  for (let index = 0; index < points.length - 1; index++) {
    const a = points[index];
    const b = points[index + 1];
    if (a.x === b.x) {
      continue;
    }
    const minX = Math.min(a.x, b.x);
    const maxX = Math.max(a.x, b.x);
    if (targetX < minX || targetX > maxX) {
      continue;
    }
    const t = (targetX - a.x) / (b.x - a.x);
    if (t < 0 || t > 1) {
      continue;
    }
    const splitPoint = lerpPoint(a, b, t);
    return {
      left: [...points.slice(0, index + 1), splitPoint],
      right: [splitPoint, ...points.slice(index + 1)],
    };
  }
  return { left: points, right: [points[points.length - 1]] };
}

function drawPolylineSegment(
  p: p5,
  points: ConnectorPoint[],
  dashed: boolean
): void {
  const ctx = p.drawingContext as CanvasRenderingContext2D;
  p.stroke(17);
  p.strokeWeight(1);
  p.noFill();
  ctx.setLineDash(dashed ? [6, 6] : []);
  p.beginShape();
  points.forEach((point) => p.vertex(point.x, point.y));
  p.endShape();
  ctx.setLineDash([]);
}

export function drawMainConnector(
  p: p5,
  from: ConnectorPoint,
  to: ConnectorPoint,
  startFuture: boolean,
  endFuture: boolean,
  lineWorldX: number
): void {
  const points = getMainConnectorPoints(from, to);
  const crosses =
    startFuture !== endFuture && lineWorldX > from.x && lineWorldX < to.x;

  if (crosses) {
    const { left, right } = splitPolylineAtX(points, lineWorldX);
    drawPolylineSegment(p, left, false);
    drawPolylineSegment(p, right, true);
  } else {
    drawPolylineSegment(p, points, startFuture || endFuture);
  }
}

export function getBranchPoints(from: ConnectorPoint, to: ConnectorPoint): BranchLine {
  const dirX = Math.sign(to.x - from.x) || 1;
  const dirY = Math.sign(to.y - from.y) || 1;
  const adx = Math.abs(to.x - from.x);
  const ady = Math.abs(to.y - from.y);
  const diag = Math.max(0, Math.min(adx - BRANCH_HORIZONTAL_STUB, ady));
  const vStub = ady - diag;
  const elbowY = from.y + dirY * vStub;
  return [
    { x: from.x, y: from.y },
    { x: from.x, y: elbowY },
    { x: from.x + dirX * diag, y: elbowY + dirY * diag },
    { x: to.x, y: to.y },
  ];
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
  colour: string
): void {
  const ctx = p.drawingContext as CanvasRenderingContext2D;
  const points = getBranchPoints(from, to);
  ctx.setLineDash([]);
  p.stroke(colour);
  p.strokeWeight(1);
  p.noFill();
  p.beginShape();
  points.forEach((point) => p.vertex(point.x, point.y));
  p.endShape();
}

export function drawDot(p: p5, x: number, y: number, colour: string): void {
  const ctx = p.drawingContext as CanvasRenderingContext2D;
  p.noStroke();
  p.fill(colour);
  p.circle(x, y, DOT_RADIUS * 2);

  const prevBlur = ctx.shadowBlur;
  ctx.shadowBlur = 0;
  p.fill(255);
  p.circle(x, y, DOT_RADIUS);
  ctx.shadowBlur = prevBlur;
}
