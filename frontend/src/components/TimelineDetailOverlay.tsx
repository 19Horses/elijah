import { useEffect, useRef } from 'react';

export type TimelineDetailView = {
  title: string;
  dateLabel: string;
  description: string;
};

type TimelineDetailOverlayProps = {
  detail: TimelineDetailView | null;
};

function TimelineDetailOverlay({ detail }: TimelineDetailOverlayProps) {
  const overlayRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) {
      return undefined;
    }

    const blockScroll = (event: WheelEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
    };

    overlay.addEventListener('wheel', blockScroll, { passive: false, capture: true });
    return () =>
      overlay.removeEventListener('wheel', blockScroll, { capture: true });
  }, [detail]);

  if (!detail) {
    return null;
  }

  return (
    <aside
      ref={overlayRef}
      className="timeline-detail timeline-detail--visible"
      aria-label={detail.title}
    >
      <div className="timeline-detail__meta">
        <h2 className="timeline-detail__title">{detail.title}</h2>
        {detail.dateLabel ? (
          <p className="timeline-detail__date">{detail.dateLabel}</p>
        ) : null}
      </div>
      {detail.description ? (
        <p className="timeline-detail__description">{detail.description}</p>
      ) : null}
    </aside>
  );
}

export default TimelineDetailOverlay;
