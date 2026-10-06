// Konfigurasi ZASHA MUTASI.
//
// Cara mengisi FIREBASE_CONFIG (sekali, oleh pemilik):
//   1. Firebase Console -> Project settings -> Your apps -> Web app (</>) -> salin objek firebaseConfig.
//   2. Ganti `null` di bawah dengan objek itu, misalnya:
//        export const FIREBASE_CONFIG = {
//          apiKey: 'AIza...', authDomain: 'zasha-mutasi.firebaseapp.com', projectId: 'zasha-mutasi',
//          storageBucket: 'zasha-mutasi.firebasestorage.app', messagingSenderId: '...', appId: '1:...:web:...',
//        };
//   3. Commit & push. Nilai ini memang publik; data dijaga oleh login + Firestore Security Rules.
//   4. Authentication -> Settings -> Authorized domains: tambahkan muzadidil.github.io.
export const FIREBASE_CONFIG = null;

// Versi Firebase JS SDK (dipin). Dipakai js/firebase.js untuk alamat gstatic.
export const SDK_VERSION = '12.19.0';

// SheetJS dimuat dinamis hanya saat tombol "Unduh Excel" ditekan.
export const URL_SHEETJS = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';

// Daftar bawaan. HARUS sama dengan firebase/firestore.rules (daftarKategori/daftarEntitas)
// dan alat/bersih.py. Label/ikon/warna bisa ditimpa dokumen pengaturan/kategori & pengaturan/entitas.
export const KATEGORI = ['KOSONG', 'PRIBADI', 'PRODUKSI', 'EXSPEDISI', 'V_SALES', 'OPERASIONAL', 'NURUL_AINI', 'BANK'];
export const KATEGORI_DETAIL = {
  KOSONG: { label: 'Belum Kategori', ikon: '📄', singkat: 'KSNG' },
  PRIBADI: { label: 'Pribadi', ikon: '👤', singkat: 'PRIBADI' },
  PRODUKSI: { label: 'Produksi', ikon: '🏭', singkat: 'PRODUKSI' },
  EXSPEDISI: { label: 'Exspedisi', ikon: '🚚', singkat: 'EXSPEDISI' },
  V_SALES: { label: 'V_Sales', ikon: '💼', singkat: 'V_SALES' },
  OPERASIONAL: { label: 'Operasional', ikon: '⚙️', singkat: 'OPR' },
  NURUL_AINI: { label: 'Nurul Aini', ikon: '👩', singkat: 'N_AINI' },
  BANK: { label: 'Bank', ikon: '🏦', singkat: 'BANK' },
};

export const ENTITAS = ['BELUM', 'PRIBADI', 'CV', 'PT'];
export const ENTITAS_DETAIL = {
  BELUM: { label: 'Belum Dipisah', warna: '#6c757d' },
  PRIBADI: { label: 'Pribadi', warna: '#d63384' },
  CV: { label: 'CV', warna: '#005aa9' },
  PT: { label: 'PT', warna: '#198754' },
};

export const PERLU_CEK_LABEL = {
  tanggal_ditukar: 'Tanggal ditukar',
  keterangan_diperbaiki: 'Keterangan diperbaiki',
  kategori_diragukan: 'Kategori diragukan',
  saldo_beda: 'Saldo beda',
  sintetis: 'Baris sintetis',
};

export const BARIS_PER_HALAMAN = 20;
// Satu runTransaction mengubah paling banyak sekian transaksi (rules: idTransaksi <= 200).
export const UKURAN_POTONGAN = 200;
