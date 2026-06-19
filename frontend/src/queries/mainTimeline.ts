import { useQuery } from '@tanstack/react-query';
import type { SanityImageSource } from '@sanity/image-url';
import { getApiUrl, getSanityImageUrl } from '../sanityIntegration';
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
  _type == "imageAsset" => {
    title,
    description,
    image,
    "imageUrl": image.asset->url,
    "imageDimensions": image.asset->metadata.dimensions{width, height, aspectRatio}
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
  "items": (
  coalesce(*[_type == "mainTimeline"][0].items, [])[] {
    unlockTime,
    expiryTime,
    ...content-> {
      ${CONTENT_PROJECTION}
    }
  }
) + (
  *[_type == "event"] {
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
    "imageUrl": image.asset->url,
    "imageDimensions": image.asset->metadata.dimensions{width, height, aspectRatio}
  }
) | order(date asc)
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

export async function fetchMainTimeline(): Promise<MainTimelineData> {
  const response = await fetch(getApiUrl(MAIN_TIMELINE_QUERY));
  if (!response.ok) {
    throw new Error(`Failed to fetch main timeline: ${response.status}`);
  }
  const data: SanityResponse<MainTimelineData> = await response.json();
  return data.result ?? { colour: null, items: [] };
}

export function useMainTimeline() {
  return useQuery({
    queryKey: ['mainTimeline'],
    queryFn: fetchMainTimeline,
  });
}
