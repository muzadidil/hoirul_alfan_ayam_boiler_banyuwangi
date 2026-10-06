#!/usr/bin/env python3
"""Hitung ulang ringkasan dokumen bulan/{kode} dari subkoleksi transaksi.

Contoh:
  python alat/hitung_ulang.py --cek-saja --proyek zasha-mutasi       # hanya laporkan selisih
  python alat/hitung_ulang.py --proyek zasha-mutasi                  # perbaiki semua bulan yang selisih
  python alat/hitung_ulang.py --bulan 2023-03 --proyek zasha-mutasi

Kode keluar: 0 bila tidak ada selisih (atau semua sudah diperbaiki), 1 bila --cek-saja menemukan selisih.
Hormati FIRESTORE_EMULATOR_HOST.
"""
import argparse
import sys

import bersih as B
import koneksi

FIELD_ANGKA = ['jumlahTransaksi', 'totalDebetSen', 'totalKreditSen', 'saldoAkhirSen']
FIELD_KUALITAS = ['tanggalDitukar', 'keteranganDiperbaiki', 'kategoriDiragukan', 'saldoBeda']


def hitung_bulan(dok_bulan, transaksi):
    """Nilai yang seharusnya ada di dokumen bulan menurut transaksinya."""
    r = B.hitung_ringkasan(transaksi)
    r['saldoAkhirSen'] = (dok_bulan.get('saldoAwalSen') or 0) + r['totalKreditSen'] - r['totalDebetSen']
    kualitas = B.hitung_kualitas(transaksi)
    return r, {k: kualitas[k] for k in FIELD_KUALITAS}


def main(argv=None):
    p = argparse.ArgumentParser(description='Hitung ulang ringkasan bulan dari transaksi.')
    p.add_argument('--bulan', action='append', help='batasi ke bulan tertentu, mis. 2023-03 (boleh berulang)')
    p.add_argument('--cek-saja', action='store_true', help='hanya laporkan selisih, jangan menulis')
    p.add_argument('--proyek', help='ID proyek Firebase (wajib bila bukan emulator)')
    args = p.parse_args(argv)

    from google.cloud.firestore import SERVER_TIMESTAMP
    db, tujuan = koneksi.firestore(args.proyek)
    print('Firestore: %s' % tujuan)

    if args.bulan:
        dokumen = [db.collection('bulan').document(k).get() for k in args.bulan]
        hilang = [d.id for d in dokumen if not d.exists]
        if hilang:
            print('Dokumen bulan tidak ada: %s' % ', '.join(hilang))
            return 1
    else:
        dokumen = list(db.collection('bulan').stream())
    if not dokumen:
        print('Belum ada dokumen bulan.')
        return 0

    total_selisih = diperbaiki = 0
    for d in sorted(dokumen, key=lambda x: x.id):
        tersimpan = d.to_dict() or {}
        transaksi = [t.to_dict() for t in d.reference.collection('transaksi').stream()]
        hitungan, kualitas = hitung_bulan(tersimpan, transaksi)
        beda = B.selisih_ringkasan(tersimpan, hitungan, B.MAP_RINGKASAN + FIELD_ANGKA)
        beda += B.selisih_ringkasan(tersimpan.get('kualitas') or {}, kualitas, FIELD_KUALITAS)
        if not beda:
            print('  %s: cocok (%d transaksi)' % (d.id, len(transaksi)))
            continue
        total_selisih += len(beda)
        print('  %s: %d selisih' % (d.id, len(beda)))
        for jalur, lama, baru in beda[:30]:
            print('      %-48s tersimpan %-16s hitung %s' % (jalur, lama, baru))
        if len(beda) > 30:
            print('      ... dan %d lagi' % (len(beda) - 30))
        if args.cek_saja:
            continue
        perbaikan = {k: hitungan[k] for k in B.MAP_RINGKASAN + FIELD_ANGKA}
        perbaikan.update({'kualitas.%s' % k: v for k, v in kualitas.items()})
        perbaikan.update({'diperbaruiOleh': None, 'diperbaruiPada': SERVER_TIMESTAMP})
        d.reference.update(perbaikan)
        d.reference.collection('riwayat').add({
            'waktu': SERVER_TIMESTAMP, 'olehUid': None, 'olehEmail': 'alat/hitung_ulang.py',
            'jenis': 'hitung_ulang', 'ke': None, 'dari': {}, 'idTransaksi': [],
            'jumlah': len(transaksi), 'totalSen': 0,
        })
        diperbaiki += 1
        print('      -> diperbaiki')

    if args.cek_saja:
        print('Total: %d selisih di %d bulan diperiksa.' % (total_selisih, len(dokumen)))
        return 1 if total_selisih else 0
    print('Total: %d selisih, %d bulan diperbaiki.' % (total_selisih, diperbaiki))
    return 0


if __name__ == '__main__':
    sys.exit(main())
