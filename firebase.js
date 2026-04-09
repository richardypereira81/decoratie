// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyC1slI4C0WY7nlpqK5JCiUaCZP3TaCT4no",
  authDomain: "decoratie-38ba6.firebaseapp.com",
  projectId: "decoratie-38ba6",
  storageBucket: "decoratie-38ba6.firebasestorage.app",
  messagingSenderId: "594995445590",
  appId: "1:594995445590:web:dc8711e051715e6c6660f7",
  measurementId: "G-T2BETS4HM1",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
