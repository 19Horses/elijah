import type p5 from 'p5';
import {
  FIT_VIEW_PADDING,
  FIT_ZOOM_SCALAR,
  FOCUS_VIEWPORT_FILL,
  MAIN_LINE_Y,
  MAX_ZOOM_FACTOR,
  MIN_ZOOM_FACTOR,
  VIEW_ANIMATION_LERP,
  VIEW_SNAP_THRESHOLD,
  VIEW_UNFOCUS_ANIMATION_LERP,
  WHEEL_ZOOM_SENSITIVITY,
} from '../constants';
import { hitTest } from '../geometry';
import {
  getFocusedSlug,
  isViewInteractionLocked,
  notifyFocusFade,
  resetCanvasFocus,
  startDetailReveal,
  syncInteractionLock,
} from '../timelineRuntime';
import type { ContentBounds, FocusTarget, TimelineSketchDeps } from '../types';
import type { BoundsContext } from './bounds';

export type ViewContext = {
  setCameraFromScreenAnchor: (
    worldX: number,
    worldY: number,
    screenX: number,
    screenY: number,
    nextZoom: number
  ) => void;
  computeFitViewTargets: () => void;
  computeFocusViewTargets: (bounds: ContentBounds) => void;
  getFocusBounds: (target: FocusTarget) => ContentBounds;
  applyViewTargets: () => void;
  syncViewTargets: () => void;
  panView: (deltaScreenX: number, deltaScreenY: number) => void;
  zoomViewAt: (screenX: number, screenY: number, delta: number) => void;
  fitView: () => void;
  animateView: () => void;
  findClickedItem: (worldX: number, worldY: number) => FocusTarget | null;
  focusItem: (target: FocusTarget) => void;
  unfocusItem: () => void;
  isViewInteractionLocked: () => boolean;
};

export function createViewContext(
  p: p5,
  deps: TimelineSketchDeps,
  bounds: BoundsContext
): ViewContext {
  const { runtime } = deps;

  const setCameraFromScreenAnchor = (
    worldX: number,
    worldY: number,
    screenX: number,
    screenY: number,
    nextZoom: number
  ) => {
    runtime.cameraX = worldX - screenX / nextZoom;
    runtime.cameraY = worldY - screenY / nextZoom;
    runtime.zoom = nextZoom;
  };

  const getAnimationProgress = (nextZoom: number): number => {
    const zoomRange = runtime.targetZoom - runtime.animationStartZoom;
    if (Math.abs(zoomRange) <= VIEW_SNAP_THRESHOLD) {
      return 1;
    }
    return Math.max(
      0,
      Math.min(1, (nextZoom - runtime.animationStartZoom) / zoomRange)
    );
  };

  const beginViewAnimation = (worldX: number, worldY: number) => {
    runtime.animationWorldX = worldX;
    runtime.animationWorldY = worldY;
    runtime.animationStartScreenX = (worldX - runtime.cameraX) * runtime.zoom;
    runtime.animationStartScreenY = (worldY - runtime.cameraY) * runtime.zoom;
    runtime.animationStartZoom = runtime.zoom;
  };

  const computeFitViewTargets = () => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    [...bounds.getAllBounds(), ...bounds.getCollectedBounds()].forEach((b) => {
      minX = Math.min(minX, b.left);
      maxX = Math.max(maxX, b.right);
      minY = Math.min(minY, b.top);
      maxY = Math.max(maxY, b.dateBottom);
    });

    if (Number.isFinite(minX) && maxX > minX && maxY > minY) {
      const paddedWidth = maxX - minX + FIT_VIEW_PADDING * 2;
      const paddedHeight = maxY - minY + FIT_VIEW_PADDING * 2;
      const zoomX = p.width / paddedWidth;
      const zoomY = p.height / paddedHeight;
      runtime.targetZoom = Math.min(zoomX, zoomY) * FIT_ZOOM_SCALAR;
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;
      runtime.targetCameraX = centerX - p.width / (2 * runtime.targetZoom);
      runtime.targetCameraY = centerY - p.height / (2 * runtime.targetZoom);
    } else {
      runtime.targetZoom = 1;
      runtime.targetCameraX = 0;
      runtime.targetCameraY = MAIN_LINE_Y - p.height / (2 * runtime.targetZoom);
    }
    runtime.fitZoomLevel = runtime.targetZoom;
  };

  const computeFocusViewTargets = (focusBounds: ContentBounds) => {
    const zoomW = (p.width * FOCUS_VIEWPORT_FILL) / focusBounds.width;
    const zoomH = (p.height * FOCUS_VIEWPORT_FILL) / focusBounds.height;
    runtime.targetZoom = Math.min(zoomW, zoomH);
    const centerX = (focusBounds.left + focusBounds.right) / 2;
    const centerY = focusBounds.top + focusBounds.height / 2;
    runtime.targetCameraX = centerX - p.width / (2 * runtime.targetZoom);
    runtime.targetCameraY = centerY - p.height / (2 * runtime.targetZoom);
  };

  const getFocusBounds = (target: FocusTarget): ContentBounds => {
    if (target.lane === 'main') {
      return bounds.getAllBounds()[target.index];
    }
    return bounds.getCollectedBounds()[target.index];
  };

  const applyViewTargets = () => {
    runtime.cameraX = runtime.targetCameraX;
    runtime.cameraY = runtime.targetCameraY;
    runtime.zoom = runtime.targetZoom;
  };

  const syncViewTargets = () => {
    runtime.targetCameraX = runtime.cameraX;
    runtime.targetCameraY = runtime.cameraY;
    runtime.targetZoom = runtime.zoom;
    runtime.viewAnimating = false;
  };

  const panView = (deltaScreenX: number, deltaScreenY: number) => {
    runtime.cameraX -= deltaScreenX / runtime.zoom;
    runtime.cameraY -= deltaScreenY / runtime.zoom;
    syncViewTargets();
  };

  const zoomViewAt = (screenX: number, screenY: number, delta: number) => {
    if (isViewInteractionLocked(runtime)) {
      return;
    }
    const worldX = screenX / runtime.zoom + runtime.cameraX;
    const worldY = screenY / runtime.zoom + runtime.cameraY;
    const minZoom = runtime.fitZoomLevel * MIN_ZOOM_FACTOR;
    const maxZoom = runtime.fitZoomLevel * MAX_ZOOM_FACTOR;
    const zoomFactor = Math.exp(-delta * WHEEL_ZOOM_SENSITIVITY);
    const newZoom = Math.max(
      minZoom,
      Math.min(maxZoom, runtime.zoom * zoomFactor)
    );

    runtime.cameraX = worldX - screenX / newZoom;
    runtime.cameraY = worldY - screenY / newZoom;
    runtime.zoom = newZoom;
    resetCanvasFocus(runtime);
    syncViewTargets();
  };

  const fitView = () => {
    resetCanvasFocus(runtime);
    computeFitViewTargets();
    applyViewTargets();
    runtime.viewAnimating = false;
    runtime.viewUnfocusing = false;
  };

  const animateView = () => {
    if (!runtime.viewAnimating) {
      if (runtime.focusTarget && !runtime.viewUnfocusing) {
        runtime.focusContentFade = 1;
        if (runtime.detailPhase === 'none') {
          startDetailReveal(runtime, runtime.focusTarget, deps);
        }
      } else if (!runtime.focusTarget && !runtime.viewUnfocusing) {
        runtime.focusContentFade = 0;
      }
      return;
    }

    const lerpFactor = runtime.viewUnfocusing
      ? VIEW_UNFOCUS_ANIMATION_LERP
      : VIEW_ANIMATION_LERP;
    const lerp = (current: number, target: number) =>
      current + (target - current) * lerpFactor;

    if (Math.abs(runtime.zoom - runtime.targetZoom) > VIEW_SNAP_THRESHOLD) {
      const nextZoom = lerp(runtime.zoom, runtime.targetZoom);
      const progress = getAnimationProgress(nextZoom);
      const screenX =
        runtime.animationStartScreenX +
        (p.width / 2 - runtime.animationStartScreenX) * progress;
      const screenY =
        runtime.animationStartScreenY +
        (p.height / 2 - runtime.animationStartScreenY) * progress;
      setCameraFromScreenAnchor(
        runtime.animationWorldX,
        runtime.animationWorldY,
        screenX,
        screenY,
        nextZoom
      );
      if (runtime.focusTarget && !runtime.viewUnfocusing) {
        runtime.focusContentFade = progress;
      } else if (runtime.viewUnfocusing) {
        runtime.focusContentFade = 1 - progress;
      }
      notifyFocusFade(deps);
    } else {
      applyViewTargets();
      const wasUnfocusing = runtime.viewUnfocusing;
      runtime.viewAnimating = false;
      runtime.viewUnfocusing = false;
      if (runtime.focusTarget && !wasUnfocusing) {
        runtime.focusContentFade = 1;
        if (runtime.detailPhase === 'none') {
          startDetailReveal(runtime, runtime.focusTarget, deps);
        }
      } else if (wasUnfocusing) {
        runtime.focusContentFade = 0;
      }
      notifyFocusFade(deps);
    }
  };

  const findClickedItem = (
    worldX: number,
    worldY: number
  ): FocusTarget | null => {
    const allBounds = bounds.getAllBounds();
    for (let index = deps.processed.length - 1; index >= 0; index--) {
      if (hitTest(allBounds[index], worldX, worldY)) {
        return { lane: 'main', index };
      }
    }

    const collectedBounds = bounds.getCollectedBounds();
    for (let index = deps.processedCollected.length - 1; index >= 0; index--) {
      if (hitTest(collectedBounds[index], worldX, worldY)) {
        return { lane: 'collected', index };
      }
    }

    return null;
  };

  const focusItem = (target: FocusTarget) => {
    runtime.detailPhase = 'none';
    runtime.detailLayout = 0;
    runtime.focusContentFade = 0;
    notifyFocusFade(deps);
    runtime.focusTarget = target;
    runtime.viewUnfocusing = false;
    syncInteractionLock(deps);
    const slug = getFocusedSlug(target, deps.items, deps.processedCollected);
    if (slug) {
      deps.refs.onContentFocusRef.current?.(slug);
    }
    const focusBounds = getFocusBounds(target);
    computeFocusViewTargets(focusBounds);
    beginViewAnimation(
      (focusBounds.left + focusBounds.right) / 2,
      focusBounds.top + focusBounds.height / 2
    );
    runtime.viewAnimating = true;
  };

  const unfocusItem = () => {
    resetCanvasFocus(runtime);
    deps.refs.onContentUnfocusRef.current?.();
    computeFitViewTargets();
    runtime.viewUnfocusing = true;
    syncInteractionLock(deps);
    beginViewAnimation(
      runtime.targetCameraX + p.width / (2 * runtime.targetZoom),
      runtime.targetCameraY + p.height / (2 * runtime.targetZoom)
    );
    runtime.viewAnimating = true;
  };

  return {
    setCameraFromScreenAnchor,
    computeFitViewTargets,
    computeFocusViewTargets,
    getFocusBounds,
    applyViewTargets,
    syncViewTargets,
    panView,
    zoomViewAt,
    fitView,
    animateView,
    findClickedItem,
    focusItem,
    unfocusItem,
    isViewInteractionLocked: () => isViewInteractionLocked(runtime),
  };
}
