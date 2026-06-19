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
  MAIN_GLOW_COLOUR,
  TYPE_HIGHLIGHT_BLUR,
} from '../constants';
import {
  distanceToPolyline,
  drawDot,
  drawMainConnector,
  getMainConnectorPoints,
} from '../connectors';
import { applyDetailLayoutTransform } from '../geometry';
import { isFutureDatedItem } from '../timelineRuntime';
import type { ContentType } from '../../../types/content';
import type { ContentBounds, TimelineSketchDeps } from '../types';

export type MainLaneDrawContext = {
  bounds: ContentBounds[];
  lineWorldX: number;
  mouseWorld: { x: number; y: number };
  highlightedType: ContentType | null;
  typeHighlightStrength: number;
  isTypeHighlightActive: boolean;
  dimAlpha: number;
  otherContentAlpha: number;
  isFocusActive: boolean;
  isDetailLayoutActive: boolean;
  getImageLoadAlpha: (imageIndex: number) => number;
  getMainConnectorLoadAlpha: (connectorIndex: number) => number;
  getCollectedConnectorLoadAlpha: (connectorIndex: number) => number;
  isFocusedTarget: (lane: 'main' | 'collected', index: number) => boolean;
  getDetailDrawBounds: (
    lane: 'main' | 'collected',
    index: number,
    itemBounds: ContentBounds
  ) => ContentBounds;
  contentAlphaFor: (
    lane: 'main' | 'collected',
    index: number,
    base?: number
  ) => number;
};

export type MainLaneDrawResult = {
  hoveredMain: number;
  mainHighlighted: boolean;
};

export function computeMainLaneHover(
  deps: TimelineSketchDeps,
  bounds: ContentBounds[],
  mouseWorld: { x: number; y: number },
  isFocusActive: boolean
): MainLaneDrawResult {
  let hoveredMain = -1;
  for (let index = deps.processed.length - 1; index >= 0; index--) {
    const b = bounds[index];
    if (
      mouseWorld.x >= b.left &&
      mouseWorld.x <= b.right &&
      mouseWorld.y >= b.top &&
      mouseWorld.y <= b.top + b.height
    ) {
      hoveredMain = index;
      break;
    }
  }

  let mainConnectorHover = false;
  if (hoveredMain === -1 && !isFocusActive) {
    for (let index = 0; index < deps.processed.length - 1; index++) {
      const line = getMainConnectorPoints(
        { x: bounds[index].right, y: bounds[index].centerY },
        { x: bounds[index + 1].left, y: bounds[index + 1].centerY }
      );
      if (
        distanceToPolyline(line, mouseWorld) <= CONNECTOR_HOVER_THRESHOLD
      ) {
        mainConnectorHover = true;
        break;
      }
    }
  }

  return {
    hoveredMain,
    mainHighlighted: hoveredMain !== -1 || mainConnectorHover,
  };
}

export function drawMainLaneConnectors(
  p: p5,
  deps: TimelineSketchDeps,
  ctx: MainLaneDrawContext,
  hover: MainLaneDrawResult
): void {
  const mainCtx = p.drawingContext as CanvasRenderingContext2D;
  const { bounds, lineWorldX } = ctx;

  for (let index = 0; index < deps.processed.length - 1; index++) {
    const connectorLoadAlpha =
      ctx.getMainConnectorLoadAlpha(index) * ctx.otherContentAlpha;
    if (connectorLoadAlpha <= LOAD_ALPHA_SNAP) {
      continue;
    }

    if (hover.mainHighlighted && !ctx.isFocusActive) {
      mainCtx.shadowBlur = 16;
      mainCtx.shadowColor = hexToRgba(
        MAIN_GLOW_COLOUR,
        0.55 * connectorLoadAlpha
      );
    }

    if (ctx.isTypeHighlightActive) {
      mainCtx.globalAlpha = getCombinedAlpha(connectorLoadAlpha, ctx.dimAlpha);
    } else {
      mainCtx.globalAlpha = connectorLoadAlpha;
    }

    drawMainConnector(
      p,
      { x: bounds[index].right, y: bounds[index].centerY },
      { x: bounds[index + 1].left, y: bounds[index + 1].centerY },
      isFutureDatedItem(deps.items[index]),
      isFutureDatedItem(deps.items[index + 1]),
      lineWorldX
    );
    resetCanvasEffects(mainCtx);
  }
}

export function drawMainLaneItems(
  p: p5,
  deps: TimelineSketchDeps,
  loadedImages: (p5.Image | null)[],
  ctx: MainLaneDrawContext,
  hover: MainLaneDrawResult
): void {
  const mainCtx = p.drawingContext as CanvasRenderingContext2D;
  const { bounds } = ctx;

  deps.processed.forEach((item, index) => {
    const imageLoadAlpha = ctx.getImageLoadAlpha(index);
    const visibilityAlpha = ctx.contentAlphaFor('main', index, imageLoadAlpha);
    if (visibilityAlpha <= LOAD_ALPHA_SNAP) {
      return;
    }

    const { left, top, width, height } = ctx.getDetailDrawBounds(
      'main',
      index,
      bounds[index]
    );
    const img = loadedImages[index];
    const typeMatch = matchesHighlightedType(
      item.contentType,
      ctx.highlightedType
    );
    const hideDateLabel =
      ctx.isFocusedTarget('main', index) &&
      ctx.isDetailLayoutActive &&
      deps.runtime.detailLayout > 0;

    if (ctx.isFocusActive && ctx.isFocusedTarget('main', index)) {
      mainCtx.shadowBlur = 22;
      mainCtx.shadowColor = hexToRgba(
        MAIN_GLOW_COLOUR,
        0.45 * visibilityAlpha
      );
    } else if (hover.mainHighlighted) {
      mainCtx.shadowBlur = 22;
      mainCtx.shadowColor = hexToRgba(
        MAIN_GLOW_COLOUR,
        0.45 * visibilityAlpha
      );
    } else if (typeMatch && ctx.isTypeHighlightActive) {
      mainCtx.shadowBlur = TYPE_HIGHLIGHT_BLUR * ctx.typeHighlightStrength;
      mainCtx.shadowColor = hexToRgba(
        getContentTypeColour(item.contentType),
        0.55 * ctx.typeHighlightStrength * visibilityAlpha
      );
    }

    if (ctx.isTypeHighlightActive && !typeMatch) {
      mainCtx.globalAlpha = getCombinedAlpha(visibilityAlpha, ctx.dimAlpha);
    } else {
      mainCtx.globalAlpha = visibilityAlpha;
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

    resetCanvasEffects(mainCtx);

    if (ctx.isTypeHighlightActive && !typeMatch) {
      drawDimOverlay(
        p,
        mainCtx,
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
        mainCtx.globalAlpha = getCombinedAlpha(visibilityAlpha, ctx.dimAlpha);
      } else {
        mainCtx.globalAlpha = visibilityAlpha;
      }
      p.text(item.dateLabel, left + width / 2, top + height + 12);
      resetCanvasEffects(mainCtx);
    }
  });
}

export function drawMainLaneConnectorDots(
  p: p5,
  ctx: MainLaneDrawContext,
  hover: MainLaneDrawResult
): void {
  const mainCtx = p.drawingContext as CanvasRenderingContext2D;
  const { bounds } = ctx;

  for (let index = 0; index < bounds.length - 1; index++) {
    const connectorLoadAlpha =
      ctx.getMainConnectorLoadAlpha(index) * ctx.otherContentAlpha;
    if (connectorLoadAlpha <= LOAD_ALPHA_SNAP) {
      continue;
    }

    if (hover.mainHighlighted && !ctx.isFocusActive) {
      mainCtx.shadowBlur = 16;
      mainCtx.shadowColor = hexToRgba(
        MAIN_GLOW_COLOUR,
        0.55 * connectorLoadAlpha
      );
    }
    if (ctx.isTypeHighlightActive) {
      mainCtx.globalAlpha = getCombinedAlpha(connectorLoadAlpha, ctx.dimAlpha);
    } else {
      mainCtx.globalAlpha = connectorLoadAlpha;
    }
    drawDot(p, bounds[index].right, bounds[index].centerY, '#111111');
    drawDot(p, bounds[index + 1].left, bounds[index + 1].centerY, '#111111');
    resetCanvasEffects(mainCtx);
  }
}

export function createMainLaneDrawHelpers(
  deps: TimelineSketchDeps,
  p: p5
) {
  const { runtime } = deps;

  const isFocusedTarget = (lane: 'main' | 'collected', index: number) =>
    runtime.focusTarget?.lane === lane && runtime.focusTarget.index === index;

  const getDetailDrawBounds = (
    lane: 'main' | 'collected',
    index: number,
    itemBounds: ContentBounds
  ) => {
    if (!isFocusedTarget(lane, index) || runtime.detailLayout <= 0) {
      return itemBounds;
    }
    return {
      ...itemBounds,
      ...applyDetailLayoutTransform(
        itemBounds,
        runtime.detailLayout,
        runtime.zoom,
        p.width,
        runtime.cameraX
      ),
    };
  };

  return { isFocusedTarget, getDetailDrawBounds };
}
