// ============================================================
// MyAppLabs HQ — Firebase Configuration
// Replace the values below with your Firebase project credentials
// from: Firebase Console > Project Settings > Your Apps > SDK setup
// ============================================================

import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: 'REPLACE_WITH_YOUR_API_KEY',
  authDomain: 'REPLACE_WITH_YOUR_AUTH_DOMAIN',
  projectId: 'REPLACE_WITH_YOUR_PROJECT_ID',
  storageBucket: 'REPLACE_WITH_YOUR_STORAGE_BUCKET',
  messagingSenderId: 'REPLACE_WITH_YOUR_MESSAGING_SENDER_ID',
  appId: 'REPLACE_WITH_YOUR_APP_ID'
}

// Initialize Firebase app (singleton)
const app = initializeApp(firebaseConfig)

// Export auth and firestore instances for use throughout the app
export const auth = getAuth(app)
export const db = getFirestore(app)
export default app
