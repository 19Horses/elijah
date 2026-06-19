import type p5 from 'p5';
import { getContentTypeColour } from '../../../constants/contentTypes';
import {
  drawDimOverlay,
  getCombinedAlpha,
  hexToRgba,
  matchesHighlightedType,
  resetCanvasEffects,
} from '../canvasEffects';
import {
  CONNECTOR_HOVER_THRESHOLD,
  LOAD_ALPHA_SNAP,
  TYPE_HIGHLIGHT_BLUR,
} from '../constants';
import {
  distanceToPolyline,
  drawBranchConnector,
  drawDot,
  getBranchPoints,
} from '../connectors';
import type { ContentBounds, TimelineSketchDeps } from '../types';
import type { BoundsContext } from './bounds';
import type { MainLaneDrawContext } from './drawMainLane';

export type CollectedLaneDrawResult = {
  hoveredCollected: number;
  hoveredCollectedIsImage: boolean;
};

export function computeCollectedLaneHover(
  deps: TimelineSketchDeps,
  boundsCtx: BoundsContext,
  collectedBounds: ContentBounds[],
  mainBounds: ContentBounds[],
  mouseWorld: { x: number; y: number },
  isFocusActive: boolean
): CollectedLaneDrawResult {
  let hoveredCollected = -1;
  let hoveredCollectedIsImage = false;

  for (let index = deps.processedCollected.length - 1; index >= 0; index--) {
    const b = collectedBounds[index];
    if (
      mouseWorld.x >= b.left &&
      mouseWorld.x <= b.right &&
      mouseWorld.y >= b.top &&
      mouseWorld.y <= b.top + b.height
    ) {
      hoveredCollected = index;
      hoveredCollectedIsImage = true;
      break;
    }
  }

  if (hoveredCollected === -1 && !isFocusActive) {
    for (let index = deps.processedCollected.length - 1; index >= 0; index--) {
      const item = deps.processedCollected[index];
      const itemBounds = collectedBounds[index];
      for (
        let sourceIndex = 0;
        sourceIndex < item.sources.length;
        sourceIndex++
      ) {
        const { from: fromPoint, to: toPoint } =
          boundsCtx.getBranchEndpointsForSource(
            item.anchorTime,
            itemBounds,
            mainBounds,
            sourceIndex,
            item.sources.length
          );
        const line = getBranchPoints(fromPoint, toPoint);
        if (distanceToPolyline(line, mouseWorld) <= CONNECTOR_HOVER_THRESHOLD) {
          hoveredCollected = index;
          break;
        }
      }
      if (hoveredCollected !== -1) {
        break;
      }
    }
  }

  return { hoveredCollected, hoveredCollectedIsImage };
}

export function drawCollectedLaneConnectors(
  p: p5,
  deps: TimelineSketchDeps,
  boundsCtx: BoundsContext,
  collectedBounds: ContentBounds[],
  mainBounds: ContentBounds[],
  ctx: MainLaneDrawContext,
  hover: CollectedLaneDrawResult
): void {
  const collectedCtx = p.drawingContext as CanvasRenderingContext2D;

  deps.processedCollected.forEach((item, index) => {
    const itemBounds = collectedBounds[index];
    const isConnectorHovered =
      hover.hoveredCollected === index && !hover.hoveredCollectedIsImage;
    const connectorLoadAlpha =
      ctx.getCollectedConnectorLoadAlpha(index) * ctx.otherContentAlpha;

    if (connectorLoadAlpha <= LOAD_ALPHA_SNAP) {
      return;
    }

    item.sources.forEach((source, sourceIndex) => {
      const { from: fromPoint, to: toPoint } =
        boundsCtx.getBranchEndpointsForSource(
          item.anchorTime,
          itemBounds,
          mainBounds,
          sourceIndex,
          item.sources.length
        );

      if (isConnectorHovered && !ctx.isFocusActive) {
        collectedCtx.shadowBlur = 16;
        collectedCtx.shadowColor = hexToRgba(
          source.colour,
          0.55 * connectorLoadAlpha
        );
      }

      if (ctx.isTypeHighlightActive) {
        collectedCtx.globalAlpha = getCombinedAlpha(
          connectorLoadAlpha,
          ctx.dimAlpha
        );
      } else {
        collectedCtx.globalAlpha = connectorLoadAlpha;
      }

      drawBranchConnector(p, fromPoint, toPoint, source.colour);
      resetCanvasEffects(collectedCtx);
    });
  });
}

export function drawCollectedLaneItems(
  p: p5,
  deps: TimelineSketchDeps,
  loadedCollectedImages: (p5.Image | null)[],
  collectedBounds: ContentBounds[],
  ctx: MainLaneDrawContext,
  hover: CollectedLaneDrawResult
): void {
  const collectedCtx = p.drawingContext as CanvasRenderingContext2D;

  deps.processedCollected.forEach((item, index) => {
    const imageLoadAlpha = ctx.getImageLoadAlpha(deps.processed.length + index);
    const visibilityAlpha = ctx.contentAlphaFor(
      'collected',
      index,
      imageLoadAlpha
    );
    if (visibilityAlpha <= LOAD_ALPHA_SNAP) {
      return;
    }

    const { left, top, width, height } = ctx.getDetailDrawBounds(
      'collected',
      index,
      collectedBounds[index]
    );
    const img = loadedCollectedImages[index];
    const isConnectorHovered =
      hover.hoveredCollected === index && !hover.hoveredCollectedIsImage;
    const typeMatch = matchesHighlightedType(
      item.contentType,
      ctx.highlightedType
    );
    const hideDateLabel =
      ctx.isFocusedTarget('collected', index) &&
      ctx.isDetailLayoutActive &&
      deps.runtime.detailLayout > 0;

    if (ctx.isFocusActive && ctx.isFocusedTarget('collected', index)) {
      collectedCtx.shadowBlur = 22;
      collectedCtx.shadowColor = hexToRgba(
        item.sources[0].colour,
        0.45 * visibilityAlpha
      );
    } else if (hover.hoveredCollected === index) {
      collectedCtx.shadowBlur = 22;
      collectedCtx.shadowColor = hexToRgba(
        item.sources[0].colour,
        0.45 * visibilityAlpha
      );
    } else if (typeMatch && ctx.isTypeHighlightActive) {
      collectedCtx.shadowBlur = TYPE_HIGHLIGHT_BLUR * ctx.typeHighlightStrength;
      collectedCtx.shadowColor = hexToRgba(
        getContentTypeColour(item.contentType),
        0.55 * ctx.typeHighlightStrength * visibilityAlpha
      );
    }

    if (ctx.isTypeHighlightActive && !typeMatch) {
      collectedCtx.globalAlpha = getCombinedAlpha(
        visibilityAlpha,
        ctx.dimAlpha
      );
    } else {
      collectedCtx.globalAlpha = visibilityAlpha;
    }

    if (img) {
      p.image(img, left, top, width, height);
    } else {
      p.fill(245);
      p.stroke(220);
      p.rect(left, top, width, height);

      if (!item.imageUrl) {
        p.fill(120);
        p.noStroke();
        p.textAlign(p.CENTER, p.CENTER);
        p.text(item.title, left + width / 2, top + height / 2);
      }
    }

    resetCanvasEffects(collectedCtx);

    if (ctx.isTypeHighlightActive && !typeMatch) {
      drawDimOverlay(
        p,
        collectedCtx,
        left,
        top,
        width,
        height,
        ctx.typeHighlightStrength * visibilityAlpha
      );
    }

    if (!hideDateLabel) {
      p.fill(17);
      p.noStroke();
      p.textAlign(p.CENTER, p.TOP);
      if (ctx.isTypeHighlightActive && !typeMatch) {
        collectedCtx.globalAlpha = getCombinedAlpha(
          visibilityAlpha,
          ctx.dimAlpha
        );
      } else {
        collectedCtx.globalAlpha = visibilityAlpha;
      }
      p.text(item.dateLabel, left + width / 2, top + height + 12);
      resetCanvasEffects(collectedCtx);
    }
  });
}

export function drawCollectedLaneConnectorDots(
  p: p5,
  deps: TimelineSketchDeps,
  boundsCtx: BoundsContext,
  collectedBounds: ContentBounds[],
  mainBounds: ContentBounds[],
  ctx: MainLaneDrawContext,
  hover: CollectedLaneDrawResult
): void {
  const collectedCtx = p.drawingContext as CanvasRenderingContext2D;

  deps.processedCollected.forEach((item, index) => {
    const itemBounds = collectedBounds[index];
    const isConnectorHovered =
      hover.hoveredCollected === index && !hover.hoveredCollectedIsImage;
    const connectorLoadAlpha =
      ctx.getCollectedConnectorLoadAlpha(index) * ctx.otherContentAlpha;

    if (connectorLoadAlpha <= LOAD_ALPHA_SNAP) {
      return;
    }

    item.sources.forEach((source, sourceIndex) => {
      const { from: fromPoint, to: toPoint } =
        boundsCtx.getBranchEndpointsForSource(
          item.anchorTime,
          itemBounds,
          mainBounds,
          sourceIndex,
          item.sources.length
        );
      if (isConnectorHovered && !ctx.isFocusActive) {
        collectedCtx.shadowBlur = 16;
        collectedCtx.shadowColor = hexToRgba(
          source.colour,
          0.55 * connectorLoadAlpha
        );
      }
      if (ctx.isTypeHighlightActive) {
        collectedCtx.globalAlpha = getCombinedAlpha(
          connectorLoadAlpha,
          ctx.dimAlpha
        );
      } else {
        collectedCtx.globalAlpha = connectorLoadAlpha;
      }
      drawDot(p, fromPoint.x, fromPoint.y, source.colour);
      drawDot(p, toPoint.x, toPoint.y, source.colour);
      resetCanvasEffects(collectedCtx);
    });
  });
}
