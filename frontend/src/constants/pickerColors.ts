export const PICKER_COLORS = [
  '#F44E3B',
  '#FF6B6B',
  '#FE9200',
  '#FF8C42',
  '#FCDC00',
  '#FFE66D',
  '#DBDF00',
  '#A4DD00',
  '#2ECC71',
  '#68CCCA',
  '#4ECDC4',
  '#73D8FF',
  '#45B7D1',
  '#AEA1FF',
  '#9B59B6',
  '#FDA1FF',
  '#FF69B4',
  '#D33115',
  '#E27300',
  '#FCC400',
  '#B0BC00',
  '#68BC00',
  '#96CEB4',
  '#16A5A5',
  '#009CE0',
  '#7B64FF',
  '#FA28FF',
  '#9F0500',
  '#C45100',
  '#FB9E00',
  '#194D33',
  '#0C797D',
  '#0062B1',
  '#653294',
  '#AB149E',
  '#3498DB',
  '#F39C12',
];

export const DEFAULT_PICKER_COLOUR = PICKER_COLORS[0];

// A random colour from the palette, assigned to new users in place of a picker.
export function randomPickerColour(): string {
  return PICKER_COLORS[Math.floor(Math.random() * PICKER_COLORS.length)];
}

// Saturation cap and lightness range timeline colours are shown within, so
// every collector's colour reads soft and muted rather than vivid.
const MUTED_MAX_SATURATION = 0.55;
const MUTED_MIN_LIGHTNESS = 0.6;
const MUTED_MAX_LIGHTNESS = 0.72;

// A softer, less saturated version of a user's colour for display: its hue
// kept, its saturation capped and its lightness eased into a gentle mid range.
// Muting an already muted colour leaves it unchanged.
export function muteColour(hex: string): string {
  const value = hex.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(value)) {
    return hex;
  }
  const r = Number.parseInt(value.slice(0, 2), 16) / 255;
  const g = Number.parseInt(value.slice(2, 4), 16) / 255;
  const b = Number.parseInt(value.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const chroma = max - min;
  const saturation =
    chroma === 0 ? 0 : chroma / (1 - Math.abs(2 * lightness - 1));
  let hue = 0;
  if (chroma > 0) {
    hue =
      max === r
        ? ((g - b) / chroma) % 6
        : max === g
        ? (b - r) / chroma + 2
        : (r - g) / chroma + 4;
  }
  hue = (hue * 60 + 360) % 360;

  const s = Math.min(saturation, MUTED_MAX_SATURATION);
  const l = Math.min(
    MUTED_MAX_LIGHTNESS,
    Math.max(MUTED_MIN_LIGHTNESS, lightness)
  );
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  const [r1, g1, b1] =
    hue < 60
      ? [c, x, 0]
      : hue < 120
      ? [x, c, 0]
      : hue < 180
      ? [0, c, x]
      : hue < 240
      ? [0, x, c]
      : hue < 300
      ? [x, 0, c]
      : [c, 0, x];
  const toHex = (channel: number) =>
    Math.round((channel + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(r1)}${toHex(g1)}${toHex(b1)}`;
}
