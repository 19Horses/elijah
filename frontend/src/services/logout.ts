import {
  applySelectionColour,
  clearStoredColour,
  DEFAULT_COLOUR,
} from './userColor';
import { clearStoredUser } from './userStorage';

export function logout(): void {
  clearStoredUser();
  clearStoredColour();
  applySelectionColour(DEFAULT_COLOUR);
}
