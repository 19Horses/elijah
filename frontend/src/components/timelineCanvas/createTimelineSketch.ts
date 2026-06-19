import type p5 from 'p5';
import type { TimelineSketchDeps } from './types';
import { createBoundsContext } from './sketch/bounds';
import { createDrawFrameHandler } from './sketch/drawFrame';
import { createInputHandlers } from './sketch/input';
import { createViewContext } from './sketch/view';

export function createTimelineSketch(
  deps: TimelineSketchDeps
): (p: p5) => void {
  return (p: p5) => {
    const boundsCtx = createBoundsContext(deps);
    const view = createViewContext(p, deps, boundsCtx);
    const loadedImages: (p5.Image | null)[] = new Array(
      deps.processed.length
    ).fill(null);
    const loadedCollectedImages: (p5.Image | null)[] = new Array(
      deps.processedCollected.length
    ).fill(null);

    const input = createInputHandlers(p, deps, boundsCtx, view);
    const drawFrame = createDrawFrameHandler(
      p,
      deps,
      boundsCtx,
      view,
      loadedImages,
      loadedCollectedImages
    );

    p.setup = () => {
      p.createCanvas(window.innerWidth, window.innerHeight);
      p.cursor('crosshair');
      p.textSize(12);
      view.fitView();
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
