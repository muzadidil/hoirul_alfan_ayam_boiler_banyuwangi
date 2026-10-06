"""Sambungan firebase-admin untuk skrip alat/ (emulator atau proyek sungguhan).

Emulator dipakai bila FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST diisi.
Proyek sungguhan memakai Application Default Credentials
(gcloud auth application-default login) atau GOOGLE_APPLICATION_CREDENTIALS
yang menunjuk ke file kunci di LUAR folder repo.
"""
import os
import sys

PROYEK_EMULATOR = 'demo-zasha'
FOLDER_REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BATAS_BATCH = 400

_VAR_EMULATOR = {'firestore': 'FIRESTORE_EMULATOR_HOST', 'auth': 'FIREBASE_AUTH_EMULATOR_HOST'}


def emulator(layanan='firestore'):
    return os.environ.get(_VAR_EMULATOR[layanan]) or None


def di_dalam_repo(jalur):
    jalur = os.path.realpath(jalur)
    return jalur == FOLDER_REPO or jalur.startswith(FOLDER_REPO + os.sep)


def buka_app(proyek=None, layanan='firestore'):
    """Inisialisasi firebase_admin sekali. Mengembalikan (app, proyek, alamat_emulator)."""
    import firebase_admin
    from firebase_admin import credentials

    emu = emulator(layanan)
    if not emu and not proyek:
        sys.exit('Galat: --proyek <id> wajib diisi bila tidak memakai emulator (%s kosong).'
                 % _VAR_EMULATOR[layanan])
    kunci = os.environ.get('GOOGLE_APPLICATION_CREDENTIALS')
    if kunci and di_dalam_repo(kunci):
        sys.exit('Galat: GOOGLE_APPLICATION_CREDENTIALS menunjuk ke file di dalam repo. '
                 'Pindahkan file kunci ke luar repo (repo ini publik).')
    proyek = proyek or os.environ.get('GCLOUD_PROJECT') or PROYEK_EMULATOR
    try:
        return firebase_admin.get_app(), proyek, emu
    except ValueError:
        pass
    kredensial = _kredensial_emulator() if emu else credentials.ApplicationDefault()
    app = firebase_admin.initialize_app(kredensial, {'projectId': proyek})
    return app, proyek, emu


def firestore(proyek=None):
    from firebase_admin import firestore as fs
    app, proyek, emu = buka_app(proyek, 'firestore')
    tujuan = 'emulator %s' % emu if emu else 'PROYEK %s' % proyek
    return fs.client(app), tujuan


def _kredensial_emulator():
    """Emulator tidak memeriksa kredensial; firebase-admin tetap meminta satu."""
    import google.auth.credentials
    from firebase_admin import credentials

    class KredensialEmulator(credentials.Base):
        def get_credential(self):
            return google.auth.credentials.AnonymousCredentials()

    return KredensialEmulator()


class PenulisBatch:
    """Batch Firestore yang otomatis di-commit tiap BATAS_BATCH operasi."""

    def __init__(self, db, batas=BATAS_BATCH):
        self.db, self.batas = db, batas
        self.batch, self.isi, self.total = db.batch(), 0, 0

    def set(self, ref, data, merge=False):
        self.batch.set(ref, data, merge=merge)
        self._tambah()

    def update(self, ref, data):
        self.batch.update(ref, data)
        self._tambah()

    def _tambah(self):
        self.isi += 1
        self.total += 1
        if self.isi >= self.batas:
            self.selesai()

    def selesai(self):
        if self.isi:
            self.batch.commit()
            self.batch, self.isi = self.db.batch(), 0
