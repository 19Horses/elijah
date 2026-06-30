import type p5 from 'p5';
import {
  DETAIL_IMAGE_HEIGHT_VH,
  DETAIL_IMAGE_LEFT_PX,
  DETAIL_TEXT_GAP_PX,
  DETAIL_TEXT_VIEWPORT_LEFT,
  FIT_VIEW_PADDING,
  FIT_ZOOM_SCALAR,
  MAIN_LINE_Y,
  MAX_ZOOM_FACTOR,
  MIN_ZOOM_FACTOR,
  SCROLL_GESTURE_GAP_MS,
  SCROLL_ON_STOP_PX,
  SCROLL_SNAP_LERP,
  SCROLL_SNAP_THRESHOLD_PX,
  SCROLL_STEP_COOLDOWN_MS,
  SCROLL_STEP_MIN_DELTA,
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
import type {
  BranchFocusInfo,
  ContentBounds,
  FocusTarget,
  TimelineSketchDeps,
} from '../types';
import type { BoundsContext } from './bounds';
import { computeCollectedLaneHover } from './drawCollectedLane';

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
  scrollView: (deltaX: number, deltaY: number) => void;
  fitView: () => void;
  animateView: () => void;
  animateScrollSnap: () => void;
  findClickedItem: (worldX: number, worldY: number) => FocusTarget | null;
  findClickedBranch: (worldX: number, worldY: number) => number | null;
  focusItem: (target: FocusTarget) => void;
  focusBranch: (rowIndex: number) => void;
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

  // Frame an arbitrary set of item bounds: set the target zoom/camera so the
  // whole set fits with padding, centred. Returns the framed centre (for the
  // zoom animation anchor), or null when the set is empty/degenerate.
  const computeFitTargetsForBounds = (
    list: ContentBounds[]
  ): { centerX: number; centerY: number } | null => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    list.forEach((b) => {
      minX = Math.min(minX, b.left);
      maxX = Math.max(maxX, b.right);
      minY = Math.min(minY, b.top);
      maxY = Math.max(maxY, b.dateBottom);
    });

    if (!(Number.isFinite(minX) && maxX > minX && maxY > minY)) {
      return null;
    }

    const paddedWidth = maxX - minX + FIT_VIEW_PADDING * 2;
    const paddedHeight = maxY - minY + FIT_VIEW_PADDING * 2;
    const zoomX = p.width / paddedWidth;
    const zoomY = p.height / paddedHeight;
    runtime.targetZoom = Math.min(zoomX, zoomY) * FIT_ZOOM_SCALAR;
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    runtime.targetCameraX = centerX - p.width / (2 * runtime.targetZoom);
    runtime.targetCameraY = centerY - p.height / (2 * runtime.targetZoom);
    return { centerX, centerY };
  };

  const computeFitViewTargets = () => {
    const center = computeFitTargetsForBounds([
      ...bounds.getAllBounds(),
      ...bounds.getCollectedBounds(),
    ]);
    if (!center) {
      runtime.targetZoom = 1;
      runtime.targetCameraX = 0;
      runtime.targetCameraY = MAIN_LINE_Y - p.height / (2 * runtime.targetZoom);
    }
    runtime.fitZoomLevel = runtime.targetZoom;
  };

  const computeFocusViewTargets = (focusBounds: ContentBounds) => {
    // Frame the item directly at its detail position — left-aligned, vertically
    // centred, 60vh tall — so the focus is a single zoom with no extra slide.
    const maxWidthScreen =
      p.width * DETAIL_TEXT_VIEWPORT_LEFT -
      DETAIL_TEXT_GAP_PX -
      DETAIL_IMAGE_LEFT_PX;
    let zoom = (p.height * DETAIL_IMAGE_HEIGHT_VH) / focusBounds.height;
    if (focusBounds.width * zoom > maxWidthScreen && maxWidthScreen > 0) {
      zoom = maxWidthScreen / focusBounds.width;
    }
    const itemScreenHeight = focusBounds.height * zoom;
    const targetLeftScreen = DETAIL_IMAGE_LEFT_PX;
    const targetTopScreen = (p.height - itemScreenHeight) / 2;
    runtime.targetZoom = zoom;
    runtime.targetCameraX = focusBounds.left - targetLeftScreen / zoom;
    runtime.targetCameraY = focusBounds.top - targetTopScreen / zoom;
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
    runtime.snapping = false;
    syncViewTargets();
  };

  // Ordered list of discrete snap stops (one per item, sorted along the
  // timeline) that scrolling steps between.
  const getSnapStops = (): { x: number; y: number }[] =>
    [...bounds.getAllBounds(), ...bounds.getCollectedBounds()]
      .map((b) => ({ x: (b.left + b.right) / 2, y: b.top + b.height / 2 }))
      .sort((a, b) => a.x - b.x || a.y - b.y);

  const setSnapTarget = (stop: { x: number; y: number }) => {
    runtime.snapTargetCameraX = stop.x - p.width / (2 * runtime.zoom);
    runtime.snapTargetCameraY = stop.y - p.height / (2 * runtime.zoom);
    runtime.snapping = true;
  };

  // Discrete navigation: each scroll gesture steps to the next/previous snap
  // stop rather than panning freely. Axis is locked to the dominant wheel
  // delta so movement is never diagonal.
  const scrollView = (deltaX: number, deltaY: number) => {
    if (isViewInteractionLocked(runtime)) {
      return;
    }

    const delta =
      Math.abs(deltaX) >= Math.abs(deltaY) ? deltaX : deltaY;
    if (Math.abs(delta) < SCROLL_STEP_MIN_DELTA) {
      return;
    }

    const now = p.millis();
    const newGesture = now - runtime.lastWheelMs > SCROLL_GESTURE_GAP_MS;
    runtime.lastWheelMs = now;
    // Within one continuous gesture, only advance once per cooldown so a
    // trackpad fling doesn't blow through every stop at once.
    if (!newGesture && now < runtime.snapStepReadyMs) {
      return;
    }

    const stops = getSnapStops();
    if (stops.length === 0) {
      return;
    }

    const viewCenterX = runtime.cameraX + p.width / (2 * runtime.zoom);
    const viewCenterY = runtime.cameraY + p.height / (2 * runtime.zoom);
    let nearest = 0;
    let bestDistance = Infinity;
    stops.forEach((stop, index) => {
      const distance = Math.hypot(stop.x - viewCenterX, stop.y - viewCenterY);
      if (distance < bestDistance) {
        bestDistance = distance;
        nearest = index;
      }
    });

    const direction = delta > 0 ? 1 : -1;
    // If we aren't already parked on a stop, the first scroll just snaps onto
    // the nearest one; otherwise it steps to the neighbour.
    const onStop = bestDistance * runtime.zoom <= SCROLL_ON_STOP_PX;
    const targetIndex = onStop
      ? Math.max(0, Math.min(stops.length - 1, nearest + direction))
      : nearest;

    resetCanvasFocus(runtime);
    setSnapTarget(stops[targetIndex]);
    syncViewTargets();
    runtime.snapStepReadyMs = now + SCROLL_STEP_COOLDOWN_MS;
  };

  const animateScrollSnap = () => {
    if (!runtime.snapping) {
      return;
    }

    const nextX =
      runtime.cameraX +
      (runtime.snapTargetCameraX - runtime.cameraX) * SCROLL_SNAP_LERP;
    const nextY =
      runtime.cameraY +
      (runtime.snapTargetCameraY - runtime.cameraY) * SCROLL_SNAP_LERP;

    const settled =
      Math.abs(runtime.snapTargetCameraX - nextX) * runtime.zoom <
        SCROLL_SNAP_THRESHOLD_PX &&
      Math.abs(runtime.snapTargetCameraY - nextY) * runtime.zoom <
        SCROLL_SNAP_THRESHOLD_PX;

    if (settled) {
      runtime.cameraX = runtime.snapTargetCameraX;
      runtime.cameraY = runtime.snapTargetCameraY;
      runtime.snapping = false;
    } else {
      runtime.cameraX = nextX;
      runtime.cameraY = nextY;
    }
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
    clearBranchFocus();
    runtime.snapping = false;
    runtime.snapStepReadyMs = 0;
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
      // Where the anchor world point lands on screen under the final target —
      // not necessarily the viewport centre, so off-centre framings animate
      // smoothly instead of jumping at the end.
      const finalScreenX =
        (runtime.animationWorldX - runtime.targetCameraX) * runtime.targetZoom;
      const finalScreenY =
        (runtime.animationWorldY - runtime.targetCameraY) * runtime.targetZoom;
      const screenX =
        runtime.animationStartScreenX +
        (finalScreenX - runtime.animationStartScreenX) * progress;
      const screenY =
        runtime.animationStartScreenY +
        (finalScreenY - runtime.animationStartScreenY) * progress;
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

  // Record which branch the view is zoomed into and tell React, so it can show
  // (or hide) the top-bar label. Passing null clears it.
  const setBranchFocus = (rowIndex: number | null) => {
    runtime.focusedBranchRow = rowIndex;
    if (rowIndex === null) {
      deps.refs.onBranchFocusRef.current?.(null);
      return;
    }
    let info: BranchFocusInfo | null = null;
    for (const item of deps.processedCollected) {
      const source = item.sources.find((s) => s.rowIndex === rowIndex);
      if (source) {
        info = { username: source.username, colour: source.colour };
        break;
      }
    }
    deps.refs.onBranchFocusRef.current?.(info);
  };

  const clearBranchFocus = () => {
    if (runtime.focusedBranchRow !== null) {
      setBranchFocus(null);
    }
  };

  // A click landing on a collector's branch line (not an item) returns that
  // collector's row index, so the view can frame just their timeline.
  const findClickedBranch = (worldX: number, worldY: number): number | null => {
    const hover = computeCollectedLaneHover(
      deps,
      bounds,
      bounds.getCollectedBounds(),
      bounds.getAllBounds(),
      { x: worldX, y: worldY },
      false
    );
    return hover.hoveredCollectedIsImage ? null : hover.hoveredUserRow;
  };

  // Zoom/pan so the items collected on one branch (rowIndex) fill the screen.
  // This is a camera move only — no item focus / detail panel.
  const focusBranch = (rowIndex: number) => {
    const collectedBounds = bounds.getCollectedBounds();
    const mainBounds = bounds.getAllBounds();
    const branchItems = deps.processedCollected
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item.sources.some((s) => s.rowIndex === rowIndex));
    if (branchItems.length === 0) {
      return;
    }

    const branchBounds = branchItems.map(({ index }) => collectedBounds[index]);

    // Also frame the main-line items the branch springs from / rejoins (the
    // item before each pick and the one after it), so the branch's origin on
    // the main timeline is visible too.
    const mainIndices = new Set<number>();
    for (const { item } of branchItems) {
      const prev = Math.max(0, bounds.getPreviousMainIndex(item.anchorTime));
      mainIndices.add(prev);
      if (prev + 1 < mainBounds.length) {
        mainIndices.add(prev + 1);
      }
    }
    for (const index of mainIndices) {
      branchBounds.push(mainBounds[index]);
    }

    resetCanvasFocus(runtime);
    deps.refs.onContentUnfocusRef.current?.();
    runtime.focusContentFade = 0;
    notifyFocusFade(deps);
    runtime.snapping = false;
    runtime.snapStepReadyMs = 0;
    runtime.viewUnfocusing = false;
    syncInteractionLock(deps);

    const center = computeFitTargetsForBounds(branchBounds);
    if (!center) {
      return;
    }
    // Don't zoom past the manual zoom ceiling for a tiny branch; keep the
    // framed centre.
    const maxZoom = runtime.fitZoomLevel * MAX_ZOOM_FACTOR;
    if (runtime.targetZoom > maxZoom) {
      runtime.targetZoom = maxZoom;
      runtime.targetCameraX = center.centerX - p.width / (2 * runtime.targetZoom);
      runtime.targetCameraY = center.centerY - p.height / (2 * runtime.targetZoom);
    }

    setBranchFocus(rowIndex);
    beginViewAnimation(center.centerX, center.centerY);
    runtime.viewAnimating = true;
  };

  const focusItem = (target: FocusTarget) => {
    clearBranchFocus();
    runtime.snapping = false;
    runtime.snapStepReadyMs = 0;
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
    // Start the detail reveal immediately so the image slides into its
    // bottom-left position as it zooms in — a single motion rather than a
    // centred zoom followed by a separate slide.
    startDetailReveal(runtime, target, deps);
  };

  const unfocusItem = () => {
    clearBranchFocus();
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
    scrollView,
    fitView,
    animateView,
    animateScrollSnap,
    findClickedItem,
    findClickedBranch,
    focusItem,
    focusBranch,
    unfocusItem,
    isViewInteractionLocked: () => isViewInteractionLocked(runtime),
  };
}
