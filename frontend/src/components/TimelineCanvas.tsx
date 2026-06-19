import p5 from 'p5';
import { memo, useEffect, useRef, type RefObject } from 'react';
import { getContentTypeColour } from '../constants/contentTypes';
import type { CollectedUserRow } from '../queries/collectedContent';
import {
  formatMainTimelineDate,
  formatMainTimelineNow,
  getMainTimelineImageUrl,
  type MainTimelineItem,
} from '../queries/mainTimeline';
import type { ContentType } from '../types/content';

const ITEM_WIDTH = 180;
const ITEM_GAP = 140;
const IMAGE_HEIGHT = 144;
const PADDING_X = 48;
const PADDING_Y = 48;
const DATE_OFFSET = 24;
const DOT_RADIUS = 3;
const DEFAULT_BACKGROUND = '#ffffff';
const DRAG_THRESHOLD = 5;
const FIT_VIEW_PADDING = 80;
const FIT_ZOOM_SCALAR = 0.85;
const TODAY_LABEL_BOTTOM_OFFSET = 24;
const TODAY_LABEL_GAP = 8;
const LANE_GAP = 50;
const MAIN_LINE_Y = PADDING_Y + IMAGE_HEIGHT / 2;
const COLLECTED_LANE_TOP = PADDING_Y + IMAGE_HEIGHT + LANE_GAP;
const COLLECTED_ROW_HEIGHT = IMAGE_HEIGHT + 30;
const CONNECTOR_HOVER_THRESHOLD = 6;
const MAIN_USERNAME = 'dialE';
const MAIN_GLOW_COLOUR = '#ff0000';
const TYPE_DIM_ALPHA = 0.4;
const TYPE_DIM_OVERLAY = 0.3;
const TYPE_HIGHLIGHT_BLUR = 22;
const FOCUS_VIEWPORT_FILL = 0.65;
const VIEW_ANIMATION_LERP = 0.08;
const VIEW_UNFOCUS_ANIMATION_LERP = 0.15;
const VIEW_SNAP_THRESHOLD = 0.001;
const WHEEL_ZOOM_SENSITIVITY = 0.001;
const MIN_ZOOM_FACTOR = 0.25;
const MAX_ZOOM_FACTOR = 4;
const MAX_VISIBLE_COLLECTOR_LABELS = 3;
const OTHERS_LABEL_BG = '#9ca3af';
const HIGHLIGHT_FADE_OUT_LERP = 0.08;
const HIGHLIGHT_FADE_SNAP = 0.01;
const LOAD_INITIAL_DELAY_MS = 120;
const LOAD_IMAGE_STAGGER_MS = 80;
const LOAD_IMAGE_FADE_MS = 450;
const LOAD_CONNECTOR_DELAY_MS = 180;
const LOAD_CONNECTOR_STAGGER_MS = 45;
const LOAD_CONNECTOR_FADE_MS = 400;
const LOAD_ALPHA_SNAP = 0.01;

type TimelineCanvasProps = {
  items: MainTimelineItem[];
  collectedRows?: CollectedUserRow[];
  colour?: string | null;
  highlightedType?: ContentType | null;
  onFocusFadeChange?: (fade: number) => void;
};

type CollectedSource = {
  rowIndex: number;
  colour: string;
  username: string;
};

type ProcessedCollected = {
  contentId: string;
  slug: string | null;
  imageUrl: string | null;
  dateLabel: string;
  contentType: ContentType;
  title: string;
  bodyContent: string | null;
  aspectRatio: number;
  anchorTime: number;
  rowIndex: number;
  sources: CollectedSource[];
};

type ProcessedItem = {
  imageUrl: string | null;
  slug: string | null;
  dateLabel: string;
  contentType: ContentType;
  title: string;
  bodyContent: string | null;
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

type FocusTarget = {
  lane: 'main' | 'collected';
  index: number;
};

export type { FocusTarget };

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
    slug: item.slug ?? null,
    dateLabel: formatMainTimelineDate(item.date),
    contentType: item._type,
    title: item.title,
    bodyContent: item._type === 'newsletter' ? item.content ?? null : null,
    aspectRatio: getItemAspectRatio(item),
  }));
}

export function buildProcessedCollected(
  rows: CollectedUserRow[]
): ProcessedCollected[] {
  const byContentId = new Map<string, ProcessedCollected>();

  rows.forEach((row, rowIndex) => {
    row.items.forEach((item) => {
      const contentId = item.content._id;
      const contentTime = item.content.date
        ? new Date(item.content.date).getTime()
        : Number.NaN;
      const source: CollectedSource = {
        rowIndex,
        colour: row.colour,
        username: row.username,
      };
      const existing = byContentId.get(contentId);

      if (existing) {
        existing.sources.push(source);
        existing.rowIndex = Math.min(existing.rowIndex, rowIndex);
        return;
      }

      byContentId.set(contentId, {
        contentId,
        slug: item.content.slug ?? null,
        imageUrl: getMainTimelineImageUrl(item.content),
        dateLabel: formatMainTimelineDate(item.content.date),
        contentType: item.content._type,
        title: item.content.title,
        bodyContent:
          item.content._type === 'newsletter'
            ? item.content.content ?? null
            : null,
        aspectRatio: getItemAspectRatio(item.content),
        anchorTime: Number.isNaN(contentTime) ? Date.now() : contentTime,
        rowIndex,
        sources: [source],
      });
    });
  });

  return Array.from(byContentId.values()).sort((a, b) => {
    if (a.rowIndex !== b.rowIndex) {
      return a.rowIndex - b.rowIndex;
    }
    return a.anchorTime - b.anchorTime;
  });
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
  cameraY: number,
  zoom: number
): { x: number; y: number } {
  return { x: x / zoom + cameraX, y: y / zoom + cameraY };
}

function lerpPoint(
  a: ConnectorPoint,
  b: ConnectorPoint,
  t: number
): ConnectorPoint {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

const MAIN_CONNECTOR_HORIZONTAL_STUB = 16;

function getMainConnectorPoints(
  from: ConnectorPoint,
  to: ConnectorPoint
): ConnectorPoint[] {
  // Horizontal stub out of the item's side, a fixed 45° diagonal across,
  // then into the next item — rigid elbows like branch connectors.
  const dirX = Math.sign(to.x - from.x) || 1;
  const dirY = Math.sign(to.y - from.y) || 1;
  const adx = Math.abs(to.x - from.x);
  const ady = Math.abs(to.y - from.y);
  const diag = Math.max(0, Math.min(adx - MAIN_CONNECTOR_HORIZONTAL_STUB, ady));
  const hStub = adx - diag;
  const elbowX = from.x + dirX * hStub;
  return [
    { x: from.x, y: from.y },
    { x: elbowX, y: from.y },
    { x: elbowX + dirX * diag, y: from.y + dirY * diag },
    { x: to.x, y: to.y },
  ];
}

function splitPolylineAtX(
  points: ConnectorPoint[],
  targetX: number
): { left: ConnectorPoint[]; right: ConnectorPoint[] } {
  for (let index = 0; index < points.length - 1; index++) {
    const a = points[index];
    const b = points[index + 1];
    if (a.x === b.x) {
      continue;
    }
    const minX = Math.min(a.x, b.x);
    const maxX = Math.max(a.x, b.x);
    if (targetX < minX || targetX > maxX) {
      continue;
    }
    const t = (targetX - a.x) / (b.x - a.x);
    if (t < 0 || t > 1) {
      continue;
    }
    const splitPoint = lerpPoint(a, b, t);
    return {
      left: [...points.slice(0, index + 1), splitPoint],
      right: [splitPoint, ...points.slice(index + 1)],
    };
  }
  return { left: points, right: [points[points.length - 1]] };
}

function drawPolylineSegment(
  p: p5,
  points: ConnectorPoint[],
  dashed: boolean
): void {
  const ctx = p.drawingContext as CanvasRenderingContext2D;
  p.stroke(17);
  p.strokeWeight(1);
  p.noFill();
  ctx.setLineDash(dashed ? [6, 6] : []);
  p.beginShape();
  points.forEach((point) => p.vertex(point.x, point.y));
  p.endShape();
  ctx.setLineDash([]);
}

function drawMainConnector(
  p: p5,
  from: ConnectorPoint,
  to: ConnectorPoint,
  startFuture: boolean,
  endFuture: boolean,
  lineWorldX: number
): void {
  const points = getMainConnectorPoints(from, to);
  const crosses =
    startFuture !== endFuture && lineWorldX > from.x && lineWorldX < to.x;

  if (crosses) {
    const { left, right } = splitPolylineAtX(points, lineWorldX);
    drawPolylineSegment(p, left, false);
    drawPolylineSegment(p, right, true);
  } else {
    drawPolylineSegment(p, points, startFuture || endFuture);
  }
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

function matchesHighlightedType(
  contentType: ContentType,
  highlightedType: ContentType | null | undefined
): boolean {
  return Boolean(highlightedType && contentType === highlightedType);
}

function resetCanvasEffects(ctx: CanvasRenderingContext2D): void {
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'rgba(0, 0, 0, 0)';
}

function getTypeDimAlpha(strength: number): number {
  return 1 - strength * (1 - TYPE_DIM_ALPHA);
}

function getStaggeredLoadAlpha(
  elapsedMs: number,
  index: number,
  fadeMs: number,
  staggerMs: number,
  baseDelayMs = LOAD_INITIAL_DELAY_MS
): number {
  const start = baseDelayMs + index * staggerMs;
  if (elapsedMs <= start) {
    return 0;
  }
  const t = Math.min(1, (elapsedMs - start) / fadeMs);
  return 1 - (1 - t) ** 3;
}

function getCombinedAlpha(loadAlpha: number, effectAlpha = 1): number {
  return loadAlpha * effectAlpha;
}

function drawDimOverlay(
  p: p5,
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  width: number,
  height: number,
  strength = 1
): void {
  p.fill(255);
  p.noStroke();
  ctx.globalAlpha = TYPE_DIM_OVERLAY * strength;
  p.rect(left, top, width, height);
  resetCanvasEffects(ctx);
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

type LabelChip = {
  text: string;
  bg: string;
};

function drawCollectedSourcesLabel(
  p: p5,
  sources: CollectedSource[],
  x: number,
  y: number,
  title?: string
): void {
  if (sources.length === 1) {
    drawUserLabel(p, sources[0].username, sources[0].colour, x, y, title);
    return;
  }

  p.textSize(12);
  const padX = 8;
  const padY = 4;
  const lineHeight = 16;
  const chipGap = 4;
  const titleGap = title ? 4 : 0;

  const visibleSources = sources.slice(0, MAX_VISIBLE_COLLECTOR_LABELS);
  const overflow = sources.length - MAX_VISIBLE_COLLECTOR_LABELS;
  const chips: LabelChip[] = visibleSources.map((source) => ({
    text: source.username,
    bg: source.colour,
  }));

  if (overflow > 0) {
    chips.push({
      text: `+ ${overflow} other${overflow === 1 ? '' : 's'}`,
      bg: OTHERS_LABEL_BG,
    });
  }

  p.textStyle(p.NORMAL);
  const chipWidths = chips.map((chip) => p.textWidth(chip.text) + padX * 2);
  const chipsWidth =
    chipWidths.reduce((sum, width) => sum + width, 0) +
    chipGap * Math.max(chips.length - 1, 0);

  let titleWidth = 0;
  let titleHeight = 0;
  if (title) {
    p.textStyle(p.BOLD);
    titleWidth = p.textWidth(title) + padX * 2;
    titleHeight = lineHeight + padY * 2;
  }

  const totalWidth = Math.max(chipsWidth, titleWidth);
  const chipsRowHeight = lineHeight + padY * 2;
  const totalHeight = titleHeight + titleGap + chipsRowHeight;
  const left = x - totalWidth / 2;
  const top = y - 14 - totalHeight;

  if (title) {
    p.noStroke();
    p.fill(17);
    p.rect(left, top, totalWidth, titleHeight, 4, 4, 0, 0);
    p.fill(255);
    p.textAlign(p.CENTER, p.CENTER);
    p.textStyle(p.BOLD);
    p.text(title, x, top + titleHeight / 2);
  }

  const chipsTop = top + titleHeight + titleGap;
  let chipLeft = x - chipsWidth / 2;

  chips.forEach((chip, index) => {
    const width = chipWidths[index];
    p.noStroke();
    p.fill(chip.bg);
    p.rect(chipLeft, chipsTop, width, chipsRowHeight, 4);
    p.fill(getContrastText(chip.bg));
    p.textAlign(p.CENTER, p.CENTER);
    p.textStyle(p.NORMAL);
    p.text(chip.text, chipLeft + width / 2, chipsTop + chipsRowHeight / 2);
    chipLeft += width + chipGap;
  });

  p.textStyle(p.NORMAL);
}

type BranchLine = [
  ConnectorPoint,
  ConnectorPoint,
  ConnectorPoint,
  ConnectorPoint
];

const BRANCH_HORIZONTAL_STUB = 16;

function getBranchPoints(from: ConnectorPoint, to: ConnectorPoint): BranchLine {
  // Vertical stub out of the main item's bottom, a fixed 45° diagonal across,
  // then a horizontal stub into the branched item's side.
  const dirX = Math.sign(to.x - from.x) || 1;
  const dirY = Math.sign(to.y - from.y) || 1;
  const adx = Math.abs(to.x - from.x);
  const ady = Math.abs(to.y - from.y);
  // 45° diagonal spans equal horizontal and vertical distance; whatever is left
  // over becomes the straight vertical (top) and horizontal (bottom) stubs.
  const diag = Math.max(0, Math.min(adx - BRANCH_HORIZONTAL_STUB, ady));
  const vStub = ady - diag;
  const elbowY = from.y + dirY * vStub;
  return [
    { x: from.x, y: from.y },
    { x: from.x, y: elbowY },
    { x: from.x + dirX * diag, y: elbowY + dirY * diag },
    { x: to.x, y: to.y },
  ];
}

function distanceToSegment(
  point: ConnectorPoint,
  a: ConnectorPoint,
  b: ConnectorPoint
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) {
    return Math.hypot(point.x - a.x, point.y - a.y);
  }
  let t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}

function distanceToPolyline(
  points: ConnectorPoint[],
  point: ConnectorPoint
): number {
  let min = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    min = Math.min(min, distanceToSegment(point, points[i], points[i + 1]));
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
  const points = getBranchPoints(from, to);
  ctx.setLineDash([]);
  p.stroke(colour);
  p.strokeWeight(1);
  p.noFill();
  p.beginShape();
  points.forEach((point) => p.vertex(point.x, point.y));
  p.endShape();
}

function drawDot(p: p5, x: number, y: number, colour: string): void {
  const ctx = p.drawingContext as CanvasRenderingContext2D;
  p.noStroke();
  p.fill(colour);
  p.circle(x, y, DOT_RADIUS * 2);

  // White centre — drawn without the surrounding glow.
  const prevBlur = ctx.shadowBlur;
  ctx.shadowBlur = 0;
  p.fill(255);
  p.circle(x, y, DOT_RADIUS);
  ctx.shadowBlur = prevBlur;
}

const P5CanvasHost = memo(function P5CanvasHost({
  containerRef,
}: {
  containerRef: RefObject<HTMLDivElement>;
}) {
  return <div className="timeline-canvas" ref={containerRef} />;
});

function TimelineCanvas({
  items,
  collectedRows = [],
  colour,
  highlightedType = null,
  onFocusFadeChange,
}: TimelineCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const p5InstanceRef = useRef<p5 | null>(null);
  const highlightedTypeRef = useRef<ContentType | null>(highlightedType);
  const onFocusFadeChangeRef = useRef(onFocusFadeChange);

  useEffect(() => {
    highlightedTypeRef.current = highlightedType ?? null;
  }, [highlightedType]);

  useEffect(() => {
    onFocusFadeChangeRef.current = onFocusFadeChange;
  }, [onFocusFadeChange]);

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
    let dragLane: 'main' | 'collected' | 'canvas' | 'focus' | null = null;
    let dragIndex = 0;
    let dragPointerOffsetX = 0;
    let dragPointerOffsetY = 0;
    let pressX = 0;
    let pressY = 0;
    let cameraX = 0;
    let cameraY = 0;
    let zoom = 1;
    let targetCameraX = 0;
    let targetCameraY = 0;
    let targetZoom = 1;
    let focusTarget: FocusTarget | null = null;
    let viewAnimating = false;
    let viewUnfocusing = false;
    let fitZoomLevel = 1;
    let animationWorldX = 0;
    let animationWorldY = 0;
    let animationStartScreenX = 0;
    let animationStartScreenY = 0;
    let animationStartZoom = 1;
    let activeHighlightType: ContentType | null = null;
    let highlightStrength = 0;
    let loadStartMs = 0;
    let focusContentFade = 0;

    const notifyFocusFade = () => {
      onFocusFadeChangeRef.current?.(focusContentFade);
    };

    const updateHighlightFade = () => {
      const targetType = highlightedTypeRef.current;
      if (targetType) {
        activeHighlightType = targetType;
        highlightStrength = 1;
        return;
      }

      if (highlightStrength <= HIGHLIGHT_FADE_SNAP) {
        highlightStrength = 0;
        activeHighlightType = null;
        return;
      }

      highlightStrength += (0 - highlightStrength) * HIGHLIGHT_FADE_OUT_LERP;
    };

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
        const bounds = getAllBounds();
        const gapStart = bounds[prev].right;
        const gapEnd = bounds[firstFuture].left;
        return gapStart + frac * (gapEnd - gapStart);
      };

      const getNowWorldX = () => timeToWorldX(Date.now());

      const getPreviousMainIndex = (targetTime: number): number => {
        if (processed.length === 0) {
          return -1;
        }
        let prevIndex = -1;
        for (let index = 0; index < items.length; index++) {
          const date = items[index].date;
          const time = date ? new Date(date).getTime() : Number.NaN;
          if (!Number.isNaN(time) && time <= targetTime) {
            prevIndex = index;
          }
        }
        return prevIndex;
      };

      const getBranchEndpoints = (
        anchorTime: number,
        itemBounds: ContentBounds,
        mainBounds: ContentBounds[]
      ): { from: ConnectorPoint; to: ConnectorPoint } => {
        if (mainBounds.length === 0) {
          return {
            from: { x: itemBounds.left, y: MAIN_LINE_Y },
            to: { x: itemBounds.left, y: itemBounds.centerY },
          };
        }
        // Drop from the bottom edge of the nearest main item (the previous one,
        // or the first item if the branch predates the whole timeline), and meet
        // the branched item on whichever side faces that main item.
        const prevIndex = getPreviousMainIndex(anchorTime);
        const main = mainBounds[prevIndex >= 0 ? prevIndex : 0];
        const fromX = (main.left + main.right) / 2;
        const itemCenterX = (itemBounds.left + itemBounds.right) / 2;
        const to =
          fromX <= itemCenterX
            ? { x: itemBounds.left, y: itemBounds.centerY }
            : { x: itemBounds.right, y: itemBounds.centerY };
        return {
          from: { x: fromX, y: main.top + main.height },
          to,
        };
      };

      const getBranchEndpointsForSource = (
        anchorTime: number,
        itemBounds: ContentBounds,
        mainBounds: ContentBounds[],
        sourceIndex: number,
        sourceCount: number
      ): { from: ConnectorPoint; to: ConnectorPoint } => {
        const endpoints = getBranchEndpoints(
          anchorTime,
          itemBounds,
          mainBounds
        );

        if (sourceCount <= 1) {
          return endpoints;
        }

        const spread = Math.min(itemBounds.width * 0.25, 10);
        const offset = (sourceIndex - (sourceCount - 1) / 2) * spread;

        return {
          from: { x: endpoints.from.x + offset, y: endpoints.from.y },
          to: { x: endpoints.to.x, y: endpoints.to.y + offset * 0.5 },
        };
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

      const setCameraFromScreenAnchor = (
        worldX: number,
        worldY: number,
        screenX: number,
        screenY: number,
        nextZoom: number
      ) => {
        cameraX = worldX - screenX / nextZoom;
        cameraY = worldY - screenY / nextZoom;
        zoom = nextZoom;
      };

      const getAnimationProgress = (nextZoom: number): number => {
        const zoomRange = targetZoom - animationStartZoom;
        if (Math.abs(zoomRange) <= VIEW_SNAP_THRESHOLD) {
          return 1;
        }
        return Math.max(
          0,
          Math.min(1, (nextZoom - animationStartZoom) / zoomRange)
        );
      };

      const beginViewAnimation = (worldX: number, worldY: number) => {
        animationWorldX = worldX;
        animationWorldY = worldY;
        animationStartScreenX = (worldX - cameraX) * zoom;
        animationStartScreenY = (worldY - cameraY) * zoom;
        animationStartZoom = zoom;
      };

      const computeFitViewTargets = () => {
        // Fit the full content bounds (main + collected lanes) in the viewport
        // with padding, then scale down slightly so more context is visible.
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        [...getAllBounds(), ...getCollectedBounds()].forEach((b) => {
          minX = Math.min(minX, b.left);
          maxX = Math.max(maxX, b.right);
          minY = Math.min(minY, b.top);
          maxY = Math.max(maxY, b.dateBottom);
        });

        if (Number.isFinite(minX) && maxX > minX && maxY > minY) {
          const paddedWidth = maxX - minX + FIT_VIEW_PADDING * 2;
          const paddedHeight = maxY - minY + FIT_VIEW_PADDING * 2;
          const zoomX = p.width / paddedWidth;
          const zoomY = p.height / paddedHeight;
          targetZoom = Math.min(zoomX, zoomY) * FIT_ZOOM_SCALAR;
          const centerX = (minX + maxX) / 2;
          const centerY = (minY + maxY) / 2;
          targetCameraX = centerX - p.width / (2 * targetZoom);
          targetCameraY = centerY - p.height / (2 * targetZoom);
        } else {
          targetZoom = 1;
          targetCameraX = 0;
          targetCameraY = MAIN_LINE_Y - p.height / (2 * targetZoom);
        }
        fitZoomLevel = targetZoom;
      };

      const computeFocusViewTargets = (bounds: ContentBounds) => {
        const zoomW = (p.width * FOCUS_VIEWPORT_FILL) / bounds.width;
        const zoomH = (p.height * FOCUS_VIEWPORT_FILL) / bounds.height;
        targetZoom = Math.min(zoomW, zoomH);
        const centerX = (bounds.left + bounds.right) / 2;
        const centerY = bounds.top + bounds.height / 2;
        targetCameraX = centerX - p.width / (2 * targetZoom);
        targetCameraY = centerY - p.height / (2 * targetZoom);
      };

      const getFocusBounds = (target: FocusTarget): ContentBounds => {
        if (target.lane === 'main') {
          return getAllBounds()[target.index];
        }
        return getCollectedBounds()[target.index];
      };

      const applyViewTargets = () => {
        cameraX = targetCameraX;
        cameraY = targetCameraY;
        zoom = targetZoom;
      };

      const syncViewTargets = () => {
        targetCameraX = cameraX;
        targetCameraY = cameraY;
        targetZoom = zoom;
        viewAnimating = false;
      };

      const panView = (deltaScreenX: number, deltaScreenY: number) => {
        cameraX -= deltaScreenX / zoom;
        cameraY -= deltaScreenY / zoom;
        syncViewTargets();
      };

      const zoomViewAt = (screenX: number, screenY: number, delta: number) => {
        const worldX = screenX / zoom + cameraX;
        const worldY = screenY / zoom + cameraY;
        const minZoom = fitZoomLevel * MIN_ZOOM_FACTOR;
        const maxZoom = fitZoomLevel * MAX_ZOOM_FACTOR;
        const zoomFactor = Math.exp(-delta * WHEEL_ZOOM_SENSITIVITY);
        const newZoom = Math.max(minZoom, Math.min(maxZoom, zoom * zoomFactor));

        cameraX = worldX - screenX / newZoom;
        cameraY = worldY - screenY / newZoom;
        zoom = newZoom;
        focusTarget = null;
        syncViewTargets();
      };

      const fitView = () => {
        focusTarget = null;
        computeFitViewTargets();
        applyViewTargets();
        viewAnimating = false;
        viewUnfocusing = false;
      };

      const animateView = () => {
        if (!viewAnimating) {
          if (focusTarget && !viewUnfocusing) {
            focusContentFade = 1;
          } else if (!focusTarget && !viewUnfocusing) {
            focusContentFade = 0;
          }
          return;
        }

        const lerpFactor = viewUnfocusing
          ? VIEW_UNFOCUS_ANIMATION_LERP
          : VIEW_ANIMATION_LERP;
        const lerp = (current: number, target: number) =>
          current + (target - current) * lerpFactor;

        if (Math.abs(zoom - targetZoom) > VIEW_SNAP_THRESHOLD) {
          const nextZoom = lerp(zoom, targetZoom);
          const progress = getAnimationProgress(nextZoom);
          const screenX =
            animationStartScreenX +
            (p.width / 2 - animationStartScreenX) * progress;
          const screenY =
            animationStartScreenY +
            (p.height / 2 - animationStartScreenY) * progress;
          setCameraFromScreenAnchor(
            animationWorldX,
            animationWorldY,
            screenX,
            screenY,
            nextZoom
          );
          if (focusTarget && !viewUnfocusing) {
            focusContentFade = progress;
          } else if (viewUnfocusing) {
            focusContentFade = 1 - progress;
          }
          notifyFocusFade();
        } else {
          applyViewTargets();
          const wasUnfocusing = viewUnfocusing;
          viewAnimating = false;
          viewUnfocusing = false;
          if (focusTarget && !wasUnfocusing) {
            focusContentFade = 1;
          } else if (wasUnfocusing) {
            focusContentFade = 0;
          }
          notifyFocusFade();
        }
      };

      const findClickedItem = (
        worldX: number,
        worldY: number
      ): FocusTarget | null => {
        const bounds = getAllBounds();
        for (let index = processed.length - 1; index >= 0; index--) {
          if (hitTest(bounds[index], worldX, worldY)) {
            return { lane: 'main', index };
          }
        }

        const collectedBounds = getCollectedBounds();
        for (let index = processedCollected.length - 1; index >= 0; index--) {
          if (hitTest(collectedBounds[index], worldX, worldY)) {
            return { lane: 'collected', index };
          }
        }

        return null;
      };

      const focusItem = (target: FocusTarget) => {
        focusContentFade = 0;
        notifyFocusFade();
        focusTarget = target;
        viewUnfocusing = false;
        const bounds = getFocusBounds(target);
        computeFocusViewTargets(bounds);
        beginViewAnimation(
          (bounds.left + bounds.right) / 2,
          bounds.top + bounds.height / 2
        );
        viewAnimating = true;
      };

      const isViewInteractionLocked = () =>
        focusTarget !== null || viewUnfocusing;

      const unfocusItem = () => {
        focusTarget = null;
        computeFitViewTargets();
        viewUnfocusing = true;
        beginViewAnimation(
          targetCameraX + p.width / (2 * targetZoom),
          targetCameraY + p.height / (2 * targetZoom)
        );
        viewAnimating = true;
      };

      const drawTodayLine = (alpha = 1) => {
        if (alpha <= LOAD_ALPHA_SNAP) {
          return;
        }

        const lineX = (getNowWorldX() - cameraX) * zoom;
        const ctx = p.drawingContext as CanvasRenderingContext2D;

        ctx.globalAlpha = alpha;
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
        resetCanvasEffects(ctx);
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
        fitView();
        loadStartMs = p.millis();

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
        if (focusTarget) {
          computeFocusViewTargets(getFocusBounds(focusTarget));
          viewAnimating = true;
        } else {
          fitView();
        }
      };

      p.draw = () => {
        animateView();
        updateHighlightFade();

        const highlightedType = activeHighlightType;
        const typeHighlightStrength = highlightStrength;
        const isTypeHighlightActive =
          typeHighlightStrength > HIGHLIGHT_FADE_SNAP &&
          highlightedType !== null;
        const dimAlpha = getTypeDimAlpha(typeHighlightStrength);
        const elapsed = p.millis() - loadStartMs;
        const totalImages = processed.length + processedCollected.length;
        const connectorBaseStart =
          LOAD_INITIAL_DELAY_MS +
          Math.max(0, totalImages - 1) * LOAD_IMAGE_STAGGER_MS +
          LOAD_CONNECTOR_DELAY_MS;
        const collectedConnectorBaseStart =
          connectorBaseStart +
          Math.max(0, processed.length - 1) * LOAD_CONNECTOR_STAGGER_MS;
        const getImageLoadAlpha = (imageIndex: number) =>
          getStaggeredLoadAlpha(
            elapsed,
            imageIndex,
            LOAD_IMAGE_FADE_MS,
            LOAD_IMAGE_STAGGER_MS
          );
        const getMainConnectorLoadAlpha = (connectorIndex: number) =>
          getStaggeredLoadAlpha(
            elapsed,
            connectorIndex,
            LOAD_CONNECTOR_FADE_MS,
            LOAD_CONNECTOR_STAGGER_MS,
            connectorBaseStart
          );
        const getCollectedConnectorLoadAlpha = (connectorIndex: number) =>
          getStaggeredLoadAlpha(
            elapsed,
            connectorIndex,
            LOAD_CONNECTOR_FADE_MS,
            LOAD_CONNECTOR_STAGGER_MS,
            collectedConnectorBaseStart
          );
        const todayLineAlpha = getStaggeredLoadAlpha(
          elapsed,
          0,
          LOAD_CONNECTOR_FADE_MS,
          0,
          connectorBaseStart
        );
        const isFocusedTarget = (lane: 'main' | 'collected', index: number) =>
          focusTarget?.lane === lane && focusTarget.index === index;
        const otherContentAlpha = 1 - focusContentFade;
        const contentAlphaFor = (
          lane: 'main' | 'collected',
          index: number,
          base = 1
        ) => {
          if (
            focusContentFade <= LOAD_ALPHA_SNAP ||
            isFocusedTarget(lane, index)
          ) {
            return base;
          }
          return base * otherContentAlpha;
        };
        p.background(backgroundColour);

        p.push();
        p.scale(zoom);
        p.translate(-cameraX, -cameraY);

        const bounds = getAllBounds();
        const lineWorldX = getNowWorldX();
        const mainCtx = p.drawingContext as CanvasRenderingContext2D;
        const mouseWorld = screenToWorld(
          p.mouseX,
          p.mouseY,
          cameraX,
          cameraY,
          zoom
        );

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
            const line = getMainConnectorPoints(
              { x: bounds[index].right, y: bounds[index].centerY },
              { x: bounds[index + 1].left, y: bounds[index + 1].centerY }
            );
            if (
              distanceToPolyline(line, mouseWorld) <= CONNECTOR_HOVER_THRESHOLD
            ) {
              mainConnectorHover = true;
              break;
            }
          }
        }

        const mainHighlighted = hoveredMain !== -1 || mainConnectorHover;

        for (let index = 0; index < processed.length - 1; index++) {
          const connectorLoadAlpha =
            getMainConnectorLoadAlpha(index) * otherContentAlpha;
          if (connectorLoadAlpha <= LOAD_ALPHA_SNAP) {
            continue;
          }

          const connectorDimmed = isTypeHighlightActive;

          if (mainHighlighted) {
            mainCtx.shadowBlur = 16;
            mainCtx.shadowColor = hexToRgba(
              MAIN_GLOW_COLOUR,
              0.55 * connectorLoadAlpha
            );
          }

          if (connectorDimmed) {
            mainCtx.globalAlpha = getCombinedAlpha(
              connectorLoadAlpha,
              dimAlpha
            );
          } else {
            mainCtx.globalAlpha = connectorLoadAlpha;
          }

          drawMainConnector(
            p,
            { x: bounds[index].right, y: bounds[index].centerY },
            { x: bounds[index + 1].left, y: bounds[index + 1].centerY },
            isFutureDatedItem(items[index]),
            isFutureDatedItem(items[index + 1]),
            lineWorldX
          );
          resetCanvasEffects(mainCtx);
        }

        processed.forEach((item, index) => {
          const imageLoadAlpha = getImageLoadAlpha(index);
          const visibilityAlpha = contentAlphaFor(
            'main',
            index,
            imageLoadAlpha
          );
          if (visibilityAlpha <= LOAD_ALPHA_SNAP) {
            return;
          }

          let { left, top, width, height } = bounds[index];
          const img = loadedImages[index];
          const typeMatch = matchesHighlightedType(
            item.contentType,
            highlightedType
          );

          if (mainHighlighted) {
            mainCtx.shadowBlur = 22;
            mainCtx.shadowColor = hexToRgba(
              MAIN_GLOW_COLOUR,
              0.45 * visibilityAlpha
            );
          } else if (typeMatch && isTypeHighlightActive) {
            mainCtx.shadowBlur = TYPE_HIGHLIGHT_BLUR * typeHighlightStrength;
            mainCtx.shadowColor = hexToRgba(
              getContentTypeColour(item.contentType),
              0.55 * typeHighlightStrength * visibilityAlpha
            );
          }

          if (isTypeHighlightActive && !typeMatch) {
            mainCtx.globalAlpha = getCombinedAlpha(visibilityAlpha, dimAlpha);
          } else {
            mainCtx.globalAlpha = visibilityAlpha;
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

          resetCanvasEffects(mainCtx);

          if (isTypeHighlightActive && !typeMatch) {
            drawDimOverlay(
              p,
              mainCtx,
              left,
              top,
              width,
              height,
              typeHighlightStrength * visibilityAlpha
            );
          }

          p.fill(17);
          p.noStroke();
          p.textAlign(p.CENTER, p.TOP);
          if (isTypeHighlightActive && !typeMatch) {
            mainCtx.globalAlpha = getCombinedAlpha(visibilityAlpha, dimAlpha);
          } else {
            mainCtx.globalAlpha = visibilityAlpha;
          }
          p.text(item.dateLabel, left + width / 2, top + height + 12);
          resetCanvasEffects(mainCtx);
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
            for (
              let sourceIndex = 0;
              sourceIndex < item.sources.length;
              sourceIndex++
            ) {
              const { from: fromPoint, to: toPoint } =
                getBranchEndpointsForSource(
                  item.anchorTime,
                  itemBounds,
                  bounds,
                  sourceIndex,
                  item.sources.length
                );
              const line = getBranchPoints(fromPoint, toPoint);
              if (
                distanceToPolyline(line, mouseWorld) <=
                CONNECTOR_HOVER_THRESHOLD
              ) {
                hoveredCollected = index;
                break;
              }
            }
            if (hoveredCollected !== -1) {
              break;
            }
          }
        }

        processedCollected.forEach((item, index) => {
          const itemBounds = collectedBounds[index];
          const isHovered = hoveredCollected === index;
          const connectorLoadAlpha =
            getCollectedConnectorLoadAlpha(index) * otherContentAlpha;

          if (connectorLoadAlpha <= LOAD_ALPHA_SNAP) {
            return;
          }

          item.sources.forEach((source, sourceIndex) => {
            const { from: fromPoint, to: toPoint } =
              getBranchEndpointsForSource(
                item.anchorTime,
                itemBounds,
                bounds,
                sourceIndex,
                item.sources.length
              );

            if (isHovered) {
              collectedCtx.shadowBlur = 16;
              collectedCtx.shadowColor = hexToRgba(
                source.colour,
                0.55 * connectorLoadAlpha
              );
            }

            if (isTypeHighlightActive) {
              collectedCtx.globalAlpha = getCombinedAlpha(
                connectorLoadAlpha,
                dimAlpha
              );
            } else {
              collectedCtx.globalAlpha = connectorLoadAlpha;
            }

            drawBranchConnector(p, fromPoint, toPoint, source.colour);
            resetCanvasEffects(collectedCtx);
          });
        });

        processedCollected.forEach((item, index) => {
          const imageLoadAlpha = getImageLoadAlpha(processed.length + index);
          const visibilityAlpha = contentAlphaFor(
            'collected',
            index,
            imageLoadAlpha
          );
          if (visibilityAlpha <= LOAD_ALPHA_SNAP) {
            return;
          }

          let { left, top, width, height } = collectedBounds[index];
          const img = loadedCollectedImages[index];
          const isHovered = hoveredCollected === index;
          const typeMatch = matchesHighlightedType(
            item.contentType,
            highlightedType
          );

          if (isHovered) {
            collectedCtx.shadowBlur = 22;
            collectedCtx.shadowColor = hexToRgba(
              item.sources[0].colour,
              0.45 * visibilityAlpha
            );
          } else if (typeMatch && isTypeHighlightActive) {
            collectedCtx.shadowBlur =
              TYPE_HIGHLIGHT_BLUR * typeHighlightStrength;
            collectedCtx.shadowColor = hexToRgba(
              getContentTypeColour(item.contentType),
              0.55 * typeHighlightStrength * visibilityAlpha
            );
          }

          if (isTypeHighlightActive && !typeMatch) {
            collectedCtx.globalAlpha = getCombinedAlpha(
              visibilityAlpha,
              dimAlpha
            );
          } else {
            collectedCtx.globalAlpha = visibilityAlpha;
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

          resetCanvasEffects(collectedCtx);

          if (isTypeHighlightActive && !typeMatch) {
            drawDimOverlay(
              p,
              collectedCtx,
              left,
              top,
              width,
              height,
              typeHighlightStrength * visibilityAlpha
            );
          }

          p.fill(17);
          p.noStroke();
          p.textAlign(p.CENTER, p.TOP);
          if (isTypeHighlightActive && !typeMatch) {
            collectedCtx.globalAlpha = getCombinedAlpha(
              visibilityAlpha,
              dimAlpha
            );
          } else {
            collectedCtx.globalAlpha = visibilityAlpha;
          }
          p.text(item.dateLabel, left + width / 2, top + height + 12);
          resetCanvasEffects(collectedCtx);
        });

        // Connector dots, drawn on top of every image so they stay visible.
        for (let index = 0; index < processed.length - 1; index++) {
          const connectorLoadAlpha =
            getMainConnectorLoadAlpha(index) * otherContentAlpha;
          if (connectorLoadAlpha <= LOAD_ALPHA_SNAP) {
            continue;
          }

          if (mainHighlighted) {
            mainCtx.shadowBlur = 16;
            mainCtx.shadowColor = hexToRgba(
              MAIN_GLOW_COLOUR,
              0.55 * connectorLoadAlpha
            );
          }
          if (isTypeHighlightActive) {
            mainCtx.globalAlpha = getCombinedAlpha(
              connectorLoadAlpha,
              dimAlpha
            );
          } else {
            mainCtx.globalAlpha = connectorLoadAlpha;
          }
          drawDot(p, bounds[index].right, bounds[index].centerY, '#111111');
          drawDot(
            p,
            bounds[index + 1].left,
            bounds[index + 1].centerY,
            '#111111'
          );
          resetCanvasEffects(mainCtx);
        }

        processedCollected.forEach((item, index) => {
          const itemBounds = collectedBounds[index];
          const isHovered = hoveredCollected === index;
          const connectorLoadAlpha =
            getCollectedConnectorLoadAlpha(index) * otherContentAlpha;

          if (connectorLoadAlpha <= LOAD_ALPHA_SNAP) {
            return;
          }

          item.sources.forEach((source, sourceIndex) => {
            const { from: fromPoint, to: toPoint } =
              getBranchEndpointsForSource(
                item.anchorTime,
                itemBounds,
                bounds,
                sourceIndex,
                item.sources.length
              );
            if (isHovered) {
              collectedCtx.shadowBlur = 16;
              collectedCtx.shadowColor = hexToRgba(
                source.colour,
                0.55 * connectorLoadAlpha
              );
            }
            if (isTypeHighlightActive) {
              collectedCtx.globalAlpha = getCombinedAlpha(
                connectorLoadAlpha,
                dimAlpha
              );
            } else {
              collectedCtx.globalAlpha = connectorLoadAlpha;
            }
            drawDot(p, fromPoint.x, fromPoint.y, source.colour);
            drawDot(p, toPoint.x, toPoint.y, source.colour);
            resetCanvasEffects(collectedCtx);
          });
        });

        p.pop();

        drawTodayLine(todayLineAlpha * otherContentAlpha);

        if (focusContentFade <= LOAD_ALPHA_SNAP && hoveredCollected !== -1) {
          const hovered = processedCollected[hoveredCollected];
          drawCollectedSourcesLabel(
            p,
            hovered.sources,
            p.mouseX,
            p.mouseY,
            hoveredCollectedIsImage ? hovered.title : undefined
          );
        } else if (focusContentFade <= LOAD_ALPHA_SNAP && mainHighlighted) {
          drawUserLabel(
            p,
            MAIN_USERNAME,
            MAIN_GLOW_COLOUR,
            p.mouseX,
            p.mouseY,
            hoveredMain !== -1 ? processed[hoveredMain].title : undefined
          );
        }

        const hoveringContent = hoveredMain !== -1 || hoveredCollectedIsImage;
        if (isViewInteractionLocked()) {
          p.cursor(hoveringContent ? 'pointer' : 'default');
        } else if (dragLane === 'canvas') {
          p.cursor('grabbing');
        } else if (hoveringContent) {
          p.cursor('pointer');
        } else {
          p.cursor('grab');
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

        if (isViewInteractionLocked()) {
          dragLane = 'focus';
          return;
        }

        const world = screenToWorld(pressX, pressY, cameraX, cameraY, zoom);
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

        dragLane = 'canvas';
      };

      p.mouseDragged = () => {
        if (dragLane === null || isViewInteractionLocked()) {
          return;
        }

        if (p.dist(pressX, pressY, p.mouseX, p.mouseY) <= DRAG_THRESHOLD) {
          return;
        }

        if (dragLane === 'canvas') {
          panView(p.mouseX - p.pmouseX, p.mouseY - p.pmouseY);
          return;
        }

        const world = screenToWorld(p.mouseX, p.mouseY, cameraX, cameraY, zoom);

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

        const lineWorldX = getNowWorldX();
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
        if (p.dist(pressX, pressY, p.mouseX, p.mouseY) <= DRAG_THRESHOLD) {
          const world = screenToWorld(pressX, pressY, cameraX, cameraY, zoom);
          const clicked = findClickedItem(world.x, world.y);

          if (clicked) {
            const isSameFocus =
              focusTarget?.lane === clicked.lane &&
              focusTarget.index === clicked.index;
            if (isSameFocus) {
              unfocusItem();
            } else {
              focusItem(clicked);
            }
          } else if (focusTarget) {
            unfocusItem();
          }
        }

        dragLane = null;
      };

      p.mouseWheel = (event?: WheelEvent) => {
        if (isViewInteractionLocked()) {
          return false;
        }
        if (event) {
          const delta =
            event.deltaY ?? (event as WheelEvent & { delta: number }).delta;
          zoomViewAt(p.mouseX, p.mouseY, delta);
        }
        return false;
      };
    };

    p5InstanceRef.current = new p5(sketch, container);

    return () => {
      onFocusFadeChangeRef.current?.(0);
      p5InstanceRef.current?.remove();
      p5InstanceRef.current = null;
    };
  }, [items, collectedRows, colour]);

  return (
    <div className="timeline-canvas-wrap">
      <P5CanvasHost containerRef={containerRef} />
    </div>
  );
}

export default memo(TimelineCanvas);
