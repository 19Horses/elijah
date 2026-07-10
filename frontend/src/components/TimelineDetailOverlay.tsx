import type { DetailImageRect } from './timelineCanvas/types';

export type TimelineDetailView = {
  title: string;
  dateLabel: string;
  description: string;
  link: string | null;
  newsletterContent: string | null;
  // Dated after today: the detail view inverts to black text on white.
  isFuture: boolean;
};

type TimelineDetailOverlayProps = {
  detail: TimelineDetailView | null;
  imageRect?: DetailImageRect | null;
};

// Gap between the image and the text placed above/below/beside it.
const TEXT_GAP_PX = 16;
// Padding kept between the side text and the right edge of the viewport.
const EDGE_PADDING_PX = 48;

function TimelineDetailOverlay({
  detail,
  imageRect = null,
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

  // Newsletters put their content to the right of the image, filling the
  // remaining viewport width; everything else stacks below the image.
  const isNewsletter = Boolean(detail.newsletterContent);
  const sideWidth = Math.max(
    0,
    window.innerWidth -
      (imageRect.left + imageRect.width) -
      TEXT_GAP_PX -
      EDGE_PADDING_PX
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
        detail.isFuture ? ' timeline-detail--light' : ''
      }`}
      aria-label={detail.title}
      style={{
        left: `${imageRect.left}px`,
        top: `${imageRect.top}px`,
        width: `${imageRect.width}px`,
        height: `${imageRect.height}px`,
      }}
    >
      <div
        className="timeline-detail__meta"
        style={{ maxHeight: `${aboveSpace}px` }}
      >
        <h2 className="timeline-detail__title">{detail.title}</h2>
        {detail.dateLabel ? (
          <p className="timeline-detail__date">{detail.dateLabel}</p>
        ) : null}
      </div>
      {isNewsletter ? (
        <div
          className="timeline-detail__side"
          style={{
            width: `${sideWidth}px`,
            // Span the full window height (so the text can scroll across it)
            // while keeping the first line at the image's top via top padding.
            top: `${-imageRect.top}px`,
            height: `${window.innerHeight}px`,
            paddingTop: `calc(${imageRect.top}px + 1.5rem)`,
            paddingBottom: `calc(${imageRect.top}px + 1.5rem)`,
          }}
        >
          <div className="timeline-detail__body">
            {detail.newsletterContent}
          </div>
          {linkNode}
        </div>
      ) : (
        <div
          className="timeline-detail__below"
          style={{ maxHeight: `${belowSpace}px` }}
        >
          {detail.description ? (
            <p className="timeline-detail__description">{detail.description}</p>
          ) : null}
          {linkNode}
        </div>
      )}
    </aside>
  );
}

export default TimelineDetailOverlay;
