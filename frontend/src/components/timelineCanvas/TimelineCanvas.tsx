import p5 from 'p5';
import { memo, useEffect, useRef, useState } from 'react';
import type { ContentType } from '../../types/content';
import { DEFAULT_BACKGROUND } from './constants';
import { createTimelineSketch } from './createTimelineSketch';
import { createAudioController } from './sketch/audioController';
import { buildProcessedCollected, buildProcessedItems } from './processItems';
import P5CanvasHost from './P5CanvasHost';
import { createTimelineRuntime } from './timelineRuntime';
import type { BranchFocusInfo, TimelineCanvasProps } from './types';

function TimelineCanvas({
  items,
  collectedRows = [],
  colour,
  currentUsername = null,
  highlightedType = null,
  onFocusFadeChange,
  onContentFocus,
  onContentUnfocus,
  onDetailLayoutStart,
  onDetailImageRect,
}: TimelineCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const interactionLockedRef = useRef(false);
  const p5InstanceRef = useRef<p5 | null>(null);
  const highlightedTypeRef = useRef<ContentType | null>(highlightedType);
  const onFocusFadeChangeRef = useRef(onFocusFadeChange);
  const onContentFocusRef = useRef(onContentFocus);
  const onContentUnfocusRef = useRef(onContentUnfocus);
  const onDetailLayoutStartRef = useRef(onDetailLayoutStart);
  const onDetailImageRectRef = useRef(onDetailImageRect);
  const [branchFocus, setBranchFocus] = useState<BranchFocusInfo | null>(null);
  const onBranchFocusRef =
    useRef<((info: BranchFocusInfo | null) => void) | undefined>(setBranchFocus);
  const resetViewRef = useRef<(() => void) | undefined>(undefined);

  useEffect(() => {
    highlightedTypeRef.current = highlightedType ?? null;
  }, [highlightedType]);

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
        interactionLockedRef,
        onFocusFadeChangeRef,
        onContentFocusRef,
        onContentUnfocusRef,
        onDetailLayoutStartRef,
        onDetailImageRectRef,
        onBranchFocusRef,
        resetViewRef,
      },
    });

    p5InstanceRef.current = new p5(sketch, container);

    return () => {
      interactionLockedRef.current = false;
      audio.dispose();
      p5InstanceRef.current?.remove();
      p5InstanceRef.current = null;
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
