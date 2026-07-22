import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { prefersReducedMotion } from '../utils/motionPreference';

// How long the menu stays open after the pointer leaves before it actually
// closes. The items sit some distance from the e with empty space between
// them, so a straight-line mouse move from the e to an item briefly isn't
// over anything hoverable; this grace period absorbs that gap instead of
// the menu snapping shut mid-transit.
const CLOSE_GRACE_MS = 300;

// How long the outgoing screen fades out before we actually navigate. Must
// match the `main` transition duration in index.css.
const SCREEN_FADE_OUT_MS = 400;

function EMenu() {
  const [isVisible, setIsVisible] = useState(false);
  const [open, setOpen] = useState(false);
  const closeTimeoutRef = useRef<number | null>(null);
  const fadeTimeoutRef = useRef<number | null>(null);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  // On the timeline screen itself, clicking the e just toggles the fan-out
  // (there's nowhere else for it to take you). Everywhere else, it's a way
  // back to the main timeline.
  const isOnTimeline = pathname === '/home';

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
      if (fadeTimeoutRef.current !== null) {
        window.clearTimeout(fadeTimeoutRef.current);
      }
    };
  }, []);

  const clearCloseTimeout = () => {
    if (closeTimeoutRef.current !== null) {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  };

  // Fades the current screen out (whatever's rendered in <main>, be it the
  // timeline canvas or the shop grid), then navigates once that finishes -
  // the same "animate, then setTimeout before navigating" idiom Landing.tsx
  // already uses for its own exit transition.
  const fadeOutThenGo = (to: string) => {
    document.querySelector('main')?.classList.add('main--leaving');
    fadeTimeoutRef.current = window.setTimeout(
      () => navigate(to),
      prefersReducedMotion() ? 0 : SCREEN_FADE_OUT_MS
    );
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
      }${
        // The e only acts as a "back to timeline" link off the timeline
        // itself - only show its link-hover colour there.
        !isOnTimeline ? ' e-menu--linkable' : ''
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
          if (isOnTimeline) {
            setOpen((current) => !current);
          } else {
            fadeOutThenGo('/home');
          }
        }}
      >
        e
      </button>
      <div className="e-menu__items" role="menu" aria-hidden={!open}>
        <Link
          to="/shop"
          role="menuitem"
          className={`e-menu__item e-menu__item--shop${
            pathname === '/shop' ? ' e-menu__item--active' : ''
          }`}
          aria-current={pathname === '/shop' ? 'page' : undefined}
          tabIndex={open ? 0 : -1}
          onClick={(event) => {
            // Let modified/non-primary clicks (open in new tab, etc.)
            // behave like a normal link; only intercept a plain click.
            if (
              event.defaultPrevented ||
              event.button !== 0 ||
              event.metaKey ||
              event.ctrlKey ||
              event.shiftKey ||
              event.altKey
            ) {
              return;
            }
            event.preventDefault();
            fadeOutThenGo('/shop');
          }}
        >
          Shop
        </Link>
        <Link
          to="/events"
          role="menuitem"
          className={`e-menu__item e-menu__item--events${
            pathname === '/events' ? ' e-menu__item--active' : ''
          }`}
          aria-current={pathname === '/events' ? 'page' : undefined}
          tabIndex={open ? 0 : -1}
          onClick={(event) => {
            // Let modified/non-primary clicks (open in new tab, etc.)
            // behave like a normal link; only intercept a plain click.
            if (
              event.defaultPrevented ||
              event.button !== 0 ||
              event.metaKey ||
              event.ctrlKey ||
              event.shiftKey ||
              event.altKey
            ) {
              return;
            }
            event.preventDefault();
            fadeOutThenGo('/events');
          }}
        >
          Events
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
