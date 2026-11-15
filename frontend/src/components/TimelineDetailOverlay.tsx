import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { DetailImageRect } from './timelineCanvas/types';
import RichText from './RichText';
import { hasRichText, type RichTextValue } from '../utils/richText';

// A picture shown full screen over everything; a click anywhere or Escape
// closes it.
function FullScreenImage({
  url,
  alt,
  onClose,
}: {
  url: string;
  alt: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // Only closes the picture, not the drawer or detail behind it.
        event.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () =>
      window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [onClose]);

  // The whole screen is the close button, focused so Enter/Space close too.
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  return (
    <button
      ref={closeRef}
      type="button"
      className="full-screen-image"
      aria-label={`Close ${alt}`}
      onClick={onClose}
    >
      <img className="full-screen-image__picture" src={url} alt={alt} />
    </button>
  );
}

export type TimelineDetailView = {
  title: string;
  dateLabel: string;
  description: RichTextValue;
  link: string | null;
  newsletterContent: RichTextValue;
  videoUrl: string | null;
  posterUrl: string | null;
  // A solitary image is laid out like a newsletter (description beside the
  // image) even though it has no newsletter content of its own.
  presentAsNewsletter: boolean;
  // Music tracks show all their info (title, date, description) beside the
  // artwork.
  isAudio: boolean;
  // Events use the same beside-the-image layout as music, so the top of the
  // picture stays clear for "Back to world map".
  isEvent: boolean;
  // A photo item's pictures, cover first (empty for anything else). Several
  // make a gallery: a vertically scrolling column in the image's place, with
  // all the info beside it like a music track's. Any can be clicked to view
  // full screen.
  imageUrls: string[];
  // First open of an unseen main-timeline item: show the live-style New mark
  // above the title for this view.
  unseen?: boolean;
};

type TimelineDetailOverlayProps = {
  detail: TimelineDetailView | null;
  imageRect?: DetailImageRect | null;
  fading?: boolean;
  // Backs out to the whole map (the link over the picture's corner).
  onBack?: () => void;
};

// Gutter between the image and the side text column: a share of the viewport
// width, clamped so it neither collapses nor sprawls.
const SIDE_GAP_VW = 0.068;
const SIDE_GAP_MIN_PX = 32;
const SIDE_GAP_MAX_PX = 96;

function TimelineDetailOverlay({
  detail,
  imageRect = null,
  fading = false,
  onBack,
}: TimelineDetailOverlayProps) {
  const [fullScreenUrl, setFullScreenUrl] = useState<string | null>(null);
  // A different item (or none) closes any picture left full screen.
  const detailTitle = detail?.title;
  useEffect(() => {
    setFullScreenUrl(null);
  }, [detailTitle]);

  if (!detail || !imageRect) {
    return null;
  }

  // Newsletter body when present; otherwise the regular description.
  const bodyContent = hasRichText(detail.newsletterContent)
    ? detail.newsletterContent
    : detail.description;
  const sideGap = Math.min(
    SIDE_GAP_MAX_PX,
    Math.max(SIDE_GAP_MIN_PX, window.innerWidth * SIDE_GAP_VW)
  );
  const sideWidth = Math.max(
    0,
    window.innerWidth -
      // At the image's settled place, so the column doesn't widen as the
      // view zooms in.
      (imageRect.finalLeft ?? imageRect.left) -
      ((imageRect.finalLeft ?? imageRect.left) +
        (imageRect.finalWidth ?? imageRect.width)) -
      sideGap
  );

  const isGallery = detail.imageUrls.length > 1;

  return (
    <aside
      className={`timeline-detail timeline-detail--visible${
        fading ? ' timeline-detail--fading' : ''
      }`}
      aria-label={detail.title}
      style={{
        left: `${imageRect.left}px`,
        top: `${imageRect.top}px`,
        width: `${imageRect.width}px`,
        height: `${imageRect.height}px`,
      }}
    >
      {isGallery ? (
        <div
          className="timeline-detail__gallery"
          // Spans the full window height (so the pictures scroll across it)
          // while the first starts level with the image's top.
          style={{
            top: `${-imageRect.top}px`,
            height: `${window.innerHeight}px`,
            paddingTop: `${imageRect.top}px`,
            paddingBottom: `${imageRect.top}px`,
          }}
        >
          {detail.imageUrls.map((url, index) => (
            <button
              key={url}
              type="button"
              className="timeline-detail__gallery-button"
              onClick={() => setFullScreenUrl(url)}
            >
              <img
                className="timeline-detail__gallery-image"
                src={url}
                alt={index === 0 ? detail.title : ''}
              />
            </button>
          ))}
        </div>
      ) : detail.imageUrls.length === 1 ? (
        // A single picture is drawn on the canvas; this catches clicks on it.
        <button
          type="button"
          className="timeline-detail__image-button"
          aria-label={`View ${detail.title} full screen`}
          onClick={() => setFullScreenUrl(detail.imageUrls[0])}
        />
      ) : null}
      {fullScreenUrl
        ? createPortal(
            <FullScreenImage
              url={fullScreenUrl}
              alt={detail.title}
              onClose={() => setFullScreenUrl(null)}
            />,
            document.body
          )
        : null}
      <div
        className="timeline-detail__side"
        // Spans the full window height. Header stays put; body/link scroll
        // in the space below so copy disappears into the header and can
        // continue past the bottom of the page.
        style={{
          left: `calc(100% + ${sideGap}px)`,
          width: `${sideWidth}px`,
          top: `${-imageRect.top}px`,
          height: `${window.innerHeight}px`,
          // Top inset matches the image; no bottom padding so the letter
          // scroll area runs all the way to the bottom of the screen.
          paddingTop: `${imageRect.top}px`,
          paddingBottom: 0,
        }}
      >
        <div className="timeline-detail__side-header">
          {onBack ? (
            <button
              type="button"
              className="timeline-detail__back"
              onClick={onBack}
            >
              <span aria-hidden="true">&larr;</span> Back to world map
            </button>
          ) : null}
          <div className="timeline-detail__heading">
            {detail.unseen ? (
              <p className="timeline-detail__unseen timeline-detail__unseen--end">
                New
                <span
                  className="timeline-detail__unseen-square"
                  aria-hidden="true"
                />
              </p>
            ) : null}
            <h2 className="timeline-detail__title">{detail.title}</h2>
          </div>
          {detail.dateLabel ? (
            <p className="timeline-detail__date">{detail.dateLabel}</p>
          ) : null}
        </div>
        <div className="timeline-detail__side-scroll">
          {hasRichText(bodyContent) ? (
            <div className="timeline-detail__body">
              <RichText value={bodyContent} />
            </div>
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
        </div>
      </div>
    </aside>
  );
}

export default TimelineDetailOverlay;
