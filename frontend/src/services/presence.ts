import { collection, doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { muteColour } from '../constants/pickerColors';
import { db } from '../firebase';
import { DEFAULT_COLOUR } from './userColor';
import { getStoredUser } from './userStorage';

// How often a viewer re-stamps the item they're viewing, and how long a stamp
// counts for — so someone who closed the tab without clearing it drops off.
export const VIEWING_HEARTBEAT_MS = 20_000;
const VIEWING_STALE_MS = 60_000;

export type ItemViewer = {
  userId: string;
  username: string;
  colour: string;
};

// Marks the signed-in user as viewing the item with `slug` (null: nothing).
// Does nothing when no one is signed in.
export async function setViewing(slug: string | null): Promise<void> {
  const user = getStoredUser();
  if (!user) return;
  await updateDoc(doc(db, 'users', user.id), {
    viewing: slug ? { slug, at: Date.now() } : null,
  });
}

// Calls `onChange` with who's currently viewing each item (by slug) whenever
// anyone starts or stops viewing one. Returns the unsubscribe.
export function subscribeToViewers(
  onChange: (viewers: Map<string, ItemViewer[]>) => void
): () => void {
  let latest: { id: string; data: Record<string, unknown> }[] = [];
  const publish = () => {
    const now = Date.now();
    const viewers = new Map<string, ItemViewer[]>();
    latest.forEach((userDoc) => {
      const { data } = userDoc;
      const viewing = data.viewing as { slug?: string; at?: number } | null;
      if (
        !viewing?.slug ||
        typeof viewing.at !== 'number' ||
        now - viewing.at > VIEWING_STALE_MS
      ) {
        return;
      }
      const list = viewers.get(viewing.slug) ?? [];
      list.push({
        userId: userDoc.id,
        username:
          typeof data.username === 'string' ? data.username : 'Anonymous',
        colour: muteColour(
          typeof data.colour === 'string' && data.colour
            ? data.colour
            : DEFAULT_COLOUR
        ),
      });
      viewers.set(viewing.slug, list);
    });
    onChange(viewers);
  };
  const unsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
    latest = snapshot.docs.map((userDoc) => ({
      id: userDoc.id,
      data: userDoc.data(),
    }));
    publish();
  });
  // Re-check now and then, so a stamp that's gone stale drops off even when
  // nothing else changes.
  const interval = window.setInterval(publish, VIEWING_HEARTBEAT_MS);
  return () => {
    unsubscribe();
    window.clearInterval(interval);
  };
}
