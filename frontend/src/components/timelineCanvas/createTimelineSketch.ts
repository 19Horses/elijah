import type p5 from 'p5';
import {
  CANVAS_LABEL_FONT,
  CANVAS_LABEL_FONT_MEDIUM,
  CANVAS_TITLE_FONT,
} from './constants';
import garamondUrl from '../../EBGaramond-Regular.ttf';
import type {
  ContentBounds,
  FocusTarget,
  ProcessedCollected,
  ProcessedCollectionPreview,
  TimelineSketchDeps,
} from './types';
import { createBoundsContext } from './sketch/bounds';
import { beginLayoutChange, snapshotLayout } from './sketch/layoutChange';
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
    // Cancel button (top bar), the e, or opening the drawer → animate back out
    // to the full map.
    deps.refs.resetViewRef.current = () => view.showFullMap();
    deps.refs.soloTimelineRef.current = () => view.soloOwnBranch();
    // User-card click → isolate the viewer's own branch into a straight line.
    deps.refs.isolateOwnBranchRef.current = () =>
      view.toggleOwnBranchIsolation();
    // Mini-player click → jump to (focus) the item that track belongs to.
    deps.refs.focusItemRef.current = (target) => view.focusItem(target);
    deps.refs.focusContentIdRef.current = (contentId) =>
      view.focusContentId(contentId);
    deps.refs.setCollectionViewActiveRef.current = (active) =>
      view.setCollectionViewActive(active);
    deps.refs.collectFocusedPreviewRef.current = (contentId) =>
      view.collectFocusedPreviewContentId(contentId);
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
    // An open item stays put through a layout change (someone collecting,
    // its own collect landing): rather than ease across to its new place —
    // flying off from under its details — it moves there at once, and the
    // view moves with it, so nothing shifts on screen.
    // (`measure` must be how `before` was taken.)
    const holdItemInPlace = (
      target: FocusTarget | null,
      before: ContentBounds | null,
      measure: (target: FocusTarget) => ContentBounds = view.getFocusBounds
    ) => {
      const { runtime } = deps;
      if (!before || !target || target.lane === 'preview') {
        return;
      }
      const shift = runtime.layoutChange.shift;
      if (target.lane === 'collected') {
        if (shift?.collected[target.index]) {
          shift.collected[target.index] = { dx: 0, dy: 0 };
        }
        const offset = deps.collectedOffsets[target.index];
        if (offset) {
          offset.dx = 0;
          offset.dy = 0;
        }
      } else {
        if (shift?.main[target.index]) {
          shift.main[target.index] = { dx: 0, dy: 0 };
        }
        const offset = deps.itemOffsets[target.index];
        if (offset) {
          offset.dx = 0;
          offset.dy = 0;
        }
      }
      const after = measure(target);
      const dx = after.left - before.left;
      const dy = after.centerY - before.centerY;
      if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) {
        return;
      }
      runtime.cameraX += dx;
      runtime.cameraY += dy;
      runtime.targetCameraX += dx;
      runtime.targetCameraY += dy;
      runtime.animationWorldX += dx;
      runtime.animationWorldY += dy;
      runtime.animationStartCameraX += dx;
      runtime.animationStartCameraY += dy;
      runtime.panTargetCameraX += dx;
      runtime.panTargetCameraY += dy;
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
      // Once the map has come in, ease it from where everything is now.
      const before = runtime.entranceComplete
        ? snapshotLayout(deps, boundsCtx)
        : null;
      const focusedContentId =
        runtime.focusTarget?.lane === 'collected'
          ? deps.processedCollected[runtime.focusTarget.index]?.contentId
          : undefined;
      // Where an open item sits now, to keep it there on screen however the
      // new layout moves it.
      const focusedBefore =
        runtime.focusTarget && runtime.focusTarget.lane !== 'preview'
          ? view.getFocusBounds(runtime.focusTarget)
          : null;
      // Likewise the viewer's just-collected item while it waits, landed, to
      // open: the camera's been set to hold it where it came to rest.
      const returningBefore =
        runtime.collectReturnIndex !== -1 && runtime.focusTarget === null
          ? boundsCtx.getCollectedBounds()[runtime.collectReturnIndex] ?? null
          : null;

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
      if (before) {
        beginLayoutChange(deps, boundsCtx, before, p.millis());
      }

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
      holdItemInPlace(runtime.focusTarget, focusedBefore);

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
          holdItemInPlace(
            { lane: 'collected', index: collectedIndex },
            returningBefore,
            (target) => boundsCtx.getCollectedBounds()[target.index]
          );
        }
      } else if (runtime.collectReported && runtime.collectFinalRect) {
        if (
          collectedIndex !== -1 &&
          view.startCollectReturn(collectedIndex, runtime.collectFinalRect)
        ) {
          return;
        }
        // It hasn't landed as a tile on the viewer's timeline (something on
        // the main timeline never gets one): rather than hold the item
        // mid-air, back out to the map and open it where it does sit.
        runtime.collectStartMs = null;
        runtime.collectIndex = -1;
        runtime.collectReported = false;
        runtime.collectContentId = null;
        runtime.collectFinalRect = null;
        view.showFullMap();
        const mainIndex = deps.items.findIndex(
          (item) => item._id === collectContentId
        );
        if (mainIndex !== -1) {
          view.focusItem({ lane: 'main', index: mainIndex });
        }
      }
    };
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
      // Canvas labels use Akzidenz (see CANVAS_LABEL_FONT), and item titles EB
      // Garamond; canvas text alone doesn't make the browser fetch a web font,
      // so ask for them up front.
      [CANVAS_LABEL_FONT, CANVAS_LABEL_FONT_MEDIUM, CANVAS_TITLE_FONT].forEach(
        (font) => {
          void document.fonts.load(`16px ${font}`).catch(() => undefined);
        }
      );
      view.playEntranceAnimation();
      deps.runtime.loadStartMs = p.millis();

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
