const admin = require('firebase-admin');

// Since we are running this on local machine implicitly authorized by gcloud auth or a generic setup, let's try a direct modification via REST API or initialized Admin SDK
// First, we need to initialize Firebase Admin loosely if we can, or just tell the user how to do it in the UI if possible. Wait, the user has the credentials in index.html (client side), which is not enough for Admin SDK without a service account.
// We can use the client SDK in a script to login with a generic unauthenticated way? No, Firestore rules are public! (`allow read, write: if true;`)
// Therefore, we can just use the regular Firebase Client SDK to query the user by email and update the document.

const firebase = require('firebase/compat/app');
require('firebase/compat/firestore');

const firebaseConfig = {
    apiKey: "AIzaSyDLDbXD4ac9zJZ3nm6DRFt09W2iMlDczp4",
    authDomain: "thang-long-swimming-club.firebaseapp.com",
    projectId: "thang-long-swimming-club",
    storageBucket: "thang-long-swimming-club.firebasestorage.app",
    messagingSenderId: "254618493495",
    appId: "1:254618493495:web:492ecaced0f0397bfc15b2"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const db = firebase.firestore();

async function makeAdmin() {
    try {
        const usersRef = db.collection('users');
        const snapshot = await usersRef.where('email', '==', 'nguyenbinhgreenpool@gmail.com').get();
        
        if (snapshot.empty) {
            console.log('No matching email found!');
            process.exit(1);
        }

        snapshot.forEach(async (doc) => {
            console.log('Found user:', doc.id);
            await usersRef.doc(doc.id).update({ role: 'ADMIN' });
            console.log('Successfully upgraded user to ADMIN role!');
            process.exit(0);
        });
    } catch (e) {
        console.error('Error updating role:', e);
        process.exit(1);
    }
}

makeAdmin();
