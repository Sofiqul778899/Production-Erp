import { initializeApp } from 'firebase/app';
import { getFirestore, getDocFromServer, doc } from 'firebase/firestore';
import { getAnalytics } from "firebase/analytics";
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const analytics = typeof window !== 'undefined' ? getAnalytics(app) : null;
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration. ");
    }
  }
}
testConnection();
