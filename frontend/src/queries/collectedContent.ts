import { useQuery } from '@tanstack/react-query';
import { getApiUrl } from '../sanityIntegration';
import { getUserCollections } from '../services/collectedContent';
import { getMyCollectedIds } from '../services/collectItem';
import {
  BANDSINTOWN_SLUG_PREFIX,
  fetchBandsintownEvents,
} from './bandsintownEvents';
import {
  CONTENT_PROJECTION,
  type MainTimelineEvent,
  type MainTimelineItem,
} from './mainTimeline';

type SanityResponse<T> = {
  result: T;
};

export type CollectedRowItem = {
  content: MainTimelineItem;
  collectedAt: string;
};

export type CollectedUserRow = {
  userId: string;
  username: string;
  colour: string;
  items: CollectedRowItem[];
};

export async function fetchContentByIds(
  ids: string[]
): Promise<MainTimelineItem[]> {
  if (ids.length === 0) return [];

  const query = `*[_id in ${JSON.stringify(ids)}] {
    "unlockTime": null,
    "expiryTime": null,
    ${CONTENT_PROJECTION}
  }`;

  const collectedIds = await getMyCollectedIds();
  const response = await fetch(getApiUrl(query, { collectedIds }));
  if (!response.ok) {
    throw new Error(`Failed to fetch collected content: ${response.status}`);
  }
  const data: SanityResponse<MainTimelineItem[]> = await response.json();
  return data.result ?? [];
}

// Attended events are synthetic (bandsintown-*) ids that don't exist in
// Sanity, so they're resolved from the Bandsintown API instead of GROQ.
async function fetchBandsintownContentByIds(
  ids: string[]
): Promise<MainTimelineEvent[]> {
  if (ids.length === 0) return [];
  try {
    const events = await fetchBandsintownEvents();
    const idSet = new Set(ids);
    return events.filter((event) => idSet.has(event._id));
  } catch (error) {
    console.error(
      'Failed to fetch Bandsintown events for collected timeline',
      error
    );
    return [];
  }
}

async function fetchCollectedTimeline(): Promise<CollectedUserRow[]> {
  const users = await getUserCollections();
  const ids = Array.from(
    new Set(users.flatMap((user) => user.items.map((item) => item.id)))
  );
  const sanityIds = ids.filter((id) => !id.startsWith(BANDSINTOWN_SLUG_PREFIX));
  const bandsintownIds = ids.filter((id) =>
    id.startsWith(BANDSINTOWN_SLUG_PREFIX)
  );
  const [sanityContent, bandsintownContent] = await Promise.all([
    fetchContentByIds(sanityIds),
    fetchBandsintownContentByIds(bandsintownIds),
  ]);
  const content = [...sanityContent, ...bandsintownContent];

  const contentById = new Map(content.map((item) => [item._id, item]));

  return users
    .map((user) => {
      const items = user.items
        .map((item) => {
          const matched = contentById.get(item.id);
          if (!matched) return null;
          return { content: matched, collectedAt: item.collectedAt };
        })
        .filter((item): item is CollectedRowItem => item !== null);
      return {
        userId: user.userId,
        username: user.username,
        colour: user.colour,
        items,
      };
    })
    .filter((row) => row.items.length > 0);
}

export function useCollectedTimeline() {
  return useQuery({
    queryKey: ['collectedTimeline'],
    queryFn: fetchCollectedTimeline,
  });
}
