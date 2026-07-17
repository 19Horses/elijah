export type AudioButtonRegion = {
  cx: number;
  cy: number;
  r: number;
  src: string;
};

export type AudioController = {
  isPlaying: (src: string) => boolean;
  toggle: (src: string) => void;
  // The loaded track and whether it's currently playing, or null when none has
  // been started. Kept after pause/end so a mini player can offer to resume.
  getCurrent: () => { src: string; playing: boolean } | null;
  setButtonRegion: (region: AudioButtonRegion | null) => void;
  getButtonRegion: () => AudioButtonRegion | null;
  dispose: () => void;
};

/**
 * Owns a single HTMLAudioElement shared across the timeline so only one track
 * plays at a time, plus the world-space hit region for the on-canvas
 * play/pause button.
 */
export function createAudioController(): AudioController {
  let audio: HTMLAudioElement | null = null;
  let currentSrc: string | null = null;
  let playing = false;
  let region: AudioButtonRegion | null = null;

  const isPlaying = (src: string) => playing && currentSrc === src;

  const play = () => {
    if (!audio) return;
    void audio.play().then(
      () => {
        playing = true;
      },
      () => {
        playing = false;
      }
    );
    playing = true;
  };

  const toggle = (src: string) => {
    if (currentSrc !== src || !audio) {
      if (audio) {
        audio.pause();
      }
      audio = new Audio(src);
      currentSrc = src;
      audio.addEventListener('ended', () => {
        playing = false;
      });
      play();
      return;
    }

    if (playing) {
      audio.pause();
      playing = false;
    } else {
      if (audio.ended) {
        audio.currentTime = 0;
      }
      play();
    }
  };

  return {
    isPlaying,
    toggle,
    getCurrent: () => (currentSrc ? { src: currentSrc, playing } : null),
    setButtonRegion: (next) => {
      region = next;
    },
    getButtonRegion: () => region,
    dispose: () => {
      if (audio) {
        audio.pause();
      }
      audio = null;
      currentSrc = null;
      playing = false;
      region = null;
    },
  };
}
