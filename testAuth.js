const firebase = require('firebase/compat/app');
require('firebase/compat/auth');
require('firebase/compat/firestore');

const firebaseConfig = {
    apiKey: "AIzaSyDLDbXD4ac9zJZ3nm6DRFt09W2iMlDczp4",
    authDomain: "thang-long-swimming-club.firebaseapp.com",
    projectId: "thang-long-swimming-club",
    storageBucket: "thang-long-swimming-club.firebasestorage.app",
    messagingSenderId: "254618493495",
    appId: "1:254618493495:web:492ecaced0f0397bfc15b2"
};

try {
    firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();
    console.log("Auth initialized successfully!");
} catch (e) {
    console.error("Auth init failed:", e);
}
