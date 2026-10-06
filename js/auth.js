// Login Google (popup), peran dari custom claims, keluar.

const PERAN_SAH = ['admin', 'editor', 'pembaca'];

// cb({ status: 'keluar' }) atau cb({ status: 'masuk', user, email, peran, terverifikasi })
export function pantauPengguna(fb, cb, cbGalat) {
  return fb.A.onAuthStateChanged(fb.auth, async (user) => {
    if (!user) {
      cb({ status: 'keluar' });
      return;
    }
    try {
      cb(await bacaPeran(fb, user));
    } catch (err) {
      cbGalat(err);
    }
  });
}

// Token dibaca ulang (true) agar peran yang baru diatur alat/peran.py langsung terbaca.
export async function bacaPeran(fb, user = fb.auth.currentUser) {
  const token = await user.getIdTokenResult(true);
  const peran = PERAN_SAH.includes(token.claims.peran) ? token.claims.peran : null;
  return {
    status: 'masuk',
    user,
    uid: user.uid,
    email: user.email || token.claims.email || '',
    peran,
    terverifikasi: token.claims.email_verified === true,
  };
}

// Dipanggil langsung dari klik tombol (popup diblokir bila tidak dipicu pengguna).
export async function masukGoogle(fb) {
  const penyedia = new fb.A.GoogleAuthProvider();
  penyedia.setCustomParameters({ prompt: 'select_account' });
  await fb.A.signInWithPopup(fb.auth, penyedia);
}

export async function keluar(fb) {
  await fb.A.signOut(fb.auth);
}

export function bisaUbah(peran) {
  return peran === 'admin' || peran === 'editor';
}

export function pesanGalatLogin(err) {
  const kode = err?.code || '';
  if (kode === 'auth/popup-closed-by-user' || kode === 'auth/cancelled-popup-request') return 'Login dibatalkan.';
  if (kode === 'auth/popup-blocked') return 'Popup login diblokir browser. Izinkan popup untuk situs ini lalu coba lagi.';
  if (kode === 'auth/unauthorized-domain') return 'Domain ini belum diizinkan di Firebase Authentication (Authorized domains).';
  if (kode === 'auth/network-request-failed') return 'Tidak bisa terhubung ke server login. Periksa koneksi internet.';
  return 'Gagal masuk: ' + (err?.message || String(err));
}

// Khusus mode emulator (localhost): login tanpa popup untuk uji otomatis.
export function pasangAlatUji(fb) {
  if (!fb.emulator) return;
  window.__zashaUji = {
    async masuk(email) {
      const sub = 'uji-' + String(email).toLowerCase().replace(/[^a-z0-9]/g, '-');
      const kredensial = fb.A.GoogleAuthProvider.credential(
        JSON.stringify({ sub, email, email_verified: true }),
      );
      const hasil = await fb.A.signInWithCredential(fb.auth, kredensial);
      return hasil.user.uid;
    },
    async keluar() {
      await fb.A.signOut(fb.auth);
    },
  };
}
