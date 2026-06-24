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
  step: (delta: number, count: number) => void;
  setNavRegions: (regions: GalleryNavRegion[]) => void;
  getNavRegions: () => GalleryNavRegion[];
};

/**
 * Lazily loads and caches gallery images, tracks the active index for the
 * focused item, and stores the world-space hit regions for the prev/next
 * arrows so the input handler can navigate.
 */
export function createGalleryController(p: p5): GalleryController {
  const cache = new Map<string, p5.Image | null>();
  let activeIndex = 0;
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
      }
    },
    getActiveIndex: () => activeIndex,
    step: (delta, count) => {
      if (count > 0) {
        activeIndex = (activeIndex + delta + count) % count;
      }
    },
    setNavRegions: (regions) => {
      navRegions = regions;
    },
    getNavRegions: () => navRegions,
  };
}
