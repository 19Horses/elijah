import type p5 from 'p5';
import blankCdUrl from '../../Blank_cd.png';
import garamondUrl from '../../EBGaramond-Regular.ttf';
import type { TimelineSketchDeps } from './types';
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
    const loadedImages: (p5.Image | null)[] = new Array(
      deps.processed.length
    ).fill(null);
    const loadedCollectedImages: (p5.Image | null)[] = new Array(
      deps.processedCollected.length
    ).fill(null);
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
      view.fitView();
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

      deps.processedCollected.forEach((item, index) => {
        if (!item.imageUrl) {
          return;
        }

        p.loadImage(
          item.imageUrl,
          (img) => {
            loadedCollectedImages[index] = img;
          },
          () => {
            loadedCollectedImages[index] = null;
          }
        );
      });
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
