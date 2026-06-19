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
