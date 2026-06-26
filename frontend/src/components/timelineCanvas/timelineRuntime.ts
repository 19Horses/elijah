import {
  DETAIL_LAYOUT_LERP,
  HIGHLIGHT_FADE_OUT_LERP,
  HIGHLIGHT_FADE_SNAP,
} from './constants';
import type {
  FocusTarget,
  ProcessedCollected,
  TimelineRuntime,
  TimelineSketchDeps,
} from './types';

export function createTimelineRuntime(): TimelineRuntime {
  return {
    dragLane: null,
    dragIndex: 0,
    dragPointerOffsetX: 0,
    dragPointerOffsetY: 0,
    pressX: 0,
    pressY: 0,
    cameraX: 0,
    cameraY: 0,
    zoom: 1,
    targetCameraX: 0,
    targetCameraY: 0,
    targetZoom: 1,
    snapping: false,
    snapTargetCameraX: 0,
    snapTargetCameraY: 0,
    lastWheelMs: 0,
    snapStepReadyMs: 0,
    focusTarget: null,
    viewAnimating: false,
    viewUnfocusing: false,
    fitZoomLevel: 1,
    animationWorldX: 0,
    animationWorldY: 0,
    animationStartScreenX: 0,
    animationStartScreenY: 0,
    animationStartZoom: 1,
    activeHighlightType: null,
    highlightStrength: 0,
    branchDimStrength: 0,
    branchDimRow: null,
    loadStartMs: 0,
    focusContentFade: 0,
    detailPhase: 'none',
    detailLayout: 0,
  };
}

export function resetCanvasFocus(runtime: TimelineRuntime): void {
  runtime.detailPhase = 'none';
  runtime.detailLayout = 0;
  runtime.focusTarget = null;
}

export function getFocusedSlug(
  target: FocusTarget,
  items: TimelineSketchDeps['items'],
  processedCollected: ProcessedCollected[]
): string | null {
  if (target.lane === 'main') {
    return items[target.index]?.slug ?? null;
  }
  return processedCollected[target.index]?.slug ?? null;
}

export function startDetailReveal(
  runtime: TimelineRuntime,
  target: FocusTarget,
  deps: TimelineSketchDeps
): void {
  if (!getFocusedSlug(target, deps.items, deps.processedCollected)) {
    return;
  }
  if (runtime.detailPhase !== 'none') {
    return;
  }
  runtime.detailPhase = 'layout';
  runtime.detailLayout = 0;
  deps.refs.onDetailLayoutStartRef.current?.();
}

export function animateDetailReveal(runtime: TimelineRuntime): void {
  if (runtime.detailPhase !== 'layout') {
    return;
  }

  runtime.detailLayout = Math.min(1, runtime.detailLayout + DETAIL_LAYOUT_LERP);
  if (runtime.detailLayout >= 1 - HIGHLIGHT_FADE_SNAP) {
    runtime.detailLayout = 1;
    runtime.detailPhase = 'complete';
  }
}

export function notifyFocusFade(deps: TimelineSketchDeps): void {
  deps.refs.onFocusFadeChangeRef.current?.(deps.runtime.focusContentFade);
}

export function updateHighlightFade(
  runtime: TimelineRuntime,
  deps: TimelineSketchDeps
): void {
  const targetType = deps.refs.highlightedTypeRef.current;
  if (targetType) {
    runtime.activeHighlightType = targetType;
    runtime.highlightStrength = 1;
    return;
  }

  if (runtime.highlightStrength <= HIGHLIGHT_FADE_SNAP) {
    runtime.highlightStrength = 0;
    runtime.activeHighlightType = null;
    return;
  }

  runtime.highlightStrength +=
    (0 - runtime.highlightStrength) * HIGHLIGHT_FADE_OUT_LERP;
}

export function isViewInteractionLocked(runtime: TimelineRuntime): boolean {
  return (
    runtime.focusTarget !== null ||
    runtime.viewUnfocusing ||
    runtime.detailPhase !== 'none'
  );
}

export function syncInteractionLock(deps: TimelineSketchDeps): void {
  deps.refs.interactionLockedRef.current = isViewInteractionLocked(
    deps.runtime
  );
}

export function isFutureDatedItem(
  item: TimelineSketchDeps['items'][number] | undefined
): boolean {
  if (!item?.date) {
    return false;
  }
  const time = new Date(item.date).getTime();
  if (Number.isNaN(time)) {
    return false;
  }
  return time > Date.now();
}
