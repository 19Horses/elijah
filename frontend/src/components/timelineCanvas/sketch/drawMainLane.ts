import type { ItemViewer } from '../../../services/presence';
import type { ItemCollector } from '../processItems';
import type p5 from 'p5';
import type { CollectedBy, LabelRect } from '../labels';
import { formatFullDate } from '../../../utils/formatDate';
import { getContentTypeColour } from '../../../constants/contentTypes';
import {
  applyItemHalo,
  drawBackgroundFade,
  drawDimOverlay,
  drawPrivateOverlay,
  getCombinedAlpha,
  hexToRgba,
  matchesHighlightedType,
  mixHex,
  resetCanvasEffects,
} from '../canvasEffects';
import {
  BRANCH_DIM_ITEM_ALPHA,
  CANVAS_LABEL_FONT,
  CANVAS_LABEL_FONT_MEDIUM,
  CONNECTOR_HOVER_THRESHOLD_PX,
  DATE_LABEL_COLOUR,
  DOT_RADIUS,
  ITEM_LABEL_LETTER_SPACING,
  ITEM_LABEL_LINE_HEIGHT,
  ITEM_WIDTH,
  LOAD_ALPHA_SNAP,
  MAIN_GLOW_CENTER_LIGHTEN,
  MAIN_GLOW_COLOUR,
  MAIN_GLOW_STRIP_LENGTH,
  MAIN_GLOW_STRIP_WIDTH,
  MAIN_GLOW_TRAVEL_BLUR,
  MAIN_GLOW_TRAVEL_MS,
  MAIN_LINE_COLOUR,
  MAIN_USERNAME,
  ITEM_LABEL_COLOUR,
  ITEM_LABEL_SCALE,
  PREVIEW_DATE_SCALE,
  PRIVATE_IMAGE_EFFECT,
  TYPE_HIGHLIGHT_BLUR,
  VIEWER_DOT_GAP_PX,
  VIEWER_DOT_INSET_PX,
  VIEWER_DOT_RADIUS_PX,
  VIEWER_DOT_RING_PX,
} from '../constants';
import {
  distanceToPolyline,
  drawDot,
  drawMainConnector,
  extractSubPath,
  getMainConnectorPoints,
  polylineLength,
} from '../connectors';
import { getContentTypeIconCanvas } from '../contentTypeIcons';
import { connectorWeight } from '../geometry';
import {
  drawContainedImage,
  drawGalleryControls,
  drawGalleryStrip,
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
import {
  drawEdgeNodeStub,
  edgeNodeDotScale,
  edgeNodeHoleRatio,
  edgeNodePosition,
  edgeNodeRunOn,
  mainEdgeNodeKey,
  type EdgeNodeLayout,
} from './edgeNodes';

export type MainLaneDrawContext = {
  bounds: ContentBounds[];
  lineWorldX: number;
  mouseWorld: { x: number; y: number };
  highlightedType: ContentType | null;
  typeHighlightStrength: number;
  isTypeHighlightActive: boolean;
  highlightedMainContentId: string | null;
  dimAlpha: number;
  otherContentAlpha: number;
  isFocusActive: boolean;
  isDetailLayoutActive: boolean;
  getImageLoadAlpha: (imageIndex: number) => number;
  getMainConnectorLoadAlpha: (connectorIndex: number) => number;
  getCollectedConnectorLoadAlpha: (connectorIndex: number) => number;
  // Alpha multiplier dimming main connectors the active branch doesn't travel.
  mainConnectorTravelAlpha: (connectorIndex: number) => number;
  // The colour a main connector is drawn in: the main line's grey, eased to
  // the active branch's colour where that branch's timeline runs along it.
  mainConnectorColour: (connectorIndex: number) => string;
  // How far (0-1) a main item has faded for not being on the hovered (or
  // zoomed-into) branch's timeline.
  mainItemBranchDim: (index: number) => number;
  // How far (0-1) a main connector has thickened towards double width: while
  // the main line is hovered, or a hovered branch's timeline runs along it.
  mainConnectorGrow: (connectorIndex: number) => number;
  isFocusedTarget: (
    lane: 'main' | 'collected' | 'preview',
    index: number
  ) => boolean;
  getDetailDrawBounds: (
    lane: 'main' | 'collected' | 'preview',
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
  // Multiplier that fades connectors out while a branch is isolated (1 = none).
  isolateOtherAlpha: number;
  // The focused item's branch nodes on their way out to the viewport edges, or
  // null when every node sits on its item.
  edgeNodes: EdgeNodeLayout | null;
  // Date labels collected during the item pass and drawn last (after the
  // connectors and nodes) so they sit on top of them.
  dateLabels: DateLabel[];
  // Every connector line drawn this frame, so labels can find a clear spot.
  drawnLines: ConnectorPoint[][];
};

export type DateLabel = {
  x: number;
  y: number;
  text: string;
  // Text fill.
  colour: string;
  alpha: number;
  align?: 'center' | 'right' | 'left';
  variant?: 'date' | 'title';
  scale?: number;
  icon?: CanvasImageSource;
  // A second line under the text (as strong as it).
  secondary?: string;
  // Font family for the text's own lines (not the lines after it), when
  // different from `font`.
  textFont?: string;
  // Who collected the item, on a fainter line after that.
  collectedBy?: CollectedBy;
  // Widest (world units) the text may run before wrapping onto more lines.
  maxWidth?: number;
  // Hang the label below `y` (wrapping downward) rather than sitting on it.
  below?: boolean;
  // Font family, when not the canvas's own.
  font?: string;
  // Letter spacing as a share of the font size, and line height (default 1.2).
  letterSpacing?: number;
  lineHeight?: number;
  // Outlined in the page background's colour rather than given a glow.
  outlined?: boolean;
  // The item the label belongs to: it's placed under the item, or beside it
  // on the right (vertically centred) when that spot sits on fewer lines and
  // items. `x`/`y` are then worked out when it's drawn.
  anchor?: LabelRect;
};

// The "collected by" line for an item's label, from its collectors (most
// recent first); none when no one has collected it.
export function collectedByFor(
  collectors: ItemCollector[] | undefined
): CollectedBy | undefined {
  if (!collectors || collectors.length === 0) {
    return undefined;
  }
  return {
    name: collectors[0].username,
    colour: collectors[0].colour,
    others: collectors.length - 1,
  };
}

// A dot for each person currently viewing an item, along its top edge from
// the top-right corner inward, each in that person's colour.
export function drawViewerDots(
  p: p5,
  viewers: ItemViewer[] | undefined,
  right: number,
  top: number,
  zoom: number
): void {
  if (!viewers || viewers.length === 0) {
    return;
  }
  const radius = VIEWER_DOT_RADIUS_PX / zoom;
  const ring = VIEWER_DOT_RING_PX / zoom;
  const step = (radius + ring) * 2 + VIEWER_DOT_GAP_PX / zoom;
  const firstX = right - VIEWER_DOT_INSET_PX / zoom - radius - ring;
  p.noStroke();
  viewers.forEach((viewer, k) => {
    const x = firstX - k * step;
    p.fill(255);
    p.circle(x, top, (radius + ring) * 2);
    p.fill(viewer.colour);
    p.circle(x, top, radius * 2);
  });
}

export function pushItemDateLabels(
  labels: DateLabel[],
  item: {
    left: number;
    right: number;
    y: number;
    text: string;
    alpha: number;
    contentType: ContentType;
  }
): boolean {
  labels.push({
    x: item.right,
    y: item.y,
    text: item.text,
    colour: DATE_LABEL_COLOUR,
    alpha: item.alpha,
    align: 'right',
    scale: PREVIEW_DATE_SCALE,
  });
  const icon = getContentTypeIconCanvas(item.contentType);
  if (!icon) {
    return false;
  }
  labels.push({
    x: item.left,
    y: item.y,
    text: '',
    colour: DATE_LABEL_COLOUR,
    alpha: item.alpha,
    icon,
  });
  return true;
}

export type MainLaneDrawResult = {
  hoveredMain: number;
  mainConnectorHover: boolean;
  // World distance from the cursor to the nearest main line (Infinity when
  // none is in reach), so a nearer branch line can take the hover instead.
  mainConnectorDistance: number;
  mainHighlighted: boolean;
};

export function computeMainLaneHover(
  deps: TimelineSketchDeps,
  bounds: ContentBounds[],
  mouseWorld: { x: number; y: number },
  hoverSuppressed: boolean
): MainLaneDrawResult {
  // The main lane is always faded while something else is focused/isolated
  // (see contentAlphaFor), so it never gets hover feedback in that state —
  // not just its connectors (below), but the items themselves too.
  let hoveredMain = -1;
  if (!hoverSuppressed) {
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
  }

  let mainConnectorDistance = Infinity;
  if (hoveredMain === -1 && !hoverSuppressed) {
    const reach = CONNECTOR_HOVER_THRESHOLD_PX / deps.runtime.zoom;
    for (let index = 0; index < deps.processed.length - 1; index++) {
      const line = getMainConnectorPoints(
        { x: bounds[index].right, y: bounds[index].centerY },
        { x: bounds[index + 1].left, y: bounds[index + 1].centerY }
      );
      const distance = distanceToPolyline(line, mouseWorld);
      if (distance <= reach && distance < mainConnectorDistance) {
        mainConnectorDistance = distance;
      }
    }
  }
  const mainConnectorHover = mainConnectorDistance !== Infinity;

  return {
    hoveredMain,
    mainConnectorHover,
    mainConnectorDistance,
    mainHighlighted: hoveredMain !== -1 || mainConnectorHover,
  };
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
  const { processedCollected, runtime } = deps;

  let path: ConnectorPoint[] | null = null;
  let glowColour = MAIN_GLOW_COLOUR;

  // Only trace the branch the view is clicked/zoomed into. The strip no longer
  // follows a hovered branch or the logged-in viewer's own branch by default.
  const rowIndex = runtime.focusedBranchRow ?? -1;

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

  // No branch to trace (no clicked branch and the viewer has none): draw no
  // strip. The main timeline itself never gets a travelling pulse.
  if (!path) {
    return;
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
  const lineWeight = connectorWeight(
    deps.runtime.zoom,
    deps.runtime.fitZoomLevel
  );

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

    const lineAlpha = mainConnectorAlpha(ctx, index, connectorLoadAlpha);
    // Viewing an item fades the lines away; its edge nodes' stubs stay.
    mainCtx.globalAlpha = lineAlpha * ctx.otherContentAlpha;

    // Focused item's endpoint follows its image to the detail position.
    const fromBounds = ctx.getDetailDrawBounds('main', index, bounds[index]);
    const toBounds = ctx.getDetailDrawBounds(
      'main',
      index + 1,
      bounds[index + 1]
    );
    // An end on the focused item rides its node out to the viewport edge, the
    // line moving with it and running on past the edge, off-screen.
    const edge = ctx.edgeNodes;
    const moveEnd = (pt: ConnectorPoint, end: 'from' | 'to') => {
      const node = edge?.nodes.get(mainEdgeNodeKey(index, end));
      return edge && node
        ? {
            pt: edgeNodePosition(pt, node, edge),
            runOn: edgeNodeRunOn(edge, deps.runtime.zoom),
            node,
          }
        : { pt, runOn: 0, node };
    };
    const start = moveEnd(
      { x: fromBounds.right, y: fromBounds.centerY },
      'from'
    );
    const end = moveEnd({ x: toBounds.left, y: toBounds.centerY }, 'to');
    const drawn = drawMainConnector(
      p,
      start.pt,
      end.pt,
      isFutureDatedItem(deps.items[index]),
      isFutureDatedItem(deps.items[index + 1]),
      lineWeight * (1 + ctx.mainConnectorGrow(index)),
      start.runOn,
      end.runOn,
      ctx.mainConnectorColour(index)
    );
    ctx.drawnLines.push(drawn);
    mainCtx.globalAlpha = lineAlpha;
    if (edge) {
      const edgeDotRadius =
        DOT_RADIUS * edgeNodeDotScale(deps.runtime.zoom, edge.progress);
      [start, end].forEach(({ pt, node }) => {
        if (node) {
          drawEdgeNodeStub(
            p,
            deps.runtime,
            pt,
            node.side,
            MAIN_LINE_COLOUR,
            edgeDotRadius,
            lineWeight,
            edge.progress
          );
        }
      });
    }
    resetCanvasEffects(mainCtx);
  }
}

export function drawMainLaneItems(
  p: p5,
  deps: TimelineSketchDeps,
  loadedImages: (p5.Image | null)[],
  ctx: MainLaneDrawContext,
  hover: MainLaneDrawResult,
  gallery: GalleryController
): void {
  const mainCtx = p.drawingContext as CanvasRenderingContext2D;
  const { bounds } = ctx;

  deps.processed.forEach((item, index) => {
    const imageLoadAlpha = ctx.getImageLoadAlpha(index);
    // Items off the hovered branch's timeline fade, like the collected ones:
    // their border and label by opacity, their image by a fade laid over it
    // (see drawBackgroundFade).
    const imageAlpha = ctx.contentAlphaFor('main', index, imageLoadAlpha);
    const branchFade =
      ctx.mainItemBranchDim(index) * (1 - BRANCH_DIM_ITEM_ALPHA);
    const visibilityAlpha = imageAlpha * (1 - branchFade);
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
    // The selected audio track gets a play/pause control (drawn below).
    const isAudioFocused =
      item.contentType === 'audioAsset' &&
      ctx.isFocusActive &&
      ctx.isFocusedTarget('main', index);
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

    const isExternallyHighlighted =
      deps.items[index]._id === ctx.highlightedMainContentId;

    if (ctx.isFocusActive && ctx.isFocusedTarget('main', index)) {
      // Selected image: no coloured glow, just the halo.
      applyItemHalo(p, mainCtx, visibilityAlpha);
    } else if (isExternallyHighlighted) {
      mainCtx.shadowBlur = 22;
      mainCtx.shadowColor = hexToRgba(
        deps.previewColour,
        0.55 * visibilityAlpha
      );
    } else if (typeMatch && ctx.isTypeHighlightActive) {
      mainCtx.shadowBlur = TYPE_HIGHLIGHT_BLUR * ctx.typeHighlightStrength;
      mainCtx.shadowColor = hexToRgba(
        getContentTypeColour(item.contentType),
        0.55 * ctx.typeHighlightStrength * visibilityAlpha
      );
    } else {
      applyItemHalo(p, mainCtx, visibilityAlpha);
    }

    if (ctx.isTypeHighlightActive && !typeMatch) {
      mainCtx.globalAlpha = getCombinedAlpha(imageAlpha, ctx.dimAlpha);
    } else {
      mainCtx.globalAlpha = imageAlpha;
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
      drawContainedImage(
        p,
        img,
        { left: imageLeft, top, width, height },
        item.isPrivate ? PRIVATE_IMAGE_EFFECT : undefined
      );
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

    mainCtx.globalAlpha = imageAlpha;
    drawBackgroundFade(
      p,
      mainCtx,
      imageLeft,
      top,
      width,
      height,
      branchFade,
      ((top - deps.runtime.cameraY) * deps.runtime.zoom) / p.height
    );

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

    if (item.isPrivate) {
      drawPrivateOverlay(
        p,
        mainCtx,
        imageLeft,
        top,
        width,
        height,
        visibilityAlpha
      );
    }

    // White border on every item except the selected (focused) one.
    if (!(ctx.isFocusActive && ctx.isFocusedTarget('main', index))) {
      mainCtx.globalAlpha =
        ctx.isTypeHighlightActive && !typeMatch
          ? getCombinedAlpha(visibilityAlpha, ctx.dimAlpha)
          : visibilityAlpha;
      p.noFill();
      p.stroke(255);
      p.strokeWeight(2);
      p.rect(imageLeft, top, width, height);
      resetCanvasEffects(mainCtx);
    }

    // The item's title over its date, deferred so it renders
    // above the connectors/nodes; hidden on the item being viewed.
    if (
      !(
        ctx.isFocusedTarget('main', index) &&
        ctx.isDetailLayoutActive &&
        deps.runtime.detailLayout > 0
      )
    ) {
      ctx.dateLabels.push({
        x: imageLeft + width / 2,
        y: top + height + 12,
        below: true,
        font: CANVAS_LABEL_FONT,
        scale: ITEM_LABEL_SCALE,
        letterSpacing: ITEM_LABEL_LETTER_SPACING,
        textFont: CANVAS_LABEL_FONT_MEDIUM,
        collectedBy: collectedByFor(
          deps.refs.collectorsRef.current?.get(deps.items[index]._id)
        ),
        lineHeight: ITEM_LABEL_LINE_HEIGHT,
        outlined: true,
        anchor: {
          left: imageLeft,
          right: imageLeft + width,
          top,
          bottom: top + height,
        },
        text: item.title,
        secondary: deps.items[index]?.date
          ? formatFullDate(new Date(deps.items[index].date as string).getTime())
          : undefined,
        // Wraps within roughly the item's own width (a narrow item still
        // gets a reasonable measure), well clear of its neighbours'.
        maxWidth: Math.max(width, ITEM_WIDTH * 0.8),
        colour: ITEM_LABEL_COLOUR,
        alpha:
          ctx.isTypeHighlightActive && !typeMatch
            ? getCombinedAlpha(visibilityAlpha, ctx.dimAlpha)
            : visibilityAlpha,
      });
    }

    mainCtx.globalAlpha = visibilityAlpha;
    drawViewerDots(
      p,
      item.slug ? deps.refs.viewersRef.current?.get(item.slug) : undefined,
      imageLeft + width,
      top,
      deps.runtime.zoom
    );
    resetCanvasEffects(mainCtx);

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

    // Gallery navigation arrows, fixed to the item's slot so they don't shift
    // position as differently-shaped images are navigated to.
    if (galleryActive && galleryImages) {
      const regions = drawGalleryControls(
        p,
        mainCtx,
        { left: imageLeft, top, width, height },
        item.galleryUrls.length,
        visibilityAlpha
      );
      gallery.setNavRegions(regions);
    }
  });
}

// A main-line connector's alpha: its load-in, any travel/isolate dimming, and
// the type-highlight dim.
function mainConnectorAlpha(
  ctx: MainLaneDrawContext,
  index: number,
  connectorLoadAlpha: number
): number {
  const travelAlpha = ctx.mainConnectorTravelAlpha(index);
  return ctx.isTypeHighlightActive
    ? getCombinedAlpha(connectorLoadAlpha, ctx.dimAlpha) *
        travelAlpha *
        ctx.isolateOtherAlpha
    : connectorLoadAlpha * travelAlpha * ctx.isolateOtherAlpha;
}

// The main line runs straight into its items with no dot drawn, except an end
// on the focused item, whose node is drawn on its way out to (or settled at)
// the viewport edge, growing in as it goes. While an item is focused, each end
// also registers a hover region for jumping to the item along its line.
export function drawMainLaneConnectorDots(
  p: p5,
  deps: TimelineSketchDeps,
  ctx: MainLaneDrawContext
): void {
  const mainCtx = p.drawingContext as CanvasRenderingContext2D;
  const { bounds } = ctx;
  const edge = ctx.edgeNodes;

  for (let index = 0; index < bounds.length - 1; index++) {
    const connectorLoadAlpha = ctx.getMainConnectorLoadAlpha(index);
    if (connectorLoadAlpha <= LOAD_ALPHA_SNAP) {
      continue;
    }
    const fromBounds = ctx.getDetailDrawBounds('main', index, bounds[index]);
    const toBounds = ctx.getDetailDrawBounds(
      'main',
      index + 1,
      bounds[index + 1]
    );
    const place = (pt: ConnectorPoint, end: 'from' | 'to') => {
      const edgeKey = mainEdgeNodeKey(index, end);
      const node = edge?.nodes.get(edgeKey);
      if (!edge || !node) {
        return {
          ...pt,
          scale: undefined,
          holeRatio: undefined,
          dotless: true,
          side: undefined,
          edgeKey: undefined,
        };
      }
      return {
        ...edgeNodePosition(pt, node, edge),
        scale: edgeNodeDotScale(deps.runtime.zoom, edge.progress),
        holeRatio: edgeNodeHoleRatio(edge.progress),
        dotless: false,
        side: node.side,
        edgeKey,
      };
    };
    const dFrom = place({ x: fromBounds.right, y: fromBounds.centerY }, 'from');
    const dTo = place({ x: toBounds.left, y: toBounds.centerY }, 'to');
    mainCtx.globalAlpha = mainConnectorAlpha(ctx, index, connectorLoadAlpha);
    [dFrom, dTo].forEach((d) => {
      if (!d.dotless) {
        drawDot(p, d.x, d.y, MAIN_LINE_COLOUR, d.scale, d.holeRatio);
      }
    });
    resetCanvasEffects(mainCtx);
    if (ctx.isFocusActive) {
      // The end on item `index` connects rightward to item `index + 1`, and
      // the end on item `index + 1` connects leftward to item `index`.
      ctx.nodeRegions.push({
        ...dFrom,
        title: deps.processed[index + 1].title,
        timeline: MAIN_USERNAME,
        colour: MAIN_LINE_COLOUR,
        target: { lane: 'main', index: index + 1 },
      });
      ctx.nodeRegions.push({
        ...dTo,
        title: deps.processed[index].title,
        timeline: MAIN_USERNAME,
        colour: MAIN_LINE_COLOUR,
        target: { lane: 'main', index },
      });
    }
  }
}

export function createMainLaneDrawHelpers(deps: TimelineSketchDeps) {
  const { runtime } = deps;

  const isFocusedTarget = (
    lane: 'main' | 'collected' | 'preview',
    index: number
  ) =>
    runtime.focusTarget?.lane === lane && runtime.focusTarget.index === index;

  // The focused image stays at its world bounds — the camera frames it at the
  // detail position — so the draw bounds are just the item's own bounds.
  const getDetailDrawBounds = (
    lane: 'main' | 'collected' | 'preview',
    index: number,
    itemBounds: ContentBounds
  ) => itemBounds;

  return { isFocusedTarget, getDetailDrawBounds };
}
