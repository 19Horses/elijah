import { deleteUser } from './deleteUser';
import {
  applySelectionColour,
  clearStoredColour,
  DEFAULT_COLOUR,
} from './userColor';
import { clearStoredUser, getStoredUser } from './userStorage';

export async function resetUserSession(): Promise<void> {
  const user = getStoredUser();

  if (user) {
    await deleteUser(user.id);
  }

  clearStoredUser();
  clearStoredColour();
  applySelectionColour(DEFAULT_COLOUR);
}
