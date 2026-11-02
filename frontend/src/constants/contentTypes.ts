import type { ContentType } from '../types/content';

export type ContentTypeEntry = {
  type: ContentType;
  label: string;
  colour: string;
};

export const CONTENT_TYPES: ContentTypeEntry[] = [
  { type: 'imageAsset', label: 'Image', colour: '#2563EB' },
  { type: 'audioAsset', label: 'Audio', colour: '#9333EA' },
  { type: 'newsletter', label: 'Newsletter', colour: '#059669' },
  { type: 'event', label: 'Event', colour: '#EA580C' },
];

export function getContentTypeColour(type: ContentType): string {
  return (
    CONTENT_TYPES.find((entry) => entry.type === type)?.colour ?? '#111827'
  );
}

export function getContentTypeLabel(type: ContentType): string {
  return CONTENT_TYPES.find((entry) => entry.type === type)?.label ?? '';
}

// The kind of an item, in caps: the tag in its picture's corner on the map,
// and its kind in a collection's item list.
export function getContentTypeKicker(type: ContentType): string | undefined {
  switch (type) {
    case 'imageAsset':
      return 'PHOTOS';
    case 'audioAsset':
      return 'MUSIC';
    case 'newsletter':
      return 'LETTER';
    case 'event':
      return 'EVENT';
    default:
      return undefined;
  }
}
