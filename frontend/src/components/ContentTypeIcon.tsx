import musicIcon from '../assets/icons/music.svg';
import newsIcon from '../assets/icons/news.svg';
import photoIcon from '../assets/icons/photo.svg';
import videoIcon from '../assets/icons/video.svg';
import type { ContentType } from '../types/content';

export const CONTENT_TYPE_ICONS: Partial<
  Record<ContentType | 'video', string>
> = {
  audioAsset: musicIcon,
  newsletter: newsIcon,
  imageAsset: photoIcon,
  video: videoIcon,
};

type ContentTypeIconProps = {
  type: ContentType | 'video';
  className?: string;
};

function ContentTypeIcon({ type, className }: ContentTypeIconProps) {
  const icon = CONTENT_TYPE_ICONS[type];
  if (!icon) {
    return null;
  }
  return (
    <span
      className={`content-type-icon${className ? ` ${className}` : ''}`}
      style={{ '--content-type-icon': `url("${icon}")` } as React.CSSProperties}
      aria-hidden="true"
    />
  );
}

export default ContentTypeIcon;
