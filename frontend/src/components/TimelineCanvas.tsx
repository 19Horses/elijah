import p5 from 'p5';
import { useEffect, useRef } from 'react';
import {
  formatMainTimelineDate,
  getMainTimelineImageUrl,
  type MainTimelineItem,
} from '../queries/mainTimeline';

const ITEM_WIDTH = 200;
const ITEM_GAP = 80;
const IMAGE_HEIGHT = 160;
const PADDING_X = 48;
const PADDING_Y = 48;
const DATE_OFFSET = 28;
const DOT_RADIUS = 4;
const DEFAULT_BACKGROUND = '#ffffff';
const SPLASH_DURATION_MS = 700;
const SPLASH_MAX_RADIUS = 24;
const DRAG_THRESHOLD = 5;
const PAN_LERP = 0.12;

type Splash = {
  worldX: number;
  worldY: number;
  startMs: number;
};

type TimelineCanvasProps = {
  items: MainTimelineItem[];
  colour?: string | null;
};

type ProcessedItem = {
  imageUrl: string | null;
  dateLabel: string;
  title: string;
  aspectRatio: number;
};

type ItemOffset = {
  dx: number;
  dy: number;
};

type ContentBounds = {
  left: number;
  right: number;
  centerY: number;
  top: number;
  width: number;
  height: number;
  dateBottom: number;
};

type ConnectorPoint = {
  x: number;
  y: number;
};

function getItemAspectRatio(item: MainTimelineItem): number {
  if ('imageDimensions' in item && item.imageDimensions?.aspectRatio) {
    return item.imageDimensions.aspectRatio;
  }
  return ITEM_WIDTH / IMAGE_HEIGHT;
}

function getFittedSize(
  aspectRatio: number,
  maxWidth: number,
  maxHeight: number
): { width: number; height: number } {
  if (aspectRatio >= maxWidth / maxHeight) {
    return { width: maxWidth, height: maxWidth / aspectRatio };
  }
  return { width: maxHeight * aspectRatio, height: maxHeight };
}

function getSlotX(index: number): number {
  return PADDING_X + index * (ITEM_WIDTH + ITEM_GAP);
}

function buildProcessedItems(items: MainTimelineItem[]): ProcessedItem[] {
  return items.map((item) => ({
    imageUrl: getMainTimelineImageUrl(item),
    dateLabel: formatMainTimelineDate(item.date),
    title: item.title,
    aspectRatio: getItemAspectRatio(item),
  }));
}

function getContentBounds(
  index: number,
  item: ProcessedItem,
  offset: ItemOffset
): ContentBounds {
  const slotX = getSlotX(index);
  const { width, height } = getFittedSize(
    item.aspectRatio,
    ITEM_WIDTH,
    IMAGE_HEIGHT
  );
  const offsetXInSlot = (ITEM_WIDTH - width) / 2;
  const offsetYInSlot = (IMAGE_HEIGHT - height) / 2;
  const left = slotX + offsetXInSlot + offset.dx;
  const top = PADDING_Y + offsetYInSlot + offset.dy;

  return {
    left,
    right: left + width,
    centerY: top + height / 2,
    top,
    width,
    height,
    dateBottom: top + height + DATE_OFFSET,
  };
}

function hitTest(bounds: ContentBounds, x: number, y: number): boolean {
  return (
    x >= bounds.left &&
    x <= bounds.right &&
    y >= bounds.top &&
    y <= bounds.dateBottom
  );
}

function screenToWorld(
  x: number,
  y: number,
  cameraX: number,
  cameraY: number
): { x: number; y: number } {
  return { x: x + cameraX, y: y + cameraY };
}

function drawSplashes(p: p5, splashes: Splash[]): void {
  const now = p.millis();

  for (let index = splashes.length - 1; index >= 0; index--) {
    const splash = splashes[index];
    const progress = (now - splash.startMs) / SPLASH_DURATION_MS;

    if (progress >= 1) {
      splashes.splice(index, 1);
      continue;
    }

    const radius = SPLASH_MAX_RADIUS * progress;
    const alpha = 255 * (1 - progress);

    p.noFill();
    p.stroke(17, alpha);
    p.strokeWeight(1.5);
    p.circle(splash.worldX, splash.worldY, radius * 2);
  }
}

function drawCurvedConnector(
  p: p5,
  from: ConnectorPoint,
  to: ConnectorPoint
): void {
  const dx = to.x - from.x;
  const handle = Math.max(48, Math.abs(dx) * 0.4);

  p.stroke(17);
  p.strokeWeight(1);
  p.noFill();
  p.bezier(from.x, from.y, from.x + handle, from.y, to.x - handle, to.y, to.x, to.y);

  p.fill(17);
  p.noStroke();
  p.circle(from.x, from.y, DOT_RADIUS * 2);
  p.circle(to.x, to.y, DOT_RADIUS * 2);
}

function TimelineCanvas({ items, colour }: TimelineCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const p5InstanceRef = useRef<p5 | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return undefined;
    }

    const processed = buildProcessedItems(items);
    const backgroundColour = colour || DEFAULT_BACKGROUND;
    const itemOffsets: ItemOffset[] = processed.map(() => ({ dx: 0, dy: 0 }));
    let dragIndex: number | null = null;
    let dragPointerOffsetX = 0;
    let dragPointerOffsetY = 0;
    let pressX = 0;
    let pressY = 0;
    let pressWorldX = 0;
    let pressWorldY = 0;
    let didDrag = false;
    const splashes: Splash[] = [];
    let cameraX = 0;
    let cameraY = 0;
    let targetCameraX = 0;
    let targetCameraY = 0;

    const sketch = (p: p5) => {
      const loadedImages: (p5.Image | null)[] = new Array(processed.length).fill(
        null
      );

      const getAllBounds = () =>
        processed.map((item, index) =>
          getContentBounds(index, item, itemOffsets[index])
        );

      const panToWorldPoint = (worldX: number, worldY: number) => {
        targetCameraX = worldX - p.width / 2;
        targetCameraY = worldY - p.height / 2;
      };

      p.setup = () => {
        p.createCanvas(window.innerWidth, window.innerHeight);
        p.cursor('crosshair');
        p.textSize(12);

        const initialBounds = getAllBounds();
        if (initialBounds.length > 0) {
          const first = initialBounds[0];
          const last = initialBounds[initialBounds.length - 1];
          const contentCenterX = (first.left + last.right) / 2;
          const contentCenterY = (first.top + first.dateBottom) / 2;
          cameraX = contentCenterX - p.width / 2;
          cameraY = contentCenterY - p.height / 2;
          targetCameraX = cameraX;
          targetCameraY = cameraY;
        }

        processed.forEach((item, index) => {
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
      };

      p.windowResized = () => {
        p.resizeCanvas(window.innerWidth, window.innerHeight);
      };

      p.draw = () => {
        cameraX = p.lerp(cameraX, targetCameraX, PAN_LERP);
        cameraY = p.lerp(cameraY, targetCameraY, PAN_LERP);

        p.background(backgroundColour);

        p.push();
        p.translate(-cameraX, -cameraY);

        const bounds = getAllBounds();

        for (let index = 0; index < processed.length - 1; index++) {
          drawCurvedConnector(
            p,
            { x: bounds[index].right, y: bounds[index].centerY },
            { x: bounds[index + 1].left, y: bounds[index + 1].centerY }
          );
        }

        processed.forEach((item, index) => {
          const { left, top, width, height } = bounds[index];
          const img = loadedImages[index];

          if (img) {
            p.image(img, left, top, width, height);
          } else {
            p.fill(245);
            p.stroke(220);
            p.rect(left, top, width, height);

            if (!item.imageUrl) {
              p.fill(120);
              p.noStroke();
              p.textAlign(p.CENTER, p.CENTER);
              p.text(item.title, left + width / 2, top + height / 2);
            }
          }

          p.fill(17);
          p.noStroke();
          p.textAlign(p.CENTER, p.TOP);
          p.text(item.dateLabel, left + width / 2, top + height + 12);
        });

        drawSplashes(p, splashes);

        p.pop();
      };

      p.mousePressed = () => {
        pressX = p.mouseX;
        pressY = p.mouseY;
        const world = screenToWorld(pressX, pressY, cameraX, cameraY);
        pressWorldX = world.x;
        pressWorldY = world.y;
        didDrag = false;
        const bounds = getAllBounds();

        for (let index = processed.length - 1; index >= 0; index--) {
          if (!hitTest(bounds[index], world.x, world.y)) {
            continue;
          }

          dragIndex = index;
          dragPointerOffsetX = world.x - bounds[index].left;
          dragPointerOffsetY = world.y - bounds[index].top;
          return;
        }
      };

      p.mouseDragged = () => {
        if (p.dist(pressX, pressY, p.mouseX, p.mouseY) > DRAG_THRESHOLD) {
          didDrag = true;
        }

        if (dragIndex === null) {
          return;
        }

        const world = screenToWorld(p.mouseX, p.mouseY, cameraX, cameraY);
        const item = processed[dragIndex];
        const slotX = getSlotX(dragIndex);
        const { width, height } = getFittedSize(
          item.aspectRatio,
          ITEM_WIDTH,
          IMAGE_HEIGHT
        );
        const offsetXInSlot = (ITEM_WIDTH - width) / 2;
        const offsetYInSlot = (IMAGE_HEIGHT - height) / 2;
        const defaultLeft = slotX + offsetXInSlot;
        const defaultTop = PADDING_Y + offsetYInSlot;

        itemOffsets[dragIndex] = {
          dx: world.x - dragPointerOffsetX - defaultLeft,
          dy: world.y - dragPointerOffsetY - defaultTop,
        };
      };

      p.mouseReleased = () => {
        if (!didDrag) {
          splashes.push({
            worldX: pressWorldX,
            worldY: pressWorldY,
            startMs: p.millis(),
          });
          panToWorldPoint(pressWorldX, pressWorldY);
        }

        dragIndex = null;
      };
    };

    p5InstanceRef.current = new p5(sketch, container);

    return () => {
      p5InstanceRef.current?.remove();
      p5InstanceRef.current = null;
    };
  }, [items, colour]);

  return <div className="timeline-canvas" ref={containerRef} />;
}

export default TimelineCanvas;
