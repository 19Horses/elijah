import { useEffect, useState } from 'react';
import { getStoredUser } from '../services/userStorage';
import { DEFAULT_COLOUR, getStoredColour } from '../services/userColor';
import { getCollectedItems } from '../services/collectItem';

type UserCardProps = {
  refreshSignal?: number;
  chromeOpacity?: number;
  onActivate?: () => void;
  onHoverChange?: (hovering: boolean) => void;
};

function UserCard({
  refreshSignal = 0,
  chromeOpacity = 1,
  onActivate,
  onHoverChange,
}: UserCardProps) {
  const [user] = useState(() => getStoredUser());
  const [colour] = useState(() => getStoredColour() ?? DEFAULT_COLOUR);
  const [collectedCount, setCollectedCount] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    void getCollectedItems(user.id)
      .then((items) => {
        if (!cancelled) setCollectedCount(items.length);
      })
      .catch((error) => {
        console.error('Failed to load collected items', error);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [user, refreshSignal]);

  if (!user || !loaded) return null;

  return (
    <div
      className="user-card"
      style={{
        opacity: chromeOpacity,
        pointerEvents: chromeOpacity < 0.5 ? 'none' : undefined,
        cursor: onActivate ? 'pointer' : undefined,
      }}
      role={onActivate ? 'button' : undefined}
      tabIndex={onActivate ? 0 : undefined}
      onClick={onActivate}
      onMouseEnter={() => onHoverChange?.(true)}
      onMouseLeave={() => onHoverChange?.(false)}
      onKeyDown={
        onActivate
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onActivate();
              }
            }
          : undefined
      }
    >
      <div className="user-card__header">
        <span
          className="user-card__swatch"
          style={{ backgroundColor: colour }}
          aria-hidden="true"
        />
        <span className="user-card__username">{user.username}</span>
      </div>

      <div className="user-card__stats">
        <div className="user-card__stat-label">
          <span>Collected</span>
          <span className="user-card__stat-count">{collectedCount}</span>
        </div>
        <div className="user-card__squares" aria-hidden="true">
          {Array.from({ length: collectedCount }).map((_, index) => (
            <span
              key={index}
              className="user-card__square"
              style={{ backgroundColor: colour }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default UserCard;
