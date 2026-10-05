import musicIcon from '../assets/icons/music.svg';
import newsIcon from '../assets/icons/news.svg';
import photoIcon from '../assets/icons/photo.svg';
import videoIcon from '../assets/icons/video.svg';
import type { ContentType } from '../types/content';

type IconType = ContentType | 'video';

export const CONTENT_TYPE_ICONS: Partial<Record<IconType, string>> = {
  audioAsset: musicIcon,
  newsletter: newsIcon,
  imageAsset: photoIcon,
  video: videoIcon,
};

export const CONTENT_TYPE_ICON_SCALE: Partial<Record<IconType, number>> = {
  newsletter: 1.2,
};

type ContentTypeIconProps = {
  type: IconType;
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
      style={
        {
          '--content-type-icon': `url("${icon}")`,
          '--content-type-icon-scale': CONTENT_TYPE_ICON_SCALE[type] ?? 1,
        } as React.CSSProperties
      }
      aria-hidden="true"
    />
  );
}

export default ContentTypeIcon;
