import { useEffect, useState } from 'react';
import type { Collection } from '../queries/collection';
import {
  DEBUG_TIMERS_EVENT,
  getEffectiveExpiresAt,
} from '../services/debugTimers';
import { getDisplayColour } from '../services/userColor';
import RichText from './RichText';
import { hasRichText } from '../utils/richText';

type CollectionCountdownProps = {
  collection: Collection;
  onClick?: () => void;
  // Whether its items are showing, which then stand in for the summary of
  // what's in it.
  open?: boolean;
  // Shown inside the box under its details (the collection's items, when
  // it's open).
  children?: React.ReactNode;
};

function formatCountdown(ms: number): string {
  if (ms <= 0) return '0:00:00';

  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n: number) => String(n).padStart(2, '0');

  if (days > 0) {
    return `${days}d ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

// What a collection holds, by kind, e.g. "4 photos, 1 video, 2 letters".
const CONTENT_KINDS: [type: string, one: string, many: string][] = [
  ['imageAsset', 'photo', 'photos'],
  ['videoAsset', 'video', 'videos'],
  ['audioAsset', 'track', 'tracks'],
  ['newsletter', 'letter', 'letters'],
  ['event', 'event', 'events'],
];

function describeContents(collection: Collection): string {
  const counts = new Map<string, number>();
  (collection.content ?? []).forEach((item) => {
    counts.set(item._type, (counts.get(item._type) ?? 0) + 1);
  });
  return CONTENT_KINDS.flatMap(([type, one, many]) => {
    const count = counts.get(type) ?? 0;
    return count > 0 ? [`${count} ${count === 1 ? one : many}`] : [];
  }).join(', ');
}

function CollectionCountdown({
  collection,
  onClick,
  open = false,
  children,
}: CollectionCountdownProps) {
  const [remaining, setRemaining] = useState<number>(() => {
    const expiresAt = getEffectiveExpiresAt(collection);
    if (!expiresAt) return 0;
    return Math.max(0, new Date(expiresAt).getTime() - Date.now());
  });
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setIsVisible(true), 0);
    return () => window.clearTimeout(id);
  }, [collection._id]);

  useEffect(() => {
    const tick = () => {
      const expiresAt = getEffectiveExpiresAt(collection);
      const ms = expiresAt
        ? Math.max(0, new Date(expiresAt).getTime() - Date.now())
        : 0;
      setRemaining(ms);
    };

    // When the timer is reset via the debug panel, replay the entrance
    // animation so the box visibly pops up again.
    const onDebugChange = () => {
      tick();
      setIsVisible(false);
      requestAnimationFrame(() =>
        requestAnimationFrame(() => setIsVisible(true))
      );
    };

    tick();
    const id = window.setInterval(tick, 1000);
    window.addEventListener(DEBUG_TIMERS_EVENT, onDebugChange);
    return () => {
      window.clearInterval(id);
      window.removeEventListener(DEBUG_TIMERS_EVENT, onDebugChange);
    };
  }, [collection]);

  if (remaining <= 0) return null;

  const colour = getDisplayColour();
  const contents = describeContents(collection);

  return (
    <div
      className={`collection-countdown${
        isVisible ? ' collection-countdown--visible' : ''
      }`}
      style={{ '--countdown-tint': colour } as React.CSSProperties}
    >
      <button
        type="button"
        className="collection-countdown__toggle"
        aria-live="polite"
        aria-atomic="true"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onClick?.();
        }}
      >
        <span className="collection-countdown__header">
          <span className="collection-countdown__new">NEW COLLECTION!</span>
          <span className="collection-countdown__timer">
            {formatCountdown(remaining)}
          </span>
        </span>
        <span className="collection-countdown__label">{collection.name}</span>
        {collection.imageUrl && (
          <img
            className="collection-countdown__image"
            src={collection.imageUrl}
            alt=""
            style={
              collection.imageDimensions
                ? { aspectRatio: collection.imageDimensions.aspectRatio }
                : undefined
            }
          />
        )}
        {hasRichText(collection.description) && (
          <span className="collection-countdown__description">
            <RichText value={collection.description} />
          </span>
        )}
        {contents && !open && (
          <span className="collection-countdown__contents">{contents}</span>
        )}
      </button>
      {children}
    </div>
  );
}

export default CollectionCountdown;
