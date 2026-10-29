import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import ReactPlayer from 'react-player';
import ContentTypeIcon from './ContentTypeIcon';
import type { DetailImageRect, FocusTarget } from './timelineCanvas/types';

export type VideoPlayerState = {
  url: string;
  title: string;
  posterUrl: string | null;
  slug: string;
  focusTarget: FocusTarget | null;
  playing: boolean;
};

type VideoOverlayPlayerProps = {
  state: VideoPlayerState;
  isZoomedIn: boolean;
  imageRect?: DetailImageRect | null;
  fading?: boolean;
  onTogglePlay: () => void;
  onPlay: () => void;
  onPause: () => void;
  onEnded: () => void;
  onClose: () => void;
  onJumpToItem: () => void;
};

type Position = { x: number; y: number };

const MARGIN_PX = 24;

function VideoOverlayPlayer({
  state,
  isZoomedIn,
  imageRect = null,
  fading = false,
  onTogglePlay,
  onPlay,
  onPause,
  onEnded,
  onClose,
  onJumpToItem,
}: VideoOverlayPlayerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [miniPos, setMiniPos] = useState<Position | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const dragRef = useRef<{
    startX: number;
    startY: number;
    initialX: number;
    initialY: number;
    moved: boolean;
  } | null>(null);

  // Sync fullscreen state
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const handleToggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    } else {
      void containerRef.current.requestFullscreen().catch(() => {});
    }
  }, []);

  // Clamping and snapping to nearest screen edge (left vs right, top vs bottom)
  const snapToEdges = useCallback((x: number, y: number) => {
    const el = containerRef.current;
    const width = el?.offsetWidth ?? 240;
    const height = el?.offsetHeight ?? 180;
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    // Snap horizontally to left or right margin
    const distLeft = Math.abs(x - MARGIN_PX);
    const distRight = Math.abs(windowWidth - MARGIN_PX - width - x);
    const snappedX =
      distLeft < distRight ? MARGIN_PX : windowWidth - MARGIN_PX - width;

    // Clamp vertically, snapping to top or bottom margin if within reasonable range
    const maxTop = Math.max(MARGIN_PX, windowHeight - MARGIN_PX - height);
    let snappedY = Math.min(Math.max(MARGIN_PX, y), maxTop);
    const distTop = Math.abs(snappedY - MARGIN_PX);
    const distBottom = Math.abs(maxTop - snappedY);
    if (distTop < 60) {
      snappedY = MARGIN_PX;
    } else if (distBottom < 60) {
      snappedY = maxTop;
    }

    return { x: snappedX, y: snappedY };
  }, []);

  // Recalculate snap on window resize
  useEffect(() => {
    const handleResize = () => {
      setMiniPos((prev) => {
        if (!prev) return null;
        return snapToEdges(prev.x, prev.y);
      });
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [snapToEdges]);

  const handlePointerDown = (e: ReactPointerEvent) => {
    if (isZoomedIn || isFullscreen) return;
    // Don't start drag on buttons or interactive elements
    const target = e.target as HTMLElement;
    if (target.closest('button')) return;

    e.preventDefault();
    const el = containerRef.current;
    const currentRect = el?.getBoundingClientRect();
    const initialX = currentRect
      ? currentRect.left
      : window.innerWidth - 240 - MARGIN_PX;
    const initialY = currentRect ? currentRect.top : MARGIN_PX;

    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialX,
      initialY,
      moved: false,
    };
    setIsDragging(true);

    const onPointerMove = (moveEvt: PointerEvent) => {
      if (!dragRef.current) return;
      const dx = moveEvt.clientX - dragRef.current.startX;
      const dy = moveEvt.clientY - dragRef.current.startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        dragRef.current.moved = true;
      }
      const rawX = dragRef.current.initialX + dx;
      const rawY = dragRef.current.initialY + dy;
      setMiniPos({ x: rawX, y: rawY });
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      setIsDragging(false);

      if (dragRef.current) {
        setMiniPos((prev) => {
          if (!prev) return null;
          return snapToEdges(prev.x, prev.y);
        });
        dragRef.current = null;
      }
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const containerStyle: CSSProperties = isFullscreen
    ? {
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        zIndex: 9999,
      }
    : isZoomedIn && imageRect
    ? {
        position: 'fixed',
        left: `${imageRect.left}px`,
        top: `${imageRect.top}px`,
        width: `${imageRect.width}px`,
        height: `${imageRect.height}px`,
        zIndex: 10,
      }
    : !isZoomedIn && miniPos
    ? {
        position: 'fixed',
        left: `${miniPos.x}px`,
        top: `${miniPos.y}px`,
        width: 'var(--top-right-card-width, 240px)',
        zIndex: 22,
        transition: isDragging
          ? 'none'
          : 'left 0.25s cubic-bezier(0.2, 0.9, 0.3, 1), top 0.25s cubic-bezier(0.2, 0.9, 0.3, 1)',
      }
    : !isZoomedIn
    ? {
        position: 'fixed',
        right: `${MARGIN_PX}px`,
        top: `${MARGIN_PX}px`,
        width: 'var(--top-right-card-width, 240px)',
        zIndex: 22,
      }
    : {};

  return (
    <div
      ref={containerRef}
      className={`video-overlay-player ${
        isZoomedIn
          ? 'video-overlay-player--zoomed-in'
          : 'video-overlay-player--mini'
      }${isFullscreen ? ' video-overlay-player--fullscreen' : ''}${
        fading ? ' video-overlay-player--fading' : ''
      }${isDragging ? ' video-overlay-player--dragging' : ''}`}
      style={containerStyle}
      onPointerDown={handlePointerDown}
    >
      <div className="video-overlay-player__screen">
        <ReactPlayer
          url={state.url}
          width="100%"
          height="100%"
          controls={false}
          playsinline
          playing={state.playing}
          onPlay={onPlay}
          onPause={onPause}
          onEnded={onEnded}
        />

        {/* Fullscreen toggle button */}
        <button
          type="button"
          className="video-player__action-btn video-player__fullscreen"
          onClick={handleToggleFullscreen}
          aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        >
          {isFullscreen ? (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
            </svg>
          )}
        </button>

        {!isZoomedIn && !isFullscreen && (
          <button
            type="button"
            className="video-player__action-btn video-mini-player__close"
            onClick={onClose}
            aria-label="Close video"
            title="Close video"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        )}
      </div>

      {!isZoomedIn && !isFullscreen && (
        <div className="video-mini-player__bar">
          <button
            type="button"
            className="video-mini-player__jump"
            onClick={onJumpToItem}
            aria-label={`Jump to ${state.title}`}
          >
            <ContentTypeIcon
              type="videoAsset"
              className="video-mini-player__icon"
            />
            <span className="video-mini-player__title">{state.title}</span>
          </button>
          <button
            type="button"
            className="video-mini-player__toggle"
            onClick={onTogglePlay}
            aria-label={state.playing ? 'Pause' : 'Play'}
          >
            {state.playing ? (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="6" y="5" width="4" height="14" rx="1" />
                <rect x="14" y="5" width="4" height="14" rx="1" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

export default VideoOverlayPlayer;
