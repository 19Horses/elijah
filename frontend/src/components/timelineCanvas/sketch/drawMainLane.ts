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
import { drawAudioDisc } from './drawAudioDisc';
import {
  drawContainedImage,
  drawGalleryControls,
} from './drawGalleryControls';
import type { GalleryController } from './galleryController';
import { drawPlayPauseButton } from './drawPlayPauseButton';
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
  mainConnectorHover: boolean;
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
      if (distanceToPolyline(line, mouseWorld) <= CONNECTOR_HOVER_THRESHOLD) {
        mainConnectorHover = true;
        break;
      }
    }
  }

  return {
    hoveredMain,
    mainConnectorHover,
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

    if (hover.mainConnectorHover && !ctx.isFocusActive) {
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
  hover: MainLaneDrawResult,
  cdImage: p5.Image | null,
  gallery: GalleryController
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

    // Selected audio track: slide the image left and the spinning CD right,
    // like it's being pulled out of a sleeve. `detailLayout` drives the reveal.
    const isAudioFocused =
      item.contentType === 'audioAsset' &&
      ctx.isFocusActive &&
      ctx.isFocusedTarget('main', index);
    const audioReveal = isAudioFocused ? deps.runtime.detailLayout : 0;
    const imageLeft = left - audioReveal * height * 0.15;

    // Selected image asset with multiple images: show the active gallery image.
    const galleryActive =
      item.contentType === 'imageAsset' &&
      ctx.isFocusActive &&
      ctx.isFocusedTarget('main', index) &&
      item.galleryUrls.length > 1;
    let galleryImg: p5.Image | null = null;
    if (galleryActive) {
      gallery.ensureLoaded(item.galleryUrls);
      const activeIndex = Math.min(
        gallery.getActiveIndex(),
        item.galleryUrls.length - 1
      );
      galleryImg = gallery.getImage(item.galleryUrls[activeIndex]);
    }

    if (audioReveal > 0) {
      drawAudioDisc(
        p,
        mainCtx,
        { left, top, width, height },
        deps.backgroundColour,
        visibilityAlpha,
        cdImage,
        audioReveal
      );
    }

    if (ctx.isFocusActive && ctx.isFocusedTarget('main', index)) {
      mainCtx.shadowBlur = 22;
      mainCtx.shadowColor = hexToRgba(MAIN_GLOW_COLOUR, 0.45 * visibilityAlpha);
    } else if (hover.hoveredMain === index || hover.mainConnectorHover) {
      mainCtx.shadowBlur = 22;
      mainCtx.shadowColor = hexToRgba(MAIN_GLOW_COLOUR, 0.45 * visibilityAlpha);
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

    if (galleryActive && galleryImg) {
      drawContainedImage(p, galleryImg, {
        left: imageLeft,
        top,
        width,
        height,
      });
    } else if (img) {
      p.image(img, imageLeft, top, width, height);
    } else {
      p.fill(245);
      p.stroke(220);
      p.rect(imageLeft, top, width, height);

      if (!item.imageUrl) {
        p.fill(120);
        p.noStroke();
        p.textAlign(p.CENTER, p.CENTER);
        p.text(item.title, imageLeft + width / 2, top + height / 2);
      }
    }

    resetCanvasEffects(mainCtx);

    if (ctx.isTypeHighlightActive && !typeMatch) {
      drawDimOverlay(
        p,
        mainCtx,
        imageLeft,
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
      p.text(item.dateLabel, imageLeft + width / 2, top + height + 12);
      resetCanvasEffects(mainCtx);
    }

    // Play/pause control on top of the selected audio track's image.
    if (isAudioFocused && item.audioUrl) {
      const buttonR = Math.min(width, height) * 0.13;
      const buttonCx = imageLeft + width / 2;
      const buttonCy = top + height / 2;
      drawPlayPauseButton(
        p,
        mainCtx,
        buttonCx,
        buttonCy,
        buttonR,
        deps.audio.isPlaying(item.audioUrl),
        visibilityAlpha
      );
      deps.audio.setButtonRegion({
        cx: buttonCx,
        cy: buttonCy,
        r: buttonR,
        src: item.audioUrl,
      });
    }

    // Gallery navigation arrows + dots on the selected image.
    if (galleryActive) {
      const regions = drawGalleryControls(
        p,
        mainCtx,
        { left: imageLeft, top, width, height },
        gallery.getActiveIndex(),
        item.galleryUrls.length,
        visibilityAlpha
      );
      gallery.setNavRegions(regions);
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

    if (hover.mainConnectorHover && !ctx.isFocusActive) {
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

export function createMainLaneDrawHelpers(deps: TimelineSketchDeps, p: p5) {
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
