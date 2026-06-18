import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { DEFAULT_COLOUR } from './userColor';
import type { CollectedItem } from './collectItem';

export type UserCollection = {
  userId: string;
  username: string;
  colour: string;
  items: CollectedItem[];
};

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
