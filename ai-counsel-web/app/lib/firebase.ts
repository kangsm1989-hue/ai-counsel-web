import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBf-NngwJMvIZr3oC7Remow8Uns4_Aj5N0",
  authDomain: "ai-cousel.firebaseapp.com",
  projectId: "ai-cousel",
  storageBucket: "ai-cousel.firebasestorage.app",
  messagingSenderId: "420613637107",
  appId: "1:420613637107:web:a2a3b2c971938539818886",
  measurementId: "G-3GXDFZSZRY"
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);