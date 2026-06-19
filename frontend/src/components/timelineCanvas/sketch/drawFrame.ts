import type p5 from 'p5';
import { formatMainTimelineNow } from '../../../queries/mainTimeline';
import {
  getStaggeredLoadAlpha,
  getTypeDimAlpha,
  resetCanvasEffects,
} from '../canvasEffects';
import {
  HIGHLIGHT_FADE_SNAP,
  LOAD_ALPHA_SNAP,
  LOAD_CONNECTOR_DELAY_MS,
  LOAD_CONNECTOR_FADE_MS,
  LOAD_CONNECTOR_STAGGER_MS,
  LOAD_IMAGE_FADE_MS,
  LOAD_IMAGE_STAGGER_MS,
  LOAD_INITIAL_DELAY_MS,
  MAIN_GLOW_COLOUR,
  MAIN_USERNAME,
  TODAY_LABEL_BOTTOM_OFFSET,
  TODAY_LABEL_GAP,
} from '../constants';
import { getDetailImageScreenHeight, screenToWorld } from '../geometry';
import { drawCollectedSourcesLabel, drawUserLabel } from '../labels';
import {
  animateDetailReveal,
  syncInteractionLock,
  updateHighlightFade,
} from '../timelineRuntime';
import type { TimelineSketchDeps } from '../types';
import type { BoundsContext } from './bounds';
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
  type MainLaneDrawContext,
} from './drawMainLane';
import type { ViewContext } from './view';

export function createDrawFrameHandler(
  p: p5,
  deps: TimelineSketchDeps,
  boundsCtx: BoundsContext,
  view: ViewContext,
  loadedImages: (p5.Image | null)[],
  loadedCollectedImages: (p5.Image | null)[]
): () => void {
  const { runtime } = deps;
  const { isFocusedTarget, getDetailDrawBounds } = createMainLaneDrawHelpers(
    deps,
    p
  );

  const drawTodayLine = (alpha = 1) => {
    if (alpha <= LOAD_ALPHA_SNAP) {
      return;
    }

    const lineX = (boundsCtx.getNowWorldX() - runtime.cameraX) * runtime.zoom;
    const ctx = p.drawingContext as CanvasRenderingContext2D;

    ctx.globalAlpha = alpha;
    ctx.setLineDash([]);
    p.stroke(210);
    p.strokeWeight(0.75);
    p.line(lineX, 0, lineX, p.height);

    const { date, time } = formatMainTimelineNow();
    const labelY = p.height - TODAY_LABEL_BOTTOM_OFFSET;

    p.noStroke();
    p.fill(17);
    p.textAlign(p.RIGHT, p.BOTTOM);
    p.text(date, lineX - TODAY_LABEL_GAP, labelY);
    p.textAlign(p.LEFT, p.BOTTOM);
    p.text(time, lineX + TODAY_LABEL_GAP, labelY);
    resetCanvasEffects(ctx);
  };

  return () => {
    view.animateView();
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

    p.background(deps.backgroundColour);

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

    const drawCtx: MainLaneDrawContext = {
      bounds,
      lineWorldX,
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
    };

    drawMainLaneConnectors(p, deps, drawCtx, mainHover);
    drawMainLaneItems(p, deps, loadedImages, drawCtx, mainHover);

    const collectedBounds = boundsCtx.getCollectedBounds();

    if (runtime.focusTarget && runtime.detailLayout > 0) {
      const { lane, index } = runtime.focusTarget;
      const laneBounds =
        lane === 'main' ? bounds[index] : collectedBounds[index];
      const imageHeightPx = getDetailImageScreenHeight(
        laneBounds,
        runtime.detailLayout,
        runtime.zoom,
        p.width,
        runtime.cameraX
      );
      deps.refs.onDetailImageHeightRef.current?.(imageHeightPx);
    }

    const collectedHover = computeCollectedLaneHover(
      deps,
      boundsCtx,
      collectedBounds,
      bounds,
      mouseWorld,
      isFocusActive
    );

    drawCollectedLaneConnectors(
      p,
      deps,
      boundsCtx,
      collectedBounds,
      bounds,
      drawCtx,
      collectedHover
    );
    drawCollectedLaneItems(
      p,
      deps,
      loadedCollectedImages,
      collectedBounds,
      drawCtx,
      collectedHover
    );
    drawMainLaneConnectorDots(p, drawCtx, mainHover);
    drawCollectedLaneConnectorDots(
      p,
      deps,
      boundsCtx,
      collectedBounds,
      bounds,
      drawCtx,
      collectedHover
    );

    p.pop();

    drawTodayLine(todayLineAlpha * otherContentAlpha);

    if (
      runtime.focusContentFade <= LOAD_ALPHA_SNAP &&
      collectedHover.hoveredCollected !== -1
    ) {
      const hovered = deps.processedCollected[collectedHover.hoveredCollected];
      drawCollectedSourcesLabel(
        p,
        hovered.sources,
        p.mouseX,
        p.mouseY,
        collectedHover.hoveredCollectedIsImage ? hovered.title : undefined
      );
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

    const hoveringContent =
      mainHover.hoveredMain !== -1 || collectedHover.hoveredCollectedIsImage;
    if (view.isViewInteractionLocked()) {
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
