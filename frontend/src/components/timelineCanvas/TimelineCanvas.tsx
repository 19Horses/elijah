import p5 from 'p5';
import type { ItemViewer } from '../../services/presence';
import { memo, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CollectedUserRow } from '../../queries/collectedContent';
import type { CollectionContent, ContentType } from '../../types/content';
import { GUEST_LOCKED_CURSOR_LABEL, PREVIEW_SWITCH_FADE_MS } from './constants';
import { createTimelineSketch } from './createTimelineSketch';
import {
  createAudioController,
  type AudioController,
} from './sketch/audioController';
import {
  buildProcessedCollected,
  buildProcessedCollectionPreview,
  buildProcessedItems,
  collectorsByContent,
} from './processItems';
import P5CanvasHost from './P5CanvasHost';
import { createTimelineRuntime } from './timelineRuntime';
import type {
  BranchFocusInfo,
  FocusTarget,
  ProcessedCollected,
  TimelineCanvasProps,
  TimelineSketchDeps,
} from './types';

// Stable empty-array fallbacks for the destructuring defaults below — a
// literal `= []` default creates a brand-new array every render the prop is
// undefined, which (being a new reference each time) would otherwise re-fire
// the canvas-mount effect below on every unrelated re-render of the caller.
const EMPTY_COLLECTED_ROWS: CollectedUserRow[] = [];
const EMPTY_VIEWERS = new Map<string, ItemViewer[]>();
const EMPTY_PREVIEW_ITEMS: CollectionContent[] = [];

function TimelineCanvas({
  items,
  collectedRows = EMPTY_COLLECTED_ROWS,
  previewItems = EMPTY_PREVIEW_ITEMS,
  previewColour = '#ffffff',
  highlightedPreviewContentId = null,
  centerOnPreviewContentId = null,
  onPreviewItemHover,
  onPreviewCollectStart,
  onPreviewCollect,
  cancelPreviewCollectControlRef,
  collectFocusedPreviewControlRef,
  highlightedMainContentId = null,
  hoveredItemContentId = null,
  hasCollectionPanel = false,
  menuOpen = false,
  viewersBySlug = EMPTY_VIEWERS,
  seenTimelineIds = null,
  focusContentIdControlRef,
  resetViewControlRef,
  soloTimelineControlRef,
  isCollectionView = false,
  colour,
  currentUsername = null,
  highlightedType = null,
  hoverOwnBranch = false,
  isolateControlRef,
  focusItemControlRef,
  audioControlRef,
  audioStopControlRef,
  onAudioStateChange,
  onFocusFadeChange,
  onContentFocus,
  onContentUnfocus,
  onDetailLayoutStart,
  onDetailImageRect,
  onEntranceComplete,
  onSoloTimelineChange,
  onBranchFocusChange,
  onBranchIsolationExit,
  activeVideoSlug = null,
  onDismissVideo,
  onGuestLockedClick,
  onVideoPlay,
}: TimelineCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const interactionLockedRef = useRef(false);
  const p5InstanceRef = useRef<p5 | null>(null);
  // Kept mutable so login doesn't remount the sketch — colour/blur can ease in.
  const sketchDepsRef = useRef<TimelineSketchDeps | null>(null);
  const highlightedTypeRef = useRef<ContentType | null>(highlightedType);
  const hoverOwnBranchRef = useRef(hoverOwnBranch);
  const onFocusFadeChangeRef = useRef(onFocusFadeChange);
  const onContentFocusRef = useRef(onContentFocus);
  const onContentUnfocusRef = useRef(onContentUnfocus);
  const onDetailLayoutStartRef = useRef(onDetailLayoutStart);
  const onDetailImageRectRef = useRef(onDetailImageRect);
  const onEntranceCompleteRef = useRef(onEntranceComplete);
  const [branchFocus, setBranchFocus] = useState<BranchFocusInfo | null>(null);
  const soloTimelineActive = branchFocus?.own ?? false;
  useEffect(() => {
    onSoloTimelineChange?.(soloTimelineActive);
  }, [onSoloTimelineChange, soloTimelineActive]);
  useEffect(() => {
    onBranchFocusChange?.(branchFocus);
  }, [onBranchFocusChange, branchFocus]);
  const onBranchFocusRef = useRef<
    ((info: BranchFocusInfo | null) => void) | undefined
  >(setBranchFocus);
  const onBranchIsolationExitRef = useRef(onBranchIsolationExit);
  const localResetViewRef = useRef<(() => void) | undefined>(undefined);
  const resetViewRef = resetViewControlRef ?? localResetViewRef;
  const localSoloTimelineRef = useRef<(() => void) | undefined>(undefined);
  const soloTimelineRef = soloTimelineControlRef ?? localSoloTimelineRef;
  const localIsolateRef = useRef<(() => void) | undefined>(undefined);
  const isolateOwnBranchRef = isolateControlRef ?? localIsolateRef;
  const localFocusItemRef = useRef<((target: FocusTarget) => void) | undefined>(
    undefined
  );
  const focusItemRef = focusItemControlRef ?? localFocusItemRef;
  const localFocusContentIdRef = useRef<
    ((contentId: string) => void) | undefined
  >(undefined);
  const focusContentIdRef = focusContentIdControlRef ?? localFocusContentIdRef;
  const setCollectionViewActiveRef = useRef<
    ((active: boolean) => void) | undefined
  >(undefined);
  const onAudioStateChangeRef = useRef(onAudioStateChange);
  const localAudioControlRef = useRef<((src: string) => void) | undefined>(
    undefined
  );
  const audioToggleRef = audioControlRef ?? localAudioControlRef;
  // Points at the live controller so the toggle ref can control playback.
  const audioRef = useRef<AudioController | null>(null);
  const highlightedPreviewIdRef = useRef<string | null>(
    highlightedPreviewContentId
  );
  const centerOnPreviewIdRef = useRef<string | null>(centerOnPreviewContentId);
  const onPreviewHoverRef = useRef(onPreviewItemHover);
  // Guest hovering a locked user-branch connector — drives the cursor label.
  const [guestLockedHover, setGuestLockedHover] = useState(false);
  const guestLockedHoverActiveRef = useRef(false);
  const [guestCursor, setGuestCursor] = useState<{
    x: number;
    y: number;
  } | null>(null);
  // Sketch reports every frame while hovering; only push React state when
  // active flips (seed position once), then follow via pointermove below.
  const onGuestLockedHoverRef = useRef<
    (pos: { x: number; y: number } | null) => void
  >((pos) => {
    const active = pos !== null;
    if (guestLockedHoverActiveRef.current === active) {
      return;
    }
    guestLockedHoverActiveRef.current = active;
    setGuestLockedHover(active);
    setGuestCursor(pos);
  });
  const onGuestLockedClickRef = useRef(onGuestLockedClick);
  const onPreviewCollectStartRef = useRef(onPreviewCollectStart);
  const onPreviewCollectRef = useRef(onPreviewCollect);
  const localCancelPreviewCollectRef = useRef<(() => void) | undefined>(
    undefined
  );
  const cancelPreviewCollectRef =
    cancelPreviewCollectControlRef ?? localCancelPreviewCollectRef;
  const localCollectFocusedPreviewRef = useRef<
    ((contentId: string) => void) | undefined
  >(undefined);
  const collectFocusedPreviewRef =
    collectFocusedPreviewControlRef ?? localCollectFocusedPreviewRef;
  const reloadCollectedRef = useRef<
    ((items: ProcessedCollected[]) => void) | undefined
  >(undefined);
  const collectedRowsRef = useRef(collectedRows);
  const appliedCollectedRowsRef = useRef<CollectedUserRow[] | null>(null);
  const highlightedMainContentIdRef = useRef<string | null>(
    highlightedMainContentId
  );
  const viewersRef = useRef(viewersBySlug);
  const seenTimelineIdsRef = useRef(seenTimelineIds);
  const collectorsRef = useRef(collectorsByContent(collectedRows));
  const reloadPreviewRef = useRef<
    | ((items: ReturnType<typeof buildProcessedCollectionPreview>) => void)
    | undefined
  >(undefined);
  const activeVideoSlugRef = useRef<string | null>(activeVideoSlug);
  const onDismissVideoRef = useRef(onDismissVideo);
  const onVideoPlayRef = useRef(onVideoPlay);

  useEffect(() => {
    activeVideoSlugRef.current = activeVideoSlug;
  }, [activeVideoSlug]);

  useEffect(() => {
    onDismissVideoRef.current = onDismissVideo;
  }, [onDismissVideo]);

  useEffect(() => {
    onVideoPlayRef.current = onVideoPlay;
  }, [onVideoPlay]);
  const beginPreviewFadeOutRef = useRef<(() => void) | undefined>(undefined);
  const prevPreviewItemsRef = useRef<CollectionContent[]>(EMPTY_PREVIEW_ITEMS);

  useEffect(() => {
    highlightedTypeRef.current = highlightedType ?? null;
  }, [highlightedType]);

  useEffect(() => {
    hoverOwnBranchRef.current = hoverOwnBranch;
  }, [hoverOwnBranch]);

  useEffect(() => {
    onFocusFadeChangeRef.current = onFocusFadeChange;
  }, [onFocusFadeChange]);

  useEffect(() => {
    onContentFocusRef.current = onContentFocus;
  }, [onContentFocus]);

  useEffect(() => {
    onContentUnfocusRef.current = onContentUnfocus;
  }, [onContentUnfocus]);

  useEffect(() => {
    onBranchIsolationExitRef.current = onBranchIsolationExit;
  }, [onBranchIsolationExit]);

  useEffect(() => {
    onDetailLayoutStartRef.current = onDetailLayoutStart;
  }, [onDetailLayoutStart]);

  useEffect(() => {
    onDetailImageRectRef.current = onDetailImageRect;
  }, [onDetailImageRect]);

  useEffect(() => {
    onEntranceCompleteRef.current = onEntranceComplete;
  }, [onEntranceComplete]);

  useEffect(() => {
    onAudioStateChangeRef.current = onAudioStateChange;
  }, [onAudioStateChange]);

  useEffect(() => {
    highlightedPreviewIdRef.current = highlightedPreviewContentId ?? null;
  }, [highlightedPreviewContentId]);

  useEffect(() => {
    centerOnPreviewIdRef.current = centerOnPreviewContentId ?? null;
  }, [centerOnPreviewContentId]);

  useEffect(() => {
    onPreviewHoverRef.current = onPreviewItemHover;
  }, [onPreviewItemHover]);

  useEffect(() => {
    onGuestLockedClickRef.current = onGuestLockedClick;
  }, [onGuestLockedClick]);

  useEffect(() => {
    if (sketchDepsRef.current) {
      sketchDepsRef.current.currentUsername = currentUsername;
    }
  }, [currentUsername]);

  // Login restores the account colour — keep the sketch alive and just swap it.
  useEffect(() => {
    if (sketchDepsRef.current) {
      sketchDepsRef.current.previewColour = previewColour;
    }
  }, [previewColour]);

  useEffect(() => {
    if (sketchDepsRef.current) {
      sketchDepsRef.current.backgroundColour = colour || null;
    }
  }, [colour]);

  // Follow the pointer while the guest locked-branch CTA is active.
  useEffect(() => {
    if (!guestLockedHover) {
      setGuestCursor(null);
      return undefined;
    }
    const onMove = (event: PointerEvent) => {
      setGuestCursor({ x: event.clientX, y: event.clientY });
    };
    const onLeave = () => {
      guestLockedHoverActiveRef.current = false;
      setGuestLockedHover(false);
      setGuestCursor(null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('blur', onLeave);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('blur', onLeave);
    };
  }, [guestLockedHover]);

  useEffect(() => {
    onPreviewCollectStartRef.current = onPreviewCollectStart;
  }, [onPreviewCollectStart]);

  useEffect(() => {
    onPreviewCollectRef.current = onPreviewCollect;
  }, [onPreviewCollect]);

  useEffect(() => {
    collectedRowsRef.current = collectedRows;
    collectorsRef.current = collectorsByContent(collectedRows);
    if (
      appliedCollectedRowsRef.current === null ||
      appliedCollectedRowsRef.current === collectedRows ||
      !reloadCollectedRef.current
    ) {
      return;
    }
    appliedCollectedRowsRef.current = collectedRows;
    reloadCollectedRef.current(buildProcessedCollected(collectedRows, items));
  }, [collectedRows, items]);

  useEffect(() => {
    highlightedMainContentIdRef.current = highlightedMainContentId ?? null;
  }, [highlightedMainContentId]);

  const hasCollectionPanelRef = useRef(hasCollectionPanel);
  useEffect(() => {
    hasCollectionPanelRef.current = hasCollectionPanel;
  }, [hasCollectionPanel]);
  const menuOpenRef = useRef(menuOpen);
  useEffect(() => {
    menuOpenRef.current = menuOpen;
  }, [menuOpen]);

  const hoveredItemContentIdRef = useRef<string | null>(hoveredItemContentId);
  useEffect(() => {
    hoveredItemContentIdRef.current = hoveredItemContentId;
  }, [hoveredItemContentId]);

  useEffect(() => {
    viewersRef.current = viewersBySlug;
  }, [viewersBySlug]);

  useEffect(() => {
    seenTimelineIdsRef.current = seenTimelineIds;
  }, [seenTimelineIds]);

  useEffect(() => {
    setCollectionViewActiveRef.current?.(isCollectionView);
  }, [isCollectionView]);

  useEffect(() => {
    const processed = buildProcessedCollectionPreview(previewItems);
    const hadItems = prevPreviewItemsRef.current.length > 0;
    const hasItems = previewItems.length > 0;
    prevPreviewItemsRef.current = previewItems;

    if (!hadItems || !hasItems) {
      reloadPreviewRef.current?.(processed);
      return;
    }

    beginPreviewFadeOutRef.current?.();
    const id = window.setTimeout(() => {
      reloadPreviewRef.current?.(processed);
    }, PREVIEW_SWITCH_FADE_MS);
    return () => window.clearTimeout(id);
  }, [previewItems]);

  useEffect(() => {
    const preventScrollWhileFocused = (event: WheelEvent) => {
      // Over the collection panel, the wheel scrolls it rather than the map.
      if (
        event.target instanceof Element &&
        event.target.closest('.collection-card-list')
      ) {
        event.stopImmediatePropagation();
        return;
      }

      // A picture open full screen: nothing behind it scrolls or zooms.
      if (
        event.target instanceof Element &&
        event.target.closest('.full-screen-image')
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }

      const overlay = document.querySelector('.timeline-detail');

      // A detail is open: the wheel scrolls its text (wherever the cursor is,
      // since the image fills much of the screen) and never zooms the canvas.
      if (overlay) {
        const step = event.deltaMode === 1 ? 16 : 1;
        // Over a photo gallery's column, the wheel scrolls its pictures.
        const gallery =
          event.target instanceof Element
            ? event.target.closest('.timeline-detail__gallery')
            : null;
        if (gallery instanceof HTMLElement) {
          gallery.scrollTop += event.deltaY * step;
          event.preventDefault();
          event.stopImmediatePropagation();
          return;
        }
        // Scroll the body region under the static back/title/date header.
        const scrollRoot =
          overlay.querySelector('.timeline-detail__side-scroll') ??
          overlay.querySelector('.timeline-detail__side');
        if (scrollRoot instanceof HTMLElement) {
          scrollRoot.scrollTop += event.deltaY * step;
        }
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }

      // Focused but no overlay yet (e.g. mid zoom-in): just block the canvas.
      if (interactionLockedRef.current) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };

    const options: AddEventListenerOptions = { passive: false, capture: true };
    window.addEventListener('wheel', preventScrollWhileFocused, options);
    document.addEventListener('wheel', preventScrollWhileFocused, options);

    return () => {
      window.removeEventListener('wheel', preventScrollWhileFocused, options);
      document.removeEventListener('wheel', preventScrollWhileFocused, options);
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return undefined;
    }

    // A fresh sketch starts at the default fit view, so drop any stale bar.
    setBranchFocus(null);

    const processed = buildProcessedItems(items);
    const mountedCollectedRows = collectedRowsRef.current;
    appliedCollectedRowsRef.current = mountedCollectedRows;
    const processedCollected = buildProcessedCollected(
      mountedCollectedRows,
      items
    );
    const processedPreview = buildProcessedCollectionPreview(previewItems);
    // No CMS colour: leave the canvas transparent so the page gradient shows.
    const backgroundColour = colour || null;
    const itemOffsets = processed.map(() => ({ dx: 0, dy: 0 }));
    const collectedOffsets = processedCollected.map(() => ({ dx: 0, dy: 0 }));
    const runtime = createTimelineRuntime();
    // Already signed in on mount: show unlocked colours/blur immediately.
    runtime.guestUnlock = currentUsername ? 1 : 0;
    runtime.prevUsername = currentUsername;
    const audio = createAudioController();
    audioRef.current = audio;
    audioToggleRef.current = (src) => audioRef.current?.toggle(src);
    if (audioStopControlRef) {
      audioStopControlRef.current = () => audioRef.current?.stop();
    }
    onAudioStateChangeRef.current?.(null);

    const deps = {
      runtime,
      items,
      processed,
      processedCollected,
      processedPreview,
      previewColour,
      itemOffsets,
      collectedOffsets,
      backgroundColour,
      currentUsername,
      audio,
      refs: {
        highlightedTypeRef,
        hoverOwnBranchRef,
        interactionLockedRef,
        onFocusFadeChangeRef,
        onContentFocusRef,
        onContentUnfocusRef,
        onDetailLayoutStartRef,
        onDetailImageRectRef,
        onEntranceCompleteRef,
        onBranchFocusRef,
        onBranchIsolationExitRef,
        onAudioStateChangeRef,
        resetViewRef,
        soloTimelineRef,
        isolateOwnBranchRef,
        focusItemRef,
        highlightedPreviewIdRef,
        centerOnPreviewIdRef,
        onPreviewHoverRef,
        onGuestLockedHoverRef,
        onGuestLockedClickRef,
        reloadPreviewRef,
        beginPreviewFadeOutRef,
        onPreviewCollectStartRef,
        onPreviewCollectRef,
        cancelPreviewCollectRef,
        collectFocusedPreviewRef,
        reloadCollectedRef,
        highlightedMainContentIdRef,
        hoveredItemContentIdRef,
        hasCollectionPanelRef,
        menuOpenRef,
        viewersRef,
        seenTimelineIdsRef,
        collectorsRef,
        focusContentIdRef,
        setCollectionViewActiveRef,
        activeVideoSlugRef,
        onDismissVideoRef,
        onVideoPlayRef,
      },
    };
    sketchDepsRef.current = deps;
    const sketch = createTimelineSketch(deps);

    // p5's setup runs async after construction, so an immediate remove() (as in
    // a StrictMode double-mount or an HMR remount) can fire before the canvas
    // exists — leaving a zombie instance that later creates its canvas anyway
    // and keeps drawing on top of the real one. Defer construction one frame so
    // this effect's own cleanup can cancel it before it ever constructs.
    let cancelled = false;
    const rafId = requestAnimationFrame(() => {
      if (cancelled) {
        return;
      }
      // Purge any canvas a previous zombie instance may have left behind.
      container.replaceChildren();
      p5InstanceRef.current = new p5(sketch, container);
      const latestRows = collectedRowsRef.current;
      if (appliedCollectedRowsRef.current !== latestRows) {
        appliedCollectedRowsRef.current = latestRows;
        reloadCollectedRef.current?.(
          buildProcessedCollected(latestRows, items)
        );
      }
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      reloadCollectedRef.current = undefined;
      sketchDepsRef.current = null;
      interactionLockedRef.current = false;
      guestLockedHoverActiveRef.current = false;
      setGuestLockedHover(false);
      setGuestCursor(null);
      audio.dispose();
      audioRef.current = null;
      onAudioStateChangeRef.current?.(null);
      p5InstanceRef.current?.remove();
      p5InstanceRef.current = null;
      container.replaceChildren();
    };
    // previewItems / currentUsername / previewColour / colour are deliberately
    // not dependencies — they mutate deps (or hot-swap via refs) so login can
    // ease colour/blur without remounting the sketch.
  }, [items]);

  return (
    <div className="timeline-canvas-wrap">
      <P5CanvasHost containerRef={containerRef} />
      {guestLockedHover && guestCursor
        ? createPortal(
            <span
              className="cursor-label"
              style={{
                left: `${guestCursor.x}px`,
                top: `${guestCursor.y}px`,
              }}
            >
              {GUEST_LOCKED_CURSOR_LABEL}
            </span>,
            document.body
          )
        : null}
    </div>
  );
}

export default memo(TimelineCanvas);
