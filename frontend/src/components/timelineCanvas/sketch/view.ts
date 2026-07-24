import type p5 from 'p5';
import {
  DATE_OFFSET,
  DETAIL_IMAGE_HEIGHT_VH,
  DETAIL_IMAGE_LEFT_PX,
  DETAIL_TEXT_GAP_PX,
  DETAIL_TEXT_VIEWPORT_LEFT,
  ENTRANCE_ZOOM_START_FACTOR,
  FIT_VIEW_PADDING,
  FIT_VIEW_TOP_CLEARANCE_PX,
  FIT_ZOOM_SCALAR,
  ITEM_GAP,
  ITEM_WIDTH,
  MAIN_LINE_Y,
  MAX_ZOOM_LEVEL,
  MIN_ZOOM_FACTOR,
  PAN_LERP,
  PAN_SETTLE_THRESHOLD_PX,
  VIEW_ANIMATION_LERP,
  VIEW_SNAP_THRESHOLD,
  VIEW_UNFOCUS_ANIMATION_LERP,
  WHEEL_ZOOM_SENSITIVITY,
  ZOOM_LERP,
  ZOOM_SETTLE_THRESHOLD,
} from '../constants';
import { hitTest } from '../geometry';
import {
  getFocusedSlug,
  isPrivateTarget,
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
  playEntranceAnimation: () => void;
  animateView: () => void;
  animatePan: () => void;
  animateZoom: () => void;
  findClickedItem: (worldX: number, worldY: number) => FocusTarget | null;
  findClickedBranch: (worldX: number, worldY: number) => number | null;
  focusItem: (target: FocusTarget) => void;
  focusBranch: (rowIndex: number) => void;
  unfocusItem: () => void;
  toggleOwnBranchIsolation: () => void;
  exitBranchIsolation: () => void;
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
    runtime.animationStartCameraX = runtime.cameraX;
    runtime.animationStartCameraY = runtime.cameraY;
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
    // Size the zoom on the MAIN timeline's width so it spans the screen
    // edge-to-edge; the branches above/below then overflow the top and bottom.
    const mainBounds = bounds.getAllBounds();
    let minX = Infinity;
    let maxX = -Infinity;
    mainBounds.forEach((b) => {
      minX = Math.min(minX, b.left);
      maxX = Math.max(maxX, b.right);
    });

    if (Number.isFinite(minX) && maxX > minX) {
      const paddedWidth = maxX - minX + FIT_VIEW_PADDING * 2;
      runtime.targetZoom = (p.width / paddedWidth) * FIT_ZOOM_SCALAR;
      const centerX = (minX + maxX) / 2;
      runtime.targetCameraX = centerX - p.width / (2 * runtime.targetZoom);
      // Keeps the main line exactly vertically centred on initial load; the
      // extra top clearance for the user card only applies to how far branches
      // can be dragged/zoomed toward it (see getContentExtent), not the
      // default framing.
      runtime.targetCameraY = MAIN_LINE_Y - p.height / (2 * runtime.targetZoom);
    } else {
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

  // The even-spaced straightened layout for an isolated branch: its collected
  // items laid out on the main line at a fixed step, centred on their centroid
  // — matching the ease target in drawFrame's getDetailDrawBoundsIso. Returns
  // each item's final straight rect plus the framing extents, or null if the
  // row has no items.
  const isolatedBranchLayout = (
    rowIndex: number
  ): {
    straight: Map<number, ContentBounds>;
    centroid: number;
    minX: number;
    maxX: number;
  } | null => {
    const cb = bounds.getCollectedBounds();
    const items = deps.processedCollected
      .map((item, index) => ({ item, index, b: cb[index] }))
      .filter(
        ({ item, b }) => b && item.sources.some((s) => s.rowIndex === rowIndex)
      )
      .map(({ index, b }) => ({
        index,
        cx: (b.left + b.right) / 2,
        width: b.width,
        height: b.height,
      }))
      .sort((a, b) => a.cx - b.cx);
    if (items.length === 0) {
      return null;
    }
    const n = items.length;
    const step = ITEM_WIDTH + ITEM_GAP;
    const centroid = items.reduce((sum, e) => sum + e.cx, 0) / n;
    const startX = centroid - ((n - 1) * step) / 2;
    const straight = new Map<number, ContentBounds>();
    let minX = Infinity;
    let maxX = -Infinity;
    items.forEach((e, k) => {
      const cx = startX + k * step;
      straight.set(e.index, {
        left: cx - e.width / 2,
        right: cx + e.width / 2,
        width: e.width,
        height: e.height,
        top: MAIN_LINE_Y - e.height / 2,
        centerY: MAIN_LINE_Y,
        dateBottom: MAIN_LINE_Y + e.height / 2 + DATE_OFFSET,
      });
      minX = Math.min(minX, cx - e.width / 2);
      maxX = Math.max(maxX, cx + e.width / 2);
    });
    return { straight, centroid, minX, maxX };
  };

  // Sets the camera targets to frame an isolated branch's even-spaced layout
  // (main line edge-to-edge, vertically centred), and returns its centroid for
  // the zoom-animation anchor — or null if the row has no items.
  const frameIsolatedBranch = (rowIndex: number): number | null => {
    const layout = isolatedBranchLayout(rowIndex);
    if (!layout) {
      return null;
    }
    const paddedWidth = layout.maxX - layout.minX + FIT_VIEW_PADDING * 2;
    runtime.targetZoom = (p.width / paddedWidth) * FIT_ZOOM_SCALAR;
    const maxZoom = Math.max(MAX_ZOOM_LEVEL, runtime.fitZoomLevel);
    runtime.targetZoom = Math.min(runtime.targetZoom, maxZoom);
    runtime.targetCameraX = layout.centroid - p.width / (2 * runtime.targetZoom);
    runtime.targetCameraY = MAIN_LINE_Y - p.height / (2 * runtime.targetZoom);
    return layout.centroid;
  };

  const getFocusBounds = (target: FocusTarget): ContentBounds => {
    if (target.lane === 'main') {
      return bounds.getAllBounds()[target.index];
    }
    // While isolating, an item is drawn at its straightened even-spaced
    // position, so the focus must aim there (not its branch position).
    if (runtime.branchIsolateRow !== null) {
      const straight = isolatedBranchLayout(runtime.branchIsolateRow)?.straight;
      const rect = straight?.get(target.index);
      if (rect) {
        return rect;
      }
    }
    // Settled (row-growth 1) position: focusing zooms in past the fit level,
    // where the collected rows have eased back to their base spacing, so the
    // camera must aim where the item ends up — not its spread-out position at
    // the current zoomed-out level, which would leave the focus on empty space.
    return bounds.getCollectedBounds(1)[target.index];
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

  // The world-space rectangle covering every item (main + collected), padded so
  // a little breathing room shows past the outermost items. The camera is kept
  // inside this so the user can't pan off into empty space.
  const getContentExtent = (): {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  } | null => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const b of [
      ...bounds.getAllBounds(),
      ...bounds.getCollectedBounds(),
    ]) {
      minX = Math.min(minX, b.left);
      maxX = Math.max(maxX, b.right);
      minY = Math.min(minY, b.top);
      maxY = Math.max(maxY, b.dateBottom);
    }
    if (!Number.isFinite(minX)) {
      return null;
    }
    // Extra headroom on top of the usual padding on every side, so
    // dragging/zooming can't pull content up underneath the fixed
    // user-card/mini-player stack (or flush against any other edge) — matches
    // the clearance the default fit view already leaves on top.
    const extraClearance = FIT_VIEW_TOP_CLEARANCE_PX / runtime.zoom;
    return {
      minX: minX - FIT_VIEW_PADDING - extraClearance,
      maxX: maxX + FIT_VIEW_PADDING + extraClearance,
      minY: minY - FIT_VIEW_PADDING - extraClearance,
      maxY: maxY + FIT_VIEW_PADDING + extraClearance,
    };
  };

  // Clamp one axis so the viewport stays within [contentMin, contentMax].
  // When the content is smaller than the viewport on that axis, the camera is
  // free to sit anywhere that still keeps the content fully in view (from
  // flush against the near edge to flush against the far edge) rather than
  // forced to one exact centred point — a fixed point would fight (and get
  // overridden every frame by) anchor-based zooming/panning once zoomed out
  // past the content's own size, snapping the camera away from the cursor.
  const clampAxis = (
    camera: number,
    viewSize: number,
    contentMin: number,
    contentMax: number
  ): number => {
    const contentSize = contentMax - contentMin;
    if (contentSize <= viewSize) {
      return Math.max(contentMax - viewSize, Math.min(camera, contentMin));
    }
    return Math.max(contentMin, Math.min(camera, contentMax - viewSize));
  };

  // Keep the camera inside the timeline's content so panning/zooming can't
  // stray into empty space.
  const clampCameraToContent = () => {
    const extent = getContentExtent();
    if (!extent) {
      return;
    }
    const viewW = p.width / runtime.zoom;
    const viewH = p.height / runtime.zoom;
    runtime.cameraX = clampAxis(
      runtime.cameraX,
      viewW,
      extent.minX,
      extent.maxX
    );
    runtime.cameraY = clampAxis(
      runtime.cameraY,
      viewH,
      extent.minY,
      extent.maxY
    );
  };

  // Nudges the eased pan target by a screen-space delta (clamped to the
  // content), shared by drag-panning and scroll-wheel panning so both ease
  // toward their target identically via animatePan. Rebases the target from
  // the live camera first if nothing is currently mid-ease — either the
  // previous pan has settled, or the camera moved via zoom/focus/fit since —
  // so a fresh gesture never resumes from a stale, abandoned target.
  const nudgePanTarget = (deltaX: number, deltaY: number) => {
    if (!runtime.panning) {
      runtime.panTargetCameraX = runtime.cameraX;
      runtime.panTargetCameraY = runtime.cameraY;
    }
    // A pan gesture takes over from any in-flight wheel-zoom so the two
    // eases don't fight over the camera.
    runtime.zooming = false;

    runtime.panTargetCameraX += deltaX / runtime.zoom;
    runtime.panTargetCameraY += deltaY / runtime.zoom;

    const extent = getContentExtent();
    if (extent) {
      const viewW = p.width / runtime.zoom;
      const viewH = p.height / runtime.zoom;
      runtime.panTargetCameraX = clampAxis(
        runtime.panTargetCameraX,
        viewW,
        extent.minX,
        extent.maxX
      );
      runtime.panTargetCameraY = clampAxis(
        runtime.panTargetCameraY,
        viewH,
        extent.minY,
        extent.maxY
      );
    }

    runtime.panning = true;
  };

  // Dragging the canvas eases toward the drag target just like scroll-wheel
  // panning, via animatePan.
  const panView = (deltaScreenX: number, deltaScreenY: number) => {
    nudgePanTarget(-deltaScreenX, -deltaScreenY);
  };

  // Free continuous panning across the timeline: each wheel event nudges the
  // same eased pan target as dragging (clamped to the content), and animatePan
  // eases the actual camera toward it every frame so the motion is smoothed
  // rather than jumping straight to each delta.
  const scrollView = (deltaX: number, deltaY: number) => {
    if (isViewInteractionLocked(runtime)) {
      return;
    }
    nudgePanTarget(deltaX, deltaY);
    resetCanvasFocus(runtime);
  };

  const animatePan = () => {
    if (!runtime.panning) {
      return;
    }

    const nextX =
      runtime.cameraX + (runtime.panTargetCameraX - runtime.cameraX) * PAN_LERP;
    const nextY =
      runtime.cameraY + (runtime.panTargetCameraY - runtime.cameraY) * PAN_LERP;

    const settled =
      Math.abs(runtime.panTargetCameraX - nextX) * runtime.zoom <
        PAN_SETTLE_THRESHOLD_PX &&
      Math.abs(runtime.panTargetCameraY - nextY) * runtime.zoom <
        PAN_SETTLE_THRESHOLD_PX;

    if (settled) {
      runtime.cameraX = runtime.panTargetCameraX;
      runtime.cameraY = runtime.panTargetCameraY;
      runtime.panning = false;
    } else {
      runtime.cameraX = nextX;
      runtime.cameraY = nextY;
    }
    syncViewTargets();
  };

  // Wheel/pinch zoom: each tick nudges an eased zoom target, anchored on the
  // point currently under the cursor. animateZoom eases the actual zoom
  // toward that target every frame, recomputing the camera each frame so the
  // anchor point stays fixed on screen as it zooms in/out. Zooming out is
  // capped relative to the fit-to-screen level (so you can't zoom out past
  // seeing the whole timeline); zooming in is capped at a fixed absolute
  // level (MAX_ZOOM_LEVEL) so the closest zoom looks the same regardless of
  // how zoomed-out the default fit view is for a given timeline's size —
  // but never tighter than the fit level itself, so a sparse timeline (whose
  // fit zoom already exceeds MAX_ZOOM_LEVEL) isn't immediately over the cap.
  const zoomViewAt = (screenX: number, screenY: number, delta: number) => {
    if (isViewInteractionLocked(runtime)) {
      return;
    }

    const minZoom = runtime.fitZoomLevel * MIN_ZOOM_FACTOR;
    const maxZoom = Math.max(MAX_ZOOM_LEVEL, runtime.fitZoomLevel);
    const zoomFactor = Math.exp(-delta * WHEEL_ZOOM_SENSITIVITY);
    // Rebase from the live zoom if nothing is currently mid-ease, same
    // rebase pattern as nudgePanTarget.
    const base = runtime.zooming ? runtime.zoomTargetZoom : runtime.zoom;
    runtime.zoomTargetZoom = Math.max(
      minZoom,
      Math.min(maxZoom, base * zoomFactor)
    );

    // Re-anchor on the cursor's current world point every tick, so the
    // pinned point tracks the cursor even if it drifts slightly mid-gesture.
    runtime.zoomAnchorWorldX = screenX / runtime.zoom + runtime.cameraX;
    runtime.zoomAnchorWorldY = screenY / runtime.zoom + runtime.cameraY;
    runtime.zoomAnchorScreenX = screenX;
    runtime.zoomAnchorScreenY = screenY;

    // A zoom gesture takes over from any in-flight pan so the two eases
    // don't fight over the camera.
    runtime.panning = false;
    runtime.panTargetCameraX = runtime.cameraX;
    runtime.panTargetCameraY = runtime.cameraY;
    resetCanvasFocus(runtime);
    runtime.zooming = true;
  };

  const animateZoom = () => {
    if (!runtime.zooming) {
      return;
    }

    const nextZoom =
      runtime.zoom + (runtime.zoomTargetZoom - runtime.zoom) * ZOOM_LERP;
    const settled =
      Math.abs(runtime.zoomTargetZoom - nextZoom) < ZOOM_SETTLE_THRESHOLD;
    const appliedZoom = settled ? runtime.zoomTargetZoom : nextZoom;

    runtime.cameraX =
      runtime.zoomAnchorWorldX - runtime.zoomAnchorScreenX / appliedZoom;
    runtime.cameraY =
      runtime.zoomAnchorWorldY - runtime.zoomAnchorScreenY / appliedZoom;
    runtime.zoom = appliedZoom;
    clampCameraToContent();
    // Keep the pan target in sync so a following drag/scroll starts smoothly
    // from here instead of the pre-zoom position.
    runtime.panTargetCameraX = runtime.cameraX;
    runtime.panTargetCameraY = runtime.cameraY;
    syncViewTargets();

    if (settled) {
      runtime.zooming = false;
    }
  };

  const fitView = () => {
    clearBranchFocus();
    runtime.panning = false;
    runtime.zooming = false;
    resetCanvasFocus(runtime);
    computeFitViewTargets();
    applyViewTargets();
    runtime.panTargetCameraX = runtime.cameraX;
    runtime.panTargetCameraY = runtime.cameraY;
    runtime.viewAnimating = false;
    runtime.viewUnfocusing = false;
  };

  // Initial-load entrance: starts zoomed out from the fit view's own centre
  // and eases in to it, rather than the timeline just appearing already
  // framed. Uses the same zoom-anchored animation as focusing an item.
  const playEntranceAnimation = () => {
    clearBranchFocus();
    runtime.panning = false;
    runtime.zooming = false;
    resetCanvasFocus(runtime);
    computeFitViewTargets();

    const worldX =
      runtime.targetCameraX + p.width / (2 * runtime.targetZoom);
    const worldY =
      runtime.targetCameraY + p.height / (2 * runtime.targetZoom);
    runtime.zoom = runtime.targetZoom * ENTRANCE_ZOOM_START_FACTOR;
    runtime.cameraX = worldX - p.width / (2 * runtime.zoom);
    runtime.cameraY = worldY - p.height / (2 * runtime.zoom);
    runtime.panTargetCameraX = runtime.cameraX;
    runtime.panTargetCameraY = runtime.cameraY;

    beginViewAnimation(worldX, worldY);
    runtime.viewAnimating = true;
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
    } else if (
      Math.hypot(
        runtime.targetCameraX - runtime.cameraX,
        runtime.targetCameraY - runtime.cameraY
      ) *
        runtime.targetZoom >
      PAN_SETTLE_THRESHOLD_PX
    ) {
      // Zoom has settled but the camera hasn't: ease it straight to the target.
      // This is the path when switching between two items framed at the same
      // zoom (e.g. clicking a node) — otherwise the view would cut, since the
      // zoom-driven progress above completes instantly with no pan.
      runtime.zoom = runtime.targetZoom;
      runtime.cameraX = lerp(runtime.cameraX, runtime.targetCameraX);
      runtime.cameraY = lerp(runtime.cameraY, runtime.targetCameraY);
      const totalPan = Math.hypot(
        runtime.targetCameraX - runtime.animationStartCameraX,
        runtime.targetCameraY - runtime.animationStartCameraY
      );
      const remainingPan = Math.hypot(
        runtime.targetCameraX - runtime.cameraX,
        runtime.targetCameraY - runtime.cameraY
      );
      const progress =
        totalPan > 0
          ? Math.max(0, Math.min(1, 1 - remainingPan / totalPan))
          : 1;
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
    runtime.panning = false;
    runtime.zooming = false;
    runtime.viewUnfocusing = false;
    syncInteractionLock(deps);

    const center = computeFitTargetsForBounds(branchBounds);
    if (!center) {
      return;
    }
    // Don't zoom past the manual zoom ceiling for a tiny branch; keep the
    // framed centre.
    const maxZoom = Math.max(MAX_ZOOM_LEVEL, runtime.fitZoomLevel);
    if (runtime.targetZoom > maxZoom) {
      runtime.targetZoom = maxZoom;
      runtime.targetCameraX =
        center.centerX - p.width / (2 * runtime.targetZoom);
      runtime.targetCameraY =
        center.centerY - p.height / (2 * runtime.targetZoom);
    }

    setBranchFocus(rowIndex);
    beginViewAnimation(center.centerX, center.centerY);
    runtime.viewAnimating = true;
  };

  const focusItem = (target: FocusTarget) => {
    if (isPrivateTarget(deps, target)) {
      return;
    }
    clearBranchFocus();
    // Focusing an item from the isolated view keeps the isolation active
    // underneath (the branch stays straightened and the others stay faded), so
    // getFocusBounds aims at the item's straightened position and unfocusing
    // returns to the isolated timeline rather than the full one.
    runtime.panning = false;
    runtime.zooming = false;
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
    runtime.panning = false;
    runtime.zooming = false;
    runtime.viewUnfocusing = true;
    // If an item was focused from within the isolated view, unfocusing returns
    // to that isolated branch, not the full timeline.
    if (runtime.branchIsolateRow !== null) {
      const centroid = frameIsolatedBranch(runtime.branchIsolateRow);
      syncInteractionLock(deps);
      beginViewAnimation(centroid ?? p.width / 2, MAIN_LINE_Y);
      runtime.viewAnimating = true;
      return;
    }
    computeFitViewTargets();
    syncInteractionLock(deps);
    beginViewAnimation(
      runtime.targetCameraX + p.width / (2 * runtime.targetZoom),
      runtime.targetCameraY + p.height / (2 * runtime.targetZoom)
    );
    runtime.viewAnimating = true;
  };

  const getOwnBranchRow = (): number => {
    if (!deps.currentUsername) {
      return -1;
    }
    for (const item of deps.processedCollected) {
      const source = item.sources.find(
        (s) => s.username === deps.currentUsername
      );
      if (source) {
        return source.rowIndex;
      }
    }
    return -1;
  };

  const animateToFitAll = () => {
    computeFitViewTargets();
    beginViewAnimation(
      runtime.targetCameraX + p.width / (2 * runtime.targetZoom),
      runtime.targetCameraY + p.height / (2 * runtime.targetZoom)
    );
    runtime.viewAnimating = true;
  };

  const exitBranchIsolation = () => {
    if (!runtime.branchIsolateActive) {
      return;
    }
    // Keep the row set so the straighten/fade can ease back out; drawFrame
    // clears it once the progress reaches zero.
    runtime.branchIsolateActive = false;
    animateToFitAll();
  };

  const toggleOwnBranchIsolation = () => {
    if (runtime.branchIsolateActive) {
      exitBranchIsolation();
      return;
    }

    const ownRow = getOwnBranchRow();
    if (ownRow < 0 || !isolatedBranchLayout(ownRow)) {
      return;
    }

    clearBranchFocus();
    resetCanvasFocus(runtime);
    deps.refs.onContentUnfocusRef.current?.();
    runtime.focusContentFade = 0;
    notifyFocusFade(deps);
    runtime.panning = false;
    runtime.zooming = false;
    runtime.viewUnfocusing = false;
    runtime.branchIsolateRow = ownRow;
    runtime.branchIsolateActive = true;
    syncInteractionLock(deps);

    // Frame the branch's final even-spaced straightened layout (main line
    // edge-to-edge, vertically centred), not its scattered date-driven
    // positions.
    const centroid = frameIsolatedBranch(ownRow);
    if (centroid !== null) {
      beginViewAnimation(centroid, MAIN_LINE_Y);
      runtime.viewAnimating = true;
    }
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
    playEntranceAnimation,
    animateView,
    animatePan,
    animateZoom,
    findClickedItem,
    findClickedBranch,
    focusItem,
    focusBranch,
    unfocusItem,
    toggleOwnBranchIsolation,
    exitBranchIsolation,
    isViewInteractionLocked: () => isViewInteractionLocked(runtime),
  };
}
