import type { Collection } from '../queries/collection';
import { getEffectiveExpiresAt } from '../services/debugTimers';
import { tiltFor } from '../utils/tilt';
import {
  ALREADY_COLLECTED_MAX_TILT_DEG,
  ALREADY_COLLECTED_MIN_TILT_DEG,
} from './timelineCanvas/constants';

type OpenedCollectionCardsProps = {
  // The collections the viewer has already opened (collected from).
  collections: Collection[];
  // Every item the viewer has collected, by content id.
  collectedContentIds: Set<string>;
  // Opens the item collected from a collection, as clicking it on the map
  // would.
  onOpen: (contentId: string) => void;
  // The collected item (by content id) whose collection's card is hovered,
  // or null.
  onHover: (contentId: string | null) => void;
};

// At the foot of the collections column, each collection the viewer has
// already opened, collapsed to a small card: its picture beside its name and
// what they collected from it, standing in for that item (hovering grows it
// on the map; clicking opens it).
function OpenedCollectionCards({
  collections,
  collectedContentIds,
  onOpen,
  onHover,
}: OpenedCollectionCardsProps) {
  const live = collections.filter((collection) => {
    const expiresAt = getEffectiveExpiresAt(collection);
    return expiresAt !== null && new Date(expiresAt).getTime() > Date.now();
  });
  return (
    <>
      {live.map((collection) => {
        const collected = (collection.content ?? []).find((item) =>
          collectedContentIds.has(item._id)
        );
        return (
          <button
            key={collection._id}
            type="button"
            className="timeline-item-card timeline-item-card--compact timeline-item-card--opened"
            disabled={!collected}
            onClick={() => collected && onOpen(collected._id)}
            onMouseEnter={() => collected && onHover(collected._id)}
            onMouseLeave={() => onHover(null)}
          >
            {collection.imageUrl && (
              <span className="timeline-item-card__media">
                <img
                  className="timeline-item-card__image"
                  src={collection.imageUrl}
                  alt=""
                />
                {/* Stuck over its picture, at its own slight angle. */}
                <span
                  className="timeline-item-card__sticker"
                  style={
                    {
                      '--sticker-tilt': `${tiltFor(
                        `${collection._id}:opened`,
                        ALREADY_COLLECTED_MAX_TILT_DEG,
                        ALREADY_COLLECTED_MIN_TILT_DEG
                      )}deg`,
                    } as React.CSSProperties
                  }
                >
                  Already
                  <br />
                  opened
                </span>
              </span>
            )}
            <span className="timeline-item-card__body">
              <span className="timeline-item-card__title">
                {collection.name}
              </span>
              {collected && (
                <span className="timeline-item-card__date">
                  You collected <strong>{collected.title}</strong>
                </span>
              )}
            </span>
          </button>
        );
      })}
    </>
  );
}

export default OpenedCollectionCards;
