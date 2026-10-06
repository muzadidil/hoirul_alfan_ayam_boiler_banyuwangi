# Folder `firebase/`

Konfigurasi Cloud Firestore untuk ZASHA MUTASI. Folder ini **tidak** disajikan oleh GitHub Pages
(sudah masuk `exclude` di `_config.yml`).

| Berkas | Isi |
| --- | --- |
| `firestore.rules` | Security Rules. Satu-satunya pengaman data, karena situs Pages bisa dibuka siapa saja. |
| `firestore.indexes.json` | Mematikan indeks teks panjang (`ketLengkap`, `ketPendek`, `ketAsli`, `sumber`) di koleksi `transaksi` supaya hemat penyimpanan. |
| `firebase.json` | Lokasi rules/indeks + port emulator lokal (Firestore 8080, Auth 9099, UI aktif). |
| `.firebaserc` | ID project Firebase. **Masih berisi `ganti-dengan-id-project`** (lihat di bawah). |
| `tes/` | Uji rules otomatis (`node:test` + `@firebase/rules-unit-testing`) di emulator. |

## Mengisi `.firebaserc`

File JSON tidak boleh berisi komentar, jadi penjelasannya di sini.
Ganti `ganti-dengan-id-project` dengan ID project Firebase Anda (Console → Project settings → Project ID,
misalnya `zasha-mutasi`). Bisa juga lewat perintah:

```bash
cd firebase
firebase use --add      # pilih project, beri alias "default"
```

ID project bukan rahasia, tetapi jangan pernah menaruh kunci service account di folder ini.

## Ringkasan aturan

Peran dibaca dari custom claims `peran` (`admin`, `editor`, `pembaca`) yang diatur `alat/peran.py`.
Semua akses juga mewajibkan `email_verified == true`. Akun tanpa peran tidak bisa membaca apa pun.

| Path | Baca | Tulis dari browser |
| --- | --- | --- |
| `pengaturan/*` | pembaca | admin |
| `bulan/{YYYY-MM}` | pembaca | editor: hanya 8 map ringkasan + `diperbaruiOleh` (= uid) + `diperbaruiPada` (= `serverTimestamp()`). Kunci map harus kode sah. Tidak bisa create/delete. |
| `bulan/*/transaksi/*` | pembaca | editor: hanya `kategori`, `entitas` (harus kode sah) + jejak `diubahOleh`/`diubahOlehEmail`/`diubahPada`. Tidak bisa create/delete. |
| `bulan/*/riwayat/*` | pembaca | editor: hanya create, kunci terbatas, pelaku & waktu harus asli, `idTransaksi` maksimal 200. |
| `impor/*` | admin | tidak ada (hanya skrip Admin SDK) |
| path lain | ditolak | ditolak |

- Daftar kode di `daftarKategori()` dan `daftarEntitas()` **harus sama** dengan dokumen
  `pengaturan/kategori` dan `pengaturan/entitas`. Kalau menambah kode, ubah keduanya lalu deploy ulang rules.
- Rules sengaja tidak memakai `get()`/`exists()`: satu pindah massal menulis 200 transaksi + 1 bulan
  + 1 riwayat dalam satu `runTransaction`, sedangkan batasnya 20 akses dokumen per request.
- Skrip di `alat/` memakai Admin SDK sehingga tidak terikat rules.

## Deploy

```bash
cd firebase
firebase deploy --only firestore:rules,firestore:indexes
```

Database harus dibuat dalam **production mode**. Jangan pernah memakai test mode.

## Emulator lokal

Butuh Firebase CLI (`npm i -g firebase-tools`) dan Java 11+.

```bash
cd firebase
firebase emulators:start --project demo-zasha --only firestore,auth
```

UI emulator: http://localhost:4000. Lalu buka aplikasi dengan
`http://localhost:<port>/?emulator=1` dan isi data dengan
`FIRESTORE_EMULATOR_HOST=localhost:8080 python alat/impor.py --unggah`.

## Menjalankan uji rules

```bash
cd firebase/tes
npm install
npm run uji        # menyalakan emulator Firestore sementara, menjalankan uji, lalu mematikannya
```

`npm run uji` memakai port 8080, jadi hentikan dulu emulator lain yang sedang jalan. Kalau emulator
sudah menyala, cukup jalankan `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm test`.
Uji memakai project `demo-zasha-uji` (terpisah dari `demo-zasha`), jadi data latihan Anda tidak terhapus.
Semua data uji sintetis.
