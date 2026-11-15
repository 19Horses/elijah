import { describe, expect, it } from 'vitest';
import { getBranchRoute, type BranchRouteSpec } from './connectors';
import type { ConnectorPoint } from './types';

// Deterministic PRNG so failures reproduce.
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function segments(points: ConnectorPoint[]) {
  const pts = points.filter(
    (pt, i) =>
      i === 0 ||
      Math.hypot(pt.x - points[i - 1].x, pt.y - points[i - 1].y) > 1e-6
  );
  return pts.slice(1).map((pt, i) => ({ a: pts[i], b: pt }));
}

// A route folds back when it turns by more than a right angle at a bend, or
// when two of its straights cross.
function problem(points: ConnectorPoint[]): string | null {
  if (points.some((pt) => !Number.isFinite(pt.x) || !Number.isFinite(pt.y))) {
    return 'non-finite point';
  }
  const segs = segments(points);
  for (let i = 1; i < segs.length; i++) {
    const p = segs[i - 1];
    const q = segs[i];
    const pl = Math.hypot(p.b.x - p.a.x, p.b.y - p.a.y);
    const ql = Math.hypot(q.b.x - q.a.x, q.b.y - q.a.y);
    const cos =
      ((p.b.x - p.a.x) * (q.b.x - q.a.x) + (p.b.y - p.a.y) * (q.b.y - q.a.y)) /
      (pl * ql);
    if (cos < -1e-6) {
      return `folds back at bend ${i}`;
    }
  }
  const orient = (a: ConnectorPoint, b: ConnectorPoint, c: ConnectorPoint) =>
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 2; j < segs.length; j++) {
      const s = segs[i];
      const t = segs[j];
      if (
        orient(s.a, s.b, t.a) * orient(s.a, s.b, t.b) < -1e-6 &&
        orient(t.a, t.b, s.a) * orient(t.a, t.b, s.b) < -1e-6
      ) {
        return `straights ${i} and ${j} cross`;
      }
    }
  }
  return null;
}

describe('getBranchRoute', () => {
  it('never folds back or crosses itself, however tight the layout', () => {
    const rand = mulberry32(1);
    const range = (min: number, max: number) => min + rand() * (max - min);
    const failures: string[] = [];
    let total = 0;
    for (let n = 0; n < 40000; n++) {
      const mainHalfSpan = range(0, 30);
      const itemHalfSpan = range(0, 20);
      const below = rand() < 0.8 ? 1 : -1;
      let from: ConnectorPoint;
      let to: ConnectorPoint;
      let spec: BranchRouteSpec;
      if (rand() < 0.6) {
        // Main item's underside down (or up) into a collected item's side.
        const fromCentre = { x: 0, y: 0 };
        const toCentre = { x: range(-400, 400), y: below * range(5, 400) };
        from = { x: range(-mainHalfSpan, mainHalfSpan), y: 0 };
        to = {
          x: toCentre.x,
          y: toCentre.y + range(-itemHalfSpan, itemHalfSpan),
        };
        spec = {
          fromDir: 'vertical',
          toDir: 'horizontal',
          fromNode: rand() < 0.9
            ? { centre: fromCentre, halfSpan: mainHalfSpan, axis: 'x' }
            : undefined,
          toNode: rand() < 0.9
            ? { centre: toCentre, halfSpan: itemHalfSpan, axis: 'y' }
            : undefined,
          corridorY:
            rand() < 0.4 ? toCentre.y - below * range(0, 200) : undefined,
        };
      } else {
        // Chain link between two collected items' sides.
        const otherHalfSpan = range(0, 20);
        const fromCentre = { x: 0, y: 0 };
        const toCentre = { x: range(-100, 400), y: range(-300, 300) };
        from = { x: 0, y: range(-otherHalfSpan, otherHalfSpan) };
        to = {
          x: toCentre.x,
          y: toCentre.y + range(-itemHalfSpan, itemHalfSpan),
        };
        spec = {
          fromDir: 'horizontal',
          toDir: 'horizontal',
          fromNode: rand() < 0.9
            ? { centre: fromCentre, halfSpan: otherHalfSpan, axis: 'y' }
            : undefined,
          toNode: rand() < 0.9
            ? { centre: toCentre, halfSpan: itemHalfSpan, axis: 'y' }
            : undefined,
        };
      }
      const route = getBranchRoute(from, to, spec);
      total++;
      const first = route[0];
      const last = route[route.length - 1];
      const issue =
        Math.hypot(first.x - from.x, first.y - from.y) > 1e-6 ||
        Math.hypot(last.x - to.x, last.y - to.y) > 1e-6
          ? 'ends moved'
          : problem(route);
      if (issue) {
        failures.push(
          `${issue}: ${JSON.stringify({ from, to, spec })} -> ${JSON.stringify(
            route
          )}`
        );
      }
    }
    expect(
      failures.slice(0, 5),
      `${failures.length} of ${total} routes`
    ).toEqual([]);
  });
});
