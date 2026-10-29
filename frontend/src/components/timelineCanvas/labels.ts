import type p5 from 'p5';
import {
  CANVAS_LABEL_FONT,
  OTHERS_LABEL_ALPHA,
  LINE_TAG_DETAIL_ALPHA,
  LINE_TAG_RADIUS_PX,
  MAX_VISIBLE_COLLECTOR_LABELS,
  OTHERS_LABEL_BG,
  KIND_TAG_BACKGROUND,
  KIND_TAG_FONT_PX,
  KIND_TAG_INSET_PX,
  KIND_TAG_PAD_X_PX,
  KIND_TAG_PAD_Y_PX,
} from './constants';
import { getContrastText } from './canvasEffects';
import type { CollectedSource, ConnectorPoint, NodeHoverRegion } from './types';

// Gap kept between a label and the edge of the canvas.
const LABEL_EDGE_MARGIN = 6;

type LabelChip = {
  text: string;
  bg: string;
};

function drawUserLabelText(
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
  const lines = title ? [title, username] : [username];
  const maxWidth = Math.max(...lines.map((line) => p.textWidth(line)));

  const width = maxWidth + padX * 2;
  const labelHeight = lines.length * lineHeight + padY * 2;
  // Sits above the point, centred — but stays on screen, so a node out at the
  // viewport edge still gets a readable label (below it, at the top edge).
  const left = Math.max(
    LABEL_EDGE_MARGIN,
    Math.min(x - width / 2, p.width - width - LABEL_EDGE_MARGIN)
  );
  const above = y - 14 - labelHeight;
  const top = above < LABEL_EDGE_MARGIN ? y + 14 : above;
  const centreX = left + width / 2;

  p.noStroke();
  p.fill(colour);
  p.rect(left, top, width, labelHeight);

  p.fill(getContrastText(colour));
  p.textAlign(p.CENTER, p.CENTER);
  lines.forEach((line, index) => {
    p.text(line, centreX, top + padY + lineHeight * index + lineHeight / 2);
  });
  p.textStyle(p.NORMAL);
}

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

function drawCollectedSourcesLabelText(
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
    p.rect(left, top, totalWidth, titleHeight);
    p.fill(255);
    p.textAlign(p.CENTER, p.CENTER);
    p.text(title, x, top + titleHeight / 2);
  }

  const chipsTop = top + titleHeight + titleGap;
  let chipLeft = x - chipsWidth / 2;

  chips.forEach((chip, index) => {
    const width = chipWidths[index];
    p.noStroke();
    p.fill(chip.bg);
    p.rect(chipLeft, chipsTop, width, chipsRowHeight);
    p.fill(getContrastText(chip.bg));
    p.textAlign(p.CENTER, p.CENTER);
    p.textStyle(p.NORMAL);
    p.text(chip.text, chipLeft + width / 2, chipsTop + chipsRowHeight / 2);
    chipLeft += width + chipGap;
  });

  p.textStyle(p.NORMAL);
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
  const detailWidth = p.textWidth(detail);
  return { width: Math.max(nameWidth, detailWidth) + 16, height: 36 };
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
  p.fill(255);
  p.textSize(12 * scale);
  p.text(name, x, top + 13 * scale);
  p.fill(255, 255 * LINE_TAG_DETAIL_ALPHA);
  p.textSize(10 * scale);
  p.text(detail, x, top + 25 * scale);
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

export function drawUserLabel(
  ...args: Parameters<typeof drawUserLabelText>
): void {
  withLabelFont(args[0], () => drawUserLabelText(...args));
}

export function drawNodeCard(
  ...args: Parameters<typeof drawNodeCardText>
): ReturnType<typeof drawNodeCardText> {
  return withLabelFont(args[0], () => drawNodeCardText(...args));
}

export function drawCollectedSourcesLabel(
  ...args: Parameters<typeof drawCollectedSourcesLabelText>
): void {
  withLabelFont(args[0], () => drawCollectedSourcesLabelText(...args));
}

export function drawKindTag(...args: Parameters<typeof drawKindTagText>): void {
  withLabelFont(args[0], () => drawKindTagText(...args));
}

export function drawLineTag(...args: Parameters<typeof drawLineTagText>): void {
  withLabelFont(args[0], () => drawLineTagText(...args));
}

export function measureLineTag(
  ...args: Parameters<typeof measureLineTagText>
): ReturnType<typeof measureLineTagText> {
  return withLabelFont(args[0], () => measureLineTagText(...args));
}
