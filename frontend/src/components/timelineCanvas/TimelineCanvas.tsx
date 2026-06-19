import p5 from 'p5';
import { memo, useEffect, useRef } from 'react';
import type { ContentType } from '../../types/content';
import { DEFAULT_BACKGROUND } from './constants';
import { createTimelineSketch } from './createTimelineSketch';
import {
  buildProcessedCollected,
  buildProcessedItems,
} from './processItems';
import P5CanvasHost from './P5CanvasHost';
import { createTimelineRuntime } from './timelineRuntime';
import type { TimelineCanvasProps } from './types';

function TimelineCanvas({
  items,
  collectedRows = [],
  colour,
  highlightedType = null,
  onFocusFadeChange,
  onContentFocus,
  onContentUnfocus,
  onDetailLayoutStart,
}: TimelineCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const interactionLockedRef = useRef(false);
  const p5InstanceRef = useRef<p5 | null>(null);
  const highlightedTypeRef = useRef<ContentType | null>(highlightedType);
  const onFocusFadeChangeRef = useRef(onFocusFadeChange);
  const onContentFocusRef = useRef(onContentFocus);
  const onContentUnfocusRef = useRef(onContentUnfocus);
  const onDetailLayoutStartRef = useRef(onDetailLayoutStart);

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
    const preventScrollWhileFocused = (event: WheelEvent) => {
      if (!interactionLockedRef.current) {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
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

    const processed = buildProcessedItems(items);
    const processedCollected = buildProcessedCollected(collectedRows);
    const backgroundColour = colour || DEFAULT_BACKGROUND;
    const itemOffsets = processed.map(() => ({ dx: 0, dy: 0 }));
    const collectedOffsets = processedCollected.map(() => ({ dx: 0, dy: 0 }));
    const runtime = createTimelineRuntime();

    const sketch = createTimelineSketch({
      runtime,
      items,
      processed,
      processedCollected,
      itemOffsets,
      collectedOffsets,
      backgroundColour,
      refs: {
        highlightedTypeRef,
        interactionLockedRef,
        onFocusFadeChangeRef,
        onContentFocusRef,
        onContentUnfocusRef,
        onDetailLayoutStartRef,
      },
    });

    p5InstanceRef.current = new p5(sketch, container);

    return () => {
      interactionLockedRef.current = false;
      p5InstanceRef.current?.remove();
      p5InstanceRef.current = null;
    };
  }, [items, collectedRows, colour]);

  return (
    <div className="timeline-canvas-wrap">
      <P5CanvasHost containerRef={containerRef} />
    </div>
  );
}

export default memo(TimelineCanvas);
