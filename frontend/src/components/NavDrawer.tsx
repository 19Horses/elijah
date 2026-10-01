import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import CollectedItemsList from './CollectedItemsList';
import Events from '../pages/Events';
import Login from '../pages/Login';
import Shop from '../pages/Shop';
import { getStoredUser, USER_CHANGED_EVENT } from '../services/userStorage';

const CLOSE_GRACE_MS = 300;

let measureCtx: CanvasRenderingContext2D | null | undefined;

function measureInkCenterShift(font: string): number | null {
  if (measureCtx === undefined) {
    measureCtx = document.createElement('canvas').getContext('2d');
  }
  if (!measureCtx) return null;

  measureCtx.font = font;
  const {
    actualBoundingBoxAscent: inkAscent,
    actualBoundingBoxDescent: inkDescent,
    fontBoundingBoxAscent: fontAscent,
    fontBoundingBoxDescent: fontDescent,
  } = measureCtx.measureText('e');

  if (
    fontAscent === undefined ||
    fontDescent === undefined ||
    inkAscent === undefined ||
    inkDescent === undefined
  ) {
    return null;
  }

  return (fontAscent - fontDescent - (inkAscent - inkDescent)) / 2;
}

type NavDrawerProps = {
  onCollectedItemHover?: Dispatch<SetStateAction<string | null>>;
  focusContentIdControlRef?: MutableRefObject<
    ((contentId: string) => void) | undefined
  >;
};

function NavDrawer({
  onCollectedItemHover,
  focusContentIdControlRef,
}: NavDrawerProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [hoverOpen, setHoverOpen] = useState(false);
  const [inkShift, setInkShift] = useState<number | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const closeTimeoutRef = useRef<number | null>(null);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [user, setUser] = useState(() => getStoredUser());

  useEffect(() => {
    const sync = () => setUser(getStoredUser());
    window.addEventListener(USER_CHANGED_EVENT, sync);
    return () => window.removeEventListener(USER_CHANGED_EVENT, sync);
  }, []);

  const accountRoute = user ? '/collection' : '/login';
  const drawerRoute =
    pathname === '/shop'
      ? 'shop'
      : pathname === '/events'
      ? 'events'
      : pathname === '/login'
      ? 'login'
      : pathname === '/collection'
      ? 'collection'
      : null;
  const drawerOpen = drawerRoute !== null;
  const listOpen = hoverOpen || drawerOpen;

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

  useEffect(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    let cancelled = false;
    const updateShift = () => {
      if (cancelled) return;
      setInkShift(measureInkCenterShift(getComputedStyle(trigger).font));
    };

    updateShift();
    document.fonts?.ready.then(updateShift);

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!drawerOpen) return undefined;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        navigate('/home');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [drawerOpen, navigate]);

  const clearCloseTimeout = () => {
    if (closeTimeoutRef.current !== null) {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  };

  const handleMouseEnter = () => {
    clearCloseTimeout();
    setHoverOpen(true);
  };

  const handleMouseLeave = () => {
    clearCloseTimeout();
    closeTimeoutRef.current = window.setTimeout(() => {
      closeTimeoutRef.current = null;
      setHoverOpen(false);
    }, CLOSE_GRACE_MS);
  };

  const goToOrClose = (to: string) => {
    navigate(pathname === to ? '/home' : to);
  };

  return (
    <>
      <div
        className={`nav-drawer__backdrop${
          drawerOpen ? ' nav-drawer__backdrop--visible' : ''
        }${drawerRoute === 'collection' ? ' nav-drawer__backdrop--light' : ''}`}
        onClick={() => navigate('/home')}
        aria-hidden="true"
      />
      <div
        className={`e-menu${isVisible ? ' e-menu--visible' : ''}${
          listOpen ? ' e-menu--open' : ''
        }${drawerOpen ? ' e-menu--drawer-open' : ''}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={
          inkShift !== null
            ? ({ '--e-ink-shift': `${inkShift}px` } as CSSProperties)
            : undefined
        }
      >
        <button
          ref={triggerRef}
          type="button"
          className="e-menu__trigger"
          aria-haspopup="menu"
          aria-expanded={listOpen}
          onClick={() => {
            clearCloseTimeout();
            if (drawerOpen) {
              navigate('/home');
              return;
            }
            setHoverOpen((current) => !current);
          }}
        >
          e
        </button>
        <div className="e-menu__items" role="menu" aria-hidden={!listOpen}>
          <Link
            to="/events"
            role="menuitem"
            className={`e-menu__item e-menu__item--events${
              pathname === '/events' ? ' e-menu__item--active' : ''
            }`}
            aria-current={pathname === '/events' ? 'page' : undefined}
            tabIndex={listOpen ? 0 : -1}
            onClick={(event) => {
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
              goToOrClose('/events');
            }}
          >
            Events
          </Link>
          <Link
            to="/shop"
            role="menuitem"
            className={`e-menu__item e-menu__item--shop${
              pathname === '/shop' ? ' e-menu__item--active' : ''
            }`}
            aria-current={pathname === '/shop' ? 'page' : undefined}
            tabIndex={listOpen ? 0 : -1}
            onClick={(event) => {
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
              goToOrClose('/shop');
            }}
          >
            Shop
          </Link>
          <Link
            to={accountRoute}
            role="menuitem"
            className={`e-menu__item e-menu__item--login${
              pathname === accountRoute ? ' e-menu__item--active' : ''
            }`}
            aria-current={pathname === accountRoute ? 'page' : undefined}
            tabIndex={listOpen ? 0 : -1}
            onClick={(event) => {
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
              goToOrClose(accountRoute);
            }}
          >
            {user ? user.username : 'Login'}
          </Link>
          <button
            type="button"
            role="menuitem"
            className="e-menu__item e-menu__item--mailing"
            tabIndex={listOpen ? 0 : -1}
          >
            Mailing list
          </button>
        </div>
      </div>
      <div
        className={`nav-drawer__panel${
          drawerOpen ? ' nav-drawer__panel--open' : ''
        }`}
      >
        <div className="nav-drawer__content">
          {drawerRoute === 'shop' && <Shop />}
          {drawerRoute === 'events' && <Events />}
          {drawerRoute === 'login' && <Login />}
          {drawerRoute === 'collection' && (
            <CollectedItemsList
              onItemHover={onCollectedItemHover}
              focusContentIdControlRef={focusContentIdControlRef}
            />
          )}
        </div>
      </div>
    </>
  );
}

export default NavDrawer;
