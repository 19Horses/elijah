import type { Collection } from '../queries/collection';

const OVERRIDE_KEY = 'elijah:debug:expiryOverrides';
export const DEBUG_TIMERS_EVENT = 'elijah:debug:timers-changed';

type OverrideMap = Record<string, string>;

function readOverrides(): OverrideMap {
  const raw = localStorage.getItem(OVERRIDE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as OverrideMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeOverrides(overrides: OverrideMap): void {
  localStorage.setItem(OVERRIDE_KEY, JSON.stringify(overrides));
  window.dispatchEvent(new Event(DEBUG_TIMERS_EVENT));
}

export function getExpiryOverride(collectionId: string): string | null {
  return readOverrides()[collectionId] ?? null;
}

/**
 * The expiry the countdown should actually use — the debug override if one is
 * set, otherwise the collection's real expiry.
 */
export function getEffectiveExpiresAt(collection: Collection): string | null {
  return getExpiryOverride(collection._id) ?? collection.expiresAt;
}

/**
 * Resets the collection's elapsed time to 0: the countdown restarts from its
 * full original length (expiresAt - created_at) starting now.
 */
export function resetCollectionTimer(collection: Collection): void {
  if (!collection.expiresAt) return;

  const fullDuration =
    new Date(collection.expiresAt).getTime() -
    new Date(collection.created_at).getTime();
  if (!Number.isFinite(fullDuration) || fullDuration <= 0) return;

  const overrides = readOverrides();
  overrides[collection._id] = new Date(Date.now() + fullDuration).toISOString();
  writeOverrides(overrides);
}

export function clearCollectionTimer(collection: Collection): void {
  const overrides = readOverrides();
  if (!(collection._id in overrides)) return;
  delete overrides[collection._id];
  writeOverrides(overrides);
}
