"""Aturan pembersihan data mutasi BCA (rencana.md Tahap 2, aturan 1-13).

Semua fungsi di sini murni: tidak membaca file dan tidak menyentuh Firestore,
supaya bisa diuji dengan data sintetis (lihat tes_bersih.py).
Uang selalu integer sen, tanggal selalu teks 'YYYY-MM-DD'.
"""
import calendar
import datetime as dt
import re
from collections import Counter, defaultdict
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

VERSI = '2.0.0'

KODE_BULAN = ['JAN', 'FEB', 'MAR', 'APR', 'MEI', 'JUN', 'JUL', 'AGU', 'SEP', 'OKT', 'NOV', 'DES']
NAMA_BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus',
              'September', 'Oktober', 'November', 'Desember']
POLA_TAB = re.compile(r'^(%s)_(\d{4})$' % '|'.join(KODE_BULAN))

KATEGORI = ['KOSONG', 'PRIBADI', 'PRODUKSI', 'EXSPEDISI', 'V_SALES', 'OPERASIONAL', 'NURUL_AINI', 'BANK']
KATEGORI_DETAIL = {
    'KOSONG': {'label': 'Belum Kategori', 'ikon': '📄', 'urutan': 0},
    'PRIBADI': {'label': 'Pribadi', 'ikon': '👤', 'urutan': 1},
    'PRODUKSI': {'label': 'Produksi', 'ikon': '🏭', 'urutan': 2},
    'EXSPEDISI': {'label': 'Exspedisi', 'ikon': '🚚', 'urutan': 3},
    'V_SALES': {'label': 'V_Sales', 'ikon': '💼', 'urutan': 4},
    'OPERASIONAL': {'label': 'Operasional', 'ikon': '⚙️', 'urutan': 5},
    'NURUL_AINI': {'label': 'Nurul Aini', 'ikon': '👩', 'urutan': 6},
    'BANK': {'label': 'Bank', 'ikon': '🏦', 'urutan': 7},
}
ALIAS_KATEGORI = {
    'VSALES': 'V_SALES', 'V SALES': 'V_SALES', 'V-SALES': 'V_SALES',
    'NURUL AINI': 'NURUL_AINI', 'EKSPEDISI': 'EXSPEDISI', 'EXPEDISI': 'EXSPEDISI',
}

ENTITAS = ['BELUM', 'PRIBADI', 'CV', 'PT']
ENTITAS_DETAIL = {
    'BELUM': {'label': 'Belum Dipisah', 'warna': '#6c757d', 'urutan': 0},
    'PRIBADI': {'label': 'Pribadi', 'warna': '#d63384', 'urutan': 1},
    'CV': {'label': 'CV', 'warna': '#005aa9', 'urutan': 2},
    'PT': {'label': 'PT', 'warna': '#198754', 'urutan': 3},
}

# Kategori kolom I di bulan selain ini terbukti hasil salin-tempel per posisi baris (lihat rencana.md "Temuan Data").
BULAN_TERPERCAYA = {'2023-01', '2023-02', '2023-03', '2023-06'}

PERLU_CEK = ['tanggal_ditukar', 'keterangan_diperbaiki', 'kategori_diragukan', 'saldo_beda', 'sintetis']
BARIS_PENUTUP = {'MUTASI CR', 'MUTASI DB', 'SALDO AKHIR'}
LINK_HOME = 'https://alfan.zasha.online/bulan/{}.php'

_HARI_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
_BULAN_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
POLA_GMT = re.compile(
    r'\b(%s) (%s) (\d{1,2}) (\d{4}) \d{2}:\d{2}:\d{2} GMT[+-]\d{4}(?: \([^)]*\))?'
    % ('|'.join(_HARI_EN), '|'.join(_BULAN_EN)))
POLA_LABEL_SALDO = re.compile(r'^SALDO AWAL\s*:')
POLA_TANGGAL_EFEKTIF = re.compile(r'\s*TANGGAL\s*:\s*\d{1,2}/\d{1,2}\s*$')


# ---------------------------------------------------------------- teks & angka

def rapikan_spasi(teks):
    if teks is None:
        return ''
    return ' '.join(str(teks).split())


def kosong(nilai):
    return nilai is None or (isinstance(nilai, str) and nilai.strip() == '')


def parse_angka(nilai):
    """Angka sel Excel -> Decimal. None bila kosong. ValueError bila teks bukan angka.

    Teks ribuan ditangani: '1,234,567.89' (gaya bank) dan '1.234.567,89' (gaya Indonesia).
    """
    if kosong(nilai):
        return None
    if isinstance(nilai, bool):
        raise ValueError('nilai boolean bukan angka')
    if isinstance(nilai, int):
        return Decimal(nilai)
    if isinstance(nilai, float):
        return Decimal(repr(nilai))
    if isinstance(nilai, Decimal):
        return nilai
    teks = re.sub(r'(?i)^rp\.?', '', str(nilai).strip()).replace(' ', '').replace('\xa0', '')
    if not re.fullmatch(r'-?[\d.,]*\d[\d.,]*', teks):
        raise ValueError('teks bukan angka: %r' % nilai)
    koma, titik = teks.rfind(','), teks.rfind('.')
    if koma >= 0 and titik >= 0:
        if koma > titik:
            teks = teks.replace('.', '').replace(',', '.')
        else:
            teks = teks.replace(',', '')
    elif koma >= 0:
        bagian = teks.split(',')
        if len(bagian) > 2 or len(bagian[-1]) == 3:
            teks = teks.replace(',', '')
        else:
            teks = teks.replace(',', '.')
    elif teks.count('.') > 1:
        teks = teks.replace('.', '')
    try:
        return Decimal(teks)
    except InvalidOperation:
        raise ValueError('teks bukan angka: %r' % nilai)


def ke_sen(nilai):
    angka = parse_angka(nilai)
    if angka is None:
        return None
    return int((angka * 100).quantize(Decimal('1'), rounding=ROUND_HALF_UP))


def rupiah(sen):
    """123456 -> 'Rp 1.234,56' (untuk laporan)."""
    if sen is None:
        return '-'
    tanda = '-' if sen < 0 else ''
    sen = abs(int(sen))
    ribuan = '{:,}'.format(sen // 100).replace(',', '.')
    return '%sRp %s,%02d' % (tanda, ribuan, sen % 100)


# ---------------------------------------------------------------- tanggal

def bersihkan_tanggal(nilai, tahun, bulan):
    """Tanggal sel kolom A -> (datetime.date, ditukar).

    Tahun dan bulan selalu dari nama tab (file tersimpan bertahun 2026).
    Bila bulan di sel bukan bulan tab, hari dan bulan tertukar (JUN: 2 Juni tersimpan 6 Februari),
    jadi hari diambil dari bulan sel. Teks 'YYYY-MM-DD' dan 'DD/MM[/YYYY]' diparse dengan aturan sama.
    """
    if isinstance(nilai, dt.datetime):
        b, h = nilai.month, nilai.day
    elif isinstance(nilai, dt.date):
        b, h = nilai.month, nilai.day
    elif isinstance(nilai, str):
        teks = nilai.strip()
        m = re.fullmatch(r'(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T].*)?', teks)
        if m:
            b, h = int(m.group(2)), int(m.group(3))
        else:
            m = re.fullmatch(r'(\d{1,2})/(\d{1,2})(?:/(\d{2,4}))?', teks)
            if not m:
                raise ValueError('format tanggal tidak dikenal: %r' % nilai)
            h, b = int(m.group(1)), int(m.group(2))
    else:
        raise ValueError('tanggal kosong atau bukan tanggal: %r' % (nilai,))
    ditukar = False
    if b != bulan:
        h, ditukar = b, True
    hari_maks = calendar.monthrange(tahun, bulan)[1]
    if not 1 <= h <= hari_maks:
        raise ValueError('hari %d di luar bulan %04d-%02d (sel %r)' % (h, tahun, bulan, nilai))
    return dt.date(tahun, bulan, h), ditukar


# ---------------------------------------------------------------- keterangan

def pulihkan_gmt(teks, tahun_transaksi):
    """'Tue Sep 29 2026 14:00:00 GMT+0700 (Western Indonesia Time)' -> '29/09'.

    Teks aslinya berita 'dd/mm' yang diubah Google Sheets jadi tanggal.
    Tahun hanya ditulis bila nama harinya cocok dengan tahun itu dan tahunnya tidak melewati
    tahun transaksi (tahun 2026 = tahun bawaan Sheets; JUN pernah diganti manual 2026->2023
    sehingga nama harinya tidak cocok lagi).
    Mengembalikan (teks_baru, jumlah_pengganti).
    """
    if not teks or 'GMT' not in teks:
        return teks, 0

    def ganti(m):
        hari, bln, tgl, thn = m.group(1), _BULAN_EN.index(m.group(2)) + 1, int(m.group(3)), int(m.group(4))
        hasil = '%02d/%02d' % (tgl, bln)
        try:
            cocok = _HARI_EN[dt.date(thn, bln, tgl).weekday()] == hari
        except ValueError:
            cocok = False
        if cocok and thn <= tahun_transaksi:
            hasil += '/%04d' % thn
        return hasil

    return POLA_GMT.subn(ganti, teks)


def potong_ganda(teks):
    """'REF X Y Z X Y Z' -> 'REF X Y Z' (bagian setelah kode referensi tertulis dua kali persis)."""
    token = teks.split()
    isi = token[1:]
    n = len(isi)
    if n >= 4 and n % 2 == 0 and isi[:n // 2] == isi[n // 2:]:
        return ' '.join(token[:1] + isi[:n // 2]), True
    return teks, False


def adalah_label_saldo(teks):
    """C baris terakhir yang tertimpa label ' SALDO AWAL : MUTASI CR : MUTASI DB : SALDO AKHIR :'."""
    return bool(teks) and bool(POLA_LABEL_SALDO.match(rapikan_spasi(teks)))


def susun_ket_lengkap(pendek, c):
    """C bila C diawali B (pola JAN), selain itu B + ' ' + C (pola FEB-DES)."""
    pendek, c = rapikan_spasi(pendek), rapikan_spasi(c)
    if not c:
        return pendek
    if not pendek or c == pendek or c.startswith(pendek + ' '):
        return c
    return pendek + ' ' + c


def bersihkan_keterangan(b, c, tahun_transaksi):
    """Kolom B & C -> dict(ketPendek, ketLengkap, ketAsli, diperbaiki, rincian).

    rincian: daftar perbaikan ('gmt', 'ganda', 'label_saldo', 'b_dari_c').
    """
    rincian = []
    if kosong(b) and not kosong(c):
        b = c
        rincian.append('b_dari_c')
    pendek = rapikan_spasi(b)
    c_mentah = '' if kosong(c) else str(c)
    if adalah_label_saldo(c_mentah):
        c_bersih = ''
        rincian.append('label_saldo')
    else:
        c_bersih = rapikan_spasi(c_mentah)
        c_bersih, ganda = potong_ganda(c_bersih)
        if ganda:
            rincian.append('ganda')
        c_bersih, n_gmt = pulihkan_gmt(c_bersih, tahun_transaksi)
        if n_gmt:
            rincian.append('gmt')
        c_bersih = rapikan_spasi(c_bersih)
    lengkap = susun_ket_lengkap(pendek, c_bersih)
    asli = susun_ket_lengkap(pendek, c_mentah)
    diperbaiki = lengkap != asli
    return {
        'ketPendek': pendek,
        'ketLengkap': lengkap,
        'ketAsli': asli if diperbaiki else None,
        'diperbaiki': diperbaiki,
        'rincian': rincian,
    }


def jenis_pendek(ket_pendek):
    """'TRSF E-BANKING DB TANGGAL :30/12' -> 'TRSF E-BANKING DB'; 'TARIKAN ATM 15/07' -> 'TARIKAN ATM'."""
    teks = POLA_TANGGAL_EFEKTIF.sub('', rapikan_spasi(ket_pendek))
    return re.sub(r'\s+\d{1,2}/\d{1,2}$', '', teks)


_TOKEN_NAMA = re.compile(r"[A-Z0-9.&,'()\-]*[A-Z][A-Z0-9.&,'()\-]*")
_POLA_VA = re.compile(r'/FTFVA/\S+\s+(?P<isi>.*)$')
_POLA_TRANSFER = re.compile(r'TRANSFER ?(?:KE|DR) \d+ (?P<sisa>.+)$')
_KANAL = {'M-BCA', 'KLIKBCA', 'MYBCA'}


def _nama_huruf_besar(token, panjang_maks, dari_belakang):
    """Ambil deretan token nama (tanpa huruf kecil) dari ujung, maksimal panjang_maks karakter."""
    urutan = list(reversed(token)) if dari_belakang else list(token)
    nama, panjang = [], 0
    for t in urutan:
        t = re.sub(r'^\d[\d.,]*(?=[A-Z])', '', t.strip('"\''))
        if not t or not _TOKEN_NAMA.fullmatch(t) or '/' in t:
            break
        tambah = len(t) + (1 if nama else 0)
        if nama and panjang + tambah > panjang_maks:
            break
        nama.append(t)
        panjang += tambah
    return ' '.join(reversed(nama) if dari_belakang else nama)


def ekstrak_pihak(ket_pendek, ket_lengkap, panjang_maks=18):
    """Nama pihak transaksi untuk peta saran kategori.

    Umumnya = deretan kata huruf besar di akhir keterangan (BCA memotong nama menjadi 18 karakter;
    berita transfer biasanya huruf kecil atau angka). Nomor kartu dan kanal (M-BCA) di ujung dilewati.
    Virtual account (FTFVA) memakai nama VA; BI-FAST/SWITCHING memakai nama setelah kode bank;
    biaya BI-FAST menjadi 'BIAYA TXN'. Bila tidak ada nama, dipakai jenis transaksi (mis. 'BIAYA ADM').
    """
    pendek = rapikan_spasi(ket_pendek)
    lengkap = rapikan_spasi(ket_lengkap)
    sisa = lengkap[len(pendek):].strip() if pendek and lengkap.startswith(pendek) else lengkap
    token = sisa.split()
    while token and (re.fullmatch(r'\d{10,}', token[-1]) or token[-1] in _KANAL):
        token.pop()
    sisa = ' '.join(token)
    if 'BIAYA TXN' in sisa:
        return 'BIAYA TXN'
    va = _POLA_VA.search(sisa)
    if va:
        isi = va.group('isi')
        nama_va = re.match(r'\d+/(.*)$', isi)
        nama = _nama_huruf_besar(nama_va.group(1).split(), 12, False) if nama_va else ''
        if nama:
            return nama
        nomor = re.search(r'(?:^|\s)(\d{4,})$', isi)
        if nomor:
            return 'VA ' + nomor.group(1)
    tf = _POLA_TRANSFER.search(sisa)
    if tf:
        nama = _nama_huruf_besar(tf.group('sisa').split(), panjang_maks, False)
        if nama:
            return nama
    nama = _nama_huruf_besar(token, panjang_maks, True)
    return nama or jenis_pendek(pendek)


def normal_kategori(nilai):
    """Nilai kolom I -> kode kategori (None bila kosong)."""
    if kosong(nilai):
        return None
    teks = rapikan_spasi(nilai).upper()
    teks = ALIAS_KATEGORI.get(teks, teks)
    return teks.replace(' ', '_')


# ---------------------------------------------------------------- satu bulan

def bersihkan_bulan(baris, tahun, bulan, tab, berkas):
    """Bersihkan satu tab master.

    baris: daftar (nomor_baris_excel, [A, B, C, D, E, F, G, H, I]).
    Mengembalikan dict:
      kode, tahun, bulan, tab, berkas, saldoAwalSen, saldoAkhirSen, transaksi (urut mutasi),
      penutup (baris MUTASI CR/DB/SALDO AKHIR), kontrol (angka untuk pemeriksaan), catatan, galat.
    Field transaksi yang diawali '_' hanya untuk pemeriksaan dan tidak diunggah.
    """
    kode = '%04d-%02d' % (tahun, bulan)
    hasil = {
        'kode': kode, 'tahun': tahun, 'bulan': bulan, 'tab': tab, 'berkas': berkas,
        'saldoAwalSen': None, 'saldoAkhirSen': None, 'barisSaldoAwal': None,
        'transaksi': [], 'penutup': [], 'catatan': [], 'galat': [],
        'kontrol': Counter(),
    }
    kontrol = hasil['kontrol']
    for nomor, sel in baris:
        sel = (list(sel) + [None] * 9)[:9]
        a, b, c, d, e, _f, g, h, i = sel
        if all(kosong(v) for v in (a, b, c, d, e, _f)):
            kontrol['barisKosong'] += 1
            continue
        b_atas = rapikan_spasi(b).upper()
        if b_atas == 'SALDO AWAL':
            try:
                hasil['saldoAwalSen'] = ke_sen(g)
                hasil['barisSaldoAwal'] = nomor
                hasil['kreditBarisSaldoAwalSen'] = ke_sen(e)
                hasil['saldoBankAwalSen'] = ke_sen(h)
            except ValueError as err:
                hasil['galat'].append('Baris %d (SALDO AWAL): %s' % (nomor, err))
            continue
        if b_atas in BARIS_PENUTUP:
            hasil['penutup'].append({'baris': nomor, 'jenis': b_atas, 'd': d, 'e': e})
            continue
        try:
            hasil['transaksi'].append(_bersihkan_transaksi(nomor, a, b, c, d, e, h, i, tahun, bulan, kode, tab,
                                                           berkas, kontrol, hasil['catatan']))
        except ValueError as err:
            hasil['galat'].append('Baris %d: %s' % (nomor, err))

    if hasil['saldoAwalSen'] is None:
        hasil['galat'].append('Baris SALDO AWAL tidak ditemukan di tab %s' % tab)
        return hasil
    _hitung_saldo(hasil)
    for p in hasil['penutup']:
        hasil['catatan'].append('Baris %d: baris penutup bank %s dibuang' % (p['baris'], p['jenis']))
    if kontrol['barisKosong']:
        hasil['catatan'].append('%d baris kosong dibuang' % kontrol['barisKosong'])
    return hasil


def _bersihkan_transaksi(nomor, a, b, c, d, e, h, i, tahun, bulan, kode, tab, berkas, kontrol, catatan):
    tanggal, ditukar = bersihkan_tanggal(a, tahun, bulan)
    debet, kredit = ke_sen(d), ke_sen(e)
    angka_teks = isinstance(d, str) and not kosong(d) or isinstance(e, str) and not kosong(e)
    if angka_teks:
        kontrol['angkaTeks'] += 1
        catatan.append('Baris %d: nominal berupa teks diubah menjadi angka' % nomor)
    debet, kredit = debet or 0, kredit or 0
    if debet < 0 or kredit < 0:
        raise ValueError('nominal negatif')
    if (debet > 0) == (kredit > 0):
        raise ValueError('debet dan kredit harus tepat satu yang terisi (debet=%s, kredit=%s)' % (d, e))
    ket = bersihkan_keterangan(b, c, tahun)
    if 'b_dari_c' in ket['rincian']:
        kontrol['bDariC'] += 1
        catatan.append('Baris %d: kolom B kosong, diisi dari C' % nomor)
    if 'label_saldo' in ket['rincian']:
        kontrol['labelSaldo'] += 1
        catatan.append('Baris %d: kolom C tertimpa label SALDO AWAL/MUTASI, keterangan memakai kolom B' % nomor)
    if 'gmt' in ket['rincian']:
        kontrol['ketGmt'] += 1
    if 'ganda' in ket['rincian']:
        kontrol['ketGanda'] += 1

    d_numerik = debet if not isinstance(d, str) else 0
    kredit_sebelum_bunga = kredit
    if ket['ketPendek'].upper() == 'BUNGA' and debet > 0:
        debet, kredit = 0, debet
        kontrol['bungaDipindah'] += 1
        catatan.append('Baris %d: BUNGA tercatat di debet, dipindah ke kredit' % nomor)

    kat_asal = normal_kategori(i)
    perlu = []
    if ditukar:
        perlu.append('tanggal_ditukar')
    if ket['diperbaiki']:
        perlu.append('keterangan_diperbaiki')
    return {
        'id': '%s-r%04d' % (kode, nomor),
        'bulan': kode,
        'tahun': tahun,
        'tanggal': tanggal.isoformat(),
        'urutan': 0,
        'ketPendek': ket['ketPendek'],
        'ketLengkap': ket['ketLengkap'],
        'ketAsli': ket['ketAsli'],
        'jenis': 'DB' if debet > 0 else 'CR',
        'debetSen': debet,
        'kreditSen': kredit,
        'saldoSen': 0,
        'saldoBankSen': None,
        'kategori': 'KOSONG',
        'kategoriAsal': kat_asal,
        'saran': None,
        'entitas': 'BELUM',
        'perluCek': perlu,
        'sumber': {'file': berkas, 'tab': tab, 'baris': nomor},
        'diubahOleh': None,
        'diubahOlehEmail': None,
        'diubahPada': None,
        '_h': h,
        '_kategoriMentah': rapikan_spasi(i).upper(),
        '_dNumerikSen': d_numerik,
        '_kreditSebelumBungaSen': kredit_sebelum_bunga,
        '_rincianKet': ket['rincian'],
    }


def _hitung_saldo(hasil):
    """Saldo dihitung ulang dari saldo awal, lalu dicocokkan dengan kolom H (saldo cetak bank)."""
    saldo = hasil['saldoAwalSen']
    kontrol = hasil['kontrol']
    for n, t in enumerate(hasil['transaksi'], 1):
        t['urutan'] = n
        saldo = saldo - t['debetSen'] + t['kreditSen']
        t['saldoSen'] = saldo
        h = t.pop('_h')
        try:
            h_sen = ke_sen(h)
        except ValueError:
            hasil['catatan'].append('Baris %d: kolom H bukan angka (%r), diabaikan' % (t['sumber']['baris'], h))
            continue
        if h_sen is None:
            continue
        kontrol['selH'] += 1
        if abs(h_sen - saldo) <= 1:
            t['saldoBankSen'] = h_sen
            continue
        if h_sen == (t['debetSen'] or t['kreditSen']):
            kontrol['hNyasar'] += 1
            hasil.setdefault('hNyasar', []).append(t['sumber']['baris'])
            hasil['catatan'].append('Baris %d: kolom H berisi nominal transaksi, bukan saldo; diabaikan'
                                    % t['sumber']['baris'])
            continue
        t['saldoBankSen'] = h_sen
        t['perluCek'].append('saldo_beda')
        kontrol['saldoBeda'] += 1
        hasil['catatan'].append('Baris %d: saldo hitung %s berbeda dengan saldo bank %s'
                                % (t['sumber']['baris'], rupiah(saldo), rupiah(h_sen)))
    hasil['saldoAkhirSen'] = saldo


# ---------------------------------------------------------------- kategori, entitas, saran

def buat_peta_saran(daftar_transaksi, min_muncul=5, min_persen=90):
    """Peta (jenis, pihak) -> kategori dari transaksi berkategori di bulan terpercaya.

    Hanya pihak yang muncul >= min_muncul kali (berkategori) dengan >= min_persen % kategori sama.
    Mengembalikan (peta, rincian) — rincian untuk keluaran/peta_saran.csv.
    """
    hitung = defaultdict(Counter)
    total = Counter()
    for t in daftar_transaksi:
        if t['bulan'] not in BULAN_TERPERCAYA:
            continue
        kunci = (t['jenis'], ekstrak_pihak(t['ketPendek'], t['ketLengkap']))
        total[kunci] += 1
        if t['kategoriAsal'] and t['kategoriAsal'] in KATEGORI and t['kategoriAsal'] != 'KOSONG':
            hitung[kunci][t['kategoriAsal']] += 1
    peta, rincian = {}, []
    for kunci, c in hitung.items():
        n = sum(c.values())
        kat, jml = c.most_common(1)[0]
        persen = 100.0 * jml / n
        dipakai = n >= min_muncul and persen >= min_persen
        if dipakai:
            peta[kunci] = kat
        rincian.append({'jenis': kunci[0], 'pihak': kunci[1], 'kategori': kat, 'jumlahKategori': jml,
                        'jumlahBerkategori': n, 'jumlahSemua': total[kunci], 'persen': round(persen, 1),
                        'dipakai': dipakai, 'sebaran': dict(c)})
    rincian.sort(key=lambda r: (not r['dipakai'], -r['jumlahBerkategori'], r['jenis'], r['pihak']))
    return peta, rincian


def terapkan_kategori(t, pakai_kategori_asal=False, peta_saran=None):
    """Isi kategori, entitas, saran, dan tanda 'kategori_diragukan' satu transaksi (mengubah t)."""
    asal = t['kategoriAsal']
    sah = asal if asal in KATEGORI else None
    terpercaya = t['bulan'] in BULAN_TERPERCAYA
    if asal and (not sah or not (terpercaya or pakai_kategori_asal)):
        t['kategori'] = 'KOSONG'
        if 'kategori_diragukan' not in t['perluCek']:
            t['perluCek'].append('kategori_diragukan')
    else:
        t['kategori'] = sah or 'KOSONG'
    t['entitas'] = 'PRIBADI' if terpercaya and t['kategori'] == 'PRIBADI' else 'BELUM'
    if peta_saran is not None:
        t['saran'] = peta_saran.get((t['jenis'], ekstrak_pihak(t['ketPendek'], t['ketLengkap'])))
    t['perluCek'].sort(key=PERLU_CEK.index)
    return t


def transaksi_penyesuaian(bln, selisih_sen):
    """Baris sintetis untuk menutup celah saldo ke bulan berikutnya (opsi --penyesuaian)."""
    terakhir = bln['transaksi'][-1] if bln['transaksi'] else None
    urutan = (terakhir['urutan'] if terakhir else 0) + 1
    hari = calendar.monthrange(bln['tahun'], bln['bulan'])[1]
    saldo = (terakhir['saldoSen'] if terakhir else bln['saldoAwalSen']) + selisih_sen
    return {
        'id': '%s-r9999' % bln['kode'],
        'bulan': bln['kode'], 'tahun': bln['tahun'],
        'tanggal': '%s-%02d' % (bln['kode'], hari),
        'urutan': urutan,
        'ketPendek': 'PENYESUAIAN',
        'ketLengkap': 'PENYESUAIAN SALDO (baris sintetis: bunga/pajak bunga akhir bulan tidak ada di mutasi)',
        'ketAsli': None,
        'jenis': 'CR' if selisih_sen > 0 else 'DB',
        'debetSen': max(0, -selisih_sen), 'kreditSen': max(0, selisih_sen),
        'saldoSen': saldo, 'saldoBankSen': None,
        'kategori': 'BANK', 'kategoriAsal': None, 'saran': None, 'entitas': 'BELUM',
        'perluCek': ['sintetis'],
        'sumber': {'file': bln['berkas'], 'tab': bln['tab'], 'baris': None},
        'diubahOleh': None, 'diubahOlehEmail': None, 'diubahPada': None,
    }


def untuk_unggah(t):
    """Salinan transaksi tanpa field bantu ('id' dan yang diawali '_')."""
    return {k: v for k, v in t.items() if k != 'id' and not k.startswith('_')}


# ---------------------------------------------------------------- ringkasan

MAP_RINGKASAN = ['debetSenPerKategori', 'kreditSenPerKategori', 'jumlahPerKategori',
                 'debetSenPerEntitas', 'kreditSenPerEntitas', 'jumlahPerEntitas',
                 'debetSenPerEntitasKategori', 'kreditSenPerEntitasKategori']


def ringkasan_kosong():
    return {
        'debetSenPerKategori': {k: 0 for k in KATEGORI},
        'kreditSenPerKategori': {k: 0 for k in KATEGORI},
        'jumlahPerKategori': {k: 0 for k in KATEGORI},
        'debetSenPerEntitas': {e: 0 for e in ENTITAS},
        'kreditSenPerEntitas': {e: 0 for e in ENTITAS},
        'jumlahPerEntitas': {e: 0 for e in ENTITAS},
        'debetSenPerEntitasKategori': {e: {k: 0 for k in KATEGORI} for e in ENTITAS},
        'kreditSenPerEntitasKategori': {e: {k: 0 for k in KATEGORI} for e in ENTITAS},
    }


def hitung_ringkasan(daftar_transaksi):
    """8 map ringkasan + jumlahTransaksi, totalDebetSen, totalKreditSen dari daftar transaksi."""
    r = ringkasan_kosong()
    total_d = total_k = 0
    for t in daftar_transaksi:
        k, e = t.get('kategori') or 'KOSONG', t.get('entitas') or 'BELUM'
        d, c = int(t.get('debetSen') or 0), int(t.get('kreditSen') or 0)
        total_d += d
        total_k += c
        r['debetSenPerKategori'][k] = r['debetSenPerKategori'].get(k, 0) + d
        r['kreditSenPerKategori'][k] = r['kreditSenPerKategori'].get(k, 0) + c
        r['jumlahPerKategori'][k] = r['jumlahPerKategori'].get(k, 0) + 1
        r['debetSenPerEntitas'][e] = r['debetSenPerEntitas'].get(e, 0) + d
        r['kreditSenPerEntitas'][e] = r['kreditSenPerEntitas'].get(e, 0) + c
        r['jumlahPerEntitas'][e] = r['jumlahPerEntitas'].get(e, 0) + 1
        for nama, nilai in (('debetSenPerEntitasKategori', d), ('kreditSenPerEntitasKategori', c)):
            per_e = r[nama].setdefault(e, {kk: 0 for kk in KATEGORI})
            per_e[k] = per_e.get(k, 0) + nilai
    r['jumlahTransaksi'] = len(daftar_transaksi)
    r['totalDebetSen'] = total_d
    r['totalKreditSen'] = total_k
    return r


def hitung_kualitas(daftar_transaksi, catatan=()):
    c = Counter(f for t in daftar_transaksi for f in (t.get('perluCek') or []))
    return {
        'tanggalDitukar': c['tanggal_ditukar'],
        'keteranganDiperbaiki': c['keterangan_diperbaiki'],
        'kategoriDiragukan': c['kategori_diragukan'],
        'saldoBeda': c['saldo_beda'],
        'catatan': list(catatan),
    }


def selisih_ringkasan(tersimpan, hitungan, kunci=None):
    """Bandingkan ringkasan tersimpan dengan hasil hitungan. Mengembalikan daftar (jalur, tersimpan, hitungan)."""
    beda = []
    for nama in kunci or (MAP_RINGKASAN + ['jumlahTransaksi', 'totalDebetSen', 'totalKreditSen']):
        a, b = (tersimpan or {}).get(nama), hitungan.get(nama)
        if isinstance(b, dict):
            a = a if isinstance(a, dict) else {}
            for k in sorted(set(a) | set(b)):
                if isinstance(b.get(k), dict) or isinstance(a.get(k), dict):
                    aa, bb = a.get(k) if isinstance(a.get(k), dict) else {}, b.get(k) or {}
                    for kk in sorted(set(aa) | set(bb)):
                        if aa.get(kk) != bb.get(kk):
                            beda.append(('%s.%s.%s' % (nama, k, kk), aa.get(kk), bb.get(kk)))
                elif a.get(k) != b.get(k):
                    beda.append(('%s.%s' % (nama, k), a.get(k), b.get(k)))
        elif a != b:
            beda.append((nama, a, b))
    return beda


def dokumen_bulan(kode, saldo_awal_sen, ringkasan, kualitas, sumber):
    tahun, bulan = int(kode[:4]), int(kode[5:7])
    dok = {
        'kode': kode, 'tahun': tahun, 'bulan': bulan,
        'label': '%s %d' % (NAMA_BULAN[bulan - 1], tahun),
        'saldoAwalSen': saldo_awal_sen,
        'saldoAkhirSen': saldo_awal_sen + ringkasan['totalKreditSen'] - ringkasan['totalDebetSen'],
        'jumlahTransaksi': ringkasan['jumlahTransaksi'],
        'totalDebetSen': ringkasan['totalDebetSen'],
        'totalKreditSen': ringkasan['totalKreditSen'],
    }
    for nama in MAP_RINGKASAN:
        dok[nama] = ringkasan[nama]
    dok['linkHome'] = LINK_HOME.format(NAMA_BULAN[bulan - 1].lower())
    dok['kualitas'] = kualitas
    dok['sumber'] = sumber
    return dok
