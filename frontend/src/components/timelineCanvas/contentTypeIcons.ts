import {
  CONTENT_TYPE_ICON_SCALE,
  CONTENT_TYPE_ICONS,
} from '../ContentTypeIcon';
import type { ContentType } from '../../types/content';

const ICON_RASTER_SIZE = 64;

const iconCanvases = new Map<string, HTMLCanvasElement | null>();

function rasteriseIcon(
  url: string,
  colour: string,
  scale: number
): HTMLCanvasElement | null {
  const key = `${url}|${colour}|${scale}`;
  if (iconCanvases.has(key)) {
    return iconCanvases.get(key) ?? null;
  }
  iconCanvases.set(key, null);
  const image = new Image();
  image.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = ICON_RASTER_SIZE;
    canvas.height = ICON_RASTER_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }
    const size = ICON_RASTER_SIZE * scale;
    const offset = (ICON_RASTER_SIZE - size) / 2;
    ctx.drawImage(image, offset, offset, size, size);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, ICON_RASTER_SIZE, ICON_RASTER_SIZE);
    iconCanvases.set(key, canvas);
  };
  image.src = url;
  return null;
}

export function getContentTypeIconCanvas(
  type: ContentType,
  colour = '#ffffff'
): HTMLCanvasElement | null {
  const url = CONTENT_TYPE_ICONS[type];
  return url
    ? rasteriseIcon(url, colour, CONTENT_TYPE_ICON_SCALE[type] ?? 1)
    : null;
}
