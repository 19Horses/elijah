import { useEffect, useState } from 'react';
import type { Collection } from '../queries/collection';
import { DEFAULT_COLOUR, getStoredColour } from '../services/userColor';

type CollectionCountdownProps = {
  collection: Collection;
  onClick?: () => void;
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

function CollectionCountdown({
  collection,
  onClick,
}: CollectionCountdownProps) {
  const [remaining, setRemaining] = useState<number>(() => {
    if (!collection.expiresAt) return 0;
    return Math.max(0, new Date(collection.expiresAt).getTime() - Date.now());
  });
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setIsVisible(true), 0);
    return () => window.clearTimeout(id);
  }, [collection._id]);

  useEffect(() => {
    if (!collection.expiresAt) return;

    const tick = () => {
      const ms = Math.max(
        0,
        new Date(collection.expiresAt!).getTime() - Date.now()
      );
      setRemaining(ms);
    };

    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [collection.expiresAt]);

  if (!collection.expiresAt || remaining <= 0) return null;

  const colour = getStoredColour() ?? DEFAULT_COLOUR;

  return (
    <div
      className={`collection-countdown${
        isVisible ? ' collection-countdown--visible' : ''
      }`}
      style={{ '--countdown-tint': colour } as React.CSSProperties}
      aria-live="polite"
      aria-atomic="true"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
    >
      <span className="collection-countdown__label">{collection.name}</span>
      <span className="collection-countdown__timer">
        {formatCountdown(remaining)}
      </span>
    </div>
  );
}

export default CollectionCountdown;
