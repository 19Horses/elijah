import type p5 from 'p5';
import {
  getStaggeredLoadAlpha,
  getTypeDimAlpha,
  hexToRgba,
  resetCanvasEffects,
} from '../canvasEffects';
import {
  BRANCH_DIM_LERP,
  BRANCH_MERGE_TRANSITION_FACTOR,
  BRANCH_MERGE_ZOOM_FACTOR,
  DATE_FONT_MERGE_SHRINK,
  HIGHLIGHT_FADE_SNAP,
  LOAD_ALPHA_SNAP,
  LOAD_CONNECTOR_DELAY_MS,
  LOAD_CONNECTOR_FADE_MS,
  LOAD_CONNECTOR_STAGGER_MS,
  LOAD_IMAGE_FADE_MS,
  LOAD_IMAGE_STAGGER_MS,
  LOAD_INITIAL_DELAY_MS,
  DOT_RADIUS,
  MAIN_CONNECTOR_DIM_ALPHA,
  MAIN_GLOW_COLOUR,
  MAIN_LINE_Y,
  MAIN_USERNAME,
  NODE_GROW_LERP,
  NODE_HOVER_GROW,
  PRIVATE_BADGE_COLOUR,
  PRIVATE_BADGE_TEXT,
  DATE_FONT_SIZE,
  PREVIEW_SWITCH_FADE_MS,
  ZOOM_OUT_GROWTH_POWER,
} from '../constants';
import { drawDot } from '../connectors';
import { screenToWorld, zoomMergeProgress, zoomOutGrowth } from '../geometry';
import { drawCollectedSourcesLabel, drawUserLabel } from '../labels';
import {
  animateDetailReveal,
  formatDateForZoom,
  syncInteractionLock,
  updateHighlightFade,
} from '../timelineRuntime';
import type {
  AudioPlayerState,
  ContentBounds,
  NodeHoverRegion,
  TimelineSketchDeps,
} from '../types';
import type { BoundsContext } from './bounds';
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
  cdImageRef: { current: p5.Image | null },
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
  // Last reported mini-player key, so the ref only fires when it changes.
  let lastAudioKey = '';
  // Last reported hovered collectible-item content id, so the ref only fires
  // when it changes.
  let lastHoveredPreviewId: string | null = null;
  // Eased 0-1 "highlighted" progress per collectible item (keyed by content
  // id), so growing into/out of the selected/hovered look eases rather than
  // snapping straight to size.
  const previewHighlightProgress = new Map<string, number>();
  const isolatedLineX = new Map<string, number>();

  // The logged-in viewer's own branch row, so hovering the user card can
  // highlight it exactly like hovering the branch on the canvas.
  let ownBranchRow = -1;
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
    let isolatedLine: ReturnType<BoundsContext['getIsolatedMergedLine']> = null;
    const getIsolatedLine = () => {
      if (isolatedLine === null && isolateRow !== null) {
        isolatedLine = boundsCtx.getIsolatedMergedLine(isolateRow);
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

    const contentAlphaFor = (
      lane: 'main' | 'collected',
      index: number,
      base = 1
    ) => {
      let alpha = base;
      // Selecting an item no longer fades the others out — they stay visible.
      // Isolating the viewer's own branch, though, fades everything that isn't
      // part of it away: the main timeline's own items and every other
      // collector's items, leaving just the isolated branch straightened out.
      if (isolateActive && (lane === 'main' || !isIsolatedItem(index))) {
        alpha *= 1 - isolate;
      }
      return alpha;
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

    p.background(deps.backgroundColour);
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
    const hoverSuppressed = isFocusActive || isolateActive;
    const mainHover = computeMainLaneHover(
      deps,
      bounds,
      mouseWorld,
      hoverSuppressed
    );

    // Rebuilt each frame and shared with the input handler for click-to-focus.
    const nodeRegions: NodeHoverRegion[] = [];
    runtime.nodeRegions = nodeRegions;

    // Date labels are collected during the item pass and drawn last so they sit
    // above the connectors and nodes.
    const dateLabels: DateLabel[] = [];

    // A focused audio item reveals its CD to the right; slide any branch node on
    // that item's right edge out to the CD's right edge (radius * 1.1 at full
    // reveal, matching drawAudioDisc).
    let audioNodeX: number | null = null;
    let audioNodeShift = 0;
    if (
      isFocusActive &&
      runtime.focusTarget?.lane === 'collected' &&
      deps.processedCollected[runtime.focusTarget.index]?.contentType ===
        'audioAsset'
    ) {
      const focusBounds = collectedBounds[runtime.focusTarget.index];
      if (focusBounds) {
        audioNodeX = focusBounds.right;
        audioNodeShift = focusBounds.height * 0.45 * 1.1 * runtime.detailLayout;
      }
    }

    const drawCtx: MainLaneDrawContext = {
      bounds,
      lineWorldX,
      nodeRegions,
      mouseWorld,
      highlightedType,
      typeHighlightStrength,
      isTypeHighlightActive,
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
      isolateOtherAlpha,
      audioNodeX,
      audioNodeShift,
      dateLabels,
      // Grey only the main connectors the active branch detours below; the rest
      // of the main line (before, after, and skipped gaps) stays lit.
      mainConnectorTravelAlpha: (connectorIndex: number) => {
        const row = runtime.branchDimRow;
        if (row === null || runtime.branchDimStrength <= 0) {
          return 1;
        }
        if (!boundsCtx.getBranchDetouredGaps(row).has(connectorIndex)) {
          return 1;
        }
        return 1 - runtime.branchDimStrength * (1 - MAIN_CONNECTOR_DIM_ALPHA);
      },
    };

    const cdImage = cdImageRef.current;

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

    drawMainLaneItems(
      p,
      deps,
      loadedImages,
      drawCtx,
      mainHover,
      cdImage,
      gallery
    );

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
      const laneBounds = getDetailDrawBoundsIso(lane, index, itemBounds);
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

    drawCollectedLaneItems(
      p,
      deps,
      loadedCollectedImages,
      collectedBounds,
      drawCtx,
      collectedHover,
      cdImage,
      gallery
    );

    // Connectors render above the images so the lines (like the nodes) sit
    // over the focused image rather than disappearing behind it.
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
    drawMainLaneConnectorDots(p, deps, drawCtx, mainHover);
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
          return { kind: entry.kind, index: entry.index, rect: entry.rect };
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
      let hoveredPreviewContentId: string | null = null;
      for (const entry of isolatedOrdered) {
        if (entry.kind !== 'preview') {
          continue;
        }
        const item = deps.processedPreview[entry.index];
        const img = loadedPreviewImages[entry.index];
        const { rect } = entry;

        if (
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

        previewCtx.globalAlpha = isolate * previewSwitchAlpha;
        const greyness = 1 - progress;
        if (greyness > 0) {
          previewCtx.filter = `grayscale(${greyness * 80}%) brightness(${
            1 - greyness * 0.25
          })`;
        }
        if (progress > 0) {
          previewCtx.shadowColor = hexToRgba(
            deps.previewColour,
            0.45 * isolate * previewSwitchAlpha * progress
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

        // Deferred so the date renders above the connectors/nodes, matching
        // every other item's date label.
        dateLabels.push({
          x: rect.left + rect.width / 2,
          y: rect.top - 12,
          text: formatDateForZoom(
            item.anchorTime,
            runtime.zoom,
            runtime.fitZoomLevel
          ),
          colour: 255,
          alpha: isolate * previewSwitchAlpha,
        });
      }

      if (hoveredPreviewContentId !== lastHoveredPreviewId) {
        lastHoveredPreviewId = hoveredPreviewContentId;
        deps.refs.onPreviewHoverRef.current?.(hoveredPreviewContentId);
      }

      const ctx2 = p.drawingContext as CanvasRenderingContext2D;
      p.stroke(isolateColour);
      p.strokeWeight(zoomGrowth);
      p.noFill();
      for (let k = 0; k < isolatedOrdered.length - 1; k++) {
        const a = isolatedOrdered[k];
        const b = isolatedOrdered[k + 1];
        // Dotted wherever the segment touches a collectible (not-yet-
        // collected) item, so those links read differently from the solid
        // lines between items actually on the branch.
        const dotted = a.kind === 'preview' || b.kind === 'preview';
        ctx2.globalAlpha = dotted ? isolate * previewSwitchAlpha : isolate;
        ctx2.setLineDash(dotted ? [0.1, zoomGrowth * 6] : []);
        ctx2.lineCap = dotted ? 'round' : 'butt';
        p.line(a.rect.right, a.rect.centerY, b.rect.left, b.rect.centerY);
      }
      ctx2.setLineDash([]);
      ctx2.lineCap = 'butt';
      for (const { kind, rect } of isolatedOrdered) {
        ctx2.globalAlpha =
          kind === 'preview' ? isolate * previewSwitchAlpha : isolate;
        drawDot(p, rect.left, rect.centerY, isolateColour, zoomGrowth);
        drawDot(p, rect.right, rect.centerY, isolateColour, zoomGrowth);
      }
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
    // once branches have merged (same threshold as the branch-line merge),
    // easing the crowded, overlapping labels down a touch at extreme zoom-out.
    if (dateLabels.length > 0) {
      const dateMergeProgress = zoomMergeProgress(
        runtime.zoom,
        runtime.fitZoomLevel,
        BRANCH_MERGE_ZOOM_FACTOR,
        BRANCH_MERGE_TRANSITION_FACTOR
      );
      const dateFontScale = 1 - dateMergeProgress * DATE_FONT_MERGE_SHRINK;
      const dateCtx = p.drawingContext as CanvasRenderingContext2D;
      p.noStroke();
      p.textSize((DATE_FONT_SIZE * dateFontScale) / runtime.zoom);
      p.textAlign(p.CENTER, p.BOTTOM);
      for (const label of dateLabels) {
        dateCtx.globalAlpha = label.alpha;
        p.fill(label.colour);
        p.text(label.text, label.x, label.y);
      }
      resetCanvasEffects(dateCtx);
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
      } else if (!collectedHover.hoveredCollectedIsImage && hoveredUserSource) {
        // Hovering a single user's line: show just that user.
        drawUserLabel(
          p,
          hoveredUserSource.username,
          hoveredUserSource.colour,
          p.mouseX,
          p.mouseY
        );
      } else {
        drawCollectedSourcesLabel(
          p,
          hovered.sources,
          p.mouseX,
          p.mouseY,
          collectedHover.hoveredCollectedIsImage ? hovered.title : undefined
        );
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
      } else {
        drawUserLabel(
          p,
          MAIN_USERNAME,
          MAIN_GLOW_COLOUR,
          p.mouseX,
          p.mouseY,
          hoveredMainItem?.title
        );
      }
    }

    // While an item is focused, hovering one of its connector dots grows the
    // dot and labels the node with the timeline it belongs to and the item it
    // links to at the far end of the line.
    if (isFocusActive) {
      let hoveredNode: NodeHoverRegion | null = null;
      let bestDist = DOT_RADIUS * runtime.zoom * zoomGrowth + 8;
      for (const region of nodeRegions) {
        const sx = (region.x - runtime.cameraX) * runtime.zoom;
        const sy = (region.y - runtime.cameraY) * runtime.zoom;
        const dist = Math.hypot(sx - p.mouseX, sy - p.mouseY);
        if (dist <= bestDist) {
          bestDist = dist;
          hoveredNode = region;
        }
      }

      // Remember the hovered node so the grown dot keeps drawing (shrinking)
      // after the cursor leaves it.
      if (hoveredNode) {
        runtime.hoverNodeX = hoveredNode.x;
        runtime.hoverNodeY = hoveredNode.y;
        runtime.hoverNodeColour = hoveredNode.colour;
      }
      runtime.hoverNodeScale +=
        ((hoveredNode ? 1 : 0) - runtime.hoverNodeScale) * NODE_GROW_LERP;

      // Redraw the node larger, eased by the grow. At scale 0 it matches the
      // normal dot underneath, so the grow/shrink reads seamlessly.
      if (runtime.hoverNodeScale > LOAD_ALPHA_SNAP) {
        const sx = (runtime.hoverNodeX - runtime.cameraX) * runtime.zoom;
        const sy = (runtime.hoverNodeY - runtime.cameraY) * runtime.zoom;
        const diameter =
          DOT_RADIUS *
          2 *
          runtime.zoom *
          zoomGrowth *
          (1 + runtime.hoverNodeScale * NODE_HOVER_GROW);
        p.noStroke();
        p.fill(runtime.hoverNodeColour);
        p.circle(sx, sy, diameter);
        p.fill(255);
        p.circle(sx, sy, diameter / 2);
      }

      if (hoveredNode) {
        const sx = (hoveredNode.x - runtime.cameraX) * runtime.zoom;
        const sy = (hoveredNode.y - runtime.cameraY) * runtime.zoom;
        drawUserLabel(
          p,
          hoveredNode.timeline,
          hoveredNode.colour,
          sx,
          sy,
          hoveredNode.title
        );
      }
    } else if (runtime.hoverNodeScale !== 0) {
      runtime.hoverNodeScale = 0;
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
        !deps.processedCollected[collectedHover.hoveredCollected]?.isPrivate);
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
