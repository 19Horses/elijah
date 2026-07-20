import type p5 from 'p5';
import { DOT_RADIUS, DRAG_THRESHOLD } from '../constants';
import { screenToWorld } from '../geometry';
import type { FocusTarget, TimelineSketchDeps } from '../types';
import type { BoundsContext } from './bounds';
import type { GalleryController } from './galleryController';
import type { ViewContext } from './view';

export function createInputHandlers(
  p: p5,
  deps: TimelineSketchDeps,
  boundsCtx: BoundsContext,
  view: ViewContext,
  gallery: GalleryController
): {
  mousePressed: (event?: Event) => void;
  mouseDragged: () => void;
  mouseReleased: (event?: Event) => void;
  mouseWheel: (event?: WheelEvent) => boolean;
} {
  const { runtime, processed } = deps;

  // p5 v2 binds pointer events on `window`, so clicks on DOM UI layered over
  // the canvas (e.g. the branch top-bar) also reach these handlers. Ignore any
  // pointer event whose target isn't the canvas itself.
  const isCanvasEvent = (event?: Event) =>
    !event || event.target instanceof HTMLCanvasElement;

  const mousePressed = (event?: Event) => {
    if (!isCanvasEvent(event)) {
      return;
    }
    if (
      p.mouseX < 0 ||
      p.mouseX > p.width ||
      p.mouseY < 0 ||
      p.mouseY > p.height
    ) {
      return;
    }
    runtime.pressX = p.mouseX;
    runtime.pressY = p.mouseY;

    if (view.isViewInteractionLocked()) {
      runtime.dragLane = 'focus';
      return;
    }

    // Items are no longer draggable: every press on the canvas pans the view. A
    // press that doesn't move past the threshold is treated as a click (and can
    // still focus an item) in mouseReleased.
    runtime.dragLane = 'canvas';
  };

  const mouseDragged = () => {
    if (runtime.dragLane === null || view.isViewInteractionLocked()) {
      return;
    }

    if (
      p.dist(runtime.pressX, runtime.pressY, p.mouseX, p.mouseY) <=
      DRAG_THRESHOLD
    ) {
      return;
    }

    if (runtime.dragLane === 'canvas') {
      view.panView(p.mouseX - p.pmouseX, p.mouseY - p.pmouseY);
    }
  };

  const mouseReleased = (event?: Event) => {
    // A release on overlaid DOM UI (e.g. the cancel button) shouldn't count as a
    // canvas click; just clear any in-progress drag.
    if (!isCanvasEvent(event)) {
      runtime.dragLane = null;
      return;
    }
    if (
      p.dist(runtime.pressX, runtime.pressY, p.mouseX, p.mouseY) <=
      DRAG_THRESHOLD
    ) {
      const world = screenToWorld(
        runtime.pressX,
        runtime.pressY,
        runtime.cameraX,
        runtime.cameraY,
        runtime.zoom
      );

      // While a branch is isolated, any click on the canvas exits back to the
      // full timeline.
      if (runtime.branchIsolateRow !== null) {
        view.exitBranchIsolation();
        runtime.dragLane = null;
        return;
      }

      const audioButton = deps.audio.getButtonRegion();
      if (
        audioButton &&
        Math.hypot(world.x - audioButton.cx, world.y - audioButton.cy) <=
          audioButton.r
      ) {
        deps.audio.toggle(audioButton.src);
        runtime.dragLane = null;
        return;
      }

      const navHit = gallery
        .getNavRegions()
        .find(
          (region) =>
            Math.hypot(world.x - region.cx, world.y - region.cy) <= region.r
        );
      if (navHit && runtime.focusTarget) {
        const focused =
          runtime.focusTarget.lane === 'main'
            ? processed[runtime.focusTarget.index]
            : deps.processedCollected[runtime.focusTarget.index];
        gallery.step(navHit.delta, focused?.galleryUrls.length ?? 0);
        runtime.dragLane = null;
        return;
      }

      // A click on a connector dot (while an item is focused) jumps to the
      // item at the far end of that line. Matches the hover-label hit radius.
      if (runtime.focusTarget && runtime.nodeRegions.length > 0) {
        let hitTarget: FocusTarget | null = null;
        let bestDist = DOT_RADIUS + 8 / runtime.zoom;
        for (const region of runtime.nodeRegions) {
          const dist = Math.hypot(world.x - region.x, world.y - region.y);
          if (dist <= bestDist) {
            bestDist = dist;
            hitTarget = region.target;
          }
        }
        if (hitTarget) {
          const isSameFocus =
            runtime.focusTarget.lane === hitTarget.lane &&
            runtime.focusTarget.index === hitTarget.index;
          if (!isSameFocus) {
            view.focusItem(hitTarget);
          }
          runtime.dragLane = null;
          return;
        }
      }

      const clicked = view.findClickedItem(world.x, world.y);

      if (clicked) {
        const isSameFocus =
          runtime.focusTarget?.lane === clicked.lane &&
          runtime.focusTarget.index === clicked.index;
        if (isSameFocus) {
          view.unfocusItem();
        } else {
          view.focusItem(clicked);
        }
      } else {
        // Clicking a collector's branch line frames just their timeline.
        const branchRow = view.findClickedBranch(world.x, world.y);
        if (branchRow !== null) {
          view.focusBranch(branchRow);
        } else if (runtime.focusTarget) {
          view.unfocusItem();
        }
      }
    }

    runtime.dragLane = null;
  };

  const mouseWheel = (event?: WheelEvent) => {
    if (view.isViewInteractionLocked()) {
      event?.preventDefault();
      return false;
    }
    if (event) {
      event.preventDefault();
      const deltaX = event.deltaX ?? 0;
      const deltaY =
        event.deltaY ?? (event as WheelEvent & { delta: number }).delta ?? 0;
      view.scrollView(deltaX, deltaY);
    }
    return false;
  };

  return { mousePressed, mouseDragged, mouseReleased, mouseWheel };
}
