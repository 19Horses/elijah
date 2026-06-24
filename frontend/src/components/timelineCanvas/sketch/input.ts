import type p5 from 'p5';
import {
  DRAG_THRESHOLD,
  IMAGE_HEIGHT,
  ITEM_WIDTH,
  PADDING_Y,
} from '../constants';
import { getFittedSize, getSlotX, hitTest, screenToWorld } from '../geometry';
import { isFutureDatedItem } from '../timelineRuntime';
import type { TimelineSketchDeps } from '../types';
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
  mousePressed: () => void;
  mouseDragged: () => void;
  mouseReleased: () => void;
  mouseWheel: (event?: WheelEvent) => boolean;
} {
  const { runtime, items, processed, itemOffsets, collectedOffsets } = deps;

  const mousePressed = () => {
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

    const world = screenToWorld(
      runtime.pressX,
      runtime.pressY,
      runtime.cameraX,
      runtime.cameraY,
      runtime.zoom
    );
    const bounds = boundsCtx.getAllBounds();

    for (let index = processed.length - 1; index >= 0; index--) {
      if (!hitTest(bounds[index], world.x, world.y)) {
        continue;
      }

      runtime.dragLane = 'main';
      runtime.dragIndex = index;
      runtime.dragPointerOffsetX = world.x - bounds[index].left;
      runtime.dragPointerOffsetY = world.y - bounds[index].top;
      return;
    }

    const collectedBounds = boundsCtx.getCollectedBounds();
    for (let index = deps.processedCollected.length - 1; index >= 0; index--) {
      if (!hitTest(collectedBounds[index], world.x, world.y)) {
        continue;
      }

      runtime.dragLane = 'collected';
      runtime.dragIndex = index;
      runtime.dragPointerOffsetX = world.x - collectedBounds[index].left;
      runtime.dragPointerOffsetY = world.y - collectedBounds[index].top;
      return;
    }

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
      return;
    }

    const world = screenToWorld(
      p.mouseX,
      p.mouseY,
      runtime.cameraX,
      runtime.cameraY,
      runtime.zoom
    );

    if (runtime.dragLane === 'collected') {
      const current = boundsCtx.getCollectedBounds()[runtime.dragIndex];
      const offset = collectedOffsets[runtime.dragIndex];
      const defaultLeft = current.left - offset.dx;
      const defaultTop = current.top - offset.dy;

      collectedOffsets[runtime.dragIndex] = {
        dx: world.x - runtime.dragPointerOffsetX - defaultLeft,
        dy: world.y - runtime.dragPointerOffsetY - defaultTop,
      };
      return;
    }

    const item = processed[runtime.dragIndex];
    const slotX = getSlotX(runtime.dragIndex);
    const { width, height } = getFittedSize(
      item.aspectRatio,
      ITEM_WIDTH,
      IMAGE_HEIGHT
    );
    const offsetXInSlot = (ITEM_WIDTH - width) / 2;
    const offsetYInSlot = (IMAGE_HEIGHT - height) / 2;
    const defaultLeft = slotX + offsetXInSlot;
    const defaultTop = PADDING_Y + offsetYInSlot;

    let newLeft = world.x - runtime.dragPointerOffsetX;
    const newTop = world.y - runtime.dragPointerOffsetY;

    const lineWorldX = boundsCtx.getNowWorldX();
    if (isFutureDatedItem(items[runtime.dragIndex])) {
      newLeft = Math.max(newLeft, lineWorldX);
    } else {
      newLeft = Math.min(newLeft, lineWorldX - width);
    }

    itemOffsets[runtime.dragIndex] = {
      dx: newLeft - defaultLeft,
      dy: newTop - defaultTop,
    };
  };

  const mouseReleased = () => {
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
      } else if (runtime.focusTarget) {
        view.unfocusItem();
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
      const delta =
        event.deltaY ?? (event as WheelEvent & { delta: number }).delta;
      view.zoomViewAt(p.mouseX, p.mouseY, delta);
    }
    return false;
  };

  return { mousePressed, mouseDragged, mouseReleased, mouseWheel };
}
