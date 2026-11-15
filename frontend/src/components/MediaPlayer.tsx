import type { AudioPlayerState } from './timelineCanvas/types';

type MediaPlayerProps = {
  state: AudioPlayerState;
  onToggle: () => void;
  onJumpToItem: () => void;
  onClose: () => void;
};

// Persistent mini player shown once a track has been started and its own item
// isn't focused, so playback stays controllable after clicking away.
function MediaPlayer({
  state,
  onToggle,
  onJumpToItem,
  onClose,
}: MediaPlayerProps) {
  return (
    <div className="media-player" aria-label={`Now playing: ${state.title}`}>
      <button
        type="button"
        className="media-player__jump"
        onClick={onJumpToItem}
        aria-label={`Jump to ${state.title}`}
      >
        {state.imageUrl ? (
          <img className="media-player__art" src={state.imageUrl} alt="" />
        ) : (
          <div className="media-player__art media-player__art--empty" />
        )}
        <span className="media-player__title">{state.title}</span>
      </button>
      <button
        type="button"
        className="media-player__toggle"
        onClick={onToggle}
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
        className="media-player__close"
        onClick={onClose}
        aria-label="Close audio"
        title="Close audio"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
        </svg>
      </button>
    </div>
  );
}

export default MediaPlayer;
