#!/usr/bin/env python3
"""Atur peran pengguna (custom claim 'peran') untuk ZASHA MUTASI.

Contoh:
  python alat/peran.py pemilik@gmail.com admin --proyek zasha-mutasi
  python alat/peran.py staf@gmail.com editor --proyek zasha-mutasi
  python alat/peran.py tamu@gmail.com hapus --proyek zasha-mutasi
  python alat/peran.py pemilik@gmail.com --proyek zasha-mutasi     # lihat peran
  python alat/peran.py --daftar --proyek zasha-mutasi              # semua pengguna berperan

Pengguna harus sudah login sekali ke aplikasi. Setelah peran diubah, pengguna cukup
memuat ulang aplikasi (token dibaca ulang dengan getIdTokenResult(true)).
Hormati FIREBASE_AUTH_EMULATOR_HOST untuk latihan di emulator.
"""
import argparse
import sys

import koneksi

PERAN = ['admin', 'editor', 'pembaca']


def main(argv=None):
    p = argparse.ArgumentParser(description='Atur peran pengguna (custom claims).')
    p.add_argument('email', nargs='?', help='email akun Google pengguna')
    p.add_argument('peran', nargs='?', choices=PERAN + ['hapus'], help='peran baru; kosongkan untuk melihat')
    p.add_argument('--proyek', help='ID proyek Firebase (wajib bila bukan emulator)')
    p.add_argument('--daftar', action='store_true', help='tampilkan semua pengguna yang punya peran')
    args = p.parse_args(argv)
    if not args.email and not args.daftar:
        p.error('isi email, atau pakai --daftar')

    from firebase_admin import auth
    app, proyek, emu = koneksi.buka_app(args.proyek, 'auth')
    print('Auth: %s' % ('emulator %s' % emu if emu else 'PROYEK %s' % proyek))

    if args.daftar:
        n = 0
        for u in auth.list_users(app=app).iterate_all():
            peran = (u.custom_claims or {}).get('peran')
            if peran:
                n += 1
                print('  %-8s %s%s' % (peran, u.email, '' if u.email_verified else '  (email belum terverifikasi)'))
        print('%d pengguna berperan' % n)
        if not args.email:
            return 0

    try:
        user = auth.get_user_by_email(args.email, app=app)
    except auth.UserNotFoundError:
        print('Pengguna %s belum ada. Minta pengguna login sekali ke aplikasi, lalu jalankan lagi.' % args.email)
        return 1

    klaim = dict(user.custom_claims or {})
    if args.peran:
        if args.peran == 'hapus':
            klaim.pop('peran', None)
        else:
            klaim['peran'] = args.peran
        auth.set_custom_user_claims(user.uid, klaim or None, app=app)
        user = auth.get_user(user.uid, app=app)

    peran = (user.custom_claims or {}).get('peran')
    print('%s (uid %s): peran = %s' % (user.email, user.uid, peran or '(tanpa peran: tidak bisa membaca apa pun)'))
    if not user.email_verified:
        print('Peringatan: email belum terverifikasi; rules menolak akses sampai email_verified = true.')
    if args.peran:
        print('Pengguna perlu memuat ulang aplikasi agar peran baru terbaca.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
