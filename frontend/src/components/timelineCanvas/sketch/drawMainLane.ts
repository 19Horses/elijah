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
  CONNECTOR_HOVER_THRESHOLD,
  LOAD_ALPHA_SNAP,
  MAIN_GLOW_CENTER_LIGHTEN,
  MAIN_GLOW_COLOUR,
  MAIN_GLOW_STRIP_LENGTH,
  MAIN_GLOW_STRIP_WIDTH,
  MAIN_GLOW_TRAVEL_BLUR,
  MAIN_GLOW_TRAVEL_MS,
  MAIN_LINE_Y,
  MAIN_USERNAME,
  TYPE_HIGHLIGHT_BLUR,
} from '../constants';
import {
  distanceToPolyline,
  drawDot,
  drawMainConnector,
  getMainConnectorPoints,
} from '../connectors';
import { AUDIO_DISC_SPIN_SPEED, drawAudioDisc } from './drawAudioDisc';
import {
  drawContainedImage,
  drawGalleryControls,
  drawGalleryStrip,
  galleryFocusWidth,
} from './drawGalleryControls';
import type { GalleryController } from './galleryController';
import { drawPlayPauseButton } from './drawPlayPauseButton';
import { isFutureDatedItem } from '../timelineRuntime';
import type { ContentType } from '../../../types/content';
import type {
  ConnectorPoint,
  ContentBounds,
  NodeHoverRegion,
  TimelineSketchDeps,
} from '../types';
import type { BoundsContext } from './bounds';

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
  // Alpha multiplier dimming main connectors the active branch doesn't travel.
  mainConnectorTravelAlpha: (connectorIndex: number) => number;
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
  // Connector dots registered this frame while an item is focused, so a hovered
  // node can be labelled with its timeline and the item it connects to.
  nodeRegions: NodeHoverRegion[];
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

function polylineLength(points: ConnectorPoint[]): number {
  let length = 0;
  for (let i = 0; i < points.length - 1; i++) {
    length += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
  }
  return length;
}

// The portion of the polyline between two arc-length distances, with the
// endpoints interpolated so the strip has exact, smooth ends.
function extractSubPath(
  points: ConnectorPoint[],
  fromDist: number,
  toDist: number
): ConnectorPoint[] {
  const result: ConnectorPoint[] = [];
  let acc = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (seg <= 0) {
      continue;
    }
    const segStart = acc;
    const segEnd = acc + seg;
    acc = segEnd;
    if (segEnd < fromDist || segStart > toDist) {
      continue;
    }
    const t0 = Math.max(0, (fromDist - segStart) / seg);
    const t1 = Math.min(1, (toDist - segStart) / seg);
    if (result.length === 0) {
      result.push({ x: a.x + (b.x - a.x) * t0, y: a.y + (b.y - a.y) * t0 });
    }
    result.push({ x: a.x + (b.x - a.x) * t1, y: a.y + (b.y - a.y) * t1 });
  }
  return result;
}

// A glow that continuously travels along the logged-in viewer's own branch
// (or the main lane if they don't have one), looping from start to end.
export function drawMainTimelineGlow(
  p: p5,
  deps: TimelineSketchDeps,
  boundsCtx: BoundsContext,
  mainBounds: ContentBounds[],
  collectedBounds: ContentBounds[]
): void {
  const { processedCollected, currentUsername, runtime } = deps;

  let path: ConnectorPoint[] | null = null;
  let glowColour = MAIN_GLOW_COLOUR;

  // Trace the hovered branch if one is active, otherwise the logged-in
  // viewer's own branch. Only ever one strip.
  let rowIndex = runtime.branchDimRow ?? -1;
  if (rowIndex < 0 && currentUsername && currentUsername !== MAIN_USERNAME) {
    for (const item of processedCollected) {
      const source = item.sources.find((s) => s.username === currentUsername);
      if (source) {
        rowIndex = source.rowIndex;
        break;
      }
    }
  }

  if (rowIndex >= 0) {
    for (const item of processedCollected) {
      const source = item.sources.find((s) => s.rowIndex === rowIndex);
      if (source) {
        glowColour = source.colour;
        break;
      }
    }
    const rowPath = boundsCtx.getUserTimelinePath(
      rowIndex,
      mainBounds,
      collectedBounds
    );
    if (rowPath.length >= 2) {
      path = rowPath;
    }
  }

  // Fallback: trace the main lane horizontally.
  if (!path) {
    glowColour = MAIN_GLOW_COLOUR;
    if (mainBounds.length === 0) {
      return;
    }
    const startX = mainBounds[0].left;
    const endX = mainBounds[mainBounds.length - 1].right;
    if (endX <= startX) {
      return;
    }
    path = [
      { x: startX, y: MAIN_LINE_Y },
      { x: endX, y: MAIN_LINE_Y },
    ];
  }

  const total = polylineLength(path);
  if (total <= 0) {
    return;
  }
  const t = (p.millis() % MAIN_GLOW_TRAVEL_MS) / MAIN_GLOW_TRAVEL_MS;
  // A bright strip of the line travels along the path, like a pulse in a wire.
  // The head runs from before the start to past the end so it eases in and out.
  const headDist =
    t * (total + 2 * MAIN_GLOW_STRIP_LENGTH) - MAIN_GLOW_STRIP_LENGTH;
  const strip = extractSubPath(
    path,
    Math.max(0, headDist - MAIN_GLOW_STRIP_LENGTH),
    Math.min(total, headDist)
  );
  if (strip.length < 2) {
    return;
  }

  const ctx = p.drawingContext as CanvasRenderingContext2D;
  ctx.save();
  // Clip the travelling strip (and its glow) out of every item image, so the
  // pulse only shows in the gaps between items and is hidden behind the images
  // rather than drawn on top of them. Even-odd: a huge outer rect minus a hole
  // per image. Rects are in world coords, matching the active camera transform.
  ctx.beginPath();
  ctx.rect(-1e6, -1e6, 2e6, 2e6);
  for (const b of [...mainBounds, ...collectedBounds]) {
    ctx.rect(b.left, b.top, b.width, b.height);
  }
  ctx.clip('evenodd');
  ctx.shadowBlur = MAIN_GLOW_TRAVEL_BLUR;
  ctx.shadowColor = glowColour;
  p.noFill();
  p.strokeWeight(MAIN_GLOW_STRIP_WIDTH);
  p.strokeCap(p.ROUND);
  // Gradient along the strip: base colour at the ends, lightened in the centre.
  const segments = strip.length - 1;
  for (let i = 0; i < segments; i++) {
    const frac = (i + 0.5) / segments;
    const centre = 1 - Math.abs(frac - 0.5) * 2;
    p.stroke(mixHex(glowColour, '#ffffff', centre * MAIN_GLOW_CENTER_LIGHTEN));
    p.line(strip[i].x, strip[i].y, strip[i + 1].x, strip[i + 1].y);
  }
  ctx.restore();
}

export function drawMainLaneConnectors(
  p: p5,
  deps: TimelineSketchDeps,
  ctx: MainLaneDrawContext,
  hover: MainLaneDrawResult
): void {
  const mainCtx = p.drawingContext as CanvasRenderingContext2D;
  const { bounds } = ctx;

  for (let index = 0; index < deps.processed.length - 1; index++) {
    // Timeline lines stay visible during focus, so they ignore the focus fade.
    const connectorLoadAlpha = ctx.getMainConnectorLoadAlpha(index);
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

    const travelAlpha = ctx.mainConnectorTravelAlpha(index);
    if (ctx.isTypeHighlightActive) {
      mainCtx.globalAlpha =
        getCombinedAlpha(connectorLoadAlpha, ctx.dimAlpha) * travelAlpha;
    } else {
      mainCtx.globalAlpha = connectorLoadAlpha * travelAlpha;
    }

    // Focused item's endpoint follows its image to the detail position.
    const fromBounds = ctx.getDetailDrawBounds('main', index, bounds[index]);
    const toBounds = ctx.getDetailDrawBounds('main', index + 1, bounds[index + 1]);
    drawMainConnector(
      p,
      { x: fromBounds.right, y: fromBounds.centerY },
      { x: toBounds.left, y: toBounds.centerY },
      isFutureDatedItem(deps.items[index]),
      isFutureDatedItem(deps.items[index + 1])
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

    // Selected audio track: the image stays put while the spinning CD slides
    // out to the right from behind it. `detailLayout` drives the reveal.
    const isAudioFocused =
      item.contentType === 'audioAsset' &&
      ctx.isFocusActive &&
      ctx.isFocusedTarget('main', index);
    const audioReveal = isAudioFocused ? deps.runtime.detailLayout : 0;
    const imageLeft = left;

    // Selected image asset with multiple images: show every image in a strip
    // the arrows slide through.
    const galleryActive =
      item.contentType === 'imageAsset' &&
      ctx.isFocusActive &&
      ctx.isFocusedTarget('main', index) &&
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
        mainCtx,
        { left, top, width, height },
        deps.backgroundColour,
        visibilityAlpha,
        cdImage,
        audioReveal,
        deps.runtime.audioDiscAngle
      );
    }

    if (ctx.isFocusActive && ctx.isFocusedTarget('main', index)) {
      // Selected image: no glow.
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
      // Items past the today separator sit on the white gradient, so their date
      // reads black instead of white.
      p.fill(isFutureDatedItem(deps.items[index]) ? 0 : 255);
      p.noStroke();
      p.textAlign(p.CENTER, p.BOTTOM);
      if (ctx.isTypeHighlightActive && !typeMatch) {
        mainCtx.globalAlpha = getCombinedAlpha(visibilityAlpha, ctx.dimAlpha);
      } else {
        mainCtx.globalAlpha = visibilityAlpha;
      }
      p.text(item.dateLabel, imageLeft + width / 2, top - 12);
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
        mainCtx,
        { left: imageLeft, top, width: arrowWidth, height },
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
  deps: TimelineSketchDeps,
  ctx: MainLaneDrawContext,
  hover: MainLaneDrawResult
): void {
  const mainCtx = p.drawingContext as CanvasRenderingContext2D;
  const { bounds } = ctx;

  for (let index = 0; index < bounds.length - 1; index++) {
    // Timeline dots stay visible during focus, so they ignore the focus fade.
    const connectorLoadAlpha = ctx.getMainConnectorLoadAlpha(index);
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
    const travelAlpha = ctx.mainConnectorTravelAlpha(index);
    if (ctx.isTypeHighlightActive) {
      mainCtx.globalAlpha =
        getCombinedAlpha(connectorLoadAlpha, ctx.dimAlpha) * travelAlpha;
    } else {
      mainCtx.globalAlpha = connectorLoadAlpha * travelAlpha;
    }
    const fromBounds = ctx.getDetailDrawBounds('main', index, bounds[index]);
    const toBounds = ctx.getDetailDrawBounds('main', index + 1, bounds[index + 1]);
    drawDot(p, fromBounds.right, fromBounds.centerY, '#ffffff');
    drawDot(p, toBounds.left, toBounds.centerY, '#ffffff');
    if (ctx.isFocusActive) {
      // The dot on item `index` connects rightward to item `index + 1`, and the
      // dot on item `index + 1` connects leftward to item `index`.
      ctx.nodeRegions.push({
        x: fromBounds.right,
        y: fromBounds.centerY,
        title: deps.processed[index + 1].title,
        timeline: MAIN_USERNAME,
        colour: MAIN_GLOW_COLOUR,
        target: { lane: 'main', index: index + 1 },
      });
      ctx.nodeRegions.push({
        x: toBounds.left,
        y: toBounds.centerY,
        title: deps.processed[index].title,
        timeline: MAIN_USERNAME,
        colour: MAIN_GLOW_COLOUR,
        target: { lane: 'main', index },
      });
    }
    resetCanvasEffects(mainCtx);
  }
}

export function createMainLaneDrawHelpers(deps: TimelineSketchDeps) {
  const { runtime } = deps;

  const isFocusedTarget = (lane: 'main' | 'collected', index: number) =>
    runtime.focusTarget?.lane === lane && runtime.focusTarget.index === index;

  // The focused image stays at its world bounds — the camera frames it at the
  // detail position — so the draw bounds are just the item's own bounds.
  const getDetailDrawBounds = (
    lane: 'main' | 'collected',
    index: number,
    itemBounds: ContentBounds
  ) => itemBounds;

  return { isFocusedTarget, getDetailDrawBounds };
}
