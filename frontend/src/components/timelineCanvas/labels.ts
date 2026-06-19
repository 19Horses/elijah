import type p5 from 'p5';
import { MAX_VISIBLE_COLLECTOR_LABELS, OTHERS_LABEL_BG } from './constants';
import { getContrastText } from './canvasEffects';
import type { CollectedSource } from './types';

type LabelChip = {
  text: string;
  bg: string;
};

export function drawUserLabel(
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

export function drawCollectedSourcesLabel(
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
