import p5 from 'p5';
import { useEffect, useRef } from 'react';
import type { CollectedEntry } from '../queries/collectedContent';
import {
  formatMainTimelineDate,
  formatMainTimelineNow,
  getMainTimelineImageUrl,
  type MainTimelineItem,
} from '../queries/mainTimeline';

const ITEM_WIDTH = 130;
const ITEM_GAP = 60;
const IMAGE_HEIGHT = 104;
const PADDING_X = 48;
const PADDING_Y = 48;
const DATE_OFFSET = 24;
const DOT_RADIUS = 3;
const DEFAULT_BACKGROUND = '#ffffff';
const DRAG_THRESHOLD = 5;
const TODAY_LINE_RATIO = 0.7;
const TODAY_LABEL_BOTTOM_OFFSET = 24;
const TODAY_LABEL_GAP = 8;
const LANE_GAP = 110;
const MAIN_LINE_Y = PADDING_Y + IMAGE_HEIGHT / 2;
const COLLECTED_LANE_TOP = PADDING_Y + IMAGE_HEIGHT + LANE_GAP;

type TimelineCanvasProps = {
  items: MainTimelineItem[];
  collectedItems?: CollectedEntry[];
  colour?: string | null;
};

type ProcessedCollected = {
  imageUrl: string | null;
  dateLabel: string;
  title: string;
  aspectRatio: number;
  anchorTime: number;
  collectors: CollectedEntry['collectors'];
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

function getEarliestCollectedAt(
  collectors: CollectedEntry['collectors']
): number {
  const times = collectors
    .map((collector) => new Date(collector.collectedAt).getTime())
    .filter((time) => !Number.isNaN(time));
  return times.length > 0 ? Math.min(...times) : Date.now();
}

function buildProcessedCollected(
  entries: CollectedEntry[]
): ProcessedCollected[] {
  return entries
    .map((entry) => ({
      imageUrl: getMainTimelineImageUrl(entry.content),
      dateLabel: formatMainTimelineDate(entry.content.date),
      title: entry.content.title,
      aspectRatio: getItemAspectRatio(entry.content),
      anchorTime: getEarliestCollectedAt(entry.collectors),
      collectors: entry.collectors,
    }))
    .sort((a, b) => a.anchorTime - b.anchorTime);
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

type Bezier = [ConnectorPoint, ConnectorPoint, ConnectorPoint, ConnectorPoint];

function lerpPoint(
  a: ConnectorPoint,
  b: ConnectorPoint,
  t: number
): ConnectorPoint {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function bezierX(curve: Bezier, t: number): number {
  const mt = 1 - t;
  return (
    mt * mt * mt * curve[0].x +
    3 * mt * mt * t * curve[1].x +
    3 * mt * t * t * curve[2].x +
    t * t * t * curve[3].x
  );
}

function findTForX(curve: Bezier, targetX: number): number {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (bezierX(curve, mid) < targetX) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return (lo + hi) / 2;
}

function splitBezier(
  curve: Bezier,
  t: number
): { left: Bezier; right: Bezier } {
  const [p0, p1, p2, p3] = curve;
  const p01 = lerpPoint(p0, p1, t);
  const p12 = lerpPoint(p1, p2, t);
  const p23 = lerpPoint(p2, p3, t);
  const p012 = lerpPoint(p01, p12, t);
  const p123 = lerpPoint(p12, p23, t);
  const p0123 = lerpPoint(p012, p123, t);
  return {
    left: [p0, p01, p012, p0123],
    right: [p0123, p123, p23, p3],
  };
}

function drawBezierSegment(p: p5, curve: Bezier, dashed: boolean): void {
  const ctx = p.drawingContext as CanvasRenderingContext2D;
  p.stroke(17);
  p.strokeWeight(1);
  p.noFill();
  ctx.setLineDash(dashed ? [6, 6] : []);
  p.bezier(
    curve[0].x,
    curve[0].y,
    curve[1].x,
    curve[1].y,
    curve[2].x,
    curve[2].y,
    curve[3].x,
    curve[3].y
  );
  ctx.setLineDash([]);
}

function drawCurvedConnector(
  p: p5,
  from: ConnectorPoint,
  to: ConnectorPoint,
  startFuture: boolean,
  endFuture: boolean,
  lineWorldX: number
): void {
  const dx = to.x - from.x;
  const handle = Math.max(48, Math.abs(dx) * 0.4);
  const curve: Bezier = [
    { x: from.x, y: from.y },
    { x: from.x + handle, y: from.y },
    { x: to.x - handle, y: to.y },
    { x: to.x, y: to.y },
  ];

  const crosses =
    startFuture !== endFuture && lineWorldX > from.x && lineWorldX < to.x;

  if (crosses) {
    const t = findTForX(curve, lineWorldX);
    const { left, right } = splitBezier(curve, t);
    drawBezierSegment(p, left, false);
    drawBezierSegment(p, right, true);
  } else {
    drawBezierSegment(p, curve, startFuture || endFuture);
  }

  p.fill(17);
  p.noStroke();
  p.circle(from.x, from.y, DOT_RADIUS * 2);
  p.circle(to.x, to.y, DOT_RADIUS * 2);
}

function drawBranchConnector(
  p: p5,
  from: ConnectorPoint,
  to: ConnectorPoint,
  colour: string
): void {
  const ctx = p.drawingContext as CanvasRenderingContext2D;
  const handleX = Math.max(32, Math.abs(to.x - from.x) * 0.4);
  const handleY = Math.max(32, Math.abs(to.y - from.y) * 0.4);
  ctx.setLineDash([]);
  p.stroke(colour);
  p.strokeWeight(1);
  p.noFill();
  p.bezier(
    from.x,
    from.y,
    from.x + handleX,
    from.y,
    to.x,
    to.y - handleY,
    to.x,
    to.y
  );

  p.fill(colour);
  p.noStroke();
  p.circle(from.x, from.y, DOT_RADIUS * 2);
  p.circle(to.x, to.y, DOT_RADIUS * 2);
}

function TimelineCanvas({
  items,
  collectedItems = [],
  colour,
}: TimelineCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const p5InstanceRef = useRef<p5 | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return undefined;
    }

    const processed = buildProcessedItems(items);
    const processedCollected = buildProcessedCollected(collectedItems);
    const backgroundColour = colour || DEFAULT_BACKGROUND;
    const itemOffsets: ItemOffset[] = processed.map(() => ({ dx: 0, dy: 0 }));
    const collectedOffsets: ItemOffset[] = processedCollected.map(() => ({
      dx: 0,
      dy: 0,
    }));
    let dragLane: 'main' | 'collected' | null = null;
    let dragIndex = 0;
    let dragPointerOffsetX = 0;
    let dragPointerOffsetY = 0;
    let pressX = 0;
    let pressY = 0;
    let cameraX = 0;
    let cameraY = 0;

    const sketch = (p: p5) => {
      const loadedImages: (p5.Image | null)[] = new Array(
        processed.length
      ).fill(null);
      const loadedCollectedImages: (p5.Image | null)[] = new Array(
        processedCollected.length
      ).fill(null);

      const getAllBounds = () =>
        processed.map((item, index) =>
          getContentBounds(index, item, itemOffsets[index])
        );

      const slotCenterX = (index: number) => getSlotX(index) + ITEM_WIDTH / 2;

      const timeToWorldX = (targetTime: number) => {
        const times = items.map((item) =>
          item.date ? new Date(item.date).getTime() : Number.NaN
        );
        const step = ITEM_WIDTH + ITEM_GAP;

        if (items.length === 0) {
          return 0;
        }

        let firstFuture = -1;
        for (let index = 0; index < times.length; index++) {
          if (!Number.isNaN(times[index]) && times[index] > targetTime) {
            firstFuture = index;
            break;
          }
        }

        if (firstFuture === -1) {
          return slotCenterX(items.length - 1) + step / 2;
        }
        if (firstFuture === 0) {
          return slotCenterX(0) - step / 2;
        }

        const prev = firstFuture - 1;
        const tPrev = times[prev];
        const tNext = times[firstFuture];
        let frac = 0.5;
        if (!Number.isNaN(tPrev) && !Number.isNaN(tNext) && tNext > tPrev) {
          frac = (targetTime - tPrev) / (tNext - tPrev);
        }
        return (
          slotCenterX(prev) +
          frac * (slotCenterX(firstFuture) - slotCenterX(prev))
        );
      };

      const getNowWorldX = () => timeToWorldX(Date.now());

      const getPreviousMainIndex = (targetTime: number): number => {
        if (processed.length === 0) {
          return -1;
        }
        let prevIndex = 0;
        for (let index = 0; index < items.length; index++) {
          const date = items[index].date;
          const time = date ? new Date(date).getTime() : Number.NaN;
          if (!Number.isNaN(time) && time <= targetTime) {
            prevIndex = index;
          }
        }
        return prevIndex;
      };

      const getCollectedBounds = (): ContentBounds[] => {
        const bounds: ContentBounds[] = [];
        let prevRight = -Infinity;

        processedCollected.forEach((item, index) => {
          const { width, height } = getFittedSize(
            item.aspectRatio,
            ITEM_WIDTH,
            IMAGE_HEIGHT
          );
          const anchorX = timeToWorldX(item.anchorTime);
          let baseLeft = anchorX - width / 2;
          if (baseLeft < prevRight + ITEM_GAP) {
            baseLeft = prevRight + ITEM_GAP;
          }
          prevRight = baseLeft + width;

          const baseTop = COLLECTED_LANE_TOP + (IMAGE_HEIGHT - height) / 2;
          const offset = collectedOffsets[index];
          const left = baseLeft + offset.dx;
          const top = baseTop + offset.dy;
          bounds.push({
            left,
            right: left + width,
            centerY: top + height / 2,
            top,
            width,
            height,
            dateBottom: top + height + DATE_OFFSET,
          });
        });

        return bounds;
      };

      const positionCameraToToday = () => {
        cameraX = getNowWorldX() - p.width * TODAY_LINE_RATIO;
        const bounds = getAllBounds();
        if (bounds.length === 0) {
          cameraY = 0;
          return;
        }
        const first = bounds[0];
        const laneCenterY =
          processedCollected.length > 0
            ? (MAIN_LINE_Y + COLLECTED_LANE_TOP + IMAGE_HEIGHT / 2) / 2
            : (first.top + first.dateBottom) / 2;
        cameraY = laneCenterY - p.height / 2;
      };

      const drawTodayLine = () => {
        const lineX = p.width * TODAY_LINE_RATIO;
        const ctx = p.drawingContext as CanvasRenderingContext2D;

        ctx.setLineDash([]);
        p.stroke(210);
        p.strokeWeight(0.75);
        p.line(lineX, 0, lineX, p.height);

        const { date, time } = formatMainTimelineNow();
        const labelY = p.height - TODAY_LABEL_BOTTOM_OFFSET;

        p.noStroke();
        p.fill(17);
        p.textAlign(p.RIGHT, p.BOTTOM);
        p.text(date, lineX - TODAY_LABEL_GAP, labelY);
        p.textAlign(p.LEFT, p.BOTTOM);
        p.text(time, lineX + TODAY_LABEL_GAP, labelY);
      };

      const isFutureDatedItem = (item: MainTimelineItem | undefined) => {
        if (!item?.date) {
          return false;
        }
        const time = new Date(item.date).getTime();
        if (Number.isNaN(time)) {
          return false;
        }
        return time > Date.now();
      };

      p.setup = () => {
        p.createCanvas(window.innerWidth, window.innerHeight);
        p.cursor('crosshair');
        p.textSize(12);
        positionCameraToToday();

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

        processedCollected.forEach((item, index) => {
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
        positionCameraToToday();
      };

      p.draw = () => {
        p.background(backgroundColour);

        p.push();
        p.translate(-cameraX, -cameraY);

        const bounds = getAllBounds();
        const lineWorldX = cameraX + p.width * TODAY_LINE_RATIO;

        for (let index = 0; index < processed.length - 1; index++) {
          drawCurvedConnector(
            p,
            { x: bounds[index].right, y: bounds[index].centerY },
            { x: bounds[index + 1].left, y: bounds[index + 1].centerY },
            isFutureDatedItem(items[index]),
            isFutureDatedItem(items[index + 1]),
            lineWorldX
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

        const collectedBounds = getCollectedBounds();

        processedCollected.forEach((item, index) => {
          const itemBounds = collectedBounds[index];
          const targetX = (itemBounds.left + itemBounds.right) / 2;

          item.collectors.forEach((collector) => {
            const collectedTime = new Date(collector.collectedAt).getTime();
            const anchorTime = Number.isNaN(collectedTime)
              ? item.anchorTime
              : collectedTime;
            const prevIndex = getPreviousMainIndex(anchorTime);
            const fromPoint =
              prevIndex >= 0
                ? {
                    x: bounds[prevIndex].right,
                    y: bounds[prevIndex].centerY,
                  }
                : { x: targetX, y: MAIN_LINE_Y };
            drawBranchConnector(
              p,
              fromPoint,
              { x: targetX, y: itemBounds.top },
              collector.colour
            );
          });
        });

        processedCollected.forEach((item, index) => {
          const { left, top, width, height } = collectedBounds[index];
          const img = loadedCollectedImages[index];

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

        p.pop();

        drawTodayLine();
      };

      p.mousePressed = () => {
        if (
          p.mouseX < 0 ||
          p.mouseX > p.width ||
          p.mouseY < 0 ||
          p.mouseY > p.height
        ) {
          return;
        }
        pressX = p.mouseX;
        pressY = p.mouseY;
        const world = screenToWorld(pressX, pressY, cameraX, cameraY);
        const bounds = getAllBounds();

        for (let index = processed.length - 1; index >= 0; index--) {
          if (!hitTest(bounds[index], world.x, world.y)) {
            continue;
          }

          dragLane = 'main';
          dragIndex = index;
          dragPointerOffsetX = world.x - bounds[index].left;
          dragPointerOffsetY = world.y - bounds[index].top;
          return;
        }

        const collectedBounds = getCollectedBounds();
        for (let index = processedCollected.length - 1; index >= 0; index--) {
          if (!hitTest(collectedBounds[index], world.x, world.y)) {
            continue;
          }

          dragLane = 'collected';
          dragIndex = index;
          dragPointerOffsetX = world.x - collectedBounds[index].left;
          dragPointerOffsetY = world.y - collectedBounds[index].top;
          return;
        }
      };

      p.mouseDragged = () => {
        if (dragLane === null) {
          return;
        }

        if (p.dist(pressX, pressY, p.mouseX, p.mouseY) <= DRAG_THRESHOLD) {
          return;
        }

        const world = screenToWorld(p.mouseX, p.mouseY, cameraX, cameraY);

        if (dragLane === 'collected') {
          const current = getCollectedBounds()[dragIndex];
          const offset = collectedOffsets[dragIndex];
          const defaultLeft = current.left - offset.dx;
          const defaultTop = current.top - offset.dy;

          collectedOffsets[dragIndex] = {
            dx: world.x - dragPointerOffsetX - defaultLeft,
            dy: world.y - dragPointerOffsetY - defaultTop,
          };
          return;
        }

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

        let newLeft = world.x - dragPointerOffsetX;
        const newTop = world.y - dragPointerOffsetY;

        const lineWorldX = cameraX + p.width * TODAY_LINE_RATIO;
        if (isFutureDatedItem(items[dragIndex])) {
          newLeft = Math.max(newLeft, lineWorldX);
        } else {
          newLeft = Math.min(newLeft, lineWorldX - width);
        }

        itemOffsets[dragIndex] = {
          dx: newLeft - defaultLeft,
          dy: newTop - defaultTop,
        };
      };

      p.mouseReleased = () => {
        dragLane = null;
      };
    };

    p5InstanceRef.current = new p5(sketch, container);

    return () => {
      p5InstanceRef.current?.remove();
      p5InstanceRef.current = null;
    };
  }, [items, collectedItems, colour]);

  return <div className="timeline-canvas" ref={containerRef} />;
}

export default TimelineCanvas;
