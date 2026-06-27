// config.js — app configuration.
// After creating your Firebase project, paste its web config object into `firebase`
// below (Project settings → General → Your apps → SDK setup → Config).
// While `firebase` is null the app runs in LOCAL DEMO mode (no sync, demo data) so it
// can be previewed without a backend.
window.APP_CONFIG = {
  firebase: null,
  // firebase: {
  //   apiKey: "…", authDomain: "…", projectId: "…",
  //   storageBucket: "…", messagingSenderId: "…", appId: "…"
  // },
  sharedEmail: "equipo@1000ventas.app", // the shared team account (created in Firebase Auth)
  mockPassword: "1000ventas"            // only used in LOCAL DEMO mode
};
