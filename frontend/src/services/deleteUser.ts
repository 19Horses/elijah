import { deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';

export async function deleteUser(userId: string): Promise<void> {
  await deleteDoc(doc(db, 'users', userId));
}
