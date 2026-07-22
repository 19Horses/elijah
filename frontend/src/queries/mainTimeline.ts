import { useQuery } from '@tanstack/react-query';
import type { SanityImageSource } from '@sanity/image-url';
import { getApiUrl, getSanityImageUrl } from '../sanityIntegration';
import { getMyCollectedIds } from '../services/collectItem';
import { fetchAllEvents, isFutureEvent } from './events';
import type {
  AudioAsset,
  Event,
  ImageAsset,
  Newsletter,
} from '../types/content';

type SanityResponse<T> = {
  result: T;
};

type MainTimelineItemBase = {
  unlockTime: string | null;
  expiryTime: string | null;
};

export type MainTimelineImage = MainTimelineItemBase &
  ImageAsset & { image: SanityImageSource | null };

export type MainTimelineAudio = MainTimelineItemBase &
  AudioAsset & { image: SanityImageSource | null };

export type MainTimelineNewsletter = MainTimelineItemBase &
  Newsletter & { image: SanityImageSource | null };

export type MainTimelineEvent = MainTimelineItemBase &
  Event & { image: SanityImageSource | null };

export type MainTimelineItem =
  | MainTimelineImage
  | MainTimelineAudio
  | MainTimelineNewsletter
  | MainTimelineEvent;

export type MainTimelineData = {
  colour: string | null;
  items: MainTimelineItem[];
};

export const CONTENT_PROJECTION = `_id,
  _type,
  date,
  "created_at": _createdAt,
  "slug": slug.current,
  public,
  "isPrivate": public == false && !(_id in $collectedIds),
  _type == "imageAsset" => {
    title,
    description,
    ...coalesce(images[isCover == true][0], images[0], image){
      "image": @,
      "imageUrl": asset->url,
      "imageDimensions": asset->metadata.dimensions{width, height, aspectRatio}
    },
    "images": images[]{
      "url": asset->url,
      "dimensions": asset->metadata.dimensions{width, height, aspectRatio},
      isCover
    }
  },
  _type == "audioAsset" => {
    title,
    description,
    image,
    "imageUrl": image.asset->url,
    "imageDimensions": image.asset->metadata.dimensions{width, height, aspectRatio},
    "audioUrl": audio.asset->url
  },
  _type == "newsletter" => {
    title,
    content,
    image,
    "imageUrl": image.asset->url,
    "imageDimensions": image.asset->metadata.dimensions{width, height, aspectRatio}
  }`;

const MAIN_TIMELINE_QUERY = `{
  "colour": *[_type == "mainTimeline"][0].colour,
  "items": coalesce(*[_type == "mainTimeline"][0].items, [])[defined(content)] {
    unlockTime,
    expiryTime,
    ...content-> {
      ${CONTENT_PROJECTION}
    }
  } | order(date asc)
}`;

const TIMELINE_IMAGE_WIDTH = 400;

export function getMainTimelineImageUrl(item: MainTimelineItem): string | null {
  if ('imageUrl' in item && item.imageUrl) {
    return item.imageUrl;
  }
  if (!('image' in item) || !item.image) {
    return null;
  }
  const aspectRatio = item.imageDimensions?.aspectRatio;
  if (aspectRatio) {
    const height = Math.round(TIMELINE_IMAGE_WIDTH / aspectRatio);
    return getSanityImageUrl(item.image, TIMELINE_IMAGE_WIDTH, height);
  }
  return getSanityImageUrl(item.image, TIMELINE_IMAGE_WIDTH);
}

export function formatMainTimelineDate(date: string | null): string {
  if (!date) {
    return '';
  }
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatMainTimelineNow(date: Date = new Date()): {
  date: string;
  time: string;
} {
  return {
    date: date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }),
    time: date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    }),
  };
}

function timelineItemTime(item: MainTimelineItem): number {
  return item.date ? new Date(item.date).getTime() : -Infinity;
}

export async function fetchMainTimeline(): Promise<MainTimelineData> {
  const collectedIds = await getMyCollectedIds();
  const [response, events] = await Promise.all([
    fetch(getApiUrl(MAIN_TIMELINE_QUERY, { collectedIds })),
    fetchAllEvents(),
  ]);
  if (!response.ok) {
    throw new Error(`Failed to fetch main timeline: ${response.status}`);
  }
  const data: SanityResponse<MainTimelineData> = await response.json();
  const result = data.result ?? { colour: null, items: [] };
  const futureEvents = events.filter(isFutureEvent);
  const items = [...result.items, ...futureEvents].sort(
    (a, b) => timelineItemTime(a) - timelineItemTime(b)
  );
  return { ...result, items };
}

export function useMainTimeline() {
  return useQuery({
    queryKey: ['mainTimeline'],
    queryFn: fetchMainTimeline,
  });
}
