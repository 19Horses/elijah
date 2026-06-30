import type { CollectedUserRow } from '../../queries/collectedContent';
import {
  formatMainTimelineDate,
  getMainTimelineImageUrl,
  type MainTimelineItem,
} from '../../queries/mainTimeline';
import { ITEM_WIDTH, IMAGE_HEIGHT } from './constants';
import type {
  CollectedSource,
  ProcessedCollected,
  ProcessedItem,
} from './types';

function getItemAspectRatio(item: MainTimelineItem): number {
  if ('imageDimensions' in item && item.imageDimensions?.aspectRatio) {
    return item.imageDimensions.aspectRatio;
  }
  return ITEM_WIDTH / IMAGE_HEIGHT;
}

// All gallery image URLs for an image asset, cover first.
function getGalleryUrls(item: MainTimelineItem): string[] {
  if (item._type !== 'imageAsset' || !Array.isArray(item.images)) {
    return [];
  }
  const withUrl = item.images.filter((image) => Boolean(image?.url));
  const cover = withUrl.filter((image) => image.isCover);
  const rest = withUrl.filter((image) => !image.isCover);
  return [...cover, ...rest]
    .map((image) => image.url)
    .filter((url): url is string => url !== null);
}

export function buildProcessedItems(
  items: MainTimelineItem[]
): ProcessedItem[] {
  return items.map((item) => ({
    imageUrl: getMainTimelineImageUrl(item),
    slug: item.slug ?? null,
    dateLabel: formatMainTimelineDate(item.date),
    contentType: item._type,
    title: item.title,
    bodyContent: item._type === 'newsletter' ? item.content ?? null : null,
    aspectRatio: getItemAspectRatio(item),
    audioUrl: item._type === 'audioAsset' ? item.audioUrl ?? null : null,
    galleryUrls: getGalleryUrls(item),
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
        audioUrl:
          item.content._type === 'audioAsset'
            ? item.content.audioUrl ?? null
            : null,
        galleryUrls: getGalleryUrls(item.content),
      });
    });
  });

  const collected = Array.from(byContentId.values());

  // Compress collector lanes: only rows that actually collected something get a
  // vertical slot, so empty source rows don't leave big gaps (an item from a
  // deep source row would otherwise sink far below the timeline). Remap each
  // used row index to its dense rank, preserving order. Monotonic, so each
  // item's `rowIndex` (the min of its sources) maps consistently.
  const usedRows = Array.from(
    new Set(collected.flatMap((item) => item.sources.map((s) => s.rowIndex)))
  ).sort((a, b) => a - b);
  const rowRank = new Map(usedRows.map((row, rank) => [row, rank]));
  collected.forEach((item) => {
    item.sources.forEach((source) => {
      source.rowIndex = rowRank.get(source.rowIndex) ?? source.rowIndex;
    });
    item.rowIndex = rowRank.get(item.rowIndex) ?? item.rowIndex;
  });

  return collected.sort((a, b) => {
    if (a.rowIndex !== b.rowIndex) {
      return a.rowIndex - b.rowIndex;
    }
    return a.anchorTime - b.anchorTime;
  });
}
