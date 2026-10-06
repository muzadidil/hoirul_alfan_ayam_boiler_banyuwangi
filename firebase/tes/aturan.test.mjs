// Uji Firestore Security Rules ZASHA MUTASI.
// Jalankan lewat emulator: lihat firebase/README.md (npm run uji).
// Semua data di sini sintetis (bukan data rekening asli).
import { readFileSync } from 'node:fs';
import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  Timestamp,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  increment,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  setLogLevel,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';

const PROYEK = 'demo-zasha-uji';
const KATEGORI = ['KOSONG', 'PRIBADI', 'PRODUKSI', 'EXSPEDISI', 'V_SALES', 'OPERASIONAL', 'NURUL_AINI', 'BANK'];
const ENTITAS = ['BELUM', 'PRIBADI', 'CV', 'PT'];
const BULAN = '2023-01';
const JUMLAH_TRX = 210;
const TEKS_ATURAN = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');

const PENGGUNA = {
  admin: { uid: 'u-admin', email: 'admin@contoh.id', peran: 'admin' },
  editor: { uid: 'u-editor', email: 'editor@contoh.id', peran: 'editor' },
  pembaca: { uid: 'u-pembaca', email: 'pembaca@contoh.id', peran: 'pembaca' },
  tanpaPeran: { uid: 'u-tanpa', email: 'tanpa@contoh.id' },
  peranAsing: { uid: 'u-asing', email: 'asing@contoh.id', peran: 'superadmin' },
};

let env;
const cacheDb = new Map();

function db(nama) {
  if (!cacheDb.has(nama)) {
    if (nama === 'tamu') {
      cacheDb.set(nama, env.unauthenticatedContext().firestore());
    } else {
      const p = PENGGUNA[nama];
      const token = { email: p.email, email_verified: true };
      if (p.peran) token.peran = p.peran;
      cacheDb.set(nama, env.authenticatedContext(p.uid, token).firestore());
    }
  }
  return cacheDb.get(nama);
}

function dbBelumVerifikasi(peran) {
  return env.authenticatedContext('u-belum', {
    email: 'belum@contoh.id', email_verified: false, peran,
  }).firestore();
}

function dbTanpaKlaimVerifikasi(peran) {
  return env.authenticatedContext('u-polos', { email: 'polos@contoh.id', peran }).firestore();
}

async function mentah(fn) {
  let hasil;
  await env.withSecurityRulesDisabled(async (ctx) => {
    hasil = await fn(ctx.firestore());
  });
  return hasil;
}

const idTrx = (i) => `${BULAN}-r${String(i + 3).padStart(4, '0')}`;
const refBulan = (d, b = BULAN) => doc(d, 'bulan', b);
const refTrx = (d, i) => doc(d, 'bulan', BULAN, 'transaksi', idTrx(i));

function buatTransaksi(i) {
  const kredit = i % 5 === 0;
  const nominal = 50000 + i * 1234;
  const pola = i % 3;
  return {
    bulan: BULAN,
    tahun: 2023,
    tanggal: `2023-01-${String(1 + (i % 28)).padStart(2, '0')}`,
    urutan: i,
    ketPendek: kredit ? 'SETORAN CONTOH' : 'TRSF CONTOH DB',
    ketLengkap: `${kredit ? 'SETORAN CONTOH' : 'TRSF CONTOH DB'} PIHAK CONTOH ${i % 7}`,
    ketAsli: null,
    jenis: kredit ? 'CR' : 'DB',
    debetSen: kredit ? 0 : nominal,
    kreditSen: kredit ? nominal : 0,
    saldoSen: 0,
    saldoBankSen: null,
    kategori: pola === 0 ? 'PRIBADI' : pola === 1 ? 'PRODUKSI' : 'KOSONG',
    kategoriAsal: pola === 2 ? null : (pola === 0 ? 'PRIBADI' : 'PRODUKSI'),
    saran: null,
    entitas: pola === 0 ? 'PRIBADI' : 'BELUM',
    perluCek: [],
    sumber: { file: 'CONTOH.xlsx', tab: 'JAN_2023', baris: i + 3 },
    diubahOleh: null,
    diubahOlehEmail: null,
    diubahPada: null,
  };
}

function nol(kode) {
  return Object.fromEntries(kode.map((k) => [k, 0]));
}

function hitungRingkasan(daftar) {
  const r = {
    debetSenPerKategori: nol(KATEGORI),
    kreditSenPerKategori: nol(KATEGORI),
    jumlahPerKategori: nol(KATEGORI),
    debetSenPerEntitas: nol(ENTITAS),
    kreditSenPerEntitas: nol(ENTITAS),
    jumlahPerEntitas: nol(ENTITAS),
    debetSenPerEntitasKategori: Object.fromEntries(ENTITAS.map((e) => [e, nol(KATEGORI)])),
    kreditSenPerEntitasKategori: Object.fromEntries(ENTITAS.map((e) => [e, nol(KATEGORI)])),
  };
  for (const t of daftar) {
    r.debetSenPerKategori[t.kategori] += t.debetSen;
    r.kreditSenPerKategori[t.kategori] += t.kreditSen;
    r.jumlahPerKategori[t.kategori] += 1;
    r.debetSenPerEntitas[t.entitas] += t.debetSen;
    r.kreditSenPerEntitas[t.entitas] += t.kreditSen;
    r.jumlahPerEntitas[t.entitas] += 1;
    r.debetSenPerEntitasKategori[t.entitas][t.kategori] += t.debetSen;
    r.kreditSenPerEntitasKategori[t.entitas][t.kategori] += t.kreditSen;
  }
  return r;
}

const KUNCI_RINGKASAN = Object.keys(hitungRingkasan([]));

function buatBulan(daftar) {
  return {
    kode: BULAN,
    tahun: 2023,
    bulan: 1,
    label: 'Januari 2023',
    saldoAwalSen: 100000000,
    saldoAkhirSen: 100000000,
    jumlahTransaksi: daftar.length,
    totalDebetSen: daftar.reduce((a, t) => a + t.debetSen, 0),
    totalKreditSen: daftar.reduce((a, t) => a + t.kreditSen, 0),
    ...hitungRingkasan(daftar),
    linkHome: 'https://alfan.zasha.online/bulan/januari.php',
    kualitas: { tanggalDitukar: 0, keteranganDiperbaiki: 0, kategoriDiragukan: 0, saldoBeda: 0, catatan: [] },
    sumber: { file: 'CONTOH.xlsx', tab: 'JAN_2023' },
    diperbaruiOleh: null,
    diperbaruiPada: null,
  };
}

async function isiData() {
  await mentah(async (d) => {
    const batch = writeBatch(d);
    const daftar = [];
    for (let i = 1; i <= JUMLAH_TRX; i++) {
      const t = buatTransaksi(i);
      daftar.push(t);
      batch.set(refTrx(d, i), t);
    }
    batch.set(refBulan(d), buatBulan(daftar));
    batch.set(doc(d, 'pengaturan', 'kategori'), {
      kode: KATEGORI,
      detail: Object.fromEntries(KATEGORI.map((k, i) => [k, { label: k, ikon: '', urutan: i }])),
    });
    batch.set(doc(d, 'pengaturan', 'entitas'), {
      kode: ENTITAS,
      detail: Object.fromEntries(ENTITAS.map((k, i) => [k, { label: k, warna: 'secondary', urutan: i }])),
    });
    batch.set(doc(d, 'bulan', BULAN, 'riwayat', 'contoh'), {
      waktu: Timestamp.now(), olehUid: 'u-editor', olehEmail: 'editor@contoh.id', jenis: 'ubah_kategori',
      ke: 'PRODUKSI', dari: { KOSONG: 1 }, idTransaksi: [idTrx(2)], jumlah: 1, totalSen: 1000,
    });
    batch.set(doc(d, 'impor', 'contoh'), {
      waktu: Timestamp.now(), berkas: ['CONTOH.xlsx'], ditulis: JUMLAH_TRX, dilewati: 0, versi: 'uji', opsi: {},
    });
    await batch.commit();
  });
}

async function bacaSemuaMentah() {
  return mentah(async (d) => {
    const bulan = (await getDoc(refBulan(d))).data();
    const snap = await getDocs(collection(d, 'bulan', BULAN, 'transaksi'));
    const trx = new Map(snap.docs.map((s) => [s.id, s.data()]));
    const riwayat = (await getDocs(collection(d, 'bulan', BULAN, 'riwayat'))).docs.map((s) => ({ id: s.id, ...s.data() }));
    return { bulan, trx, riwayat };
  });
}

function ringkasanDari(bulan) {
  return Object.fromEntries(KUNCI_RINGKASAN.map((k) => [k, bulan[k]]));
}

function jejakTrx(p) {
  return { diubahOleh: p.uid, diubahOlehEmail: p.email, diubahPada: serverTimestamp() };
}

function jejakBulan(p) {
  return { diperbaruiOleh: p.uid, diperbaruiPada: serverTimestamp() };
}

function riwayatSah(p, tambahan = {}) {
  return {
    waktu: serverTimestamp(),
    olehUid: p.uid,
    olehEmail: p.email,
    jenis: 'ubah_kategori',
    ke: 'PRODUKSI',
    dari: { KOSONG: 1 },
    idTransaksi: [idTrx(1)],
    jumlah: 1,
    totalSen: 51234,
    ...tambahan,
  };
}

// Tiruan cara klien (js/data.js) memindah kategori/entitas: tx.get dulu, lalu tulis.
function rencanaPerubahan(daftar, field, nilai) {
  const tambah = {};
  const dari = {};
  const id = [];
  let totalSen = 0;
  const naik = (kunci, n) => {
    if (n) tambah[kunci] = (tambah[kunci] || 0) + n;
  };
  for (const { id: idT, data: t } of daftar) {
    const lama = t[field];
    if (lama === nilai) continue;
    if (field === 'kategori') {
      naik(`debetSenPerKategori.${lama}`, -t.debetSen);
      naik(`debetSenPerKategori.${nilai}`, t.debetSen);
      naik(`kreditSenPerKategori.${lama}`, -t.kreditSen);
      naik(`kreditSenPerKategori.${nilai}`, t.kreditSen);
      naik(`jumlahPerKategori.${lama}`, -1);
      naik(`jumlahPerKategori.${nilai}`, 1);
      naik(`debetSenPerEntitasKategori.${t.entitas}.${lama}`, -t.debetSen);
      naik(`debetSenPerEntitasKategori.${t.entitas}.${nilai}`, t.debetSen);
      naik(`kreditSenPerEntitasKategori.${t.entitas}.${lama}`, -t.kreditSen);
      naik(`kreditSenPerEntitasKategori.${t.entitas}.${nilai}`, t.kreditSen);
    } else {
      naik(`debetSenPerEntitas.${lama}`, -t.debetSen);
      naik(`debetSenPerEntitas.${nilai}`, t.debetSen);
      naik(`kreditSenPerEntitas.${lama}`, -t.kreditSen);
      naik(`kreditSenPerEntitas.${nilai}`, t.kreditSen);
      naik(`jumlahPerEntitas.${lama}`, -1);
      naik(`jumlahPerEntitas.${nilai}`, 1);
      naik(`debetSenPerEntitasKategori.${lama}.${t.kategori}`, -t.debetSen);
      naik(`debetSenPerEntitasKategori.${nilai}.${t.kategori}`, t.debetSen);
      naik(`kreditSenPerEntitasKategori.${lama}.${t.kategori}`, -t.kreditSen);
      naik(`kreditSenPerEntitasKategori.${nilai}.${t.kategori}`, t.kreditSen);
    }
    dari[lama] = (dari[lama] || 0) + 1;
    id.push(idT);
    totalSen += t.debetSen + t.kreditSen;
  }
  return { tambah, dari, id, totalSen };
}

function tulisPerubahan(penulis, d, p, field, nilai, rencana) {
  for (const idT of rencana.id) {
    penulis.update(doc(d, 'bulan', BULAN, 'transaksi', idT), { [field]: nilai, ...jejakTrx(p) });
  }
  const ubahBulan = jejakBulan(p);
  for (const [kunci, n] of Object.entries(rencana.tambah)) ubahBulan[kunci] = increment(n);
  penulis.update(refBulan(d), ubahBulan);
  penulis.set(doc(collection(d, 'bulan', BULAN, 'riwayat')), {
    waktu: serverTimestamp(),
    olehUid: p.uid,
    olehEmail: p.email,
    jenis: field === 'kategori' ? 'ubah_kategori' : 'ubah_entitas',
    ke: nilai,
    dari: rencana.dari,
    idTransaksi: rencana.id,
    jumlah: rencana.id.length,
    totalSen: rencana.totalSen,
  });
}

function ubahLewatTransaksi(d, p, nomor, field, nilai) {
  return runTransaction(d, async (tx) => {
    const snaps = await Promise.all(nomor.map((i) => tx.get(refTrx(d, i))));
    const rencana = rencanaPerubahan(snaps.map((s) => ({ id: s.id, data: s.data() })), field, nilai);
    if (rencana.id.length) tulisPerubahan(tx, d, p, field, nilai, rencana);
    return rencana.id.length;
  });
}

function rentang(dari, sampai) {
  return Array.from({ length: sampai - dari + 1 }, (_, i) => dari + i);
}

before(async () => {
  setLogLevel('silent');
  env = await initializeTestEnvironment({
    projectId: PROYEK,
    firestore: { rules: TEKS_ATURAN },
  });
});

after(async () => {
  if (env) await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await isiData();
});

describe('isi berkas aturan', () => {
  test('tidak memakai get()/exists() dokumen', () => {
    assert.doesNotMatch(TEKS_ATURAN, /\b(get|exists|getAfter|existsAfter)\s*\(\s*\//);
  });

  test('daftar kategori & entitas sama dengan kontrak', () => {
    const ambil = (nama) => {
      const m = TEKS_ATURAN.match(new RegExp(`function ${nama}\\(\\)\\s*\\{\\s*return\\s*\\[([^\\]]*)\\]`));
      assert.ok(m, `fungsi ${nama} tidak ditemukan`);
      return m[1].split(',').map((s) => s.trim().replace(/'/g, ''));
    };
    assert.deepEqual(ambil('daftarKategori'), KATEGORI);
    assert.deepEqual(ambil('daftarEntitas'), ENTITAS);
  });
});

describe('tanpa akses', () => {
  const pathBaca = [
    ['bulan', BULAN],
    ['bulan', BULAN, 'transaksi', idTrx(1)],
    ['bulan', BULAN, 'riwayat', 'contoh'],
    ['pengaturan', 'kategori'],
    ['impor', 'contoh'],
  ];

  test('tanpa login ditolak membaca apa pun', async () => {
    const d = db('tamu');
    for (const p of pathBaca) await assertFails(getDoc(doc(d, ...p)));
    await assertFails(getDocs(collection(d, 'bulan')));
    await assertFails(getDocs(collection(d, 'bulan', BULAN, 'transaksi')));
  });

  test('login tanpa peran ditolak', async () => {
    const d = db('tanpaPeran');
    for (const p of pathBaca) await assertFails(getDoc(doc(d, ...p)));
    await assertFails(getDocs(collection(d, 'bulan')));
    await assertFails(updateDoc(refTrx(d, 1), { kategori: 'PRODUKSI', ...jejakTrx(PENGGUNA.tanpaPeran) }));
  });

  test('peran tidak dikenal ditolak', async () => {
    const d = db('peranAsing');
    for (const p of pathBaca) await assertFails(getDoc(doc(d, ...p)));
    await assertFails(updateDoc(refTrx(d, 1), { kategori: 'PRODUKSI', ...jejakTrx(PENGGUNA.peranAsing) }));
  });

  test('email_verified false ditolak walau berperan admin', async () => {
    const d = dbBelumVerifikasi('admin');
    for (const p of pathBaca) await assertFails(getDoc(doc(d, ...p)));
    await assertFails(getDocs(collection(d, 'bulan')));
    await assertFails(updateDoc(refTrx(d, 1), {
      kategori: 'PRODUKSI', diubahOleh: 'u-belum', diubahOlehEmail: 'belum@contoh.id', diubahPada: serverTimestamp(),
    }));
  });

  test('token tanpa klaim email_verified ditolak', async () => {
    const d = dbTanpaKlaimVerifikasi('editor');
    await assertFails(getDoc(refBulan(d)));
    await assertFails(getDocs(collection(d, 'bulan', BULAN, 'transaksi')));
  });
});

describe('pembaca', () => {
  test('bisa membaca bulan, transaksi, riwayat, pengaturan', async () => {
    const d = db('pembaca');
    await assertSucceeds(getDoc(refBulan(d)));
    await assertSucceeds(getDocs(collection(d, 'bulan')));
    const snap = await assertSucceeds(getDocs(query(collection(d, 'bulan', BULAN, 'transaksi'), orderBy('urutan'))));
    assert.equal(snap.size, JUMLAH_TRX);
    await assertSucceeds(getDoc(refTrx(d, 1)));
    await assertSucceeds(getDocs(collection(d, 'bulan', BULAN, 'riwayat')));
    await assertSucceeds(getDoc(doc(d, 'pengaturan', 'kategori')));
    await assertSucceeds(getDoc(doc(d, 'pengaturan', 'entitas')));
    await assertSucceeds(getDocs(collection(d, 'pengaturan')));
  });

  test('tidak bisa membaca impor', async () => {
    const d = db('pembaca');
    await assertFails(getDoc(doc(d, 'impor', 'contoh')));
    await assertFails(getDocs(collection(d, 'impor')));
  });

  test('tidak bisa menulis apa pun', async () => {
    const p = PENGGUNA.pembaca;
    const d = db('pembaca');
    await assertFails(updateDoc(refTrx(d, 1), { kategori: 'PRODUKSI', ...jejakTrx(p) }));
    await assertFails(updateDoc(refTrx(d, 1), { entitas: 'CV', ...jejakTrx(p) }));
    await assertFails(updateDoc(refBulan(d), { 'debetSenPerKategori.KOSONG': increment(1), ...jejakBulan(p) }));
    await assertFails(setDoc(doc(collection(d, 'bulan', BULAN, 'riwayat')), riwayatSah(p)));
    await assertFails(setDoc(doc(d, 'pengaturan', 'kategori'), { kode: KATEGORI }));
    await assertFails(setDoc(refBulan(d, '2023-02'), { kode: '2023-02' }));
    await assertFails(deleteDoc(refTrx(d, 1)));
    await assertFails(setDoc(doc(d, 'impor', 'baru'), { versi: 'x' }));
  });
});

describe('editor: dokumen transaksi', () => {
  const p = PENGGUNA.editor;

  test('ubah ke setiap kategori sah diterima', async () => {
    const d = db('editor');
    for (const [i, k] of KATEGORI.entries()) {
      await assertSucceeds(updateDoc(refTrx(d, i + 1), { kategori: k, ...jejakTrx(p) }));
    }
    const t = (await bacaSemuaMentah()).trx.get(idTrx(3));
    assert.equal(t.kategori, 'PRODUKSI');
    assert.equal(t.diubahOleh, p.uid);
    assert.equal(t.diubahOlehEmail, p.email);
    assert.ok(t.diubahPada instanceof Timestamp);
  });

  test('kategori tidak sah ditolak', async () => {
    const d = db('editor');
    for (const k of ['VSALES', 'produksi', 'LAIN', '', null, 5, ['PRODUKSI']]) {
      await assertFails(updateDoc(refTrx(d, 1), { kategori: k, ...jejakTrx(p) }));
    }
    await assertFails(updateDoc(refTrx(d, 1), { kategori: deleteField(), ...jejakTrx(p) }));
  });

  test('ubah ke setiap entitas sah diterima', async () => {
    const d = db('editor');
    for (const [i, e] of ENTITAS.entries()) {
      await assertSucceeds(updateDoc(refTrx(d, i + 1), { entitas: e, ...jejakTrx(p) }));
    }
    await assertSucceeds(updateDoc(refTrx(d, 9), { kategori: 'PRODUKSI', entitas: 'PT', ...jejakTrx(p) }));
  });

  test('entitas tidak sah ditolak', async () => {
    const d = db('editor');
    for (const e of ['cv', 'CV ', 'BELUM_DIPISAH', 'PRODUKSI', '', null, 1]) {
      await assertFails(updateDoc(refTrx(d, 1), { entitas: e, ...jejakTrx(p) }));
    }
    await assertFails(updateDoc(refTrx(d, 1), { entitas: deleteField(), ...jejakTrx(p) }));
  });

  test('field selain kategori/entitas/jejak ditolak', async () => {
    const d = db('editor');
    const coba = [
      { debetSen: 1 },
      { kreditSen: 999 },
      { tanggal: '2023-01-31' },
      { kategoriAsal: 'BANK' },
      { saran: 'PRODUKSI' },
      { perluCek: ['sintetis'] },
      { urutan: 1000 },
      { ketLengkap: 'diubah' },
      { saldoSen: 1 },
      { fieldBaru: true },
      { saran: deleteField() },
    ];
    for (const ubah of coba) {
      await assertFails(updateDoc(refTrx(d, 1), { kategori: 'PRODUKSI', ...ubah, ...jejakTrx(p) }))
        .catch((e) => assert.fail(`${Object.keys(ubah)}: ${e.message}`));
    }
  });

  test('jejak palsu atau tanpa jejak ditolak', async () => {
    const d = db('editor');
    const r = refTrx(d, 1);
    await assertFails(updateDoc(r, { kategori: 'PRODUKSI' }));
    await assertFails(updateDoc(r, { kategori: 'PRODUKSI', ...jejakTrx(p), diubahOleh: 'u-lain' }));
    await assertFails(updateDoc(r, { kategori: 'PRODUKSI', ...jejakTrx(p), diubahOlehEmail: 'lain@contoh.id' }));
    await assertFails(updateDoc(r, { kategori: 'PRODUKSI', ...jejakTrx(p), diubahPada: Timestamp.now() }));
    await assertFails(updateDoc(r, { kategori: 'PRODUKSI', ...jejakTrx(p), diubahPada: new Date() }));
    await assertFails(updateDoc(r, { kategori: 'PRODUKSI', diubahOleh: p.uid, diubahOlehEmail: p.email }));
    await assertFails(updateDoc(r, { kategori: 'PRODUKSI', diubahOlehEmail: p.email, diubahPada: serverTimestamp() }));
  });

  test('create dan delete transaksi ditolak (editor & admin)', async () => {
    for (const nama of ['editor', 'admin']) {
      const d = db(nama);
      const t = { ...buatTransaksi(999), ...jejakTrx(PENGGUNA[nama]) };
      await assertFails(setDoc(doc(d, 'bulan', BULAN, 'transaksi', `${BULAN}-r9999`), t));
      await assertFails(deleteDoc(refTrx(d, 1)));
    }
  });

  test('admin juga editor', async () => {
    const d = db('admin');
    await assertSucceeds(updateDoc(refTrx(d, 1), { kategori: 'BANK', entitas: 'CV', ...jejakTrx(PENGGUNA.admin) }));
  });
});

describe('editor: dokumen bulan', () => {
  const p = PENGGUNA.editor;

  test('increment map ringkasan (termasuk bertingkat) + jejak diterima', async () => {
    const d = db('editor');
    await assertSucceeds(updateDoc(refBulan(d), {
      'debetSenPerKategori.KOSONG': increment(-500),
      'debetSenPerKategori.PRODUKSI': increment(500),
      'kreditSenPerKategori.BANK': increment(0),
      'jumlahPerKategori.KOSONG': increment(-1),
      'jumlahPerKategori.PRODUKSI': increment(1),
      'debetSenPerEntitas.BELUM': increment(-500),
      'debetSenPerEntitas.CV': increment(500),
      'kreditSenPerEntitas.PT': increment(0),
      'jumlahPerEntitas.BELUM': increment(-1),
      'jumlahPerEntitas.CV': increment(1),
      'debetSenPerEntitasKategori.BELUM.KOSONG': increment(-500),
      'debetSenPerEntitasKategori.CV.PRODUKSI': increment(500),
      'kreditSenPerEntitasKategori.PT.V_SALES': increment(0),
      ...jejakBulan(p),
    }));
    const b = (await bacaSemuaMentah()).bulan;
    assert.equal(b.diperbaruiOleh, p.uid);
    assert.ok(b.diperbaruiPada instanceof Timestamp);
    assert.equal(b.debetSenPerEntitasKategori.CV.PRODUKSI, 500);
  });

  test('tulis map absolut (hitung ulang) diterima', async () => {
    const d = db('editor');
    const semua = (await bacaSemuaMentah()).trx;
    await assertSucceeds(updateDoc(refBulan(d), { ...hitungRingkasan([...semua.values()]), ...jejakBulan(p) }));
  });

  test('field lain di bulan ditolak', async () => {
    const d = db('editor');
    const coba = [
      { saldoAwalSen: 1 },
      { saldoAkhirSen: 1 },
      { totalDebetSen: 1 },
      { totalKreditSen: 1 },
      { jumlahTransaksi: 1 },
      { label: 'Diubah' },
      { linkHome: 'https://contoh.id' },
      { 'kualitas.saldoBeda': 9 },
      { fieldBaru: 1 },
    ];
    for (const ubah of coba) {
      await assertFails(updateDoc(refBulan(d), { 'debetSenPerKategori.KOSONG': increment(1), ...ubah, ...jejakBulan(p) }));
    }
  });

  test('jejak bulan palsu atau tanpa jejak ditolak', async () => {
    const d = db('editor');
    const ubah = { 'debetSenPerKategori.KOSONG': increment(1) };
    await assertFails(updateDoc(refBulan(d), ubah));
    await assertFails(updateDoc(refBulan(d), { ...ubah, ...jejakBulan(p), diperbaruiOleh: 'u-lain' }));
    await assertFails(updateDoc(refBulan(d), { ...ubah, ...jejakBulan(p), diperbaruiPada: Timestamp.now() }));
    await assertFails(updateDoc(refBulan(d), { ...ubah, diperbaruiOleh: p.uid }));
  });

  test('kunci map ringkasan di luar daftar ditolak', async () => {
    const d = db('editor');
    for (const kunci of [
      'debetSenPerKategori.VSALES',
      'jumlahPerEntitas.LAIN',
      'debetSenPerEntitasKategori.LAIN.PRODUKSI',
      'kreditSenPerEntitasKategori.CV.LAIN',
    ]) {
      await assertFails(updateDoc(refBulan(d), { [kunci]: increment(1), ...jejakBulan(p) }));
    }
    await assertFails(updateDoc(refBulan(d), { debetSenPerKategori: 5, ...jejakBulan(p) }));
    await assertFails(updateDoc(refBulan(d), { 'debetSenPerEntitasKategori.CV': 5, ...jejakBulan(p) }));
  });

  test('create & delete bulan ditolak (editor & admin)', async () => {
    for (const nama of ['editor', 'admin']) {
      const d = db(nama);
      await assertFails(setDoc(refBulan(d, '2023-13'), { ...buatBulan([]), ...jejakBulan(PENGGUNA[nama]) }));
      await assertFails(deleteDoc(refBulan(d)));
    }
  });
});

describe('riwayat', () => {
  const p = PENGGUNA.editor;
  const baru = (d) => doc(collection(d, 'bulan', BULAN, 'riwayat'));

  test('create sah diterima (ubah_kategori, ubah_entitas, hitung_ulang)', async () => {
    const d = db('editor');
    await assertSucceeds(setDoc(baru(d), riwayatSah(p)));
    await assertSucceeds(setDoc(baru(d), riwayatSah(p, { jenis: 'ubah_entitas', ke: 'CV', dari: { BELUM: 1 } })));
    await assertSucceeds(setDoc(baru(d), riwayatSah(p, {
      jenis: 'hitung_ulang', ke: null, dari: {}, idTransaksi: [], jumlah: JUMLAH_TRX, totalSen: 0,
    })));
  });

  test('pembaca tidak bisa membuat riwayat', async () => {
    await assertFails(setDoc(baru(db('pembaca')), riwayatSah(PENGGUNA.pembaca)));
  });

  test('kunci asing ditolak', async () => {
    const d = db('editor');
    await assertFails(setDoc(baru(d), riwayatSah(p, { catatan: 'tambahan' })));
    await assertFails(setDoc(baru(d), riwayatSah(p, { oleh: p.uid })));
  });

  test('pelaku/waktu palsu ditolak', async () => {
    const d = db('editor');
    await assertFails(setDoc(baru(d), riwayatSah(p, { olehUid: 'u-lain' })));
    await assertFails(setDoc(baru(d), riwayatSah(p, { olehEmail: 'lain@contoh.id' })));
    await assertFails(setDoc(baru(d), riwayatSah(p, { waktu: Timestamp.now() })));
    const { waktu, ...tanpaWaktu } = riwayatSah(p);
    await assertFails(setDoc(baru(d), tanpaWaktu));
  });

  test('jenis & nilai ke tidak sah ditolak', async () => {
    const d = db('editor');
    await assertFails(setDoc(baru(d), riwayatSah(p, { jenis: 'pindah_kategori' })));
    await assertFails(setDoc(baru(d), riwayatSah(p, { jenis: 'hapus' })));
    await assertFails(setDoc(baru(d), riwayatSah(p, { jenis: 'ubah_kategori', ke: 'CV' })));
    await assertFails(setDoc(baru(d), riwayatSah(p, { jenis: 'ubah_entitas', ke: 'PRODUKSI' })));
    await assertFails(setDoc(baru(d), riwayatSah(p, { jenis: 'hitung_ulang', ke: 5 })));
    await assertFails(setDoc(baru(d), riwayatSah(p, { dari: 'KOSONG' })));
    await assertFails(setDoc(baru(d), riwayatSah(p, { jumlah: '1' })));
    await assertFails(setDoc(baru(d), riwayatSah(p, { totalSen: 1.5 })));
  });

  test('idTransaksi: 200 diterima, 201 ditolak, bukan list ditolak', async () => {
    const d = db('editor');
    const id = (n) => rentang(1, n).map(idTrx);
    await assertSucceeds(setDoc(baru(d), riwayatSah(p, { idTransaksi: id(200), jumlah: 200 })));
    await assertFails(setDoc(baru(d), riwayatSah(p, { idTransaksi: id(201), jumlah: 201 })));
    await assertFails(setDoc(baru(d), riwayatSah(p, { idTransaksi: idTrx(1) })));
    const { idTransaksi, ...tanpaId } = riwayatSah(p);
    await assertFails(setDoc(baru(d), tanpaId));
  });

  test('update & delete riwayat ditolak (editor & admin)', async () => {
    for (const nama of ['editor', 'admin']) {
      const d = db(nama);
      const r = doc(d, 'bulan', BULAN, 'riwayat', 'contoh');
      await assertFails(updateDoc(r, { jumlah: 2 }));
      await assertFails(setDoc(r, riwayatSah(PENGGUNA[nama])));
      await assertFails(deleteDoc(r));
    }
  });
});

describe('perubahan massal seperti klien', () => {
  const p = PENGGUNA.editor;

  test('runTransaction ubah kategori 200 baris + bulan + riwayat diterima dan ringkasan benar', async () => {
    const d = db('editor');
    const nomor = rentang(1, 200);
    const n = await assertSucceeds(ubahLewatTransaksi(d, p, nomor, 'kategori', 'EXSPEDISI'));
    assert.equal(n, 200);
    const { bulan, trx, riwayat } = await bacaSemuaMentah();
    for (const i of nomor) {
      const t = trx.get(idTrx(i));
      assert.equal(t.kategori, 'EXSPEDISI');
      assert.equal(t.diubahOleh, p.uid);
    }
    assert.deepEqual(ringkasanDari(bulan), hitungRingkasan([...trx.values()]));
    assert.equal(bulan.diperbaruiOleh, p.uid);
    const baru = riwayat.filter((r) => r.id !== 'contoh');
    assert.equal(baru.length, 1);
    assert.equal(baru[0].idTransaksi.length, 200);
    assert.equal(baru[0].jenis, 'ubah_kategori');
  });

  test('runTransaction ubah entitas 200 baris (increment debetSenPerEntitasKategori.PT.<KAT>) diterima', async () => {
    const d = db('editor');
    const n = await assertSucceeds(ubahLewatTransaksi(d, p, rentang(11, 210), 'entitas', 'PT'));
    assert.equal(n, 200);
    const { bulan, trx } = await bacaSemuaMentah();
    assert.deepEqual(ringkasanDari(bulan), hitungRingkasan([...trx.values()]));
    assert.equal(bulan.jumlahPerEntitas.PT, 200);
  });

  test('runTransaction berturut-turut (kategori lalu entitas) tetap konsisten, nilai sama dilewati', async () => {
    const d = db('editor');
    await assertSucceeds(ubahLewatTransaksi(d, p, rentang(1, 150), 'kategori', 'PRODUKSI'));
    await assertSucceeds(ubahLewatTransaksi(d, p, rentang(100, 210), 'entitas', 'CV'));
    const n = await ubahLewatTransaksi(d, p, rentang(100, 150), 'entitas', 'CV');
    assert.equal(n, 0);
    const { bulan, trx } = await bacaSemuaMentah();
    assert.deepEqual(ringkasanDari(bulan), hitungRingkasan([...trx.values()]));
  });

  test('writeBatch 200 transaksi + bulan + riwayat diterima', async () => {
    const d = db('editor');
    const snap = await getDocs(query(collection(d, 'bulan', BULAN, 'transaksi'), orderBy('urutan')));
    const daftar = snap.docs.slice(0, 200).map((s) => ({ id: s.id, data: s.data() }));
    const rencana = rencanaPerubahan(daftar, 'kategori', 'OPERASIONAL');
    assert.equal(rencana.id.length, 200);
    const batch = writeBatch(d);
    tulisPerubahan(batch, d, p, 'kategori', 'OPERASIONAL', rencana);
    await assertSucceeds(batch.commit());
    const { bulan, trx } = await bacaSemuaMentah();
    assert.deepEqual(ringkasanDari(bulan), hitungRingkasan([...trx.values()]));
  });

  test('satu baris tidak sah membatalkan seluruh transaksi (tidak ada yang berubah)', async () => {
    const d = db('editor');
    const sebelum = await bacaSemuaMentah();
    const gagal = runTransaction(d, async (tx) => {
      const snaps = await Promise.all(rentang(1, 200).map((i) => tx.get(refTrx(d, i))));
      const sah = snaps.slice(0, 199).map((s) => ({ id: s.id, data: s.data() }));
      tulisPerubahan(tx, d, p, 'kategori', 'EXSPEDISI', rencanaPerubahan(sah, 'kategori', 'EXSPEDISI'));
      tx.update(refTrx(d, 200), { kategori: 'TIDAK_SAH', ...jejakTrx(p) });
    });
    await assertFails(gagal);
    const sesudah = await bacaSemuaMentah();
    assert.deepEqual(sesudah.bulan, sebelum.bulan);
    assert.deepEqual([...sesudah.trx.entries()], [...sebelum.trx.entries()]);
    assert.equal(sesudah.riwayat.length, sebelum.riwayat.length);
  });

  test('riwayat 201 id di dalam transaksi membatalkan semuanya', async () => {
    const d = db('editor');
    const gagal = runTransaction(d, async (tx) => {
      const snaps = await Promise.all(rentang(1, 201).map((i) => tx.get(refTrx(d, i))));
      const rencana = rencanaPerubahan(snaps.map((s) => ({ id: s.id, data: s.data() })), 'kategori', 'BANK');
      tulisPerubahan(tx, d, p, 'kategori', 'BANK', rencana);
    });
    await assertFails(gagal);
    const { trx } = await bacaSemuaMentah();
    assert.equal([...trx.values()].filter((t) => t.kategori === 'BANK').length, 0);
  });

  test('pembaca tidak bisa menjalankan perubahan massal', async () => {
    await assertFails(ubahLewatTransaksi(db('pembaca'), PENGGUNA.pembaca, rentang(1, 10), 'kategori', 'BANK'));
  });

  test('hitung ulang (baca semua, tulis absolut + riwayat hitung_ulang) diterima', async () => {
    const d = db('editor');
    await mentah((m) => updateDoc(refBulan(m), { 'debetSenPerKategori.KOSONG': 123456789 }));
    const snap = await getDocs(collection(d, 'bulan', BULAN, 'transaksi'));
    const ringkasan = hitungRingkasan(snap.docs.map((s) => s.data()));
    await assertSucceeds(runTransaction(d, async (tx) => {
      tx.update(refBulan(d), { ...ringkasan, ...jejakBulan(p) });
      tx.set(doc(collection(d, 'bulan', BULAN, 'riwayat')), riwayatSah(p, {
        jenis: 'hitung_ulang', ke: null, dari: {}, idTransaksi: [], jumlah: snap.size, totalSen: 0,
      }));
    }));
    const { bulan, trx } = await bacaSemuaMentah();
    assert.deepEqual(ringkasanDari(bulan), hitungRingkasan([...trx.values()]));
  });
});

describe('pengaturan, impor, dan path lain', () => {
  test('pengaturan hanya bisa ditulis admin', async () => {
    const ubah = (d) => updateDoc(doc(d, 'pengaturan', 'entitas'), { 'detail.CV.label': 'CV Contoh' });
    await assertSucceeds(ubah(db('admin')));
    await assertFails(ubah(db('editor')));
    await assertFails(ubah(db('pembaca')));
    await assertSucceeds(setDoc(doc(db('admin'), 'pengaturan', 'kategori'), { kode: KATEGORI, detail: {} }));
    await assertFails(setDoc(doc(db('editor'), 'pengaturan', 'kategori'), { kode: KATEGORI, detail: {} }));
  });

  test('impor hanya bisa dibaca admin, tidak bisa ditulis dari klien', async () => {
    await assertSucceeds(getDoc(doc(db('admin'), 'impor', 'contoh')));
    await assertSucceeds(getDocs(collection(db('admin'), 'impor')));
    await assertFails(getDoc(doc(db('editor'), 'impor', 'contoh')));
    await assertFails(getDoc(doc(db('pembaca'), 'impor', 'contoh')));
    await assertFails(setDoc(doc(db('admin'), 'impor', 'baru'), { versi: 'x' }));
    await assertFails(updateDoc(doc(db('admin'), 'impor', 'contoh'), { versi: 'x' }));
    await assertFails(deleteDoc(doc(db('admin'), 'impor', 'contoh')));
  });

  test('path lain ditolak, juga untuk admin', async () => {
    const d = db('admin');
    await mentah((m) => setDoc(doc(m, 'lain', 'x'), { a: 1 }));
    await assertFails(getDoc(doc(d, 'lain', 'x')));
    await assertFails(setDoc(doc(d, 'lain', 'y'), { a: 1 }));
    await assertFails(getDoc(doc(d, 'pengguna', 'u-admin')));
    await assertFails(getDoc(doc(d, 'bulan', BULAN, 'lain', 'x')));
    await assertFails(setDoc(doc(d, 'bulan', BULAN, 'lain', 'x'), { a: 1 }));
    await assertFails(getDoc(doc(d, 'bulan', BULAN, 'transaksi', idTrx(1), 'anak', 'x')));
    await assertFails(getDoc(doc(d, 'pengaturan', 'kategori', 'anak', 'x')));
  });
});
