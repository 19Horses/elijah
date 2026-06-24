import type { ImageDimensions } from '../queries/products';

export type ContentType = 'imageAsset' | 'audioAsset' | 'newsletter' | 'event';

export type ContentBase = {
  _id: string;
  _type: ContentType;
  title: string;
  slug: string | null;
  created_at: string;
};

export type WithOptionalDate = {
  date: string | null;
};

export type WithOptionalImage = {
  imageUrl: string | null;
  imageDimensions: ImageDimensions | null;
};

export type GalleryImage = {
  url: string | null;
  dimensions: ImageDimensions | null;
  isCover: boolean | null;
};

export type ImageAsset = ContentBase &
  WithOptionalDate &
  WithOptionalImage & {
    _type: 'imageAsset';
    description: string | null;
    images?: GalleryImage[] | null;
  };

export type AudioAsset = ContentBase &
  WithOptionalDate &
  WithOptionalImage & {
    _type: 'audioAsset';
    description: string | null;
    audioUrl: string | null;
  };

export type Newsletter = ContentBase &
  WithOptionalDate &
  WithOptionalImage & {
    _type: 'newsletter';
    content: string;
  };

export type Event = ContentBase &
  WithOptionalDate &
  WithOptionalImage & {
    _type: 'event';
    description: string;
    link: string;
  };

export type MediaAsset = ImageAsset | AudioAsset;

export type ContentItem = MediaAsset | Newsletter | Event;

// Collection documents only reference these types.
export type CollectionContent = MediaAsset | Newsletter;
