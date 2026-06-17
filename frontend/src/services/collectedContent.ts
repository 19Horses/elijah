import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { DEFAULT_COLOUR } from './userColor';
import type { CollectedItem } from './collectItem';

export type Collector = {
  colour: string;
  collectedAt: string;
};

export type CollectorGroup = {
  id: string;
  collectors: Collector[];
};

export async function getAllCollectors(): Promise<CollectorGroup[]> {
  const usersRef = collection(db, 'users');
  const snapshot = await getDocs(usersRef);

  const groups = new Map<string, Collector[]>();

  snapshot.forEach((userDoc) => {
    const data = userDoc.data();
    const colour =
      typeof data.colour === 'string' && data.colour
        ? data.colour
        : DEFAULT_COLOUR;
    const collectedItems =
      (data.collectedItems as CollectedItem[] | undefined) ?? [];

    collectedItems.forEach((item) => {
      if (!item?.id) return;
      const collectors = groups.get(item.id) ?? [];
      collectors.push({ colour, collectedAt: item.collectedAt });
      groups.set(item.id, collectors);
    });
  });

  return Array.from(groups.entries()).map(([id, collectors]) => ({
    id,
    collectors,
  }));
}
