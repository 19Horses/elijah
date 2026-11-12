import type { ImageDimensions } from '../queries/products';
import type { RichTextValue } from '../utils/richText';

export type ContentType =
  | 'imageAsset'
  | 'audioAsset'
  | 'videoAsset'
  | 'newsletter'
  | 'event';

export type ContentBase = {
  _id: string;
  _type: ContentType;
  title: string;
  slug: string | null;
  created_at: string;
  public: boolean;
  // Whether this item should render as private (not public, and not
  // collected by the current viewer) — computed server-side per viewer.
  isPrivate: boolean;
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
    description: RichTextValue;
    images?: GalleryImage[] | null;
  };

export type AudioAsset = ContentBase &
  WithOptionalDate &
  WithOptionalImage & {
    _type: 'audioAsset';
    description: RichTextValue;
    audioUrl: string | null;
  };

// `imageUrl` is the poster image; the video itself lives in S3 at `videoKey`.
export type VideoAsset = ContentBase &
  WithOptionalDate &
  WithOptionalImage & {
    _type: 'videoAsset';
    description: string | null;
    videoKey: string | null;
  };

export type Newsletter = ContentBase &
  WithOptionalDate &
  WithOptionalImage & {
    _type: 'newsletter';
    content: RichTextValue;
  };

export type Event = ContentBase &
  WithOptionalDate &
  WithOptionalImage & {
    _type: 'event';
    description: RichTextValue;
    link: string;
  };

export type MediaAsset = ImageAsset | AudioAsset;

export type ContentItem = MediaAsset | VideoAsset | Newsletter | Event;

// Collection documents only reference these types.
export type CollectionContent = MediaAsset | VideoAsset | Newsletter;
