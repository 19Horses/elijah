import type p5 from 'p5';
import {
  DETAIL_IMAGE_HEIGHT_VH,
  DETAIL_IMAGE_LEFT_PX,
  DETAIL_TEXT_GAP_PX,
  DETAIL_TEXT_VIEWPORT_LEFT,
  ENTRANCE_ZOOM_START_FACTOR,
  COLLECTION_FIT_ZOOM_SCALAR,
  COLLECTION_FRAME_BOTTOM_PX,
  COLLECTION_FRAME_MIN_SLOTS,
  COLLECTION_FRAME_SIDE_PX,
  COLLECTION_FRAME_TOP_PX,
  COLLECTION_HOVER_VIEW_LERP,
  COLLECTION_HOVER_ZOOM_FACTOR,
  COLLECTION_PANEL_GAP_PX,
  ITEM_GAP,
  ITEM_WIDTH,
  LOAD_ALPHA_SNAP,
  MAIN_ITEM_SCALE,
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
  MOBILE_MEDIA_QUERY,
  MOBILE_DETAIL_SIDE_PX,
  MOBILE_DETAIL_IMAGE_MAX_VH,
  MOBILE_DETAIL_TOP_PX,
  MOBILE_HOME_COLUMNS,
  MAIN_COLUMN_WIDTH,
} from '../constants';
import { frameLerp, hitTest } from '../geometry';
import {
  getFocusedSlug,
  isGuestLockedCollected,
  isLockedTarget,
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
  followFocusedItem: () => void;
  computeFocusViewTargets: (bounds: ContentBounds) => void;
  getFocusBounds: (target: FocusTarget) => ContentBounds;
  applyViewTargets: () => void;
  syncViewTargets: () => void;
  panView: (deltaScreenX: number, deltaScreenY: number) => void;
  zoomViewAt: (screenX: number, screenY: number, delta: number) => void;
  scrollView: (deltaX: number, deltaY: number) => void;
  fitView: () => void;
  playEntranceAnimation: () => void;
  setDetailScroll: (
    scrollTop: number,
    pictureAlpha?: number,
    headerMid?: number
  ) => void;
  startCollectReturn: (
    index: number,
    rect: DetailImageRect,
    lane?: 'main' | 'collected'
  ) => boolean;
  animateToFitView: () => void;
  startPreviewCollect: (previewIndex: number) => boolean;
  collectFocusedPreviewContentId: (contentId: string) => void;
  animateView: (deltaTimeMs: number) => void;
  animatePan: (deltaTimeMs: number) => void;
  animateZoom: (deltaTimeMs: number) => void;
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
    hoverFocusAnimating = false;
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
  // Zoom the isolation framing settled on — hover soft-focus is relative to
  // this, so moving between card titles doesn't ratchet the zoom upward.
  let isolateFrameZoom: number | null = null;
  // Soft-focus from a collection-card title uses a slower view lerp.
  let hoverFocusAnimating = false;
  // The view as it was before a collection item's hover moved it, to ease
  // back to when the hover ends (kept across moving item to item).
  let hoverRestoreView: { zoom: number; x: number; y: number } | null = null;
  // On mobile, the view an item was opened from (camera and zoom), to go back
  // to when it's closed rather than the default framing. Kept while moving
  // item to item.
  let enteredView: { zoom: number; x: number; y: number } | null = null;
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
    // It frames just the main timeline's items, centred on them; branch
    // items beyond either end, above or below run off until you zoom out.
    const mainBounds = bounds.getAllBounds();
    const framed = computeFitTargetsForBounds(
      mainBounds,
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
    }
    // On mobile the whole main timeline is too small to read, so it opens
    // zoomed in on its middle.
    if (framed && window.matchMedia(MOBILE_MEDIA_QUERY).matches) {
      const fromZoom = runtime.targetZoom;
      const zoom = Math.max(
        fromZoom,
        p.width / (MOBILE_HOME_COLUMNS * MAIN_COLUMN_WIDTH)
      );
      const centreX = runtime.targetCameraX + p.width / (2 * fromZoom);
      const centreY = runtime.targetCameraY + p.height / (2 * fromZoom);
      runtime.targetZoom = zoom;
      runtime.targetCameraX = centreX - p.width / (2 * zoom);
      runtime.targetCameraY = centreY - p.height / (2 * zoom);
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

  // Where the open item sat when the view was aimed at it.
  let focusAim: ContentBounds | null = null;

  // An open (or opening) item whose place on the map changes — the
  // timelines reloading as a collect is saved, rows making room for labels —
  // takes the view with it, so it stays framed beside its details. Checked
  // every frame.
  const followFocusedItem = () => {
    const target = runtime.focusTarget;
    if (!target) {
      focusAim = null;
      return;
    }
    if (!focusAim || runtime.viewUnfocusing || target.lane === 'preview') {
      return;
    }
    const now = getFocusBounds(target);
    if (!now) {
      return;
    }
    const resized =
      Math.abs(now.width - focusAim.width) > 0.5 ||
      Math.abs(now.height - focusAim.height) > 0.5;
    const dx = now.left - focusAim.left;
    const dy = now.top - focusAim.top;
    if (!resized && Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) {
      return;
    }
    focusAim = { ...now };
    if (resized) {
      // A different size frames afresh.
      computeFocusViewTargets(now);
      if (runtime.viewAnimating) {
        beginViewAnimation(
          (now.left + now.right) / 2,
          now.top + now.height / 2
        );
      } else {
        runtime.zoom = runtime.targetZoom;
        runtime.cameraX = runtime.targetCameraX;
        runtime.cameraY = runtime.targetCameraY;
      }
      return;
    }
    runtime.cameraX += dx;
    runtime.cameraY += dy;
    runtime.targetCameraX += dx;
    runtime.targetCameraY += dy;
    runtime.animationWorldX += dx;
    runtime.animationWorldY += dy;
    runtime.animationStartCameraX += dx;
    runtime.animationStartCameraY += dy;
    runtime.panTargetCameraX += dx;
    runtime.panTargetCameraY += dy;
  };

  const computeFocusViewTargets = (focusBounds: ContentBounds) => {
    // On mobile: full width (up to MOBILE_DETAIL_IMAGE_MAX_VH tall), centred,
    // under the header, its details stacked underneath (see
    // TimelineDetailOverlay).
    if (window.matchMedia(MOBILE_MEDIA_QUERY).matches) {
      const zoom = Math.min(
        (p.width - MOBILE_DETAIL_SIDE_PX * 2) / focusBounds.width,
        (p.height * MOBILE_DETAIL_IMAGE_MAX_VH) / focusBounds.height
      );
      const left = (p.width - focusBounds.width * zoom) / 2;
      runtime.targetZoom = zoom;
      runtime.targetCameraX = focusBounds.left - left / zoom;
      // (Scrolled down, the picture sits that much higher.)
      runtime.targetCameraY =
        focusBounds.top -
        (MOBILE_DETAIL_TOP_PX - runtime.detailScrollPx) / zoom;
      return;
    }
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
    // On mobile the column floats over the map, full width, rather than
    // sitting beside it (see index.css), so the map keeps the whole screen.
    if (window.matchMedia(MOBILE_MEDIA_QUERY).matches) {
      return { left: 0, right: 0 };
    }
    // The column holds collection boxes, or a timeline's "You are viewing"
    // box and item cards: whatever of it is showing.
    const parts = document.querySelectorAll(
      forWorldView
        ? '.collection-card-stack:not(.collection-card-stack--hidden), .timeline-item-card--opened'
        : '.collection-card-stack:not(.collection-card-stack--hidden), .branch-focus-card, .collection-card-list:not(.collection-card-list--hidden) .timeline-item-card'
    );
    // (A list hidden outright, as on mobile until opened, takes no room.)
    const list = document.querySelector('.collection-card-list');
    const listShown = !list || getComputedStyle(list).display !== 'none';
    const stack =
      listShown &&
      (expectColumn ||
        (forWorldView &&
          parts.length === 0 &&
          deps.refs.hasCollectionPanelRef.current))
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
      const rect = part.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        return;
      }
      panelRight = Math.max(panelRight, rect.right);
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
    // Framed as it will settle.
    const frameAtCurrentZoom = () => {
      const line = bounds.getIsolatedMergedLine(rowIndex, null, 1);
      if (!line) {
        return null;
      }
      // Fit the whole isolated line — the viewer's branch items, the
      // collection's still-to-collect slots, and the main timeline under that
      // stretch. Pad short packs out to a minimum slot width so a 2-item
      // collection (e.g. "We go again") doesn't zoom in tighter than a fuller
      // one.
      const mainBounds = bounds.getAllBounds();
      const hasBranch = line.entries.some(
        (entry) => entry.kind === 'collected'
      );
      const slot = ITEM_WIDTH * MAIN_ITEM_SCALE + ITEM_GAP;
      const minSpan = slot * COLLECTION_FRAME_MIN_SLOTS;
      const lineSpan = Math.max(1, line.maxX - line.minX);
      const padX = Math.max(0, minSpan - lineSpan) / 2;
      const frameMinX = line.minX - padX;
      const frameMaxX = line.maxX + padX;
      const lineTop = Math.min(...line.entries.map((e) => e.rect.top));
      const lineBottom = Math.max(
        ...line.entries.map((e) => e.rect.dateBottom)
      );
      const framed = computeFitTargetsForBounds(
        [
          ...line.entries.map((entry) => entry.rect),
          ...mainBounds.filter(
            (b) => !hasBranch || (b.right >= frameMinX && b.left <= frameMaxX)
          ),
          // Invisible extent so padding still counts when no main item sits
          // in the extra width.
          {
            left: frameMinX,
            right: frameMaxX,
            top: lineTop,
            width: frameMaxX - frameMinX,
            height: lineBottom - lineTop,
            centerY: (lineTop + lineBottom) / 2,
            dateBottom: lineBottom,
          },
        ],
        // Centred in the space the header, panel and labels leave.
        collectionFrameMargins(),
        COLLECTION_FIT_ZOOM_SCALAR
      );
      if (framed) {
        capTargetZoom(framed, MAX_ZOOM_LEVEL);
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
    isolateFrameZoom = runtime.targetZoom;
    hoverRestoreView = null;
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
    // While isolating, collectibles only exist chained beside the branch, and
    // collected items stay in place — aim at those isolated-line rects.
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
    // Collectibles sit on a parallel row while isolating — include them so
    // pinch-zoom / pan isn't clamped away from that row.
    if (runtime.branchIsolateRow !== null) {
      const line = bounds.getIsolatedMergedLine(runtime.branchIsolateRow);
      for (const entry of line?.entries ?? []) {
        minX = Math.min(minX, entry.rect.left);
        maxX = Math.max(maxX, entry.rect.right);
        minY = Math.min(minY, entry.rect.top);
        maxY = Math.max(maxY, entry.rect.dateBottom);
      }
      // Small packs nearly fill the framed view; without extra room every
      // scroll tick hits the clamp and jogs. Keep the pan extent at least a
      // bit larger than the viewport so the camera can move freely.
      const viewW = p.width / Math.max(runtime.zoom, 1e-6);
      const viewH = p.height / Math.max(runtime.zoom, 1e-6);
      const padX = Math.max(0, (viewW * 1.35 - (maxX - minX)) / 2);
      const padY = Math.max(0, (viewH * 1.35 - (maxY - minY)) / 2);
      minX -= padX;
      maxX += padX;
      minY -= padY;
      maxY += padY;
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
    if (!runtime.panning) {
      runtime.panTargetCameraX = runtime.cameraX;
      runtime.panTargetCameraY = runtime.cameraY;
    }
    // A pan gesture takes over from any in-flight wheel-zoom or programmatic
    // view animation so the two eases don't fight over the camera.
    runtime.zooming = false;
    runtime.viewAnimating = false;
    runtime.viewUnfocusing = false;

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

  const animatePan = (deltaTimeMs: number) => {
    if (!runtime.panning) {
      return;
    }

    const panT = frameLerp(PAN_LERP, deltaTimeMs);
    const nextX =
      runtime.cameraX + (runtime.panTargetCameraX - runtime.cameraX) * panT;
    const nextY =
      runtime.cameraY + (runtime.panTargetCameraY - runtime.cameraY) * panT;

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

    // A zoom gesture takes over from any in-flight pan or programmatic view
    // animation (e.g. collection frame-in) so the two eases don't fight.
    runtime.panning = false;
    runtime.panTargetCameraX = runtime.cameraX;
    runtime.panTargetCameraY = runtime.cameraY;
    runtime.viewAnimating = false;
    runtime.viewUnfocusing = false;
    resetCanvasFocus(runtime);
    runtime.zooming = true;
  };

  const animateZoom = (deltaTimeMs: number) => {
    if (!runtime.zooming) {
      return;
    }

    const nextZoom =
      runtime.zoom +
      (runtime.zoomTargetZoom - runtime.zoom) *
        frameLerp(ZOOM_LERP, deltaTimeMs);
    const settled =
      Math.abs(runtime.zoomTargetZoom - nextZoom) < ZOOM_SETTLE_THRESHOLD;
    const appliedZoom = settled ? runtime.zoomTargetZoom : nextZoom;

    runtime.cameraX =
      runtime.zoomAnchorWorldX - runtime.zoomAnchorScreenX / appliedZoom;
    runtime.cameraY =
      runtime.zoomAnchorWorldY - runtime.zoomAnchorScreenY / appliedZoom;
    runtime.zoom = appliedZoom;
    // Clamping mid-gesture fights the pinch anchor (especially in a small
    // collection view whose content fits the screen) and jogs the timeline.
    // Clamp once the ease settles instead.
    if (settled) {
      clampCameraToContent();
      runtime.zooming = false;
    }
    // Keep the pan target in sync so a following drag/scroll starts smoothly
    // from here instead of the pre-zoom position.
    runtime.panTargetCameraX = runtime.cameraX;
    runtime.panTargetCameraY = runtime.cameraY;
    syncViewTargets();
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

  // On mobile the opened item's details scroll as one with its picture: the
  // view moves up by however far they've scrolled since last time.
  const setDetailScroll = (
    scrollTop: number,
    pictureAlpha = 1,
    headerMid = 0
  ) => {
    const delta = scrollTop - runtime.detailScrollPx;
    runtime.detailScrollPx = scrollTop;
    runtime.detailPictureAlpha = pictureAlpha;
    runtime.detailHeaderMidPx = headerMid;
    if (!runtime.focusTarget || delta === 0 || runtime.zoom <= 0) {
      return;
    }
    const dy = delta / runtime.zoom;
    runtime.cameraY += dy;
    runtime.targetCameraY += dy;
    runtime.panTargetCameraY += dy;
    runtime.animationStartCameraY += dy;
    runtime.animationWorldY += dy;
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

  // (`lane` 'main': something on the main timeline, which lands there.)
  const startCollectReturn = (
    collectedIndex: number,
    rect: DetailImageRect,
    lane: 'main' | 'collected' = 'collected'
  ) => {
    const boundsFor = () =>
      lane === 'main'
        ? bounds.getAllBounds()[collectedIndex]
        : bounds.getCollectedBounds()[collectedIndex];
    const roughBounds = boundsFor();
    if (!roughBounds || roughBounds.width <= 0) {
      return false;
    }
    clearBranchFocus();
    runtime.panning = false;
    runtime.zooming = false;
    resetCanvasFocus(runtime);
    // Don't notify unfocus here — that clears the collecting UI hide and
    // flashes collection badges before the detail view opens. focusItem
    // below (from drawFrame) replaces focus in one step.
    runtime.focusContentFade = 1;
    notifyFocusFade(deps);
    const wasIsolating = runtime.branchIsolateActive;
    runtime.branchIsolateActive = false;
    runtime.branchIsolate = 0;
    runtime.branchIsolateRow = null;
    isolateFrameZoom = null;
    hoverRestoreView = null;
    runtime.branchDimStrength = 0;
    runtime.branchDimRow = null;
    runtime.collectStartMs = null;
    runtime.collectIndex = -1;
    runtime.collectReported = false;
    computeFitViewTargets();
    // Close the collection panel only as focus opens (see drawFrame).
    runtime.collectPendingIsolationExit = wasIsolating;
    runtime.zoom = rect.width / roughBounds.width;
    const itemBounds = boundsFor();
    runtime.zoom = rect.width / itemBounds.width;
    runtime.cameraX = itemBounds.left - rect.left / runtime.zoom;
    runtime.cameraY = itemBounds.top - rect.top / runtime.zoom;
    runtime.panTargetCameraX = runtime.cameraX;
    runtime.panTargetCameraY = runtime.cameraY;
    runtime.viewAnimating = false;
    runtime.viewUnfocusing = false;
    runtime.collectReturnIndex = collectedIndex;
    runtime.collectReturnLane = lane;
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

  const animateView = (deltaTimeMs: number) => {
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

    const lerpFactor = frameLerp(
      hoverFocusAnimating
        ? COLLECTION_HOVER_VIEW_LERP
        : runtime.slowViewAnimation
        ? COLLECT_RETURN_ZOOM_LERP
        : runtime.viewUnfocusing
        ? VIEW_UNFOCUS_ANIMATION_LERP
        : VIEW_ANIMATION_LERP,
      deltaTimeMs
    );
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
        // Collect → focus: the map is already gone; keep it that way so the
        // settle zoom doesn't flash other content back in.
        runtime.focusContentFade =
          runtime.collectReturnIndex !== -1 ? 1 : progress;
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
        runtime.focusContentFade =
          runtime.collectReturnIndex !== -1 ? 1 : progress;
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
      hoverFocusAnimating = false;
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
    // While zoomed into an item, the rest of the map is faded out — only the
    // focused item itself stays clickable (to dismiss). Invisible neighbours
    // must not steal the click.
    const focus = runtime.focusTarget;
    if (focus && runtime.focusContentFade > LOAD_ALPHA_SNAP) {
      const focusedBounds =
        focus.lane === 'main'
          ? allBounds[focus.index]
          : collectedBounds[focus.index];
      if (focusedBounds && hitTest(focusedBounds, worldX, worldY)) {
        return focus;
      }
      return null;
    }
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
    if (runtime.emptyOwnTimeline) {
      runtime.emptyOwnTimeline = false;
      deps.refs.onBranchFocusRef.current?.(null);
    }
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
    // Logged-out: collected branches stay locked — open the login slide.
    if (isGuestLockedCollected(deps)) {
      deps.refs.onGuestLockedClickRef.current?.();
      return;
    }
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
    // (On mobile, a narrow screen, just the ones it springs from: the
    // others would spread the frame so wide the timeline is lost in it.)
    const isMobile = window.matchMedia(MOBILE_MEDIA_QUERY).matches;
    const mainIndices = new Set<number>();
    for (const { item } of branchItems) {
      const prev = Math.max(0, bounds.getPreviousMainIndex(item.anchorTime));
      mainIndices.add(prev);
      if (!isMobile && prev + 1 < mainBounds.length) {
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
    const margins = collectionFrameMargins(true);
    // On mobile, just the usual edge gutter at the sides.
    if (window.matchMedia(MOBILE_MEDIA_QUERY).matches) {
      margins.left = MOBILE_DETAIL_SIDE_PX;
      margins.right = MOBILE_DETAIL_SIDE_PX;
    }
    const center = computeFitTargetsForBounds(branchFrame.bounds, margins);
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

  // The viewer's own timeline (from "Your timeline" in the menu), highlighted
  // just as clicking it on the map would; an empty notice when they haven't
  // collected anything yet.
  const soloOwnBranch = () => {
    const username = deps.currentUsername;
    if (!username) {
      return;
    }
    // Leaving a collection that's open for it: the collection closes (its
    // box too).
    if (runtime.branchIsolateActive) {
      runtime.branchIsolateActive = false;
      isolateFrameZoom = null;
      hoverRestoreView = null;
      deps.refs.onBranchIsolationExitRef.current?.();
    }
    const row = deps.processedCollected
      .flatMap((item) => item.sources)
      .find((source) => source.username === username)?.rowIndex;
    if (row === undefined) {
      resetCanvasFocus(runtime);
      deps.refs.onContentUnfocusRef.current?.();
      runtime.focusContentFade = 0;
      notifyFocusFade(deps);
      runtime.emptyOwnTimeline = true;
      runtime.focusedBranchRow = null;
      runtime.branchSoloActive = false;
      deps.refs.onBranchFocusRef.current?.({
        username,
        colour: deps.previewColour,
        own: true,
        empty: true,
        mainItemIds: [],
      });
      // Back to the default fit view so the notice isn't over a zoomed map.
      animateToFitAll();
      return;
    }
    runtime.emptyOwnTimeline = false;
    // Just as clicking their own line on the map would.
    focusBranch(row);
  };

  const focusItem = (target: FocusTarget) => {
    // Collectibles stay on the isolated collection timeline — no zoom-in.
    if (target.lane === 'preview') {
      return;
    }
    if (isLockedTarget(deps, target)) {
      // Guest locked collected content → login; private while signed in → no-op.
      if (target.lane === 'collected' && isGuestLockedCollected(deps)) {
        deps.refs.onGuestLockedClickRef.current?.();
      }
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
    // underneath (collectibles stay chained on the branch; others stay faded),
    // so getFocusBounds aims there and unfocusing returns to the isolated
    // timeline rather than the full one.
    if (!runtime.focusTarget) {
      // (Where it was headed, if it was still moving.)
      enteredView = runtime.viewAnimating
        ? {
            zoom: runtime.targetZoom,
            x: runtime.targetCameraX,
            y: runtime.targetCameraY,
          }
        : { zoom: runtime.zoom, x: runtime.cameraX, y: runtime.cameraY };
    }
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
    focusAim = { ...focusBounds };
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
    const returnView = enteredView;
    enteredView = null;
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
    // On mobile, back to where the item was opened from.
    if (returnView && window.matchMedia(MOBILE_MEDIA_QUERY).matches) {
      runtime.targetZoom = returnView.zoom;
      runtime.targetCameraX = returnView.x;
      runtime.targetCameraY = returnView.y;
    } else {
      computeFitViewTargets();
    }
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
    if (isViewInteractionLocked(runtime) || isLockedTarget(deps, target)) {
      return;
    }
    const focusBounds = getFocusBounds(target);
    // Where the view is (or is already heading), to come back to.
    if (!hoverRestoreView) {
      hoverRestoreView = runtime.viewAnimating
        ? {
            zoom: runtime.targetZoom,
            x: runtime.targetCameraX,
            y: runtime.targetCameraY,
          }
        : { zoom: runtime.zoom, x: runtime.cameraX, y: runtime.cameraY };
    }
    // Collection-card hover: ease toward the item with a soft zoom (not a
    // full focus dive), framed in the space the panel leaves.
    if (runtime.branchIsolateRow !== null) {
      const baseZoom =
        isolateFrameZoom ?? Math.max(runtime.zoom, runtime.targetZoom);
      const softZoom = Math.min(
        MAX_ZOOM_LEVEL,
        baseZoom * COLLECTION_HOVER_ZOOM_FACTOR
      );
      // Centre in the map area left of the panel, with equal top/bottom so
      // the item reads centred rather than pulled by the isolation margins.
      const insets = panelInsets(COLLECTION_PANEL_GAP_PX);
      const side = COLLECTION_FRAME_SIDE_PX;
      const vertical =
        (COLLECTION_FRAME_TOP_PX + COLLECTION_FRAME_BOTTOM_PX) / 2;
      const margins = {
        top: vertical,
        bottom: vertical,
        left: side + insets.left,
        right: side + insets.right,
      };
      const availableWidth = Math.max(
        1,
        p.width - margins.left - margins.right
      );
      const availableHeight = Math.max(
        1,
        p.height - margins.top - margins.bottom
      );
      const centerX = (focusBounds.left + focusBounds.right) / 2;
      const centerY = focusBounds.centerY;
      runtime.targetZoom = softZoom;
      runtime.targetCameraX =
        centerX - (margins.left + availableWidth / 2) / softZoom;
      runtime.targetCameraY =
        centerY - (margins.top + availableHeight / 2) / softZoom;
      runtime.panning = false;
      runtime.zooming = false;
      beginViewAnimation(centerX, centerY);
      hoverFocusAnimating = true;
      runtime.viewAnimating = true;
      return;
    }
    panToFocusBounds(focusBounds);
  };

  const clearPreviewFocus = () => {
    if (isViewInteractionLocked(runtime)) {
      return;
    }
    runtime.panning = false;
    runtime.zooming = false;
    // Back to the view as it was before the hover.
    if (hoverRestoreView) {
      const { zoom, x, y } = hoverRestoreView;
      hoverRestoreView = null;
      runtime.targetZoom = zoom;
      runtime.targetCameraX = x;
      runtime.targetCameraY = y;
      beginViewAnimation(x + p.width / (2 * zoom), y + p.height / (2 * zoom));
      hoverFocusAnimating = true;
      runtime.viewAnimating = true;
      return;
    }
    // Badge-header hover (or other clear) while isolating: ease back to the
    // full collection framing.
    if (runtime.branchIsolateRow !== null) {
      const centre = frameIsolatedBranch(runtime.branchIsolateRow);
      if (centre) {
        beginViewAnimation(centre.x, centre.y);
        hoverFocusAnimating = true;
        runtime.viewAnimating = true;
      }
      return;
    }
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

  // Where isolation actually draws this content: the collectible slot if it's
  // still to-collect, otherwise the own-branch copy. Prefer that over any
  // other user's collected copy of the same contentId (which resolve would
  // otherwise pick first).
  const resolveIsolatedFocusTarget = (
    contentId: string
  ): FocusTarget | null => {
    if (runtime.branchIsolateRow === null) {
      return null;
    }
    const entry = bounds
      .getIsolatedMergedLine(runtime.branchIsolateRow)
      ?.entries.find((e) => e.contentId === contentId);
    if (!entry) {
      return null;
    }
    return { lane: entry.kind, index: entry.index };
  };

  const previewContentId = (contentId: string) => {
    const target =
      resolveIsolatedFocusTarget(contentId) ??
      resolveContentFocusTarget(contentId);
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
    // Isolation already frames the collection timeline; don't fight it with
    // the wider own-branch framing. Focus/detail locks still skip reframing.
    if (
      isViewInteractionLocked(runtime) ||
      runtime.branchIsolateActive ||
      runtime.branchIsolateRow !== null
    ) {
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
    isolateFrameZoom = null;
    hoverRestoreView = null;
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

    // Frame the branch in place with collectibles chained beside it.
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
    followFocusedItem,
    computeFocusViewTargets,
    getFocusBounds,
    applyViewTargets,
    syncViewTargets,
    panView,
    zoomViewAt,
    scrollView,
    fitView,
    playEntranceAnimation,
    setDetailScroll,
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
