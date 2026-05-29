import { useQuery } from '@tanstack/react-query';
import { getApiUrl } from '../sanityIntegration';
import type { ImageDimensions } from './products';

type SanityResponse<T> = {
  result: T;
};

type ContentFeedItemBase = {
  _id: string;
  created_at: string;
};

export type ContentFeedEvent = ContentFeedItemBase & {
  _type: 'event';
  date: string;
  title: string;
  description: string;
  link: string;
};

export type ContentFeedNewsletter = ContentFeedItemBase & {
  _type: 'newsletter';
  title: string;
  content: string;
};

export type ContentFeedProduct = ContentFeedItemBase & {
  _type: 'product';
  title: string;
  description: string | null;
  price: number | null;
  imageUrl: string | null;
  imageDimensions: ImageDimensions | null;
  stripeBuyButtonId: string | null;
};

export type ContentFeedItem =
  | ContentFeedEvent
  | ContentFeedNewsletter
  | ContentFeedProduct;

const CONTENT_FEED_QUERY = `*[_type in ["event", "newsletter", "product"]] | order(_createdAt desc) {
  _id,
  _type,
  "created_at": _createdAt,
  _type == "event" => {
    date,
    title,
    description,
    link
  },
  _type == "newsletter" => {
    title,
    content
  },
  _type == "product" => {
    title,
    description,
    price,
    "imageUrl": image.asset->url,
    "imageDimensions": image.asset->metadata.dimensions{width, height, aspectRatio},
    stripeBuyButtonId
  }
}`;

export async function fetchContentFeed(): Promise<ContentFeedItem[]> {
  const response = await fetch(getApiUrl(CONTENT_FEED_QUERY));
  if (!response.ok) {
    throw new Error(`Failed to fetch content feed: ${response.status}`);
  }
  const data: SanityResponse<ContentFeedItem[]> = await response.json();
  return data.result ?? [];
}

export function useContentFeed() {
  return useQuery({
    queryKey: ['contentFeed'],
    queryFn: fetchContentFeed,
  });
}
