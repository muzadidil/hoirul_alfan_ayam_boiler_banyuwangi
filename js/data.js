// SEMUA akses Firestore ada di sini.
// - Daftar dokumen bulan: satu onSnapshot pada koleksi 'bulan' (murah, ±12 dokumen per tahun).
// - Transaksi satu bulan: satu onSnapshot (urut 'urutan'), disimpan di Map memori. Ganti filter = 0 baca.
//   Listener diganti hanya saat bulan lain dibuka.
// - ubahNilai(): runTransaction per 200 transaksi, ringkasan bulan dengan increment() (lihat kontrak).
// - hitungUlang(): tulis ulang 8 map ringkasan dari transaksi.
import {
  KATEGORI, KATEGORI_DETAIL, ENTITAS, ENTITAS_DETAIL, UKURAN_POTONGAN,
} from './config.js';

let fb = null;

export function pasangKoneksi(koneksi) {
  fb = koneksi;
}

export const MAP_RINGKASAN = [
  'debetSenPerKategori', 'kreditSenPerKategori', 'jumlahPerKategori',
  'debetSenPerEntitas', 'kreditSenPerEntitas', 'jumlahPerEntitas',
  'debetSenPerEntitasKategori', 'kreditSenPerEntitasKategori',
];

// ------------------------------------------------------------------ pengaturan

function warnaSah(w, bawaan) {
  return /^#[0-9a-fA-F]{3,8}$/.test(w || '') ? w : bawaan;
}

function gabungDetail(kode, bawaan, dok, jenis) {
  const detail = {};
  const dariDok = (dok && typeof dok.detail === 'object' && dok.detail) || {};
  for (const k of kode) {
    const d = dariDok[k] && typeof dariDok[k] === 'object' ? dariDok[k] : {};
    detail[k] = {
      ...bawaan[k],
      label: typeof d.label === 'string' && d.label.trim() ? d.label.trim() : bawaan[k].label,
    };
    if (jenis === 'kategori' && typeof d.ikon === 'string' && d.ikon.length <= 8) detail[k].ikon = d.ikon;
    if (jenis === 'entitas') detail[k].warna = warnaSah(d.warna, bawaan[k].warna);
  }
  const beda = dok && Array.isArray(dok.kode) && dok.kode.join(',') !== kode.join(',');
  return { kode: [...kode], detail, beda };
}

// Kode SELALU dari config.js (sama dengan rules); label/ikon/warna boleh dari dokumen pengaturan.
export async function muatPengaturan() {
  const { F, db } = fb;
  const [k, e] = await Promise.all([
    F.getDoc(F.doc(db, 'pengaturan', 'kategori')),
    F.getDoc(F.doc(db, 'pengaturan', 'entitas')),
  ]);
  const kategori = gabungDetail(KATEGORI, KATEGORI_DETAIL, k.exists() ? k.data() : null, 'kategori');
  const entitas = gabungDetail(ENTITAS, ENTITAS_DETAIL, e.exists() ? e.data() : null, 'entitas');
  const peringatan = [];
  if (kategori.beda) peringatan.push('Daftar kode di pengaturan/kategori berbeda dengan aplikasi; aplikasi memakai daftar bawaan.');
  if (entitas.beda) peringatan.push('Daftar kode di pengaturan/entitas berbeda dengan aplikasi; aplikasi memakai daftar bawaan.');
  return { kategori, entitas, peringatan };
}

// ------------------------------------------------------------------ dokumen bulan

const dokBulan = new Map();
let hentiDaftarBulan = null;

export function pantauDaftarBulan(cb, cbGalat) {
  const { F, db } = fb;
  hentiDaftarBulan?.();
  hentiDaftarBulan = F.onSnapshot(F.collection(db, 'bulan'), (snap) => {
    dokBulan.clear();
    snap.forEach((d) => dokBulan.set(d.id, { id: d.id, ...d.data() }));
    cb(dokBulan);
  }, cbGalat);
}

export function ambilBulan(kode) {
  return dokBulan.get(kode) || null;
}

export function semuaBulan() {
  return [...dokBulan.values()].sort((a, b) => a.id.localeCompare(b.id));
}

// ------------------------------------------------------------------ transaksi satu bulan

const sesi = {
  kode: null, henti: null, data: new Map(), urut: [], siap: false, galat: null, versi: 0,
};
const pendengarBulan = new Set();

function beritahuBulan() {
  pendengarBulan.forEach((cb) => cb(sesi));
}

export function dengarBulan(cb) {
  pendengarBulan.add(cb);
  return () => pendengarBulan.delete(cb);
}

export function sesiBulan() {
  return sesi;
}

export function bukaBulan(kode) {
  if (sesi.kode === kode && !sesi.galat) return sesi;
  tutupBulan();
  const { F, db } = fb;
  sesi.kode = kode;
  const q = F.query(F.collection(db, 'bulan', kode, 'transaksi'), F.orderBy('urutan'));
  sesi.henti = F.onSnapshot(q, (snap) => {
    for (const ch of snap.docChanges()) {
      if (ch.type === 'removed') sesi.data.delete(ch.doc.id);
      else sesi.data.set(ch.doc.id, { id: ch.doc.id, ...ch.doc.data() });
    }
    sesi.urut = [...sesi.data.values()].sort((a, b) => (a.urutan - b.urutan) || a.id.localeCompare(b.id));
    sesi.siap = true;
    sesi.galat = null;
    sesi.versi += 1;
    beritahuBulan();
  }, (err) => {
    sesi.galat = err;
    sesi.henti = null;
    beritahuBulan();
  });
  return sesi;
}

export function tutupBulan() {
  sesi.henti?.();
  Object.assign(sesi, { kode: null, henti: null, data: new Map(), urut: [], siap: false, galat: null });
  sesi.versi += 1;
}

// Dipanggil setelah semua listener menerima perubahan yang sama (dokumen bulan + transaksi).
export function dengarSinkron(cb) {
  return fb.F.onSnapshotsInSync(fb.db, cb);
}

// ------------------------------------------------------------------ ringkasan

export function ringkasanKosong() {
  const nol = (kode) => Object.fromEntries(kode.map((k) => [k, 0]));
  return {
    debetSenPerKategori: nol(KATEGORI),
    kreditSenPerKategori: nol(KATEGORI),
    jumlahPerKategori: nol(KATEGORI),
    debetSenPerEntitas: nol(ENTITAS),
    kreditSenPerEntitas: nol(ENTITAS),
    jumlahPerEntitas: nol(ENTITAS),
    debetSenPerEntitasKategori: Object.fromEntries(ENTITAS.map((e) => [e, nol(KATEGORI)])),
    kreditSenPerEntitasKategori: Object.fromEntries(ENTITAS.map((e) => [e, nol(KATEGORI)])),
  };
}

export function hitungRingkasan(daftar) {
  const r = ringkasanKosong();
  for (const t of daftar) {
    const k = t.kategori || 'KOSONG';
    const e = t.entitas || 'BELUM';
    const d = Number(t.debetSen) || 0;
    const c = Number(t.kreditSen) || 0;
    r.debetSenPerKategori[k] = (r.debetSenPerKategori[k] || 0) + d;
    r.kreditSenPerKategori[k] = (r.kreditSenPerKategori[k] || 0) + c;
    r.jumlahPerKategori[k] = (r.jumlahPerKategori[k] || 0) + 1;
    r.debetSenPerEntitas[e] = (r.debetSenPerEntitas[e] || 0) + d;
    r.kreditSenPerEntitas[e] = (r.kreditSenPerEntitas[e] || 0) + c;
    r.jumlahPerEntitas[e] = (r.jumlahPerEntitas[e] || 0) + 1;
    r.debetSenPerEntitasKategori[e] ||= {};
    r.kreditSenPerEntitasKategori[e] ||= {};
    r.debetSenPerEntitasKategori[e][k] = (r.debetSenPerEntitasKategori[e][k] || 0) + d;
    r.kreditSenPerEntitasKategori[e][k] = (r.kreditSenPerEntitasKategori[e][k] || 0) + c;
  }
  return r;
}

// Daftar selisih [{ jalur, tersimpan, hitung }] antara dokumen bulan dan hitungan dari transaksi.
export function bandingkanRingkasan(dok, hitungan) {
  const beda = [];
  const banding = (jalur, a, b) => {
    const kunci = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
    for (const k of kunci) {
      const x = a?.[k];
      const y = b?.[k];
      if ((x && typeof x === 'object') || (y && typeof y === 'object')) {
        banding(`${jalur}.${k}`, x || {}, y || {});
      } else if ((Number(x) || 0) !== (Number(y) || 0)) {
        beda.push({ jalur: `${jalur}.${k}`, tersimpan: x ?? null, hitung: y ?? 0 });
      }
    }
  };
  for (const nama of MAP_RINGKASAN) banding(nama, dok?.[nama], hitungan[nama]);
  return beda;
}

// ------------------------------------------------------------------ ubah kategori / entitas

function potong(daftar, ukuran) {
  const hasil = [];
  for (let i = 0; i < daftar.length; i += ukuran) hasil.push(daftar.slice(i, i + ukuran));
  return hasil;
}

function tambah(peta, jalur, n) {
  if (n) peta.set(jalur, (peta.get(jalur) || 0) + n);
}

// Selisih ringkasan untuk satu transaksi t yang field-nya diubah ke nilai baru (kontrak "Ringkasan saat ubah").
function deltaRingkasan(peta, t, field, baru) {
  const d = Number(t.debetSen) || 0;
  const c = Number(t.kreditSen) || 0;
  if (field === 'kategori') {
    const a = t.kategori;
    const e = t.entitas;
    tambah(peta, `debetSenPerKategori.${a}`, -d);
    tambah(peta, `debetSenPerKategori.${baru}`, d);
    tambah(peta, `kreditSenPerKategori.${a}`, -c);
    tambah(peta, `kreditSenPerKategori.${baru}`, c);
    tambah(peta, `jumlahPerKategori.${a}`, -1);
    tambah(peta, `jumlahPerKategori.${baru}`, 1);
    tambah(peta, `debetSenPerEntitasKategori.${e}.${a}`, -d);
    tambah(peta, `debetSenPerEntitasKategori.${e}.${baru}`, d);
    tambah(peta, `kreditSenPerEntitasKategori.${e}.${a}`, -c);
    tambah(peta, `kreditSenPerEntitasKategori.${e}.${baru}`, c);
  } else {
    const e = t.entitas;
    const k = t.kategori;
    tambah(peta, `debetSenPerEntitas.${e}`, -d);
    tambah(peta, `debetSenPerEntitas.${baru}`, d);
    tambah(peta, `kreditSenPerEntitas.${e}`, -c);
    tambah(peta, `kreditSenPerEntitas.${baru}`, c);
    tambah(peta, `jumlahPerEntitas.${e}`, -1);
    tambah(peta, `jumlahPerEntitas.${baru}`, 1);
    tambah(peta, `debetSenPerEntitasKategori.${e}.${k}`, -d);
    tambah(peta, `debetSenPerEntitasKategori.${baru}.${k}`, d);
    tambah(peta, `kreditSenPerEntitasKategori.${e}.${k}`, -c);
    tambah(peta, `kreditSenPerEntitasKategori.${baru}.${k}`, c);
  }
}

// Ubah field ('kategori' | 'entitas') sejumlah transaksi satu bulan ke nilai baru.
// Tiap potongan 200 transaksi = 1 runTransaction atomik (transaksi + dokumen bulan + 1 riwayat).
// onProgres({ selesai, total, potongan, jumlahPotongan }) dipanggil setelah tiap potongan berhasil.
export async function ubahNilai({ kodeBulan, ids, field, nilai, pengguna, onProgres }) {
  const daftarSah = field === 'kategori' ? KATEGORI : field === 'entitas' ? ENTITAS : null;
  if (!daftarSah) throw new Error(`Field tidak dikenal: ${field}`);
  if (!daftarSah.includes(nilai)) throw new Error(`Nilai ${field} tidak sah: ${nilai}`);
  const { F, db } = fb;
  const unik = [...new Set(ids)];
  const bagian = potong(unik, UKURAN_POTONGAN);
  const refBulan = F.doc(db, 'bulan', kodeBulan);
  const jenis = field === 'kategori' ? 'ubah_kategori' : 'ubah_entitas';
  const hasilTotal = { berubah: 0, dilewati: 0, totalSen: 0, potonganSelesai: 0 };

  for (let i = 0; i < bagian.length; i += 1) {
    let hasil;
    try {
      hasil = await F.runTransaction(db, async (tx) => {
        const refs = bagian[i].map((id) => F.doc(db, 'bulan', kodeBulan, 'transaksi', id));
        const snaps = await Promise.all(refs.map((r) => tx.get(r)));
        const delta = new Map();
        const dari = {};
        const idBerubah = [];
        let totalSen = 0;
        let dilewati = 0;
        snaps.forEach((s, j) => {
          const t = s.exists() ? s.data() : null;
          if (!t || t[field] === nilai) {
            dilewati += 1;
            return;
          }
          deltaRingkasan(delta, t, field, nilai);
          dari[t[field]] = (dari[t[field]] || 0) + 1;
          totalSen += (Number(t.debetSen) || 0) + (Number(t.kreditSen) || 0);
          idBerubah.push(refs[j].id);
          tx.update(refs[j], {
            [field]: nilai,
            diubahOleh: pengguna.uid,
            diubahOlehEmail: pengguna.email,
            diubahPada: F.serverTimestamp(),
          });
        });
        if (!idBerubah.length) return { berubah: 0, dilewati, totalSen: 0 };
        const pembaruan = { diperbaruiOleh: pengguna.uid, diperbaruiPada: F.serverTimestamp() };
        for (const [jalur, n] of delta) {
          if (n !== 0) pembaruan[jalur] = F.increment(n);
        }
        tx.update(refBulan, pembaruan);
        tx.set(F.doc(F.collection(db, 'bulan', kodeBulan, 'riwayat')), {
          waktu: F.serverTimestamp(),
          olehUid: pengguna.uid,
          olehEmail: pengguna.email,
          jenis,
          ke: nilai,
          dari,
          idTransaksi: idBerubah,
          jumlah: idBerubah.length,
          totalSen,
        });
        return { berubah: idBerubah.length, dilewati, totalSen };
      });
    } catch (err) {
      err.hasilSebagian = { ...hasilTotal };
      err.potonganGagal = i + 1;
      err.jumlahPotongan = bagian.length;
      throw err;
    }
    hasilTotal.berubah += hasil.berubah;
    hasilTotal.dilewati += hasil.dilewati;
    hasilTotal.totalSen += hasil.totalSen;
    hasilTotal.potonganSelesai = i + 1;
    onProgres?.({
      selesai: Math.min((i + 1) * UKURAN_POTONGAN, unik.length),
      total: unik.length,
      potongan: i + 1,
      jumlahPotongan: bagian.length,
    });
  }
  return hasilTotal;
}

// Hitung ulang 8 map ringkasan dari transaksi di server lalu tulis absolut (+ riwayat 'hitung_ulang').
export async function hitungUlang({ kodeBulan, pengguna }) {
  const { F, db } = fb;
  const snap = await F.getDocsFromServer(F.collection(db, 'bulan', kodeBulan, 'transaksi'));
  const r = hitungRingkasan(snap.docs.map((d) => d.data()));
  const refBulan = F.doc(db, 'bulan', kodeBulan);
  const batch = F.writeBatch(db);
  const pembaruan = { diperbaruiOleh: pengguna.uid, diperbaruiPada: F.serverTimestamp() };
  for (const nama of MAP_RINGKASAN) pembaruan[nama] = r[nama];
  batch.update(refBulan, pembaruan);
  batch.set(F.doc(F.collection(db, 'bulan', kodeBulan, 'riwayat')), {
    waktu: F.serverTimestamp(),
    olehUid: pengguna.uid,
    olehEmail: pengguna.email,
    jenis: 'hitung_ulang',
    ke: null,
    dari: {},
    idTransaksi: [],
    jumlah: snap.size,
    totalSen: 0,
  });
  await batch.commit();
  return { jumlah: snap.size };
}

// ------------------------------------------------------------------ pesan galat

export function pesanGalat(err) {
  const kode = err?.code || '';
  const peta = {
    'permission-denied': 'Akses ditolak oleh server. Peran Anda mungkin tidak mengizinkan tindakan ini; muat ulang halaman bila peran baru saja diubah.',
    unauthenticated: 'Sesi login berakhir. Silakan masuk lagi.',
    unavailable: 'Tidak bisa terhubung ke server Firestore. Periksa koneksi internet lalu coba lagi.',
    aborted: 'Bentrok dengan perubahan lain pada waktu yang sama. Coba lagi.',
    'resource-exhausted': 'Kuota Firestore hari ini habis. Coba lagi setelah kuota direset (sekitar pukul 14.00–15.00 WIB).',
    'failed-precondition': 'Permintaan ditolak server (failed-precondition).',
    'not-found': 'Data tidak ditemukan di server.',
    'deadline-exceeded': 'Server terlalu lama menjawab. Coba lagi.',
  };
  const kodePendek = kode.replace(/^firestore\//, '');
  return peta[kodePendek] || (err?.message ? `Galat: ${err.message}` : `Galat: ${String(err)}`);
}
