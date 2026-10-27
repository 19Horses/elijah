import type { CollectedUserRow } from '../../queries/collectedContent';
import {
  getMainTimelineImageUrl,
  type MainTimelineItem,
} from '../../queries/mainTimeline';
import type { CollectionContent } from '../../types/content';
import { ITEM_WIDTH, IMAGE_HEIGHT } from './constants';
import type {
  CollectedSource,
  ProcessedCollected,
  ProcessedCollectionPreview,
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
    contentType: item._type,
    title: item.title,
    bodyContent: item._type === 'newsletter' ? item.content ?? null : null,
    aspectRatio: getItemAspectRatio(item),
    audioUrl: item._type === 'audioAsset' ? item.audioUrl ?? null : null,
    galleryUrls: getGalleryUrls(item),
    isPrivate: item.isPrivate,
  }));
}

export type ItemCollector = { username: string; colour: string };

// Who has collected each item, by content id, most recent first: one entry
// per collector, placed by when they last collected it.
export function collectorsByContent(
  rows: CollectedUserRow[]
): Map<string, ItemCollector[]> {
  const latest = new Map<string, Map<string, ItemCollector & { at: number }>>();
  rows.forEach((row) => {
    row.items.forEach((item) => {
      const at = new Date(item.collectedAt).getTime() || 0;
      const byUser = latest.get(item.content._id) ?? new Map();
      const previous = byUser.get(row.userId);
      if (!previous || at > previous.at) {
        byUser.set(row.userId, {
          username: row.username,
          colour: row.colour,
          at,
        });
      }
      latest.set(item.content._id, byUser);
    });
  });
  return new Map(
    [...latest].map(([id, byUser]) => [
      id,
      [...byUser.values()]
        .sort((a, b) => b.at - a.at)
        .map(({ username, colour }) => ({ username, colour })),
    ])
  );
}

export function buildProcessedCollected(
  rows: CollectedUserRow[],
  mainItems: MainTimelineItem[]
): ProcessedCollected[] {
  const byContentId = new Map<string, ProcessedCollected>();
  const mainContentIds = new Set(mainItems.map((item) => item._id));

  rows.forEach((row, rowIndex) => {
    row.items.forEach((item) => {
      // Events, and anything already on the main timeline, never get a
      // duplicate tile in the collected lane; they only ever appear once, in
      // the main timeline itself.
      if (
        item.content._type === 'event' ||
        mainContentIds.has(item.content._id)
      ) {
        return;
      }

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
        // The same collector holding an item twice still gets one line to it.
        if (existing.sources.some((s) => s.rowIndex === rowIndex)) {
          return;
        }
        existing.sources.push(source);
        existing.rowIndex = Math.min(existing.rowIndex, rowIndex);
        return;
      }

      byContentId.set(contentId, {
        contentId,
        slug: item.content.slug ?? null,
        imageUrl: getMainTimelineImageUrl(item.content),
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
        isPrivate: item.content.isPrivate,
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

// Undated items have no place in the date-ordered merge, so they're skipped.
export function buildProcessedCollectionPreview(
  items: CollectionContent[]
): ProcessedCollectionPreview[] {
  return items
    .map((item): ProcessedCollectionPreview | null => {
      const anchorTime = item.date ? new Date(item.date).getTime() : Number.NaN;
      if (Number.isNaN(anchorTime)) {
        return null;
      }
      return {
        contentId: item._id,
        contentType: item._type,
        slug: item.slug ?? null,
        imageUrl: item.imageUrl,
        title: item.title,
        aspectRatio:
          item.imageDimensions?.aspectRatio || ITEM_WIDTH / IMAGE_HEIGHT,
        anchorTime,
      };
    })
    .filter((item): item is ProcessedCollectionPreview => item !== null);
}
