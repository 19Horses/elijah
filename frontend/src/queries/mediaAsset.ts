import { useQuery } from '@tanstack/react-query';
import { getApiUrl } from '../sanityIntegration';
import { getMyCollectedIds } from '../services/collectItem';
export type { MediaAsset } from '../types/content';
import type { MediaAsset } from '../types/content';

type SanityResponse<T> = {
  result: T;
};

const MEDIA_ASSETS_QUERY = `*[
  _type in ["imageAsset", "audioAsset"]
] | order(_createdAt desc) {
  _id,
  _type,
  title,
  "slug": slug.current,
  description,
  "created_at": _createdAt,
  public,
  "isPrivate": public == false && !(_id in $collectedIds),
  ...coalesce(images[isCover == true][0], images[0], image){
    "imageUrl": asset->url,
    "imageDimensions": asset->metadata.dimensions{width, height, aspectRatio}
  },
  "audioUrl": audio.asset->url
}`;

export async function fetchMediaAssets(): Promise<MediaAsset[]> {
  const collectedIds = await getMyCollectedIds();
  const response = await fetch(getApiUrl(MEDIA_ASSETS_QUERY, { collectedIds }));
  if (!response.ok) {
    throw new Error(`Failed to fetch media assets: ${response.status}`);
  }
  const data: SanityResponse<MediaAsset[]> = await response.json();
  return data.result ?? [];
}

export function useMediaAssets() {
  return useQuery({
    queryKey: ['mediaAssets'],
    queryFn: fetchMediaAssets,
  });
}
