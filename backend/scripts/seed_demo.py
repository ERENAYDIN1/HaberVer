"""Gelistirme/demo verisi tohumlar; migration zincirinin disindadir.

Migration'lar semanin surum gecmisidir, demo veri degil. Bu dosya alembic
tarafindan bilinmedigi icin `alembic upgrade head` uretimde demo veri
olusturamaz; ayrica veriyi degistirmek icin yeni migration yazmak gerekmez.

Kullanim (backend container icinde):
    python scripts/seed_demo.py            # ekle (idempotent)
    python scripts/seed_demo.py --temizle  # once sil, sonra ekle
    python scripts/seed_demo.py --sil      # yalnizca sil

Silme, kaydedilmis TUM alanlari/guzergahlari (gorev_bolgeleri) da bosaltir.

Hesap parolalari bu dosyada aciktir; bu verinin uretime gitmemesi gerekir.
"""
import argparse
import sys
import uuid
from pathlib import Path

import sqlalchemy as sa

# scripts/ altindan calistirildiginda app paketini bulabilmek icin.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import keycloak  # noqa: E402
from app.database import SessionLocal  # noqa: E402

# --- Demo hesaplar: (email, ad, rol, parola, lon, lat, departman) ------------
#
# Ekipler HEM iki yakaya HEM yedi mudurluge dagitildi: otomatik atamanin uc
# kisiti da (mesafe + yaka + departman) elle denenebilsin. Yuku en yogun uc
# mudurluge (park, fen, aydinlatma) yaka basina birer ekip verildi - tek ekipli
# bir mudurlugun karsi yakadaki isi hicbir zaman otomatik atanmaz ve demo
# "bozuk" gorunurdu.
KULLANICILAR = [
    ("sahaekibi1@greenasset.com", "Park Ekibi 1 (Kadıköy)", "saha_calisani",
     "saha1234", 29.0275, 40.9902, "park_bahceler"),
    ("sahaekibi2@greenasset.com", "Park Ekibi 2 (Beşiktaş)", "saha_calisani",
     "saha1234", 29.0067, 41.0430, "park_bahceler"),
    ("sahaekibi3@greenasset.com", "Fen Ekibi 1 (Bakırköy)", "saha_calisani",
     "saha1234", 28.8720, 40.9805, "fen_isleri"),
    ("sahaekibi4@greenasset.com", "Fen Ekibi 2 (Ataşehir)", "saha_calisani",
     "saha1234", 29.1280, 40.9920, "fen_isleri"),
    ("sahaekibi5@greenasset.com", "Aydınlatma Ekibi 1 (Şişli)", "saha_calisani",
     "saha1234", 28.9880, 41.0610, "aydinlatma_enerji"),
    ("sahaekibi6@greenasset.com", "Aydınlatma Ekibi 2 (Üsküdar)", "saha_calisani",
     "saha1234", 29.0160, 41.0250, "aydinlatma_enerji"),
    ("sahaekibi7@greenasset.com", "Su Ekibi (Fatih)", "saha_calisani",
     "saha1234", 28.9490, 41.0170, "su_kanalizasyon"),
    ("sahaekibi8@greenasset.com", "Temizlik Ekibi (Eminönü)", "saha_calisani",
     "saha1234", 28.9710, 41.0170, "temizlik_isleri"),
    ("sahaekibi9@greenasset.com", "Ulaşım Ekibi (Levent)", "saha_calisani",
     "saha1234", 29.0135, 41.0785, "ulasim_hizmetleri"),
    ("sahaekibi10@greenasset.com", "Çözüm Merkezi Ekibi (Zeytinburnu)",
     "saha_calisani", "saha1234", 28.9050, 40.9925, "cozum_merkezi"),
    # Iki personel AYRI mudurluklerde: departman kapsaminin gercekten
    # ayirdigi (birinin digerinin taleplerini gormedigi) elle gorulebilsin.
    ("calisan1@greenasset.com", "Fen İşleri Personeli", "calisan",
     "calisan1234", None, None, "fen_isleri"),
    ("calisan2@greenasset.com", "Park ve Bahçeler Personeli", "calisan",
     "calisan1234", None, None, "park_bahceler"),
    ("vatandas1@greenasset.com", "Örnek Vatandaş", "vatandas",
     "vatandas1234", None, None, None),
]

# --- Bakim bekleyen varliklar: (ad, tip, lon, lat) ---------------------------
BAKIM_VARLIKLARI = [
    ("Kadıköy Moda Aydınlatma D-7", "direk", 29.0300, 40.9870),
    ("Beşiktaş Meydan Çınarı", "agac", 29.0050, 41.0425),
    ("Şişli Aydınlatma D-22", "direk", 28.9870, 41.0600),
    ("Kadıköy Moda Parkı Sulama Hattı", "sulama", 29.0265, 40.9885),
    ("Beşiktaş Sahil Sulama Vanası", "sulama", 29.0060, 41.0435),
    ("Bakırköy Botanik Sulama Sistemi", "sulama", 28.8710, 40.9800),
    # Her tur grubundan en az bir ornek: harita renkleri/glifleri gozle
    # dogrulanabilsin.
    ("Karaköy Kemeraltı Rögar Kapağı", "rogar", 28.9755, 41.0230),
    ("Üsküdar Sahil Yolu Çukuru", "yol", 29.0155, 41.0265),
    ("Kadıköy Bahariye Bankı B-12", "bank", 29.0285, 40.9905),
    ("Şişli Elektrik Panosu P-4", "elektrik_panosu", 28.9895, 41.0625),
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
    # Genisletilmis tur sozlugunden ornekler
    ("Maçka Parkı Oyun Grubu OG-2", "oyun_grubu", 28.9960, 41.0448,
     "Kompan Robinia", "2022-03-08"),
    ("Eminönü Meydan Çöp Konteyneri K-9", "cop_kutusu", 28.9705, 41.0175,
     "Otto 800L", "2023-01-19"),
    ("Beşiktaş İskele Trafik Levhası L-31", "trafik_levhasi", 29.0072, 41.0412,
     None, "2021-11-04"),
    ("Moda Sahil Kaldırım Bölümü K-5", "kaldirim", 29.0270, 40.9840,
     None, "2016-06-21"),
    ("Bostancı Su Hattı Vanası V-7", "su_hatti", 29.0960, 40.9520,
     "Hunter PGV-151", "2020-02-13"),
]

# --- Bekleyen vatandas talepleri: (ad, tip, lon, lat, aciklama) --------------
# photo_url NULL kalir: API'de fotograf zorunlu ama seed icin diskte dosya yok.
TALEPLER = [
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
    # Her tur grubundan ornek ("diger" dahil): talepler gercekte cesitlidir.
    ("Beyoğlu'nda açık kalmış rögar kapağı", "rogar", 28.9770, 41.0335,
     "Rögar kapağı yerinde değil, çukur açıkta. Gece görünmüyor, çok tehlikeli."),
    ("Mecidiyeköy'de derin asfalt çukuru", "yol", 28.9970, 41.0670,
     "Yolun ortasında derin bir çukur var, araçlar üzerinden geçerken zıplıyor."),
    ("Üsküdar'da kırık bank", "bank", 29.0135, 41.0255,
     "Parktaki bankın oturma tahtaları kırılmış, oturulamıyor."),
    ("Fikirtepe'de devrilmiş çöp konteyneri", "cop_kutusu", 29.0410, 40.9930,
     "Konteyner devrilmiş, çöpler kaldırıma yayılmış durumda."),
    ("Levent'te dönmüş yön levhası", "trafik_levhasi", 29.0140, 41.0790,
     "Levha rüzgârdan dönmüş, yanlış yönü gösteriyor."),
    ("Zeytinburnu'nda çökük kaldırım", "kaldirim", 28.9060, 40.9930,
     "Kaldırım taşları çökmüş, yaşlılar ve bebek arabaları geçemiyor."),
    ("Kartal'da kapağı açık elektrik panosu", "elektrik_panosu", 29.1830, 40.8960,
     "Pano kapağı açık, içindeki kablolar görünüyor. Çocuk parkının yanında."),
    ("Ataşehir'de kırık oyun grubu", "oyun_grubu", 29.1270, 40.9930,
     "Kaydırağın merdiveni kopmuş, çocuklar düşüyor."),
    ("Eyüpsultan'da su sızıntısı", "su_hatti", 28.9340, 41.0480,
     "Kaldırımın altından sürekli su sızıyor, yol sürekli ıslak ve kaygan."),
    ("Şirinevler'de kaldırıma bırakılmış moloz", "diger", 28.8460, 40.9930,
     "Kaldırımın tamamını kapatan bir inşaat molozu yığını var, yürünemiyor."),
]

# --- Sekilli talepler: (ad, tip, geojson, aciklama) --------------------------
#
# Vatandas yalnizca nokta isaretlemek zorunda degil: bir yol catlagi CIZGI, bir
# cukur alani POLIGON olarak bildirilir. Ikisi de burada var ki harita
# katmani ve temsil noktasi hesabi (pin nereye duser) elle gorulebilsin.
SEKILLI_TALEPLER = [
    (
        "Barbaros Bulvarı'nda uzun asfalt çatlağı",
        "yol",
        '{"type":"LineString","coordinates":'
        '[[29.0043,41.0468],[29.0051,41.0452],[29.0058,41.0436],[29.0064,41.0421]]}',
        "Bulvar boyunca yaklaşık 400 metrelik bir çatlak var, her yağmurda "
        "büyüyor. Tek bir noktayı işaretlemek yetmiyor, hattın tamamı bozuk.",
    ),
    (
        "Fenerbahçe Parkı'nda kuruyan çim alanı",
        "sulama",
        '{"type":"Polygon","coordinates":[[[29.0432,40.9712],[29.0468,40.9714],'
        '[29.0471,40.9694],[29.0436,40.9691],[29.0432,40.9712]]]}',
        "Parkın bu bölümündeki çim tamamen sarardı, sulama fıskiyeleri "
        "çalışmıyor gibi görünüyor.",
    ),
]

# --- Kaydedilmis bolgeler/guzergahlar ---------------------------------------
#
# (ad, aciklama, tip, renk, departman, geojson, atanan_ekip_emaili)
#
# Bolgeler MUDURLUGE aittir: bir mudurlugun cizdigi calisma alanini digeri
# gormez ve kendi ekibine atayamaz. Ornekler bilincli olarak dort ayri
# mudurluge dagitildi + biri GENEL (departman NULL) birakildi, ki "yalnizca
# kendi mudurlugunu goren personel" ile "hepsini goren admin" farki demo
# ortaminda elle gorulebilsin. Atanan ekipler de kendi mudurluklerinden.
BOLGELER = [
    (
        "Kadıköy Sahil Parkı Bakım Bölgesi",
        "Haftalık budama ve çim bakımı yapılacak alan.",
        "alan",
        "#059669",
        "park_bahceler",
        '{"type":"Polygon","coordinates":[[[29.0230,40.9865],[29.0320,40.9872],'
        '[29.0332,40.9832],[29.0242,40.9825],[29.0230,40.9865]]]}',
        "sahaekibi1@greenasset.com",
    ),
    (
        "Barbaros Bulvarı Asfalt Güzergâhı",
        "Çatlak taraması yapılacak hat.",
        "cizgi",
        "#f97316",
        "fen_isleri",
        '{"type":"LineString","coordinates":[[29.0043,41.0468],[29.0051,41.0452],'
        '[29.0058,41.0436],[29.0064,41.0421],[29.0071,41.0405]]}',
        "sahaekibi3@greenasset.com",
    ),
    (
        "Şişli Aydınlatma Denetim Güzergâhı",
        "Gece turunda yanmayan direklerin tespiti.",
        "cizgi",
        "#4338ca",
        "aydinlatma_enerji",
        '{"type":"LineString","coordinates":[[28.9855,41.0585],[28.9878,41.0608],'
        '[28.9901,41.0631],[28.9925,41.0650]]}',
        "sahaekibi5@greenasset.com",
    ),
    (
        "Fatih Su Hattı Kontrol Bölgesi",
        "Basınç düşüşü bildirilen mahalle; vana kontrolü.",
        "alan",
        "#0891b2",
        "su_kanalizasyon",
        '{"type":"Polygon","coordinates":[[[28.9450,41.0140],[28.9540,41.0155],'
        '[28.9555,41.0110],[28.9465,41.0095],[28.9450,41.0140]]]}',
        "sahaekibi7@greenasset.com",
    ),
    (
        "Kent Merkezi Koordinasyon Alanı",
        "Müdürlükler arası ortak çalışma alanı — tüm personel görür.",
        "alan",
        "#7c3aed",
        None,
        '{"type":"Polygon","coordinates":[[[28.9650,41.0080],[28.9820,41.0120],'
        '[28.9850,41.0000],[28.9680,40.9960],[28.9650,41.0080]]]}',
        None,
    ),
]

# --- Baslangic atamalari: (varlik_adi, ekip_emaili) --------------------------
# Ekipler islerin DEPARTMANINA gore secildi: otomatik atama da bunu yapardi.
ATAMALAR = [
    # direk -> aydinlatma_enerji, Anadolu yakasi
    ("Kadıköy Moda Aydınlatma D-7", "sahaekibi6@greenasset.com"),
    # agac -> park_bahceler, Avrupa yakasi
    ("Beşiktaş Meydan Çınarı", "sahaekibi2@greenasset.com"),
]

TUM_VARLIK_ADLARI = [a[0] for a in BAKIM_VARLIKLARI] + [a[0] for a in IYI_VARLIKLAR]
TUM_TALEP_ADLARI = [r[0] for r in TALEPLER] + [r[0] for r in SEKILLI_TALEPLER]
TUM_EMAILLER = [k[0] for k in KULLANICILAR]


def _keycloak_hesabi(email: str, ad: str, rol: str, parola: str) -> uuid.UUID:
    """Demo hesabini Keycloak'ta acar (varsa rolunu dogrular) ve id'sini doner.
    Parolalar Keycloak'ta tutuldugu icin seed'in oraya yazmasi zorunlu."""
    return uuid.UUID(
        keycloak.kullanici_olustur(email=email, parola=parola, full_name=ad, rol=rol)
    )


def sil(db) -> None:
    """Demo veriyi kaldirir. Silme sirasi FK bagimliliklarina gore onemlidir."""
    # Onaydan dogan varlik adini TALEPTEN alir, yani TUM_VARLIK_ADLARI'nda
    # gecmez; ustelik reports.created_asset_id ON DELETE SET NULL oldugu icin
    # talep silinince varlik pesinden gitmez. Bag kopmadan once silinmezse
    # panelde gorunen ama haritada pini olmayan oksuz varliklar kalir.
    # Demo hesabin kendi actigi talepler de dahil: users silinince reporter_id
    # CASCADE ile o satirlari da goturur.
    db.execute(
        sa.text(
            "DELETE FROM assets WHERE id IN ("
            "  SELECT created_asset_id FROM reports"
            "  WHERE created_asset_id IS NOT NULL"
            "    AND (name = ANY(:talep_adlari) OR reporter_id IN"
            "         (SELECT id FROM users WHERE email = ANY(:mailler)))"
            ")"
        ),
        {"talep_adlari": TUM_TALEP_ADLARI, "mailler": TUM_EMAILLER},
    )
    db.execute(
        sa.text("DELETE FROM reports WHERE name = ANY(:adlar)"),
        {"adlar": TUM_TALEP_ADLARI},
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
    # Bolgelerin bir kismi tohumlanir, bir kismi elle cizilir; ada gore
    # secmek yerine TAMAMI silinir. Demo ortamini gercekten bosaltmanin tek
    # yolu bu: aksi halde silinen ekiplerden arta kalan (worker_id NULL'a
    # dusmus) elle cizilmis bolgeler haritada oylece kalirdi.
    bolge = db.execute(sa.text("DELETE FROM gorev_bolgeleri")).rowcount
    db.commit()
    print(f"Demo veri silindi (kaydedilmis alan/guzergah: {bolge}).")


def ekle(db) -> None:
    """Demo veriyi ekler. Her kayit NOT EXISTS ile korunur; script tekrar tekrar
    calistirilabilir, kopya olusmaz."""
    for email, ad, rol, parola, lon, lat, departman in KULLANICILAR:
        # Konumlu ve konumsuz hesaplar icin ayri INSERT: tek sorguda CASE ile
        # NULL konum uretmek ayni parametreyi hem IS NULL kontrolunde hem
        # ST_MakePoint'te kullanir ve Postgres tipini cikaramaz.
        keycloak_id = _keycloak_hesabi(email, ad, rol, parola)
        if lon is None:
            sorgu = sa.text(
                """
                INSERT INTO users (email, keycloak_id, full_name, role, departman)
                SELECT :email, :kid, :ad, CAST(:rol AS user_role), :departman
                WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = :email)
                """
            )
        else:
            sorgu = sa.text(
                """
                INSERT INTO users (email, keycloak_id, full_name, role, departman,
                                   last_location, last_seen_at)
                SELECT :email, :kid, :ad, CAST(:rol AS user_role), :departman,
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
                sa.bindparam("kid", keycloak_id, type_=sa.Uuid),
                sa.bindparam("ad", ad, type_=sa.String),
                sa.bindparam("rol", rol, type_=sa.String),
                sa.bindparam("departman", departman, type_=sa.String),
            )
        )
        # Hesap zaten varsa baglantiyi yine tazele: veritabani silinmeden
        # Keycloak sifirlandiysa id degismis olabilir.
        # Departman da tazelenir: sozluk degistiginde mevcut demo hesaplarin
        # eski mudurlukte kalmamasi icin.
        db.execute(
            sa.text(
                "UPDATE users SET keycloak_id = :kid, departman = :departman"
                " WHERE email = :email"
            ).bindparams(
                sa.bindparam("kid", keycloak_id, type_=sa.Uuid),
                sa.bindparam("departman", departman, type_=sa.String),
                sa.bindparam("email", email, type_=sa.String),
            )
        )

    for ad, tip, lon, lat in BAKIM_VARLIKLARI:
        db.execute(
            sa.text(
                """
                INSERT INTO assets (name, type, status, source, geometry)
                SELECT :ad, :tip, 'bakim_lazim', 'kayitli',
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
                SELECT :ad, :tip, 'iyi', 'kayitli',
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

    for ad, tip, lon, lat, note in TALEPLER:
        db.execute(
            sa.text(
                """
                INSERT INTO reports (reporter_id, name, type, note, geometry, nokta)
                SELECT (SELECT id FROM users WHERE email = 'vatandas1@greenasset.com'),
                       :ad, :tip, :note,
                       ST_SetSRID(ST_MakePoint(:lon, :lat), 4326),
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

    # Cizgi/alan talepleri. Temsil noktasi PostGIS tarafinda turetilir
    # (crud/report.py::temsil_nokta ile ayni kural): cizgide hattin ortasi,
    # alanda seklin ICINE dusen bir nokta.
    for ad, tip, geojson, note in SEKILLI_TALEPLER:
        db.execute(
            sa.text(
                """
                INSERT INTO reports (reporter_id, name, type, note, geometry, nokta)
                SELECT (SELECT id FROM users WHERE email = 'vatandas1@greenasset.com'),
                       :ad, :tip, :note,
                       ST_SetSRID(ST_GeomFromGeoJSON(:geojson), 4326),
                       CASE ST_GeometryType(ST_GeomFromGeoJSON(:geojson))
                           WHEN 'ST_LineString' THEN ST_LineInterpolatePoint(
                               ST_SetSRID(ST_GeomFromGeoJSON(:geojson), 4326), 0.5)
                           ELSE ST_PointOnSurface(
                               ST_SetSRID(ST_GeomFromGeoJSON(:geojson), 4326))
                       END
                WHERE NOT EXISTS (SELECT 1 FROM reports WHERE name = :ad)
                  AND EXISTS (SELECT 1 FROM users
                              WHERE email = 'vatandas1@greenasset.com')
                """
            ).bindparams(
                sa.bindparam("ad", ad, type_=sa.String),
                sa.bindparam("tip", tip, type_=sa.String),
                sa.bindparam("note", note, type_=sa.String),
                sa.bindparam("geojson", geojson, type_=sa.String),
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

    # Kaydedilmis bolgeler/guzergahlar. Alanlar MULTIPOLYGON'a cevrilir
    # (sutun tek tipte iki geometri tutuyor, bkz. models/bolge.py); cizgiler
    # oldugu gibi yazilir.
    for ad, aciklama, tip, renk, departman, geojson, ekip in BOLGELER:
        db.execute(
            sa.text(
                """
                INSERT INTO gorev_bolgeleri
                       (ad, aciklama, tip, renk, departman, geom,
                        worker_id, assigned_at)
                SELECT :ad, :aciklama, CAST(:tip AS bolge_tipi), :renk,
                       :departman,
                       CASE WHEN :tip = 'alan'
                            THEN ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(:geojson), 4326))
                            ELSE ST_SetSRID(ST_GeomFromGeoJSON(:geojson), 4326)
                       END,
                       u.id,
                       CASE WHEN u.id IS NULL THEN NULL ELSE now() END
                  FROM (SELECT 1) AS d
                  -- LEFT JOIN: atanmamis bolge (ekip = NULL) de yazilabilsin.
                  LEFT JOIN users u ON u.email = :ekip
                 WHERE NOT EXISTS (
                     SELECT 1 FROM gorev_bolgeleri WHERE ad = :ad
                 )
                """
            ).bindparams(
                sa.bindparam("ad", ad, type_=sa.String),
                sa.bindparam("aciklama", aciklama, type_=sa.String),
                sa.bindparam("tip", tip, type_=sa.String),
                sa.bindparam("renk", renk, type_=sa.String),
                sa.bindparam("departman", departman, type_=sa.String),
                sa.bindparam("geojson", geojson, type_=sa.String),
                sa.bindparam("ekip", ekip, type_=sa.String),
            )
        )

    # Ekiplerin kadro yakasini son konumlarindan ata.
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
    talep = say("SELECT count(*) FROM reports")
    gorev = say("SELECT count(*) FROM assignments WHERE status = 'atandi'")
    bolge = say("SELECT count(*) FROM gorev_bolgeleri")
    print(
        f"Demo veri hazır: {kullanici} kullanıcı, {varlik} varlık ({iyi} iyi / "
        f"{varlik - iyi} bakım bekliyor), {talep} talep, {gorev} aktif görev, "
        f"{bolge} bölge/güzergâh."
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
