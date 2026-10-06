// Fungsi murni untuk format tampilan. Semua uang dalam INTEGER SEN.

const NAMA_BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli',
  'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const SINGKAT_BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

const PETA_ESCAPE = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(nilai) {
  return String(nilai ?? '').replace(/[&<>"']/g, (c) => PETA_ESCAPE[c]);
}

function kelompokRibuan(bulat) {
  return String(bulat).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// 123456 -> "1.234,56"; 100000 -> "1.000" (desimal hanya bila ada sen).
export function angka(sen, { desimal = 'perlu' } = {}) {
  const n = Number(sen) || 0;
  const negatif = n < 0;
  const mutlak = Math.abs(Math.round(n));
  const rupiah = Math.floor(mutlak / 100);
  const sisa = mutlak % 100;
  let teks = kelompokRibuan(rupiah);
  if (desimal === 'selalu' || (desimal === 'perlu' && sisa !== 0)) {
    teks += ',' + String(sisa).padStart(2, '0');
  }
  return (negatif ? '-' : '') + teks;
}

export function rupiah(sen, opsi) {
  const teks = angka(sen, opsi);
  return teks.startsWith('-') ? '-Rp ' + teks.slice(1) : 'Rp ' + teks;
}

// Nilai rupiah (angka JS) untuk Excel: 123456 sen -> 1234.56
export function senKeRupiah(sen) {
  return Math.round(Number(sen) || 0) / 100;
}

// '2023-01-02' -> '02/01'
export function tanggalPendek(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return m ? `${m[3]}/${m[2]}` : String(iso || '');
}

// '2023-01-02' -> '2 Januari 2023'
export function tanggalPanjang(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return m ? `${Number(m[3])} ${NAMA_BULAN[Number(m[2]) - 1]} ${m[1]}` : String(iso || '');
}

export function namaBulan(nomor) {
  return NAMA_BULAN[nomor - 1] || '';
}

export function singkatBulan(nomor) {
  return SINGKAT_BULAN[nomor - 1] || '';
}

// '2023-01' -> 'Januari 2023'
export function labelBulan(kode) {
  const m = /^(\d{4})-(\d{2})$/.exec(kode || '');
  return m ? `${namaBulan(Number(m[2]))} ${m[1]}` : String(kode || '');
}

export function persen(bagian, total) {
  if (!total) return 0;
  return Math.floor((1000 * bagian) / total) / 10;
}

export function angkaBiasa(n) {
  return kelompokRibuan(Math.round(Number(n) || 0));
}

// Normalisasi teks untuk pencarian: huruf kecil, spasi tunggal.
export function normalTeks(s) {
  return String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function waktuLokal(ts) {
  try {
    const d = ts?.toDate ? ts.toDate() : null;
    return d ? d.toLocaleString('id-ID') : '';
  } catch {
    return '';
  }
}
