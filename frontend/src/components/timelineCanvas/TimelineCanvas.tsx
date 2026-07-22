import p5 from 'p5';
import { memo, useEffect, useRef, useState } from 'react';
import type { ContentType } from '../../types/content';
import { DEFAULT_BACKGROUND } from './constants';
import { createTimelineSketch } from './createTimelineSketch';
import {
  createAudioController,
  type AudioController,
} from './sketch/audioController';
import { buildProcessedCollected, buildProcessedItems } from './processItems';
import P5CanvasHost from './P5CanvasHost';
import { createTimelineRuntime } from './timelineRuntime';
import type {
  BranchFocusInfo,
  FocusTarget,
  TimelineCanvasProps,
} from './types';

function TimelineCanvas({
  items,
  collectedRows = [],
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
  const resetViewRef = useRef<(() => void) | undefined>(undefined);
  const localIsolateRef = useRef<(() => void) | undefined>(undefined);
  const isolateOwnBranchRef = isolateControlRef ?? localIsolateRef;
  const localFocusItemRef = useRef<
    ((target: FocusTarget) => void) | undefined
  >(undefined);
  const focusItemRef = focusItemControlRef ?? localFocusItemRef;
  const onAudioStateChangeRef = useRef(onAudioStateChange);
  const localAudioControlRef = useRef<((src: string) => void) | undefined>(
    undefined
  );
  const audioToggleRef = audioControlRef ?? localAudioControlRef;
  // Points at the live controller so the toggle ref can control playback.
  const audioRef = useRef<AudioController | null>(null);

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
    const preventScrollWhileFocused = (event: WheelEvent) => {
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
        onAudioStateChangeRef,
        resetViewRef,
        isolateOwnBranchRef,
        focusItemRef,
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
  }, [items, collectedRows, colour, currentUsername]);

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
