import {
  BRANCH_GROW_DELAY_MS,
  BRANCH_GROW_MS,
  ITEM_APPEAR_FROM_SCALE,
  ITEM_APPEAR_MS,
  LAYOUT_SHIFT_MS,
} from '../constants';
import type { ContentBounds, ItemOffset, TimelineSketchDeps } from '../types';
import type { BoundsContext } from './bounds';

// When the collected timelines change under a live map (someone collects
// something), items ease from where they were to their new places, new
// branch lines draw out from where they leave towards their items, and new
// items fade and grow in as their line reaches them.
export type LayoutChangeState = {
  // The offsets everything started the shift from, easing to none.
  shift: {
    startMs: number;
    main: ItemOffset[];
    collected: ItemOffset[];
  } | null;
  // When each new branch line (by branchLineKey) and new item (by content
  // id) starts drawing in.
  growStarts: Map<string, number>;
  appearStarts: Map<string, number>;
  // How far each is drawn in this frame (0-1); absent once fully in.
  grow: Map<string, number>;
  appear: Map<string, number>;
};

export function createLayoutChangeState(): LayoutChangeState {
  return {
    shift: null,
    growStarts: new Map(),
    appearStarts: new Map(),
    grow: new Map(),
    appear: new Map(),
  };
}

// A collector's line into an item.
export const branchLineKey = (contentId: string, username: string) =>
  `${contentId}|${username}`;

const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

type Centre = { x: number; y: number };
const centreOf = (bounds: ContentBounds): Centre => ({
  x: bounds.left + bounds.width / 2,
  y: bounds.centerY,
});

export type LayoutSnapshot = {
  main: Centre[];
  collected: Map<string, Centre>;
  lines: Set<string>;
};

// Where everything sits now, to ease from once the new timelines are in.
export function snapshotLayout(
  deps: TimelineSketchDeps,
  boundsCtx: BoundsContext
): LayoutSnapshot {
  const collectedBounds = boundsCtx.getCollectedBounds();
  return {
    main: boundsCtx.getAllBounds().map(centreOf),
    collected: new Map(
      deps.processedCollected.map((item, index) => [
        item.contentId,
        centreOf(collectedBounds[index]),
      ])
    ),
    lines: new Set(
      deps.processedCollected.flatMap((item) =>
        item.sources.map((source) =>
          branchLineKey(item.contentId, source.username)
        )
      )
    ),
  };
}

// Starts easing from `before` to the layout just loaded into `deps`: items
// that moved slide over, and lines and items that weren't there draw in.
export function beginLayoutChange(
  deps: TimelineSketchDeps,
  boundsCtx: BoundsContext,
  before: LayoutSnapshot,
  now: number
): void {
  const { runtime } = deps;
  const state = runtime.layoutChange;
  deps.itemOffsets.forEach((offset) => {
    offset.dx = 0;
    offset.dy = 0;
  });
  const mainBounds = boundsCtx.getAllBounds();
  const collectedBounds = boundsCtx.getCollectedBounds();
  const from = (old: Centre | undefined, bounds: ContentBounds) => {
    if (!old) {
      return { dx: 0, dy: 0 };
    }
    const centre = centreOf(bounds);
    return { dx: old.x - centre.x, dy: old.y - centre.y };
  };
  state.shift = {
    startMs: now,
    main: mainBounds.map((bounds, index) => from(before.main[index], bounds)),
    collected: deps.processedCollected.map((item, index) =>
      from(before.collected.get(item.contentId), collectedBounds[index])
    ),
  };

  // The viewer's own just-collected item flies in on its own.
  const collecting = runtime.collectContentId;
  deps.processedCollected.forEach((item) => {
    if (item.contentId === collecting) {
      return;
    }
    item.sources.forEach((source) => {
      const key = branchLineKey(item.contentId, source.username);
      if (!before.lines.has(key)) {
        state.growStarts.set(key, now + BRANCH_GROW_DELAY_MS);
        state.grow.set(key, 0);
      }
    });
    if (!before.collected.has(item.contentId)) {
      state.appearStarts.set(
        item.contentId,
        now + BRANCH_GROW_DELAY_MS + BRANCH_GROW_MS * 0.6
      );
      state.appear.set(item.contentId, 0);
    }
  });
  stepLayoutChange(deps, now);
}

// Moves the change on to `now`, once a frame before anything is laid out.
export function stepLayoutChange(deps: TimelineSketchDeps, now: number): void {
  const state = deps.runtime.layoutChange;
  const { shift } = state;
  if (shift) {
    const t = Math.min(1, (now - shift.startMs) / LAYOUT_SHIFT_MS);
    const remaining = 1 - easeInOutCubic(t);
    const apply = (offsets: ItemOffset[], start: ItemOffset[]) =>
      offsets.forEach((offset, index) => {
        offset.dx = (start[index]?.dx ?? 0) * remaining;
        offset.dy = (start[index]?.dy ?? 0) * remaining;
      });
    apply(deps.itemOffsets, shift.main);
    apply(deps.collectedOffsets, shift.collected);
    if (t >= 1) {
      state.shift = null;
    }
  }
  const progress = (
    starts: Map<string, number>,
    values: Map<string, number>,
    duration: number,
    ease: (t: number) => number
  ) =>
    starts.forEach((start, key) => {
      const t = Math.max(0, Math.min(1, (now - start) / duration));
      if (t >= 1) {
        starts.delete(key);
        values.delete(key);
      } else {
        values.set(key, ease(t));
      }
    });
  progress(state.growStarts, state.grow, BRANCH_GROW_MS, easeInOutCubic);
  progress(state.appearStarts, state.appear, ITEM_APPEAR_MS, easeOutCubic);
}

// How far a new item has appeared (1 once in, or for any other item), and
// the size it's at for that.
export const itemAppearProgress = (
  deps: TimelineSketchDeps,
  contentId: string
) => deps.runtime.layoutChange.appear.get(contentId) ?? 1;

export const itemAppearScale = (deps: TimelineSketchDeps, contentId: string) =>
  ITEM_APPEAR_FROM_SCALE +
  (1 - ITEM_APPEAR_FROM_SCALE) * itemAppearProgress(deps, contentId);
