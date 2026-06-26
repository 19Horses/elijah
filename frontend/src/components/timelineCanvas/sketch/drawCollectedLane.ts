import type p5 from 'p5';
import { getContentTypeColour } from '../../../constants/contentTypes';
import {
  drawDimOverlay,
  getCombinedAlpha,
  hexToRgba,
  matchesHighlightedType,
  mixHex,
  resetCanvasEffects,
} from '../canvasEffects';
import {
  BRANCH_DIM_COLOUR,
  CONNECTOR_HOVER_THRESHOLD,
  LOAD_ALPHA_SNAP,
  TYPE_HIGHLIGHT_BLUR,
} from '../constants';
import {
  distanceToPolyline,
  drawBranchConnector,
  drawDot,
  getBranchPoints,
  getSteppedBranchPoints,
} from '../connectors';
import type {
  CollectedSource,
  ContentBounds,
  TimelineRuntime,
  TimelineSketchDeps,
} from '../types';
import type { BoundsContext } from './bounds';
import { drawAudioDisc } from './drawAudioDisc';
import {
  drawContainedImage,
  drawGalleryControls,
  drawGalleryStrip,
  galleryFocusWidth,
} from './drawGalleryControls';
import type { GalleryController } from './galleryController';
import { drawPlayPauseButton } from './drawPlayPauseButton';
import type { MainLaneDrawContext } from './drawMainLane';

export type CollectedLaneDrawResult = {
  hoveredCollected: number;
  hoveredCollectedIsImage: boolean;
  hoveredUserRow: number | null;
};

// A source's branch colour, eased toward grey while another branch is hovered.
function branchSourceColour(
  runtime: TimelineRuntime,
  source: CollectedSource
): string {
  const t =
    source.rowIndex === runtime.branchDimRow ? 0 : runtime.branchDimStrength;
  return t > 0 ? mixHex(source.colour, BRANCH_DIM_COLOUR, t) : source.colour;
}

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
      for (
        let sourceIndex = 0;
        sourceIndex < item.sources.length;
        sourceIndex++
      ) {
        const segments = boundsCtx.getSourceBranchSegments(
          index,
          sourceIndex,
          mainBounds,
          collectedBounds
        );
        const hit = segments.some(({ from, to, stepped }) => {
          const points = stepped
            ? getSteppedBranchPoints(from, to)
            : getBranchPoints(from, to);
          return distanceToPolyline(points, mouseWorld) <= CONNECTOR_HOVER_THRESHOLD;
        });
        if (hit) {
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
    // Branching lines stay visible during focus, so they ignore the focus fade.
    const connectorLoadAlpha = ctx.getCollectedConnectorLoadAlpha(index);

    if (connectorLoadAlpha <= LOAD_ALPHA_SNAP) {
      return;
    }

    // While one collector's branch is hovered, the others ease to grey.
    const hoveringBranch =
      hover.hoveredUserRow !== null && !hover.hoveredCollectedIsImage;

    item.sources.forEach((source, sourceIndex) => {
      const isUserHovered =
        hoveringBranch && source.rowIndex === hover.hoveredUserRow;
      const branchColour = branchSourceColour(deps.runtime, source);
      const segments = boundsCtx.getSourceBranchSegments(
        index,
        sourceIndex,
        mainBounds,
        collectedBounds
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

      segments.forEach(({ from, to, stepped }) =>
        drawBranchConnector(p, from, to, branchColour, stepped)
      );
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

    // Selected image asset with multiple images: show every image in a strip
    // the arrows slide through.
    const galleryActive =
      item.contentType === 'imageAsset' &&
      ctx.isFocusActive &&
      ctx.isFocusedTarget('collected', index) &&
      item.galleryUrls.length > 1;
    let galleryImages: (p5.Image | null)[] | null = null;
    if (galleryActive) {
      gallery.ensureLoaded(item.galleryUrls);
      galleryImages = item.galleryUrls.map((url) => gallery.getImage(url));
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
      // Selected image: no glow.
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

    if (galleryActive && galleryImages) {
      drawGalleryStrip(
        p,
        { left: imageLeft, top, width, height },
        galleryImages,
        gallery.getDisplayIndex()
      );
    } else if (img) {
      // Contain (not fill) so the full image shows without cropping when its
      // true aspect ratio differs from the slot's.
      drawContainedImage(p, img, { left: imageLeft, top, width, height });
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
      p.fill(255);
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

    // Gallery navigation arrows + dots, spanning the focused image's width.
    if (galleryActive && galleryImages) {
      const arrowWidth = galleryFocusWidth(
        galleryImages,
        gallery.getDisplayIndex(),
        width,
        height
      );
      const regions = drawGalleryControls(
        p,
        collectedCtx,
        { left: imageLeft, top, width: arrowWidth, height },
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
    // Branching lines stay visible during focus, so they ignore the focus fade.
    const connectorLoadAlpha = ctx.getCollectedConnectorLoadAlpha(index);

    if (connectorLoadAlpha <= LOAD_ALPHA_SNAP) {
      return;
    }

    item.sources.forEach((source, sourceIndex) => {
      const isUserHovered =
        hover.hoveredUserRow !== null &&
        !hover.hoveredCollectedIsImage &&
        source.rowIndex === hover.hoveredUserRow;
      const branchColour = branchSourceColour(deps.runtime, source);
      const segments = boundsCtx.getSourceBranchSegments(
        index,
        sourceIndex,
        mainBounds,
        collectedBounds
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
      segments.forEach(({ from, to }) => {
        drawDot(p, from.x, from.y, branchColour);
        drawDot(p, to.x, to.y, branchColour);
      });
      resetCanvasEffects(collectedCtx);
    });
  });
}
