import { mapTagTilt } from '../../../utils/tilt';
import type { ItemViewer } from '../../../services/presence';
import type { ItemCollector } from '../processItems';
import type p5 from 'p5';
import {
  countLabelClashes,
  drawCentredTag,
  drawKindTag,
  type CollectedBy,
  type LabelRect,
} from '../labels';
import { formatFullDate } from '../../../utils/formatDate';
import {
  getContentTypeColour,
  getContentTypeKicker,
} from '../../../constants/contentTypes';
import {
  applyItemHalo,
  drawBackgroundFade,
  drawDimOverlay,
  drawPrivateOverlay,
  getCombinedAlpha,
  hexToRgba,
  matchesHighlightedType,
  resetCanvasEffects,
  drawGreyOut,
  drawSheen,
} from '../canvasEffects';
import {
  BRANCH_DIM_ITEM_ALPHA,
  CANVAS_LABEL_FONT,
  CANVAS_TITLE_FONT,
  ITEM_TITLE_SCALE,
  CONNECTOR_HOVER_THRESHOLD_PX,
  DOT_RADIUS,
  ITEM_LABEL_LETTER_SPACING,
  ITEM_LABEL_LINE_HEIGHT,
  ITEM_WIDTH,
  LOAD_ALPHA_SNAP,
  MAIN_GLOW_COLOUR,
  MAIN_GLOW_TRAVEL_MS,
  MAIN_LINE_COLOUR,
  MAIN_TAG_COLOUR,
  MAIN_USERNAME,
  ITEM_LABEL_COLOUR,
  ITEM_LABEL_SCALE,
  PRIVATE_IMAGE_EFFECT,
  TYPE_HIGHLIGHT_BLUR,
  VIEWER_DOT_GAP_PX,
  VIEWER_DOT_COLUMNS,
  VIEWER_DOT_INSET_PX,
  VIEWER_DOT_RADIUS_PX,
  VIEWER_DOT_RING_PX,
  SHEEN_STAGGER_MS,
  ALREADY_COLLECTED_TEXT,
  ALREADY_COLLECTED_WIDTH,
  ALREADY_COLLECTED_MAX_TILT_DEG,
  ALREADY_COLLECTED_MIN_TILT_DEG,
  VIEWER_FLASH_GLOW_PX,
  VIEWER_FLASH_LAYER_ALPHA,
  VIEWER_FLASH_LAYERS,
  VIEWER_FLASH_LENGTH_PX,
  VIEWER_FLASH_WEIGHT_PX,
  ITEM_HOVER_GROW,
} from '../constants';
import {
  distanceToPolyline,
  drawDot,
  drawMainConnector,
  extractSubPath,
  getMainConnectorPoints,
  polylineLength,
} from '../connectors';
import { timelineWeight } from '../geometry';
import { drawContainedImage, drawGalleryStrip } from './drawGalleryControls';
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
import type { TimelineSegment, ViewerDotTarget } from './viewerDots';
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
  // Everything but an item being collected fades away while it flies in (and
  // back as it lands).
  collectFade: number;
  // How far (0-1) item pictures are greyed out and their labels hidden, while
  // a collection is being viewed.
  isolateGrey: number;
  // The viewer's own branch row while a collection is being viewed (its lines
  // stay as the other collectors' fade out), else null.
  isolatedRow: number | null;
  // The collector whose timeline is shown alone (null otherwise), and the
  // alpha every line fades to meanwhile.
  soloRow: number | null;
  soloOtherAlpha: number;
  // How far a hovered item's picture has grown (0-1, eased).
  itemHoverGrow: (lane: 'main' | 'collected', index: number) => number;
  // Content ids of the collection being viewed (empty otherwise), whose items
  // the viewer has still to collect keep their labels while the others' are
  // hidden.
  collectionContentIds: Set<string>;
  // The focused item's branch nodes on their way out to the viewport edges, or
  // null when every node sits on its item.
  edgeNodes: EdgeNodeLayout | null;
  // Date labels collected during the item pass and drawn last (after the
  // connectors and nodes) so they sit on top of them.
  dateLabels: DateLabel[];
  // Every connector line drawn this frame, so labels can find a clear spot.
  drawnLines: ConnectorPoint[][];
  // The same lines with the items they join, for viewers' flashes to follow.
  timelineSegments: TimelineSegment[];
  // Where each current viewer's dot belongs this frame, drawn after the items.
  viewerDots: ViewerDotTarget[];
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
  // different from `font`, and their size relative to those lines.
  textFont?: string;
  textScale?: number;
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

// Places a dot for each person currently viewing an item, in a grid of
// VIEWER_DOT_COLUMNS beside the image's top corner: on its right, or on its
// left when that side has fewer lines running through. They're drawn later,
// all together (see viewerDots.ts), so a dot can travel between items.
export function placeViewerDots(
  targets: ViewerDotTarget[],
  viewers: ItemViewer[] | undefined,
  slug: string,
  image: LabelRect,
  zoom: number,
  alpha: number,
  lines: ConnectorPoint[][]
): void {
  if (!viewers || viewers.length === 0) {
    return;
  }
  const radius = VIEWER_DOT_RADIUS_PX / zoom;
  const ring = VIEWER_DOT_RING_PX / zoom;
  const outer = radius + ring;
  const step = outer * 2 + VIEWER_DOT_GAP_PX / zoom;
  const inset = VIEWER_DOT_INSET_PX / zoom;
  const columns = Math.min(viewers.length, VIEWER_DOT_COLUMNS);
  const rows = Math.ceil(viewers.length / VIEWER_DOT_COLUMNS);
  const gridWidth = outer * 2 + (columns - 1) * step;
  const gridHeight = outer * 2 + (rows - 1) * step;
  const gridRect = (side: 1 | -1): LabelRect => {
    const near = side === 1 ? image.right + inset : image.left - inset;
    return {
      left: side === 1 ? near : near - gridWidth,
      right: side === 1 ? near + gridWidth : near,
      top: image.top,
      bottom: image.top + gridHeight,
    };
  };
  const side: 1 | -1 =
    countLabelClashes(gridRect(-1), lines, []) <
    countLabelClashes(gridRect(1), lines, [])
      ? -1
      : 1;
  // The first dot sits nearest the image; rows fill outward, then downward.
  const firstX =
    (side === 1 ? image.right + inset : image.left - inset) + side * outer;
  const firstY = image.top + outer;
  viewers.forEach((viewer, k) => {
    targets.push({
      ...viewer,
      slug,
      x: firstX + side * (k % VIEWER_DOT_COLUMNS) * step,
      y: firstY + Math.floor(k / VIEWER_DOT_COLUMNS) * step,
      alpha,
    });
  });
}

// `bounds` grown about its centre by ITEM_HOVER_GROW times `grow` (0-1), for
// a hovered item's picture.
export function growAboutCentre<
  T extends { left: number; top: number; width: number; height: number }
>(bounds: T, grow: number): T {
  if (grow <= 0) {
    return bounds;
  }
  const scale = 1 + ITEM_HOVER_GROW * grow;
  const width = bounds.width * scale;
  const height = bounds.height * scale;
  return {
    ...bounds,
    left: bounds.left - (width - bounds.width) / 2,
    top: bounds.top - (height - bounds.height) / 2,
    width,
    height,
  };
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
  const { runtime } = deps;

  // Only trace the branch the view is clicked/zoomed into. The strip no longer
  // follows a hovered branch or the logged-in viewer's own branch by default,
  // nor runs while a timeline is shown alone (its lines are hidden).
  const rowIndex =
    runtime.branchSoloRow === null ? runtime.focusedBranchRow ?? -1 : -1;
  if (rowIndex < 0) {
    return;
  }
  const timeline = boundsCtx.getUserTimelinePath(
    rowIndex,
    mainBounds,
    collectedBounds
  );
  if (timeline.length <= 0) {
    return;
  }

  const t = (p.millis() % MAIN_GLOW_TRAVEL_MS) / MAIN_GLOW_TRAVEL_MS;
  // A white flash runs along the timeline from its earliest item, like a
  // viewer's flash between items: brightest in its middle, fading to nothing
  // at either end, splitting to run down each branch where it forks. It runs
  // from before the start to past the end, so it slides in and out.
  const { zoom } = runtime;
  const flashLength = VIEWER_FLASH_LENGTH_PX / zoom;
  const middle = t * (timeline.length + flashLength) - flashLength / 2;

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
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = VIEWER_FLASH_WEIGHT_PX / zoom;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = '#ffffff';
  ctx.shadowBlur = VIEWER_FLASH_GLOW_PX * p.pixelDensity();
  ctx.globalAlpha = VIEWER_FLASH_LAYER_ALPHA;
  timeline.stretches.forEach(({ points, start }) => {
    const length = polylineLength(points);
    const localMiddle = middle - start;
    if (
      localMiddle + flashLength / 2 <= 0 ||
      localMiddle - flashLength / 2 >= length
    ) {
      return;
    }
    // Stacked strokes, each shorter than the last, build up to brightest in
    // the middle.
    for (let k = 0; k < VIEWER_FLASH_LAYERS; k++) {
      const half = (flashLength / 2) * (1 - k / VIEWER_FLASH_LAYERS);
      const strip = extractSubPath(
        points,
        Math.max(0, localMiddle - half),
        Math.min(length, localMiddle + half)
      );
      if (strip.length < 2) {
        continue;
      }
      ctx.beginPath();
      ctx.moveTo(strip[0].x, strip[0].y);
      strip.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
      ctx.stroke();
    }
  });
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
  const lineWeight = timelineWeight(deps.runtime);

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
    ctx.timelineSegments.push({
      owner: MAIN_USERNAME,
      from: { key: `main:${index}`, slug: deps.processed[index].slug },
      to: { key: `main:${index + 1}`, slug: deps.processed[index + 1].slug },
      points: drawn,
    });
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

    const { left, top, width, height } = growAboutCentre(
      ctx.getDetailDrawBounds('main', index, bounds[index]),
      ctx.itemHoverGrow('main', index)
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

    // The item's height on screen, for its halo's colour.
    const haloScreenY =
      ((top + height / 2 - deps.runtime.cameraY) * deps.runtime.zoom) /
      p.height;
    const isExternallyHighlighted =
      deps.items[index]._id === ctx.highlightedMainContentId;

    // The halo and picture get a canvas state of their own: Safari otherwise
    // paints faded pictures drawn after a cleared shadow at full strength, so
    // pictures fading out stayed solid until they vanished.
    p.push();
    if (ctx.isFocusActive && ctx.isFocusedTarget('main', index)) {
      // Selected image: no coloured glow, just the halo.
      applyItemHalo(p, mainCtx, visibilityAlpha, haloScreenY);
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
      applyItemHalo(p, mainCtx, visibilityAlpha, haloScreenY);
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

    p.pop();
    resetCanvasEffects(mainCtx);

    // Viewing a collection greys out every picture of the viewer's own (the
    // collection's not-yet-collected items, drawn elsewhere, stay in colour).
    if (!ctx.isFocusedTarget('main', index)) {
      drawGreyOut(
        mainCtx,
        imageLeft,
        top,
        width,
        height,
        ctx.isolateGrey,
        imageAlpha
      );
    }
    // The collection's items the viewer has still to collect catch a
    // sweeping sheen while it's viewed.
    const toCollect =
      ctx.collectionContentIds.has(deps.items[index]._id) &&
      !deps.refs.collectorsRef.current
        ?.get(deps.items[index]._id)
        ?.some((collector) => collector.username === deps.currentUsername);
    if (toCollect) {
      drawSheen(
        mainCtx,
        imageLeft,
        top,
        width,
        height,
        p.millis(),
        index * SHEEN_STAGGER_MS,
        ctx.isolateGrey * imageAlpha
      );
    }

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

    // One of the collection's the viewer already has says so while it's
    // viewed, over its border.
    if (
      ctx.collectionContentIds.has(deps.items[index]._id) &&
      !toCollect &&
      ctx.isolateGrey > 0
    ) {
      mainCtx.globalAlpha = ctx.isolateGrey * imageAlpha;
      drawCentredTag(
        p,
        ALREADY_COLLECTED_TEXT,
        imageLeft + width / 2,
        top + height / 2,
        width * ALREADY_COLLECTED_WIDTH,
        (mapTagTilt(
          deps.items[index]._id,
          ALREADY_COLLECTED_MAX_TILT_DEG,
          ALREADY_COLLECTED_MIN_TILT_DEG
        ) *
          Math.PI) /
          180
      );
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
      // The kind tag and label are hidden while a collection is being viewed,
      // unless it's one of its items the viewer has still to collect.
      const labelHide = toCollect ? 0 : ctx.isolateGrey;
      const kind = getContentTypeKicker(item.contentType);
      if (kind && labelHide < 1) {
        mainCtx.globalAlpha =
          (ctx.isTypeHighlightActive && !typeMatch
            ? getCombinedAlpha(visibilityAlpha, ctx.dimAlpha)
            : visibilityAlpha) *
          (1 - labelHide);
        drawKindTag(
          p,
          kind,
          imageLeft + width,
          top + height,
          deps.runtime.zoom
        );
        resetCanvasEffects(mainCtx);
      }
      if (labelHide < 1) {
        ctx.dateLabels.push({
          x: imageLeft + width / 2,
          y: top + height + 12,
          below: true,
          font: CANVAS_LABEL_FONT,
          scale: ITEM_LABEL_SCALE,
          letterSpacing: ITEM_LABEL_LETTER_SPACING,
          textFont: CANVAS_TITLE_FONT,
          textScale: ITEM_TITLE_SCALE,
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
            ? formatFullDate(
                new Date(deps.items[index].date as string).getTime()
              )
            : undefined,
          // Wraps within roughly the item's own width (a narrow item still
          // gets a reasonable measure), well clear of its neighbours'.
          maxWidth: Math.max(width, ITEM_WIDTH * 0.8),
          colour: ITEM_LABEL_COLOUR,
          alpha:
            (ctx.isTypeHighlightActive && !typeMatch
              ? getCombinedAlpha(visibilityAlpha, ctx.dimAlpha)
              : visibilityAlpha) *
            (1 - labelHide),
        });
      }
    }

    if (item.slug) {
      placeViewerDots(
        ctx.viewerDots,
        deps.refs.viewersRef.current?.get(item.slug),
        item.slug,
        {
          left: imageLeft,
          right: imageLeft + width,
          top,
          bottom: top + height,
        },
        deps.runtime.zoom,
        visibilityAlpha,
        ctx.drawnLines
      );
    }
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
  // The main timeline stays in place while a branch is isolated, so its
  // lines don't fade out with the other collectors'.
  return ctx.isTypeHighlightActive
    ? getCombinedAlpha(connectorLoadAlpha, ctx.dimAlpha) * travelAlpha
    : connectorLoadAlpha * travelAlpha;
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
          hidden: false,
          others: undefined,
        };
      }
      return {
        ...edgeNodePosition(pt, node, edge),
        scale: edgeNodeDotScale(deps.runtime.zoom, edge.progress),
        holeRatio: edgeNodeHoleRatio(edge.progress),
        dotless: false,
        side: node.side,
        edgeKey,
        hidden: node.hidden ?? false,
        others: node.others,
      };
    };
    const dFrom = place({ x: fromBounds.right, y: fromBounds.centerY }, 'from');
    const dTo = place({ x: toBounds.left, y: toBounds.centerY }, 'to');
    mainCtx.globalAlpha = mainConnectorAlpha(ctx, index, connectorLoadAlpha);
    [dFrom, dTo].forEach((d) => {
      if (!d.dotless && !d.hidden) {
        drawDot(p, d.x, d.y, MAIN_LINE_COLOUR, d.scale, d.holeRatio);
      }
    });
    resetCanvasEffects(mainCtx);
    if (ctx.isFocusActive) {
      // The end on item `index` connects rightward to item `index + 1`, and
      // the end on item `index + 1` connects leftward to item `index`.
      if (!dFrom.hidden) {
        ctx.nodeRegions.push({
          ...dFrom,
          title: deps.processed[index + 1].title,
          timeline: MAIN_USERNAME,
          colour: MAIN_TAG_COLOUR,
          target: { lane: 'main', index: index + 1 },
        });
      }
      if (!dTo.hidden) {
        ctx.nodeRegions.push({
          ...dTo,
          title: deps.processed[index].title,
          timeline: MAIN_USERNAME,
          colour: MAIN_TAG_COLOUR,
          target: { lane: 'main', index },
        });
      }
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
