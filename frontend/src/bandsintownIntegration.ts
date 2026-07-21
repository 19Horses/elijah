const ARTIST_NAME = 'dialE';
const APP_ID = '8855dee4711cfe18b1ab894788c9f7d6';

export const BANDSINTOWN_URL = 'https://rest.bandsintown.com';

export function getBandsintownEventsUrl(): string {
  const url = new URL(
    `${BANDSINTOWN_URL}/artists/${encodeURIComponent(ARTIST_NAME)}/events/`
  );
  url.searchParams.set('app_id', APP_ID);
  url.searchParams.set('date', 'all');
  return url.toString();
}
