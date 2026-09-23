import p5 from 'p5';
import { memo, useEffect, useRef, useState } from 'react';
import type { CollectedUserRow } from '../../queries/collectedContent';
import type { CollectionContent, ContentType } from '../../types/content';
import { DEFAULT_BACKGROUND, PREVIEW_SWITCH_FADE_MS } from './constants';
import { createTimelineSketch } from './createTimelineSketch';
import {
  createAudioController,
  type AudioController,
} from './sketch/audioController';
import {
  buildProcessedCollected,
  buildProcessedCollectionPreview,
  buildProcessedItems,
} from './processItems';
import P5CanvasHost from './P5CanvasHost';
import { createTimelineRuntime } from './timelineRuntime';
import type {
  BranchFocusInfo,
  FocusTarget,
  TimelineCanvasProps,
} from './types';

// Stable empty-array fallbacks for the destructuring defaults below — a
// literal `= []` default creates a brand-new array every render the prop is
// undefined, which (being a new reference each time) would otherwise re-fire
// the canvas-mount effect below on every unrelated re-render of the caller.
const EMPTY_COLLECTED_ROWS: CollectedUserRow[] = [];
const EMPTY_PREVIEW_ITEMS: CollectionContent[] = [];

function TimelineCanvas({
  items,
  collectedRows = EMPTY_COLLECTED_ROWS,
  previewItems = EMPTY_PREVIEW_ITEMS,
  previewColour = '#ffffff',
  highlightedPreviewContentId = null,
  onPreviewItemHover,
  colour,
  currentUsername = null,
  highlightedType = null,
  hoverOwnBranch = false,
  isolateControlRef,
  focusItemControlRef,
  audioControlRef,
  onAudioStateChange,
  onFocusFadeChange,
  onContentFocus,
  onContentUnfocus,
  onDetailLayoutStart,
  onDetailImageRect,
  onEntranceComplete,
  onBranchIsolationExit,
}: TimelineCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const interactionLockedRef = useRef(false);
  const p5InstanceRef = useRef<p5 | null>(null);
  const highlightedTypeRef = useRef<ContentType | null>(highlightedType);
  const hoverOwnBranchRef = useRef(hoverOwnBranch);
  const onFocusFadeChangeRef = useRef(onFocusFadeChange);
  const onContentFocusRef = useRef(onContentFocus);
  const onContentUnfocusRef = useRef(onContentUnfocus);
  const onDetailLayoutStartRef = useRef(onDetailLayoutStart);
  const onDetailImageRectRef = useRef(onDetailImageRect);
  const onEntranceCompleteRef = useRef(onEntranceComplete);
  const [branchFocus, setBranchFocus] = useState<BranchFocusInfo | null>(null);
  const onBranchFocusRef = useRef<
    ((info: BranchFocusInfo | null) => void) | undefined
  >(setBranchFocus);
  const onBranchIsolationExitRef = useRef(onBranchIsolationExit);
  const resetViewRef = useRef<(() => void) | undefined>(undefined);
  const localIsolateRef = useRef<(() => void) | undefined>(undefined);
  const isolateOwnBranchRef = isolateControlRef ?? localIsolateRef;
  const localFocusItemRef = useRef<((target: FocusTarget) => void) | undefined>(
    undefined
  );
  const focusItemRef = focusItemControlRef ?? localFocusItemRef;
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
  const onPreviewHoverRef = useRef(onPreviewItemHover);
  const reloadPreviewRef = useRef<
    | ((items: ReturnType<typeof buildProcessedCollectionPreview>) => void)
    | undefined
  >(undefined);
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
    onPreviewHoverRef.current = onPreviewItemHover;
  }, [onPreviewItemHover]);

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
      if (
        event.target instanceof HTMLElement &&
        event.target.closest('.collection-card-description')
      ) {
        event.stopImmediatePropagation();
        return;
      }

      const overlay = document.querySelector('.timeline-detail');

      // A detail is open: the wheel scrolls its text (wherever the cursor is,
      // since the image fills much of the screen) and never zooms the canvas.
      if (overlay) {
        const step = event.deltaMode === 1 ? 16 : 1;
        // Nudge every text container; only the one that overflows actually
        // moves, so we don't need to know which is the scroll element.
        overlay
          .querySelectorAll(
            '.timeline-detail__side, .timeline-detail__below, .timeline-detail__body, .timeline-detail__description'
          )
          .forEach((el) => {
            if (el instanceof HTMLElement) {
              el.scrollTop += event.deltaY * step;
            }
          });
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
    const processedCollected = buildProcessedCollected(collectedRows);
    const processedPreview = buildProcessedCollectionPreview(previewItems);
    const backgroundColour = colour || DEFAULT_BACKGROUND;
    const itemOffsets = processed.map(() => ({ dx: 0, dy: 0 }));
    const collectedOffsets = processedCollected.map(() => ({ dx: 0, dy: 0 }));
    const runtime = createTimelineRuntime();
    const audio = createAudioController();
    audioRef.current = audio;
    audioToggleRef.current = (src) => audioRef.current?.toggle(src);
    onAudioStateChangeRef.current?.(null);

    const sketch = createTimelineSketch({
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
        isolateOwnBranchRef,
        focusItemRef,
        highlightedPreviewIdRef,
        onPreviewHoverRef,
        reloadPreviewRef,
        beginPreviewFadeOutRef,
      },
    });

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
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      interactionLockedRef.current = false;
      audio.dispose();
      audioRef.current = null;
      onAudioStateChangeRef.current?.(null);
      p5InstanceRef.current?.remove();
      p5InstanceRef.current = null;
      container.replaceChildren();
    };
    // previewItems is deliberately not a dependency here — its initial value is
    // read once below for the sketch's first mount, but subsequent changes are
    // hot-swapped via reloadPreviewRef (above) instead of remounting the whole
    // canvas.
  }, [items, collectedRows, previewColour, colour, currentUsername]);

  return (
    <div className="timeline-canvas-wrap">
      {branchFocus && (
        <div className="timeline-branch-bar">
          <span className="timeline-branch-bar__label">
            <span
              className="timeline-branch-bar__dot"
              style={{ backgroundColor: branchFocus.colour }}
            />
            {branchFocus.username}
          </span>
          <button
            type="button"
            className="timeline-branch-bar__cancel"
            onClick={() => resetViewRef.current?.()}
          >
            Cancel
          </button>
        </div>
      )}
      <P5CanvasHost containerRef={containerRef} />
    </div>
  );
}

export default memo(TimelineCanvas);
