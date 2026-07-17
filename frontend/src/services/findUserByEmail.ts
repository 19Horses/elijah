import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import type { UserRecord } from './createUser';

export type ExistingUser = {
  id: string;
  email: string;
  username: string;
  colour: string;
};

// Look up an existing account by email. Returns null when no user has it, so
// the sign-up form can skip the username step and log a returning user in.
export async function findUserByEmail(
  email: string
): Promise<ExistingUser | null> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    return null;
  }

  const usersRef = collection(db, 'users');
  const snapshot = await getDocs(
    query(usersRef, where('email', '==', normalizedEmail), limit(1))
  );

  const match = snapshot.docs[0];
  if (!match) {
    return null;
  }

  const data = match.data() as UserRecord;
  return {
    id: match.id,
    email: data.email,
    username: data.username,
    colour: data.colour,
  };
}
