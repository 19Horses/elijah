import { useQuery } from '@tanstack/react-query';
import { getApiUrl } from '../sanityIntegration';
import { getMyCollectedIds } from '../services/collectItem';
import type { ContentType } from '../types/content';
import { formatMainTimelineDate } from './mainTimeline';

type SanityResponse<T> = {
  result: T;
};

export type ContentDetail = {
  _id: string;
  _type: ContentType;
  title: string;
  slug: string;
  date: string | null;
  description: string | null;
  content: string | null;
  link: string | null;
  // Number of images on an imageAsset (null for other types). A count of 1 (or a
  // legacy single `image` field, which yields null) means a solitary image.
  imageCount: number | null;
};

const CONTENT_BY_SLUG_QUERY = (slug: string) => `*[
  _type in ["imageAsset", "audioAsset", "newsletter", "event"] &&
  slug.current == ${JSON.stringify(slug)} &&
  (public != false || _id in $collectedIds)
][0] {
  _id,
  _type,
  title,
  "slug": slug.current,
  date,
  _type in ["imageAsset", "audioAsset", "event"] => {
    description
  },
  _type == "imageAsset" => {
    "imageCount": count(images)
  },
  _type == "event" => {
    link
  },
  _type == "newsletter" => {
    content
  }
}`;

export async function fetchContentBySlug(slug: string): Promise<ContentDetail> {
  const collectedIds = await getMyCollectedIds();
  const response = await fetch(
    getApiUrl(CONTENT_BY_SLUG_QUERY(slug), { collectedIds })
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch content: ${response.status}`);
  }
  const data: SanityResponse<ContentDetail | null> = await response.json();
  if (!data.result) {
    throw new Error(`Content not found: ${slug}`);
  }
  return data.result;
}

export function useContentDetail(slug: string | null) {
  return useQuery({
    queryKey: ['contentDetail', slug],
    queryFn: () => fetchContentBySlug(slug!),
    enabled: Boolean(slug),
  });
}

export function getContentDetailDescription(detail: ContentDetail): string {
  if (detail._type === 'newsletter') {
    return '';
  }
  return detail.description ?? '';
}

export function getContentDetailLink(detail: ContentDetail): string | null {
  if (detail._type === 'event') {
    return detail.link;
  }
  return null;
}

export function getContentDetailNewsletterContent(
  detail: ContentDetail
): string | null {
  if (detail._type === 'newsletter') {
    return detail.content;
  }
  return null;
}

export function getContentDetailDateLabel(detail: ContentDetail): string {
  return formatMainTimelineDate(detail.date);
}

// A solitary image (no gallery) is presented like a newsletter: the image on
// one side with its description flowing beside it.
export function getContentDetailIsSingleImage(detail: ContentDetail): boolean {
  return detail._type === 'imageAsset' && (detail.imageCount ?? 1) <= 1;
}
