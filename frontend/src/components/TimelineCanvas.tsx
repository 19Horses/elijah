import p5 from 'p5';
import { useEffect, useRef } from 'react';
import type { CollectedUserRow } from '../queries/collectedContent';
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
const COLLECTED_ROW_HEIGHT = IMAGE_HEIGHT + 56;
const CONNECTOR_HOVER_THRESHOLD = 6;
const MAIN_USERNAME = 'dialE';
const MAIN_GLOW_COLOUR = '#ff0000';

type TimelineCanvasProps = {
  items: MainTimelineItem[];
  collectedRows?: CollectedUserRow[];
  colour?: string | null;
};

type ProcessedCollected = {
  imageUrl: string | null;
  dateLabel: string;
  title: string;
  aspectRatio: number;
  anchorTime: number;
  rowIndex: number;
  colour: string;
  username: string;
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

function buildProcessedCollected(
  rows: CollectedUserRow[]
): ProcessedCollected[] {
  const result: ProcessedCollected[] = [];

  rows.forEach((row, rowIndex) => {
    const items = row.items
      .map((item) => {
        const contentTime = item.content.date
          ? new Date(item.content.date).getTime()
          : Number.NaN;
        return {
          imageUrl: getMainTimelineImageUrl(item.content),
          dateLabel: formatMainTimelineDate(item.content.date),
          title: item.content.title,
          aspectRatio: getItemAspectRatio(item.content),
          anchorTime: Number.isNaN(contentTime) ? Date.now() : contentTime,
          rowIndex,
          colour: row.colour,
          username: row.username,
        };
      })
      .sort((a, b) => a.anchorTime - b.anchorTime);
    result.push(...items);
  });

  return result;
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

function hexToRgba(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  if (value.length !== 6) {
    return hex;
  }
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getContrastText(hex: string): string {
  const value = hex.replace('#', '');
  if (value.length !== 6) {
    return '#ffffff';
  }
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#111827' : '#ffffff';
}

function drawUserLabel(
  p: p5,
  username: string,
  colour: string,
  x: number,
  y: number,
  title?: string
): void {
  p.textSize(12);
  const lineHeight = 16;
  const padX = 8;
  const padY = 4;
  const lines = title
    ? [
        { text: title, bold: true },
        { text: username, bold: false },
      ]
    : [{ text: username, bold: false }];

  let maxWidth = 0;
  lines.forEach((line) => {
    p.textStyle(line.bold ? p.BOLD : p.NORMAL);
    maxWidth = Math.max(maxWidth, p.textWidth(line.text));
  });

  const width = maxWidth + padX * 2;
  const labelHeight = lines.length * lineHeight + padY * 2;
  const left = x - width / 2;
  const top = y - 14 - labelHeight;

  p.noStroke();
  p.fill(colour);
  p.rect(left, top, width, labelHeight, 4);

  p.fill(getContrastText(colour));
  p.textAlign(p.CENTER, p.CENTER);
  lines.forEach((line, index) => {
    p.textStyle(line.bold ? p.BOLD : p.NORMAL);
    p.text(line.text, x, top + padY + lineHeight * index + lineHeight / 2);
  });
  p.textStyle(p.NORMAL);
}

function getBranchCurve(from: ConnectorPoint, to: ConnectorPoint): Bezier {
  const handleX = Math.max(32, Math.abs(to.x - from.x) * 0.4);
  return [
    { x: from.x, y: from.y },
    { x: from.x + handleX, y: from.y },
    { x: to.x - handleX, y: to.y },
    { x: to.x, y: to.y },
  ];
}

function getMainCurve(from: ConnectorPoint, to: ConnectorPoint): Bezier {
  const handle = Math.max(48, Math.abs(to.x - from.x) * 0.4);
  return [
    { x: from.x, y: from.y },
    { x: from.x + handle, y: from.y },
    { x: to.x - handle, y: to.y },
    { x: to.x, y: to.y },
  ];
}

function bezierPointAt(curve: Bezier, t: number): ConnectorPoint {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return {
    x: a * curve[0].x + b * curve[1].x + c * curve[2].x + d * curve[3].x,
    y: a * curve[0].y + b * curve[1].y + c * curve[2].y + d * curve[3].y,
  };
}

function distanceToCurve(curve: Bezier, point: ConnectorPoint): number {
  let min = Infinity;
  const samples = 24;
  for (let i = 0; i <= samples; i++) {
    const pt = bezierPointAt(curve, i / samples);
    const dx = pt.x - point.x;
    const dy = pt.y - point.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance < min) {
      min = distance;
    }
  }
  return min;
}

function drawBranchConnector(
  p: p5,
  from: ConnectorPoint,
  to: ConnectorPoint,
  colour: string
): void {
  const ctx = p.drawingContext as CanvasRenderingContext2D;
  const curve = getBranchCurve(from, to);
  ctx.setLineDash([]);
  p.stroke(colour);
  p.strokeWeight(1);
  p.noFill();
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

  p.fill(colour);
  p.noStroke();
  p.circle(from.x, from.y, DOT_RADIUS * 2);
  p.circle(to.x, to.y, DOT_RADIUS * 2);
}

function TimelineCanvas({
  items,
  collectedRows = [],
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
    const processedCollected = buildProcessedCollected(collectedRows);
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
        let currentRow = -1;

        processedCollected.forEach((item, index) => {
          if (item.rowIndex !== currentRow) {
            currentRow = item.rowIndex;
            prevRight = -Infinity;
          }

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

          const rowTop =
            COLLECTED_LANE_TOP + item.rowIndex * COLLECTED_ROW_HEIGHT;
          const baseTop = rowTop + (IMAGE_HEIGHT - height) / 2;
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
        const rowCount =
          processedCollected.length > 0
            ? Math.max(...processedCollected.map((item) => item.rowIndex)) + 1
            : 0;
        const laneCenterY =
          rowCount > 0
            ? (MAIN_LINE_Y +
                COLLECTED_LANE_TOP +
                (rowCount * COLLECTED_ROW_HEIGHT) / 2) /
              2
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
        const mainCtx = p.drawingContext as CanvasRenderingContext2D;
        const mouseWorld = screenToWorld(p.mouseX, p.mouseY, cameraX, cameraY);

        let hoveredMain = -1;
        for (let index = processed.length - 1; index >= 0; index--) {
          const b = bounds[index];
          if (
            mouseWorld.x >= b.left &&
            mouseWorld.x <= b.right &&
            mouseWorld.y >= b.top &&
            mouseWorld.y <= b.top + b.height
          ) {
            hoveredMain = index;
            break;
          }
        }

        let mainConnectorHover = false;
        if (hoveredMain === -1) {
          for (let index = 0; index < processed.length - 1; index++) {
            const curve = getMainCurve(
              { x: bounds[index].right, y: bounds[index].centerY },
              { x: bounds[index + 1].left, y: bounds[index + 1].centerY }
            );
            if (
              distanceToCurve(curve, mouseWorld) <= CONNECTOR_HOVER_THRESHOLD
            ) {
              mainConnectorHover = true;
              break;
            }
          }
        }

        const mainHighlighted = hoveredMain !== -1 || mainConnectorHover;

        for (let index = 0; index < processed.length - 1; index++) {
          if (mainHighlighted) {
            mainCtx.shadowBlur = 16;
            mainCtx.shadowColor = hexToRgba(MAIN_GLOW_COLOUR, 0.55);
          }
          drawCurvedConnector(
            p,
            { x: bounds[index].right, y: bounds[index].centerY },
            { x: bounds[index + 1].left, y: bounds[index + 1].centerY },
            isFutureDatedItem(items[index]),
            isFutureDatedItem(items[index + 1]),
            lineWorldX
          );
          mainCtx.shadowBlur = 0;
          mainCtx.shadowColor = 'rgba(0, 0, 0, 0)';
        }

        processed.forEach((item, index) => {
          const { left, top, width, height } = bounds[index];
          const img = loadedImages[index];

          if (mainHighlighted) {
            mainCtx.shadowBlur = 22;
            mainCtx.shadowColor = hexToRgba(MAIN_GLOW_COLOUR, 0.45);
          }

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

          mainCtx.shadowBlur = 0;
          mainCtx.shadowColor = 'rgba(0, 0, 0, 0)';

          p.fill(17);
          p.noStroke();
          p.textAlign(p.CENTER, p.TOP);
          p.text(item.dateLabel, left + width / 2, top + height + 12);
        });

        const collectedBounds = getCollectedBounds();
        const collectedCtx = p.drawingContext as CanvasRenderingContext2D;

        let hoveredCollected = -1;
        let hoveredCollectedIsImage = false;
        for (let index = processedCollected.length - 1; index >= 0; index--) {
          const b = collectedBounds[index];
          if (
            mouseWorld.x >= b.left &&
            mouseWorld.x <= b.right &&
            mouseWorld.y >= b.top &&
            mouseWorld.y <= b.top + b.height
          ) {
            hoveredCollected = index;
            hoveredCollectedIsImage = true;
            break;
          }
        }

        if (hoveredCollected === -1) {
          for (let index = processedCollected.length - 1; index >= 0; index--) {
            const item = processedCollected[index];
            const itemBounds = collectedBounds[index];
            const prevIndex = getPreviousMainIndex(item.anchorTime);
            const fromPoint =
              prevIndex >= 0
                ? { x: bounds[prevIndex].right, y: bounds[prevIndex].centerY }
                : { x: itemBounds.left, y: MAIN_LINE_Y };
            const curve = getBranchCurve(fromPoint, {
              x: itemBounds.left,
              y: itemBounds.centerY,
            });
            if (
              distanceToCurve(curve, mouseWorld) <= CONNECTOR_HOVER_THRESHOLD
            ) {
              hoveredCollected = index;
              break;
            }
          }
        }

        const hoveredRow =
          hoveredCollected !== -1
            ? processedCollected[hoveredCollected].rowIndex
            : -1;

        processedCollected.forEach((item, index) => {
          const itemBounds = collectedBounds[index];
          const prevIndex = getPreviousMainIndex(item.anchorTime);
          const fromPoint =
            prevIndex >= 0
              ? {
                  x: bounds[prevIndex].right,
                  y: bounds[prevIndex].centerY,
                }
              : { x: itemBounds.left, y: MAIN_LINE_Y };

          if (item.rowIndex === hoveredRow) {
            collectedCtx.shadowBlur = 16;
            collectedCtx.shadowColor = hexToRgba(item.colour, 0.55);
          }
          drawBranchConnector(
            p,
            fromPoint,
            { x: itemBounds.left, y: itemBounds.centerY },
            item.colour
          );
          collectedCtx.shadowBlur = 0;
          collectedCtx.shadowColor = 'rgba(0, 0, 0, 0)';
        });

        processedCollected.forEach((item, index) => {
          const { left, top, width, height } = collectedBounds[index];
          const img = loadedCollectedImages[index];
          const isHovered = item.rowIndex === hoveredRow;

          if (isHovered) {
            collectedCtx.shadowBlur = 22;
            collectedCtx.shadowColor = hexToRgba(item.colour, 0.45);
          }

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

          collectedCtx.shadowBlur = 0;
          collectedCtx.shadowColor = 'rgba(0, 0, 0, 0)';

          p.fill(17);
          p.noStroke();
          p.textAlign(p.CENTER, p.TOP);
          p.text(item.dateLabel, left + width / 2, top + height + 12);
        });

        p.pop();

        drawTodayLine();

        if (hoveredCollected !== -1) {
          const hovered = processedCollected[hoveredCollected];
          drawUserLabel(
            p,
            hovered.username,
            hovered.colour,
            p.mouseX,
            p.mouseY,
            hoveredCollectedIsImage ? hovered.title : undefined
          );
        } else if (mainHighlighted) {
          drawUserLabel(
            p,
            MAIN_USERNAME,
            MAIN_GLOW_COLOUR,
            p.mouseX,
            p.mouseY,
            hoveredMain !== -1 ? processed[hoveredMain].title : undefined
          );
        }
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
  }, [items, collectedRows, colour]);

  return <div className="timeline-canvas" ref={containerRef} />;
}

export default TimelineCanvas;
