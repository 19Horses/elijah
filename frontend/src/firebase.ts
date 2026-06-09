import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyDyKVykfnSlOjTzKyAB-t3N3BlKCeVY3LA',
  authDomain: 'elijah-42553.firebaseapp.com',
  projectId: 'elijah-42553',
  storageBucket: 'elijah-42553.firebasestorage.app',
  messagingSenderId: '899673750858',
  appId: '1:899673750858:web:6c410dcba984b4f2ca55b3',
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
