import type p5 from 'p5';
import {
  getStaggeredLoadAlpha,
  getTypeDimAlpha,
  hexToRgba,
  mixHex,
} from '../canvasEffects';
import {
  BRANCH_DIM_LERP,
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
  MAIN_USERNAME,
  TODAY_GRADIENT_HALF_PX,
} from '../constants';
import { screenToWorld } from '../geometry';
import { drawCollectedSourcesLabel, drawUserLabel } from '../labels';
import {
  animateDetailReveal,
  syncInteractionLock,
  updateHighlightFade,
} from '../timelineRuntime';
import type { NodeHoverRegion, TimelineSketchDeps } from '../types';
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
  cdImageRef: { current: p5.Image | null },
  gallery: GalleryController
): () => void {
  const { runtime } = deps;
  const { isFocusedTarget, getDetailDrawBounds } =
    createMainLaneDrawHelpers(deps);

  // A gradient marks "now": the background eases from its normal colour to
  // white across the future. A tight crossover is centred on the today line (so
  // the ~50% point sits on the red line), then it settles gently to full white
  // across the rest of the screen — no hard seam where the fade meets white.
  const drawTodayGradient = (alpha = 1) => {
    if (alpha <= LOAD_ALPHA_SNAP) {
      return;
    }

    const lineX = (boundsCtx.getNowWorldX() - runtime.cameraX) * runtime.zoom;
    const half = TODAY_GRADIENT_HALF_PX;
    const start = lineX - half;
    // Nothing to fade if the whole transition sits past the right edge.
    if (start >= p.width) {
      return;
    }

    const ctx = p.drawingContext as CanvasRenderingContext2D;
    const span = p.width - start;
    // Proportional position of the today line within the gradient span; the
    // crossover stop lands there so the red line reads as the ~50% point.
    const crossover = span > 0 ? Math.min(0.999, half / span) : 0.999;
    const gradient = ctx.createLinearGradient(start, 0, p.width, 0);
    gradient.addColorStop(0, hexToRgba(deps.backgroundColour, 0));
    gradient.addColorStop(crossover, hexToRgba('#ffffff', 0.5));
    gradient.addColorStop(1, hexToRgba('#ffffff', 1));

    const fillLeft = Math.max(0, start);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = gradient;
    ctx.fillRect(fillLeft, 0, p.width - fillLeft, p.height);
    ctx.restore();
  };

  return () => {
    view.animateView();
    view.animateScrollSnap();
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
    const todayLineAlpha = getStaggeredLoadAlpha(
      elapsed,
      0,
      LOAD_CONNECTOR_FADE_MS,
      0,
      connectorBaseStart
    );
    const isFocusActive =
      runtime.focusTarget !== null && !runtime.viewUnfocusing;
    const isDetailLayoutActive = runtime.detailPhase !== 'none';
    const otherContentAlpha = 1 - runtime.focusContentFade;
    const contentAlphaFor = (
      lane: 'main' | 'collected',
      index: number,
      base = 1
    ) => {
      if (
        runtime.focusContentFade <= LOAD_ALPHA_SNAP ||
        isFocusedTarget(lane, index)
      ) {
        return base;
      }
      return base * otherContentAlpha;
    };

    // Focusing an item dated after today inverts the view to a white
    // background, eased in/out by the focus fade.
    const bgWhiteMix = runtime.focusedItemIsFuture ? runtime.focusContentFade : 0;
    p.background(
      bgWhiteMix > 0
        ? mixHex(deps.backgroundColour, '#ffffff', bgWhiteMix)
        : deps.backgroundColour
    );
    // Behind the content: the future half of the canvas fades to white.
    drawTodayGradient(todayLineAlpha * otherContentAlpha);

    p.push();
    p.scale(runtime.zoom);
    p.translate(-runtime.cameraX, -runtime.cameraY);

    const bounds = boundsCtx.getAllBounds();
    const lineWorldX = boundsCtx.getNowWorldX();
    const mouseWorld = screenToWorld(
      p.mouseX,
      p.mouseY,
      runtime.cameraX,
      runtime.cameraY,
      runtime.zoom
    );

    const mainHover = computeMainLaneHover(
      deps,
      bounds,
      mouseWorld,
      isFocusActive
    );

    // Rebuilt each frame and shared with the input handler for click-to-focus.
    const nodeRegions: NodeHoverRegion[] = [];
    runtime.nodeRegions = nodeRegions;

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
      getDetailDrawBounds,
      contentAlphaFor,
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

    drawMainLaneItems(p, deps, loadedImages, drawCtx, mainHover, cdImage, gallery);

    const collectedBounds = boundsCtx.getCollectedBounds();

    if (runtime.focusTarget && runtime.detailLayout > 0) {
      const { lane, index } = runtime.focusTarget;
      const laneBounds =
        lane === 'main' ? bounds[index] : collectedBounds[index];
      // The focused image stays at its world bounds; report its on-screen
      // rect so the detail text can be placed around it.
      deps.refs.onDetailImageRectRef.current?.({
        left: (laneBounds.left - runtime.cameraX) * runtime.zoom,
        top: (laneBounds.top - runtime.cameraY) * runtime.zoom,
        width: laneBounds.width * runtime.zoom,
        height: laneBounds.height * runtime.zoom,
      });
    }

    const collectedHover = computeCollectedLaneHover(
      deps,
      boundsCtx,
      collectedBounds,
      bounds,
      mouseWorld,
      isFocusActive
    );

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

      if (!collectedHover.hoveredCollectedIsImage && hoveredUserSource) {
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
      drawUserLabel(
        p,
        MAIN_USERNAME,
        MAIN_GLOW_COLOUR,
        p.mouseX,
        p.mouseY,
        mainHover.hoveredMain !== -1
          ? deps.processed[mainHover.hoveredMain].title
          : undefined
      );
    }

    // While an item is focused, hovering one of its connector dots labels the
    // node with the timeline it belongs to and the item it links to at the far
    // end of the line.
    if (isFocusActive && nodeRegions.length > 0) {
      let hoveredNode: NodeHoverRegion | null = null;
      let bestDist = DOT_RADIUS * runtime.zoom + 8;
      for (const region of nodeRegions) {
        const sx = (region.x - runtime.cameraX) * runtime.zoom;
        const sy = (region.y - runtime.cameraY) * runtime.zoom;
        const dist = Math.hypot(sx - p.mouseX, sy - p.mouseY);
        if (dist <= bestDist) {
          bestDist = dist;
          hoveredNode = region;
        }
      }
      if (hoveredNode) {
        const sx = (hoveredNode.x - runtime.cameraX) * runtime.zoom;
        const sy = (hoveredNode.y - runtime.cameraY) * runtime.zoom;
        // Ring the hovered node so it reads as the source of the label.
        p.noFill();
        p.stroke(hoveredNode.colour);
        p.strokeWeight(1.5);
        p.circle(sx, sy, DOT_RADIUS * 2 * runtime.zoom + 8);
        drawUserLabel(
          p,
          hoveredNode.timeline,
          hoveredNode.colour,
          sx,
          sy,
          hoveredNode.title
        );
      }
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
      mainHover.hoveredMain !== -1 || collectedHover.hoveredCollectedIsImage;
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
  };
}
