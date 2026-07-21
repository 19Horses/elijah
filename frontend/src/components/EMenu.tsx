import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

// How long the menu stays open after the pointer leaves before it actually
// closes. The items sit some distance from the e with empty space between
// them, so a straight-line mouse move from the e to an item briefly isn't
// over anything hoverable; this grace period absorbs that gap instead of
// the menu snapping shut mid-transit.
const CLOSE_GRACE_MS = 300;

function EMenu() {
  const [isVisible, setIsVisible] = useState(false);
  const [open, setOpen] = useState(false);
  const closeTimeoutRef = useRef<number | null>(null);

  // Mirrors the CollectionCountdown/UserCard entrance idiom: flip a class on
  // the next tick so the CSS transition actually plays instead of starting
  // in its end state.
  useEffect(() => {
    const id = window.setTimeout(() => setIsVisible(true), 0);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current !== null) {
        window.clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

  const clearCloseTimeout = () => {
    if (closeTimeoutRef.current !== null) {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  };

  const handleMouseEnter = () => {
    clearCloseTimeout();
    setOpen(true);
  };

  const handleMouseLeave = () => {
    clearCloseTimeout();
    closeTimeoutRef.current = window.setTimeout(() => {
      closeTimeoutRef.current = null;
      setOpen(false);
    }, CLOSE_GRACE_MS);
  };

  return (
    <div
      className={`e-menu${isVisible ? ' e-menu--visible' : ''}${
        open ? ' e-menu--open' : ''
      }`}
      // Hovering anywhere in the section (the e or a fanned-out item) keeps
      // the menu open; it only closes (after the grace period above) once
      // the pointer leaves the whole group, not just the trigger itself.
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        type="button"
        className="e-menu__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          clearCloseTimeout();
          setOpen((current) => !current);
        }}
      >
        e
      </button>
      <div className="e-menu__items" role="menu" aria-hidden={!open}>
        <Link
          to="/shop"
          role="menuitem"
          className="e-menu__item e-menu__item--shop"
          tabIndex={open ? 0 : -1}
        >
          Shop
        </Link>
        {/* Login and Mailing list are intentional inert placeholders; no destination decided yet. */}
        <button
          type="button"
          role="menuitem"
          className="e-menu__item e-menu__item--login"
          tabIndex={open ? 0 : -1}
        >
          Login
        </button>
        <button
          type="button"
          role="menuitem"
          className="e-menu__item e-menu__item--mailing"
          tabIndex={open ? 0 : -1}
        >
          Mailing list
        </button>
      </div>
    </div>
  );
}

export default EMenu;
