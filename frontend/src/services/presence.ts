import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { muteColour, randomPickerColour } from '../constants/pickerColors';
import { db } from '../firebase';
import { DEFAULT_COLOUR } from './userColor';
import { getStoredUser } from './userStorage';

// How often a viewer re-stamps the item they're viewing, and how long a stamp
// counts for — so someone who closed the tab without clearing it drops off.
export const VIEWING_HEARTBEAT_MS = 20_000;
const VIEWING_STALE_MS = 60_000;

// Visitors who aren't signed up are tracked in their own collection, under an
// id and palette colour this browser keeps for them.
const VISITOR_STORAGE_KEY = 'elijah:visitor';
const VISITORS_COLLECTION = 'presence';

export type ItemViewer = {
  userId: string;
  username: string;
  colour: string;
  // A visitor who isn't signed up (so has no timeline of their own).
  anonymous?: boolean;
};

type Visitor = { id: string; colour: string };

function getVisitor(): Visitor {
  try {
    const raw = localStorage.getItem(VISITOR_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<Visitor>) : null;
    if (parsed?.id && parsed.colour) {
      return { id: parsed.id, colour: parsed.colour };
    }
  } catch {
    // Unreadable: start afresh below.
  }
  const visitor = {
    id: crypto.randomUUID(),
    colour: randomPickerColour(),
  };
  try {
    localStorage.setItem(VISITOR_STORAGE_KEY, JSON.stringify(visitor));
  } catch {
    // Storage blocked: they get a fresh id and colour each visit.
  }
  return visitor;
}

// Marks this viewer as viewing the item with `slug` (null: nothing) — on their
// user doc when signed in, else on their visitor doc.
export async function setViewing(slug: string | null): Promise<void> {
  const viewing = slug ? { slug, at: Date.now() } : null;
  const user = getStoredUser();
  if (user) {
    await updateDoc(doc(db, 'users', user.id), { viewing });
    return;
  }
  const visitor = getVisitor();
  await setDoc(doc(db, VISITORS_COLLECTION, visitor.id), {
    viewing,
    colour: visitor.colour,
  });
}

type ViewerDoc = { id: string; data: Record<string, unknown> };

// Calls `onChange` with who's currently viewing each item (by slug) whenever
// anyone starts or stops viewing one. Returns the unsubscribe.
export function subscribeToViewers(
  onChange: (viewers: Map<string, ItemViewer[]>) => void
): () => void {
  let users: ViewerDoc[] = [];
  let visitors: ViewerDoc[] = [];
  const publish = () => {
    const now = Date.now();
    const viewers = new Map<string, ItemViewer[]>();
    const add = (viewerDoc: ViewerDoc, anonymous: boolean) => {
      const { data } = viewerDoc;
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
        userId: anonymous ? `visitor:${viewerDoc.id}` : viewerDoc.id,
        username: anonymous
          ? 'Guest'
          : typeof data.username === 'string'
          ? data.username
          : 'Anonymous',
        colour: muteColour(
          typeof data.colour === 'string' && data.colour
            ? data.colour
            : DEFAULT_COLOUR
        ),
        anonymous: anonymous || undefined,
      });
      viewers.set(viewing.slug, list);
    };
    users.forEach((userDoc) => add(userDoc, false));
    visitors.forEach((visitorDoc) => add(visitorDoc, true));
    onChange(viewers);
  };
  const toDocs = (snapshot: {
    docs: { id: string; data: () => Record<string, unknown> }[];
  }) =>
    snapshot.docs.map((viewerDoc) => ({
      id: viewerDoc.id,
      data: viewerDoc.data(),
    }));
  const unsubscribeUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
    users = toDocs(snapshot);
    publish();
  });
  const unsubscribeVisitors = onSnapshot(
    collection(db, VISITORS_COLLECTION),
    (snapshot) => {
      visitors = toDocs(snapshot);
      publish();
    },
    // Without access to visitors, signed-up viewers still show.
    () => undefined
  );
  // Re-check now and then, so a stamp that's gone stale drops off even when
  // nothing else changes.
  const interval = window.setInterval(publish, VIEWING_HEARTBEAT_MS);
  return () => {
    unsubscribeUsers();
    unsubscribeVisitors();
    window.clearInterval(interval);
  };
}
