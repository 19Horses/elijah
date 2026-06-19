import { getApiUrl } from '../sanityIntegration';

export type ImageDimensions = {
  width: number;
  height: number;
  aspectRatio: number;
};

export type Product = {
  _id: string;
  title: string;
  slug: string | null;
  description: string | null;
  price: number | null;
  imageUrl: string | null;
  imageDimensions: ImageDimensions | null;
  stripeBuyButtonId: string | null;
};

const PRODUCTS_QUERY = `*[_type == "product"] | order(title asc) {
  _id,
  title,
  "slug": slug.current,
  description,
  price,
  "imageUrl": image.asset->url,
  "imageDimensions": image.asset->metadata.dimensions{width, height, aspectRatio},
  stripeBuyButtonId
}`;

type SanityResponse<T> = {
  result: T;
};

export async function fetchProducts(): Promise<Product[]> {
  const response = await fetch(getApiUrl(PRODUCTS_QUERY));
  if (!response.ok) {
    throw new Error(`Failed to fetch products: ${response.status}`);
  }
  const data: SanityResponse<Product[]> = await response.json();
  return data.result ?? [];
}
