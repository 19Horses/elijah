import type p5 from 'p5';

export type GalleryNavRegion = {
  cx: number;
  cy: number;
  r: number;
  delta: number;
};

export type GalleryController = {
  getImage: (url: string) => p5.Image | null;
  ensureLoaded: (urls: string[]) => void;
  syncFocus: (key: string | null) => void;
  getActiveIndex: () => number;
  getDisplayIndex: () => number;
  step: (delta: number, count: number) => void;
  animate: () => void;
  setNavRegions: (regions: GalleryNavRegion[]) => void;
  getNavRegions: () => GalleryNavRegion[];
};

// How quickly the strip eases toward the active image when an arrow is pressed.
const SLIDE_LERP = 0.18;
const SLIDE_SNAP = 0.001;

/**
 * Lazily loads and caches gallery images, tracks the active index for the
 * focused item, and stores the world-space hit regions for the prev/next
 * arrows so the input handler can navigate.
 */
export function createGalleryController(p: p5): GalleryController {
  const cache = new Map<string, p5.Image | null>();
  let activeIndex = 0;
  // Animated scroll position of the strip; eases toward activeIndex.
  let displayIndex = 0;
  let focusKey: string | null = null;
  let navRegions: GalleryNavRegion[] = [];

  const getImage = (url: string): p5.Image | null => {
    if (cache.has(url)) {
      return cache.get(url) ?? null;
    }
    cache.set(url, null);
    p.loadImage(
      url,
      (img) => cache.set(url, img),
      () => cache.set(url, null)
    );
    return null;
  };

  return {
    getImage,
    ensureLoaded: (urls) => urls.forEach(getImage),
    syncFocus: (key) => {
      if (key !== focusKey) {
        focusKey = key;
        // Start on the cover, which is the first gallery entry.
        activeIndex = 0;
        displayIndex = 0;
      }
    },
    getActiveIndex: () => activeIndex,
    getDisplayIndex: () => displayIndex,
    step: (delta, count) => {
      if (count > 0) {
        // Slide to the neighbouring image, stopping at the ends.
        activeIndex = Math.max(0, Math.min(count - 1, activeIndex + delta));
      }
    },
    animate: () => {
      displayIndex += (activeIndex - displayIndex) * SLIDE_LERP;
      if (Math.abs(activeIndex - displayIndex) < SLIDE_SNAP) {
        displayIndex = activeIndex;
      }
    },
    setNavRegions: (regions) => {
      navRegions = regions;
    },
    getNavRegions: () => navRegions,
  };
}
