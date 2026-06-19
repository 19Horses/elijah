const STORAGE_KEY = 'elijah:user';

export type StoredUser = {
  id: string;
  email: string;
  username: string;
};

export function storeUser(user: StoredUser): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
}

export function getStoredUser(): StoredUser | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as StoredUser;
    if (parsed.id && parsed.email && parsed.username) {
      return parsed;
    }
  } catch {
    return null;
  }

  return null;
}

export function clearStoredUser(): void {
  localStorage.removeItem(STORAGE_KEY);
}
