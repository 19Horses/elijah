import { getBandsintownEventsUrl } from '../bandsintownIntegration';
import type { MainTimelineEvent } from './mainTimeline';

export const BANDSINTOWN_SLUG_PREFIX = 'bandsintown-';

type BandsintownVenue = {
  name: string;
  city: string;
  country: string;
};

type BandsintownEvent = {
  id: string;
  url: string;
  datetime: string;
  title: string;
  venue: BandsintownVenue;
};

function getEventTitle(event: BandsintownEvent): string {
  return event.title || event.venue.name;
}

// Bandsintown's own description is sometimes in the venue's local language
// rather than English, so it's never used — venue and location only.
function getEventDescription(event: BandsintownEvent): string {
  return `${event.venue.name} · ${event.venue.city}, ${event.venue.country}`;
}

function toMainTimelineEvent(event: BandsintownEvent): MainTimelineEvent {
  const slug = `${BANDSINTOWN_SLUG_PREFIX}${event.id}`;
  return {
    unlockTime: null,
    expiryTime: null,
    _id: slug,
    _type: 'event',
    title: getEventTitle(event),
    slug,
    created_at: event.datetime,
    public: true,
    isPrivate: false,
    date: event.datetime,
    description: getEventDescription(event),
    link: event.url,
    image: null,
    imageUrl: null,
    imageDimensions: null,
  };
}

export async function fetchBandsintownEvents(): Promise<MainTimelineEvent[]> {
  const response = await fetch(getBandsintownEventsUrl());
  if (!response.ok) {
    throw new Error(`Failed to fetch Bandsintown events: ${response.status}`);
  }
  const events: BandsintownEvent[] = await response.json();
  return events.map(toMainTimelineEvent);
}
