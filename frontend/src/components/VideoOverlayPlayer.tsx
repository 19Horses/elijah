import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import ReactPlayer from 'react-player';
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
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [screenHovered, setScreenHovered] = useState(false);

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
      void document.exitFullscreen().catch(() => undefined);
    } else {
      void containerRef.current.requestFullscreen().catch(() => undefined);
    }
  }, []);

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
    : // The small player sits inline in the right-hand column.
      {};

  const showZoomedPoster = isZoomedIn && !state.playing && !isFullscreen;
  // Play stays visible while paused; pause glyph only appears on hover.
  const pauseIconVisible = !state.playing || screenHovered;

  return (
    <div
      ref={containerRef}
      className={`video-overlay-player ${
        isZoomedIn
          ? 'video-overlay-player--zoomed-in'
          : 'video-overlay-player--mini'
      }${isFullscreen ? ' video-overlay-player--fullscreen' : ''}${
        fading ? ' video-overlay-player--fading' : ''
      }${showZoomedPoster ? ' video-overlay-player--poster' : ''}`}
      style={containerStyle}
    >
      <div
        className="video-overlay-player__screen"
        onPointerEnter={() => setScreenHovered(true)}
        onPointerLeave={() => setScreenHovered(false)}
      >
        <ReactPlayer
          url={state.url}
          width="100%"
          height="100%"
          controls={false}
          playsinline
          // Starts over when it reaches the end.
          loop
          playing={state.playing}
          onPlay={onPlay}
          onPause={onPause}
          onEnded={onEnded}
        />

        {showZoomedPoster ? (
          state.posterUrl ? (
            <img
              className="video-overlay-player__poster"
              src={state.posterUrl}
              alt=""
            />
          ) : (
            <div className="video-overlay-player__poster video-overlay-player__poster--empty" />
          )
        ) : null}

        {isZoomedIn || isFullscreen ? (
          <button
            type="button"
            className={`video-overlay-player__play-toggle${
              pauseIconVisible
                ? ''
                : ' video-overlay-player__play-toggle--hidden'
            }`}
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
        ) : null}

        {state.playing || isFullscreen ? (
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
        ) : null}
      </div>

      {!isZoomedIn && !isFullscreen && (
        <div className="video-mini-player__bar">
          <button
            type="button"
            className="video-mini-player__jump"
            onClick={onJumpToItem}
            aria-label={`Jump to ${state.title}`}
          >
            {state.posterUrl ? (
              <img
                className="video-mini-player__art"
                src={state.posterUrl}
                alt=""
              />
            ) : (
              <div className="video-mini-player__art video-mini-player__art--empty" />
            )}
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
          <button
            type="button"
            className="video-mini-player__close"
            onClick={onClose}
            aria-label="Close video"
            title="Close video"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

export default VideoOverlayPlayer;
