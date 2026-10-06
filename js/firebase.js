// SATU-SATUNYA tempat memuat Firebase JS SDK (dari gstatic, versi dipin di config.js).
// SDK dimuat dinamis: halaman "Belum terhubung" tidak memuat apa pun dari Firebase.
import { FIREBASE_CONFIG, SDK_VERSION } from './config.js';

const DASAR_SDK = `https://www.gstatic.com/firebasejs/${SDK_VERSION}`;
const KUNCI_SESI = { aktif: 'zashaEmu', fs: 'zashaEmuFs', au: 'zashaEmuAu', proj: 'zashaEmuProj' };

function bacaSesi(kunci) {
  try { return sessionStorage.getItem(kunci); } catch { return null; }
}

function tulisSesi(kunci, nilai) {
  try {
    if (nilai === null) sessionStorage.removeItem(kunci);
    else sessionStorage.setItem(kunci, nilai);
  } catch { /* sessionStorage diblokir: mode emulator hanya berlaku lewat URL */ }
}

function portSah(teks, bawaan) {
  const n = Number(teks);
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : bawaan;
}

// Mode emulator hanya di localhost/127.0.0.1 dan hanya bila diminta lewat ?emulator=1 (diingat per tab).
export function bacaModeEmulator() {
  const host = location.hostname;
  if (host !== 'localhost' && host !== '127.0.0.1') return null;
  const q = new URLSearchParams(location.search);
  if (q.get('emulator') === '0') {
    Object.values(KUNCI_SESI).forEach((k) => tulisSesi(k, null));
    return null;
  }
  if (q.get('emulator') === '1') {
    tulisSesi(KUNCI_SESI.aktif, '1');
    tulisSesi(KUNCI_SESI.fs, String(portSah(q.get('fs'), 8080)));
    tulisSesi(KUNCI_SESI.au, String(portSah(q.get('au'), 9099)));
    tulisSesi(KUNCI_SESI.proj, /^[a-z0-9-]{3,40}$/.test(q.get('proj') || '') ? q.get('proj') : 'demo-zasha');
    return {
      host,
      fs: portSah(q.get('fs'), 8080),
      au: portSah(q.get('au'), 9099),
      proyek: bacaSesi(KUNCI_SESI.proj) || 'demo-zasha',
    };
  }
  if (bacaSesi(KUNCI_SESI.aktif) !== '1') return null;
  return {
    host,
    fs: portSah(bacaSesi(KUNCI_SESI.fs), 8080),
    au: portSah(bacaSesi(KUNCI_SESI.au), 9099),
    proyek: bacaSesi(KUNCI_SESI.proj) || 'demo-zasha',
  };
}

// Hasil: null bila belum dikonfigurasi; selain itu { app, auth, db, A (modul auth), F (modul firestore), emulator }.
export async function hubungkanFirebase() {
  const emulator = bacaModeEmulator();
  const config = emulator
    ? { apiKey: 'demo', authDomain: 'localhost', projectId: emulator.proyek }
    : FIREBASE_CONFIG;
  if (!config) return null;

  const [modApp, A, F] = await Promise.all([
    import(`${DASAR_SDK}/firebase-app.js`),
    import(`${DASAR_SDK}/firebase-auth.js`),
    import(`${DASAR_SDK}/firebase-firestore.js`),
  ]);
  const app = modApp.initializeApp(config);
  const auth = A.getAuth(app);
  const db = F.getFirestore(app);
  if (emulator) {
    F.connectFirestoreEmulator(db, emulator.host, emulator.fs);
    A.connectAuthEmulator(auth, `http://${emulator.host}:${emulator.au}`, { disableWarnings: true });
  }
  return { app, auth, db, A, F, emulator };
}
