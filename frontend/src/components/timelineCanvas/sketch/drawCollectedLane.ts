import type p5 from 'p5';
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
  drawGreyOut,
  drawSheen,
} from '../canvasEffects';
import {
  BRANCH_DIM_COLOUR,
  BRANCH_DIM_ITEM_ALPHA,
  CANVAS_LABEL_FONT,
  CANVAS_LABEL_FONT_MEDIUM,
  CONNECTOR_HOVER_THRESHOLD_PX,
  DOT_RADIUS,
  ITEM_LABEL_LETTER_SPACING,
  ITEM_LABEL_LINE_HEIGHT,
  ITEM_WIDTH,
  LOAD_ALPHA_SNAP,
  ITEM_LABEL_COLOUR,
  ITEM_LABEL_SCALE,
  PRIVATE_IMAGE_EFFECT,
  TYPE_HIGHLIGHT_BLUR,
  ZOOM_OUT_GROWTH_POWER,
  SHEEN_STAGGER_MS,
} from '../constants';
import {
  distanceToPolyline,
  drawBranchConnector,
  drawDot,
  extractSubPath,
  getBranchRoute,
  polylineLength,
} from '../connectors';
import { branchLineKey } from './layoutChange';
import { connectorWeight, zoomOutGrowth } from '../geometry';
import type {
  BranchNodeGroup,
  CollectedSource,
  ConnectorPoint,
  ContentBounds,
  FocusTarget,
  TimelineRuntime,
  TimelineSketchDeps,
} from '../types';
import type { BoundsContext } from './bounds';
import {
  drawEdgeNodeStub,
  edgeNodeDotScale,
  edgeNodeHoleRatio,
  edgeNodeKey,
  edgeNodePosition,
  edgeNodeRunOn,
} from './edgeNodes';
import {
  drawContainedImage,
  drawGalleryControls,
  drawGalleryStrip,
} from './drawGalleryControls';
import type { GalleryController } from './galleryController';
import { drawKindTag } from '../labels';
import { drawPlayPauseButton } from './drawPlayPauseButton';
import {
  collectedByFor,
  contentKicker,
  placeViewerDots,
  type MainLaneDrawContext,
} from './drawMainLane';

export type CollectedLaneDrawResult = {
  hoveredCollected: number;
  hoveredCollectedIsImage: boolean;
  hoveredUserRow: number | null;
  // World distance from the cursor to the hovered branch line (Infinity when
  // the hover isn't on a line).
  hoveredLineDistance: number;
};

// Slide a branch endpoint out to the revealing CD's right edge when it sits on
// the focused audio item's right edge; otherwise leave it untouched.
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
  isFocusActive: boolean,
  // While isolating a branch, every other collector's items are faded out
  // (see contentAlphaFor) and shouldn't get hover feedback — only the
  // isolated branch's own items should. Defaults to "every item", the normal
  // (not isolating) case.
  isItemHoverable: (index: number) => boolean = () => true
): CollectedLaneDrawResult {
  let hoveredCollected = -1;
  let hoveredCollectedIsImage = false;
  let hoveredUserRow: number | null = null;

  for (let index = deps.processedCollected.length - 1; index >= 0; index--) {
    if (!isItemHoverable(index)) {
      continue;
    }
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

  let hoveredLineDistance = Infinity;
  if (hoveredCollected === -1 && !isFocusActive) {
    // Lines are slim, so the hit zone reaches a fixed distance on screen either
    // side; the nearest line in reach wins so tight bundles stay pickable.
    const reach = CONNECTOR_HOVER_THRESHOLD_PX / deps.runtime.zoom;
    for (let index = deps.processedCollected.length - 1; index >= 0; index--) {
      if (!isItemHoverable(index)) {
        continue;
      }
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
        segments.forEach((segment) => {
          const points = getBranchRoute(segment.from, segment.to, segment);
          const distance = distanceToPolyline(points, mouseWorld);
          if (distance <= reach && distance < hoveredLineDistance) {
            hoveredLineDistance = distance;
            hoveredCollected = index;
            hoveredUserRow = item.sources[sourceIndex].rowIndex;
          }
        });
      }
    }
  }

  return {
    hoveredCollected,
    hoveredCollectedIsImage,
    hoveredUserRow,
    hoveredLineDistance,
  };
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
  const lineWeight = connectorWeight(
    deps.runtime.zoom,
    deps.runtime.fitZoomLevel
  );

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

      // Viewing a collection fades every other collector's lines out, but
      // keeps the viewer's own.
      const isolateAlpha =
        source.rowIndex === ctx.isolatedRow ? 1 : ctx.isolateOtherAlpha;
      if (ctx.isTypeHighlightActive) {
        collectedCtx.globalAlpha =
          getCombinedAlpha(connectorLoadAlpha, ctx.dimAlpha) * isolateAlpha;
      } else {
        collectedCtx.globalAlpha = connectorLoadAlpha * isolateAlpha;
      }

      segments.forEach((segment, segmentIndex) => {
        const edge = ctx.edgeNodes;
        const progress = edge?.progress ?? 0;
        // An end on the focused item rides its node out to the viewport
        // edge, the line moving with it. Its bundle's centre moves with it
        // (so the line keeps its shape as it sets off), and its last
        // straight stretches to run on past the edge, off-screen.
        const moveEnd = (
          pt: ConnectorPoint,
          node: BranchNodeGroup | undefined,
          end: 'from' | 'to'
        ) => {
          const shifted = pt;
          const shiftedNode = node;
          const edgeNode = edge?.nodes.get(
            edgeNodeKey(index, sourceIndex, segmentIndex, end)
          );
          if (!edgeNode) {
            return { pt: shifted, node: shiftedNode, stubExtra: 0, edgeNode };
          }
          const moved = edge
            ? edgeNodePosition(shifted, edgeNode, edge)
            : shifted;
          return {
            pt: moved,
            node: shiftedNode && {
              ...shiftedNode,
              centre: {
                x: shiftedNode.centre.x + moved.x - shifted.x,
                y: shiftedNode.centre.y + moved.y - shifted.y,
              },
            },
            // A node sharing another's spot (same far item) just meets it,
            // leaving the lead out to the edge to the one shown.
            stubExtra:
              edge && !edgeNode.hidden
                ? edgeNodeRunOn(edge, deps.runtime.zoom)
                : 0,
            edgeNode,
          };
        };
        const start = moveEnd(segment.from, segment.fromNode, 'from');
        const end = moveEnd(segment.to, segment.toNode, 'to');
        const fullRoute = getBranchRoute(
          start.pt,
          end.pt,
          { ...segment, fromNode: start.node, toNode: end.node },
          start.stubExtra,
          end.stubExtra
        );
        // A line that's just appeared draws out towards its item.
        const grow =
          deps.runtime.layoutChange.grow.get(
            branchLineKey(item.contentId, source.username)
          ) ?? 1;
        if (grow <= 0) {
          return;
        }
        const route =
          grow < 1
            ? extractSubPath(fullRoute, 0, polylineLength(fullRoute) * grow)
            : fullRoute;
        // Viewing an item fades the lines away; its edge nodes' stubs stay.
        const lineAlpha = collectedCtx.globalAlpha;
        collectedCtx.globalAlpha = lineAlpha * ctx.otherContentAlpha;
        // A hovered timeline thickens to double width, easing with its tag.
        const hoverGrow =
          deps.runtime.lineBlobs.get(`row:${source.rowIndex}`)?.scale ?? 0;
        drawBranchConnector(
          p,
          route,
          branchColour,
          lineWeight * (1 + hoverGrow)
        );
        ctx.drawnLines.push(route);
        const itemEnd = (target: FocusTarget | undefined) =>
          target && {
            key: `${target.lane}:${target.index}`,
            slug:
              target.lane === 'main'
                ? deps.processed[target.index]?.slug ?? null
                : deps.processedCollected[target.index]?.slug ?? null,
          };
        const fromEnd = itemEnd(segment.fromItemTarget);
        const toEnd = itemEnd(segment.toItemTarget);
        if (fromEnd && toEnd) {
          ctx.timelineSegments.push({
            owner: source.username,
            from: fromEnd,
            to: toEnd,
            points: route,
          });
        }
        collectedCtx.globalAlpha = lineAlpha;
        const edgeDotRadius =
          DOT_RADIUS * edgeNodeDotScale(deps.runtime.zoom, progress);
        [start, end].forEach(({ pt, edgeNode }) => {
          if (edgeNode && !edgeNode.hidden) {
            drawEdgeNodeStub(
              p,
              deps.runtime,
              pt,
              edgeNode.side,
              branchColour,
              edgeDotRadius,
              lineWeight,
              progress
            );
          }
        });
      });
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

    // The selected audio track gets a play/pause control (drawn below).
    const isAudioFocused =
      item.contentType === 'audioAsset' &&
      ctx.isFocusActive &&
      ctx.isFocusedTarget('collected', index);
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

    // The item's height on screen, for its halo's colour.
    const haloScreenY =
      ((top + height / 2 - deps.runtime.cameraY) * deps.runtime.zoom) /
      p.height;
    const isExternallyHighlighted =
      item.contentId === ctx.highlightedMainContentId;

    if (ctx.isFocusActive && ctx.isFocusedTarget('collected', index)) {
      // Selected image: no coloured glow, just the halo.
      applyItemHalo(p, collectedCtx, visibilityAlpha, haloScreenY);
    } else if (isExternallyHighlighted) {
      collectedCtx.shadowBlur = 22;
      collectedCtx.shadowColor = hexToRgba(
        deps.previewColour,
        0.55 * visibilityAlpha
      );
    } else if (typeMatch && ctx.isTypeHighlightActive) {
      collectedCtx.shadowBlur = TYPE_HIGHLIGHT_BLUR * ctx.typeHighlightStrength;
      collectedCtx.shadowColor = hexToRgba(
        getContentTypeColour(item.contentType),
        0.55 * ctx.typeHighlightStrength * visibilityAlpha
      );
    } else {
      applyItemHalo(p, collectedCtx, visibilityAlpha, haloScreenY);
    }

    // The image's branch fade is laid over it afterwards (drawBackgroundFade)
    // rather than applied as opacity here.
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

    resetCanvasEffects(collectedCtx);

    // Viewing a collection greys out every picture of the viewer's own (the
    // collection's not-yet-collected items, drawn elsewhere, stay in colour).
    if (!ctx.isFocusedTarget('collected', index)) {
      drawGreyOut(
        collectedCtx,
        imageLeft,
        top,
        width,
        height,
        ctx.isolateGrey,
        visibilityAlpha
      );
    }
    // The collection's own items catch a sweeping sheen while it's viewed.
    if (ctx.collectionContentIds.has(item.contentId)) {
      drawSheen(
        collectedCtx,
        imageLeft,
        top,
        width,
        height,
        p.millis(),
        index * SHEEN_STAGGER_MS,
        ctx.isolateGrey * visibilityAlpha
      );
    }

    collectedCtx.globalAlpha = visibilityAlpha;
    drawBackgroundFade(
      p,
      collectedCtx,
      imageLeft,
      top,
      width,
      height,
      1 - branchDimAlpha,
      ((top - deps.runtime.cameraY) * deps.runtime.zoom) / p.height
    );

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

    if (item.isPrivate) {
      drawPrivateOverlay(
        p,
        collectedCtx,
        imageLeft,
        top,
        width,
        height,
        visibilityAlpha
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

    // The item's title over its date, deferred so it renders
    // above the connectors/nodes; hidden on the item being viewed.
    if (
      !(
        ctx.isFocusedTarget('collected', index) &&
        ctx.isDetailLayoutActive &&
        deps.runtime.detailLayout > 0
      )
    ) {
      // The kind tag and label are hidden while a collection is being viewed,
      // unless it's one of the collection's own items.
      const labelHide = ctx.collectionContentIds.has(item.contentId)
        ? 0
        : ctx.isolateGrey;
      const kind = contentKicker(item.contentType);
      if (kind && labelHide < 1) {
        collectedCtx.globalAlpha =
          (ctx.isTypeHighlightActive && !typeMatch
            ? getCombinedAlpha(visibilityAlpha, ctx.dimAlpha)
            : visibilityAlpha) *
          branchDimAlpha *
          (1 - labelHide);
        drawKindTag(
          p,
          kind,
          imageLeft + width,
          top + height,
          deps.runtime.zoom
        );
        resetCanvasEffects(collectedCtx);
      }
      if (labelHide < 1) {
        ctx.dateLabels.push({
          x: imageLeft + width / 2,
          y: top + height + 12,
          below: true,
          font: CANVAS_LABEL_FONT,
          scale: ITEM_LABEL_SCALE,
          letterSpacing: ITEM_LABEL_LETTER_SPACING,
          textFont: CANVAS_LABEL_FONT_MEDIUM,
          collectedBy: collectedByFor(
            deps.refs.collectorsRef.current?.get(item.contentId)
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
          secondary: formatFullDate(item.anchorTime),
          // Wraps within roughly the item's own width (a narrow item still
          // gets a reasonable measure), well clear of its neighbours'.
          maxWidth: Math.max(width, ITEM_WIDTH * 0.8),
          colour: ITEM_LABEL_COLOUR,
          alpha:
            (ctx.isTypeHighlightActive && !typeMatch
              ? getCombinedAlpha(visibilityAlpha, ctx.dimAlpha)
              : visibilityAlpha) *
            branchDimAlpha *
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
    resetCanvasEffects(collectedCtx);

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

    // Gallery navigation arrows, fixed to the item's slot so they don't shift
    // position as differently-shaped images are navigated to.
    if (galleryActive && galleryImages) {
      const regions = drawGalleryControls(
        p,
        collectedCtx,
        { left: imageLeft, top, width, height },
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
  const dotScale = zoomOutGrowth(
    deps.runtime.zoom,
    deps.runtime.fitZoomLevel,
    ZOOM_OUT_GROWTH_POWER
  );

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
      // Viewing a collection fades every other collector's lines out, but
      // keeps the viewer's own.
      const isolateAlpha =
        source.rowIndex === ctx.isolatedRow ? 1 : ctx.isolateOtherAlpha;
      if (ctx.isTypeHighlightActive) {
        collectedCtx.globalAlpha =
          getCombinedAlpha(connectorLoadAlpha, ctx.dimAlpha) * isolateAlpha;
      } else {
        collectedCtx.globalAlpha = connectorLoadAlpha * isolateAlpha;
      }
      segments.forEach(
        (
          {
            from,
            to,
            fromItemTitle,
            toItemTitle,
            fromItemTarget,
            toItemTarget,
          },
          segmentIndex
        ) => {
          // Lines run straight into their items with no dot, except a node on
          // the focused item, drawn on its way out to (or settled at) the
          // viewport edge at that node's own size, growing in as it goes.
          const placeDot = (pt: ConnectorPoint, end: 'from' | 'to') => {
            const shifted = pt;
            const edge = ctx.edgeNodes;
            const edgeKey = edgeNodeKey(index, sourceIndex, segmentIndex, end);
            const node = edge?.nodes.get(edgeKey);
            if (!edge || !node) {
              return {
                ...shifted,
                scale: dotScale,
                holeRatio: undefined,
                onEdge: false,
                side: undefined,
                edgeKey: undefined,
                hidden: false,
                others: undefined,
              };
            }
            return {
              ...edgeNodePosition(shifted, node, edge),
              scale: edgeNodeDotScale(deps.runtime.zoom, edge.progress),
              holeRatio: edgeNodeHoleRatio(edge.progress),
              onEdge: true,
              side: node.side,
              edgeKey,
              hidden: node.hidden ?? false,
              others: node.others,
            };
          };
          const drawEdgeDot = (d: ReturnType<typeof placeDot>) => {
            if (!d.onEdge || !ctx.edgeNodes || d.hidden) {
              return;
            }
            drawDot(p, d.x, d.y, branchColour, d.scale, d.holeRatio);
          };
          const dFrom = placeDot(from, 'from');
          const dTo = placeDot(to, 'to');
          drawEdgeDot(dFrom);
          drawEdgeDot(dTo);
          if (ctx.isFocusActive) {
            // The `from` dot connects along the line to the item at `to`; the
            // `to` dot connects back to the item at `from`.
            if (toItemTitle && toItemTarget && !dFrom.hidden) {
              ctx.nodeRegions.push({
                ...dFrom,
                title: toItemTitle,
                timeline: source.username,
                colour: source.colour,
                target: toItemTarget,
                dotless: !dFrom.onEdge,
              });
            }
            if (fromItemTitle && fromItemTarget && !dTo.hidden) {
              ctx.nodeRegions.push({
                ...dTo,
                title: fromItemTitle,
                timeline: source.username,
                colour: source.colour,
                target: fromItemTarget,
                dotless: !dTo.onEdge,
              });
            }
          }
        }
      );
      resetCanvasEffects(collectedCtx);
    });
  });
}
