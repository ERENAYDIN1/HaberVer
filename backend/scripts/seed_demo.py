"""Gelistirme/demo verisi tohumlar - MIGRATION ZINCIRININ DISINDADIR.

Neden migration degil: migration'lar semanin surum gecmisidir, demo veri degil.
Bu dosya alembic tarafindan hic bilinmez, dolayisiyla `alembic upgrade head`
uretimde calistiginda demo veri FIZIKSEL OLARAK devrede olmaz - yanlis/unutulmus
bir ortam degiskeni riski yoktur. Ayrica demo veriyi degistirmek icin yeni bir
migration yazmak gerekmez, bu dosyayi duzenleyip tekrar calistirmak yeter.

Kullanim (backend container icinde):
    python scripts/seed_demo.py            # ekle (idempotent, tekrar calisabilir)
    python scripts/seed_demo.py --temizle  # once demo veriyi sil, sonra ekle
    python scripts/seed_demo.py --sil      # yalnizca demo veriyi sil

Tohumlanan hesaplarin parolalari bu dosyada aciktir - bu bilincli bir tercihtir
ve bu verinin ASLA uretime gitmemesi gerektiginin bir baska sebebidir.
"""
import argparse
import sys
from pathlib import Path

import bcrypt
import sqlalchemy as sa

# scripts/ altindan calistirildiginda app paketini bulabilmek icin.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.database import SessionLocal  # noqa: E402

# --- Demo hesaplar: (email, ad, rol, parola, lon, lat) -----------------------
# Saha ekiplerinin konumu, otomatik yonlendirmenin (mesafe + yaka kisiti) elle
# denenebilmesi icin bilincli olarak iki yakaya dagitildi.
KULLANICILAR = [
    ("sahaekibi1@greenasset.com", "Saha Ekibi 1 (Kadıköy)", "saha_calisani",
     "saha1234", 29.0275, 40.9902),
    ("sahaekibi2@greenasset.com", "Saha Ekibi 2 (Beşiktaş)", "saha_calisani",
     "saha1234", 29.0067, 41.0430),
    ("sahaekibi3@greenasset.com", "Saha Ekibi 3 (Bakırköy)", "saha_calisani",
     "saha1234", 28.8720, 40.9805),
    ("calisan1@greenasset.com", "Belediye Personeli 1", "calisan",
     "calisan1234", None, None),
    ("vatandas1@greenasset.com", "Örnek Vatandaş", "vatandas",
     "vatandas1234", None, None),
]

# --- Bakim bekleyen varliklar: (ad, tip, lon, lat) ---------------------------
BAKIM_VARLIKLARI = [
    ("Kadıköy Moda Aydınlatma D-7", "direk", 29.0300, 40.9870),
    ("Beşiktaş Meydan Çınarı", "agac", 29.0050, 41.0425),
    ("Şişli Aydınlatma D-22", "direk", 28.9870, 41.0600),
    ("Kadıköy Moda Parkı Sulama Hattı", "sulama", 29.0265, 40.9885),
    ("Beşiktaş Sahil Sulama Vanası", "sulama", 29.0060, 41.0435),
    ("Bakırköy Botanik Sulama Sistemi", "sulama", 28.8710, 40.9800),
]

# --- Saglam (iyi) varliklar: (ad, tip, lon, lat, marka_model, kurulum) -------
IYI_VARLIKLAR = [
    # Avrupa yakasi
    ("Maçka Parkı Çınarı", "agac", 28.9948, 41.0455, None, "2011-03-18"),
    ("Gülhane Parkı Aydınlatma D-3", "direk", 28.9810, 41.0130,
     "Schreder Ampera 60W", "2019-06-02"),
    ("Yıldız Parkı Sulama Hattı A", "sulama", 29.0100, 41.0500,
     "Rain Bird 5004-PL", "2020-04-27"),
    ("Emirgan Korusu Erguvanı", "agac", 29.0540, 41.1080, None, "2008-04-09"),
    ("Bakırköy Sahil Aydınlatma D-15", "direk", 28.8690, 40.9760,
     "Philips UrbanLine 80W", "2018-09-14"),
    ("Florya Sahil Sulama Vanası", "sulama", 28.7850, 40.9740,
     "Hunter PGV-101G", "2021-05-11"),
    ("Gezi Parkı Ihlamuru", "agac", 28.9880, 41.0375, None, "2013-11-22"),
    # Anadolu yakasi
    ("Fenerbahçe Parkı Çınarı", "agac", 29.0450, 40.9720, None, "2006-10-05"),
    ("Göztepe 60. Yıl Parkı Aydınlatma D-8", "direk", 29.0640, 40.9820,
     "Schreder Ampera 60W", "2019-06-02"),
    ("Validebağ Korusu Sulama Hattı", "sulama", 29.0480, 41.0000,
     "Rain Bird 5004-PL", "2020-08-19"),
    ("Çubuklu Sahil Aydınlatma D-4", "direk", 29.0850, 41.1000,
     "Philips UrbanLine 80W", "2017-07-30"),
    ("Maltepe Sahil Parkı Zeytini", "agac", 29.1300, 40.9250, None, "2015-02-16"),
]

# --- Bekleyen vatandas ihbarlari: (ad, tip, lon, lat, aciklama) --------------
# photo_url NULL kalir: API'den gonderilen ihbarlarda fotograf zorunludur ama
# tohumlanan kayitlar icin diskte bir dosya yok.
IHBARLAR = [
    ("Kadıköy'de kurumuş ağaç", "agac", 29.0240, 40.9880,
     "Ağaç tamamen kurumuş, düşme tehlikesi var."),
    ("Bakırköy'de yanmayan direk", "direk", 28.8740, 40.9810,
     "Sokak lambası geceleri hiç yanmıyor."),
    ("Fatih'te devrilmiş direk", "direk", 28.9500, 41.0180,
     "Aydınlatma direği yana yatmış, kaldırımı kapatıyor."),
    ("Bahariye'de kurumuş ağaç", "agac", 29.0290, 40.9880,
     "Ağacın yaprakları tamamen dökülmüş, gövdesi kurumuş görünüyor."),
    ("Barbaros Bulvarı'nda yanmayan direk", "direk", 29.0050, 41.0450,
     "İki gecedir bu direkteki lamba hiç yanmıyor, sokak karanlık."),
    ("Salacak'ta patlamış sulama borusu", "sulama", 29.0150, 41.0230,
     "Sulama borusu patlamış, kaldırıma sürekli su akıyor."),
    ("Bomonti'de devrilmek üzere olan ağaç", "agac", 28.9820, 41.0620,
     "Ağaç son fırtınadan sonra yana yattı, park halindeki araçlara doğru eğik."),
    ("Pendik Sahil'de kırık aydınlatma direği", "direk", 29.2350, 40.8760,
     "Direğin alt kapağı kopmuş, kabloları açıkta duruyor. Çocuklar için tehlikeli."),
]

# --- Baslangic atamalari: (varlik_adi, ekip_emaili) --------------------------
ATAMALAR = [
    ("Kadıköy Moda Aydınlatma D-7", "sahaekibi1@greenasset.com"),
    ("Beşiktaş Meydan Çınarı", "sahaekibi2@greenasset.com"),
]

TUM_VARLIK_ADLARI = [a[0] for a in BAKIM_VARLIKLARI] + [a[0] for a in IYI_VARLIKLAR]
TUM_IHBAR_ADLARI = [r[0] for r in IHBARLAR]
TUM_EMAILLER = [k[0] for k in KULLANICILAR]


def _hash(parola: str) -> str:
    return bcrypt.hashpw(parola.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def sil(db) -> None:
    """Demo veriyi kaldirir. Sirasi onemli: assignments ve reports, assets ve
    users'a FK ile bagli (assignments CASCADE, reports.created_asset_id SET NULL
    olsa da activity_logs kayitlari icin acik silme daha ongorulebilir)."""
    db.execute(
        sa.text("DELETE FROM reports WHERE name = ANY(:adlar)"),
        {"adlar": TUM_IHBAR_ADLARI},
    )
    # assignments, assets/users silinince ON DELETE CASCADE ile gider.
    db.execute(
        sa.text("DELETE FROM assets WHERE name = ANY(:adlar)"),
        {"adlar": TUM_VARLIK_ADLARI},
    )
    db.execute(
        sa.text("DELETE FROM users WHERE email = ANY(:mailler)"),
        {"mailler": TUM_EMAILLER},
    )
    db.commit()
    print("Demo veri silindi.")


def ekle(db) -> None:
    """Demo veriyi ekler. Her kayit NOT EXISTS ile korunur; script tekrar tekrar
    calistirilabilir, kopya olusmaz."""
    for email, ad, rol, parola, lon, lat in KULLANICILAR:
        # Konumu olan (saha ekibi) ve olmayan (calisan/vatandas) hesaplar icin
        # ayri INSERT: tek sorguda CASE ile NULL konum uretmek, ayni parametrenin
        # hem IS NULL kontrolunde hem ST_MakePoint'te gecmesine yol aciyor ve
        # Postgres parametre tipini cikaramiyor (AmbiguousParameter).
        if lon is None:
            sorgu = sa.text(
                """
                INSERT INTO users (email, hashed_password, full_name, role)
                SELECT :email, :hash, :ad, CAST(:rol AS user_role)
                WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = :email)
                """
            )
        else:
            sorgu = sa.text(
                """
                INSERT INTO users (email, hashed_password, full_name, role,
                                   last_location, last_seen_at)
                SELECT :email, :hash, :ad, CAST(:rol AS user_role),
                       ST_SetSRID(ST_MakePoint(:lon, :lat), 4326), now()
                WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = :email)
                """
            ).bindparams(
                sa.bindparam("lon", lon, type_=sa.Float),
                sa.bindparam("lat", lat, type_=sa.Float),
            )
        db.execute(
            sorgu.bindparams(
                sa.bindparam("email", email, type_=sa.String),
                sa.bindparam("hash", _hash(parola), type_=sa.String),
                sa.bindparam("ad", ad, type_=sa.String),
                sa.bindparam("rol", rol, type_=sa.String),
            )
        )

    for ad, tip, lon, lat in BAKIM_VARLIKLARI:
        db.execute(
            sa.text(
                """
                INSERT INTO assets (name, type, status, source, geometry)
                SELECT :ad, CAST(:tip AS asset_type), 'bakim_lazim', 'kayitli',
                       ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)
                WHERE NOT EXISTS (SELECT 1 FROM assets WHERE name = :ad)
                """
            ).bindparams(
                sa.bindparam("ad", ad, type_=sa.String),
                sa.bindparam("tip", tip, type_=sa.String),
                sa.bindparam("lon", lon, type_=sa.Float),
                sa.bindparam("lat", lat, type_=sa.Float),
            )
        )

    for ad, tip, lon, lat, marka, tarih in IYI_VARLIKLAR:
        db.execute(
            sa.text(
                """
                INSERT INTO assets (name, type, status, source, geometry,
                                    brand_model, install_date)
                SELECT :ad, CAST(:tip AS asset_type), 'iyi', 'kayitli',
                       ST_SetSRID(ST_MakePoint(:lon, :lat), 4326),
                       :marka, CAST(:tarih AS date)
                WHERE NOT EXISTS (SELECT 1 FROM assets WHERE name = :ad)
                """
            ).bindparams(
                sa.bindparam("ad", ad, type_=sa.String),
                sa.bindparam("tip", tip, type_=sa.String),
                sa.bindparam("lon", lon, type_=sa.Float),
                sa.bindparam("lat", lat, type_=sa.Float),
                sa.bindparam("marka", marka, type_=sa.String),
                sa.bindparam("tarih", tarih, type_=sa.String),
            )
        )

    for ad, tip, lon, lat, note in IHBARLAR:
        db.execute(
            sa.text(
                """
                INSERT INTO reports (reporter_id, name, type, note, geometry)
                SELECT (SELECT id FROM users WHERE email = 'vatandas1@greenasset.com'),
                       :ad, CAST(:tip AS asset_type), :note,
                       ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)
                WHERE NOT EXISTS (SELECT 1 FROM reports WHERE name = :ad)
                  AND EXISTS (SELECT 1 FROM users
                              WHERE email = 'vatandas1@greenasset.com')
                """
            ).bindparams(
                sa.bindparam("ad", ad, type_=sa.String),
                sa.bindparam("tip", tip, type_=sa.String),
                sa.bindparam("note", note, type_=sa.String),
                sa.bindparam("lon", lon, type_=sa.Float),
                sa.bindparam("lat", lat, type_=sa.Float),
            )
        )

    for varlik_ad, worker_email in ATAMALAR:
        db.execute(
            sa.text(
                """
                INSERT INTO assignments (asset_id, worker_id, status)
                SELECT a.id, u.id, 'atandi'
                FROM assets a, users u
                WHERE a.name = :varlik AND u.email = :email
                  AND NOT EXISTS (
                      SELECT 1 FROM assignments
                      WHERE asset_id = a.id AND status = 'atandi'
                  )
                """
            ).bindparams(
                sa.bindparam("varlik", varlik_ad, type_=sa.String),
                sa.bindparam("email", worker_email, type_=sa.String),
            )
        )

    # Saha ekiplerinin kadro yakasini son konumlarindan ata (yaka kisiti icin).
    db.execute(
        sa.text(
            """
            UPDATE users u
            SET yaka = (SELECT y.kod FROM yakalar y
                        ORDER BY y.geom <-> u.last_location LIMIT 1)
            WHERE u.role = 'saha_calisani' AND u.last_location IS NOT NULL
              AND u.yaka IS NULL
            """
        )
    )
    db.commit()

    def say(sorgu: str) -> int:
        return db.execute(sa.text(sorgu)).scalar()

    kullanici = say("SELECT count(*) FROM users")
    varlik = say("SELECT count(*) FROM assets")
    iyi = say("SELECT count(*) FROM assets WHERE status = 'iyi'")
    ihbar = say("SELECT count(*) FROM reports")
    gorev = say("SELECT count(*) FROM assignments WHERE status = 'atandi'")
    print(
        f"Demo veri hazır: {kullanici} kullanıcı, {varlik} varlık ({iyi} iyi / "
        f"{varlik - iyi} bakım bekliyor), {ihbar} ihbar, {gorev} aktif görev."
    )


def main() -> None:
    ap = argparse.ArgumentParser(description="GreenAsset demo verisi")
    ap.add_argument("--sil", action="store_true", help="yalnizca demo veriyi sil")
    ap.add_argument("--temizle", action="store_true", help="once sil, sonra ekle")
    args = ap.parse_args()

    db = SessionLocal()
    try:
        if args.sil or args.temizle:
            sil(db)
        if not args.sil:
            ekle(db)
    finally:
        db.close()


if __name__ == "__main__":
    main()
