// Mirrors frontend/src/queries/bandsintownEvents.ts. Kept separate since
// backend and frontend are independent workspaces with no shared package.
const ARTIST_NAME = 'dialE'
const APP_ID = '8855dee4711cfe18b1ab894788c9f7d6'

type BandsintownVenue = {
  name: string
  city: string
  country: string
}

type BandsintownRawEvent = {
  id: string
  url: string
  datetime: string
  title: string
  venue: BandsintownVenue
}

export type BandsintownEvent = {
  id: string
  title: string
  description: string
  date: string
  link: string
}

function getEventsUrl(): string {
  const url = new URL(
    `https://rest.bandsintown.com/artists/${encodeURIComponent(ARTIST_NAME)}/events/`,
  )
  url.searchParams.set('app_id', APP_ID)
  url.searchParams.set('date', 'all')
  return url.toString()
}

function getEventTitle(event: BandsintownRawEvent): string {
  return event.title || event.venue.name
}

// Bandsintown's own description is sometimes in the venue's local language,
// so it's never used — venue and location only (matches the frontend).
function getEventDescription(event: BandsintownRawEvent): string {
  return `${event.venue.name} · ${event.venue.city}, ${event.venue.country}`
}

export async function fetchBandsintownEvents(): Promise<BandsintownEvent[]> {
  const response = await fetch(getEventsUrl())
  if (!response.ok) {
    throw new Error(`Failed to fetch Bandsintown events: ${response.status}`)
  }
  const events: BandsintownRawEvent[] = await response.json()
  return events.map((event) => ({
    id: event.id,
    title: getEventTitle(event),
    description: getEventDescription(event),
    date: event.datetime,
    link: event.url,
  }))
}
