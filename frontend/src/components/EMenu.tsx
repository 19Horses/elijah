import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

function EMenu() {
  const [isVisible, setIsVisible] = useState(false);
  const [open, setOpen] = useState(false);

  // Mirrors the CollectionCountdown/UserCard entrance idiom: flip a class on
  // the next tick so the CSS transition actually plays instead of starting
  // in its end state.
  useEffect(() => {
    const id = window.setTimeout(() => setIsVisible(true), 0);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <div
      className={`e-menu${isVisible ? ' e-menu--visible' : ''}${
        open ? ' e-menu--open' : ''
      }`}
    >
      <button
        type="button"
        className="e-menu__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={() => setOpen((current) => !current)}
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
