import { useQuery } from '@tanstack/react-query';
import type { SanityImageSource } from '@sanity/image-url';
import { getApiUrl, getSanityImageUrl } from '../sanityIntegration';
import type { ImageDimensions } from './products';

type SanityResponse<T> = {
  result: T;
};

type MainTimelineItemBase = {
  _id: string;
  date: string | null;
  created_at: string;
  unlockTime: string | null;
  expiryTime: string | null;
};

export type MainTimelineImage = MainTimelineItemBase & {
  _type: 'imageAsset';
  title: string;
  description: string | null;
  image: SanityImageSource | null;
  imageDimensions: ImageDimensions | null;
};

export type MainTimelineAudio = MainTimelineItemBase & {
  _type: 'audioAsset';
  title: string;
  description: string | null;
  image: SanityImageSource | null;
  imageDimensions: ImageDimensions | null;
  audioUrl: string | null;
};

export type MainTimelineNewsletter = MainTimelineItemBase & {
  _type: 'newsletter';
  title: string;
  content: string;
  image: SanityImageSource | null;
  imageDimensions: ImageDimensions | null;
};

export type MainTimelineEvent = MainTimelineItemBase & {
  _type: 'event';
  title: string;
  description: string;
  link: string;
  image: SanityImageSource | null;
  imageDimensions: ImageDimensions | null;
};

export type MainTimelineItem =
  | MainTimelineImage
  | MainTimelineAudio
  | MainTimelineNewsletter
  | MainTimelineEvent;

export type MainTimelineData = {
  colour: string | null;
  items: MainTimelineItem[];
};

const MAIN_TIMELINE_QUERY = `{
  "colour": *[_type == "mainTimeline"][0].colour,
  "items": (
  coalesce(*[_type == "mainTimeline"][0].items, [])[] {
    unlockTime,
    expiryTime,
    ...content-> {
      _id,
      _type,
      date,
      "created_at": _createdAt,
      _type == "imageAsset" => {
        title,
        description,
        image,
        "imageDimensions": image.asset->metadata.dimensions{width, height, aspectRatio}
      },
      _type == "audioAsset" => {
        title,
        description,
        image,
        "imageDimensions": image.asset->metadata.dimensions{width, height, aspectRatio},
        "audioUrl": audio.asset->url
      },
      _type == "newsletter" => {
        title,
        content,
        image,
        "imageDimensions": image.asset->metadata.dimensions{width, height, aspectRatio}
      }
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
    title,
    description,
    link,
    image,
    "imageDimensions": image.asset->metadata.dimensions{width, height, aspectRatio}
  }
) | order(date asc)
}`;

const TIMELINE_IMAGE_WIDTH = 400;

export function getMainTimelineImageUrl(item: MainTimelineItem): string | null {
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
