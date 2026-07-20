import {
  createImageUrlBuilder,
  type SanityImageSource,
} from '@sanity/image-url';

const projectId = '8l62ppj0';
const dataset = 'production';

export const SANITY_URL = `https://${projectId}.apicdn.sanity.io/v2025-06-01`;

const imageBuilder = createImageUrlBuilder({ projectId, dataset });

export function urlFor(source: SanityImageSource) {
  return imageBuilder.image(source);
}

export function getSanityImageUrl(
  source: SanityImageSource,
  width: number,
  height?: number
): string {
  let builder = urlFor(source).width(width).auto('format').quality(80);
  if (height) {
    builder = builder.height(height);
  }
  return builder.url();
}

export const getApiUrl = (
  query: string,
  params: Record<string, unknown> = {}
) => {
  const url = new URL(`${SANITY_URL}/data/query/production`);
  url.searchParams.set('query', query);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(`$${key}`, JSON.stringify(value));
  }
  return url.toString();
};

type ImageOptions = {
  width: number;
  height?: number;
  quality?: number;
  fit?: 'crop' | 'clip' | 'fill' | 'fillmax' | 'max' | 'scale' | 'min';
};

export function optimizeSanityImage(
  url: string,
  { width, height, quality = 80, fit }: ImageOptions
): string {
  const params = new URLSearchParams({
    w: String(width),
    q: String(quality),
    auto: 'format',
  });
  if (height) {
    params.set('h', String(height));
  }
  if (fit) {
    params.set('fit', fit);
  }
  return `${url}?${params.toString()}`;
}

export function buildSanityImageSrcSet(
  url: string,
  options: ImageOptions,
  densities: number[] = [1, 2]
): string {
  return densities
    .map((dpr) => {
      const optimized = optimizeSanityImage(url, {
        ...options,
        width: Math.round(options.width * dpr),
        height: options.height ? Math.round(options.height * dpr) : undefined,
      });
      return `${optimized} ${dpr}x`;
    })
    .join(', ');
}
