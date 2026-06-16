import { useQuery } from '@tanstack/react-query';
import { getApiUrl } from '../sanityIntegration';
import type { CollectionContent } from '../types/content';

type SanityResponse<T> = {
  result: T;
};

export type { CollectionContent };

export type Collection = {
  _id: string;
  name: string;
  description: string | null;
  expiresAt: string | null;
  unlockTime: string | null;
  created_at: string;
  content: CollectionContent[] | null;
};

const COLLECTIONS_QUERY = `*[_type == "collection" && expiresAt > now()] | order(_createdAt desc) {
  _id,
  name,
  description,
  expiresAt,
  unlockTime,
  "created_at": _createdAt,
  content[]->{
    _id,
    _type,
    "created_at": _createdAt,
    _type == "newsletter" => {
      title,
      content,
      "imageUrl": image.asset->url,
      "imageDimensions": image.asset->metadata.dimensions{width, height, aspectRatio}
    },
    _type in ["imageAsset", "audioAsset"] => {
      title,
      description,
      "imageUrl": image.asset->url,
      "imageDimensions": image.asset->metadata.dimensions{width, height, aspectRatio},
      "audioUrl": audio.asset->url
    }
  }
}`;

export async function fetchCollections(): Promise<Collection[]> {
  const response = await fetch(getApiUrl(COLLECTIONS_QUERY));
  if (!response.ok) {
    throw new Error(`Failed to fetch collections: ${response.status}`);
  }
  const data: SanityResponse<Collection[]> = await response.json();
  return data.result ?? [];
}

export function useCollections() {
  return useQuery({
    queryKey: ['collections'],
    queryFn: fetchCollections,
  });
}
