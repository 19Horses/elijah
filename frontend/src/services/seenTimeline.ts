import { arrayUnion, doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { getStoredUser } from './userStorage';

// Content ids on the main timeline the signed-in user has opened. Missing on
// the user doc means the feature hasn't baseline-seeded yet for them.
export async function getOrSeedSeenTimelineIds(
  baselineIds: string[]
): Promise<string[]> {
  const user = getStoredUser();
  if (!user) {
    return [];
  }

  const userRef = doc(db, 'users', user.id);
  const snapshot = await getDoc(userRef);
  if (!snapshot.exists()) {
    return [];
  }

  const data = snapshot.data();
  if (Array.isArray(data.seenTimelineIds)) {
    return data.seenTimelineIds.filter(
      (id): id is string => typeof id === 'string' && id.length > 0
    );
  }

  // First visit after this field exists: treat everything currently on the
  // main timeline as already seen so only later additions show as new.
  await updateDoc(userRef, { seenTimelineIds: baselineIds });
  return baselineIds;
}

export async function markTimelineSeen(contentId: string): Promise<void> {
  const user = getStoredUser();
  if (!user || !contentId) {
    return;
  }

  await updateDoc(doc(db, 'users', user.id), {
    seenTimelineIds: arrayUnion(contentId),
  });
}
