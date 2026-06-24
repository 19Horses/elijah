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
import { drawAudioDisc } from './drawAudioDisc';
import {
  drawContainedImage,
  drawGalleryControls,
} from './drawGalleryControls';
import type { GalleryController } from './galleryController';
import { drawPlayPauseButton } from './drawPlayPauseButton';
import type { MainLaneDrawContext } from './drawMainLane';

export type CollectedLaneDrawResult = {
  hoveredCollected: number;
  hoveredCollectedIsImage: boolean;
  hoveredUserRow: number | null;
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
  let hoveredUserRow: number | null = null;

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
          hoveredUserRow = item.sources[sourceIndex].rowIndex;
          break;
        }
      }
      if (hoveredCollected !== -1) {
        break;
      }
    }
  }

  return { hoveredCollected, hoveredCollectedIsImage, hoveredUserRow };
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
    const connectorLoadAlpha =
      ctx.getCollectedConnectorLoadAlpha(index) * ctx.otherContentAlpha;

    if (connectorLoadAlpha <= LOAD_ALPHA_SNAP) {
      return;
    }

    item.sources.forEach((source, sourceIndex) => {
      const isUserHovered =
        hover.hoveredUserRow !== null &&
        source.rowIndex === hover.hoveredUserRow &&
        !hover.hoveredCollectedIsImage;
      const { from: fromPoint, to: toPoint } =
        boundsCtx.getBranchEndpointsForSource(
          item.anchorTime,
          itemBounds,
          mainBounds,
          sourceIndex,
          item.sources.length
        );

      if (isUserHovered && !ctx.isFocusActive) {
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
  hover: CollectedLaneDrawResult,
  cdImage: p5.Image | null,
  gallery: GalleryController
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
    const typeMatch = matchesHighlightedType(
      item.contentType,
      ctx.highlightedType
    );
    const hideDateLabel =
      ctx.isFocusedTarget('collected', index) &&
      ctx.isDetailLayoutActive &&
      deps.runtime.detailLayout > 0;

    const hoveredUserSource =
      hover.hoveredUserRow !== null && !hover.hoveredCollectedIsImage
        ? item.sources.find(
            (source) => source.rowIndex === hover.hoveredUserRow
          )
        : undefined;

    // Selected audio track: slide the image left and the spinning CD right,
    // like it's being pulled out of a sleeve. `detailLayout` drives the reveal.
    const isAudioFocused =
      item.contentType === 'audioAsset' &&
      ctx.isFocusActive &&
      ctx.isFocusedTarget('collected', index);
    const audioReveal = isAudioFocused ? deps.runtime.detailLayout : 0;
    const imageLeft = left - audioReveal * height * 0.15;

    // Selected image asset with multiple images: show the active gallery image.
    const galleryActive =
      item.contentType === 'imageAsset' &&
      ctx.isFocusActive &&
      ctx.isFocusedTarget('collected', index) &&
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
        collectedCtx,
        { left, top, width, height },
        deps.backgroundColour,
        visibilityAlpha,
        cdImage,
        audioReveal
      );
    }

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
    } else if (hoveredUserSource) {
      collectedCtx.shadowBlur = 22;
      collectedCtx.shadowColor = hexToRgba(
        hoveredUserSource.colour,
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

    resetCanvasEffects(collectedCtx);

    if (ctx.isTypeHighlightActive && !typeMatch) {
      drawDimOverlay(
        p,
        collectedCtx,
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
        collectedCtx.globalAlpha = getCombinedAlpha(
          visibilityAlpha,
          ctx.dimAlpha
        );
      } else {
        collectedCtx.globalAlpha = visibilityAlpha;
      }
      p.text(item.dateLabel, imageLeft + width / 2, top + height + 12);
      resetCanvasEffects(collectedCtx);
    }

    // Play/pause control on top of the selected audio track's image.
    if (isAudioFocused && item.audioUrl) {
      const buttonR = Math.min(width, height) * 0.13;
      const buttonCx = imageLeft + width / 2;
      const buttonCy = top + height / 2;
      drawPlayPauseButton(
        p,
        collectedCtx,
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
        collectedCtx,
        { left: imageLeft, top, width, height },
        gallery.getActiveIndex(),
        item.galleryUrls.length,
        visibilityAlpha
      );
      gallery.setNavRegions(regions);
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
    const connectorLoadAlpha =
      ctx.getCollectedConnectorLoadAlpha(index) * ctx.otherContentAlpha;

    if (connectorLoadAlpha <= LOAD_ALPHA_SNAP) {
      return;
    }

    item.sources.forEach((source, sourceIndex) => {
      const isUserHovered =
        hover.hoveredUserRow !== null &&
        source.rowIndex === hover.hoveredUserRow &&
        !hover.hoveredCollectedIsImage;
      const { from: fromPoint, to: toPoint } =
        boundsCtx.getBranchEndpointsForSource(
          item.anchorTime,
          itemBounds,
          mainBounds,
          sourceIndex,
          item.sources.length
        );
      if (isUserHovered && !ctx.isFocusActive) {
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
