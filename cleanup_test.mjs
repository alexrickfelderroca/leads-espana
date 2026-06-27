// cleanup_test.mjs — surgically clears leftover TEST tracking data only.
// Finds leads that carry any progress (estado!=pendiente, or a caller/meeting/note)
// and resets just those to a clean pendiente state. Aborts if >10 are found
// (that would indicate real team progress, not test artifacts).
import { readFileSync } from 'fs';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, doc, updateDoc, serverTimestamp } from 'firebase/firestore';

const cfg = JSON.parse(readFileSync(new URL('./firebase-config.json', import.meta.url)));
const app = initializeApp(cfg.firebase);
const auth = getAuth(app);
const db = getFirestore(app);

await signInWithEmailAndPassword(auth, cfg.email, cfg.password);
const snap = await getDocs(collection(db, 'leads'));
const dirty = [];
snap.forEach(d => {
  const x = d.data();
  if ((x.estado && x.estado !== 'pendiente') || x.gestionadoPor || x.fechaReunion || x.horaReunion || x.notas) {
    dirty.push({ id: d.id, nombre: x.nombre, estado: x.estado, por: x.gestionadoPor });
  }
});
console.log('Leads with tracking data:', dirty.length);
dirty.forEach(d => console.log('  -', d.nombre, '| estado:', d.estado, '| por:', d.por));

if (dirty.length > 10) {
  console.log('ABORT: more than 10 leads have progress — looks like real data, not test artifacts. No changes made.');
  process.exit(1);
}
for (const d of dirty) {
  await updateDoc(doc(db, 'leads', d.id), {
    estado: 'pendiente', gestionadoPor: '', fechaReunion: null, horaReunion: null, notas: '',
    actualizadoEn: serverTimestamp()
  });
}
console.log('Cleaned', dirty.length, 'lead(s) to a pristine pendiente state.');
process.exit(0);
