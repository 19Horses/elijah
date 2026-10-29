import type p5 from 'p5';
import {
  getStaggeredLoadAlpha,
  getTypeDimAlpha,
  hexToRgba,
  mixHex,
  resetCanvasEffects,
} from '../canvasEffects';
import {
  DATE_LABEL_SHADOW_BLUR_PX,
  BRANCH_DIM_LERP,
  DATE_FONT_MERGE_SHRINK,
  HIGHLIGHT_FADE_SNAP,
  LABEL_OUTLINE_PX,
  LINE_BLOB_FOLLOW_LERP,
  LINE_TAG_LIFT_PX,
  LOAD_ALPHA_SNAP,
  LOAD_CONNECTOR_DELAY_MS,
  LOAD_CONNECTOR_FADE_MS,
  LOAD_CONNECTOR_STAGGER_MS,
  LOAD_IMAGE_FADE_MS,
  LOAD_IMAGE_STAGGER_MS,
  LOAD_INITIAL_DELAY_MS,
  DOT_RADIUS,
  EDGE_NODE_SPRING_DAMPING,
  EDGE_NODE_SPRING_STIFFNESS,
  EDGE_NODE_X_LERP,
  MAIN_CONNECTOR_DIM_ALPHA,
  MAIN_LINE_COLOUR,
  MAIN_LINE_Y,
  MAIN_USERNAME,
  NODE_GROW_LERP,
  NODE_HOVER_GROW,
  PAGE_BACKGROUND_BOTTOM,
  PAGE_BACKGROUND_TOP,
  PRIVATE_BADGE_COLOUR,
  PRIVATE_BADGE_TEXT,
  DATE_FONT_SIZE,
  PREVIEW_EXPAND_LERP,
  PREVIEW_ICON_GAP,
  PREVIEW_ICON_LIFT,
  PREVIEW_ICON_SIZE,
  PREVIEW_SWITCH_FADE_MS,
  COLLECT_ANIM_MS,
  COLLECT_HOLD_MS,
  COLLECT_RETURN_FADE_MS,
  COLLECT_RETURN_IMAGE_WAIT_MS,
  SECONDARY_LABEL_ALPHA,
  SECONDARY_LABEL_GAP,
  ZOOM_OUT_GROWTH_POWER,
  DATE_SHRINK_TRANSITION_FACTOR,
  DATE_SHRINK_ZOOM_FACTOR,
} from '../constants';
import {
  drawBranchConnector,
  getBranchRoute,
  getMainConnectorPoints,
  nearestArcLength,
  pointAtArcLength,
} from '../connectors';
import {
  connectorWeight,
  screenToWorld,
  zoomMergeProgress,
  zoomOutGrowth,
} from '../geometry';
import {
  drawCollectedSourcesLabel,
  drawNodeCard,
  collectedByParts,
  countLabelClashes,
  drawLineTag,
  type LabelRect,
  measureLineTag,
  drawUserLabel,
  wrapText,
} from '../labels';
import {
  animateDetailReveal,
  formatDateForZoom,
  syncInteractionLock,
  updateHighlightFade,
} from '../timelineRuntime';
import type {
  ConnectorPoint,
  AudioPlayerState,
  ContentBounds,
  NodeHoverRegion,
  TimelineSketchDeps,
} from '../types';
import type { BoundsContext } from './bounds';
import {
  buildEdgeNodeLayout,
  findEdgeNodeHit,
  nodeRegionKey,
} from './edgeNodes';
import type { GalleryController } from './galleryController';
import {
  computeCollectedLaneHover,
  drawCollectedLaneConnectorDots,
  drawCollectedLaneConnectors,
  drawCollectedLaneItems,
} from './drawCollectedLane';
import {
  computeMainLaneHover,
  createMainLaneDrawHelpers,
  drawMainLaneConnectorDots,
  drawMainLaneConnectors,
  drawMainLaneItems,
  drawMainTimelineGlow,
  pushItemDateLabels,
  type DateLabel,
  type MainLaneDrawContext,
} from './drawMainLane';
import type { ViewContext } from './view';

export function createDrawFrameHandler(
  p: p5,
  deps: TimelineSketchDeps,
  boundsCtx: BoundsContext,
  view: ViewContext,
  loadedImages: (p5.Image | null)[],
  loadedCollectedImages: (p5.Image | null)[],
  loadedPreviewImages: (p5.Image | null)[],
  gallery: GalleryController
): () => void {
  const { runtime } = deps;
  const { isFocusedTarget, getDetailDrawBounds } =
    createMainLaneDrawHelpers(deps);

  // audioUrl → the item that owns it, so the mini player can be labelled and
  // suppressed while that item is the focused one.
  const audioMeta = new Map<
    string,
    {
      title: string;
      imageUrl: string | null;
      lane: 'main' | 'collected';
      index: number;
    }
  >();
  let ownBranchRow = -1;
  let syncedCollectedVersion = -1;
  const syncCollectedCaches = () => {
    if (syncedCollectedVersion === runtime.collectedVersion) {
      return;
    }
    syncedCollectedVersion = runtime.collectedVersion;
    audioMeta.clear();
    deps.processed.forEach((item, index) => {
      if (item.audioUrl) {
        audioMeta.set(item.audioUrl, {
          title: item.title,
          imageUrl: item.imageUrl,
          lane: 'main',
          index,
        });
      }
    });
    deps.processedCollected.forEach((item, index) => {
      if (item.audioUrl) {
        audioMeta.set(item.audioUrl, {
          title: item.title,
          imageUrl: item.imageUrl,
          lane: 'collected',
          index,
        });
      }
    });
    ownBranchRow = -1;
    if (deps.currentUsername) {
      for (const item of deps.processedCollected) {
        const source = item.sources.find(
          (s) => s.username === deps.currentUsername
        );
        if (source) {
          ownBranchRow = source.rowIndex;
          break;
        }
      }
    }
  };
  // Last reported mini-player key, so the ref only fires when it changes.
  let lastAudioKey = '';
  // Last reported hovered collectible-item content id, so the ref only fires
  // when it changes.
  let lastHoveredPreviewId: string | null = null;
  // Eased 0-1 "highlighted" progress per collectible item (keyed by content
  // id), so growing into/out of the selected/hovered look eases rather than
  // snapping straight to size.
  const previewHighlightProgress = new Map<string, number>();
  const previewExpandProgress = new Map<string, number>();
  const isolatedLineX = new Map<string, number>();
  // True while the pointer is inside the active video's timeline slot, so we
  // only dismiss the mini player on a real cross-in, not because the pointer
  // was already over the item after zooming out.
  let pointerInsideActiveVideoSlot = false;

  const reportAudioState = (isFocusActive: boolean) => {
    const current = deps.audio.getCurrent();
    let state: AudioPlayerState | null = null;
    if (current) {
      const meta = audioMeta.get(current.src);
      const focusedOnIt =
        isFocusActive &&
        meta !== undefined &&
        runtime.focusTarget?.lane === meta.lane &&
        runtime.focusTarget.index === meta.index;
      if (meta && !focusedOnIt) {
        state = {
          src: current.src,
          title: meta.title,
          imageUrl: meta.imageUrl,
          playing: current.playing,
          focusTarget: { lane: meta.lane, index: meta.index },
        };
      }
    }
    const key = state ? `${state.src}|${state.playing}` : 'null';
    if (key !== lastAudioKey) {
      lastAudioKey = key;
      deps.refs.onAudioStateChangeRef.current?.(state);
    }
  };

  return () => {
    syncCollectedCaches();
    view.animateView();
    view.animatePan();
    view.animateZoom();
    animateDetailReveal(runtime);
    updateHighlightFade(runtime, deps);
    syncInteractionLock(deps);

    const highlightedType = runtime.activeHighlightType;
    const typeHighlightStrength = runtime.highlightStrength;
    const isTypeHighlightActive =
      typeHighlightStrength > HIGHLIGHT_FADE_SNAP && highlightedType !== null;
    const highlightedMainContentId =
      deps.refs.highlightedMainContentIdRef.current;
    if (highlightedMainContentId !== runtime.lastHighlightedMainContentId) {
      runtime.lastHighlightedMainContentId = highlightedMainContentId;
      if (highlightedMainContentId) {
        view.previewContentId(highlightedMainContentId);
      } else {
        view.clearPreviewFocus();
      }
    }
    const centerOnPreviewId = deps.refs.centerOnPreviewIdRef.current;
    if (
      runtime.focusTarget === null &&
      centerOnPreviewId !== runtime.lastCenterOnPreviewContentId
    ) {
      runtime.lastCenterOnPreviewContentId = centerOnPreviewId;
      if (centerOnPreviewId) {
        view.previewIsolatedContentId(centerOnPreviewId);
      } else {
        view.refreshIsolatedFraming();
      }
    }
    const dimAlpha = getTypeDimAlpha(typeHighlightStrength);
    const elapsed = p.millis() - runtime.loadStartMs;
    const totalImages = deps.processed.length + deps.processedCollected.length;
    const connectorBaseStart =
      LOAD_INITIAL_DELAY_MS +
      Math.max(0, totalImages - 1) * LOAD_IMAGE_STAGGER_MS +
      LOAD_CONNECTOR_DELAY_MS;
    const collectedConnectorBaseStart =
      connectorBaseStart +
      Math.max(0, deps.processed.length - 1) * LOAD_CONNECTOR_STAGGER_MS;
    // The collected-lane connectors (or, if there are none, the main-lane
    // connectors) are the last thing to fade in — once they're done, the
    // whole entrance sequence is complete.
    const totalEntranceMs =
      collectedConnectorBaseStart +
      Math.max(0, deps.processedCollected.length - 1) *
        LOAD_CONNECTOR_STAGGER_MS +
      LOAD_CONNECTOR_FADE_MS;
    if (!runtime.entranceComplete && elapsed >= totalEntranceMs) {
      runtime.entranceComplete = true;
      deps.refs.onEntranceCompleteRef.current?.();
    }
    const getImageLoadAlpha = (imageIndex: number) =>
      getStaggeredLoadAlpha(
        elapsed,
        imageIndex,
        LOAD_IMAGE_FADE_MS,
        LOAD_IMAGE_STAGGER_MS
      );
    const getMainConnectorLoadAlpha = (connectorIndex: number) =>
      getStaggeredLoadAlpha(
        elapsed,
        connectorIndex,
        LOAD_CONNECTOR_FADE_MS,
        LOAD_CONNECTOR_STAGGER_MS,
        connectorBaseStart
      );
    const getCollectedConnectorLoadAlpha = (connectorIndex: number) =>
      getStaggeredLoadAlpha(
        elapsed,
        connectorIndex,
        LOAD_CONNECTOR_FADE_MS,
        LOAD_CONNECTOR_STAGGER_MS,
        collectedConnectorBaseStart
      );
    const isFocusActive =
      runtime.focusTarget !== null && !runtime.viewUnfocusing;
    const isDetailLayoutActive = runtime.detailPhase !== 'none';
    const otherContentAlpha = 1 - runtime.focusContentFade;
    // Nodes/lines grow beyond their base size the further the camera is
    // zoomed out below the default fit level, so they stay legible.
    const zoomGrowth = zoomOutGrowth(
      runtime.zoom,
      runtime.fitZoomLevel,
      ZOOM_OUT_GROWTH_POWER
    );

    // Branch isolation: straighten the viewer's own branch onto the main line
    // and fade everything else out, eased by `isolate` (0-1).
    const isolateRow = runtime.branchIsolateRow;
    const isolate = runtime.branchIsolate;
    const isolateActive = isolate > LOAD_ALPHA_SNAP && isolateRow !== null;
    const isIsolatedItem = (index: number) =>
      isolateRow !== null &&
      (deps.processedCollected[index]?.sources.some(
        (s) => s.rowIndex === isolateRow
      ) ??
        false);
    const isolateOtherAlpha = isolateActive ? 1 - isolate : 1;

    // The isolated branch's own colour, for its straightened line/nodes.
    let isolateColour = '#ffffff';
    if (isolateRow !== null) {
      for (const item of deps.processedCollected) {
        const src = item.sources.find((s) => s.rowIndex === isolateRow);
        if (src) {
          isolateColour = src.colour;
          break;
        }
      }
    }

    // Even-spacing X targets for the isolated branch: its items laid out at a
    // fixed step centred on their centroid, so the straightened branch reads
    // as evenly spaced regardless of the original (date-driven) gaps. The
    // active collection's not-yet-collected items are merged into this same
    // date-ordered sequence (as "collectible" slots), skipping any that the
    // viewer has already collected onto this branch. Sourced from
    // boundsCtx.getIsolatedMergedLine — the same layout view.ts uses to frame
    // and focus these items, so the two can never drift apart. Lazily
    // computed on first use, once per frame.
    const centerOnPreviewContentId =
      runtime.focusTarget === null
        ? deps.refs.centerOnPreviewIdRef.current
        : null;
    for (const key of [...previewExpandProgress.keys()]) {
      if (key === centerOnPreviewContentId) {
        continue;
      }
      const prev = previewExpandProgress.get(key) ?? 0;
      const next = prev + (0 - prev) * PREVIEW_EXPAND_LERP;
      if (next < HIGHLIGHT_FADE_SNAP) {
        previewExpandProgress.delete(key);
      } else {
        previewExpandProgress.set(key, next);
      }
    }
    let previewExpandAmount = 0;
    if (centerOnPreviewContentId) {
      const prev = previewExpandProgress.get(centerOnPreviewContentId) ?? 0;
      const next = prev + (1 - prev) * PREVIEW_EXPAND_LERP;
      previewExpandAmount = next > 1 - HIGHLIGHT_FADE_SNAP ? 1 : next;
      previewExpandProgress.set(centerOnPreviewContentId, previewExpandAmount);
    }

    let isolatedLine: ReturnType<BoundsContext['getIsolatedMergedLine']> = null;
    const getIsolatedLine = () => {
      if (isolatedLine === null && isolateRow !== null) {
        isolatedLine = boundsCtx.getIsolatedMergedLine(
          isolateRow,
          centerOnPreviewContentId,
          previewExpandAmount
        );
      }
      return isolatedLine;
    };
    let isolatedLineXReady = false;
    const ensureIsolatedLineX = () => {
      if (isolatedLineXReady) {
        return;
      }
      isolatedLineXReady = true;
      const line = getIsolatedLine();
      if (!line) {
        return;
      }
      for (const entry of line.entries) {
        if (entry.kind !== 'collected') {
          continue;
        }
        const targetX = (entry.rect.left + entry.rect.right) / 2;
        const prevX = isolatedLineX.get(entry.contentId);
        let easedX = targetX;
        if (prevX !== undefined) {
          easedX = prevX + (targetX - prevX) * BRANCH_DIM_LERP;
          if (Math.abs(targetX - easedX) < 0.5) {
            easedX = targetX;
          }
        }
        isolatedLineX.set(entry.contentId, easedX);
      }
    };
    const getIsolatedTargetCenterX = (index: number): number | null => {
      if (!isolateActive) {
        return null;
      }
      const found = getIsolatedLine()?.entries.find(
        (e) => e.kind === 'collected' && e.index === index
      );
      if (!found) {
        return null;
      }
      ensureIsolatedLineX();
      return (
        isolatedLineX.get(found.contentId) ??
        (found.rect.left + found.rect.right) / 2
      );
    };
    let previewSwitchAlpha = 1;
    if (runtime.previewFadeOutStartMs !== null) {
      const t = Math.min(
        1,
        (p.millis() - runtime.previewFadeOutStartMs) / PREVIEW_SWITCH_FADE_MS
      );
      previewSwitchAlpha = 1 - t;
    } else if (runtime.previewFadeInStartMs !== null) {
      const t = Math.min(
        1,
        (p.millis() - runtime.previewFadeInStartMs) / PREVIEW_SWITCH_FADE_MS
      );
      previewSwitchAlpha = t;
    }

    let collectProgress = 0;
    let collectHeld = false;
    if (runtime.collectStartMs !== null) {
      const collectElapsed = p.millis() - runtime.collectStartMs;
      const t = Math.min(1, collectElapsed / COLLECT_ANIM_MS);
      collectProgress = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
      collectHeld = collectElapsed >= COLLECT_ANIM_MS + COLLECT_HOLD_MS;
    }
    const isCollecting = runtime.collectStartMs !== null;

    const returnIndex = runtime.collectReturnIndex;
    let returnFade = 1;
    if (returnIndex !== -1) {
      if (runtime.collectReturnStartMs === null) {
        const imageReady =
          loadedCollectedImages[returnIndex] !== null ||
          !deps.processedCollected[returnIndex]?.imageUrl;
        if (
          imageReady ||
          p.millis() - runtime.collectReturnWaitStartMs >=
            COLLECT_RETURN_IMAGE_WAIT_MS
        ) {
          runtime.collectReturnStartMs = p.millis();
        }
      }
      if (runtime.collectReturnStartMs === null) {
        returnFade = 0;
      } else {
        const t = Math.min(
          1,
          (p.millis() - runtime.collectReturnStartMs) / COLLECT_RETURN_FADE_MS
        );
        returnFade = t * t * (3 - 2 * t);
        if (t >= 1) {
          runtime.collectReturnIndex = -1;
          runtime.collectReturnStartMs = null;
          runtime.collectContentId = null;
          runtime.collectFinalRect = null;
          view.animateToFitView();
        }
      }
    }
    const isReturnTarget = (index: number) =>
      returnIndex !== -1 && index === returnIndex;

    const collectFade = (1 - collectProgress) * returnFade;
    const isCollectTarget = (index: number) =>
      isCollecting && index === runtime.collectIndex;
    const moveToScreenCentre = <
      T extends Pick<
        ContentBounds,
        'left' | 'right' | 'top' | 'height' | 'centerY'
      >
    >(
      rect: T
    ): T => {
      const centreX = runtime.cameraX + p.width / (2 * runtime.zoom);
      const centreY = runtime.cameraY + p.height / (2 * runtime.zoom);
      const dx = (centreX - (rect.left + rect.right) / 2) * collectProgress;
      const dy = (centreY - (rect.top + rect.height / 2)) * collectProgress;
      return {
        ...rect,
        left: rect.left + dx,
        right: rect.right + dx,
        top: rect.top + dy,
        centerY: rect.centerY + dy,
      };
    };

    if (isCollecting && collectHeld && !runtime.collectReported) {
      runtime.collectReported = true;
      const collected = deps.processedPreview[runtime.collectIndex];
      const entry = getIsolatedLine()?.entries.find(
        (e) => e.kind === 'preview' && e.index === runtime.collectIndex
      );
      if (collected && entry) {
        const finalRect = moveToScreenCentre(entry.rect);
        runtime.collectContentId = collected.contentId;
        runtime.collectFinalRect = {
          left: (finalRect.left - runtime.cameraX) * runtime.zoom,
          top: (finalRect.top - runtime.cameraY) * runtime.zoom,
          width: finalRect.width * runtime.zoom,
          height: finalRect.height * runtime.zoom,
        };
        deps.refs.onPreviewCollectRef.current?.(collected.contentId);
      }
    }

    const contentAlphaFor = (
      lane: 'main' | 'collected',
      index: number,
      base = 1
    ) => {
      let alpha = base;
      // Viewing an item fades every other item away, leaving it alone on
      // screen. Isolating the viewer's own branch, though, fades everything that isn't
      // part of it away: the main timeline's own items and every other
      // collector's items, leaving just the isolated branch straightened out.
      if (isolateActive && (lane === 'main' || !isIsolatedItem(index))) {
        alpha *= 1 - isolate;
      }
      const focus = runtime.focusTarget;
      if (focus && !(focus.lane === lane && focus.index === index)) {
        alpha *= otherContentAlpha;
      }
      if (lane === 'collected' && isReturnTarget(index)) {
        return alpha;
      }
      return alpha * collectFade;
    };

    // While isolating, a collected item in the branch eases from its normal
    // position onto the main line (its straightened position).
    const getDetailDrawBoundsIso = (
      lane: 'main' | 'collected' | 'preview',
      index: number,
      itemBounds: ContentBounds
    ): ContentBounds => {
      const base = getDetailDrawBounds(lane, index, itemBounds);
      if (isolateActive && lane === 'collected' && isIsolatedItem(index)) {
        const straightTop = MAIN_LINE_Y - base.height / 2;
        // Ease X toward the even-spacing target as well as Y onto the main
        // line, so the straightened branch is evenly spaced.
        const targetCX = getIsolatedTargetCenterX(index);
        const baseCX = (base.left + base.right) / 2;
        const dx = targetCX !== null ? (targetCX - baseCX) * isolate : 0;
        return {
          ...base,
          left: base.left + dx,
          right: base.right + dx,
          top: base.top + (straightTop - base.top) * isolate,
          centerY: base.centerY + (MAIN_LINE_Y - base.centerY) * isolate,
        };
      }
      return base;
    };

    if (deps.backgroundColour) {
      p.background(deps.backgroundColour);
    } else {
      p.clear();
    }
    p.push();
    p.scale(runtime.zoom);
    p.translate(-runtime.cameraX, -runtime.cameraY);

    const bounds = boundsCtx.getAllBounds();
    const collectedBounds = boundsCtx.getCollectedBounds();
    const lineWorldX = boundsCtx.getNowWorldX();
    const mouseWorld = screenToWorld(
      p.mouseX,
      p.mouseY,
      runtime.cameraX,
      runtime.cameraY,
      runtime.zoom
    );

    // Hover effects are suppressed while focused or isolating.
    const hoverSuppressed =
      isFocusActive || isolateActive || returnIndex !== -1;
    const mainHover = computeMainLaneHover(
      deps,
      bounds,
      mouseWorld,
      hoverSuppressed
    );

    // Dismiss the mini player only when the pointer *crosses into* the video's
    // timeline slot from outside — not because it is still sitting over the
    // item after zooming in/out.
    const activeVideoSlug = deps.refs.activeVideoSlugRef.current;
    let insideActiveVideoSlot = false;
    if (activeVideoSlug) {
      const hitSlot = (b: ContentBounds | undefined) =>
        Boolean(
          b &&
            mouseWorld.x >= b.left &&
            mouseWorld.x <= b.right &&
            mouseWorld.y >= b.top &&
            mouseWorld.y <= b.top + b.height
        );
      const activeMainIdx = deps.processed.findIndex(
        (item) => item.slug === activeVideoSlug
      );
      const activeCollectedIdx = deps.processedCollected.findIndex(
        (item) => item.slug === activeVideoSlug
      );
      insideActiveVideoSlot =
        hitSlot(bounds[activeMainIdx]) ||
        hitSlot(collectedBounds[activeCollectedIdx]);
    }
    const canDismissVideo =
      Boolean(activeVideoSlug) &&
      !isFocusActive &&
      !runtime.viewUnfocusing &&
      !runtime.viewAnimating;
    if (
      canDismissVideo &&
      insideActiveVideoSlot &&
      !pointerInsideActiveVideoSlot
    ) {
      deps.refs.onDismissVideoRef.current?.();
    }
    pointerInsideActiveVideoSlot = insideActiveVideoSlot;

    // Rebuilt each frame and shared with the input handler for click-to-focus.
    const nodeRegions: NodeHoverRegion[] = [];
    runtime.nodeRegions = nodeRegions;

    // Date labels are collected during the item pass and drawn last so they sit
    // above the connectors and nodes.
    const dateLabels: DateLabel[] = [];
    // Where each label ended up this frame (world), for tags to keep off.
    const drawnLabelRects: LabelRect[] = [];
    const drawnLines: ConnectorPoint[][] = [];

    // Spring the focused item's branch nodes out to the viewport edges, and
    // back onto the item once it's unfocused. Only their vertical movement
    // springs; horizontally they ease with no overshoot. Coming back they land
    // without overshooting, so the lines don't bounce into the item.
    const edgeTarget =
      isFocusActive && runtime.focusTarget?.lane !== 'preview'
        ? runtime.focusTarget
        : null;
    if (edgeTarget) {
      runtime.edgeNodesTarget = edgeTarget;
    }
    const edgeGoal = edgeTarget ? 1 : 0;
    runtime.edgeNodesVelocity =
      (runtime.edgeNodesVelocity +
        (edgeGoal - runtime.edgeNodes) * EDGE_NODE_SPRING_STIFFNESS) *
      EDGE_NODE_SPRING_DAMPING;
    runtime.edgeNodes += runtime.edgeNodesVelocity;
    runtime.edgeNodesX += (edgeGoal - runtime.edgeNodesX) * EDGE_NODE_X_LERP;
    const edgeSettled =
      Math.abs(edgeGoal - runtime.edgeNodes) < HIGHLIGHT_FADE_SNAP &&
      Math.abs(runtime.edgeNodesVelocity) < HIGHLIGHT_FADE_SNAP;
    if (!edgeTarget && (runtime.edgeNodes <= 0 || edgeSettled)) {
      runtime.edgeNodes = 0;
      runtime.edgeNodesVelocity = 0;
      runtime.edgeNodesX = 0;
      runtime.edgeNodesTarget = edgeTarget;
    } else if (edgeTarget && edgeSettled) {
      runtime.edgeNodes = 1;
      runtime.edgeNodesVelocity = 0;
    }
    if (Math.abs(edgeGoal - runtime.edgeNodesX) < HIGHLIGHT_FADE_SNAP) {
      runtime.edgeNodesX = edgeGoal;
    }
    const edgeNodes = buildEdgeNodeLayout(
      p,
      deps,
      boundsCtx,
      bounds,
      collectedBounds
    );

    const drawCtx: MainLaneDrawContext = {
      bounds,
      lineWorldX,
      nodeRegions,
      mouseWorld,
      highlightedType,
      typeHighlightStrength,
      isTypeHighlightActive,
      highlightedMainContentId,
      dimAlpha,
      otherContentAlpha,
      isFocusActive,
      isDetailLayoutActive,
      getImageLoadAlpha,
      getMainConnectorLoadAlpha,
      getCollectedConnectorLoadAlpha,
      isFocusedTarget,
      getDetailDrawBounds: getDetailDrawBoundsIso,
      contentAlphaFor,
      isolateOtherAlpha: isolateOtherAlpha * collectFade,
      edgeNodes,
      dateLabels,
      drawnLines,
      // Grey only the main connectors the active branch detours below; the rest
      // of the main line (before, after, and skipped gaps) stays lit.
      mainConnectorTravelAlpha: (connectorIndex: number) => {
        const row = runtime.branchDimRow;
        if (row === null || runtime.branchDimStrength <= 0) {
          return 1;
        }
        if (
          !boundsCtx.getBranchDetouredGaps(row).has(connectorIndex) ||
          boundsCtx.getBranchMainTravel(row).has(connectorIndex)
        ) {
          return 1;
        }
        return 1 - runtime.branchDimStrength * (1 - MAIN_CONNECTOR_DIM_ALPHA);
      },
      // A hovered main line thickens to double width, easing with its tag, and
      // so does any stretch a hovered branch's timeline runs along.
      mainConnectorGrow: (connectorIndex: number) => {
        const mainGrow = runtime.lineBlobs.get('main')?.scale ?? 0;
        const row = runtime.branchDimRow;
        const branchGrow =
          row !== null && boundsCtx.getBranchMainTravel(row).has(connectorIndex)
            ? runtime.lineBlobs.get(`row:${row}`)?.scale ?? 0
            : 0;
        return Math.max(mainGrow, branchGrow);
      },
      // Main items off the hovered (or zoomed-into) branch's timeline fade,
      // eased in step with the branch grey-out.
      mainItemBranchDim: (index: number) => {
        const row = runtime.branchDimRow;
        if (row === null || runtime.branchDimStrength <= 0) {
          return 0;
        }
        return boundsCtx
          .getBranchMainItems(row, bounds, collectedBounds)
          .has(index)
          ? 0
          : runtime.branchDimStrength;
      },
      // Where the active branch's timeline runs along the main line between
      // its branches, that stretch takes on the branch's colour.
      mainConnectorColour: (connectorIndex: number) => {
        const row = runtime.branchDimRow;
        if (
          row === null ||
          runtime.branchDimStrength <= 0 ||
          !boundsCtx.getBranchMainTravel(row).has(connectorIndex)
        ) {
          return MAIN_LINE_COLOUR;
        }
        const branchColour = deps.processedCollected
          .flatMap((item) => item.sources)
          .find((source) => source.rowIndex === row)?.colour;
        return branchColour
          ? mixHex(MAIN_LINE_COLOUR, branchColour, runtime.branchDimStrength)
          : MAIN_LINE_COLOUR;
      },
    };

    // Reset the active gallery index whenever the focused item changes.
    gallery.syncFocus(
      runtime.focusTarget
        ? `${runtime.focusTarget.lane}:${runtime.focusTarget.index}`
        : null
    );
    // Advance the strip's slide animation.
    gallery.animate();

    // Cleared each frame; focused items re-set them while drawing.
    deps.audio.setButtonRegion(null);
    gallery.setNavRegions([]);

    if (runtime.focusTarget && runtime.detailLayout > 0) {
      const { lane, index } = runtime.focusTarget;
      // Use the straightened bounds while isolating, so the reported rect
      // matches where the item is actually drawn (on the main line). A
      // collectible item only ever has a position via the isolated line —
      // it isn't in bounds/collectedBounds at all.
      const itemBounds =
        lane === 'main'
          ? bounds[index]
          : lane === 'preview'
          ? getIsolatedLine()?.entries.find(
              (entry) => entry.kind === 'preview' && entry.index === index
            )?.rect ?? collectedBounds[index]
          : collectedBounds[index];
      const isoBounds = getDetailDrawBoundsIso(lane, index, itemBounds);
      const laneBounds =
        lane === 'preview' && isCollectTarget(index)
          ? moveToScreenCentre(isoBounds)
          : isoBounds;
      // The focused image stays at its world bounds; report its on-screen
      // rect so the detail text can be placed around it.
      deps.refs.onDetailImageRectRef.current?.({
        left: (laneBounds.left - runtime.cameraX) * runtime.zoom,
        top: (laneBounds.top - runtime.cameraY) * runtime.zoom,
        width: laneBounds.width * runtime.zoom,
        height: laneBounds.height * runtime.zoom,
      });
    }

    // While isolating, only the isolated branch's own items stay at full
    // brightness — every other collector's items are faded, so they're
    // excluded from hover here too.
    const isCollectedItemHoverable = (index: number) =>
      !isolateActive || isIsolatedItem(index);
    const collectedHover = computeCollectedLaneHover(
      deps,
      boundsCtx,
      collectedBounds,
      bounds,
      mouseWorld,
      hoverSuppressed,
      isCollectedItemHoverable
    );

    // A main line and a branch line both in reach: the nearer one takes it.
    if (
      mainHover.mainConnectorHover &&
      collectedHover.hoveredUserRow !== null
    ) {
      if (
        mainHover.mainConnectorDistance < collectedHover.hoveredLineDistance
      ) {
        collectedHover.hoveredCollected = -1;
        collectedHover.hoveredUserRow = null;
        collectedHover.hoveredLineDistance = Infinity;
      } else {
        mainHover.mainConnectorHover = false;
        mainHover.mainConnectorDistance = Infinity;
        mainHover.mainHighlighted = mainHover.hoveredMain !== -1;
      }
    }

    // Hovering the user card behaves like hovering the viewer's own branch on
    // the canvas: only when nothing else on the canvas is already hovered.
    if (
      deps.refs.hoverOwnBranchRef.current === true &&
      ownBranchRow >= 0 &&
      !isFocusActive &&
      !isolateActive &&
      runtime.focusedBranchRow === null &&
      collectedHover.hoveredCollected === -1 &&
      collectedHover.hoveredUserRow === null
    ) {
      collectedHover.hoveredUserRow = ownBranchRow;
    }

    // Ease the branch grey-out: 1 while a branch is hovered — or zoomed into
    // via a click — back to 0 on leave, keeping the active row's colour until
    // the fade finishes. A clicked (focused) branch takes precedence and holds
    // the grey-out while zoomed in; the travelling strip follows the same row.
    const branchHovered =
      collectedHover.hoveredUserRow !== null &&
      !collectedHover.hoveredCollectedIsImage;
    const activeBranchRow =
      runtime.focusedBranchRow !== null
        ? runtime.focusedBranchRow
        : branchHovered
        ? collectedHover.hoveredUserRow
        : null;
    if (activeBranchRow !== null) {
      runtime.branchDimRow = activeBranchRow;
    }
    runtime.branchDimStrength +=
      ((activeBranchRow !== null ? 1 : 0) - runtime.branchDimStrength) *
      BRANCH_DIM_LERP;
    if (runtime.branchDimStrength < HIGHLIGHT_FADE_SNAP) {
      runtime.branchDimStrength = 0;
      runtime.branchDimRow = null;
    } else if (runtime.branchDimStrength > 1 - HIGHLIGHT_FADE_SNAP) {
      runtime.branchDimStrength = 1;
    }

    // Ease the branch-isolation progress in/out, releasing the row (and the
    // interaction lock) only once the fade-out has completed.
    runtime.branchIsolate +=
      ((runtime.branchIsolateActive ? 1 : 0) - runtime.branchIsolate) *
      BRANCH_DIM_LERP;
    if (runtime.branchIsolate < HIGHLIGHT_FADE_SNAP) {
      runtime.branchIsolate = 0;
      if (!runtime.branchIsolateActive && runtime.branchIsolateRow !== null) {
        runtime.branchIsolateRow = null;
        syncInteractionLock(deps);
      }
    } else if (runtime.branchIsolate > 1 - HIGHLIGHT_FADE_SNAP) {
      runtime.branchIsolate = 1;
    }

    // Connectors render beneath the images, whose soft white halo fades each
    // line out where it meets an item.
    drawMainLaneConnectors(p, deps, drawCtx, mainHover);
    drawCollectedLaneConnectors(
      p,
      deps,
      boundsCtx,
      collectedBounds,
      bounds,
      drawCtx,
      collectedHover
    );

    // While a line is hovered (outside of viewing an item), its timeline's
    // owner's name tag rides it: easing along the timeline's path after the
    // cursor, growing in and out as the hover starts and ends. Each timeline
    // keeps its own tag, so one never slides across to another. The tags are
    // drawn on screen after the map (see below), above everything.
    // A timeline's drawn lines, in order along it.
    const timelineLines = (key: string): ConnectorPoint[][] => {
      if (key === 'main') {
        return bounds
          .slice(0, -1)
          .map((b, index) =>
            getMainConnectorPoints(
              { x: b.right, y: b.centerY },
              { x: bounds[index + 1].left, y: bounds[index + 1].centerY }
            )
          );
      }
      const row = Number(key.slice('row:'.length));
      return deps.processedCollected
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => item.sources.some((s) => s.rowIndex === row))
        .sort((a, b) => a.item.anchorTime - b.item.anchorTime)
        .flatMap(({ item, index }) =>
          boundsCtx
            .getSourceBranchSegments(
              index,
              item.sources.findIndex((s) => s.rowIndex === row),
              bounds,
              collectedBounds
            )
            .map((segment) => getBranchRoute(segment.from, segment.to, segment))
        );
    };
    // The whole timeline as one path (its lines joined end to end), for a tag
    // to travel along.
    const timelinePath = (key: string) => timelineLines(key).flat();
    const updateLineTags = () => {
      let hoveredKey: string | null = null;
      let colour = MAIN_LINE_COLOUR;
      let name = MAIN_USERNAME;
      if (!isFocusActive) {
        const row = collectedHover.hoveredUserRow;
        if (row !== null && !collectedHover.hoveredCollectedIsImage) {
          hoveredKey = `row:${row}`;
          const source = deps.processedCollected
            .flatMap((item) => item.sources)
            .find((s) => s.rowIndex === row);
          colour = source?.colour ?? colour;
          name = source?.username ?? name;
        } else if (mainHover.mainConnectorHover) {
          hoveredKey = 'main';
        }
      }
      if (hoveredKey) {
        const path = timelinePath(hoveredKey);
        if (path.length >= 2) {
          const target = nearestArcLength(path, mouseWorld);
          const blob = runtime.lineBlobs.get(hoveredKey);
          if (!blob || blob.scale <= LOAD_ALPHA_SNAP) {
            // Appearing: start right where the cursor meets the line.
            runtime.lineBlobs.set(hoveredKey, {
              distance: target,
              scale: blob?.scale ?? 0,
              colour,
              name,
              x: 0,
              y: 0,
              side: blob?.side ?? 1,
            });
          } else {
            blob.distance += (target - blob.distance) * LINE_BLOB_FOLLOW_LERP;
            blob.colour = colour;
            blob.name = name;
          }
        }
      }
      runtime.lineBlobs.forEach((blob, key) => {
        blob.scale +=
          ((key === hoveredKey ? 1 : 0) - blob.scale) * NODE_GROW_LERP;
        if (key !== hoveredKey && blob.scale <= LOAD_ALPHA_SNAP) {
          runtime.lineBlobs.delete(key);
          return;
        }
        const path = timelinePath(key);
        if (path.length >= 2) {
          const at = pointAtArcLength(path, blob.distance);
          blob.x = at.x;
          blob.y = at.y;
        }
      });
    };
    updateLineTags();

    drawMainLaneItems(p, deps, loadedImages, drawCtx, mainHover, gallery);

    drawCollectedLaneItems(
      p,
      deps,
      loadedCollectedImages,
      collectedBounds,
      drawCtx,
      collectedHover,
      gallery
    );

    drawMainLaneConnectorDots(p, deps, drawCtx);
    drawCollectedLaneConnectorDots(
      p,
      deps,
      boundsCtx,
      collectedBounds,
      bounds,
      drawCtx,
      collectedHover
    );
    drawMainTimelineGlow(p, deps, boundsCtx, bounds, collectedBounds);

    // Straight connectors joining the isolated branch's items — and the
    // active collection's not-yet-collected items, merged in by date — into
    // one line.
    if (isolateActive && isolateRow !== null) {
      const isolatedOrdered = (getIsolatedLine()?.entries ?? [])
        .map((entry) => {
          if (entry.kind === 'collected') {
            return {
              kind: entry.kind,
              index: entry.index,
              rect: getDetailDrawBoundsIso(
                'collected',
                entry.index,
                collectedBounds[entry.index]
              ),
            };
          }
          return {
            kind: entry.kind,
            index: entry.index,
            rect: isCollectTarget(entry.index)
              ? moveToScreenCentre(entry.rect)
              : entry.rect,
          };
        })
        .sort((a, b) => a.rect.left - b.rect.left);

      // Publish the straightened rects (collected and collectible alike) so a
      // click can hit-test where they actually appear (on the main line)
      // rather than their branch positions.
      runtime.isolatedRegions = isolatedOrdered.map(
        ({ kind, index, rect }) => ({
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.top + rect.height,
          index,
          lane: kind,
        })
      );

      // The collectible items have no prior on-screen position to ease from
      // (they only exist while isolating), so they simply fade in at their
      // straightened slot, tracking the isolate progress. Whichever one is
      // selected/hovered in the caller's own item list (highlightedPreviewIdRef)
      // draws at full colour with a subtle glow in the viewer's colour; every
      // other collectible is greyed out — the opposite of a hover highlight.
      // Hovering one here reports it back the other way via onPreviewHoverRef,
      // so the caller's list can mirror the highlight.
      const previewCtx = p.drawingContext as CanvasRenderingContext2D;
      const collectionPanelRect = document
        .querySelector('.collection-card-panel--visible')
        ?.getBoundingClientRect();
      const pointerOverCollectionPanel =
        !!collectionPanelRect &&
        p.mouseX >= collectionPanelRect.left &&
        p.mouseX <= collectionPanelRect.right &&
        p.mouseY >= collectionPanelRect.top &&
        p.mouseY <= collectionPanelRect.bottom;
      let hoveredPreviewContentId: string | null = null;
      for (const entry of isolatedOrdered) {
        if (entry.kind !== 'preview') {
          continue;
        }
        const item = deps.processedPreview[entry.index];
        const img = loadedPreviewImages[entry.index];
        const { rect } = entry;

        if (
          !isCollecting &&
          !pointerOverCollectionPanel &&
          mouseWorld.x >= rect.left &&
          mouseWorld.x <= rect.right &&
          mouseWorld.y >= rect.top &&
          mouseWorld.y <= rect.top + rect.height
        ) {
          hoveredPreviewContentId = item.contentId;
        }

        const isFocusedPreview = isFocusedTarget('preview', entry.index);
        const isHighlighted =
          isFocusedPreview ||
          item.contentId === deps.refs.highlightedPreviewIdRef.current;
        const targetProgress = isHighlighted ? 1 : 0;
        const prevProgress = previewHighlightProgress.get(item.contentId) ?? 0;
        let progress =
          prevProgress + (targetProgress - prevProgress) * BRANCH_DIM_LERP;
        if (Math.abs(targetProgress - progress) < HIGHLIGHT_FADE_SNAP) {
          progress = targetProgress;
        }
        previewHighlightProgress.set(item.contentId, progress);

        const previewAlpha =
          isolate *
          previewSwitchAlpha *
          (isCollectTarget(entry.index) ? 1 : collectFade);
        previewCtx.globalAlpha = previewAlpha;
        const greyness = 1 - progress;
        if (greyness > 0) {
          previewCtx.filter = `grayscale(${greyness * 80}%) brightness(${
            1 - greyness * 0.25
          })`;
        }
        if (progress > 0) {
          previewCtx.shadowColor = hexToRgba(
            deps.previewColour,
            0.45 * previewAlpha * progress
          );
          previewCtx.shadowBlur = 12 * zoomGrowth * progress;
        }
        if (img) {
          p.image(img, rect.left, rect.top, rect.width, rect.height);
        } else {
          p.noStroke();
          p.fill(40);
          p.rect(rect.left, rect.top, rect.width, rect.height);
          p.fill(255);
          p.textAlign(p.CENTER, p.CENTER);
          p.text(
            item.title,
            rect.left + rect.width / 2,
            rect.top + rect.height / 2
          );
        }
        previewCtx.filter = 'none';
        previewCtx.shadowBlur = 0;

        // White border on every collectible except the focused one, matching
        // the main/collected lanes' own convention.
        if (!(isFocusActive && isFocusedPreview)) {
          p.noFill();
          p.stroke(255);
          p.strokeWeight(2);
          p.rect(rect.left, rect.top, rect.width, rect.height);
        }
        resetCanvasEffects(previewCtx);

        const isTitleShown = item.contentId === centerOnPreviewContentId;
        const titleAlpha = isTitleShown
          ? previewExpandAmount * isolate * previewSwitchAlpha
          : 0;
        const hideDateLabel =
          isFocusedPreview && isDetailLayoutActive && runtime.detailLayout > 0;

        // Deferred so the date renders above the connectors/nodes, matching
        // every other item's date label.
        const hasIcon =
          !hideDateLabel &&
          pushItemDateLabels(dateLabels, {
            left: rect.left,
            right: rect.right,
            y: rect.top - 12,
            text: formatDateForZoom(
              item.anchorTime,
              runtime.zoom,
              runtime.fitZoomLevel
            ),
            alpha: isolate * previewSwitchAlpha,
            contentType: item.contentType,
          });

        if (titleAlpha > HIGHLIGHT_FADE_SNAP) {
          dateLabels.push({
            x:
              rect.left +
              (hasIcon
                ? (PREVIEW_ICON_SIZE + PREVIEW_ICON_GAP) / runtime.zoom
                : 0),
            y: rect.top - 12,
            text: item.title,
            colour: '#ffffff',
            alpha: titleAlpha,
            align: 'left',
            variant: 'title',
          });
        }
      }

      if (hoveredPreviewContentId !== lastHoveredPreviewId) {
        lastHoveredPreviewId = hoveredPreviewContentId;
        deps.refs.onPreviewHoverRef.current?.(hoveredPreviewContentId);
      }

      const ctx2 = p.drawingContext as CanvasRenderingContext2D;
      const isolateWeight = connectorWeight(runtime.zoom, runtime.fitZoomLevel);
      for (let k = 0; k < isolatedOrdered.length - 1; k++) {
        const a = isolatedOrdered[k];
        const b = isolatedOrdered[k + 1];
        // Dotted wherever the segment touches a collectible (not-yet-
        // collected) item, so those links read differently from the solid
        // lines between items actually on the branch.
        const dotted = a.kind === 'preview' || b.kind === 'preview';
        ctx2.globalAlpha =
          (dotted ? isolate * previewSwitchAlpha : isolate) * collectFade;
        ctx2.setLineDash(dotted ? [0.1, zoomGrowth * 6] : []);
        ctx2.lineCap = dotted ? 'round' : 'butt';
        const lineFrom = { x: a.rect.right, y: a.rect.centerY };
        const lineTo = { x: b.rect.left, y: b.rect.centerY };
        // Routed at 0/45/90° like every other connector.
        const points = getMainConnectorPoints(lineFrom, lineTo);
        if (dotted) {
          p.stroke(isolateColour);
          p.strokeWeight(isolateWeight);
          p.noFill();
          p.beginShape();
          points.forEach((point) => p.vertex(point.x, point.y));
          p.endShape();
        } else {
          drawBranchConnector(p, points, isolateColour, isolateWeight);
        }
      }
      ctx2.setLineDash([]);
      ctx2.lineCap = 'butt';
      resetCanvasEffects(ctx2);
    } else {
      if (runtime.isolatedRegions.length > 0) {
        runtime.isolatedRegions = [];
      }
      if (lastHoveredPreviewId !== null) {
        lastHoveredPreviewId = null;
        deps.refs.onPreviewHoverRef.current?.(null);
      }
    }

    // Date labels drawn last (still inside the world transform) so they sit
    // above the connectors and nodes. Divide by zoom so the world-space size
    // (which the transform's scale multiplies back out) reads as a constant
    // screen-space size regardless of zoom level — except it shrinks slightly
    // past DATE_SHRINK_ZOOM_FACTOR, easing the crowded, overlapping labels
    // down a touch at extreme zoom-out.
    if (dateLabels.length > 0) {
      const dateMergeProgress = zoomMergeProgress(
        runtime.zoom,
        runtime.fitZoomLevel,
        DATE_SHRINK_ZOOM_FACTOR,
        DATE_SHRINK_TRANSITION_FACTOR
      );
      const dateFontScale = 1 - dateMergeProgress * DATE_FONT_MERGE_SHRINK;
      // `letterSpacing` is newer than this TypeScript's DOM types.
      const dateCtx = p.drawingContext as CanvasRenderingContext2D & {
        letterSpacing: string;
      };
      // Every item, for labels to steer clear of.
      const itemRects = [...bounds, ...collectedBounds].map((b) => ({
        left: b.left,
        right: b.right,
        top: b.top,
        bottom: b.top + b.height,
      }));
      const canvasFont = p.textFont();
      p.noStroke();
      for (const label of dateLabels) {
        dateCtx.globalAlpha = label.alpha * collectFade;
        if (label.icon) {
          const iconSize = PREVIEW_ICON_SIZE / runtime.zoom;
          dateCtx.drawImage(
            label.icon,
            label.x,
            label.y - iconSize - PREVIEW_ICON_LIFT / runtime.zoom,
            iconSize,
            iconSize
          );
          continue;
        }
        p.fill(label.colour);
        // Dates get a soft white glow so they lift off the lines behind them;
        // outlined labels mask them instead.
        if (label.variant === 'title' || label.outlined) {
          dateCtx.shadowBlur = 0;
        } else {
          dateCtx.shadowBlur = DATE_LABEL_SHADOW_BLUR_PX * p.pixelDensity();
          dateCtx.shadowColor = 'rgba(255, 255, 255, 0.9)';
        }
        const horizontalAlign =
          label.align === 'right'
            ? p.RIGHT
            : label.align === 'left'
            ? p.LEFT
            : p.CENTER;
        p.textFont(label.font ?? canvasFont);
        p.textSize(
          (label.variant === 'title'
            ? DATE_FONT_SIZE * 1.15
            : DATE_FONT_SIZE * dateFontScale * (label.scale ?? 1)) /
            runtime.zoom
        );
        if (label.variant === 'title') {
          p.textStyle(p.BOLD);
        }
        // Set before any measuring, so wrapping and placement allow for it.
        dateCtx.letterSpacing = `${
          (label.letterSpacing ?? 0) * p.textSize()
        }px`;
        // A label with a max width wraps onto as many lines as it needs,
        // stacking away from its anchor (down for one hung below, else up) so
        // its first or last line sits where a single line would.
        // Lines after the text (an item's date, then who collected it) go
        // last, unwrapped, drawn fainter.
        const joinRuns = (runs: { text: string }[]) =>
          runs.map((run) => run.text).join('');
        // The text's own lines can use their own font (`textFont`, e.g. a
        // medium weight for item titles); the lines after it never do. Set
        // before measuring any line, so widths allow for it.
        const bodyFont = label.font ?? canvasFont;
        const styleLine = (isText: boolean) => {
          p.textFont(isText && label.textFont ? label.textFont : bodyFont);
        };
        const widthOf = (line: string, isText: boolean) => {
          styleLine(isText);
          return p.textWidth(line);
        };
        styleLine(false);
        const collectedRuns = label.collectedBy
          ? collectedByParts(label.collectedBy)
          : undefined;
        // Too wide for the label, the "owned by" line breaks between its runs
        // (before the collector's name, before "and N others") as needed.
        const collectedLines: {
          text: string;
          colour?: string;
          alpha?: number;
        }[][] = [];
        collectedRuns?.forEach((run) => {
          const current = collectedLines[collectedLines.length - 1];
          if (
            current &&
            (label.maxWidth === undefined ||
              p.textWidth(joinRuns([...current, run]).trimEnd()) <=
                label.maxWidth)
          ) {
            current.push(run);
          } else {
            collectedLines.push([
              current ? { ...run, text: run.text.trimStart() } : run,
            ]);
          }
        });
        const extras = [
          label.secondary,
          ...collectedLines.map(joinRuns),
        ].filter((line): line is string => line !== undefined);
        const withSecondary = (main: string[]) => [...main, ...extras];
        styleLine(true);
        let lines = withSecondary(
          label.maxWidth === undefined
            ? [label.text]
            : wrapText(p, label.text, label.maxWidth)
        );
        const isTextLine = (k: number) => k < lines.length - extras.length;
        const leading = p.textSize() * (label.lineHeight ?? 1.2);
        // Extra space above the first of those lines, setting them apart from
        // the text.
        const secondaryGap =
          extras.length === 0 ? 0 : p.textSize() * SECONDARY_LABEL_GAP;
        const blockHeight = (count: number) => count * leading + secondaryGap;
        let { x, y } = label;
        let below = label.below ?? false;
        let hAlign = horizontalAlign;
        // An item's label goes under it, unless the spot beside it on the
        // right (lined up with its bottom edge) sits on fewer lines and items.
        if (label.anchor) {
          const { anchor } = label;
          const gap = 12;
          const pad = 4 / runtime.zoom;
          const underWidth = Math.max(
            ...lines.map((line, k) => widthOf(line, isTextLine(k)))
          );
          const underX = (anchor.left + anchor.right) / 2;
          const underTop = anchor.bottom + gap;
          const under = {
            left: underX - underWidth / 2 - pad,
            right: underX + underWidth / 2 + pad,
            top: underTop - pad,
            bottom: underTop + blockHeight(lines.length) + pad,
          };
          const sideLines = withSecondary([label.text]);
          const sideWidth = Math.max(
            ...sideLines.map((line, k) => widthOf(line, k === 0))
          );
          const sideHeight = blockHeight(sideLines.length);
          const underHeight = blockHeight(lines.length);
          const aboveBottom = anchor.top - gap;
          // The spots a label can take, in order of preference: under the
          // item, then beside it (lined up with its bottom edge) on the right
          // or left, then above it.
          const spots = [
            {
              rect: under,
              lines,
              x: underX,
              y: underTop,
              below: true,
              hAlign: p.CENTER,
            },
            {
              rect: {
                left: anchor.right + gap - pad,
                right: anchor.right + gap + sideWidth + pad,
                top: anchor.bottom - sideHeight - pad,
                bottom: anchor.bottom + pad,
              },
              lines: sideLines,
              x: anchor.right + gap,
              y: anchor.bottom,
              below: false,
              hAlign: p.LEFT,
            },
            {
              rect: {
                left: anchor.left - gap - sideWidth - pad,
                right: anchor.left - gap + pad,
                top: anchor.bottom - sideHeight - pad,
                bottom: anchor.bottom + pad,
              },
              lines: sideLines,
              x: anchor.left - gap,
              y: anchor.bottom,
              below: false,
              hAlign: p.RIGHT,
            },
            {
              rect: {
                left: underX - underWidth / 2 - pad,
                right: underX + underWidth / 2 + pad,
                top: aboveBottom - underHeight - pad,
                bottom: aboveBottom + pad,
              },
              lines,
              x: underX,
              y: aboveBottom,
              below: false,
              hAlign: p.CENTER,
            },
          ];
          // Another label in the way counts far worse than any line or item,
          // so labels never overlap while a free spot exists. Judged on the
          // map alone (never on where the screen is), so a label doesn't jump
          // as the view is dragged around.
          const score = (rect: LabelRect) =>
            drawnLabelRects.filter(
              (other) =>
                other.left < rect.right &&
                other.right > rect.left &&
                other.top < rect.bottom &&
                other.bottom > rect.top
            ).length *
              1000 +
            countLabelClashes(rect, drawnLines, itemRects);
          const best = spots.reduce(
            (chosen, spot) => {
              const spotScore = score(spot.rect);
              return chosen.score === 0 || spotScore >= chosen.score
                ? chosen
                : { spot, score: spotScore };
            },
            { spot: spots[0], score: score(spots[0].rect) }
          ).spot;
          lines = best.lines;
          x = best.x;
          y = best.y;
          below = best.below;
          hAlign = best.hAlign;
        }
        p.textAlign(hAlign, below ? p.TOP : p.BOTTOM);
        const last = lines.length - 1;
        const firstExtra = lines.length - extras.length;
        const lineY = (k: number) =>
          below
            ? y + k * leading + (k >= firstExtra ? secondaryGap : 0)
            : y - (last - k) * leading - (k < firstExtra ? secondaryGap : 0);
        const baseAlpha = dateCtx.globalAlpha;
        // The date (the first line after the text) is as strong as the text;
        // the "owned by" lines after it are fainter.
        const dateLine = label.secondary !== undefined ? firstExtra : -1;
        const lineAlpha = (k: number) =>
          k >= firstExtra && k !== dateLine
            ? baseAlpha * SECONDARY_LABEL_ALPHA
            : baseAlpha;
        {
          const textWidth = Math.max(
            ...lines.map((line, k) => widthOf(line, k < firstExtra))
          );
          const textHeight = blockHeight(lines.length);
          const left =
            hAlign === p.CENTER
              ? x - textWidth / 2
              : hAlign === p.RIGHT
              ? x - textWidth
              : x;
          const top = below ? y : y - textHeight;
          drawnLabelRects.push({
            left,
            right: left + textWidth,
            top,
            bottom: top + textHeight,
          });
        }
        if (label.outlined) {
          // An outline in the page background's colour where the label sits
          // on screen, drawn under the text so it masks the lines behind it
          // without eating into the letters.
          const screenY = Math.min(
            1,
            Math.max(0, ((y - runtime.cameraY) * runtime.zoom) / p.height)
          );
          p.noFill();
          p.stroke(
            mixHex(PAGE_BACKGROUND_TOP, PAGE_BACKGROUND_BOTTOM, screenY)
          );
          p.strokeWeight((LABEL_OUTLINE_PX * 2) / runtime.zoom);
          p.strokeJoin(p.ROUND);
          lines.forEach((line, k) => p.text(line, x, lineY(k)));
          p.noStroke();
          p.fill(label.colour);
        }
        lines.forEach((line, k) => {
          dateCtx.globalAlpha = lineAlpha(k);
          styleLine(k < firstExtra);
          const runs =
            collectedLines[k - (lines.length - collectedLines.length)];
          if (runs) {
            // Drawn run by run, the collector's name at full strength in
            // their timeline's colour.
            const lineWidth = p.textWidth(line);
            let runX: number =
              hAlign === p.CENTER
                ? x - lineWidth / 2
                : hAlign === p.RIGHT
                ? x - lineWidth
                : x;
            p.textAlign(p.LEFT, below ? p.TOP : p.BOTTOM);
            // p5 measures without trailing spaces, so time each run's start
            // by the width of everything before it plus a stand-in letter.
            const startX = runX;
            let before = '';
            runs.forEach((part) => {
              runX = startX + p.textWidth(`${before}|`) - p.textWidth('|');
              dateCtx.globalAlpha = part.colour
                ? baseAlpha
                : part.alpha !== undefined
                ? baseAlpha * part.alpha
                : lineAlpha(k);
              p.fill(part.colour ?? label.colour);
              p.text(part.text, runX, lineY(k));
              before += part.text;
            });
            p.fill(label.colour);
            p.textAlign(hAlign, below ? p.TOP : p.BOTTOM);
            return;
          }
          p.text(line, x, lineY(k));
        });
        dateCtx.globalAlpha = baseAlpha;
        p.textStyle(p.NORMAL);
      }
      resetCanvasEffects(dateCtx);
      dateCtx.letterSpacing = '0px';
      p.textFont(canvasFont);
      p.textSize(12);
    }

    p.pop();

    if (
      runtime.focusContentFade <= LOAD_ALPHA_SNAP &&
      collectedHover.hoveredCollected !== -1
    ) {
      const hovered = deps.processedCollected[collectedHover.hoveredCollected];
      const hoveredUserSource =
        collectedHover.hoveredUserRow !== null
          ? hovered.sources.find(
              (source) => source.rowIndex === collectedHover.hoveredUserRow
            )
          : undefined;

      if (collectedHover.hoveredCollectedIsImage && hovered.isPrivate) {
        drawUserLabel(
          p,
          PRIVATE_BADGE_TEXT,
          PRIVATE_BADGE_COLOUR,
          p.mouseX,
          p.mouseY
        );
      } else if (
        !collectedHover.hoveredCollectedIsImage &&
        !hoveredUserSource
      ) {
        // A single user's line is named by its tag riding the line, and the
        // item itself by the label under it.
        drawCollectedSourcesLabel(p, hovered.sources, p.mouseX, p.mouseY);
      }
    } else if (
      runtime.focusContentFade <= LOAD_ALPHA_SNAP &&
      mainHover.mainHighlighted
    ) {
      const hoveredMainItem =
        mainHover.hoveredMain !== -1
          ? deps.processed[mainHover.hoveredMain]
          : undefined;
      if (hoveredMainItem?.isPrivate) {
        drawUserLabel(
          p,
          PRIVATE_BADGE_TEXT,
          PRIVATE_BADGE_COLOUR,
          p.mouseX,
          p.mouseY
        );
      }
    } else if (lastHoveredPreviewId !== null) {
      const hoveredPreviewIndex = deps.processedPreview.findIndex(
        (item) => item.contentId === lastHoveredPreviewId
      );
      const isHoveredPreviewFocused =
        isFocusActive && isFocusedTarget('preview', hoveredPreviewIndex);
      if (
        hoveredPreviewIndex !== -1 &&
        (isHoveredPreviewFocused || runtime.focusContentFade <= LOAD_ALPHA_SNAP)
      ) {
        drawUserLabel(
          p,
          isHoveredPreviewFocused
            ? '+ collect item'
            : deps.processedPreview[hoveredPreviewIndex].title,
          deps.previewColour,
          p.mouseX,
          p.mouseY
        );
      }
    }

    // The name tags riding hovered timelines (eased along them in
    // updateLineTags), drawn on screen above the map.
    const toScreen = (point: ConnectorPoint) => ({
      x: (point.x - runtime.cameraX) * runtime.zoom,
      y: (point.y - runtime.cameraY) * runtime.zoom,
    });
    // What the tags must keep off, on screen: every item's artwork and label.
    const toScreenRect = (r: LabelRect): LabelRect => {
      const topLeft = toScreen({ x: r.left, y: r.top });
      const bottomRight = toScreen({ x: r.right, y: r.bottom });
      return {
        left: topLeft.x,
        top: topLeft.y,
        right: bottomRight.x,
        bottom: bottomRight.y,
      };
    };
    const tagObstacles = [
      ...[...bounds, ...collectedBounds].map((b) =>
        toScreenRect({
          left: b.left,
          right: b.right,
          top: b.top,
          bottom: b.top + b.height,
        })
      ),
      ...drawnLabelRects.map(toScreenRect),
    ];
    const overlapsObstacle = (r: LabelRect) =>
      tagObstacles.some(
        (o) =>
          o.left < r.right &&
          o.right > r.left &&
          o.top < r.bottom &&
          o.bottom > r.top
      );
    runtime.lineBlobs.forEach((blob, key) => {
      // The tag rides the line itself, moved along it from the cursor's point
      // just far enough to clear the cursor (half its height on a vertical
      // stretch, half its width on a horizontal one, plus a gap), preferring
      // whichever side takes it higher up the screen. If that spot would cover
      // an item or its label it tries the other side, then further out along
      // the line; with nowhere clear, it sits over the cursor.
      const path = timelinePath(key);
      if (path.length < 2) {
        return;
      }
      const name = blob.name;
      const itemCount =
        key === 'main'
          ? deps.items.length
          : [...(deps.refs.collectorsRef.current?.values() ?? [])].filter(
              (collectors) => collectors.some((c) => c.username === name)
            ).length;
      const detail = `${itemCount} item${itemCount === 1 ? '' : 's'}`;
      const size = measureLineTag(p, name, detail);
      const nudge = 1 / runtime.zoom;
      const before = pointAtArcLength(path, blob.distance - nudge);
      const after = pointAtArcLength(path, blob.distance + nudge);
      const span = Math.hypot(after.x - before.x, after.y - before.y) || 1;
      const clearance =
        (LINE_TAG_LIFT_PX +
          (Math.abs(after.y - before.y) / span) * (size.height / 2) +
          (Math.abs(after.x - before.x) / span) * (size.width / 2)) /
        runtime.zoom;
      const ahead = pointAtArcLength(path, blob.distance + clearance);
      const behind = pointAtArcLength(path, blob.distance - clearance);
      // Only switch the preferred side once the other is clearly higher, so it
      // doesn't flicker between them.
      const switchMargin = 2 / runtime.zoom;
      if (blob.side > 0 && behind.y < ahead.y - switchMargin) {
        blob.side = -1;
      } else if (blob.side < 0 && ahead.y < behind.y - switchMargin) {
        blob.side = 1;
      }
      const tagRectAt = (point: ConnectorPoint): LabelRect => {
        const at = toScreen(point);
        return {
          left: at.x - size.width / 2,
          right: at.x + size.width / 2,
          top: at.y - size.height / 2,
          bottom: at.y + size.height / 2,
        };
      };
      const candidates = [1, 2, 3, 4].flatMap((step) => [
        blob.distance + blob.side * clearance * step,
        blob.distance - blob.side * clearance * step,
      ]);
      const clear = candidates
        .map((distance) => pointAtArcLength(path, distance))
        .find((point) => !overlapsObstacle(tagRectAt(point)));
      const { x, y } = toScreen(clear ?? blob);
      drawLineTag(p, name, detail, blob.colour, x, y, blob.scale);
    });

    // While an item is focused, hovering one of its connector dots grows the
    // dot and labels the node with the timeline it belongs to and the item it
    // links to at the far end of the line.
    if (isFocusActive) {
      // Nodes out at the screen edges hit-test as touching bands along each
      // edge; the rest (line ends on the item) by distance to the node.
      const screenRegions = nodeRegions.map((region) => ({
        region,
        x: (region.x - runtime.cameraX) * runtime.zoom,
        y: (region.y - runtime.cameraY) * runtime.zoom,
        side: region.side,
      }));
      let hoveredNode: NodeHoverRegion | null =
        findEdgeNodeHit(screenRegions, p.mouseX, p.mouseY, p.width, p.height)
          ?.region ?? null;
      if (!hoveredNode) {
        let bestDist = DOT_RADIUS * runtime.zoom * zoomGrowth + 8;
        for (const { region, x, y } of screenRegions) {
          const dist = Math.hypot(x - p.mouseX, y - p.mouseY);
          if (!region.side && dist <= bestDist) {
            bestDist = dist;
            hoveredNode = region;
          }
        }
      }

      // Remember the hovered node so the grown dot keeps drawing (shrinking)
      // after the cursor leaves it.
      if (hoveredNode) {
        runtime.hoverNodeX = hoveredNode.x;
        runtime.hoverNodeY = hoveredNode.y;
        runtime.hoverNodeColour = hoveredNode.colour;
        runtime.hoverNodeDotScale = hoveredNode.scale ?? zoomGrowth;
        runtime.hoverNodeHoleRatio = hoveredNode.holeRatio ?? 0.5;
        runtime.hoverNodeDotless = hoveredNode.dotless ?? false;
      }
      runtime.hoverNodeScale +=
        ((hoveredNode ? 1 : 0) - runtime.hoverNodeScale) * NODE_GROW_LERP;
      runtime.hoverEdgeNodeKey = hoveredNode?.edgeKey ?? null;

      // Redraw the node larger, eased by the grow. At scale 0 it matches the
      // normal dot underneath (or, at an end with no dot, vanishes), so the
      // grow/shrink reads seamlessly.
      if (runtime.hoverNodeScale > LOAD_ALPHA_SNAP) {
        const sx = (runtime.hoverNodeX - runtime.cameraX) * runtime.zoom;
        const sy = (runtime.hoverNodeY - runtime.cameraY) * runtime.zoom;
        const diameter =
          DOT_RADIUS *
          2 *
          runtime.zoom *
          runtime.hoverNodeDotScale *
          (runtime.hoverNodeDotless
            ? runtime.hoverNodeScale * (1 + NODE_HOVER_GROW)
            : 1 + runtime.hoverNodeScale * NODE_HOVER_GROW);
        p.noStroke();
        p.fill(runtime.hoverNodeColour);
        p.circle(sx, sy, diameter);
        p.fill(255);
        p.circle(sx, sy, diameter * runtime.hoverNodeHoleRatio);
      }

      // The hovered node opens into a card naming the item at the far end of
      // its line and who collected it. Every card eases open or closed on its
      // own, so moving from node to node closes the old card as the new one
      // opens; each follows its node as it moves. The hovered card's size
      // along the viewport edge lets the edge layout push the neighbouring
      // nodes clear of it.
      const hoveredKey = hoveredNode ? nodeRegionKey(hoveredNode) : null;
      if (hoveredNode && hoveredKey && !runtime.nodeCards.has(hoveredKey)) {
        runtime.nodeCards.set(hoveredKey, {
          region: hoveredNode,
          grow: 0,
          extent: 0,
        });
      }
      const liveRegions = new Map(
        nodeRegions.map((region) => [nodeRegionKey(region), region])
      );
      // The hovered card last, so it opens over any that are closing.
      const cardKeys = [...runtime.nodeCards.keys()].sort(
        (a, b) => Number(a === hoveredKey) - Number(b === hoveredKey)
      );
      cardKeys.forEach((key) => {
        const card = runtime.nodeCards.get(key);
        if (!card) {
          return;
        }
        card.region = liveRegions.get(key) ?? card.region;
        card.grow +=
          ((key === hoveredKey ? 1 : 0) - card.grow) * NODE_GROW_LERP;
        if (key !== hoveredKey && card.grow < LOAD_ALPHA_SNAP) {
          runtime.nodeCards.delete(key);
          return;
        }
        const { region } = card;
        const size = drawNodeCard(
          p,
          region,
          (region.x - runtime.cameraX) * runtime.zoom,
          (region.y - runtime.cameraY) * runtime.zoom,
          DOT_RADIUS * runtime.zoom * (region.scale ?? zoomGrowth),
          card.grow,
          region.target.lane === 'main'
            ? loadedImages[region.target.index]
            : region.target.lane === 'collected'
            ? loadedCollectedImages[region.target.index]
            : loadedPreviewImages[region.target.index]
        );
        card.extent =
          region.side === 'left' || region.side === 'right'
            ? size.height
            : size.width;
      });
      runtime.hoverCardExtent = hoveredKey
        ? runtime.nodeCards.get(hoveredKey)?.extent ?? 0
        : 0;
    } else {
      runtime.hoverNodeScale = 0;
      runtime.hoverEdgeNodeKey = null;
      runtime.nodeCards.clear();
    }

    const audioButton = deps.audio.getButtonRegion();
    const overAudioButton = audioButton
      ? Math.hypot(
          mouseWorld.x - audioButton.cx,
          mouseWorld.y - audioButton.cy
        ) <= audioButton.r
      : false;
    const overGalleryArrow = gallery
      .getNavRegions()
      .some(
        (region) =>
          Math.hypot(mouseWorld.x - region.cx, mouseWorld.y - region.cy) <=
          region.r
      );

    const hoveringContent =
      (mainHover.hoveredMain !== -1 &&
        !deps.processed[mainHover.hoveredMain]?.isPrivate) ||
      (collectedHover.hoveredCollectedIsImage &&
        !deps.processedCollected[collectedHover.hoveredCollected]?.isPrivate) ||
      lastHoveredPreviewId !== null;
    if (overAudioButton || overGalleryArrow) {
      p.cursor('pointer');
    } else if (view.isViewInteractionLocked()) {
      p.cursor(hoveringContent ? 'pointer' : 'default');
    } else if (runtime.dragLane === 'canvas') {
      p.cursor('grabbing');
    } else if (hoveringContent) {
      p.cursor('pointer');
    } else {
      p.cursor('grab');
    }

    reportAudioState(isFocusActive);
  };
}
