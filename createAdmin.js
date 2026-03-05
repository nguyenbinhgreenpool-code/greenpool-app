

// Since we can't reliably use admin SDK without a service account key here, we'll try to just log the user in via client SDK by signing them up and immediately creating their Firestore doc with ADMIN role.
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

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db = firebase.firestore();

async function createAdmin() {
    try {
        const email = 'nguyenbinhgreenpool@gmail.com';
        const password = '12345678'; // Default password
        const name = 'Admin Nguyen Binh';
        
        console.log(`Creating user ${email}...`);
        try {
            const cred = await auth.createUserWithEmailAndPassword(email, password);
            console.log("Firebase Auth User created:", cred.user.uid);
            
            await db.collection('users').doc(cred.user.uid).set({
                email: email,
                name: name,
                role: 'ADMIN',
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            console.log("Successfully added ADMIN role to Firestore.");
        } catch (authError) {
             if (authError.code === 'auth/email-already-in-use') {
                 console.log("User already exists in Auth. Updating role...");
                 // Need to find UID, sign in to get it
                 const cred = await auth.signInWithEmailAndPassword(email, password);
                 await db.collection('users').doc(cred.user.uid).set({
                    email: email,
                    name: name,
                    role: 'ADMIN',
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
                console.log("Successfully updated existing user to ADMIN.");
             } else {
                 throw authError;
             }
        }
        
        process.exit(0);
    } catch (e) {
        console.error('Error creating admin:', e);
        process.exit(1);
    }
}

createAdmin();
