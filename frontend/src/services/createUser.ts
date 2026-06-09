import { addDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';

export type UserRecord = {
  email: string;
  username: string;
  colour: string;
  collectedItems: Record<string, unknown>[];
};

type CreateUserInput = {
  email: string;
  username: string;
  colour: string;
};

type CreateUserResult =
  | { ok: true; id: string; email: string; username: string }
  | { ok: false; error: string };

export async function createUser({
  email,
  username,
  colour,
}: CreateUserInput): Promise<CreateUserResult> {
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedUsername = username.trim();

  const usersRef = collection(db, 'users');

  const [emailMatches, usernameMatches] = await Promise.all([
    getDocs(query(usersRef, where('email', '==', normalizedEmail))),
    getDocs(query(usersRef, where('username', '==', normalizedUsername))),
  ]);

  if (!emailMatches.empty) {
    return { ok: false, error: 'Email already taken.' };
  }

  if (!usernameMatches.empty) {
    return { ok: false, error: 'Username already taken.' };
  }

  const docRef = await addDoc(usersRef, {
    email: normalizedEmail,
    username: normalizedUsername,
    colour,
    collectedItems: [],
  } satisfies UserRecord);

  return {
    ok: true,
    id: docRef.id,
    email: normalizedEmail,
    username: normalizedUsername,
  };
}
