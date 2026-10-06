"""Uji fungsi murni bersih.py dengan data SINTETIS (bukan data asli).

Jalankan: python alat/tes_bersih.py   atau   python -m unittest discover -s alat -p 'tes_*.py'
"""
import datetime as dt
import os
import sys
import unittest
from decimal import Decimal

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bersih as B  # noqa: E402


def teks_gmt(tanggal, tahun_tertulis=None, jam='14:00:00'):
    """Bentuk teks rusak Google Sheets: 'Tue Sep 29 2026 14:00:00 GMT+0700 (Western Indonesia Time)'."""
    return '%s %s %s GMT+0700 (Western Indonesia Time)' % (
        tanggal.strftime('%a %b %d'), tahun_tertulis or tanggal.year, jam)


class TesTanggal(unittest.TestCase):
    def test_tahun_dari_tab(self):
        self.assertEqual(B.bersihkan_tanggal(dt.datetime(2026, 2, 15), 2023, 2), (dt.date(2023, 2, 15), False))

    def test_jun_hari_bulan_tertukar(self):
        # 2 Juni tersimpan sebagai 6 Februari
        self.assertEqual(B.bersihkan_tanggal(dt.datetime(2023, 2, 6), 2023, 6), (dt.date(2023, 6, 2), True))
        self.assertEqual(B.bersihkan_tanggal(dt.datetime(2023, 11, 6), 2023, 6), (dt.date(2023, 6, 11), True))

    def test_jun_bulan_dan_hari_sama(self):
        self.assertEqual(B.bersihkan_tanggal(dt.datetime(2023, 12, 12), 2023, 6), (dt.date(2023, 6, 12), True))

    def test_jun_tidak_tertukar(self):
        self.assertEqual(B.bersihkan_tanggal(dt.datetime(2023, 6, 6), 2023, 6), (dt.date(2023, 6, 6), False))
        self.assertEqual(B.bersihkan_tanggal(dt.datetime(2023, 6, 13), 2023, 6), (dt.date(2023, 6, 13), False))

    def test_teks_iso(self):
        self.assertEqual(B.bersihkan_tanggal('2023-06-14', 2023, 6), (dt.date(2023, 6, 14), False))
        self.assertEqual(B.bersihkan_tanggal('2023-02-06', 2023, 6), (dt.date(2023, 6, 2), True))

    def test_teks_dd_mm(self):
        self.assertEqual(B.bersihkan_tanggal('05/03', 2023, 3), (dt.date(2023, 3, 5), False))

    def test_tanggal_tidak_sah(self):
        with self.assertRaises(ValueError):
            B.bersihkan_tanggal('2023-06-31', 2023, 6)
        with self.assertRaises(ValueError):
            B.bersihkan_tanggal(None, 2023, 6)
        with self.assertRaises(ValueError):
            B.bersihkan_tanggal('bukan tanggal', 2023, 6)


class TesGmt(unittest.TestCase):
    def test_tahun_bawaan_sheets_dibuang(self):
        teks = 'REF/X 1000.00 %s CONTOH NAMA' % teks_gmt(dt.date(2026, 9, 29))
        self.assertEqual(B.pulihkan_gmt(teks, 2023), ('REF/X 1000.00 29/09 CONTOH NAMA', 1))

    def test_tahun_asli_dipertahankan(self):
        teks = 'berita %s' % teks_gmt(dt.date(2023, 2, 13), jam='15:00:00')
        self.assertEqual(B.pulihkan_gmt(teks, 2023), ('berita 13/02/2023', 1))

    def test_nama_hari_tidak_cocok_tahun_dibuang(self):
        # pola JUN: teks 2026 diganti manual menjadi 2023, nama hari tetap milik 2026
        teks = teks_gmt(dt.date(2026, 5, 30), tahun_tertulis=2023)
        self.assertEqual(B.pulihkan_gmt(teks, 2023), ('30/05', 1))

    def test_dua_kemunculan_dan_tanpa_gmt(self):
        g = teks_gmt(dt.date(2026, 1, 4))
        self.assertEqual(B.pulihkan_gmt('%s A %s' % (g, g), 2023), ('04/01 A 04/01', 2))
        self.assertEqual(B.pulihkan_gmt('TANPA TANGGAL', 2023), ('TANPA TANGGAL', 0))
        self.assertEqual(B.pulihkan_gmt('', 2023), ('', 0))


class TesKeterangan(unittest.TestCase):
    def test_ket_lengkap_pola_jan(self):
        b = 'TRSF E-BANKING DB TANGGAL :30/12'
        c = 'TRSF E-BANKING DB TANGGAL :30/12 3012/FTSCY/WS00000 bayar CONTOH NAMA'
        self.assertEqual(B.susun_ket_lengkap(b, c), c)

    def test_ket_lengkap_pola_feb_des(self):
        self.assertEqual(B.susun_ket_lengkap('TRSF E-BANKING DB', '0101/FTSCY/WS00000 CONTOH NAMA'),
                         'TRSF E-BANKING DB 0101/FTSCY/WS00000 CONTOH NAMA')

    def test_ket_lengkap_tepi(self):
        self.assertEqual(B.susun_ket_lengkap('BUNGA', 'BUNGA'), 'BUNGA')
        self.assertEqual(B.susun_ket_lengkap('BIAYA ADM', None), 'BIAYA ADM')
        self.assertEqual(B.susun_ket_lengkap('BUNGA', 'BUNGAKU X'), 'BUNGA BUNGAKU X')
        self.assertEqual(B.susun_ket_lengkap('  KARTU   DEBIT ', ' TOKO  CONTOH '), 'KARTU DEBIT TOKO CONTOH')

    def test_potong_ganda(self):
        self.assertEqual(B.potong_ganda('0101/FTSCY/WS00000 1000.00 bayar CONTOH NAMA 1000.00 bayar CONTOH NAMA'),
                         ('0101/FTSCY/WS00000 1000.00 bayar CONTOH NAMA', True))
        self.assertEqual(B.potong_ganda('REF A A'), ('REF A A', False))
        self.assertEqual(B.potong_ganda('REF A B C A B'), ('REF A B C A B', False))

    def test_label_saldo_di_c(self):
        k = B.bersihkan_keterangan('PAJAK BUNGA', ' SALDO AWAL : MUTASI CR : MUTASI DB : SALDO AKHIR :', 2023)
        self.assertEqual(k['ketLengkap'], 'PAJAK BUNGA')
        self.assertTrue(k['diperbaiki'])
        self.assertIn('SALDO AWAL', k['ketAsli'])

    def test_b_kosong_diisi_c(self):
        k = B.bersihkan_keterangan(None, 'DR KOREKSI BUNGA', 2023)
        self.assertEqual((k['ketPendek'], k['ketLengkap'], k['ketAsli']), ('DR KOREKSI BUNGA', 'DR KOREKSI BUNGA', None))
        self.assertIn('b_dari_c', k['rincian'])

    def test_gmt_dan_ganda_sekaligus(self):
        g = teks_gmt(dt.date(2026, 10, 30))
        c = '3110/FTSCY/WS00000 %s CONTOH NAMA %s CONTOH NAMA' % (g, g)
        k = B.bersihkan_keterangan('TRSF E-BANKING DB', c, 2023)
        self.assertEqual(k['ketLengkap'], 'TRSF E-BANKING DB 3110/FTSCY/WS00000 30/10 CONTOH NAMA')
        self.assertEqual(k['ketAsli'], 'TRSF E-BANKING DB ' + c)
        self.assertEqual(sorted(k['rincian']), ['ganda', 'gmt'])

    def test_hanya_spasi_bukan_perbaikan(self):
        k = B.bersihkan_keterangan('KARTU DEBIT', 'TOKO  CONTOH   1234', 2023)
        self.assertEqual((k['ketLengkap'], k['ketAsli'], k['diperbaiki']), ('KARTU DEBIT TOKO CONTOH 1234', None, False))


class TesAngka(unittest.TestCase):
    def test_angka_teks(self):
        self.assertEqual(B.parse_angka('1,234,567.89'), Decimal('1234567.89'))
        self.assertEqual(B.parse_angka('1.234.567,89'), Decimal('1234567.89'))
        self.assertEqual(B.parse_angka('45.67'), Decimal('45.67'))
        self.assertEqual(B.parse_angka('2,345.67'), Decimal('2345.67'))
        self.assertEqual(B.parse_angka('12,5'), Decimal('12.5'))
        self.assertEqual(B.parse_angka('1,234'), Decimal('1234'))
        self.assertEqual(B.parse_angka('Rp 1.000.000'), Decimal('1000000'))
        self.assertIsNone(B.parse_angka('  '))
        for salah in ('abc', ':', '1,2a'):
            with self.assertRaises(ValueError):
                B.parse_angka(salah)

    def test_ke_sen(self):
        self.assertEqual(B.ke_sen(1234.56), 123456)
        self.assertEqual(B.ke_sen(1000.50000012), 100050)
        self.assertEqual(B.ke_sen(1000.00499999), 100000)
        self.assertEqual(B.ke_sen(7), 700)
        self.assertEqual(B.ke_sen('3,456.78'), 345678)
        self.assertIsNone(B.ke_sen(None))
        self.assertIsNone(B.ke_sen(''))

    def test_rupiah(self):
        self.assertEqual(B.rupiah(123456), 'Rp 1.234,56')
        self.assertEqual(B.rupiah(-5), '-Rp 0,05')
        self.assertEqual(B.rupiah(None), '-')


def baris_sintetis():
    """Tab master kecil: baris 1 kosong, SALDO AWAL, transaksi, baris kosong, penutup."""
    T = dt.datetime
    return [
        (1, [None] * 9),
        (2, [T(2026, 3, 1), 'SALDO AWAL', 'SALDO AWAL', None, 300000, None, 1000000.0, 1000000.0, None]),
        (3, [T(2026, 3, 1), 'TRSF E-BANKING CR', '0103/FTSCY/WS00000 CONTOH SATU', None, 200000.0, 'CR', 0, 1200000.0, 'PRODUKSI']),
        (4, [T(2026, 3, 2), 'KARTU DEBIT', 'TOKO CONTOH 1234567890123456', '50,000.00', None, None, 0, None, 'pribadi']),
        (5, [None, None, None, None, None, None, '', None, 'PRODUKSI']),
        (6, [T(2026, 3, 3), 'TRSF E-BANKING DB', '0303/FTSCY/WS00000 75000.00 CONTOH DUA', 75000.0, None, 'DB', 0, 75000.0, 'VSALES']),
        (7, [T(2026, 3, 31), 'BUNGA', 'BUNGA', 100.0, None, None, 0, None, 'BANK']),
        (8, [T(2026, 3, 31), 'PAJAK BUNGA', ' SALDO AWAL : MUTASI CR : MUTASI DB : SALDO AKHIR :', 20.0, None, None, 0, 999.0, None]),
        (9, [None, 'MUTASI CR', ':', '200,100.00', 2, None, 0, None, None]),
        (10, [None, 'MUTASI DB', ':', '125,020.00', 3, None, 0, None, None]),
    ]


class TesBulan(unittest.TestCase):
    def setUp(self):
        self.h = B.bersihkan_bulan(baris_sintetis(), 2023, 3, 'MAR_2023', 'contoh.xlsx')
        self.t = {x['sumber']['baris']: x for x in self.h['transaksi']}

    def test_baris_non_transaksi_dibuang(self):
        self.assertEqual(self.h['galat'], [])
        self.assertEqual(sorted(self.t), [3, 4, 6, 7, 8])
        self.assertEqual([p['jenis'] for p in self.h['penutup']], ['MUTASI CR', 'MUTASI DB'])
        self.assertEqual(self.h['kontrol']['barisKosong'], 2)
        self.assertEqual(self.h['kreditBarisSaldoAwalSen'], 30000000)

    def test_bunga_debet_pindah_ke_kredit(self):
        bunga = self.t[7]
        self.assertEqual((bunga['jenis'], bunga['debetSen'], bunga['kreditSen']), ('CR', 0, 10000))
        self.assertEqual(bunga['_kreditSebelumBungaSen'], 0)
        self.assertEqual(self.h['kontrol']['bungaDipindah'], 1)

    def test_angka_teks_dan_jenis(self):
        self.assertEqual((self.t[4]['jenis'], self.t[4]['debetSen'], self.t[4]['_dNumerikSen']), ('DB', 5000000, 0))
        self.assertEqual(self.h['kontrol']['angkaTeks'], 1)

    def test_saldo_dihitung_ulang_dan_kolom_h(self):
        self.assertEqual([self.t[n]['saldoSen'] for n in (3, 4, 6, 7, 8)],
                         [120000000, 115000000, 107500000, 107510000, 107508000])
        self.assertEqual(self.h['saldoAkhirSen'], 107508000)
        self.assertEqual(self.t[3]['saldoBankSen'], 120000000)
        self.assertIsNone(self.t[6]['saldoBankSen'])  # H berisi nominal transaksi -> diabaikan
        self.assertEqual(self.h['hNyasar'], [6])
        self.assertEqual(self.t[8]['perluCek'], ['keterangan_diperbaiki', 'saldo_beda'])
        self.assertEqual(self.t[8]['saldoBankSen'], 99900)

    def test_id_urutan_tanggal(self):
        self.assertEqual([x['id'] for x in self.h['transaksi']],
                         ['2023-03-r0003', '2023-03-r0004', '2023-03-r0006', '2023-03-r0007', '2023-03-r0008'])
        self.assertEqual([x['urutan'] for x in self.h['transaksi']], [1, 2, 3, 4, 5])
        self.assertEqual(self.t[6]['tanggal'], '2023-03-03')

    def test_kategori_asal_dinormalkan(self):
        self.assertEqual([self.t[n]['kategoriAsal'] for n in (3, 4, 6, 7, 8)],
                         ['PRODUKSI', 'PRIBADI', 'V_SALES', 'BANK', None])

    def test_saldo_awal_wajib(self):
        h = B.bersihkan_bulan(baris_sintetis()[2:3], 2023, 3, 'MAR_2023', 'contoh.xlsx')
        self.assertTrue(h['galat'])

    def test_debet_kredit_keduanya_terisi_galat(self):
        rows = baris_sintetis()[:2] + [(3, [dt.datetime(2026, 3, 1), 'X', 'X', 1.0, 2.0, None, 0, None, None])]
        h = B.bersihkan_bulan(rows, 2023, 3, 'MAR_2023', 'contoh.xlsx')
        self.assertEqual(len(h['galat']), 1)
        self.assertEqual(h['transaksi'], [])


class TesKategoriEntitas(unittest.TestCase):
    def trx(self, bulan, asal, jenis='DB', ket='TRSF E-BANKING DB 0101/FTSCY/WS00000 CONTOH PIHAK'):
        return {'bulan': bulan, 'kategoriAsal': asal, 'perluCek': [], 'jenis': jenis,
                'ketPendek': 'TRSF E-BANKING DB', 'ketLengkap': ket, 'kategori': 'KOSONG', 'entitas': 'BELUM'}

    def test_normal_kategori(self):
        self.assertEqual(B.normal_kategori(' vsales '), 'V_SALES')
        self.assertEqual(B.normal_kategori('Nurul Aini'), 'NURUL_AINI')
        self.assertIsNone(B.normal_kategori('  '))

    def test_bulan_terpercaya(self):
        t = B.terapkan_kategori(self.trx('2023-01', 'PRIBADI'))
        self.assertEqual((t['kategori'], t['entitas'], t['perluCek']), ('PRIBADI', 'PRIBADI', []))
        t = B.terapkan_kategori(self.trx('2023-06', 'PRODUKSI'))
        self.assertEqual((t['kategori'], t['entitas']), ('PRODUKSI', 'BELUM'))

    def test_bulan_diragukan(self):
        t = B.terapkan_kategori(self.trx('2023-07', 'PRIBADI'))
        self.assertEqual((t['kategori'], t['entitas'], t['perluCek']), ('KOSONG', 'BELUM', ['kategori_diragukan']))
        t = B.terapkan_kategori(self.trx('2023-07', None))
        self.assertEqual((t['kategori'], t['perluCek']), ('KOSONG', []))
        t = B.terapkan_kategori(self.trx('2023-07', 'PRIBADI'), pakai_kategori_asal=True)
        self.assertEqual((t['kategori'], t['entitas'], t['perluCek']), ('PRIBADI', 'BELUM', []))

    def test_peta_saran(self):
        data = [self.trx('2023-01', 'PRODUKSI') for _ in range(5)]
        data += [self.trx('2023-02', 'PRODUKSI', ket='X 0101/FTSCY/WS00000 pakan PIHAK LAIN') for _ in range(4)]
        data += [self.trx('2023-03', k, ket='X 0101/FTSCY/WS00000 PIHAK CAMPUR') for k in ['PRODUKSI'] * 8 + ['BANK'] * 2]
        data += [self.trx('2023-07', 'BANK') for _ in range(9)]  # bulan diragukan tidak ikut membentuk peta
        peta, rincian = B.buat_peta_saran(data)
        self.assertEqual(peta, {('DB', 'CONTOH PIHAK'): 'PRODUKSI'})
        self.assertEqual(len(rincian), 3)
        t = B.terapkan_kategori(self.trx('2023-08', None), peta_saran=peta)
        self.assertEqual(t['saran'], 'PRODUKSI')
        t = B.terapkan_kategori(self.trx('2023-08', None, jenis='CR'), peta_saran=peta)
        self.assertIsNone(t['saran'])

    def test_ekstrak_pihak(self):
        e = B.ekstrak_pihak
        self.assertEqual(e('TRSF E-BANKING DB', 'TRSF E-BANKING DB 0101/FTSCY/WS00000 1000.00 bayar pakan CONTOH NAMA'),
                         'CONTOH NAMA')
        self.assertEqual(e('TRSF E-BANKING DB', 'TRSF E-BANKING DB 0101/FTSCY/WS00000 ABCDEFGHI JKLMNOPQ RST'),
                         'JKLMNOPQ RST')
        self.assertEqual(e('KARTU DEBIT', 'KARTU DEBIT TOKO CONTOH 1234567890123456'), 'TOKO CONTOH')
        self.assertEqual(e('TRSF E-BANKING DB', 'TRSF E-BANKING DB 0101/FTFVA/WS00000 12345/VA CONTOH titip 999'),
                         'VA CONTOH')
        self.assertEqual(e('TRSF E-BANKING DB', 'TRSF E-BANKING DB 0101/FTFVA/WS00000 titip barang 99999'), 'VA 99999')
        self.assertEqual(e('BI-FAST DB', 'BI-FAST DB BIF TRANSFER KE 9 BUDI CONTOH M-BCA'), 'BUDI CONTOH')
        self.assertEqual(e('BI-FAST DB', 'BI-FAST DB BIF BIAYA TXN KE 9 BUDI CONTOH M-BCA'), 'BIAYA TXN')
        self.assertEqual(e('TARIKAN ATM 15/07', 'TARIKAN ATM 15/07'), 'TARIKAN ATM')
        self.assertEqual(e('TRSF E-BANKING DB TANGGAL :01/01', 'TRSF E-BANKING DB TANGGAL :01/01 0101/FTSCY/WS00000 x'),
                         'TRSF E-BANKING DB')


class TesRingkasan(unittest.TestCase):
    def test_map_lengkap_dan_jumlah(self):
        data = [
            {'kategori': 'PRODUKSI', 'entitas': 'CV', 'debetSen': 1000, 'kreditSen': 0},
            {'kategori': 'PRODUKSI', 'entitas': 'PT', 'debetSen': 0, 'kreditSen': 500},
            {'kategori': 'KOSONG', 'entitas': 'BELUM', 'debetSen': 250, 'kreditSen': 0},
        ]
        r = B.hitung_ringkasan(data)
        self.assertEqual((r['jumlahTransaksi'], r['totalDebetSen'], r['totalKreditSen']), (3, 1250, 500))
        self.assertEqual(set(r['debetSenPerKategori']), set(B.KATEGORI))
        self.assertEqual(set(r['jumlahPerEntitas']), set(B.ENTITAS))
        self.assertEqual(r['debetSenPerKategori']['PRODUKSI'], 1000)
        self.assertEqual(r['jumlahPerKategori']['PRODUKSI'], 2)
        self.assertEqual(r['kreditSenPerEntitas']['PT'], 500)
        self.assertEqual(r['debetSenPerEntitasKategori']['CV']['PRODUKSI'], 1000)
        self.assertEqual(r['kreditSenPerEntitasKategori']['PRIBADI']['BANK'], 0)
        self.assertTrue(all(set(v) == set(B.KATEGORI) for v in r['debetSenPerEntitasKategori'].values()))

    def test_selisih(self):
        r = B.hitung_ringkasan([{'kategori': 'BANK', 'entitas': 'PT', 'debetSen': 7, 'kreditSen': 0}])
        rusak = {k: (dict(v) if isinstance(v, dict) else v) for k, v in r.items()}
        rusak['debetSenPerEntitasKategori'] = {e: dict(v) for e, v in r['debetSenPerEntitasKategori'].items()}
        rusak['debetSenPerEntitasKategori']['PT']['BANK'] = 8
        rusak['totalDebetSen'] = 9
        self.assertEqual(B.selisih_ringkasan(r, r), [])
        self.assertEqual(B.selisih_ringkasan(rusak, r), [('debetSenPerEntitasKategori.PT.BANK', 8, 7),
                                                         ('totalDebetSen', 9, 7)])

    def test_dokumen_bulan(self):
        r = B.hitung_ringkasan([{'kategori': 'BANK', 'entitas': 'BELUM', 'debetSen': 0, 'kreditSen': 300}])
        d = B.dokumen_bulan('2023-02', 1000, r, B.hitung_kualitas([]), {'file': 'x.xlsx', 'tab': 'FEB_2023'})
        self.assertEqual((d['label'], d['saldoAkhirSen'], d['linkHome']),
                         ('Februari 2023', 1300, 'https://alfan.zasha.online/bulan/februari.php'))


if __name__ == '__main__':
    unittest.main(verbosity=2)
