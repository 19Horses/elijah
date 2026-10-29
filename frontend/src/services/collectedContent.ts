import { collection, getDocs, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { DEFAULT_COLOUR } from './userColor';
import type { CollectedItem } from './collectItem';

export type UserCollection = {
  userId: string;
  username: string;
  colour: string;
  items: CollectedItem[];
};

// Calls `onChange` whenever someone's collected items (or the name or colour
// their timeline is shown with) change — not for the first snapshot, nor for
// other edits to users, such as what they're viewing, nor for this browser's
// own writes, which the collect flow already refreshes after. Returns the
// unsubscribe.
export function subscribeToCollectionChanges(onChange: () => void): () => void {
  let signature: string | null = null;
  return onSnapshot(
    collection(db, 'users'),
    (snapshot) => {
      const next = snapshot.docs
        .map((userDoc) => {
          const data = userDoc.data();
          const items = (
            (data.collectedItems as CollectedItem[] | undefined) ?? []
          )
            .filter((item) => item?.id)
            .map((item) => `${item.id}@${item.collectedAt}`)
            .join(',');
          return items
            ? `${userDoc.id}|${String(data.username)}|${String(
                data.colour
              )}|${items}`
            : '';
        })
        .filter(Boolean)
        .sort()
        .join(';');
      if (
        signature !== null &&
        next !== signature &&
        !snapshot.metadata.hasPendingWrites
      ) {
        onChange();
      }
      signature = next;
    },
    // Without a live feed, the timelines still refresh on focus.
    () => undefined
  );
}

export async function getUserCollections(): Promise<UserCollection[]> {
  const usersRef = collection(db, 'users');
  const snapshot = await getDocs(usersRef);

  const rows: UserCollection[] = [];

  snapshot.forEach((userDoc) => {
    const data = userDoc.data();
    const colour =
      typeof data.colour === 'string' && data.colour
        ? data.colour
        : DEFAULT_COLOUR;
    const username =
      typeof data.username === 'string' ? data.username : 'Anonymous';
    const collectedItems =
      (data.collectedItems as CollectedItem[] | undefined) ?? [];
    const items = collectedItems.filter((item) => item?.id);

    if (items.length === 0) return;

    rows.push({ userId: userDoc.id, username, colour, items });
  });

  return rows;
}
