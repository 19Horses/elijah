import { useQuery } from '@tanstack/react-query';
import { getApiUrl } from '../sanityIntegration';
import {
  getAllCollectors,
  type Collector,
} from '../services/collectedContent';
import { CONTENT_PROJECTION, type MainTimelineItem } from './mainTimeline';

type SanityResponse<T> = {
  result: T;
};

export type CollectedEntry = {
  content: MainTimelineItem;
  collectors: Collector[];
};

export async function fetchContentByIds(
  ids: string[],
): Promise<MainTimelineItem[]> {
  if (ids.length === 0) return [];

  const query = `*[_id in ${JSON.stringify(ids)}] {
    "unlockTime": null,
    "expiryTime": null,
    ${CONTENT_PROJECTION}
  }`;

  const response = await fetch(getApiUrl(query));
  if (!response.ok) {
    throw new Error(`Failed to fetch collected content: ${response.status}`);
  }
  const data: SanityResponse<MainTimelineItem[]> = await response.json();
  return data.result ?? [];
}

async function fetchCollectedTimeline(): Promise<CollectedEntry[]> {
  const groups = await getAllCollectors();
  const ids = groups.map((group) => group.id);
  const content = await fetchContentByIds(ids);

  const contentById = new Map(content.map((item) => [item._id, item]));

  return groups
    .map((group) => {
      const item = contentById.get(group.id);
      if (!item) return null;
      return { content: item, collectors: group.collectors };
    })
    .filter((entry): entry is CollectedEntry => entry !== null);
}

export function useCollectedTimeline() {
  return useQuery({
    queryKey: ['collectedTimeline'],
    queryFn: fetchCollectedTimeline,
  });
}
