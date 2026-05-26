import { getApiUrl } from '../sanityIntegration';

export type Product = {
  _id: string;
  title: string;
  description: string | null;
  price: number | null;
  imageUrl: string | null;
  stripeBuyButtonId: string | null;
};

const PRODUCTS_QUERY = `*[_type == "product"] | order(title asc) {
  _id,
  title,
  description,
  price,
  "imageUrl": image.asset->url,
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
