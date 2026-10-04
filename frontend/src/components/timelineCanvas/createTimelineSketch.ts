import type p5 from 'p5';
import blankCdUrl from '../../Blank_cd.png';
import garamondUrl from '../../EBGaramond-Regular.ttf';
import type {
  ProcessedCollected,
  ProcessedCollectionPreview,
  TimelineSketchDeps,
} from './types';
import { createBoundsContext } from './sketch/bounds';
import { createDrawFrameHandler } from './sketch/drawFrame';
import { createGalleryController } from './sketch/galleryController';
import { createInputHandlers } from './sketch/input';
import { createViewContext } from './sketch/view';
export function createTimelineSketch(
  deps: TimelineSketchDeps
): (p: p5) => void {
  return (p: p5) => {
    const boundsCtx = createBoundsContext(deps);
    const view = createViewContext(p, deps, boundsCtx);
    // Cancel button (top bar) → animate back to the default fit view.
    deps.refs.resetViewRef.current = () => view.unfocusItem();
    // User-card click → isolate the viewer's own branch into a straight line.
    deps.refs.isolateOwnBranchRef.current = () =>
      view.toggleOwnBranchIsolation();
    // Mini-player click → jump to (focus) the item that track belongs to.
    deps.refs.focusItemRef.current = (target) => view.focusItem(target);
    deps.refs.focusContentIdRef.current = (contentId) =>
      view.focusContentId(contentId);
    deps.refs.setCollectionViewActiveRef.current = (active) =>
      view.setCollectionViewActive(active);
    const loadedImages: (p5.Image | null)[] = new Array(
      deps.processed.length
    ).fill(null);
    const loadedCollectedImages: (p5.Image | null)[] = new Array(
      deps.processedCollected.length
    ).fill(null);
    const loadedPreviewImages: (p5.Image | null)[] = [];
    const loadPreviewImages = (items: ProcessedCollectionPreview[]) => {
      loadedPreviewImages.length = items.length;
      loadedPreviewImages.fill(null);
      items.forEach((item, index) => {
        if (!item.imageUrl) {
          return;
        }
        p.loadImage(
          item.imageUrl,
          (img) => {
            loadedPreviewImages[index] = img;
          },
          () => {
            loadedPreviewImages[index] = null;
          }
        );
      });
    };
    deps.refs.reloadPreviewRef.current = (items) => {
      deps.processedPreview = items;
      loadPreviewImages(items);
      deps.runtime.previewFadeOutStartMs = null;
      deps.runtime.previewFadeInStartMs = p.millis();
      view.refreshIsolatedFraming();
    };
    deps.refs.beginPreviewFadeOutRef.current = () => {
      deps.runtime.previewFadeOutStartMs = p.millis();
    };
    deps.refs.cancelPreviewCollectRef.current = () => {
      deps.runtime.collectStartMs = null;
      deps.runtime.collectIndex = -1;
      deps.runtime.collectReported = false;
      deps.runtime.collectContentId = null;
      deps.runtime.collectFinalRect = null;
    };
    const loadCollectedImages = (
      items: ProcessedCollected[],
      reuse: Map<string, p5.Image>
    ) => {
      loadedCollectedImages.length = items.length;
      loadedCollectedImages.fill(null);
      items.forEach((item, index) => {
        if (!item.imageUrl) {
          return;
        }
        const cached = reuse.get(item.imageUrl);
        if (cached) {
          loadedCollectedImages[index] = cached;
          return;
        }
        p.loadImage(
          item.imageUrl,
          (img) => {
            if (deps.processedCollected[index] === item) {
              loadedCollectedImages[index] = img;
            }
          },
          () => {
            if (deps.processedCollected[index] === item) {
              loadedCollectedImages[index] = null;
            }
          }
        );
      });
    };
    deps.refs.reloadCollectedRef.current = (items) => {
      const { runtime } = deps;
      const reuse = new Map<string, p5.Image>();
      deps.processedCollected.forEach((item, index) => {
        const img = loadedCollectedImages[index];
        if (item.imageUrl && img) {
          reuse.set(item.imageUrl, img);
        }
      });
      deps.processedPreview.forEach((item, index) => {
        const img = loadedPreviewImages[index];
        if (item.imageUrl && img && !reuse.has(item.imageUrl)) {
          reuse.set(item.imageUrl, img);
        }
      });
      const focusedContentId =
        runtime.focusTarget?.lane === 'collected'
          ? deps.processedCollected[runtime.focusTarget.index]?.contentId
          : undefined;

      deps.processedCollected.splice(
        0,
        deps.processedCollected.length,
        ...items
      );
      deps.collectedOffsets.splice(
        0,
        deps.collectedOffsets.length,
        ...items.map(() => ({ dx: 0, dy: 0 }))
      );
      loadCollectedImages(items, reuse);
      boundsCtx.invalidateCollected();
      runtime.collectedVersion += 1;

      if (focusedContentId !== undefined) {
        const index = items.findIndex(
          (item) => item.contentId === focusedContentId
        );
        if (index === -1) {
          view.unfocusItem();
        } else {
          runtime.focusTarget = { lane: 'collected', index };
        }
      }

      const collectContentId = runtime.collectContentId;
      if (!collectContentId) {
        return;
      }
      const collectedIndex = items.findIndex(
        (item) =>
          item.contentId === collectContentId &&
          item.sources.some(
            (source) => source.username === deps.currentUsername
          )
      );
      if (runtime.collectReturnIndex !== -1) {
        if (collectedIndex === -1) {
          runtime.collectReturnIndex = -1;
          runtime.collectReturnStartMs = null;
          runtime.collectContentId = null;
          runtime.collectFinalRect = null;
          view.animateToFitView();
        } else {
          runtime.collectReturnIndex = collectedIndex;
        }
      } else if (
        runtime.collectReported &&
        runtime.collectFinalRect &&
        collectedIndex !== -1
      ) {
        view.startCollectReturn(collectedIndex, runtime.collectFinalRect);
      }
    };
    const cdImageRef: { current: p5.Image | null } = { current: null };
    const gallery = createGalleryController(p);

    const input = createInputHandlers(p, deps, boundsCtx, view, gallery);
    const drawFrame = createDrawFrameHandler(
      p,
      deps,
      boundsCtx,
      view,
      loadedImages,
      loadedCollectedImages,
      loadedPreviewImages,
      cdImageRef,
      gallery
    );

    p.setup = () => {
      p.createCanvas(window.innerWidth, window.innerHeight);
      p.cursor('crosshair');
      // Serif fallback until the EB Garamond file loads, then swap to it.
      p.textFont('serif');
      p.loadFont(
        garamondUrl,
        (font) => {
          p.textFont(font);
        },
        () => {
          p.textFont('serif');
        }
      );
      p.textSize(12);
      view.playEntranceAnimation();
      deps.runtime.loadStartMs = p.millis();

      p.loadImage(
        blankCdUrl,
        (img) => {
          cdImageRef.current = img;
        },
        () => {
          cdImageRef.current = null;
        }
      );

      deps.processed.forEach((item, index) => {
        if (!item.imageUrl) {
          return;
        }

        p.loadImage(
          item.imageUrl,
          (img) => {
            loadedImages[index] = img;
          },
          () => {
            loadedImages[index] = null;
          }
        );
      });

      loadCollectedImages(deps.processedCollected, new Map());
      loadPreviewImages(deps.processedPreview);
    };

    p.windowResized = () => {
      p.resizeCanvas(window.innerWidth, window.innerHeight);
      if (deps.runtime.focusTarget) {
        view.computeFocusViewTargets(
          view.getFocusBounds(deps.runtime.focusTarget)
        );
        deps.runtime.viewAnimating = true;
      } else {
        view.fitView();
      }
    };

    p.draw = drawFrame;
    p.mousePressed = input.mousePressed;
    p.mouseDragged = input.mouseDragged;
    p.mouseReleased = input.mouseReleased;
    p.mouseWheel = input.mouseWheel;
  };
}
