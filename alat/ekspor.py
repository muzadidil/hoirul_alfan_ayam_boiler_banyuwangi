#!/usr/bin/env python3
"""Cadangkan seluruh Firestore ZASHA MUTASI ke JSON + CSV lokal.

Contoh:
  python alat/ekspor.py --ke ~/cadangan-zasha --proyek zasha-mutasi

Hasil: <ke>/zasha-YYYYMMDD-HHMMSS/
  pengaturan.json, impor.json, bulan.json
  bulan/<kode>/transaksi.json, transaksi.csv, riwayat.json
Folder tujuan harus di LUAR repo (repo ini publik). Hormati FIRESTORE_EMULATOR_HOST.
"""
import argparse
import csv
import datetime as dt
import json
import os
import sys

import koneksi

KOLOM_CSV = ['id', 'bulan', 'tanggal', 'urutan', 'jenis', 'debetSen', 'kreditSen', 'saldoSen', 'saldoBankSen',
             'kategori', 'kategoriAsal', 'saran', 'entitas', 'perluCek', 'ketPendek', 'ketLengkap', 'ketAsli',
             'file', 'tab', 'baris', 'diubahOleh', 'diubahOlehEmail', 'diubahPada']


def ke_json(nilai):
    if isinstance(nilai, dict):
        return {k: ke_json(v) for k, v in nilai.items()}
    if isinstance(nilai, (list, tuple)):
        return [ke_json(v) for v in nilai]
    if isinstance(nilai, (dt.datetime, dt.date)):
        return nilai.isoformat()
    if nilai is None or isinstance(nilai, (str, int, float, bool)):
        return nilai
    return str(nilai)


def koleksi(ref):
    return {d.id: ke_json(d.to_dict()) for d in ref.stream()}


def simpan_json(jalur, data):
    with open(jalur, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=1, sort_keys=True)


def main(argv=None):
    p = argparse.ArgumentParser(description='Cadangkan Firestore ke JSON + CSV.')
    p.add_argument('--ke', required=True, help='folder tujuan (di luar repo)')
    p.add_argument('--proyek', help='ID proyek Firebase (wajib bila bukan emulator)')
    args = p.parse_args(argv)
    if koneksi.di_dalam_repo(args.ke):
        p.error('--ke harus di luar folder repo (%s), karena repo ini publik' % koneksi.FOLDER_REPO)

    db, tujuan = koneksi.firestore(args.proyek)
    print('Firestore: %s' % tujuan)
    folder = os.path.join(os.path.expanduser(args.ke), 'zasha-%s' % dt.datetime.now().strftime('%Y%m%d-%H%M%S'))
    os.makedirs(os.path.join(folder, 'bulan'), exist_ok=True)

    simpan_json(os.path.join(folder, 'pengaturan.json'), koleksi(db.collection('pengaturan')))
    simpan_json(os.path.join(folder, 'impor.json'), koleksi(db.collection('impor')))
    daftar_bulan = {}
    total = 0
    for d in sorted(db.collection('bulan').stream(), key=lambda x: x.id):
        daftar_bulan[d.id] = ke_json(d.to_dict())
        sub = os.path.join(folder, 'bulan', d.id)
        os.makedirs(sub, exist_ok=True)
        transaksi = koleksi(d.reference.collection('transaksi'))
        simpan_json(os.path.join(sub, 'transaksi.json'), transaksi)
        simpan_json(os.path.join(sub, 'riwayat.json'), koleksi(d.reference.collection('riwayat')))
        with open(os.path.join(sub, 'transaksi.csv'), 'w', newline='', encoding='utf-8-sig') as f:
            w = csv.writer(f)
            w.writerow(KOLOM_CSV)
            for id_, t in sorted(transaksi.items(), key=lambda kv: (kv[1].get('urutan') or 0, kv[0])):
                sumber = t.get('sumber') or {}
                baris = dict(t, id=id_, perluCek='|'.join(t.get('perluCek') or []),
                             file=sumber.get('file'), tab=sumber.get('tab'), baris=sumber.get('baris'))
                w.writerow(['' if baris.get(k) is None else baris.get(k) for k in KOLOM_CSV])
        total += len(transaksi)
        print('  %s: %d transaksi' % (d.id, len(transaksi)))
    simpan_json(os.path.join(folder, 'bulan.json'), daftar_bulan)
    print('Selesai: %d bulan, %d transaksi -> %s' % (len(daftar_bulan), total, folder))
    return 0


if __name__ == '__main__':
    sys.exit(main())
