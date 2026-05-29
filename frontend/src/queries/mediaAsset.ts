import { useQuery } from '@tanstack/react-query';
import { getApiUrl } from '../sanityIntegration';
import type { ImageDimensions } from './products';

type SanityResponse<T> = {
  result: T;
};

export type MediaAsset = {
  _id: string;
  _type: 'imageAsset' | 'audioAsset';
  title: string;
  description: string | null;
  created_at: string;
  imageUrl: string | null;
  imageDimensions: ImageDimensions | null;
  audioUrl: string | null;
};

const MEDIA_ASSETS_QUERY = `*[_type in ["imageAsset", "audioAsset"]] | order(_createdAt desc) {
  _id,
  _type,
  title,
  description,
  "created_at": _createdAt,
  "imageUrl": image.asset->url,
  "imageDimensions": image.asset->metadata.dimensions{width, height, aspectRatio},
  "audioUrl": audio.asset->url
}`;

export async function fetchMediaAssets(): Promise<MediaAsset[]> {
  const response = await fetch(getApiUrl(MEDIA_ASSETS_QUERY));
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
