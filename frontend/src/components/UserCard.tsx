import { useEffect, useState } from 'react';
import { getStoredUser, USER_CHANGED_EVENT } from '../services/userStorage';
import { DEFAULT_COLOUR, getStoredColour } from '../services/userColor';

type UserCardProps = {
  chromeOpacity?: number;
  onActivate?: () => void;
  onHoverChange?: (hovering: boolean) => void;
};

function UserCard({
  chromeOpacity = 1,
  onActivate,
  onHoverChange,
}: UserCardProps) {
  const [user, setUser] = useState(() => getStoredUser());
  const [colour, setColour] = useState(
    () => getStoredColour() ?? DEFAULT_COLOUR
  );

  useEffect(() => {
    const sync = () => {
      setUser(getStoredUser());
      setColour(getStoredColour() ?? DEFAULT_COLOUR);
    };
    window.addEventListener(USER_CHANGED_EVENT, sync);
    return () => window.removeEventListener(USER_CHANGED_EVENT, sync);
  }, []);

  if (!user) return null;

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
    </div>
  );
}

export default UserCard;
