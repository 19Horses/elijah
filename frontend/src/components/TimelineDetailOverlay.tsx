import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { DetailImageRect } from './timelineCanvas/types';

// Height (px) of the fade applied to an overflowing text block's edge.
const SCROLL_FADE_PX = 42;

// Builds a mask that fades the top and/or bottom edge to transparent, so
// overflowing text dissolves into the background on whichever side has more
// content to scroll to.
function buildScrollFadeMask(
  top: boolean,
  bottom: boolean
): string | undefined {
  if (!top && !bottom) {
    return undefined;
  }
  const topStop = top ? `transparent 0, #000 ${SCROLL_FADE_PX}px` : '#000 0';
  const bottomStop = bottom
    ? `#000 calc(100% - ${SCROLL_FADE_PX}px), transparent 100%`
    : '#000 100%';
  return `linear-gradient(to bottom, ${topStop}, ${bottomStop})`;
}

// A scrollable text block that fades its top/bottom edge only while there's
// hidden content in that direction.
function ScrollFadeText({
  className,
  children,
}: {
  className: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [fade, setFade] = useState({ top: false, bottom: false });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    const update = () => {
      const top = el.scrollTop > 1;
      const bottom = el.scrollTop + el.clientHeight < el.scrollHeight - 1;
      setFade((prev) =>
        prev.top === top && prev.bottom === bottom ? prev : { top, bottom }
      );
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      observer.disconnect();
    };
  }, [children]);

  const mask = buildScrollFadeMask(fade.top, fade.bottom);
  return (
    <p
      ref={ref}
      className={className}
      style={mask ? { maskImage: mask, WebkitMaskImage: mask } : undefined}
    >
      {children}
    </p>
  );
}

export type TimelineDetailView = {
  title: string;
  dateLabel: string;
  description: string;
  link: string | null;
  videoUrl: string | null;
  posterUrl: string | null;
  newsletterContent: string | null;
  // A solitary image is laid out like a newsletter (description beside the
  // image) even though it has no newsletter content of its own.
  presentAsNewsletter: boolean;
  // Music tracks show all their info (title, date, description) beside the
  // artwork.
  isAudio: boolean;
};

type TimelineDetailOverlayProps = {
  detail: TimelineDetailView | null;
  imageRect?: DetailImageRect | null;
  fading?: boolean;
};

// Gap between the image and the text placed above/below it.
const TEXT_GAP_PX = 16;
// Gutter between the image and the side text column: a share of the viewport
// width, clamped so it neither collapses nor sprawls.
const SIDE_GAP_VW = 0.068;
const SIDE_GAP_MIN_PX = 32;
const SIDE_GAP_MAX_PX = 96;

function TimelineDetailOverlay({
  detail,
  imageRect = null,
  fading = false,
}: TimelineDetailOverlayProps) {
  if (!detail || !imageRect) {
    return null;
  }

  // Space available above the image top and below the image bottom, so the
  // text blocks stay within the viewport.
  const aboveSpace = Math.max(0, imageRect.top - TEXT_GAP_PX * 2);
  const belowSpace = Math.max(
    0,
    window.innerHeight - (imageRect.top + imageRect.height) - TEXT_GAP_PX * 2
  );

  // Newsletters (and solitary images) put their body text to the right of the
  // image, ending as far from the right edge of the viewport as the image
  // starts from the left, so the text sits as far from the right edge node as
  // the image does from the left one; everything else stacks below.
  const isNewsletter =
    detail.presentAsNewsletter || Boolean(detail.newsletterContent);
  // Real newsletters carry their own content; a solitary image reuses its
  // description as the side body.
  const sideBody = detail.newsletterContent ?? detail.description;
  const sideGap = Math.min(
    SIDE_GAP_MAX_PX,
    Math.max(SIDE_GAP_MIN_PX, window.innerWidth * SIDE_GAP_VW)
  );
  const sideWidth = Math.max(
    0,
    window.innerWidth -
      imageRect.left -
      (imageRect.left + imageRect.width) -
      sideGap
  );

  const linkNode = detail.link ? (
    <a
      className="timeline-detail__link"
      href={detail.link}
      rel="noopener noreferrer"
      target="_blank"
    >
      {detail.link}
    </a>
  ) : null;

  return (
    <aside
      className={`timeline-detail timeline-detail--visible${
        isNewsletter ? ' timeline-detail--newsletter' : ''
      }${fading ? ' timeline-detail--fading' : ''}`}
      aria-label={detail.title}
      style={{
        left: `${imageRect.left}px`,
        top: `${imageRect.top}px`,
        width: `${imageRect.width}px`,
        height: `${imageRect.height}px`,
      }}
    >
      {detail.isAudio ? (
        <div
          className="timeline-detail__side timeline-detail__side--audio"
          style={{
            left: `calc(100% + ${sideGap}px)`,
            width: `${sideWidth}px`,
            top: 0,
            height: `${imageRect.height}px`,
          }}
        >
          <h2 className="timeline-detail__title">{detail.title}</h2>
          {detail.dateLabel ? (
            <p className="timeline-detail__date">{detail.dateLabel}</p>
          ) : null}
          {detail.description ? (
            <ScrollFadeText className="timeline-detail__description">
              {detail.description}
            </ScrollFadeText>
          ) : null}
          {linkNode}
        </div>
      ) : (
        <div
          className="timeline-detail__meta"
          // Newsletters caption the image from below; everything else titles
          // it from above.
          style={{ maxHeight: `${isNewsletter ? belowSpace : aboveSpace}px` }}
        >
          <h2 className="timeline-detail__title">{detail.title}</h2>
          {detail.dateLabel ? (
            <p className="timeline-detail__date">{detail.dateLabel}</p>
          ) : null}
        </div>
      )}
      {detail.isAudio ? null : isNewsletter ? (
        <div
          className="timeline-detail__side"
          style={{
            left: `calc(100% + ${sideGap}px)`,
            width: `${sideWidth}px`,
            // Span the full window height (so the text can scroll across it)
            // while keeping the first line at the image's top via top padding.
            top: `${-imageRect.top}px`,
            height: `${window.innerHeight}px`,
            paddingTop: `${imageRect.top}px`,
            paddingBottom: `${imageRect.top}px`,
          }}
        >
          <div className="timeline-detail__body">{sideBody}</div>
          {linkNode}
        </div>
      ) : (
        <div
          className="timeline-detail__below"
          style={{ maxHeight: `${belowSpace}px` }}
        >
          {detail.description ? (
            <ScrollFadeText className="timeline-detail__description">
              {detail.description}
            </ScrollFadeText>
          ) : null}
          {linkNode}
        </div>
      )}
    </aside>
  );
}

export default TimelineDetailOverlay;
