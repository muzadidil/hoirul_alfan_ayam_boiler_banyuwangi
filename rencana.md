# Rencana Pengembangan ZASHA MUTASI

## Status Saat Ini

- [x] Backend Apps Script (`Code.js`) dengan routing, baca data, dan update kategori
- [x] Tampilan web (`Index.html`) untuk dashboard dan transaksi bulanan
- [x] Data 12 bulan 2023 + `BANK_GLOBAL`
- [x] Repo GitHub berisi `BANK_GLOBAL.xlsx`
- [ ] File bulanan, `Code.js`, `Index.html` belum di-push

## Tahap 1: Perbaikan Segera

- [ ] Perbaiki bug `updateCount()` di `Index.html`: elemen `modalCount` tidak ada, sehingga muncul error JavaScript. Hapus barisnya atau tambahkan elemen di modal.
- [ ] Ganti `baris: values.indexOf(row) + 1` di `Code.js`. Hasilnya benar, tapi mencari ulang seluruh data untuk setiap baris sehingga lambat pada sheet besar. Simpan nomor baris sebelum `filter`.
- [ ] Escape teks keterangan sebelum dimasukkan ke HTML (`innerHTML`) supaya aman dari injeksi.
- [ ] Tampilkan pesan error yang jelas di halaman, bukan `alert`.

## Tahap 2: Rapikan Proyek

- [ ] Pindahkan ID spreadsheet dari kode ke Script Properties.
- [ ] Pastikan repo GitHub private.
- [ ] Tambah `.gitignore` dan pertimbangkan tidak menyimpan `.xlsx` di repo.
- [ ] Pakai `clasp` agar `Code.js` dan `Index.html` bisa dideploy langsung dari folder ini.
- [ ] Samakan nama file bulanan (`1. JAN_2023.xlsx` dan `2. FEB_2023.xlsx` berbeda pola dari bulan lain).

## Tahap 3: Fitur Tambahan

- [ ] Filter tanggal dan rentang nominal di halaman transaksi.
- [ ] Ekspor tabel ke CSV/Excel.
- [ ] Grafik pemasukan vs pengeluaran per bulan di dashboard.
- [ ] Tambah kategori baru tanpa mengubah kode.
- [ ] Dukungan tahun lain (2024, dst.) tanpa menyalin kode.
- [ ] Riwayat perubahan kategori (siapa, kapan).

## Tahap 4: Operasional

- [ ] Uji di HP dan beberapa browser.
- [ ] Atur siapa yang boleh mengakses web app.
- [ ] Cadangkan spreadsheet secara berkala.
- [ ] Panduan singkat untuk pengguna.
