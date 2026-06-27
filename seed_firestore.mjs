// seed_firestore.mjs — one-time loader: writes all leads into Firestore.
// Authenticates with the shared team account (public config + team password), so it
// needs NO service-account secret, and the lead data never enters the public repo.
//
// Setup:  npm install firebase
// Config: create firebase-config.json (gitignored) with:
//   { "firebase": { ...your web config... },
//     "email": "equipo@1000ventas.app", "password": "1000ventas" }
// Run:    node seed_firestore.mjs
import { readFileSync } from 'fs';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, writeBatch, serverTimestamp } from 'firebase/firestore';

const cfg = JSON.parse(readFileSync(new URL('./firebase-config.json', import.meta.url)));
const data = JSON.parse(readFileSync(new URL('./leads-normalized.json', import.meta.url)));
const leads = data.leads;

const app = initializeApp(cfg.firebase);
const auth = getAuth(app);
const db = getFirestore(app);

console.log('Signing in as', cfg.email, '…');
await signInWithEmailAndPassword(auth, cfg.email, cfg.password);
console.log('OK. Seeding', leads.length, 'leads…');

// Catalog = business info (safe to re-write any time). Tracking = call progress
// (only written on the initial load, never overwritten afterwards).
const CATALOG_FIELDS = ['nombre','contacto','sector','ciudad','provincia','telefono','telefonoRaw','wa',
  'telefonos','email','mapsUrl','rating','reviews','score','prio','notasOrigen','origen'];
const TRACKING_FIELDS = ['estado','fechaReunion','horaReunion','gestionadoPor','notas'];

// SEED_MODE=catalog → only update catalog fields, preserving everyone's progress.
const CATALOG_ONLY = process.env.SEED_MODE === 'catalog';
const FIELDS = CATALOG_ONLY ? CATALOG_FIELDS : [...CATALOG_FIELDS, ...TRACKING_FIELDS];
console.log(CATALOG_ONLY ? 'Mode: CATALOG (progreso intacto)' : 'Mode: FULL (carga inicial, estado→pendiente)');

const CHUNK = 450;
let written = 0;
for (let i = 0; i < leads.length; i += CHUNK) {
  const batch = writeBatch(db);
  for (const l of leads.slice(i, i + CHUNK)) {
    const ref = doc(db, 'leads', l.extId);
    const out = {};
    for (const f of FIELDS) out[f] = l[f] !== undefined ? l[f] : null;
    out.actualizadoEn = serverTimestamp();
    if (!CATALOG_ONLY) out.creadoEn = serverTimestamp();
    batch.set(ref, out, { merge: true });
  }
  await batch.commit();
  written += Math.min(CHUNK, leads.length - i);
  console.log('  …', written, '/', leads.length);
}
console.log('Done. Seeded', written, 'leads into Firestore.');
process.exit(0);
