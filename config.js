// config.js — app configuration.
// After creating your Firebase project, paste its web config object into `firebase`
// below (Project settings → General → Your apps → SDK setup → Config).
// While `firebase` is null the app runs in LOCAL DEMO mode (no sync, demo data) so it
// can be previewed without a backend.
window.APP_CONFIG = {
  firebase: {
    apiKey: "AIzaSyCnZtHOZ-DuKL2NWPWgEntfXTaJB3cIa-M",
    authDomain: "ventas-72cd1.firebaseapp.com",
    projectId: "ventas-72cd1",
    storageBucket: "ventas-72cd1.firebasestorage.app",
    messagingSenderId: "1013594018986",
    appId: "1:1013594018986:web:5ca3a61ac9107b2f122cd3"
  },
  sharedEmail: "equipo@1000ventas.app", // the shared team account (created in Firebase Auth)
  mockPassword: "1000ventas"            // only used in LOCAL DEMO mode
};
