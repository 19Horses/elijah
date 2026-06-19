import { useEffect, useRef } from 'react';

export type TimelineDetailView = {
  title: string;
  dateLabel: string;
  description: string;
  link: string | null;
  newsletterContent: string | null;
};

type TimelineDetailOverlayProps = {
  detail: TimelineDetailView | null;
  imageHeightPx?: number | null;
};

function TimelineDetailOverlay({
  detail,
  imageHeightPx = null,
}: TimelineDetailOverlayProps) {
  const overlayRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) {
      return undefined;
    }

    const blockScroll = (event: WheelEvent) => {
      const scrollable = overlay.querySelector(
        '.timeline-detail__body, .timeline-detail__description'
      );
      if (
        scrollable instanceof HTMLElement &&
        scrollable.contains(event.target as Node)
      ) {
        const { scrollTop, scrollHeight, clientHeight } = scrollable;
        const deltaY = event.deltaY;
        const canScrollUp = scrollTop > 0;
        const canScrollDown = scrollTop + clientHeight < scrollHeight - 1;

        if ((deltaY < 0 && canScrollUp) || (deltaY > 0 && canScrollDown)) {
          return;
        }
      }

      event.preventDefault();
      event.stopImmediatePropagation();
    };

    overlay.addEventListener('wheel', blockScroll, {
      passive: false,
      capture: true,
    });
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
      style={
        imageHeightPx
          ? { maxHeight: `${Math.round(imageHeightPx)}px` }
          : undefined
      }
    >
      <div className="timeline-detail__meta">
        <h2 className="timeline-detail__title">{detail.title}</h2>
        {detail.dateLabel ? (
          <p className="timeline-detail__date">{detail.dateLabel}</p>
        ) : null}
      </div>
      {detail.newsletterContent ? (
        <div className="timeline-detail__body">{detail.newsletterContent}</div>
      ) : detail.description ? (
        <p className="timeline-detail__description">{detail.description}</p>
      ) : null}
      {detail.link ? (
        <a
          className="timeline-detail__link"
          href={detail.link}
          rel="noopener noreferrer"
          target="_blank"
        >
          {detail.link}
        </a>
      ) : null}
    </aside>
  );
}

export default TimelineDetailOverlay;
