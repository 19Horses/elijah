import type p5 from 'p5';
import {
  DETAIL_IMAGE_HEIGHT_VH,
  DETAIL_IMAGE_LEFT_PX,
  DETAIL_TEXT_GAP_PX,
  DETAIL_TEXT_VIEWPORT_LEFT,
  ENTRANCE_ZOOM_START_FACTOR,
  COLLECTION_FRAME_BOTTOM_PX,
  COLLECTION_FRAME_SIDE_PX,
  COLLECTION_FRAME_TOP_PX,
  COLLECTION_PANEL_GAP_PX,
  FIT_VIEW_MARGINS_PX,
  MAIN_FIT_VIEW_MARGINS_PX,
  MAIN_FIT_ZOOM_SCALAR,
  FIT_VIEW_PADDING,
  FIT_VIEW_TOP_CLEARANCE_PX,
  FIT_ZOOM_SCALAR,
  MAIN_LINE_Y,
  MAX_ZOOM_LEVEL,
  MIN_ZOOM_FACTOR,
  PAN_LERP,
  PAN_SETTLE_THRESHOLD_PX,
  SOLO_GRID_BOTTOM_PX,
  SOLO_GRID_TOP_PX,
  VIEW_ANIMATION_LERP,
  COLLECT_RETURN_ZOOM_LERP,
  VIEW_SNAP_THRESHOLD,
  VIEW_UNFOCUS_ANIMATION_LERP,
  WHEEL_ZOOM_SENSITIVITY,
  ZOOM_LERP,
  ZOOM_SETTLE_THRESHOLD,
} from '../constants';
import { hitTest } from '../geometry';
import {
  getFocusedSlug,
  isPrivateTarget,
  isViewInteractionLocked,
  notifyFocusFade,
  resetCanvasFocus,
  startDetailReveal,
  syncInteractionLock,
} from '../timelineRuntime';
import type {
  BranchFocusInfo,
  ContentBounds,
  DetailImageRect,
  FocusTarget,
  TimelineSketchDeps,
} from '../types';
import type { BoundsContext } from './bounds';
import { computeCollectedLaneHover } from './drawCollectedLane';

export type ViewContext = {
  setCameraFromScreenAnchor: (
    worldX: number,
    worldY: number,
    screenX: number,
    screenY: number,
    nextZoom: number
  ) => void;
  computeFitViewTargets: () => void;
  refitHomeForPanel: () => void;
  computeFocusViewTargets: (bounds: ContentBounds) => void;
  getFocusBounds: (target: FocusTarget) => ContentBounds;
  applyViewTargets: () => void;
  syncViewTargets: () => void;
  panView: (deltaScreenX: number, deltaScreenY: number) => void;
  zoomViewAt: (screenX: number, screenY: number, delta: number) => void;
  scrollView: (deltaX: number, deltaY: number) => void;
  fitView: () => void;
  playEntranceAnimation: () => void;
  startCollectReturn: (
    collectedIndex: number,
    rect: DetailImageRect
  ) => boolean;
  animateToFitView: () => void;
  startPreviewCollect: (previewIndex: number) => boolean;
  collectFocusedPreviewContentId: (contentId: string) => void;
  animateView: () => void;
  animatePan: () => void;
  animateZoom: () => void;
  findClickedItem: (worldX: number, worldY: number) => FocusTarget | null;
  findClickedBranch: (worldX: number, worldY: number) => number | null;
  focusItem: (target: FocusTarget) => void;
  focusBranch: (rowIndex: number) => void;
  soloOwnBranch: () => void;
  unfocusItem: () => void;
  // Back out of any focused item or isolated branch to the full map.
  showFullMap: () => void;
  previewFocusItem: (target: FocusTarget) => void;
  clearPreviewFocus: () => void;
  previewContentId: (contentId: string) => void;
  focusContentId: (contentId: string) => void;
  setCollectionViewActive: (active: boolean) => void;
  toggleOwnBranchIsolation: () => void;
  exitBranchIsolation: () => void;
  isViewInteractionLocked: () => boolean;
  refreshIsolatedFraming: () => void;
};

export function createViewContext(
  p: p5,
  deps: TimelineSketchDeps,
  bounds: BoundsContext
): ViewContext {
  const { runtime } = deps;

  const setCameraFromScreenAnchor = (
    worldX: number,
    worldY: number,
    screenX: number,
    screenY: number,
    nextZoom: number
  ) => {
    runtime.cameraX = worldX - screenX / nextZoom;
    runtime.cameraY = worldY - screenY / nextZoom;
    runtime.zoom = nextZoom;
  };

  const getAnimationProgress = (nextZoom: number): number => {
    const zoomRange = runtime.targetZoom - runtime.animationStartZoom;
    if (Math.abs(zoomRange) <= VIEW_SNAP_THRESHOLD) {
      return 1;
    }
    return Math.max(
      0,
      Math.min(1, (nextZoom - runtime.animationStartZoom) / zoomRange)
    );
  };

  const beginViewAnimation = (worldX: number, worldY: number) => {
    runtime.animationWorldX = worldX;
    runtime.animationWorldY = worldY;
    runtime.animationStartScreenX = (worldX - runtime.cameraX) * runtime.zoom;
    runtime.animationStartScreenY = (worldY - runtime.cameraY) * runtime.zoom;
    runtime.animationStartCameraX = runtime.cameraX;
    runtime.animationStartCameraY = runtime.cameraY;
    runtime.animationStartZoom = runtime.zoom;
    runtime.slowViewAnimation = false;
  };

  // Frame an arbitrary set of item bounds: set the target zoom/camera so the
  // whole set fits with padding (or, given `screenMargins`, inside the screen
  // less those pixel margins), centred. Returns the framed centre (for the
  // zoom animation anchor), or null when the set is empty/degenerate.
  const computeFitTargetsForBounds = (
    list: ContentBounds[],
    screenMargins?: {
      top: number;
      right: number;
      bottom: number;
      left: number;
    },
    zoomScalar = FIT_ZOOM_SCALAR
  ): { centerX: number; centerY: number } | null => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    list.forEach((b) => {
      minX = Math.min(minX, b.left);
      maxX = Math.max(maxX, b.right);
      minY = Math.min(minY, b.top);
      maxY = Math.max(maxY, b.dateBottom);
    });

    if (!(Number.isFinite(minX) && maxX > minX && maxY > minY)) {
      return null;
    }

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    if (screenMargins) {
      // Fit into the screen less fixed pixel margins (room for the header and
      // the labels under and beside the items), centred in what's left.
      const { top, right, bottom, left } = screenMargins;
      const availableWidth = Math.max(1, p.width - left - right);
      const availableHeight = Math.max(1, p.height - top - bottom);
      runtime.targetZoom =
        Math.min(
          availableWidth / (maxX - minX),
          availableHeight / (maxY - minY)
        ) * zoomScalar;
      const screenCentreX = left + availableWidth / 2;
      const screenCentreY = top + availableHeight / 2;
      runtime.targetCameraX = centerX - screenCentreX / runtime.targetZoom;
      runtime.targetCameraY = centerY - screenCentreY / runtime.targetZoom;
      return { centerX, centerY };
    }
    const paddedWidth = maxX - minX + FIT_VIEW_PADDING * 2;
    const paddedHeight = maxY - minY + FIT_VIEW_PADDING * 2;
    const zoomX = p.width / paddedWidth;
    const zoomY = p.height / paddedHeight;
    runtime.targetZoom = Math.min(zoomX, zoomY) * FIT_ZOOM_SCALAR;
    runtime.targetCameraX = centerX - p.width / (2 * runtime.targetZoom);
    runtime.targetCameraY = centerY - p.height / (2 * runtime.targetZoom);
    return { centerX, centerY };
  };

  // The home view as last framed, and the collection panel width it left
  // room for, so it can be re-framed when the panel comes or goes.
  let home: { zoom: number; x: number; y: number; panelInset: number } | null =
    null;
  // The focused timeline's framing likewise, to re-frame as its cards load.
  let branchFrame: {
    rowIndex: number;
    bounds: ContentBounds[];
    zoom: number;
    x: number;
    y: number;
    panelInset: number;
  } | null = null;

  const computeFitViewTargets = () => {
    // Item and line sizing is measured against the zoom that frames the whole
    // map — the main timeline and every branch above and below it (collected
    // rows at their settled spacing, row growth 1) — so take that first.
    // The margins leave room for the header (top-left logo and menu) and for
    // the labels hung under and beside the items.
    const wholeMap = computeFitTargetsForBounds(
      [...bounds.getAllBounds(), ...bounds.getCollectedBounds(1)],
      FIT_VIEW_MARGINS_PX
    );
    const wholeMapZoom = wholeMap ? runtime.targetZoom : 1;
    // The view itself starts on the main timeline, spanning the screen
    // beside the collection panel; the branches above and below overflow it
    // until you zoom out.
    const insets = panelInsets(COLLECTION_PANEL_GAP_PX, false, true);
    const panelInset = insets.left + insets.right;
    // Across, it spans every item, the branches' too (something dated before
    // the first main item sits out to its left), so none starts under the
    // panel; up and down it stays on the main timeline.
    const mainBounds = bounds.getAllBounds();
    const across = [...mainBounds];
    const collectedBounds = bounds.getCollectedBounds(1);
    if (mainBounds.length > 0 && collectedBounds.length > 0) {
      const minLeft = Math.min(...collectedBounds.map((b) => b.left));
      const maxRight = Math.max(...collectedBounds.map((b) => b.right));
      across.push(
        { ...mainBounds[0], left: minLeft, right: minLeft, width: 0 },
        { ...mainBounds[0], left: maxRight, right: maxRight, width: 0 }
      );
    }
    const framed = computeFitTargetsForBounds(
      across,
      {
        ...MAIN_FIT_VIEW_MARGINS_PX,
        left: Math.max(MAIN_FIT_VIEW_MARGINS_PX.left, insets.left),
        right: Math.max(MAIN_FIT_VIEW_MARGINS_PX.right, insets.right),
      },
      MAIN_FIT_ZOOM_SCALAR
    );
    if (!framed) {
      runtime.targetZoom = 1;
      runtime.targetCameraX = 0;
      runtime.targetCameraY = MAIN_LINE_Y - p.height / (2 * runtime.targetZoom);
    } else if (collectedBounds.length > 0) {
      // Up and down, the whole map (branches and their labels too) sits
      // centred in the space the header leaves, when it fits; else the main
      // timeline stays centred, the branches running off above and below.
      const all = [...mainBounds, ...collectedBounds];
      const top = Math.min(...all.map((b) => b.top));
      const bottom = Math.max(
        ...all.map((b) => Math.max(b.top + b.height, b.dateBottom))
      );
      const zoom = runtime.targetZoom;
      const space =
        p.height -
        MAIN_FIT_VIEW_MARGINS_PX.top -
        MAIN_FIT_VIEW_MARGINS_PX.bottom;
      const height = (bottom - top) * zoom;
      if (height <= space) {
        runtime.targetCameraY =
          top - (MAIN_FIT_VIEW_MARGINS_PX.top + (space - height) / 2) / zoom;
      }
    }
    runtime.fitZoomLevel = wholeMapZoom;
    runtime.mapZoom = runtime.targetZoom;
    home = {
      zoom: runtime.targetZoom,
      x: runtime.targetCameraX,
      y: runtime.targetCameraY,
      panelInset,
    };
  };

  // The collection panel loads in after the map (and goes once everything's
  // collected): while the view is still on the home framing, re-frame it
  // around the panel as it is now. Checked now and then, not every frame.
  let lastPanelCheckMs = -Infinity;
  const refitHomeForPanel = () => {
    const now = p.millis();
    if (now - lastPanelCheckMs < 250) {
      return;
    }
    lastPanelCheckMs = now;
    if (branchFrame) {
      const stillFramed =
        runtime.focusedBranchRow === branchFrame.rowIndex &&
        runtime.focusTarget === null &&
        Math.abs(runtime.targetZoom - branchFrame.zoom) < 1e-6 &&
        Math.abs(runtime.targetCameraX - branchFrame.x) < 1e-3 &&
        Math.abs(runtime.targetCameraY - branchFrame.y) < 1e-3;
      if (!stillFramed) {
        branchFrame = null;
      } else if (
        Math.abs(
          collectionPanelInset(COLLECTION_PANEL_GAP_PX, true) -
            branchFrame.panelInset
        ) >= 1
      ) {
        frameBranchBounds();
        return;
      }
    }
    if (!home) {
      return;
    }
    const onHome =
      runtime.focusTarget === null &&
      runtime.branchIsolateRow === null &&
      !runtime.isCollectionViewActive &&
      Math.abs(runtime.targetZoom - home.zoom) < 1e-6 &&
      Math.abs(runtime.targetCameraX - home.x) < 1e-3 &&
      Math.abs(runtime.targetCameraY - home.y) < 1e-3;
    if (
      !onHome ||
      Math.abs(
        collectionPanelInset(COLLECTION_PANEL_GAP_PX, false, true) -
          home.panelInset
      ) < 1
    ) {
      return;
    }
    computeFitViewTargets();
    beginViewAnimation(
      runtime.targetCameraX + p.width / (2 * runtime.targetZoom),
      runtime.targetCameraY + p.height / (2 * runtime.targetZoom)
    );
    runtime.viewAnimating = true;
  };

  const computeFocusViewTargets = (focusBounds: ContentBounds) => {
    // Frame the item directly at its detail position — left-aligned, vertically
    // centred, 60vh tall — so the focus is a single zoom with no extra slide.
    const maxWidthScreen =
      p.width * DETAIL_TEXT_VIEWPORT_LEFT -
      DETAIL_TEXT_GAP_PX -
      DETAIL_IMAGE_LEFT_PX;
    let zoom = (p.height * DETAIL_IMAGE_HEIGHT_VH) / focusBounds.height;
    if (focusBounds.width * zoom > maxWidthScreen && maxWidthScreen > 0) {
      zoom = maxWidthScreen / focusBounds.width;
    }
    const itemScreenHeight = focusBounds.height * zoom;
    const targetLeftScreen = DETAIL_IMAGE_LEFT_PX;
    const targetTopScreen = (p.height - itemScreenHeight) / 2;
    runtime.targetZoom = zoom;
    runtime.targetCameraX = focusBounds.left - targetLeftScreen / zoom;
    runtime.targetCameraY = focusBounds.top - targetTopScreen / zoom;
  };

  // Screen px the left column (collection boxes, or a viewed timeline's
  // cards) covers from the canvas's left edge while it's showing, plus a
  // gap, so framing can keep the timeline clear of it.
  // `expectColumn`: count the column as filled even before its contents
  // render — a timeline being viewed always fills it (its "You are viewing"
  // box and item cards), so it's framed for them from the click on, rather
  // than once they appear.
  // `forWorldView`: as the column will be on the world view — its collection
  // boxes, if there are any to show, and not a timeline's cards that are on
  // their way out — so leaving a timeline frames the map once, not again as
  // the column swaps over.
  const panelInsets = (
    gap = COLLECTION_PANEL_GAP_PX,
    expectColumn = false,
    forWorldView = false
  ): { left: number; right: number } => {
    // The column holds collection boxes, or a timeline's "You are viewing"
    // box and item cards: whatever of it is showing.
    const parts = document.querySelectorAll(
      forWorldView
        ? '.collection-card-stack:not(.collection-card-stack--hidden), .timeline-item-card--opened'
        : '.collection-card-stack:not(.collection-card-stack--hidden), .branch-focus-card, .collection-card-list:not(.collection-card-list--hidden) .timeline-item-card'
    );
    const stack =
      expectColumn ||
      (forWorldView &&
        parts.length === 0 &&
        deps.refs.hasCollectionPanelRef.current)
        ? document.querySelector('.top-right-stack')
        : null;
    if (parts.length === 0 && !stack) {
      return { left: 0, right: 0 };
    }
    const canvasRect = (
      p.drawingContext as CanvasRenderingContext2D
    ).canvas.getBoundingClientRect();
    let panelRight = -Infinity;
    parts.forEach((part) => {
      panelRight = Math.max(panelRight, part.getBoundingClientRect().right);
    });
    if (stack) {
      // The column's cards are --top-right-card-width wide:
      // clamp(140px, 18vw, 260px).
      const left = stack.getBoundingClientRect().left;
      const cardWidth = Math.min(260, Math.max(140, window.innerWidth * 0.18));
      panelRight = Math.max(panelRight, left + cardWidth);
    }
    // (The right-hand column, the audio player, is left to float over the
    // map.)
    return {
      left:
        panelRight === -Infinity
          ? 0
          : Math.max(0, panelRight - canvasRect.left + gap),
      right: 0,
    };
  };
  const collectionPanelInset = (
    gap = COLLECTION_PANEL_GAP_PX,
    expectColumn = false,
    forWorldView = false
  ): number => {
    const { left, right } = panelInsets(gap, expectColumn, forWorldView);
    return left + right;
  };

  // Frames a collection view: the viewer's branch with the collection's
  // items on it, and the stretch of main timeline beneath them, in the space
  // the header and the collection panel leave. Returns the framed centre (for
  // the zoom animation anchor), or null when there's nothing to frame.
  const frameIsolatedBranch = (
    rowIndex: number
  ): { x: number; y: number } | null => {
    // Framed as it will settle: with the main and collection items' sizes
    // swapped over.
    const frameAtCurrentZoom = () => {
      const line = bounds.getIsolatedMergedLine(rowIndex, null, 1);
      if (!line) {
        return null;
      }
      // Just the collection's own items: those still to collect, and any the
      // viewer already has, on their branch or the main timeline. (One on the
      // main timeline they haven't collected shows as one to collect, above
      // it; its main-timeline copy isn't counted.)
      const collectionIds = new Set(
        deps.processedPreview.map((preview) => preview.contentId)
      );
      const mainBounds = bounds.getAllBounds(1);
      const collectionRects = [
        ...line.entries
          .filter((entry) => collectionIds.has(entry.contentId))
          .map((entry) => entry.rect),
        ...deps.items.flatMap((item, index) =>
          collectionIds.has(item._id) &&
          deps.refs.collectorsRef.current
            ?.get(item._id)
            ?.some((collector) => collector.username === deps.currentUsername)
            ? [mainBounds[index]]
            : []
        ),
      ];
      // (With nothing of the collection placed, the branch and the main
      // timeline under it — or the whole main timeline.)
      const hasBranch = line.entries.some(
        (entry) => entry.kind === 'collected'
      );
      const fallback = [
        ...line.entries.map((entry) => entry.rect),
        ...mainBounds.filter(
          (b) => !hasBranch || (b.right >= line.minX && b.left <= line.maxX)
        ),
      ];
      // (The pack's own items alone are centred; the main timeline under
      // them may run off the screen's foot.)
      const framed = computeFitTargetsForBounds(
        collectionRects.length > 0 ? collectionRects : fallback,
        // Centred in the space the header, panel and labels leave.
        collectionFrameMargins()
      );
      if (framed) {
        capTargetZoom(framed, Math.max(MAX_ZOOM_LEVEL, runtime.fitZoomLevel));
      }
      return framed;
    };
    // The rows spread apart (and items grow) as the camera zooms out, so
    // measure the layout at the zoom it lands on: frame, lay out again at
    // that zoom, and re-frame, until the zoom settles.
    const liveZoom = runtime.zoom;
    // (Laid out as the map, not as "your items" grid, should that still be
    // fading away from just before.)
    const liveSolo = runtime.branchSolo;
    runtime.branchSolo = 0;
    let framed = frameAtCurrentZoom();
    for (
      let pass = 0;
      framed &&
      pass < 4 &&
      Math.abs(runtime.targetZoom / runtime.zoom - 1) > 1e-3;
      pass++
    ) {
      runtime.zoom = runtime.targetZoom;
      framed = frameAtCurrentZoom();
    }
    runtime.zoom = liveZoom;
    runtime.branchSolo = liveSolo;
    if (!framed) {
      return null;
    }
    return { x: framed.centerX, y: framed.centerY };
  };

  // Margins that allow for the header, the collection panel and the labels
  // hung around the items, for framing within a collection view.
  const collectionFrameMargins = (expectColumn = false) => {
    const insets = panelInsets(COLLECTION_PANEL_GAP_PX, expectColumn);
    return {
      top: COLLECTION_FRAME_TOP_PX,
      bottom: COLLECTION_FRAME_BOTTOM_PX,
      left: COLLECTION_FRAME_SIDE_PX + insets.left,
      right: COLLECTION_FRAME_SIDE_PX + insets.right,
    };
  };

  // Holds a just-framed target zoom to `maxZoom`, keeping the framed centre
  // where it was on screen.
  const capTargetZoom = (
    framed: { centerX: number; centerY: number },
    maxZoom: number
  ) => {
    if (runtime.targetZoom <= maxZoom) {
      return;
    }
    const screenX =
      (framed.centerX - runtime.targetCameraX) * runtime.targetZoom;
    const screenY =
      (framed.centerY - runtime.targetCameraY) * runtime.targetZoom;
    runtime.targetZoom = maxZoom;
    runtime.targetCameraX = framed.centerX - screenX / maxZoom;
    runtime.targetCameraY = framed.centerY - screenY / maxZoom;
  };

  const getFocusBounds = (target: FocusTarget): ContentBounds => {
    if (target.lane === 'main') {
      return bounds.getAllBounds()[target.index];
    }
    // While isolating, an item (collected or collectible) is drawn at its
    // straightened even-spaced position, so the focus must aim there — not
    // its branch position (collected) or it wouldn't otherwise have one
    // (collectible, which only exists while isolating).
    if (runtime.branchIsolateRow !== null) {
      const line = bounds.getIsolatedMergedLine(runtime.branchIsolateRow);
      const found = line?.entries.find(
        (entry) => entry.kind === target.lane && entry.index === target.index
      );
      if (found) {
        return found.rect;
      }
    }
    if (target.lane === 'preview') {
      // Collectibles only ever have a position while isolating (above); this
      // is unreachable in practice, but keeps the return type non-nullable.
      return bounds.getAllBounds()[0];
    }
    // Settled (row-growth 1) position: focusing zooms in past the fit level,
    // where the collected rows have eased back to their base spacing, so the
    // camera must aim where the item ends up — not its spread-out position at
    // the current zoomed-out level, which would leave the focus on empty space.
    return bounds.getCollectedBounds(1)[target.index];
  };

  const applyViewTargets = () => {
    runtime.cameraX = runtime.targetCameraX;
    runtime.cameraY = runtime.targetCameraY;
    runtime.zoom = runtime.targetZoom;
  };

  const syncViewTargets = () => {
    runtime.targetCameraX = runtime.cameraX;
    runtime.targetCameraY = runtime.cameraY;
    runtime.targetZoom = runtime.zoom;
    runtime.viewAnimating = false;
  };

  // The collection panel's inset, measured now and then rather than on every
  // clamp (it reads the page layout).
  let panelInset = { value: { left: 0, right: 0 }, atMs: -Infinity };
  const cachedPanelInset = () => {
    const now = p.millis();
    if (now - panelInset.atMs > 250) {
      panelInset = { value: panelInsets(), atMs: now };
    }
    return panelInset.value;
  };

  // The world-space rectangle covering every item (main + collected), padded so
  // a little breathing room shows past the outermost items. The camera is kept
  // inside this so the user can't pan off into empty space.
  const getContentExtent = (): {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  } | null => {
    // A timeline shown alone scrolls only up and down its grid, held to the
    // width it's framed at.
    const area = runtime.branchSoloActive ? runtime.soloGridArea : null;
    if (area) {
      const margins = soloGridMargins();
      const gridMinX = area.left - margins.left / runtime.zoom;
      const gridMinY = area.top - margins.top / runtime.zoom;
      return {
        minX: gridMinX,
        maxX: gridMinX + p.width / runtime.zoom,
        minY: gridMinY,
        maxY: Math.max(
          area.bottom + margins.bottom / runtime.zoom,
          gridMinY + p.height / runtime.zoom
        ),
      };
    }
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const b of [
      ...bounds.getAllBounds(),
      ...bounds.getCollectedBounds(),
    ]) {
      minX = Math.min(minX, b.left);
      maxX = Math.max(maxX, b.right);
      minY = Math.min(minY, b.top);
      maxY = Math.max(maxY, b.dateBottom);
    }
    if (!Number.isFinite(minX)) {
      return null;
    }
    // Extra headroom on top of the usual padding on every side, so
    // dragging/zooming can't pull content up underneath the fixed
    // user-card/mini-player stack (or flush against any other edge) — matches
    // the clearance the default fit view already leaves on top.
    const extraClearance = FIT_VIEW_TOP_CLEARANCE_PX / runtime.zoom;
    // Either end can come out from under the collection panel.
    const insets = cachedPanelInset();
    return {
      minX:
        minX -
        FIT_VIEW_PADDING -
        Math.max(extraClearance, insets.left / runtime.zoom),
      maxX:
        maxX +
        FIT_VIEW_PADDING +
        Math.max(extraClearance, insets.right / runtime.zoom),
      minY: minY - FIT_VIEW_PADDING - extraClearance,
      maxY: maxY + FIT_VIEW_PADDING + extraClearance,
    };
  };

  // Clamp one axis so the viewport stays within [contentMin, contentMax].
  // When the content is smaller than the viewport on that axis, the camera is
  // free to sit anywhere that still keeps the content fully in view (from
  // flush against the near edge to flush against the far edge) rather than
  // forced to one exact centred point — a fixed point would fight (and get
  // overridden every frame by) anchor-based zooming/panning once zoomed out
  // past the content's own size, snapping the camera away from the cursor.
  const clampAxis = (
    camera: number,
    viewSize: number,
    contentMin: number,
    contentMax: number
  ): number => {
    const contentSize = contentMax - contentMin;
    if (contentSize <= viewSize) {
      return Math.max(contentMax - viewSize, Math.min(camera, contentMin));
    }
    return Math.max(contentMin, Math.min(camera, contentMax - viewSize));
  };

  // Whether every item (and its label room) is on screen at the current
  // zoom, beside the collection panel — on the map, not a grid or an item.
  const wholeMapOnScreen = (): boolean => {
    if (
      runtime.branchSoloActive ||
      runtime.focusTarget !== null ||
      runtime.branchIsolateActive
    ) {
      return false;
    }
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const b of [
      ...bounds.getAllBounds(),
      ...bounds.getCollectedBounds(),
    ]) {
      minX = Math.min(minX, b.left);
      maxX = Math.max(maxX, b.right);
      minY = Math.min(minY, b.top);
      maxY = Math.max(maxY, b.dateBottom);
    }
    if (!Number.isFinite(minX)) {
      return false;
    }
    const toScreenX = (x: number) => (x - runtime.cameraX) * runtime.zoom;
    const toScreenY = (y: number) => (y - runtime.cameraY) * runtime.zoom;
    return (
      toScreenX(minX) >= panelInsets(0).left &&
      toScreenX(maxX) <= p.width - panelInsets(0).right &&
      toScreenY(minY) >= 0 &&
      toScreenY(maxY) <= p.height
    );
  };

  // Keep the camera inside the timeline's content so panning/zooming can't
  // stray into empty space.
  const clampCameraToContent = () => {
    const extent = getContentExtent();
    if (!extent) {
      return;
    }
    const viewW = p.width / runtime.zoom;
    const viewH = p.height / runtime.zoom;
    runtime.cameraX = clampAxis(
      runtime.cameraX,
      viewW,
      extent.minX,
      extent.maxX
    );
    runtime.cameraY = clampAxis(
      runtime.cameraY,
      viewH,
      extent.minY,
      extent.maxY
    );
  };

  // Nudges the eased pan target by a screen-space delta (clamped to the
  // content), shared by drag-panning and scroll-wheel panning so both ease
  // toward their target identically via animatePan. Rebases the target from
  // the live camera first if nothing is currently mid-ease — either the
  // previous pan has settled, or the camera moved via zoom/focus/fit since —
  // so a fresh gesture never resumes from a stale, abandoned target.
  const nudgePanTarget = (deltaX: number, deltaY: number) => {
    // With the whole map already on screen (clear of the collection panel),
    // there's nowhere to drag it to.
    if (wholeMapOnScreen()) {
      return;
    }
    if (!runtime.panning) {
      runtime.panTargetCameraX = runtime.cameraX;
      runtime.panTargetCameraY = runtime.cameraY;
    }
    // A pan gesture takes over from any in-flight wheel-zoom so the two
    // eases don't fight over the camera.
    runtime.zooming = false;

    runtime.panTargetCameraX += deltaX / runtime.zoom;
    runtime.panTargetCameraY += deltaY / runtime.zoom;

    const extent = getContentExtent();
    if (extent) {
      const viewW = p.width / runtime.zoom;
      const viewH = p.height / runtime.zoom;
      runtime.panTargetCameraX = clampAxis(
        runtime.panTargetCameraX,
        viewW,
        extent.minX,
        extent.maxX
      );
      runtime.panTargetCameraY = clampAxis(
        runtime.panTargetCameraY,
        viewH,
        extent.minY,
        extent.maxY
      );
    }

    runtime.panning = true;
  };

  // Dragging the canvas eases toward the drag target just like scroll-wheel
  // panning, via animatePan.
  const panView = (deltaScreenX: number, deltaScreenY: number) => {
    nudgePanTarget(-deltaScreenX, -deltaScreenY);
  };

  // Free continuous panning across the timeline: each wheel event nudges the
  // same eased pan target as dragging (clamped to the content), and animatePan
  // eases the actual camera toward it every frame so the motion is smoothed
  // rather than jumping straight to each delta.
  const scrollView = (deltaX: number, deltaY: number) => {
    if (isViewInteractionLocked(runtime)) {
      return;
    }
    nudgePanTarget(deltaX, deltaY);
    resetCanvasFocus(runtime);
  };

  const animatePan = () => {
    if (!runtime.panning) {
      return;
    }

    const nextX =
      runtime.cameraX + (runtime.panTargetCameraX - runtime.cameraX) * PAN_LERP;
    const nextY =
      runtime.cameraY + (runtime.panTargetCameraY - runtime.cameraY) * PAN_LERP;

    const settled =
      Math.abs(runtime.panTargetCameraX - nextX) * runtime.zoom <
        PAN_SETTLE_THRESHOLD_PX &&
      Math.abs(runtime.panTargetCameraY - nextY) * runtime.zoom <
        PAN_SETTLE_THRESHOLD_PX;

    if (settled) {
      runtime.cameraX = runtime.panTargetCameraX;
      runtime.cameraY = runtime.panTargetCameraY;
      runtime.panning = false;
    } else {
      runtime.cameraX = nextX;
      runtime.cameraY = nextY;
    }
    syncViewTargets();
  };

  // Wheel/pinch zoom: each tick nudges an eased zoom target, anchored on the
  // point currently under the cursor. animateZoom eases the actual zoom
  // toward that target every frame, recomputing the camera each frame so the
  // anchor point stays fixed on screen as it zooms in/out. Zooming out is
  // capped relative to the fit-to-screen level (so you can't zoom out past
  // seeing the whole timeline); zooming in is capped at a fixed absolute
  // level (MAX_ZOOM_LEVEL) so the closest zoom looks the same regardless of
  // how zoomed-out the default fit view is for a given timeline's size —
  // but never tighter than the fit level itself, so a sparse timeline (whose
  // fit zoom already exceeds MAX_ZOOM_LEVEL) isn't immediately over the cap.
  const zoomViewAt = (screenX: number, screenY: number, delta: number) => {
    if (isViewInteractionLocked(runtime)) {
      return;
    }

    const minZoom = runtime.fitZoomLevel * MIN_ZOOM_FACTOR;
    const maxZoom = Math.max(MAX_ZOOM_LEVEL, runtime.fitZoomLevel);
    const zoomFactor = Math.exp(-delta * WHEEL_ZOOM_SENSITIVITY);
    // Rebase from the live zoom if nothing is currently mid-ease, same
    // rebase pattern as nudgePanTarget.
    const base = runtime.zooming ? runtime.zoomTargetZoom : runtime.zoom;
    runtime.zoomTargetZoom = Math.max(
      minZoom,
      Math.min(maxZoom, base * zoomFactor)
    );

    // Re-anchor on the cursor's current world point every tick, so the
    // pinned point tracks the cursor even if it drifts slightly mid-gesture.
    runtime.zoomAnchorWorldX = screenX / runtime.zoom + runtime.cameraX;
    runtime.zoomAnchorWorldY = screenY / runtime.zoom + runtime.cameraY;
    runtime.zoomAnchorScreenX = screenX;
    runtime.zoomAnchorScreenY = screenY;

    // A zoom gesture takes over from any in-flight pan so the two eases
    // don't fight over the camera.
    runtime.panning = false;
    runtime.panTargetCameraX = runtime.cameraX;
    runtime.panTargetCameraY = runtime.cameraY;
    resetCanvasFocus(runtime);
    runtime.zooming = true;
  };

  const animateZoom = () => {
    if (!runtime.zooming) {
      return;
    }

    const nextZoom =
      runtime.zoom + (runtime.zoomTargetZoom - runtime.zoom) * ZOOM_LERP;
    const settled =
      Math.abs(runtime.zoomTargetZoom - nextZoom) < ZOOM_SETTLE_THRESHOLD;
    const appliedZoom = settled ? runtime.zoomTargetZoom : nextZoom;

    runtime.cameraX =
      runtime.zoomAnchorWorldX - runtime.zoomAnchorScreenX / appliedZoom;
    runtime.cameraY =
      runtime.zoomAnchorWorldY - runtime.zoomAnchorScreenY / appliedZoom;
    runtime.zoom = appliedZoom;
    clampCameraToContent();
    // Keep the pan target in sync so a following drag/scroll starts smoothly
    // from here instead of the pre-zoom position.
    runtime.panTargetCameraX = runtime.cameraX;
    runtime.panTargetCameraY = runtime.cameraY;
    syncViewTargets();

    if (settled) {
      runtime.zooming = false;
    }
  };

  const fitView = () => {
    clearBranchFocus();
    runtime.panning = false;
    runtime.zooming = false;
    resetCanvasFocus(runtime);
    computeFitViewTargets();
    applyViewTargets();
    runtime.panTargetCameraX = runtime.cameraX;
    runtime.panTargetCameraY = runtime.cameraY;
    runtime.viewAnimating = false;
    runtime.viewUnfocusing = false;
  };

  // Initial-load entrance: starts zoomed out from the fit view's own centre
  // and eases in to it, rather than the timeline just appearing already
  // framed. Uses the same zoom-anchored animation as focusing an item.
  const playEntranceAnimation = () => {
    clearBranchFocus();
    runtime.panning = false;
    runtime.zooming = false;
    resetCanvasFocus(runtime);
    computeFitViewTargets();

    const worldX = runtime.targetCameraX + p.width / (2 * runtime.targetZoom);
    const worldY = runtime.targetCameraY + p.height / (2 * runtime.targetZoom);
    runtime.zoom = runtime.targetZoom * ENTRANCE_ZOOM_START_FACTOR;
    runtime.cameraX = worldX - p.width / (2 * runtime.zoom);
    runtime.cameraY = worldY - p.height / (2 * runtime.zoom);
    runtime.panTargetCameraX = runtime.cameraX;
    runtime.panTargetCameraY = runtime.cameraY;

    beginViewAnimation(worldX, worldY);
    runtime.viewAnimating = true;
    runtime.viewUnfocusing = false;
  };

  const startCollectReturn = (
    collectedIndex: number,
    rect: DetailImageRect
  ) => {
    const roughBounds = bounds.getCollectedBounds()[collectedIndex];
    if (!roughBounds || roughBounds.width <= 0) {
      return false;
    }
    clearBranchFocus();
    runtime.panning = false;
    runtime.zooming = false;
    resetCanvasFocus(runtime);
    deps.refs.onContentUnfocusRef.current?.();
    runtime.focusContentFade = 0;
    notifyFocusFade(deps);
    const wasIsolating = runtime.branchIsolateActive;
    runtime.branchIsolateActive = false;
    runtime.branchIsolate = 0;
    runtime.branchIsolateRow = null;
    runtime.branchDimStrength = 0;
    runtime.branchDimRow = null;
    runtime.collectStartMs = null;
    runtime.collectIndex = -1;
    runtime.collectReported = false;
    computeFitViewTargets();
    if (wasIsolating) {
      deps.refs.onBranchIsolationExitRef.current?.();
    }
    runtime.zoom = rect.width / roughBounds.width;
    const itemBounds = bounds.getCollectedBounds()[collectedIndex];
    runtime.zoom = rect.width / itemBounds.width;
    runtime.cameraX = itemBounds.left - rect.left / runtime.zoom;
    runtime.cameraY = itemBounds.top - rect.top / runtime.zoom;
    runtime.panTargetCameraX = runtime.cameraX;
    runtime.panTargetCameraY = runtime.cameraY;
    runtime.viewAnimating = false;
    runtime.viewUnfocusing = false;
    runtime.collectReturnIndex = collectedIndex;
    runtime.collectReturnWaitStartMs = p.millis();
    runtime.collectReturnStartMs = null;
    syncInteractionLock(deps);
    return true;
  };

  // Collects a collection item: by default only the one being viewed (a
  // click on it in its detail view); `fromPanel` (a click on its title in
  // the collection panel) collects it straight from the collection view.
  const startPreviewCollect = (
    previewIndex: number,
    fromPanel = false
  ): boolean => {
    const item = deps.processedPreview[previewIndex];
    if (
      !item ||
      runtime.collectStartMs !== null ||
      (!fromPanel &&
        (runtime.viewAnimating ||
          runtime.focusTarget?.lane !== 'preview' ||
          runtime.focusTarget.index !== previewIndex))
    ) {
      return false;
    }
    // Settle wherever a hover zoom had got to, so the item flies in from
    // where it's shown.
    runtime.viewAnimating = false;
    runtime.collectStartMs = p.millis();
    runtime.collectIndex = previewIndex;
    runtime.collectReported = false;
    deps.refs.onPreviewCollectStartRef.current?.(item.contentId);
    return true;
  };

  // A click on a collection item's title in its panel. One not collected yet
  // is collected (which ends back out on the full map); one the viewer
  // already has just takes them back out to the full map.
  const collectFocusedPreviewContentId = (contentId: string) => {
    const row = runtime.branchIsolateRow;
    const entry =
      row === null
        ? undefined
        : bounds
            .getIsolatedMergedLine(row)
            ?.entries.find(
              (e) => e.kind === 'preview' && e.contentId === contentId
            );
    if (entry) {
      startPreviewCollect(entry.index, true);
      return;
    }
    showFullMap();
  };

  // Back out to the full map (when a collected item fails to land on the
  // viewer's timeline).
  const animateToFitView = () => {
    runtime.panning = false;
    runtime.zooming = false;
    computeFitViewTargets();
    beginViewAnimation(
      runtime.targetCameraX + p.width / (2 * runtime.targetZoom),
      runtime.targetCameraY + p.height / (2 * runtime.targetZoom)
    );
    runtime.slowViewAnimation = true;
    runtime.viewAnimating = true;
    runtime.viewUnfocusing = false;
  };

  const animateView = () => {
    if (!runtime.viewAnimating) {
      if (runtime.focusTarget && !runtime.viewUnfocusing) {
        runtime.focusContentFade = 1;
        if (runtime.detailPhase === 'none') {
          startDetailReveal(runtime, runtime.focusTarget, deps);
        }
      } else if (!runtime.focusTarget && !runtime.viewUnfocusing) {
        runtime.focusContentFade = 0;
      }
      return;
    }

    const lerpFactor = runtime.slowViewAnimation
      ? COLLECT_RETURN_ZOOM_LERP
      : runtime.viewUnfocusing
      ? VIEW_UNFOCUS_ANIMATION_LERP
      : VIEW_ANIMATION_LERP;
    const lerp = (current: number, target: number) =>
      current + (target - current) * lerpFactor;

    if (Math.abs(runtime.zoom - runtime.targetZoom) > VIEW_SNAP_THRESHOLD) {
      const nextZoom = lerp(runtime.zoom, runtime.targetZoom);
      const progress = getAnimationProgress(nextZoom);
      // Where the anchor world point lands on screen under the final target —
      // not necessarily the viewport centre, so off-centre framings animate
      // smoothly instead of jumping at the end.
      const finalScreenX =
        (runtime.animationWorldX - runtime.targetCameraX) * runtime.targetZoom;
      const finalScreenY =
        (runtime.animationWorldY - runtime.targetCameraY) * runtime.targetZoom;
      const screenX =
        runtime.animationStartScreenX +
        (finalScreenX - runtime.animationStartScreenX) * progress;
      const screenY =
        runtime.animationStartScreenY +
        (finalScreenY - runtime.animationStartScreenY) * progress;
      setCameraFromScreenAnchor(
        runtime.animationWorldX,
        runtime.animationWorldY,
        screenX,
        screenY,
        nextZoom
      );
      if (runtime.focusTarget && !runtime.viewUnfocusing) {
        runtime.focusContentFade = progress;
      } else if (runtime.viewUnfocusing) {
        runtime.focusContentFade = 1 - progress;
      }
      notifyFocusFade(deps);
    } else if (
      Math.hypot(
        runtime.targetCameraX - runtime.cameraX,
        runtime.targetCameraY - runtime.cameraY
      ) *
        runtime.targetZoom >
      PAN_SETTLE_THRESHOLD_PX
    ) {
      // Zoom has settled but the camera hasn't: ease it straight to the target.
      // This is the path when switching between two items framed at the same
      // zoom (e.g. clicking a node) — otherwise the view would cut, since the
      // zoom-driven progress above completes instantly with no pan.
      runtime.zoom = runtime.targetZoom;
      runtime.cameraX = lerp(runtime.cameraX, runtime.targetCameraX);
      runtime.cameraY = lerp(runtime.cameraY, runtime.targetCameraY);
      const totalPan = Math.hypot(
        runtime.targetCameraX - runtime.animationStartCameraX,
        runtime.targetCameraY - runtime.animationStartCameraY
      );
      const remainingPan = Math.hypot(
        runtime.targetCameraX - runtime.cameraX,
        runtime.targetCameraY - runtime.cameraY
      );
      const progress =
        totalPan > 0
          ? Math.max(0, Math.min(1, 1 - remainingPan / totalPan))
          : 1;
      if (runtime.focusTarget && !runtime.viewUnfocusing) {
        runtime.focusContentFade = progress;
      } else if (runtime.viewUnfocusing) {
        runtime.focusContentFade = 1 - progress;
      }
      notifyFocusFade(deps);
    } else {
      applyViewTargets();
      const wasUnfocusing = runtime.viewUnfocusing;
      runtime.viewAnimating = false;
      runtime.viewUnfocusing = false;
      runtime.slowViewAnimation = false;
      if (runtime.focusTarget && !wasUnfocusing) {
        runtime.focusContentFade = 1;
        if (runtime.detailPhase === 'none') {
          startDetailReveal(runtime, runtime.focusTarget, deps);
        }
      } else if (wasUnfocusing) {
        runtime.focusContentFade = 0;
      }
      notifyFocusFade(deps);
    }
  };

  const findClickedItem = (
    worldX: number,
    worldY: number
  ): FocusTarget | null => {
    const allBounds = bounds.getAllBounds();
    const collectedBounds = bounds.getCollectedBounds();
    // Showing one timeline alone, only the items in its grid can be clicked.
    const soloGrid = runtime.branchSoloActive ? runtime.soloGrid : null;
    for (let index = deps.processed.length - 1; index >= 0; index--) {
      if (soloGrid && !soloGrid.has(`main:${index}`)) {
        continue;
      }
      if (hitTest(allBounds[index], worldX, worldY)) {
        return { lane: 'main', index };
      }
    }

    for (let index = deps.processedCollected.length - 1; index >= 0; index--) {
      if (soloGrid && !soloGrid.has(`collected:${index}`)) {
        continue;
      }
      if (hitTest(collectedBounds[index], worldX, worldY)) {
        return { lane: 'collected', index };
      }
    }

    return null;
  };

  // Record which branch the view is zoomed into and tell React, so it can show
  // (or hide) the top-bar label. Passing null clears it.
  const setBranchFocus = (rowIndex: number | null) => {
    runtime.focusedBranchRow = rowIndex;
    if (rowIndex === null) {
      // Leaving the branch brings everything else back.
      runtime.branchSoloActive = false;
      deps.refs.onBranchFocusRef.current?.(null);
      return;
    }
    let info: BranchFocusInfo | null = null;
    for (const item of deps.processedCollected) {
      const source = item.sources.find((s) => s.rowIndex === rowIndex);
      if (source) {
        info = {
          username: source.username,
          colour: source.colour,
          own: source.username === deps.currentUsername,
          mainItemIds: [
            ...bounds.getBranchMainItems(
              rowIndex,
              bounds.getAllBounds(),
              bounds.getCollectedBounds()
            ),
          ].map((index) => deps.items[index]._id),
        };
        break;
      }
    }
    deps.refs.onBranchFocusRef.current?.(info);
  };

  const clearBranchFocus = () => {
    if (runtime.focusedBranchRow !== null) {
      setBranchFocus(null);
    }
  };

  // A click landing on a collector's branch line (not an item) returns that
  // collector's row index, so the view can frame just their timeline.
  const findClickedBranch = (worldX: number, worldY: number): number | null => {
    const hover = computeCollectedLaneHover(
      deps,
      bounds,
      bounds.getCollectedBounds(),
      bounds.getAllBounds(),
      { x: worldX, y: worldY },
      false
    );
    return hover.hoveredCollectedIsImage ? null : hover.hoveredUserRow;
  };

  // Zoom/pan so the items collected on one branch (rowIndex) fill the screen.
  // This is a camera move only — no item focus / detail panel.
  const focusBranch = (rowIndex: number) => {
    const collectedBounds = bounds.getCollectedBounds();
    const mainBounds = bounds.getAllBounds();
    const branchItems = deps.processedCollected
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item.sources.some((s) => s.rowIndex === rowIndex));
    if (branchItems.length === 0) {
      return;
    }

    const branchBounds = branchItems.map(({ index }) => collectedBounds[index]);

    // Also frame the main-line items the branch springs from / rejoins (the
    // item before each pick and the one after it), so the branch's origin on
    // the main timeline is visible too.
    const mainIndices = new Set<number>();
    for (const { item } of branchItems) {
      const prev = Math.max(0, bounds.getPreviousMainIndex(item.anchorTime));
      mainIndices.add(prev);
      if (prev + 1 < mainBounds.length) {
        mainIndices.add(prev + 1);
      }
    }
    for (const index of mainIndices) {
      branchBounds.push(mainBounds[index]);
    }

    resetCanvasFocus(runtime);
    deps.refs.onContentUnfocusRef.current?.();
    runtime.focusContentFade = 0;
    notifyFocusFade(deps);
    runtime.panning = false;
    runtime.zooming = false;
    runtime.viewUnfocusing = false;
    syncInteractionLock(deps);

    branchFrame = {
      rowIndex,
      bounds: branchBounds,
      x: 0,
      y: 0,
      zoom: 0,
      panelInset: 0,
    };
    if (!frameBranchBounds()) {
      branchFrame = null;
      return;
    }
    setBranchFocus(rowIndex);
  };

  // Frames the focused timeline beside the left column (its item cards come
  // in just after the click, so this runs again when the column changes).
  const frameBranchBounds = (): boolean => {
    if (!branchFrame) {
      return false;
    }
    // Framed beside the column when it's showing (else across the screen),
    // with room for the header and labels.
    const center = computeFitTargetsForBounds(
      branchFrame.bounds,
      collectionFrameMargins(true)
    );
    if (!center) {
      return false;
    }
    // Don't zoom past the manual zoom ceiling for a tiny branch; keep the
    // framed centre.
    const maxZoom = Math.max(MAX_ZOOM_LEVEL, runtime.fitZoomLevel);
    if (runtime.targetZoom > maxZoom) {
      runtime.targetZoom = maxZoom;
      runtime.targetCameraX =
        center.centerX - p.width / (2 * runtime.targetZoom);
      runtime.targetCameraY =
        center.centerY - p.height / (2 * runtime.targetZoom);
    }
    branchFrame.x = runtime.targetCameraX;
    branchFrame.y = runtime.targetCameraY;
    branchFrame.zoom = runtime.targetZoom;
    branchFrame.panelInset = collectionPanelInset(
      COLLECTION_PANEL_GAP_PX,
      true
    );
    beginViewAnimation(center.centerX, center.centerY);
    runtime.viewAnimating = true;
    return true;
  };

  // Screen margins around a timeline's grid: the header's room above, the
  // collection panel's beside.
  const soloGridMargins = () => ({
    ...collectionFrameMargins(),
    top: SOLO_GRID_TOP_PX,
    bottom: SOLO_GRID_BOTTOM_PX,
  });
  // Where the grid was scrolled to when an item was opened from it, to come
  // back to.
  let soloScrollY: number | null = null;

  // Frames a timeline shown alone: its grid spanning the width between the
  // margins, from its top (or where it was last scrolled to). Returns the
  // framed centre, or null when there's no grid.
  const frameSoloGrid = (): { x: number; y: number } | null => {
    const area = runtime.soloGridArea;
    if (!area) {
      return null;
    }
    const margins = soloGridMargins();
    const zoom =
      Math.max(1, p.width - margins.left - margins.right) /
      Math.max(1, area.right - area.left);
    runtime.targetZoom = zoom;
    runtime.targetCameraX = area.left - margins.left / zoom;
    const topY = area.top - margins.top / zoom;
    const bottomY = Math.max(
      topY,
      area.bottom + margins.bottom / zoom - p.height / zoom
    );
    runtime.targetCameraY = Math.min(
      bottomY,
      Math.max(topY, soloScrollY ?? topY)
    );
    return {
      x: runtime.targetCameraX + p.width / (2 * zoom),
      y: runtime.targetCameraY + p.height / (2 * zoom),
    };
  };

  // The viewer's own timeline (from "Your items" in the menu), highlighted
  // just as clicking it on the map would; back to the full map when they
  // haven't collected anything.
  const soloOwnBranch = () => {
    const username = deps.currentUsername;
    const row = deps.processedCollected
      .flatMap((item) => item.sources)
      .find((source) => source.username === username)?.rowIndex;
    if (row === undefined) {
      showFullMap();
      return;
    }
    // Leaving a collection that's open for it: the collection closes (its
    // box too).
    if (runtime.branchIsolateActive) {
      runtime.branchIsolateActive = false;
      deps.refs.onBranchIsolationExitRef.current?.();
    }
    // Just as clicking their own line on the map would.
    focusBranch(row);
  };

  const focusItem = (target: FocusTarget) => {
    if (isPrivateTarget(deps, target)) {
      return;
    }
    // Opening an item from a timeline shown alone keeps it (and its grid)
    // underneath, to come back to.
    if (runtime.branchSoloActive) {
      soloScrollY = runtime.cameraY;
    } else {
      clearBranchFocus();
    }
    // Focusing an item from the isolated view keeps the isolation active
    // underneath (the branch stays straightened and the others stay faded), so
    // getFocusBounds aims at the item's straightened position and unfocusing
    // returns to the isolated timeline rather than the full one.
    runtime.panning = false;
    runtime.zooming = false;
    runtime.detailPhase = 'none';
    runtime.detailLayout = 0;
    runtime.focusContentFade = 0;
    notifyFocusFade(deps);
    runtime.focusTarget = target;
    runtime.viewUnfocusing = false;
    syncInteractionLock(deps);
    const slug = getFocusedSlug(target, deps);
    if (slug) {
      deps.refs.onContentFocusRef.current?.(slug);
    }
    const focusBounds = getFocusBounds(target);
    computeFocusViewTargets(focusBounds);
    beginViewAnimation(
      (focusBounds.left + focusBounds.right) / 2,
      focusBounds.top + focusBounds.height / 2
    );
    runtime.viewAnimating = true;
    // Start the detail reveal immediately so the image slides into its
    // bottom-left position as it zooms in — a single motion rather than a
    // centred zoom followed by a separate slide.
    startDetailReveal(runtime, target, deps);
  };

  const unfocusItem = () => {
    const soloCentre = runtime.branchSoloActive ? frameSoloGrid() : null;
    if (!soloCentre) {
      clearBranchFocus();
    }
    resetCanvasFocus(runtime);
    deps.refs.onContentUnfocusRef.current?.();
    runtime.panning = false;
    runtime.zooming = false;
    runtime.viewUnfocusing = true;
    // An item opened from a timeline shown alone closes back to its grid.
    if (soloCentre) {
      syncInteractionLock(deps);
      beginViewAnimation(soloCentre.x, soloCentre.y);
      runtime.viewAnimating = true;
      return;
    }
    // If an item was focused from within the isolated view, unfocusing returns
    // to that isolated branch, not the full timeline.
    if (runtime.branchIsolateRow !== null) {
      const centre = frameIsolatedBranch(runtime.branchIsolateRow);
      syncInteractionLock(deps);
      beginViewAnimation(centre?.x ?? p.width / 2, centre?.y ?? MAIN_LINE_Y);
      runtime.viewAnimating = true;
      return;
    }
    computeFitViewTargets();
    syncInteractionLock(deps);
    beginViewAnimation(
      runtime.targetCameraX + p.width / (2 * runtime.targetZoom),
      runtime.targetCameraY + p.height / (2 * runtime.targetZoom)
    );
    runtime.viewAnimating = true;
  };

  const panToFocusBounds = (
    focusBounds: ContentBounds,
    maxZoom: number = Math.max(MAX_ZOOM_LEVEL, runtime.fitZoomLevel)
  ) => {
    const center = computeFitTargetsForBounds([focusBounds]);
    if (!center) {
      return;
    }
    if (runtime.targetZoom > maxZoom) {
      runtime.targetZoom = maxZoom;
      runtime.targetCameraX =
        center.centerX - p.width / (2 * runtime.targetZoom);
      runtime.targetCameraY =
        center.centerY - p.height / (2 * runtime.targetZoom);
    }
    runtime.panning = false;
    runtime.zooming = false;
    beginViewAnimation(center.centerX, center.centerY);
    runtime.viewAnimating = true;
  };

  const previewFocusItem = (target: FocusTarget) => {
    if (isViewInteractionLocked(runtime) || isPrivateTarget(deps, target)) {
      return;
    }
    panToFocusBounds(getFocusBounds(target));
  };

  const clearPreviewFocus = () => {
    if (isViewInteractionLocked(runtime)) {
      return;
    }
    runtime.panning = false;
    runtime.zooming = false;
    if (runtime.isCollectionViewActive) {
      frameOwnBranchWide();
      return;
    }
    computeFitViewTargets();
    beginViewAnimation(
      runtime.targetCameraX + p.width / (2 * runtime.targetZoom),
      runtime.targetCameraY + p.height / (2 * runtime.targetZoom)
    );
    runtime.viewAnimating = true;
  };

  const resolveContentFocusTarget = (contentId: string): FocusTarget | null => {
    const collectedIndex = deps.processedCollected.findIndex(
      (item) => item.contentId === contentId
    );
    if (collectedIndex >= 0) {
      return { lane: 'collected', index: collectedIndex };
    }
    const mainIndex = deps.items.findIndex((item) => item._id === contentId);
    if (mainIndex >= 0) {
      return { lane: 'main', index: mainIndex };
    }
    const previewIndex = deps.processedPreview.findIndex(
      (item) => item.contentId === contentId
    );
    if (previewIndex >= 0) {
      return { lane: 'preview', index: previewIndex };
    }
    return null;
  };

  const previewContentId = (contentId: string) => {
    const target = resolveContentFocusTarget(contentId);
    if (target) {
      previewFocusItem(target);
    }
  };

  const focusContentId = (contentId: string) => {
    const target = resolveContentFocusTarget(contentId);
    if (target) {
      focusItem(target);
    }
  };

  const getOwnBranchRow = (): number => {
    if (!deps.currentUsername) {
      return -1;
    }
    for (const item of deps.processedCollected) {
      const source = item.sources.find(
        (s) => s.username === deps.currentUsername
      );
      if (source) {
        return source.rowIndex;
      }
    }
    return -1;
  };

  const frameOwnBranchWide = () => {
    if (isViewInteractionLocked(runtime)) {
      return;
    }
    const ownRow = getOwnBranchRow();
    const collectedBounds = bounds.getCollectedBounds();
    const mainBounds = bounds.getAllBounds();
    const branchItems =
      ownRow >= 0
        ? deps.processedCollected
            .map((item, index) => ({ item, index }))
            .filter(({ item }) =>
              item.sources.some((s) => s.rowIndex === ownRow)
            )
        : [];

    let center: { centerX: number; centerY: number } | null = null;
    if (branchItems.length > 0) {
      const branchBounds = branchItems.map(
        ({ index }) => collectedBounds[index]
      );
      const mainIndices = new Set<number>();
      for (const { item } of branchItems) {
        const prev = Math.max(0, bounds.getPreviousMainIndex(item.anchorTime));
        mainIndices.add(prev);
        if (prev + 1 < mainBounds.length) {
          mainIndices.add(prev + 1);
        }
      }
      for (const index of mainIndices) {
        branchBounds.push(mainBounds[index]);
      }
      center = computeFitTargetsForBounds(branchBounds);
    }

    if (!center) {
      computeFitViewTargets();
      runtime.panning = false;
      runtime.zooming = false;
      beginViewAnimation(
        runtime.targetCameraX + p.width / (2 * runtime.targetZoom),
        runtime.targetCameraY + p.height / (2 * runtime.targetZoom)
      );
      runtime.viewAnimating = true;
      return;
    }

    const maxZoom = Math.max(MAX_ZOOM_LEVEL, runtime.fitZoomLevel);
    if (runtime.targetZoom > maxZoom) {
      runtime.targetZoom = maxZoom;
      runtime.targetCameraX =
        center.centerX - p.width / (2 * runtime.targetZoom);
      runtime.targetCameraY =
        center.centerY - p.height / (2 * runtime.targetZoom);
    }
    runtime.panning = false;
    runtime.zooming = false;
    beginViewAnimation(center.centerX, center.centerY);
    runtime.viewAnimating = true;
  };

  const setCollectionViewActive = (active: boolean) => {
    runtime.isCollectionViewActive = active;
    if (isViewInteractionLocked(runtime)) {
      return;
    }
    if (active) {
      frameOwnBranchWide();
    } else {
      runtime.panning = false;
      runtime.zooming = false;
      computeFitViewTargets();
      beginViewAnimation(
        runtime.targetCameraX + p.width / (2 * runtime.targetZoom),
        runtime.targetCameraY + p.height / (2 * runtime.targetZoom)
      );
      runtime.viewAnimating = true;
    }
  };

  const animateToFitAll = () => {
    computeFitViewTargets();
    beginViewAnimation(
      runtime.targetCameraX + p.width / (2 * runtime.targetZoom),
      runtime.targetCameraY + p.height / (2 * runtime.targetZoom)
    );
    runtime.viewAnimating = true;
  };

  const exitBranchIsolation = () => {
    if (!runtime.branchIsolateActive) {
      return;
    }
    if (runtime.focusTarget !== null) {
      clearBranchFocus();
      resetCanvasFocus(runtime);
      deps.refs.onContentUnfocusRef.current?.();
      runtime.panning = false;
      runtime.zooming = false;
      runtime.viewUnfocusing = true;
    }
    // Keep the row set so the straighten/fade can ease back out; drawFrame
    // clears it once the progress reaches zero.
    runtime.branchIsolateActive = false;
    animateToFitAll();
    deps.refs.onBranchIsolationExitRef.current?.();
  };

  const showFullMap = () => {
    if (runtime.branchIsolateActive) {
      exitBranchIsolation();
      return;
    }
    // Out of a timeline shown alone too, even from an item opened in it.
    runtime.branchSoloActive = false;
    unfocusItem();
  };

  const toggleOwnBranchIsolation = () => {
    if (runtime.branchIsolateActive) {
      exitBranchIsolation();
      return;
    }

    // A viewer who hasn't collected anything yet has no branch (row -1): the
    // collection view then shows the main timeline with the collection's
    // items in a row above it.
    const ownRow = getOwnBranchRow();

    clearBranchFocus();
    resetCanvasFocus(runtime);
    deps.refs.onContentUnfocusRef.current?.();
    runtime.focusContentFade = 0;
    notifyFocusFade(deps);
    runtime.panning = false;
    runtime.zooming = false;
    runtime.viewUnfocusing = false;
    runtime.branchIsolateRow = ownRow;
    runtime.branchIsolateActive = true;
    syncInteractionLock(deps);

    // Frame the branch's final even-spaced straightened layout (main line
    // edge-to-edge, vertically centred), not its scattered date-driven
    // positions.
    const centre = frameIsolatedBranch(ownRow);
    if (centre !== null) {
      beginViewAnimation(centre.x, centre.y);
      runtime.viewAnimating = true;
    }
  };

  const refreshIsolatedFraming = () => {
    if (!runtime.branchIsolateActive || runtime.branchIsolateRow === null) {
      return;
    }
    const centre = frameIsolatedBranch(runtime.branchIsolateRow);
    if (centre !== null) {
      beginViewAnimation(centre.x, centre.y);
      runtime.viewAnimating = true;
    }
  };

  return {
    setCameraFromScreenAnchor,
    computeFitViewTargets,
    refitHomeForPanel,
    computeFocusViewTargets,
    getFocusBounds,
    applyViewTargets,
    syncViewTargets,
    panView,
    zoomViewAt,
    scrollView,
    fitView,
    playEntranceAnimation,
    startCollectReturn,
    animateToFitView,
    startPreviewCollect,
    collectFocusedPreviewContentId,
    animateView,
    animatePan,
    animateZoom,
    findClickedItem,
    findClickedBranch,
    focusItem,
    focusBranch,
    soloOwnBranch,
    unfocusItem,
    showFullMap,
    previewFocusItem,
    clearPreviewFocus,
    previewContentId,
    focusContentId,
    setCollectionViewActive,
    toggleOwnBranchIsolation,
    exitBranchIsolation,
    isViewInteractionLocked: () => isViewInteractionLocked(runtime),
    refreshIsolatedFraming,
  };
}
