import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { DetailImageRect } from './timelineCanvas/types';
import RichText from './RichText';
import { hasRichText, type RichTextValue } from '../utils/richText';
import {
  MOBILE_DETAIL_SIDE_PX,
  MOBILE_DETAIL_TOP_PX,
  MOBILE_MEDIA_QUERY,
} from './timelineCanvas/constants';

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
  // On mobile, how far the details have scrolled (the picture, drawn on the
  // canvas, scrolls with them), and the picture's opacity as it passes
  // behind the header, and the screen y of the header's middle (0 when
  // unknown).
  onScroll?: (
    scrollTop: number,
    pictureAlpha: number,
    headerMid: number
  ) => void;
};

// Gutter between the image and the side text column: a share of the viewport
// width, clamped so it neither collapses nor sprawls.
const SIDE_GAP_VW = 0.068;
const SIDE_GAP_MIN_PX = 32;
const SIDE_GAP_MAX_PX = 96;

// On mobile, shares how far the details have scrolled and the picture's
// opacity with the page's CSS, so the video player (its own element, over
// the picture) scrolls and fades along with it.
function shareDetailScroll(scrollTop: number, pictureAlpha: number) {
  const root = document.documentElement.style;
  root.setProperty('--detail-scroll', `${scrollTop}px`);
  root.setProperty('--detail-picture-alpha', `${pictureAlpha}`);
}

function TimelineDetailOverlay({
  detail,
  imageRect = null,
  fading = false,
  onBack,
  onScroll,
}: TimelineDetailOverlayProps) {
  const [fullScreenUrl, setFullScreenUrl] = useState<string | null>(null);
  const stackRef = useRef<HTMLElement | null>(null);
  // On mobile, whether the back link and title have reached the top and
  // stuck there (masking the picture as it scrolls away above them).
  const [stuck, setStuck] = useState(false);
  // On mobile, the picture fades out as it scrolls up behind the header,
  // gone by the time the title sticks there.
  const [pictureAlpha, setPictureAlpha] = useState(1);
  // On mobile, the screen y of the middle of the header (back link, title
  // and date): the map's side nodes sit level with it.
  const readHeaderMid = () => {
    const header = stackRef.current?.querySelector(
      '.timeline-detail__side-header'
    );
    if (!header) {
      return 0;
    }
    const rect = header.getBoundingClientRect();
    return (rect.top + rect.bottom) / 2;
  };
  // A different item (or none) closes any picture left full screen, and
  // starts back at the top.
  const detailTitle = detail?.title;
  useEffect(() => {
    setFullScreenUrl(null);
    setStuck(false);
    setPictureAlpha(1);
    if (stackRef.current) {
      stackRef.current.scrollTop = 0;
    }
    // (Photos on mobile show under the details instead, so the canvas's
    // picture is hidden.)
    const canvasPictureAlpha =
      detail &&
      detail.imageUrls.length > 0 &&
      window.matchMedia(MOBILE_MEDIA_QUERY).matches
        ? 0
        : 1;
    shareDetailScroll(0, canvasPictureAlpha);
    onScroll?.(0, canvasPictureAlpha, readHeaderMid());
    // (Only on a new item: onScroll may be a fresh function each render.)
  }, [detailTitle]);
  // The header moves without a scroll too (as the picture above it settles),
  // so it's re-measured on every render.
  useLayoutEffect(() => {
    const stack = stackRef.current;
    if (!stack || !detail) {
      return;
    }
    onScroll?.(
      stack.scrollTop,
      detail.imageUrls.length > 0 ? 0 : pictureAlpha,
      readHeaderMid()
    );
  });
  useEffect(
    () => () => {
      const root = document.documentElement.style;
      root.removeProperty('--detail-scroll');
      root.removeProperty('--detail-picture-alpha');
    },
    []
  );

  if (!detail || !imageRect) {
    return null;
  }

  // On mobile the details stack under the picture, full width, rather than
  // sitting beside it (see computeFocusViewTargets).
  const isMobile = window.matchMedia(MOBILE_MEDIA_QUERY).matches;
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

  const picture = isGallery ? (
    <div
      className="timeline-detail__gallery"
      // Spans the full window height (so the pictures scroll across it)
      // while the first starts level with the image's top; on mobile, within
      // the picture's own place, clear of the details underneath.
      style={
        isMobile
          ? { top: 0, height: `${imageRect.height}px` }
          : {
              top: `${-imageRect.top}px`,
              height: `${window.innerHeight}px`,
              paddingTop: `${imageRect.top}px`,
              paddingBottom: `${imageRect.top}px`,
            }
      }
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
  ) : null;

  // On mobile, photos turn it the other way up: the details first, then the
  // pictures under them (as page images; the canvas's own copy stays
  // hidden). Inside the details' column, so its header stays stuck while
  // they scroll by.
  const photosBelow = isMobile && detail.imageUrls.length > 0;
  const photos = photosBelow ? (
    <div className="timeline-detail__stack-photos">
      {detail.imageUrls.map((url, index) => (
        <button
          key={url}
          type="button"
          className="timeline-detail__stack-photo"
          aria-label={`View ${detail.title} full screen`}
          onClick={() => setFullScreenUrl(url)}
        >
          <img src={url} alt={index === 0 ? detail.title : ''} />
        </button>
      ))}
    </div>
  ) : null;

  const side = (
    <div
      className="timeline-detail__side"
      // Spans the full window height. Header stays put; body/link scroll
      // in the space below so copy disappears into the header and can
      // continue past the bottom of the page. (On mobile it just follows
      // the picture, everything scrolling together: see index.css.)
      style={
        isMobile
          ? undefined
          : {
              left: `calc(100% + ${sideGap}px)`,
              width: `${sideWidth}px`,
              top: `${-imageRect.top}px`,
              height: `${window.innerHeight}px`,
              // Top inset matches the image; no bottom padding so the
              // letter scroll area runs all the way to the bottom of the
              // screen.
              paddingTop: `${imageRect.top}px`,
              paddingBottom: 0,
            }
      }
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
      {photos}
    </div>
  );

  const fullScreen = fullScreenUrl
    ? createPortal(
        <FullScreenImage
          url={fullScreenUrl}
          alt={detail.title}
          onClose={() => setFullScreenUrl(null)}
        />,
        document.body
      )
    : null;

  const className = `timeline-detail timeline-detail--visible${
    fading ? ' timeline-detail--fading' : ''
  }`;

  // On mobile the whole screen scrolls as one: the picture's place (drawn on
  // the canvas, which scrolls it along via onScroll), then the details
  // under it, full width.
  if (isMobile) {
    return (
      <aside
        ref={stackRef}
        className={`${className} timeline-detail--stacked${
          stuck ? ' timeline-detail--stuck' : ''
        }`}
        aria-label={detail.title}
        onScroll={(event) => {
          const stack = event.currentTarget;
          const header = stack.querySelector('.timeline-detail__side-header');
          let alpha = 1;
          let headerMid = 0;
          if (header) {
            const stickTop = parseFloat(getComputedStyle(header).top) || 0;
            const rect = header.getBoundingClientRect();
            const headerTop = rect.top;
            const isStuck = headerTop <= stickTop + 0.5;
            setStuck(isStuck);
            headerMid = (rect.top + rect.bottom) / 2;
            // From the picture's top reaching the header line to the title
            // sticking under it.
            const fadeSpan = imageRect.height + MOBILE_DETAIL_SIDE_PX;
            alpha =
              fadeSpan > 0
                ? Math.min(1, Math.max(0, (headerTop - stickTop) / fadeSpan))
                : 1;
          }
          if (photosBelow) {
            alpha = 0;
          }
          setPictureAlpha(alpha);
          shareDetailScroll(stack.scrollTop, alpha);
          onScroll?.(stack.scrollTop, alpha, headerMid);
        }}
      >
        {photosBelow ? (
          <div
            className="timeline-detail__stack-top"
            style={{ height: `${MOBILE_DETAIL_TOP_PX}px` }}
          />
        ) : (
          <div
            className="timeline-detail__stack-picture"
            style={{
              height: `${
                imageRect.top + imageRect.height + MOBILE_DETAIL_SIDE_PX
              }px`,
            }}
          >
            {/* Only over a picture of its own to tap: elsewhere (a video's or
              track's play button) taps go through to the canvas. */}
            {picture ? (
              <div
                className="timeline-detail__stack-picture-box"
                style={{
                  opacity: pictureAlpha,
                  pointerEvents: pictureAlpha <= 0 ? 'none' : undefined,
                  left: `${imageRect.left}px`,
                  top: `${imageRect.top}px`,
                  width: `${imageRect.width}px`,
                  height: `${imageRect.height}px`,
                }}
              >
                {picture}
              </div>
            ) : null}
          </div>
        )}
        {fullScreen}
        {side}
      </aside>
    );
  }

  return (
    <aside
      className={className}
      aria-label={detail.title}
      style={{
        left: `${imageRect.left}px`,
        top: `${imageRect.top}px`,
        width: `${imageRect.width}px`,
        height: `${imageRect.height}px`,
      }}
    >
      {picture}
      {fullScreen}
      {side}
    </aside>
  );
}

export default TimelineDetailOverlay;
