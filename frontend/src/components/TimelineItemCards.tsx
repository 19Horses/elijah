import { getContentTypeKicker } from '../constants/contentTypes';
import {
  getMainTimelineImageUrl,
  type MainTimelineItem,
} from '../queries/mainTimeline';
import { formatFullDate } from '../utils/formatDate';
import { hasRichText } from '../utils/richText';
import RichText from './RichText';

export type TimelineItemCardEntry = {
  content: MainTimelineItem;
  // Shown as a smaller card (a main timeline item the timeline passes
  // through).
  compact: boolean;
  // When the timeline's owner collected it, for a collected item.
  collectedAt?: string;
};

type TimelineItemCardsProps = {
  entries: TimelineItemCardEntry[];
  // Opens the item, as clicking it on the map would.
  onOpen: (contentId: string) => void;
  // The item (by content id) whose card is hovered, or null.
  onHover: (contentId: string | null) => void;
};

const timeOf = (content: MainTimelineItem) =>
  content.date ? new Date(content.date).getTime() : 0;

// A card for each item in the timeline being viewed, oldest first, in the
// column the collection boxes otherwise fill: the picture over its details,
// or for a main timeline item, a smaller card with them side by side.
function TimelineItemCards({
  entries,
  onOpen,
  onHover,
}: TimelineItemCardsProps) {
  const ordered = [...entries].sort(
    (a, b) => timeOf(a.content) - timeOf(b.content)
  );
  return (
    <>
      {ordered.map(({ content, compact, collectedAt }, index) => {
        const imageUrl = getMainTimelineImageUrl(content);
        const kind = getContentTypeKicker(content._type);
        const collectedLabel =
          !compact && collectedAt
            ? formatFullDate(new Date(collectedAt).getTime())
            : '';
        return (
          <button
            key={content._id}
            type="button"
            className={`timeline-item-card${
              compact ? ' timeline-item-card--compact' : ''
            }`}
            style={{ '--card-index': index } as React.CSSProperties}
            onClick={() => onOpen(content._id)}
            onMouseEnter={() => onHover(content._id)}
            onMouseLeave={() => onHover(null)}
          >
            {collectedLabel && (
              <span className="timeline-item-card__date timeline-item-card__collected">
                Collected {collectedLabel}
              </span>
            )}
            {imageUrl && (
              <img
                className="timeline-item-card__image"
                src={imageUrl}
                alt=""
              />
            )}
            <span className="timeline-item-card__body">
              <span className="timeline-item-card__title">{content.title}</span>
              {kind && <span className="timeline-item-card__kind">{kind}</span>}
              {content.date && (
                <span className="timeline-item-card__date">
                  {formatFullDate(timeOf(content))}
                </span>
              )}
              {/* Collected items carry their description; the main timeline's
                  smaller cards don't. */}
              {!compact &&
                'description' in content &&
                hasRichText(content.description) && (
                  <span className="timeline-item-card__description">
                    <RichText value={content.description} />
                  </span>
                )}
            </span>
          </button>
        );
      })}
    </>
  );
}

export default TimelineItemCards;
