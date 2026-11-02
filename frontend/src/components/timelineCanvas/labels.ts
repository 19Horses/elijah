import type p5 from 'p5';
import {
  CANVAS_LABEL_FONT,
  OTHERS_LABEL_ALPHA,
  LINE_TAG_DETAIL_ALPHA,
  LINE_TAG_RADIUS_PX,
  KIND_TAG_BACKGROUND,
  KIND_TAG_FONT_PX,
  KIND_TAG_INSET_PX,
  KIND_TAG_PAD_X_PX,
  KIND_TAG_PAD_Y_PX,
  CANVAS_TITLE_FONT,
} from './constants';
import type { ConnectorPoint, NodeHoverRegion } from './types';

// Gap kept between a label and the edge of the canvas.
const LABEL_EDGE_MARGIN = 6;

export type LabelRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

// Whether the segment a-b passes through `rect` (Liang–Barsky clipping).
function segmentHitsRect(
  a: ConnectorPoint,
  b: ConnectorPoint,
  rect: LabelRect
): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
  const edges: [number, number][] = [
    [-dx, a.x - rect.left],
    [dx, rect.right - a.x],
    [-dy, a.y - rect.top],
    [dy, rect.bottom - a.y],
  ];
  for (const [pEdge, qEdge] of edges) {
    if (pEdge === 0) {
      if (qEdge < 0) {
        return false;
      }
      continue;
    }
    const t = qEdge / pEdge;
    if (pEdge < 0) {
      t0 = Math.max(t0, t);
    } else {
      t1 = Math.min(t1, t);
    }
    if (t0 > t1) {
      return false;
    }
  }
  return true;
}

// How many lines and items a label placed at `rect` would sit on top of.
export function countLabelClashes(
  rect: LabelRect,
  lines: ConnectorPoint[][],
  items: LabelRect[]
): number {
  const lineClashes = lines.filter((points) =>
    points.some(
      (point, i) => i > 0 && segmentHitsRect(points[i - 1], point, rect)
    )
  ).length;
  const itemClashes = items.filter(
    (item) =>
      item.left < rect.right &&
      item.right > rect.left &&
      item.top < rect.bottom &&
      item.bottom > rect.top
  ).length;
  return lineClashes + itemClashes;
}

// Who collected an item, for the line under its label: the most recent
// collector, in their timeline's colour, and how many others.
export type CollectedBy = { name: string; colour: string; others: number };

// That line as runs of text; a run with a colour is drawn in it at full
// strength, and an `alpha` run at that opacity.
export function collectedByParts(
  collectedBy: CollectedBy
): { text: string; colour?: string; alpha?: number }[] {
  const { name, colour, others } = collectedBy;
  return [
    { text: 'Owned by ' },
    { text: name, colour },
    ...(others > 0
      ? [
          {
            text: ` and ${others} other${others === 1 ? '' : 's'}`,
            alpha: OTHERS_LABEL_ALPHA,
          },
        ]
      : []),
  ];
}

// Splits `text` into lines no wider than `maxWidth` at the current text style
// (a single word longer than that gets a line to itself).
export function wrapText(p: p5, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  text.split(/\s+/).forEach((word) => {
    const candidate = line ? `${line} ${word}` : word;
    if (line && p.textWidth(candidate) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  });
  if (line) {
    lines.push(line);
  }
  return lines;
}

const NODE_CARD_MAX_TEXT_WIDTH = 220;
const NODE_CARD_PAD_X = 12;
const NODE_CARD_PAD_Y = 8;
const NODE_CARD_RADIUS = 6;
const NODE_CARD_TITLE_SIZE = 15;
const NODE_CARD_TITLE_LEADING = 18;
const NODE_CARD_SUBTITLE_SIZE = 12;
const NODE_CARD_SUBTITLE_LEADING = 16;

// A hovered node opens into a card in its line's colour: the linked item's
// title over who collected it. A node out at a viewport edge anchors the card
// there, so it opens inward from that edge over the node (centred on it along
// the edge); any other node gets the card above it. `artwork`, when loaded,
// is the linked item's image, shown beside the text. `x`/`y` are the node's
// screen position, `nodeRadius` its on-screen radius, and `grow` (0-1) eases
// the card open from the node. Returns the card's full (unscaled) size.
function drawNodeCardText(
  p: p5,
  node: Pick<
    NodeHoverRegion,
    'title' | 'timeline' | 'colour' | 'side' | 'others'
  >,
  x: number,
  y: number,
  nodeRadius: number,
  grow: number,
  artwork?: p5.Image | null
): { width: number; height: number } {
  p.textSize(NODE_CARD_TITLE_SIZE);
  const titleLines = wrapText(p, node.title, NODE_CARD_MAX_TEXT_WIDTH);
  const titleWidth = Math.max(...titleLines.map((line) => p.textWidth(line)));
  const others = node.others ?? 0;
  const subtitle = `Owned by ${node.timeline.toUpperCase()}${
    others > 0 ? ` and ${others} other${others === 1 ? '' : 's'}` : ''
  }`;
  p.textStyle(p.NORMAL);
  p.textSize(NODE_CARD_SUBTITLE_SIZE);
  const subtitleWidth = p.textWidth(subtitle);

  const textHeight =
    titleLines.length * NODE_CARD_TITLE_LEADING + NODE_CARD_SUBTITLE_LEADING;
  // The linked item's artwork sits left of the text, as tall as it, fitted
  // (not stretched) into a box between portrait and landscape proportions.
  const thumb =
    artwork && artwork.width > 0 && artwork.height > 0
      ? {
          height: textHeight,
          width:
            textHeight *
            Math.min(1.6, Math.max(0.6, artwork.width / artwork.height)),
        }
      : null;
  const textLeft = thumb ? thumb.width + NODE_CARD_PAD_X : 0;
  const width =
    textLeft + Math.max(titleWidth, subtitleWidth) + NODE_CARD_PAD_X * 2;
  const height = textHeight + NODE_CARD_PAD_Y * 2;
  if (grow <= 0) {
    return { width, height };
  }

  // The card's anchor (the point on it that sits on the node), as a fraction
  // of its width and height.
  const anchor =
    node.side === 'left'
      ? { u: 0, v: 0.5, x: x - nodeRadius, y }
      : node.side === 'right'
      ? { u: 1, v: 0.5, x: x + nodeRadius, y }
      : node.side === 'top'
      ? { u: 0.5, v: 0, x, y: y - nodeRadius }
      : node.side === 'bottom'
      ? { u: 0.5, v: 1, x, y: y + nodeRadius }
      : { u: 0.5, v: 1, x, y: y - nodeRadius - 6 };
  const left = Math.max(
    LABEL_EDGE_MARGIN,
    Math.min(anchor.x - anchor.u * width, p.width - width - LABEL_EDGE_MARGIN)
  );
  const top = Math.max(
    LABEL_EDGE_MARGIN,
    Math.min(
      anchor.y - anchor.v * height,
      p.height - height - LABEL_EDGE_MARGIN
    )
  );
  const originX = left + anchor.u * width;
  const originY = top + anchor.v * height;

  p.push();
  p.translate(originX, originY);
  p.scale(grow);
  p.translate(-originX, -originY);
  p.noStroke();
  p.fill(node.colour);
  p.rect(left, top, width, height, NODE_CARD_RADIUS);

  if (artwork && thumb) {
    const scale = Math.min(
      thumb.width / artwork.width,
      thumb.height / artwork.height
    );
    const drawWidth = artwork.width * scale;
    const drawHeight = artwork.height * scale;
    p.image(
      artwork,
      left + NODE_CARD_PAD_X + (thumb.width - drawWidth) / 2,
      top + NODE_CARD_PAD_Y + (thumb.height - drawHeight) / 2,
      drawWidth,
      drawHeight
    );
  }

  p.fill(255);
  p.textAlign(p.LEFT, p.TOP);
  p.textSize(NODE_CARD_TITLE_SIZE);
  p.textLeading(NODE_CARD_TITLE_LEADING);
  titleLines.forEach((line, index) => {
    p.text(
      line,
      left + NODE_CARD_PAD_X + textLeft,
      top + NODE_CARD_PAD_Y + index * NODE_CARD_TITLE_LEADING
    );
  });
  p.textStyle(p.NORMAL);
  p.textSize(NODE_CARD_SUBTITLE_SIZE);
  p.text(
    subtitle,
    left + NODE_CARD_PAD_X + textLeft,
    top + NODE_CARD_PAD_Y + titleLines.length * NODE_CARD_TITLE_LEADING
  );
  p.pop();
  return { width, height };
}

// A line tag's full-size width and height: the name over a smaller detail
// line.
function measureLineTagText(
  p: p5,
  name: string,
  detail: string
): { width: number; height: number } {
  p.textSize(12);
  const nameWidth = p.textWidth(name);
  p.textSize(10);
  const detailWidth = detail ? p.textWidth(detail) : 0;
  // Just the name (no detail line) makes a shorter tag.
  return {
    width: Math.max(nameWidth, detailWidth) + 16,
    height: detail ? 36 : 24,
  };
}

// The name tag riding a hovered timeline: centred on its point on the line,
// in the timeline's colour with white text (the name over `detail`, fainter),
// growing in and out with `scale`.
function drawLineTagText(
  p: p5,
  name: string,
  detail: string,
  colour: string,
  x: number,
  y: number,
  scale: number
): void {
  if (scale <= 0) {
    return;
  }
  const size = measureLineTagText(p, name, detail);
  const width = size.width * scale;
  const height = size.height * scale;
  const top = y - height / 2;
  p.noStroke();
  p.fill(colour);
  p.rect(x - width / 2, top, width, height, LINE_TAG_RADIUS_PX * scale);
  p.textAlign(p.CENTER, p.CENTER);
  // White text, or dark on a white tag (the main timeline's).
  const ink = colour.toLowerCase() === '#ffffff' ? 17 : 255;
  p.fill(ink);
  p.textSize(12 * scale);
  p.text(name, x, detail ? top + 13 * scale : y);
  if (detail) {
    p.fill(ink, 255 * LINE_TAG_DETAIL_ALPHA);
    p.textSize(10 * scale);
    p.text(detail, x, top + 25 * scale);
  }
}

// A small tag naming an item's kind (e.g. "MUSIC"), tucked inside its image's
// bottom-right corner: white caps on a grey box, the same size on screen at
// any zoom.
function drawKindTagText(
  p: p5,
  text: string,
  imageRight: number,
  imageBottom: number,
  zoom: number
): void {
  const inset = KIND_TAG_INSET_PX / zoom;
  const padX = KIND_TAG_PAD_X_PX / zoom;
  const padY = KIND_TAG_PAD_Y_PX / zoom;
  p.textSize(KIND_TAG_FONT_PX / zoom);
  const width = p.textWidth(text) + padX * 2;
  const height = KIND_TAG_FONT_PX / zoom + padY * 2;
  const right = imageRight - inset;
  const top = imageBottom - inset - height;
  p.noStroke();
  p.fill(KIND_TAG_BACKGROUND);
  p.rect(right - width, top, width, height);
  p.fill(255);
  p.textAlign(p.RIGHT, p.CENTER);
  p.text(text, right - padX, top + height / 2);
}

// A sticker centred on an item's picture, `width` (world units) wide — its
// text sized to fill it — and turned by `angle` (radians) about its centre.
function drawCentredTagText(
  p: p5,
  text: string,
  centreX: number,
  centreY: number,
  width: number,
  angle = 0
): void {
  // In the site's serif, one line per line of `text`, centred; the padding
  // in step with the text, so the sticker looks the same at any size.
  const lines = text.split('\n');
  p.textFont(CANVAS_TITLE_FONT);
  p.textSize(100);
  const widestAt100 = Math.max(...lines.map((line) => p.textWidth(line)));
  const padShare = 0.3;
  const fontSize = (width / (widestAt100 + 100 * padShare * 2)) * 100;
  const padY = fontSize * 0.2;
  const leading = fontSize * 1.05;
  p.textSize(fontSize);
  const height = lines.length * leading + padY * 2;
  p.push();
  p.translate(centreX, centreY);
  p.rotate(angle);
  // Inverted from the kind tag: white, with its grey for the text, lifted
  // off the picture by a slight shadow (as the panel's sticker is).
  const ctx = p.drawingContext as CanvasRenderingContext2D;
  p.noStroke();
  p.fill(255);
  ctx.shadowColor = 'rgba(0, 0, 0, 0.12)';
  ctx.shadowBlur = 3 * p.pixelDensity();
  ctx.shadowOffsetY = 1 * p.pixelDensity();
  p.rect(-width / 2, -height / 2, width, height);
  ctx.shadowColor = 'rgba(0, 0, 0, 0)';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  p.fill(KIND_TAG_BACKGROUND);
  p.textAlign(p.CENTER, p.CENTER);
  lines.forEach((line, k) =>
    p.text(line, 0, (k - (lines.length - 1) / 2) * leading)
  );
  p.pop();
}

// Runs `draw` with the canvas label font, then puts the canvas's own font back.
function withLabelFont<T>(p: p5, draw: () => T): T {
  const previous = p.textFont();
  p.textFont(CANVAS_LABEL_FONT);
  // Only Akzidenz's regular weight is bundled, so its text is never set bold
  // (the browser would fake it).
  p.textStyle(p.NORMAL);
  try {
    return draw();
  } finally {
    p.textFont(previous);
  }
}

export function drawNodeCard(
  ...args: Parameters<typeof drawNodeCardText>
): ReturnType<typeof drawNodeCardText> {
  return withLabelFont(args[0], () => drawNodeCardText(...args));
}

export function drawKindTag(...args: Parameters<typeof drawKindTagText>): void {
  withLabelFont(args[0], () => drawKindTagText(...args));
}

export function drawCentredTag(
  ...args: Parameters<typeof drawCentredTagText>
): void {
  withLabelFont(args[0], () => drawCentredTagText(...args));
}

export function drawLineTag(...args: Parameters<typeof drawLineTagText>): void {
  withLabelFont(args[0], () => drawLineTagText(...args));
}

export function measureLineTag(
  ...args: Parameters<typeof measureLineTagText>
): ReturnType<typeof measureLineTagText> {
  return withLabelFont(args[0], () => measureLineTagText(...args));
}
