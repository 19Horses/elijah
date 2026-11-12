import type p5 from 'p5';
import { pageBackgroundAt } from '../canvasEffects';
import { extractSubPath, polylineLength } from '../connectors';
import {
  MAIN_USERNAME,
  VIEWER_DOT_FADE_MS,
  VIEWER_DOT_HOVER_GROW,
  VIEWER_DOT_HOVER_LERP,
  VIEWER_DOT_RADIUS_PX,
  VIEWER_DOT_RING_PX,
  VIEWER_FLASH_GLOW_PX,
  VIEWER_FLASH_LENGTH_PX,
  VIEWER_FLASH_MAX_MS,
  VIEWER_FLASH_MIN_MS,
  VIEWER_FLASH_OTHER_TIMELINE_COST,
  VIEWER_FLASH_LAYERS,
  VIEWER_FLASH_LAYER_ALPHA,
  VIEWER_FLASH_SPEED_PX_PER_MS,
  VIEWER_FLASH_WEIGHT_PX,
} from '../constants';
import type { ConnectorPoint } from '../types';

// Where a viewer's dot belongs this frame: its grid slot beside the item
// they're viewing (see placeViewerDots).
export type ViewerDotTarget = {
  userId: string;
  username: string;
  colour: string;
  // A visitor who isn't signed up, so has no timeline to highlight.
  anonymous?: boolean;
  slug: string;
  x: number;
  y: number;
  alpha: number;
};

// One stretch of timeline drawn this frame, between two items (`key` tells
// apart an item's main and collected places; `slug` is what viewers view).
export type TimelineSegment = {
  // Whose timeline it is (MAIN_USERNAME for the main one).
  owner: string;
  from: { key: string; slug: string | null };
  to: { key: string; slug: string | null };
  points: ConnectorPoint[];
};

type Flash = {
  points: ConnectorPoint[];
  length: number;
  progress: number;
  duration: number;
};

// The way along this frame's timelines from an item with slug `fromSlug` to
// one with `toSlug`, shortest first but favouring `username`'s own timeline
// and the main one; null when no timeline joins them.
function findRoute(
  segments: TimelineSegment[],
  fromSlug: string,
  toSlug: string,
  username: string
): ConnectorPoint[] | null {
  const slugs = new Map<string, string | null>();
  const edges = new Map<
    string,
    { segment: TimelineSegment; next: string; cost: number }[]
  >();
  segments.forEach((segment) => {
    const cost =
      polylineLength(segment.points) *
      (segment.owner === username || segment.owner === MAIN_USERNAME
        ? 1
        : VIEWER_FLASH_OTHER_TIMELINE_COST);
    const link = (a: TimelineSegment['from'], b: TimelineSegment['to']) => {
      slugs.set(a.key, a.slug);
      const list = edges.get(a.key) ?? [];
      list.push({ segment, next: b.key, cost });
      edges.set(a.key, list);
    };
    link(segment.from, segment.to);
    link(segment.to, segment.from);
  });

  const dist = new Map<string, number>();
  const prev = new Map<string, { segment: TimelineSegment; from: string }>();
  slugs.forEach((slug, key) => {
    if (slug === fromSlug) {
      dist.set(key, 0);
    }
  });
  const open = new Set(dist.keys());
  const done = new Set<string>();
  while (open.size > 0) {
    let current = '';
    let best = Infinity;
    open.forEach((key) => {
      const d = dist.get(key) ?? Infinity;
      if (d < best) {
        best = d;
        current = key;
      }
    });
    open.delete(current);
    done.add(current);
    if (slugs.get(current) === toSlug) {
      // Walk back to the start, then lay the stretches end to end.
      const pieces: ConnectorPoint[][] = [];
      let at = current;
      for (let step = prev.get(at); step; step = prev.get(at)) {
        const forward = step.segment.from.key === step.from;
        pieces.unshift(
          forward ? step.segment.points : [...step.segment.points].reverse()
        );
        at = step.from;
      }
      return pieces.length > 0 ? pieces.flat() : null;
    }
    (edges.get(current) ?? []).forEach(({ segment, next, cost }) => {
      if (done.has(next)) {
        return;
      }
      const d = best + cost;
      if (d < (dist.get(next) ?? Infinity)) {
        dist.set(next, d);
        prev.set(next, { segment, from: current });
        open.add(next);
      }
    });
  }
  return null;
}

type ViewerDotState = {
  slug: string;
  // Where the dot last sat, for the ghost it leaves when the viewer moves on.
  x: number;
  y: number;
  // Fades in at its slot, from when the viewer arrives there.
  slotAlpha: number;
  // The dot left behind at the previous item, fading out.
  ghost: { x: number; y: number; alpha: number } | null;
  // Eases to 1 while the dot is hovered, growing it.
  hover: number;
  // The white flash running along the timelines from the item they left.
  flash: Flash | null;
};

type PlacedDot = {
  x: number;
  y: number;
  colour: string;
  alpha: number;
  hover: number;
  // The viewer, for a dot that can be hovered (not a fading ghost).
  viewer?: ViewerDotTarget;
};

// Keeps each viewer's dot between frames, so when someone moves on to another
// item their dot fades out there and back in beside the new one while a white
// flash runs along the timelines between the two, and a hovered dot grows
// smoothly.
export function createViewerDotAnimator() {
  const states = new Map<string, ViewerDotState>();
  let placed: PlacedDot[] = [];
  let flashes: { flash: Flash; alpha: number }[] = [];

  // The viewer whose dot is under `point` (world), as of the last update.
  const hitTest = (
    point: { x: number; y: number },
    zoom: number
  ): ViewerDotTarget | null => {
    const reach = (VIEWER_DOT_RADIUS_PX + VIEWER_DOT_RING_PX + 2) / zoom;
    for (let i = placed.length - 1; i >= 0; i--) {
      const dot = placed[i];
      if (
        dot.viewer &&
        dot.alpha > 0.5 &&
        Math.hypot(point.x - dot.x, point.y - dot.y) <= reach
      ) {
        return dot.viewer;
      }
    }
    return null;
  };

  const update = (
    p: p5,
    targets: ViewerDotTarget[],
    hoveredUserId: string | null,
    // How far the world map is showing (0 while an item or a collection is
    // being viewed): the dots only appear there.
    worldAlpha: number,
    // The timelines drawn this frame, for a flash's route.
    segments: TimelineSegment[],
    zoom: number
  ) => {
    // A hidden tab hands back one huge frame; don't let it skip the fade.
    const elapsed = Math.min(p.deltaTime, 100);
    const fadeStep = elapsed / VIEWER_DOT_FADE_MS;
    placed = [];
    flashes = [];
    targets.forEach((target) => {
      let state = states.get(target.userId);
      if (!state) {
        state = {
          slug: target.slug,
          x: target.x,
          y: target.y,
          slotAlpha: 0,
          ghost: null,
          hover: 0,
          flash: null,
        };
        states.set(target.userId, state);
      } else if (state.slug !== target.slug) {
        // Moved on (or came back after leaving): fade out where they were,
        // and flash along the way they went.
        state.ghost = { x: state.x, y: state.y, alpha: state.slotAlpha };
        state.slotAlpha = 0;
        const points = findRoute(
          segments,
          state.slug,
          target.slug,
          target.anonymous ? MAIN_USERNAME : target.username
        );
        const length = points ? polylineLength(points) : 0;
        state.flash =
          points && length > 0
            ? {
                points,
                length,
                progress: 0,
                duration: Math.min(
                  VIEWER_FLASH_MAX_MS,
                  Math.max(
                    VIEWER_FLASH_MIN_MS,
                    (length * zoom + VIEWER_FLASH_LENGTH_PX) /
                      VIEWER_FLASH_SPEED_PX_PER_MS
                  )
                ),
              }
            : null;
        state.slug = target.slug;
      }
      if (state.flash) {
        state.flash.progress += elapsed / state.flash.duration;
        if (state.flash.progress >= 1) {
          state.flash = null;
        } else {
          flashes.push({
            flash: state.flash,
            alpha: target.alpha * worldAlpha,
          });
        }
      }
      state.x = target.x;
      state.y = target.y;
      state.hover +=
        ((target.userId === hoveredUserId ? 1 : 0) - state.hover) *
        VIEWER_DOT_HOVER_LERP;

      if (state.ghost) {
        state.ghost.alpha -= fadeStep;
        if (state.ghost.alpha <= 0) {
          state.ghost = null;
        } else {
          placed.push({
            x: state.ghost.x,
            y: state.ghost.y,
            colour: target.colour,
            alpha: target.alpha * state.ghost.alpha * worldAlpha,
            hover: 0,
          });
        }
      }
      state.slotAlpha = Math.min(1, state.slotAlpha + fadeStep);
      placed.push({
        x: target.x,
        y: target.y,
        colour: target.colour,
        alpha: target.alpha * state.slotAlpha * worldAlpha,
        hover: state.hover,
        viewer: target,
      });
    });
  };

  const draw = (p: p5, runtime: { zoom: number; cameraY: number }) => {
    const { zoom } = runtime;
    const ring = VIEWER_DOT_RING_PX / zoom;
    const drawCtx = p.drawingContext as CanvasRenderingContext2D;
    p.noStroke();
    placed.forEach(({ x, y, colour, alpha, hover }) => {
      const radius =
        (VIEWER_DOT_RADIUS_PX / zoom) * (1 + VIEWER_DOT_HOVER_GROW * hover);
      drawCtx.globalAlpha = alpha;
      // The ring masks the lines behind in the page background's colour.
      p.fill(pageBackgroundAt(((y - runtime.cameraY) * zoom) / p.height));
      p.circle(x, y, (radius + ring) * 2);
      p.fill(colour);
      p.circle(x, y, radius * 2);
    });
    drawCtx.globalAlpha = 1;
  };

  // The flashes, drawn over the timelines but under the items, so one passing
  // an item runs behind it.
  const drawFlashes = (p: p5, zoom: number) => {
    if (flashes.length === 0) {
      return;
    }
    const drawCtx = p.drawingContext as CanvasRenderingContext2D;
    const flashLength = VIEWER_FLASH_LENGTH_PX / zoom;
    drawCtx.save();
    drawCtx.strokeStyle = '#ffffff';
    drawCtx.lineWidth = VIEWER_FLASH_WEIGHT_PX / zoom;
    drawCtx.lineCap = 'round';
    drawCtx.lineJoin = 'round';
    drawCtx.shadowColor = '#ffffff';
    drawCtx.shadowBlur = VIEWER_FLASH_GLOW_PX * p.pixelDensity();
    flashes.forEach(({ flash, alpha }) => {
      // The head runs from the start until the tail has left the end, so the
      // flash slides out of the item it left and into the one it reaches.
      const middle =
        flash.progress * (flash.length + flashLength) - flashLength / 2;
      drawCtx.globalAlpha = alpha * VIEWER_FLASH_LAYER_ALPHA;
      // Stacked strokes, each shorter than the last, build up to brightest in
      // the middle and fade out to either end.
      for (let k = 0; k < VIEWER_FLASH_LAYERS; k++) {
        const half = (flashLength / 2) * (1 - k / VIEWER_FLASH_LAYERS);
        const from = Math.max(0, middle - half);
        const to = Math.min(flash.length, middle + half);
        if (to <= from) {
          continue;
        }
        const points = extractSubPath(flash.points, from, to);
        if (points.length < 2) {
          continue;
        }
        drawCtx.beginPath();
        drawCtx.moveTo(points[0].x, points[0].y);
        points.slice(1).forEach((point) => drawCtx.lineTo(point.x, point.y));
        drawCtx.stroke();
      }
    });
    drawCtx.restore();
  };

  return { update, draw, drawFlashes, hitTest };
}
