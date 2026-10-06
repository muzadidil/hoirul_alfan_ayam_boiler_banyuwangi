# ZASHA MUTASI

Aplikasi web berbasis Google Apps Script untuk membaca dan mengkategorikan mutasi rekening bank per bulan (tahun 2023), dengan dashboard ringkasan.

## Fitur

- **Dashboard**: ringkasan pemasukan (kredit), pengeluaran (debit), dan selisih per bulan, plus rincian per kategori.
- **Mutasi Bank**: tampilan transaksi bulanan (tanggal, keterangan, debet, kredit, saldo).
- **Kategori**: Belum Kategori, Pribadi, Produksi, Exspedisi, V_Sales, Operasional, Nurul Aini.
- **Pindah kategori**: satuan lewat dropdown, atau massal lewat centang beberapa baris.
- **Pencarian & paginasi** (20 baris per halaman).
- **Pilih bulan** Januari–Desember 2023 lewat dropdown.
- Tampilan responsif untuk HP.

## Struktur File

| File | Fungsi |
| --- | --- |
| `Code.js` | Backend Apps Script: routing (`doGet`), baca data sheet, update kategori. |
| `Index.html` | Tampilan (template Apps Script + Bootstrap 5). |
| `BANK_GLOBAL.xlsx` | File Excel bank global. |
| `1. JAN_2023.xlsx`, `2. FEB_2023.xlsx`, `MAR_2023.xlsx` … `DES_2023.xlsx` | File Excel per bulan tahun 2023. |

## Cara Kerja

1. Setiap bulan adalah satu Google Spreadsheet. Daftar ID-nya ada di `SPREADSHEET_MAP` di `Code.js`, ditambah satu spreadsheet `DASHBOARD`.
2. Di tiap file bulanan, tab master (misalnya `JAN_2023`) berisi semua transaksi. Kolom I (kolom ke-9) menyimpan kategori.
3. Tab per kategori (`PRIBADI`, `PRODUKSI`, dst.) menyimpan total di sel `J1`.
4. Spreadsheet `DASHBOARD` punya tab `TOTAL` (range `A2:K13`) yang berisi ringkasan 12 bulan.
5. Halaman dipilih lewat parameter URL: `?p=<halaman>&bulan=<kode_bulan>`, misalnya `?p=pribadi&bulan=MAR_2023`.

## Cara Pasang

1. Buat project baru di [script.google.com](https://script.google.com).
2. Salin `Code.js` ke `Code.gs` dan `Index.html` ke file HTML bernama `Index`.
3. Isi `SPREADSHEET_MAP` dengan ID spreadsheet Anda sendiri.
4. Deploy sebagai **Web app** (Deploy → New deployment → Web app), akses sesuai kebutuhan.
5. Buka URL web app yang dihasilkan.

## Catatan Keamanan

`Code.js` memuat ID Google Spreadsheet dan file `.xlsx` berisi data keuangan. Pastikan repositori ini **private**.
