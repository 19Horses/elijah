import { useQuery } from '@tanstack/react-query';
import { getApiUrl } from '../sanityIntegration';
import { getMyCollectedIds } from '../services/collectItem';
import {
  BANDSINTOWN_SLUG_PREFIX,
  fetchBandsintownEvents,
} from './bandsintownEvents';
import type { MainTimelineEvent } from './mainTimeline';

type SanityResponse<T> = {
  result: T;
};

export const SANITY_EVENTS_QUERY = `*[_type == "event"] {
  "unlockTime": null,
  "expiryTime": null,
  _id,
  _type,
  date,
  "created_at": _createdAt,
  "slug": slug.current,
  title,
  description,
  link,
  image,
  public,
  "isPrivate": public == false && !(_id in $collectedIds),
  "imageUrl": image.asset->url,
  "imageDimensions": image.asset->metadata.dimensions{width, height, aspectRatio}
}`;

async function fetchBandsintownEventsSafe(): Promise<MainTimelineEvent[]> {
  try {
    return await fetchBandsintownEvents();
  } catch (error) {
    console.error('Failed to fetch Bandsintown events', error);
    return [];
  }
}

// Ids of Bandsintown events a CMS manager has already imported into Sanity
// (see backend/tools/ImportBandsintownEvents.tsx) — those are excluded from
// the live API results below so the Sanity copy (with its image) is the only
// one shown. Fails soft: worst case a just-imported event briefly shows
// twice rather than the whole events list breaking.
async function fetchImportedBandsintownIds(): Promise<Set<string>> {
  try {
    const query = '*[_type == "event" && defined(bandsintownId)].bandsintownId';
    const response = await fetch(getApiUrl(query));
    if (!response.ok) {
      throw new Error(
        `Failed to fetch imported Bandsintown ids: ${response.status}`
      );
    }
    const data: SanityResponse<string[]> = await response.json();
    return new Set(data.result ?? []);
  } catch (error) {
    console.error('Failed to fetch imported Bandsintown ids', error);
    return new Set();
  }
}

function eventTime(event: MainTimelineEvent): number {
  return event.date ? new Date(event.date).getTime() : -Infinity;
}

export function isFutureEvent(event: MainTimelineEvent): boolean {
  return eventTime(event) > Date.now();
}

// Every event (Sanity-authored + Bandsintown), merged and sorted by date.
export async function fetchAllEvents(): Promise<MainTimelineEvent[]> {
  const collectedIds = await getMyCollectedIds();
  const [response, bandsintownEvents, importedBandsintownIds] =
    await Promise.all([
      fetch(getApiUrl(SANITY_EVENTS_QUERY, { collectedIds })),
      fetchBandsintownEventsSafe(),
      fetchImportedBandsintownIds(),
    ]);
  if (!response.ok) {
    throw new Error(`Failed to fetch events: ${response.status}`);
  }
  const data: SanityResponse<MainTimelineEvent[]> = await response.json();
  const sanityEvents = data.result ?? [];
  const newBandsintownEvents = bandsintownEvents.filter(
    (event) =>
      !importedBandsintownIds.has(
        event._id.slice(BANDSINTOWN_SLUG_PREFIX.length)
      )
  );
  return [...sanityEvents, ...newBandsintownEvents].sort(
    (a, b) => eventTime(a) - eventTime(b)
  );
}

export async function fetchPastEvents(): Promise<MainTimelineEvent[]> {
  const events = await fetchAllEvents();
  return events.filter((event) => !isFutureEvent(event)).reverse();
}

export function usePastEvents() {
  return useQuery({
    queryKey: ['pastEvents'],
    queryFn: fetchPastEvents,
  });
}
