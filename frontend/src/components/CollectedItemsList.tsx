import {
  useEffect,
  type CSSProperties,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getContentTypeLabel } from '../constants/contentTypes';
import { fetchContentByIds } from '../queries/collectedContent';
import { formatMainTimelineDate } from '../queries/mainTimeline';
import { getCollectedItems } from '../services/collectItem';
import { getStoredUser } from '../services/userStorage';

type CollectedListItem = {
  id: string;
  title: string;
  typeLabel: string;
  dateLabel: string;
  collectedAt: string;
};

async function fetchMyCollectedItems(): Promise<CollectedListItem[]> {
  const user = getStoredUser();
  if (!user) return [];

  const collected = await getCollectedItems(user.id);
  const content = await fetchContentByIds(collected.map((item) => item.id));
  const contentById = new Map(content.map((item) => [item._id, item]));

  return collected
    .map((item) => {
      const matched = contentById.get(item.id);
      if (!matched) return null;
      return {
        id: item.id,
        title: matched.title,
        typeLabel: getContentTypeLabel(matched._type),
        dateLabel: formatMainTimelineDate(matched.date),
        collectedAt: item.collectedAt,
      };
    })
    .filter((item): item is CollectedListItem => item !== null)
    .sort(
      (a, b) =>
        new Date(b.collectedAt).getTime() - new Date(a.collectedAt).getTime()
    );
}

type CollectedItemsListProps = {
  onItemHover?: Dispatch<SetStateAction<string | null>>;
  focusContentIdControlRef?: MutableRefObject<
    ((contentId: string) => void) | undefined
  >;
};

function CollectedItemsList({
  onItemHover,
  focusContentIdControlRef,
}: CollectedItemsListProps) {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['myCollectedItems'],
    queryFn: fetchMyCollectedItems,
  });

  useEffect(() => {
    return () => onItemHover?.(null);
  }, [onItemHover]);

  if (isLoading) {
    return (
      <div className="collected-items-list collected-items-list--empty">
        Loading…
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="collected-items-list collected-items-list--empty">
        Nothing collected yet.
      </div>
    );
  }

  return (
    <ul className="collected-items-list">
      {data.map((item, index) => (
        <li
          key={item.id}
          className="collected-items-list__item"
          style={{ '--row-index': index } as CSSProperties}
        >
          <span className="collected-items-list__date">{item.dateLabel}</span>
          <span
            className="collected-items-list__title"
            onMouseEnter={() => onItemHover?.(item.id)}
            onMouseLeave={() =>
              onItemHover?.((current) => (current === item.id ? null : current))
            }
            onClick={() => {
              focusContentIdControlRef?.current?.(item.id);
              navigate('/home');
            }}
          >
            {item.title}
          </span>
          <span className="collected-items-list__type">{item.typeLabel}</span>
        </li>
      ))}
    </ul>
  );
}

export default CollectedItemsList;
