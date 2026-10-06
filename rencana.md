# Rencana Migrasi ZASHA MUTASI ke Firestore + GitHub Pages

Tujuan: memindahkan data mutasi bank 2023 dari Google Sheets/Excel ke **Cloud Firestore**, dan memindahkan tampilan dari Apps Script ke **GitHub Pages**. Konsep tampilan yang sekarang (`Index.html`) tetap dipakai. Hasil akhirnya harus bisa dipakai untuk **laporan**.

Aplikasi Apps Script yang lama tetap jalan sampai versi baru selesai diuji (Tahap 6).

Cara memakai dokumen ini: kerjakan tahap demi tahap dari atas. Setiap tahap punya bagian **"Selesai jika"**. Jangan lanjut sebelum syarat itu terpenuhi.

---

## Keputusan yang Sudah Diambil

Semua bisa diubah. Kalau diubah, sesuaikan tahap terkait.

| Hal | Keputusan |
| --- | --- |
| Database | Cloud Firestore edisi Standard, database `(default)`, paket **Spark (gratis)**, lokasi `asia-southeast2` (Jakarta). Lokasi **tidak bisa diganti** setelah dibuat. |
| Login | Firebase Authentication, **masuk dengan Google lewat popup** (`signInWithPopup`). `signInWithRedirect` tidak berfungsi di GitHub Pages. |
| Hak akses | **Custom claims** `peran`: `admin`, `editor`, atau `pembaca`. Diatur dengan skrip lokal. Tanpa peran, pengguna tidak bisa membaca apa pun. |
| Tampilan | HTML + JavaScript modul biasa, tanpa build tool. Firebase JS SDK dari CDN `gstatic.com` (versi dipin). Bootstrap 5 tetap dipakai. |
| Hosting | GitHub Pages dari **repo publik baru** khusus tampilan: `zasha-mutasi-web`. |
| Repo ini | Dijadikan **private**. Isinya file Excel, skrip impor/admin, rules Firestore, dan rencana ini. |
| Skrip | Python 3 (`openpyxl` + `firebase-admin`), dijalankan di komputer lokal. |
| Nominal | Disimpan sebagai **integer sen** (`debetSen`, `kreditSen`, `saldoSen`) supaya penjumlahan tidak menumpuk galat pembulatan. |
| Angka laporan | **Dihitung dari transaksi**, bukan disalin dari `J1` atau `BANK_GLOBAL` (keduanya terbukti salah, lihat "Temuan Data"). |
| Kategori JUL–DES | Diimpor sebagai **`KOSONG` (belum kategori)**. Kategori lama tetap disimpan di `kategoriAsal`, jadi bisa dikembalikan. Alasannya ada di "Temuan Data". |

**Kenapa dua repo.** Di akun GitHub gratis, Pages hanya bisa dari repo publik, sedangkan file Excel tidak boleh publik. Situs Pages juga selalu bisa dibuka siapa saja (bahkan dengan GitHub Pro). Karena itu keamanan data dijaga oleh **login + Firestore Security Rules**. Konfigurasi Firebase (`apiKey` dll.) memang aman untuk terlihat publik.

Cadangan hosting kalau Pages bermasalah: Firebase Hosting (gratis di Spark).

---

## Langkah 0: Amankan Repo Ini (lakukan pertama, hari ini)

Repo `muzadidil/hoirul_alfan_ayam_boiler_banyuwangi` saat ini **publik** (sudah dicek lewat API GitHub). Isinya 13 file Excel keuangan dan 13 ID Google Spreadsheet di `Code.js`.

- [ ] GitHub → repo ini → Settings → General → Danger Zone → **Change visibility → Private**.
- [ ] Buka ke-13 Google Spreadsheet → Bagikan → Akses umum → ubah ke **"Dibatasi"** kalau masih "Siapa saja yang memiliki link".
- [ ] Repo ini **tidak pernah** dijadikan publik lagi, karena riwayat git-nya sudah berisi file Excel.

Selesai jika: repo tidak bisa dibuka tanpa login, dan spreadsheet tidak bisa dibuka lewat link saja.

---

## Gambaran Arsitektur

```
Laptop admin (lokal)                               Browser (HP/PC)
  alat/impor.py  ──(Admin SDK)──►  Cloud Firestore  ◄──(login Google + rules)──  GitHub Pages
  alat/peran.py                    asia-southeast2                                zasha-mutasi-web
  alat/ekspor.py
```

Tidak ada server sendiri dan tidak ada Cloud Functions (butuh paket berbayar). Semua logika ada di browser, dan batas aman ditegakkan oleh Security Rules.

### Struktur Repo Ini (private) setelah Migrasi

```
alat/
  bersih.py           # aturan pembersihan (dipakai impor.py)
  impor.py            # Excel → bersihkan → cek → unggah
  peran.py            # set peran pengguna (custom claims)
  hitung_ulang.py     # hitung ulang ringkasan bulan dari transaksi
  ekspor.py           # backup Firestore → JSON + CSV lokal
  requirements.txt
firebase/
  firestore.rules
  firestore.indexes.json
  firebase.json
lama/                 # Code.js dan Index.html dipindah ke sini sebagai arsip
*.xlsx                # tetap di sini sampai Tahap 7
.gitignore
README.md
rencana.md
```

`.gitignore` minimal: `keluaran/`, `backup/`, `.venv/`, `__pycache__/`, `*-sa.json`, `serviceAccount*.json`, `kunci/`.

### Model Data Firestore

```
pengaturan/kategori                    daftar kategori (label, ikon, urutan)
bulan/{YYYY-MM}                        ringkasan satu bulan
bulan/{YYYY-MM}/transaksi/{id}         satu baris mutasi
bulan/{YYYY-MM}/riwayat/{auto-id}      catatan setiap aksi pindah kategori
impor/{id}                             log setiap kali skrip impor dijalankan
```

**`pengaturan/kategori`**

```json
{
  "kode": ["KOSONG", "PRIBADI", "PRODUKSI", "EXSPEDISI", "V_SALES", "OPERASIONAL", "NURUL_AINI", "BANK"],
  "detail": {
    "KOSONG":   { "label": "Belum Kategori", "ikon": "📄", "urutan": 0 },
    "PRIBADI":  { "label": "Pribadi",        "ikon": "👤", "urutan": 1 },
    "PRODUKSI": { "label": "Produksi",       "ikon": "🏭", "urutan": 2 }
  }
}
```

"Belum kategori" disimpan eksplisit sebagai `"KOSONG"`, bukan `null` atau field kosong. Dengan begitu query dan rules tetap sederhana.

**`bulan/2023-01`** (angka contoh)

```json
{
  "kode": "2023-01", "tahun": 2023, "bulan": 1, "label": "Januari 2023",
  "saldoAwalSen": 0, "saldoAkhirSen": 0,
  "jumlahTransaksi": 679,
  "totalDebetSen": 0, "totalKreditSen": 0,
  "debetSenPerKategori":  { "KOSONG": 0, "PRIBADI": 0, "PRODUKSI": 0 },
  "kreditSenPerKategori": { "KOSONG": 0, "PRIBADI": 0, "PRODUKSI": 0 },
  "jumlahPerKategori":    { "KOSONG": 0, "PRIBADI": 0, "PRODUKSI": 0 },
  "linkHome": "https://alfan.zasha.online/bulan/januari.php",
  "diperbaruiOleh": null, "diperbaruiPada": null
}
```

Dashboard cukup membaca 12 dokumen ini, bukan ribuan transaksi.

**`bulan/2023-01/transaksi/2023-01-r0003`**

```json
{
  "bulan": "2023-01",
  "tanggal": "2023-01-02",
  "urutan": 3,
  "ketPendek": "TRSF E-BANKING DB",
  "ketLengkap": "TRSF E-BANKING DB TANGGAL :30/12 ... CONTOH NAMA",
  "ketAsli": null,
  "jenis": "DB",
  "debetSen": 150000000, "kreditSen": 0, "saldoSen": 850000000,
  "kategori": "EXSPEDISI",
  "kategoriAsal": "EXSPEDISI",
  "saran": null,
  "perluCek": [],
  "sumber": { "file": "1. JAN_2023.xlsx", "baris": 3 },
  "diubahOleh": null, "diubahOlehEmail": null, "diubahPada": null
}
```

- ID = `{bulan}-r{nomor baris Excel 4 digit}`. Deterministik, jadi impor aman diulang.
- `tanggal` berupa teks `YYYY-MM-DD` (tanpa zona waktu).
- `ketAsli` berisi teks asli kalau keterangan diperbaiki.
- `kategoriAsal` = kategori dari Excel. Nilai ini tidak pernah diubah aplikasi.
- `saran` = usulan kategori otomatis (lihat Tahap 2).
- `perluCek` berisi penanda seperti `tanggal_ditukar`, `keterangan_diperbaiki`, `kategori_diragukan`, atau `saldo_beda`.

**`bulan/2023-01/riwayat/{auto-id}`** (satu dokumen per aksi, bukan per baris)

```json
{
  "waktu": "<serverTimestamp>", "olehUid": "...", "olehEmail": "...",
  "jenis": "pindah_kategori", "ke": "PRIBADI", "dari": { "KOSONG": 2, "PRODUKSI": 1 },
  "idTransaksi": ["2023-01-r0003", "2023-01-r0010", "2023-01-r0042"],
  "jumlah": 3, "totalSen": 4500000
}
```

### Cara Total Tetap Benar Tanpa Cloud Functions

Saat kategori diubah, browser menjalankan **satu `runTransaction`**:

1. Baca ulang dokumen transaksi yang dipilih, supaya kategori lamanya pasti nilai terbaru.
2. Untuk tiap baris, kurangi ringkasan kategori lama dan tambah ke kategori baru dengan `increment()`. Ini berlaku untuk `debetSenPerKategori`, `kreditSenPerKategori`, dan `jumlahPerKategori`.
3. Tulis `kategori`, `diubahOleh`, `diubahOlehEmail`, `diubahPada` (`serverTimestamp()`) di tiap baris.
4. Tulis 1 dokumen `riwayat`.

Pindah massal dipotong per **200 baris** per transaction (batas Firestore 500 tulis).

Pengaman tambahan:
- Saat satu bulan dimuat, browser membandingkan ringkasan tersimpan dengan hasil hitungan dari transaksi. Kalau beda, muncul banner **"Ringkasan tidak cocok — Perbaiki"** (khusus admin).
- `alat/hitung_ulang.py` menulis ulang semua ringkasan dari transaksi.

### Security Rules (`firebase/firestore.rules`)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function masuk()   { return request.auth != null && request.auth.token.email_verified == true; }
    function peran()   { return request.auth.token.get('peran', ''); }
    function pembaca() { return masuk() && peran() in ['admin', 'editor', 'pembaca']; }
    function editor()  { return masuk() && peran() in ['admin', 'editor']; }
    function admin()   { return masuk() && peran() == 'admin'; }

    function hanyaUbah(kunci) {
      return request.resource.data.diff(resource.data).affectedKeys().hasOnly(kunci);
    }
    // Daftar ini HARUS sama dengan pengaturan/kategori.kode.
    // Ditulis langsung di sini supaya rules tidak perlu membaca dokumen (batas 20 akses per transaction).
    function kategoriSah(k) {
      return k in ['KOSONG','PRIBADI','PRODUKSI','EXSPEDISI','V_SALES','OPERASIONAL','NURUL_AINI','BANK'];
    }

    match /pengaturan/{id} {
      allow read: if pembaca();
      allow write: if admin();
    }

    match /bulan/{bulanId} {
      allow read: if pembaca();
      allow update: if editor()
        && hanyaUbah(['debetSenPerKategori', 'kreditSenPerKategori', 'jumlahPerKategori',
                      'diperbaruiOleh', 'diperbaruiPada'])
        && request.resource.data.diperbaruiOleh == request.auth.uid
        && request.resource.data.diperbaruiPada == request.time;

      match /transaksi/{trxId} {
        allow read: if pembaca();
        allow update: if editor()
          && hanyaUbah(['kategori', 'diubahOleh', 'diubahOlehEmail', 'diubahPada'])
          && kategoriSah(request.resource.data.kategori)
          && request.resource.data.diubahOleh == request.auth.uid
          && request.resource.data.diubahOlehEmail == request.auth.token.email
          && request.resource.data.diubahPada == request.time;
      }

      match /riwayat/{logId} {
        allow read: if pembaca();
        allow create: if editor()
          && request.resource.data.olehUid == request.auth.uid
          && request.resource.data.olehEmail == request.auth.token.email
          && request.resource.data.waktu == request.time
          && request.resource.data.jenis in ['pindah_kategori', 'hitung_ulang']
          && request.resource.data.idTransaksi is list
          && request.resource.data.idTransaksi.size() <= 200;
      }
    }

    match /impor/{id} {
      allow read: if admin();
    }
  }
}
```

- Hapus dan buat transaksi dari browser **tidak diizinkan**. Data hanya masuk lewat skrip (Admin SDK, tidak terikat rules).
- Buat database dalam **production mode**. Jangan pernah memakai test mode atau `allow read, write: if true`, karena situsnya publik.
- Uji rules di Firebase Emulator (gratis, lokal) sebelum deploy. Skenario: tanpa login (ditolak), login tanpa peran (ditolak), pembaca menulis (ditolak), editor mengubah `debetSen` (ditolak), editor dengan kategori tidak sah (ditolak), editor pindah 200 baris (diterima), hapus riwayat (ditolak).

### Kuota Paket Gratis

Kuota gratis Firestore: 50.000 baca/hari, 20.000 tulis/hari, 20.000 hapus/hari, penyimpanan 1 GiB, transfer keluar 10 GiB/bulan. Kuota direset tengah malam waktu Pasifik, yaitu **sekitar pukul 14.00–15.00 WIB**. Kalau kuota habis di paket Spark, aplikasi **berhenti** sampai reset (tanpa tagihan).

| Kegiatan | Perkiraan |
| --- | --- |
| Impor awal 2023 | ±7.100 tulis, sekali |
| Buka dashboard | ±13 baca |
| Buka satu bulan | ±600 baca (maks ±680) |
| Pindah antarhalaman kategori di bulan yang sama | **0 baca** (data sudah di memori) |
| Pindah kategori N baris | N baca + (N + 2) tulis |
| Backup penuh / hitung ulang semua | ±7.100 baca |

Syarat agar hemat: satu bulan dimuat **sekali per sesi** lalu disimpan di memori. Jangan memuat ulang setiap pindah halaman seperti di Apps Script sekarang (8 halaman × 600 = 4.800 baca per sesi). Kalau suatu saat kurang, pindah ke paket Blaze dan pasang budget alert. Biaya untuk data sebesar ini sangat kecil.

---

## Tahap 1: Siapkan Firebase

- [ ] Buat project di [console.firebase.google.com](https://console.firebase.google.com) (misalnya `zasha-mutasi`), paket Spark.
- [ ] Firestore Database → Create database → edisi Standard, `(default)` → **production mode** → lokasi **`asia-southeast2`**.
- [ ] Authentication → Sign-in method → aktifkan **Google**.
- [ ] Authentication → Settings → Authorized domains → tambah `muzadidil.github.io` (`localhost` sudah ada bawaan).
- [ ] Project settings → Your apps → tambah **Web app** → salin objek `firebaseConfig`.
- [ ] Kredensial untuk skrip lokal, pilih salah satu:
  - Tanpa file kunci (disarankan): pasang Google Cloud CLI, lalu `gcloud auth application-default login`.
  - Atau Project settings → Service accounts → Generate new private key. Simpan **di luar folder repo** (misalnya `~/.config/zasha/sa.json`) dan arahkan `GOOGLE_APPLICATION_CREDENTIALS` ke file itu. Hapus kunci ini setelah migrasi selesai.
- [ ] Pasang Firebase CLI (`npm i -g firebase-tools`). Isi folder `firebase/`, uji rules di emulator (`firebase emulators:start --only firestore`), lalu deploy: `firebase deploy --only firestore:rules,firestore:indexes`.
- [ ] Google Cloud Console → APIs & Services → Credentials → batasi API key ke HTTP referrer `https://muzadidil.github.io/*`, domain sendiri (Tahap 6), dan `http://localhost:*`.

`firebase/firestore.indexes.json`: matikan indeks untuk teks panjang supaya penyimpanan lebih hemat.

```json
{
  "indexes": [],
  "fieldOverrides": [
    { "collectionGroup": "transaksi", "fieldPath": "ketLengkap", "indexes": [] },
    { "collectionGroup": "transaksi", "fieldPath": "ketPendek",  "indexes": [] },
    { "collectionGroup": "transaksi", "fieldPath": "ketAsli",    "indexes": [] },
    { "collectionGroup": "transaksi", "fieldPath": "sumber",     "indexes": [] }
  ]
}
```

Selesai jika: rules terpasang dan lolos semua skenario uji emulator, dan skrip lokal bisa terhubung ke project.

---

## Tahap 2: Skrip Impor + Pembersihan Data

Perintah:

```
pip install -r alat/requirements.txt
python alat/impor.py --cek                                   # tidak menyentuh Firestore
FIRESTORE_EMULATOR_HOST=localhost:8080 python alat/impor.py --unggah   # latihan di emulator
python alat/impor.py --unggah                                # produksi
python alat/peran.py email@pemilik.com admin
```

Mode skrip:
- `--cek` membaca semua Excel, membersihkan, lalu menulis ke `keluaran/` (di-.gitignore):
  - `transaksi_2023.csv`: semua transaksi bersih, beserta kolom `perluCek`.
  - `ringkasan_2023.csv`: per bulan dan per kategori.
  - `laporan_cek.txt`: hasil pemeriksaan di bawah, daftar baris bertanda, dan perbandingan dengan `J1` dan `BANK_GLOBAL`.
- `--unggah` **tidak menimpa** transaksi yang sudah ada. Dokumen yang ada dilewati, sehingga kategori yang sudah diubah lewat aplikasi aman. Opsi `--timpa-kategori` harus disebut eksplisit.
- Penulisan dilakukan per batch maksimal 400 dokumen. Setelah transaksi, skrip menulis `bulan/*`, `pengaturan/kategori`, dan satu dokumen `impor/{id}`.

### Aturan Pembersihan (hasil audit semua 12 file)

Kolom tab master: A tanggal, B keterangan pendek, C keterangan lengkap, D debet, E kredit, F `DB`/`CR`, G saldo, H saldo (duplikat), I kategori.

1. **Tab master**: cari tab bernama `<MMM>_2023` (JAN, FEB, MAR, APR, MEI, JUN, JUL, AGU, SEP, OKT, NOV, DES → 01–12). Nama file tidak dipakai karena polanya tidak seragam. Tab kategori (`PRODUKSI` dll.) **tidak diimpor**, karena isinya hanya rumus `QUERY` dari tab master.
2. **Baris 1** kosong, lewati.
3. **Baris `SALDO AWAL`** (baris 2): bukan transaksi. Ambil kolom G sebagai `saldoAwalSen`. Kolom E di baris ini berisi rumus total kredit, jadi **jangan** dihitung sebagai transaksi.
4. **Baris kosong** (A–F kosong semua): buang. Sebagian besar ada di FEB (±133 baris).
5. **Baris penutup** (`MUTASI CR`, `MUTASI DB`, `SALDO AKHIR` di kolom B): buang (ada di SEP).
6. **Tanggal**:
   - Tahun selalu **2023**, karena 10 dari 12 file tersimpan bertahun 2026.
   - Bulan diambil dari nama tab, hari dari sel.
   - Kalau bulan di sel ≠ bulan tab tapi **hari** di sel = bulan tab, tukar hari dan bulan, lalu tandai `tanggal_ditukar`. Ini terjadi di JUN (±168 sel; 2 Juni tersimpan sebagai 6 Februari).
   - Tanggal berupa teks `YYYY-MM-DD` (JUN, ±346 sel) diparse dengan aturan yang sama.
   - Validasi hari ≤ jumlah hari bulan itu.
   - Hasilnya, semua transaksi punya tanggal dan urut naik sepanjang tahun.
7. **Nominal**: D dan E → `round(nilai × 100)` sebagai integer sen. Teks angka (`"1,234,567.00"`) diparse dulu (±3 sel di FEB). `jenis` diambil dari kolom F, atau dari kolom yang terisi kalau F kosong.
8. **Kolom B kosong** tapi C ada: isi B dari C.
9. **Baris `BUNGA` yang tercatat di debet**: pindahkan ke kredit (JAN–APR, 1 baris per bulan). Setelah perbaikan ini, saldo antarbulan tersambung.
10. **Keterangan rusak**: teks seperti `Tue Sep 29 2026 14:00:00 GMT+0700 (Western Indonesia Time)` dikembalikan ke `dd/mm` (contoh `29/09`). Ini ada di semua bulan, ±1.540 sel. Simpan teks asli di `ketAsli` dan tandai `keterangan_diperbaiki`. Keterangan yang tertulis dua kali persis (misalnya di OKT/NOV) dipotong salinan keduanya.
11. **Saldo**: hitung ulang berurutan (`saldo = sebelumnya − debet + kredit`) mulai dari `saldoAwalSen`. Kalau beda dengan kolom G lebih dari Rp 1, tandai `saldo_beda`. `saldoAkhirSen` = saldo baris terakhir.
12. **Kategori**:
    - Rapikan spasi dan huruf besar. Kosong → `KOSONG`. `VSALES` → `V_SALES`.
    - Simpan nilai aslinya di `kategoriAsal`.
    - **JUL–DES**: `kategori` = `KOSONG` dan tandai `kategori_diragukan`. Opsi `--pakai-kategori-asal` membatalkan aturan ini.
    - **APR & MEI**: kategori dipakai, tapi tandai `kategori_diragukan` untuk baris yang berbeda dari saran (lihat no. 13).
13. **Saran kategori**: dari bulan yang kategorinya rapi (JAN, FEB, MAR, JUN), buat peta **pihak transaksi → kategori**. Pihak transaksi = nama di akhir keterangan, dipisah DB/CR. Hanya pihak yang muncul ≥ 5 kali dengan ≥ 90% kategori sama yang dipakai. Isi `saran` untuk **setiap** transaksi yang pihaknya ada di peta. Aplikasi hanya menampilkan saran kalau `saran` ≠ `kategori`. Simpan peta ini di `keluaran/peta_saran.csv` supaya bisa diperiksa.

### Pemeriksaan yang Harus Lolos (`--cek`)

- [ ] Total **7.039 transaksi**: semua punya tanggal, urut naik sepanjang tahun, dan ID unik.
- [ ] Tidak ada baris yang debet dan kreditnya sama-sama kosong atau sama-sama terisi.
- [ ] Total kredit per bulan **sebelum** aturan 9 (BUNGA) sama dengan kolom `KREDIT` di `BANK_GLOBAL.xlsx` (selisih ≤ Rp 1). September dikecualikan karena KREDIT-nya kosong di `BANK_GLOBAL`.
- [ ] Untuk JAN–JUN, total debet per kategori (dari `kategoriAsal`) sama dengan `J1` tab kategori. Pengecualian yang sudah diketahui: PRODUKSI JAN, PRODUKSI FEB, dan PRIBADI FEB. Selisihnya dicatat di laporan.
- [ ] Saldo akhir bulan = saldo awal bulan berikutnya. Pengecualian yang sudah diketahui: **MEI→JUN** dan **AGU→SEP** selisih ribuan rupiah (kemungkinan biaya bank yang tidak tercatat). Catat di laporan, jangan dipaksa.
- [ ] Jumlah per `kategoriAsal` mendekati: PRODUKSI 2.484, PRIBADI 2.341, KOSONG 1.764, EXSPEDISI 283, V_SALES 73, BANK 61, NURUL_AINI 30, OPERASIONAL 3.

Urutan kerja:
1. Jalankan `--cek` sampai lolos.
2. Pemilik membaca `laporan_cek.txt`.
3. Latihan `--unggah` di emulator.
4. Bekukan Google Sheets lama (ubah semua pengguna jadi "Pelihat") supaya tidak ada dua sumber data.
5. Jalankan `--unggah` ke produksi.
6. Jalankan `peran.py` untuk pemilik.

Selesai jika: Firestore Console menampilkan 12 dokumen `bulan` beserta subkoleksi `transaksi`, dan angka di dokumen `bulan` sama dengan `keluaran/ringkasan_2023.csv`.

---

## Tahap 3: Tampilan Baca-Saja (repo publik baru `zasha-mutasi-web`)

Struktur:

```
index.html             # kerangka halaman (dari Index.html, tanpa <? ?>)
css/zasha.css          # gaya dari Index.html
js/firebase-config.js  # firebaseConfig (memang publik)
js/auth.js             # login popup, baca peran dari token, keluar
js/data.js             # semua akses Firestore + cache memori per bulan
js/app.js              # routing, render dashboard/tabel, paginasi, pencarian
js/laporan.js          # Tahap 5
.nojekyll
README.md
```

Repo ini **tidak boleh** berisi data, file Excel, ID spreadsheet, atau kunci apa pun. Aktifkan Settings → Code security → Secret scanning + Push protection.

Padanan dari kode lama:

| Kode lama | Versi baru |
| --- | --- |
| `doGet(e)` + `?p=&bulan=` (`Code.js:21`) | `URLSearchParams` + `history.pushState` di `app.js`. Parameter tetap `?p=bank&bulan=2023-01`; tanpa `bulan` = dashboard. Kode lama `JAN_2023` dipetakan ke `2023-01` supaya bookmark lama tetap jalan. |
| Scriptlet `daftarBulan` (`Index.html:44-62`) | Dropdown bulan diisi dari koleksi `bulan`, dengan pemilih tahun (siap untuk 2024 dst.). |
| `judulMap` (`Code.js:31`), menu kategori (`Index.html:70-79`), `masterKategori` (`Index.html:162`) | Dibuat dari `pengaturan/kategori`. |
| `google.script.run.getDataFromSheet` | `muatBulan(kode)`: `onSnapshot` pada `bulan/{kode}/transaksi` diurutkan `urutan`. Dimuat sekali, disimpan di `Map` memori; perubahan dari pengguna lain langsung terlihat. Berhenti berlangganan saat ganti bulan. |
| Halaman kategori & `kosong` | Filter di browser atas data bulan di memori (0 baca tambahan). |
| Dashboard dari `DASHBOARD!A2:K13` | Dokumen `bulan` untuk tahun terpilih. TOTAL DEBIT = **semua debet**, kolom BANK ikut ditampilkan. |
| Footer "TOTAL SALDO (J1)" | Jumlah `debetSen` halaman aktif, dihitung di browser. Halaman bank menampilkan saldo akhir (bukan teks "ONLINE"). |
| `formatDate` dd/MM | Tetap tampil `dd/MM` di tabel. Tanggal lengkap tersimpan. |
| Tombol HOME | Pakai `linkHome` di dokumen bulan. |

Yang ditambahkan:
- Halaman login (tombol **Masuk dengan Google**, popup dipicu langsung oleh klik). Kalau akun belum punya peran, tampilkan "Akun <email> belum diberi akses, hubungi admin".
- Tombol keluar.
- Aplikasi dibuka sebagai **halaman penuh**, bukan di dalam iframe, karena popup login di iframe sering diblokir. Kode lama memakai `ALLOWALL`; cek apakah aplikasi lama disematkan di `alfan.zasha.online`, lalu ganti dengan tautan biasa.
- Filter **"Perlu cek"** untuk menampilkan baris bertanda `perluCek`.
- `<meta http-equiv="Content-Security-Policy">`, karena GitHub Pages tidak bisa mengatur header. Isinya hanya mengizinkan `self`, `www.gstatic.com`, `cdn.jsdelivr.net`, `apis.google.com`, `*.googleapis.com`, `accounts.google.com`, dan `<project>.firebaseapp.com`.
- Versi Firebase SDK dan Bootstrap dipin (bukan "latest"), dan memakai atribut `integrity` untuk file jsDelivr.

Bug lama yang **wajib** tidak ikut terbawa:
- [ ] `updateCount()` mengakses `modalCount` yang tidak ada (`Index.html:236`). Ini membuat tabel bulanan tidak pernah tampil.
- [ ] Keterangan dan nama kategori dimasukkan ke `innerHTML` tanpa escape (`Index.html:192-230`). Pakai `textContent` atau `escapeHtml()`. Di situs publik ini celah pencurian sesi.
- [ ] Tidak ada penanganan gagal. Semua akses Firestore pakai `try/catch/finally`: pesan error tampil di halaman (bukan `alert`), dan loader selalu disembunyikan.
- [ ] `filterData()` error kalau keterangan bukan teks (`Index.html:240`).
- [ ] `colspan="5"` di baris "Tidak ada data", padahal halaman kategori punya 6 kolom (`Index.html:228`).
- [ ] Tombol paginasi `›` tidak punya batas atas (`Index.html:241`).
- [ ] Halaman bank memakai kolom B, halaman kategori kolom C (`Code.js:81` vs `:91`). Tampilkan `ketLengkap` di keduanya.
- [ ] Halaman bank menampilkan baris `SALDO AWAL` sebagai transaksi (`Code.js:81`). Versi baru menampilkannya sebagai info saldo awal di atas tabel.

Uji lokal: `python -m http.server 8000` di folder repo, lalu buka `http://localhost:8000`.

Selesai jika: login berhasil; akun tanpa peran ditolak; dashboard menampilkan 12 bulan; setiap halaman bulan/kategori tampil; dan angkanya sama dengan `keluaran/ringkasan_2023.csv`.

---

## Tahap 4: Ubah Kategori

- [ ] Dropdown per baris dan pindah massal (checkbox + modal) memakai `runTransaction` seperti di "Cara Total Tetap Benar".
- [ ] Pilihan **"Belum Kategori"** (`KOSONG`) di dropdown, untuk membatalkan. Versi lama tidak punya ini.
- [ ] Pindah massal dipotong otomatis per 200 baris, dengan progres yang terlihat.
- [ ] Kalau gagal: baris **tidak** dihapus dari layar, dan pesan error tampil. Versi lama tetap menghapus baris walau gagal (`Index.html:239`).
- [ ] **Terima saran**: tombol per baris, dan tombol massal "Terima semua saran di halaman ini". Ini mempercepat pengisian ulang kategori JUL–DES.
- [ ] Pembaca tidak melihat dropdown, checkbox, dan tombol saran.
- [ ] Banner "Ringkasan tidak cocok — Perbaiki" untuk admin.

Selesai jika:
- Pindah 1 baris dan 200 baris berhasil, dan total di footer serta dashboard langsung berubah dengan benar.
- `hitung_ulang.py` menghasilkan angka yang sama dengan ringkasan di Firestore.
- Akun pembaca ditolak saat menulis.

---

## Tahap 5: Laporan

Ini kebutuhan utamanya. Semua angka berasal dari Firestore.

- [ ] **Rekap tahunan** pengganti `BANK_GLOBAL`, dengan angka yang benar. Isinya tabel 12 bulan × kategori untuk debet dan kredit, total baris dan kolom, saldo awal dan akhir, serta jumlah transaksi yang masih `KOSONG` per bulan. Sumbernya 12 dokumen `bulan`, jadi murah.
- [ ] **Laporan bulanan per kategori**: ringkasan di atas, lalu daftar transaksi dikelompokkan per kategori beserta subtotalnya.
- [ ] **Daftar belum dikategorikan** dan **daftar perlu cek** per bulan, untuk dikerjakan.
- [ ] **Cetak / PDF**: gaya `@media print` (sembunyikan navigasi dan tombol). PDF disimpan lewat dialog cetak browser.
- [ ] **Unduh Excel/CSV** untuk rekap tahunan, satu bulan, atau satu kategori. Dibuat dari data yang sudah dimuat (0 baca tambahan) dengan SheetJS dari `cdnjs.cloudflare.com`.
- [ ] Filter rentang tanggal dan rentang nominal di halaman transaksi.
- [ ] Setiap laporan menampilkan catatan kalau bulan itu masih punya transaksi `KOSONG` atau `perluCek`, supaya angkanya tidak dianggap final.

Selesai jika: rekap tahunan cocok dengan `keluaran/ringkasan_2023.csv` (untuk kategori yang belum diubah), dan file Excel hasil unduhan bisa dibuka serta angkanya sama dengan layar.

---

## Tahap 6: Rilis

- [ ] Repo `zasha-mutasi-web` → Settings → Pages → Deploy from branch `main` / root.
- [ ] (Opsional) Domain sendiri, misalnya `mutasi.zasha.online`. Urutannya wajib:
  1. Verifikasi domain `zasha.online` di Settings akun GitHub → Pages (rekaman TXT).
  2. Isi custom domain di Settings → Pages repo **dulu**.
  3. Baru buat CNAME `mutasi` → `muzadidil.github.io` di DNS. Jangan pakai wildcard `*.zasha.online`.
  4. Centang **Enforce HTTPS** (bisa butuh sampai 24 jam).
  5. Tambahkan domain ke Firebase Authorized domains dan ke batasan API key.
- [ ] Uji di HP (Android Chrome) dan laptop (Chrome, Firefox/Safari).
- [ ] Jalankan versi lama (hanya-lihat) dan baru berdampingan 1–2 minggu, lalu bandingkan angka untuk JAN–JUN.
- [ ] Setelah yakin: matikan deployment Apps Script (Deploy → Manage deployments → Archive), dan ubah tautan di `alfan.zasha.online` ke alamat baru.

---

## Tahap 7: Operasional dan Data Baru

- [ ] **Backup**: `alat/ekspor.py` membaca semua koleksi lalu menulis JSON + CSV per bulan ke folder lokal **di luar repo** (atau Google Drive pribadi). Jalankan setelah sesi kategorisasi besar dan minimal sebulan sekali. Ekspor otomatis bawaan Google butuh paket Blaze.
- [ ] **Bulan baru (2024 dst.)**: tambahkan `alat/impor.py --csv <file mutasi BCA> --bulan 2024-01`, memakai `bersih.py` yang sama. Parser dibuat dari **contoh file CSV asli** dari KlikBCA/myBCA. ID transaksi dari CSV = `{bulan}-{16 hex hash isi baris}`, jadi impor ulang file yang sama aman. Kategori awal `KOSONG` + `saran`. Nanti bisa dipindah ke halaman admin (unggah CSV di browser).
- [ ] Panduan singkat untuk pengguna (1 halaman): login, pindah kategori, terima saran, cetak/unduh laporan.
- [ ] Setelah semua data aman di Firestore dan ada backup: pindahkan file Excel ke Google Drive pribadi dan hapus dari repo ini.

---

## Temuan Data (dasar keputusan di atas)

Hasil audit semua file Excel:

- **Kategori JUL–DES tidak bisa dipercaya.** Kolom kategori AGU **identik** dengan JUL di semua 620 posisi baris. SEP, OKT, NOV, dan DES ±97% identik dengan JUL, dan jumlah PRODUKSI-nya tepat 138 setiap bulan. Ini tanda salin-tempel per posisi baris, bukan per transaksi. Dicek dengan pihak transaksi yang kategorinya konsisten di bulan lain: JAN, FEB, MAR, dan JUN cocok 99–100%, APR 78%, MEI 52%, sedangkan **JUL–DES hanya 25–32%**.
- **`BANK_GLOBAL` TOTAL DEBIT hanya menjumlah 3 kategori.** Rumusnya `=SUM(B:D)`, yaitu KOSONG + PRIBADI + PRODUKSI. EXSPEDISI, V_SALES, OPERASIONAL, NURUL_AINI, dan BANK tidak ikut. Akibatnya total pengeluaran di dashboard lama **lebih kecil dari sebenarnya setiap bulan**, sehingga SELISIH juga salah.
- Kolom KREDIT di `BANK_GLOBAL` diambil dengan `IMPORTRANGE` dari sel `E2` tiap file bulanan, dan nilainya benar. Pengecualiannya **September**: KREDIT-nya kosong sehingga SELISIH = −TOTAL DEBIT.
- **`J1` di tab kategori tidak selalu cocok dengan tab master**: PRODUKSI JAN & FEB dan PRIBADI FEB lebih kecil dari jumlah baris berkategori itu di tab master.
- **Transaksi kredit juga diberi kategori**, tapi tidak pernah dijumlahkan di mana pun. Versi baru menjumlahkannya (`kreditSenPerKategori`).
- **Kategori `BANK`** dipakai di 61 transaksi tapi tidak muncul di dashboard lama.
- Tanggal bertahun 2026, hari/bulan tertukar di JUN, ±1.540 keterangan rusak, dan baris `BUNGA` di kolom debet sudah ditangani oleh aturan pembersihan di Tahap 2.

---

## Tidak Dikerjakan Dulu

- Cloud Functions, App Check, notifikasi, halaman admin untuk unggah CSV. Bisa ditambah setelah Tahap 6.
- Perbaikan `Code.js` / `Index.html` lama. Aplikasi lama hanya dipakai sampai versi baru siap, dan rencana perbaikannya di versi sebelumnya digantikan oleh Tahap 3.
