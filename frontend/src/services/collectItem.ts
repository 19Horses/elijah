import { arrayUnion, doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { getStoredUser } from './userStorage';

export type CollectedItem = {
  id: string;
  collectedAt: string;
  collectedFrom: string;
};

export async function getCollectedItems(
  userId: string
): Promise<CollectedItem[]> {
  const userRef = doc(db, 'users', userId);
  const snapshot = await getDoc(userRef);
  if (!snapshot.exists()) return [];

  return (snapshot.data().collectedItems as CollectedItem[] | undefined) ?? [];
}

// Ids of content the current (locally stored) user has collected, used to
// let non-public assets through the visibility filter in content queries.
export async function getMyCollectedIds(): Promise<string[]> {
  const user = getStoredUser();
  if (!user) return [];

  const items = await getCollectedItems(user.id);
  return items.map((item) => item.id);
}

export async function hasCollectedFrom(
  userId: string,
  collectionId: string
): Promise<boolean> {
  const collectedItems = await getCollectedItems(userId);
  return collectedItems.some((item) => item.collectedFrom === collectionId);
}

export async function collectItem(
  userId: string,
  contentId: string,
  collectionId: string
): Promise<void> {
  const userRef = doc(db, 'users', userId);
  const item: CollectedItem = {
    id: contentId,
    collectedAt: new Date().toISOString(),
    collectedFrom: collectionId,
  };
  await updateDoc(userRef, {
    collectedItems: arrayUnion(item),
  });
}
