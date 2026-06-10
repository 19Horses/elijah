import { getApiUrl } from '../sanityIntegration';
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
  imageUrl: string | null;
  imageDimensions: ImageDimensions | null;
};

export type MainTimelineAudio = MainTimelineItemBase & {
  _type: 'audioAsset';
  title: string;
  description: string | null;
  audioUrl: string | null;
};

export type MainTimelineNewsletter = MainTimelineItemBase & {
  _type: 'newsletter';
  title: string;
  content: string;
  imageUrl: string | null;
  imageDimensions: ImageDimensions | null;
};

export type MainTimelineEvent = MainTimelineItemBase & {
  _type: 'event';
  title: string;
  description: string;
  link: string;
  imageUrl: string | null;
  imageDimensions: ImageDimensions | null;
};

export type MainTimelineItem =
  | MainTimelineImage
  | MainTimelineAudio
  | MainTimelineNewsletter
  | MainTimelineEvent;

const MAIN_TIMELINE_QUERY = `(
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
        "imageUrl": image.asset->url,
        "imageDimensions": image.asset->metadata.dimensions{width, height, aspectRatio}
      },
      _type == "audioAsset" => {
        title,
        description,
        "audioUrl": audio.asset->url
      },
      _type == "newsletter" => {
        title,
        content,
        "imageUrl": image.asset->url,
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
    "imageUrl": image.asset->url,
    "imageDimensions": image.asset->metadata.dimensions{width, height, aspectRatio}
  }
) | order(date asc)`;

export async function fetchMainTimeline(): Promise<MainTimelineItem[]> {
  const response = await fetch(getApiUrl(MAIN_TIMELINE_QUERY));
  if (!response.ok) {
    throw new Error(`Failed to fetch main timeline: ${response.status}`);
  }
  const data: SanityResponse<MainTimelineItem[]> = await response.json();
  return data.result ?? [];
}
