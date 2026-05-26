const projectId = '8l62ppj0';
export const SANITY_URL = `https://${projectId}.apicdn.sanity.io/v2025-06-01`;

export const getApiUrl = (query: string) =>
  `${SANITY_URL}/data/query/production?query=${encodeURI(query)}`;

type ImageOptions = {
  width: number;
  height?: number;
  quality?: number;
  fit?: 'crop' | 'clip' | 'fill' | 'fillmax' | 'max' | 'scale' | 'min';
};

export function optimizeSanityImage(
  url: string,
  {width, height, quality = 80, fit}: ImageOptions,
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
  densities: number[] = [1, 2],
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
