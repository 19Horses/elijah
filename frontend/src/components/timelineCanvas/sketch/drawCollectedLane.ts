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
  BRANCH_DIM_ITEM_ALPHA,
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
  ConnectorPoint,
  ContentBounds,
  TimelineRuntime,
  TimelineSketchDeps,
} from '../types';
import type { BoundsContext } from './bounds';
import { AUDIO_DISC_SPIN_SPEED, drawAudioDisc } from './drawAudioDisc';
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

// Slide a branch endpoint out to the revealing CD's right edge when it sits on
// the focused audio item's right edge; otherwise leave it untouched.
function shiftAudioNode(
  pt: ConnectorPoint,
  ctx: MainLaneDrawContext
): ConnectorPoint {
  return ctx.audioNodeX !== null && Math.abs(pt.x - ctx.audioNodeX) < 0.5
    ? { x: pt.x + ctx.audioNodeShift, y: pt.y }
    : pt;
}

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
        collectedCtx.globalAlpha =
          getCombinedAlpha(connectorLoadAlpha, ctx.dimAlpha) *
          ctx.isolateOtherAlpha;
      } else {
        collectedCtx.globalAlpha = connectorLoadAlpha * ctx.isolateOtherAlpha;
      }

      segments.forEach(({ from, to, stepped }) =>
        drawBranchConnector(
          p,
          shiftAudioNode(from, ctx),
          shiftAudioNode(to, ctx),
          branchColour,
          stepped
        )
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

    // Items not in the hovered/zoomed branch's timeline fade toward grey. The
    // eased branchDimStrength drives the transition in and back out.
    const branchDimT =
      deps.runtime.branchDimRow !== null &&
      deps.runtime.branchDimStrength > 0 &&
      !item.sources.some(
        (source) => source.rowIndex === deps.runtime.branchDimRow
      )
        ? deps.runtime.branchDimStrength
        : 0;
    const branchDimAlpha = 1 - branchDimT * (1 - BRANCH_DIM_ITEM_ALPHA);

    // Selected audio track: the image stays put while the spinning CD slides
    // out to the right from behind it. `detailLayout` drives the reveal.
    const isAudioFocused =
      item.contentType === 'audioAsset' &&
      ctx.isFocusActive &&
      ctx.isFocusedTarget('collected', index);
    const audioReveal = isAudioFocused ? deps.runtime.detailLayout : 0;
    const imageLeft = left;

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
      // Only spin the disc while its track is actually playing; hold the angle
      // otherwise so it freezes in place rather than snapping back.
      if (item.audioUrl && deps.audio.isPlaying(item.audioUrl)) {
        deps.runtime.audioDiscAngle += p.deltaTime * AUDIO_DISC_SPIN_SPEED;
      }
      drawAudioDisc(
        p,
        collectedCtx,
        { left, top, width, height },
        deps.backgroundColour,
        visibilityAlpha,
        cdImage,
        audioReveal,
        deps.runtime.audioDiscAngle
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

    // Audio tracks get a drop shadow so the image reads as lifted off the disc.
    if (item.contentType === 'audioAsset') {
      collectedCtx.shadowColor = hexToRgba('#000000', 0.35 * visibilityAlpha);
      collectedCtx.shadowBlur = 18;
      collectedCtx.shadowOffsetY = 8;
    }

    if (ctx.isTypeHighlightActive && !typeMatch) {
      collectedCtx.globalAlpha =
        getCombinedAlpha(visibilityAlpha, ctx.dimAlpha) * branchDimAlpha;
    } else {
      collectedCtx.globalAlpha = visibilityAlpha * branchDimAlpha;
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

    // White border on every item except the selected (focused) one.
    if (!(ctx.isFocusActive && ctx.isFocusedTarget('collected', index))) {
      collectedCtx.globalAlpha =
        (ctx.isTypeHighlightActive && !typeMatch
          ? getCombinedAlpha(visibilityAlpha, ctx.dimAlpha)
          : visibilityAlpha) * branchDimAlpha;
      p.noFill();
      p.stroke(255);
      p.strokeWeight(1);
      p.rect(imageLeft, top, width, height);
      resetCanvasEffects(collectedCtx);
    }

    if (!hideDateLabel) {
      // Deferred so dates render above the connectors/nodes. Items past the
      // today separator sit on the grey gradient, so their date reads black.
      ctx.dateLabels.push({
        x: imageLeft + width / 2,
        y: top - 12,
        text: item.dateLabel,
        colour: item.anchorTime > Date.now() ? 0 : 255,
        alpha:
          (ctx.isTypeHighlightActive && !typeMatch
            ? getCombinedAlpha(visibilityAlpha, ctx.dimAlpha)
            : visibilityAlpha) * branchDimAlpha,
      });
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
        collectedCtx.globalAlpha =
          getCombinedAlpha(connectorLoadAlpha, ctx.dimAlpha) *
          ctx.isolateOtherAlpha;
      } else {
        collectedCtx.globalAlpha = connectorLoadAlpha * ctx.isolateOtherAlpha;
      }
      segments.forEach(
        ({
          from,
          to,
          fromItemTitle,
          toItemTitle,
          fromItemTarget,
          toItemTarget,
        }) => {
          const sFrom = shiftAudioNode(from, ctx);
          const sTo = shiftAudioNode(to, ctx);
          drawDot(p, sFrom.x, sFrom.y, branchColour);
          drawDot(p, sTo.x, sTo.y, branchColour);
          if (ctx.isFocusActive) {
            // The `from` dot connects along the line to the item at `to`; the
            // `to` dot connects back to the item at `from`.
            if (toItemTitle && toItemTarget) {
              ctx.nodeRegions.push({
                x: sFrom.x,
                y: sFrom.y,
                title: toItemTitle,
                timeline: source.username,
                colour: source.colour,
                target: toItemTarget,
              });
            }
            if (fromItemTitle && fromItemTarget) {
              ctx.nodeRegions.push({
                x: sTo.x,
                y: sTo.y,
                title: fromItemTitle,
                timeline: source.username,
                colour: source.colour,
                target: fromItemTarget,
              });
            }
          }
        }
      );
      resetCanvasEffects(collectedCtx);
    });
  });
}
