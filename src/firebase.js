// src/firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Firebase configuration (жёстко прописан)
const firebaseConfig = {
    apiKey: "AIzaSyB_ZrFNbeBe67bLB2frmWIkLN7l0XAdkDw",
    authDomain: "macarons-box-builder-2025.firebaseapp.com",
    projectId: "macarons-box-builder-2025",
    storageBucket: "macarons-box-builder-2025.firebasestorage.app",
    messagingSenderId: "295504760743",
    appId: "1:295504760743:web:cc51d7a77e54a3866f3082"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const storage = getStorage(app);
