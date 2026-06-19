import { DEFAULT_PICKER_COLOUR } from '../constants/pickerColors';

const COLOUR_KEY = 'elijah:colour';

export const DEFAULT_COLOUR = DEFAULT_PICKER_COLOUR;

function getContrastTextColour(hex: string): string {
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#111827' : '#ffffff';
}

export function getStoredColour(): string | null {
  return localStorage.getItem(COLOUR_KEY);
}

export function storeColour(colour: string): void {
  localStorage.setItem(COLOUR_KEY, colour);
}

export function clearStoredColour(): void {
  localStorage.removeItem(COLOUR_KEY);
}

export function applySelectionColour(colour: string): void {
  document.documentElement.style.setProperty('--selection-color', colour);
  document.documentElement.style.setProperty(
    '--selection-text-color',
    getContrastTextColour(colour)
  );
}

export function initSelectionColour(): void {
  applySelectionColour(getStoredColour() ?? DEFAULT_COLOUR);
}
