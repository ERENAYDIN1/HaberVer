"""Gorev atama mantigi: en yakin uygun ekibi bulma, atama, tamamlama ve
ekip/kuyruk ozetleri. "Ekip" = bir saha_calisani hesabi.

Yalnizca modelleri import eder (asset/talep crud'unu degil): talep ve asset
modulleri buradan cagirdigi icin aksi halde dongusel import olusur."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import String, func, or_, select
from sqlalchemy.orm import Session

from ..models.asset import Asset, AssetStatus
from ..models.assignment import Assignment, AssignmentStatus
from ..models.bolge import Bolge
from ..models.guzergah import Guzergah
from ..models.log import LogAction
from ..models.talep import Talep
from ..models.user import User, UserRole
from . import departman as departman_crud
from . import yaka as yaka_crud
from .log import add_log

# Bir ekibe ayni anda dusebilecek en fazla aktif gorev.
#
# "Gorev" TEK BIR KAVRAMDIR: tekil bakim isi (assignments), gorev bolgesi
# (bolgeler) ve guzergah (guzergahlar) ayni kotayi paylasir. Ekibin gunu
# tektir; bir alan taramasi bir bank tamirinden daha az is degildir, ayri
# kovalarda sayilmasi ekibin gercek yukunu gizliyordu. Uc tablo ayri oldugu
# icin toplam burada, uygulama katmaninda kurulur.
MAKS_AKTIF_GOREV = 3

# Otomatik atamada mesafe kademeleri (metre). Once 5 km icindeki uygun ekiplere
# bakilir; o halkada kimse yoksa 10 km'ye genisletilir. En genis kademede de
# uygun ekip yoksa varlik atanmaz, havuzda bekler. Elle atamada uygulanmaz.
#
# Kademeler ayni sirada denenir ve her kademe kendi icinde EN YAKIN ekibi secer,
# yani 3 km'deki bir ekip hicbir zaman 8 km'dekine yenilmez. Kademeleri ayri
# yazmanin degeri kuralin okunur ve ayarlanabilir kalmasi: "yakindaki bos ekip
# varken uzagi hic dusunme" cumlesi kodda birebir duruyor.
ATAMA_MESAFE_KADEMELERI_M = (5000, 10000)

# Geriye donuk ad: en genis kademe. Ekipler/havuz metinleri ve testler "otomatik
# atamanin en uzak menzili" olarak bunu okur.
MAKS_ATAMA_MESAFE_M = ATAMA_MESAFE_KADEMELERI_M[-1]

# Ekip basina dondurulen "son tamamlanan is" sayisi; haritadaki ekip popup'i
# dar oldugu icin kisa tutulur.
SON_TAMAMLANAN_SAYISI = 3


def aktif_gorev_sayisi(db: Session, worker_id: uuid.UUID) -> int:
    """Ekibin uzerindeki toplam aktif is: tekil bakim gorevleri + kendisine
    atanmis, henuz tamamlanmamis bolgeler ve guzergahlar. Kota tek sayidir."""
    tekil = db.execute(
        select(func.count())
        .select_from(Assignment)
        .where(
            Assignment.worker_id == worker_id,
            Assignment.status == AssignmentStatus.atandi,
        )
    ).scalar_one()
    alanlar = db.execute(
        select(func.count())
        .select_from(Bolge)
        .where(Bolge.worker_id == worker_id, Bolge.tamamlandi_at.is_(None))
    ).scalar_one()
    cizgiler = db.execute(
        select(func.count())
        .select_from(Guzergah)
        .where(Guzergah.worker_id == worker_id, Guzergah.tamamlandi_at.is_(None))
    ).scalar_one()
    return tekil + alanlar + cizgiler


def _aktif_kayit_sayisi_subq(model):
    """Her User icin aktif (tamamlanmamis) bolge ya da guzergah sayisi. Iki
    tablonun sutunlari ayni oldugu icin tek ifade ikisine de uyar."""
    return (
        select(func.count())
        .select_from(model)
        .where(model.worker_id == User.id, model.tamamlandi_at.is_(None))
        .correlate(User)
        .scalar_subquery()
    )


def _aktif_sayi_subq():
    """Her User icin TOPLAM aktif gorev sayisini veren korelasyonlu alt sorgu:
    tekil bakim gorevleri + atanmis bolgeler + atanmis guzergahlar (bkz.
    MAKS_AKTIF_GOREV)."""
    tekil = (
        select(func.count())
        .select_from(Assignment)
        .where(
            Assignment.worker_id == User.id,
            Assignment.status == AssignmentStatus.atandi,
        )
        .correlate(User)
        .scalar_subquery()
    )
    return (
        tekil
        + _aktif_kayit_sayisi_subq(Bolge)
        + _aktif_kayit_sayisi_subq(Guzergah)
    )


def _talep_alani_subq(ifade):
    """Varligin dogdugu TALEP kaydindan bir alan (kayitli varliklarda NULL).

    Varliga tasinmayan sey vatandasin ACIKLAMASIDIR: `assets`te not sutunu
    yoktur, ama sahaya giden ekip "hangi bank kirik"i okuyabilmeli.

    JOIN degil korelasyonlu alt sorgu: satir sayisini degistiremez, dolayisiyla
    ayni varliga bagli birden fazla talep kaydi cikarsa gorev listesi
    coklanmaz."""
    return (
        select(ifade)
        .where(Talep.created_asset_id == Asset.id)
        .correlate(Asset)
        .limit(1)
        .scalar_subquery()
    )


def _talep_sutunlari():
    """Gorev satirlarina eklenen talep alanlari (sema ile ayni sirada)."""
    return (
        _talep_alani_subq(Talep.note).label("talep_notu"),
        _talep_alani_subq(Talep.created_at).label("talep_tarihi"),
    )


def en_yakin_uygun_ekip(
    db: Session, asset_geom, asset_type=None, departman: str | None = None
) -> User | None:
    """Varliga en yakin uygun ekibi dondurur: konumu bilinen, aktif, kapasitesi
    olan, varlikla ayni yakada, ISIN DEPARTMANINDA ve
    ATAMA_MESAFE_KADEMELERI_M kademelerinden birine giren saha calisanlari
    arasindan. Once dar kademe (5 km) denenir, orada uygun ekip yoksa genis
    kademeye (10 km) inilir. Hicbir kademede uygun ekip yoksa None doner ve
    varlik havuzda bekler.

    KONUMU BILINMEYEN ekip hicbir kademede degerlendirilmez: "Gaziosmanpasa
    ekibi" bilgisi tek basina o ekibin Eyup'e mi Sultangazi'ye mi yakin
    oldugunu soylemez, dolayisiyla mesafe kurali uygulanamaz.

    UC KISIT UST USTE BINER, biri digerinin yerine gecmez:
      * mesafe - is ne kadar uzakta,
      * yaka   - Bogaz'in iki yakasi kus ucusu yakin gorunse de arac ancak
                 kopruden gecer,
      * departman - agac isini elektrik ekibine gondermenin anlami yok; en
                 yakin ekip dogru ekip degildir.

    `asset_type` verilmezse departman kisiti uygulanmaz (cagiran taraf turu
    bilmiyorsa mesafe+yaka kuralina duselim). `departman` dogrudan verilirse
    turden cozulmez: bir bolgenin/guzergahin turu yoktur, mudurlugu kaydin
    kendi sutunundadir (bkz. models/bolge.py)."""
    asset_yaka = yaka_crud.yaka_bul(db, asset_geom)
    if departman is not None:
        asset_departman = departman
    elif asset_type is not None:
        asset_departman = departman_crud.tur_departmani(db, asset_type)
    else:
        asset_departman = None
    cnt = _aktif_sayi_subq().label("cnt")
    mesafe = func.ST_DistanceSphere(User.last_location, asset_geom)
    kosullar = [
        User.role == UserRole.saha_calisani,
        User.is_active.is_(True),
        User.last_location.isnot(None),
        # En genis kademe: sorgu tek seferde cekilir, kademeler Python'da
        # ayrilir. Aksi halde her kademe icin ayri bir SQL turu olurdu.
        mesafe <= ATAMA_MESAFE_KADEMELERI_M[-1],
    ]
    # asset_yaka None ise (yakalar tablosu bos) kisit uygulanmaz; sessizce
    # hicbir sey atanmamasindansa mesafe kuralina duselim.
    if asset_yaka is not None:
        kosullar.append(yaka_crud.ekip_yakasi_ifadesi() == asset_yaka)
    # Ayni gerekce: tur_departman tablosu bossa kisit uygulanmaz. Departmani
    # olmayan bir ekip hicbir ise atanmaz - "departmansiz" sessizce "her ise
    # uygun" anlamina gelmemeli.
    if asset_departman is not None:
        kosullar.append(User.departman == asset_departman)
    rows = db.execute(
        select(User, cnt, mesafe.label("mesafe"))
        .where(*kosullar)
        .order_by(mesafe.asc())
    ).all()

    for kademe in ATAMA_MESAFE_KADEMELERI_M:
        for user, aktif, uzaklik in rows:
            if uzaklik is not None and uzaklik <= kademe and aktif < MAKS_AKTIF_GOREV:
                return user
    return None


def bolge_temsil_noktasi():
    """Bir bolge kaydinin mesafe ve yaka hesabinda kullanilacak TEK noktasi.
    Varliklarin `geometry`'si zaten POINT'tir; bolgeler icin ayni rolu bu ifade
    ustlenir (talep kayitlarindaki `nokta` sutunuyla ayni fikir):
    ST_PointOnSurface, cunku agirlik merkezi alanin disina dusebilir."""
    return func.ST_PointOnSurface(Bolge.geom)


def guzergah_temsil_noktasi():
    """Bir guzergahin temsil noktasi: hattin ortasi (bkz.
    bolge_temsil_noktasi)."""
    return func.ST_LineInterpolatePoint(Guzergah.geom, 0.5)


def _kayit_noktasi(db: Session, model, ifade, kayit):
    """Kaydin temsil noktasini geometri degeri olarak cozer (mesafe/yaka
    sorgularina parametre olarak girecegi icin ifade degil deger gerekir)."""
    return db.execute(select(ifade).where(model.id == kayit.id)).scalar_one()


def _otomatik_ata(db: Session, kayit, nokta, entity_type: str) -> User | None:
    """Bir bolge/guzergah kaydini en yakin uygun ekibe atar (varliklarla AYNI
    uc kisit: mesafe kademesi + yaka + mudurluk, arti ortak kapasite). Uygun
    ekip yoksa kayit atanmadan bekler. Atanan ekibi dondurur; commit
    cagirmaz."""
    if kayit.worker_id is not None or kayit.tamamlandi_at is not None:
        return None
    if nokta is None:
        return None
    ekip = en_yakin_uygun_ekip(db, nokta, departman=kayit.departman)
    if ekip is None:
        return None
    kayit.worker_id = ekip.id
    kayit.assigned_at = datetime.now(timezone.utc)
    kayit.assigned_by = None  # otomatik
    add_log(
        db,
        action=LogAction.bolge_assigned,
        actor=None,
        entity_type=entity_type,
        entity_id=kayit.id,
        entity_name=kayit.ad,
        detail=f"{ekip.full_name or ekip.email} ekibine atandı (otomatik)",
        departman=kayit.departman,
    )
    return ekip


def bolge_otomatik_ata(db: Session, bolge: Bolge) -> User | None:
    return _otomatik_ata(
        db,
        bolge,
        _kayit_noktasi(db, Bolge, bolge_temsil_noktasi(), bolge),
        "bolge",
    )


def guzergah_otomatik_ata(db: Session, guzergah: Guzergah) -> User | None:
    return _otomatik_ata(
        db,
        guzergah,
        _kayit_noktasi(db, Guzergah, guzergah_temsil_noktasi(), guzergah),
        "guzergah",
    )


def bekleyen_bolgeleri_dagit(db: Session) -> int:
    """Atanmamis, tamamlanmamis bolge ve guzergahlari FIFO sirayla en yakin
    uygun ekiplere dagitir. Varlik havuzuyla ayni tetikleyiciler: bir is bitip
    kapasite acildiginda ve bir ekip konum bildirdiginde. Commit cagirmaz.

    Iki tablo ayri FIFO kuyruklaridir ve once bolgeler denenir; aralarinda
    anlamli bir oncelik yok, ama sira sabit olmali ki ayni durumda ayni sonuc
    ciksin."""
    dagitilan = 0
    for model, otomatik_ata in (
        (Bolge, bolge_otomatik_ata),
        (Guzergah, guzergah_otomatik_ata),
    ):
        bekleyenler = (
            db.execute(
                select(model)
                .where(model.worker_id.is_(None), model.tamamlandi_at.is_(None))
                .order_by(model.created_at.asc())
            )
            .scalars()
            .all()
        )
        for kayit in bekleyenler:
            if otomatik_ata(db, kayit) is not None:
                dagitilan += 1
    return dagitilan


def bekleyen_gorevleri_dagit(db: Session) -> int:
    """Havuzda bekleyen varliklari (bakim_lazim + aktif gorevi olmayan) FIFO
    sirayla en yakin uygun ekiplere dagitir. Bir gorev tamamlaninca ya da bir
    ekip menzile girecek sekilde konum bildirince cagrilir. Atanan gorev
    sayisini dondurur; commit cagirmaz.

    Bolgeler ve guzergahlar da ayni kotayi paylastigi icin varliklar
    dagitildiktan sonra onlarin kuyruklari da dagitilir - kuyruklar tek
    kapasiteye bakarken birinin digerini gormemesi ekibi kotanin uzerine
    cikarirdi."""
    atanmis = select(Assignment.asset_id).where(
        Assignment.status == AssignmentStatus.atandi
    )
    bekleyenler = (
        db.execute(
            select(Asset)
            .where(
                Asset.status == AssetStatus.bakim_lazim,
                Asset.id.not_in(atanmis),
            )
            # FIFO: updated_at varlik bakima cekilince tazelenir.
            .order_by(Asset.updated_at.asc())
        )
        .scalars()
        .all()
    )

    # Kapasitesi olan ekip yoksa donguye hic girme: her varlik icin ayri ayri
    # en_yakin_uygun_ekip cagirmak bosa iki sorgu demek olurdu.
    musait_var = db.execute(
        select(User.id)
        .where(
            User.role == UserRole.saha_calisani,
            User.is_active.is_(True),
            User.last_location.isnot(None),
            _aktif_sayi_subq() < MAKS_AKTIF_GOREV,
        )
        .limit(1)
    ).first()
    if musait_var is None:
        return 0

    dagitilan = 0
    for asset in bekleyenler:
        ekip = en_yakin_uygun_ekip(db, asset.geometry, asset.type)
        if ekip is not None:
            ata(db, asset, ekip, assigned_by=None)
            dagitilan += 1
    # Varliklar yerlestikten sonra kalan kapasiteyle bolge/guzergahlar dagitilir.
    return dagitilan + bekleyen_bolgeleri_dagit(db)


def ata(
    db: Session,
    asset: Asset,
    worker: User,
    assigned_by: User | None = None,
    kota_zorla: bool = True,
) -> Assignment:
    """Varligi bir ekibe atar; varlikta aktif gorev varsa onu iptal edip yenisini
    acar. `kota_zorla` ile kapasite doluysa ValueError firlatir; commit cagirmaz.

    KOTA YALNIZCA OTOMATIK DAGITIMDA SERT KISITTIR (`kota_zorla=True`). Elle
    atamada yetki personeldedir ve arayuz yalnizca uyarir - yaka/mudurluk
    muafiyetiyle ayni desen, bolge/guzergah atamasiyla ayni davranis (bkz.
    crud/bolge.py::ata). En fazla ekip fazla yuklenir."""
    # Ekip satiri kilitlenir: "say, sonra ekle" arasinda araya giren baska bir
    # atama ekibi kotanin uzerine cikarabiliyordu. Kismi tekil indeks yalnizca
    # "bir varlik = tek aktif gorev"i korur, ekip kotasi burada uygulanir.
    if kota_zorla:
        db.execute(select(User.id).where(User.id == worker.id).with_for_update())
        if aktif_gorev_sayisi(db, worker.id) >= MAKS_AKTIF_GOREV:
            raise ValueError(
                f"{worker.full_name or worker.email} ekibinin kuyrugu dolu "
                f"(en fazla {MAKS_AKTIF_GOREV} gorev)"
            )

    mevcut = db.execute(
        select(Assignment).where(
            Assignment.asset_id == asset.id,
            Assignment.status == AssignmentStatus.atandi,
        )
    ).scalar_one_or_none()
    if mevcut is not None:
        if mevcut.worker_id == worker.id:
            return mevcut  # zaten bu ekibe atali
        mevcut.status = AssignmentStatus.iptal
        db.flush()  # yeni 'atandi' eklenmeden once tekil indeks serbest kalsin

    gorev = Assignment(
        asset_id=asset.id,
        worker_id=worker.id,
        assigned_by=assigned_by.id if assigned_by else None,
    )
    db.add(gorev)
    db.flush()

    add_log(
        db,
        action=LogAction.assignment_created,
        actor=assigned_by,
        entity_type="asset",
        entity_id=asset.id,
        entity_name=asset.name,
        detail=f"{worker.full_name or worker.email} ekibine atandı"
        + ("" if assigned_by else " (otomatik)"),
    )
    return gorev


def gorev_tamamla(db: Session, asset_id: uuid.UUID, actor: User | None = None) -> None:
    """Varligin aktif gorevini 'tamamlandi' yapar (varlik 'iyi'ye cekilince).
    Aktif gorev yoksa sessizce gecer; commit cagirmaz."""
    gorev = db.execute(
        select(Assignment).where(
            Assignment.asset_id == asset_id,
            Assignment.status == AssignmentStatus.atandi,
        )
    ).scalar_one_or_none()
    if gorev is None:
        return
    gorev.status = AssignmentStatus.tamamlandi
    gorev.completed_at = datetime.now(timezone.utc)
    asset = db.get(Asset, asset_id)
    add_log(
        db,
        action=LogAction.assignment_completed,
        actor=actor,
        entity_type="asset",
        entity_id=asset_id,
        entity_name=asset.name if asset else None,
        detail="Görev tamamlandı (tamir edildi)",
    )
    # Kapasite acildi: havuzdaki isleri yeniden dagit.
    bekleyen_gorevleri_dagit(db)


def geri_al(db: Session, asset_id: uuid.UUID, actor: User | None = None) -> bool:
    """Aktif gorevi iptal edip varligi havuza dondurur; aktif gorev yoksa False.
    Otomatik yeniden dagitim tetiklemez - amac varligi beklemeye almaktir."""
    gorev = db.execute(
        select(Assignment).where(
            Assignment.asset_id == asset_id,
            Assignment.status == AssignmentStatus.atandi,
        )
    ).scalar_one_or_none()
    if gorev is None:
        return False
    gorev.status = AssignmentStatus.iptal
    asset = db.get(Asset, asset_id)
    add_log(
        db,
        action=LogAction.assignment_cancelled,
        actor=actor,
        entity_type="asset",
        entity_id=asset_id,
        entity_name=asset.name if asset else None,
        detail="Görev geri alındı (havuza alındı)",
    )
    return True


def aktif_gorev_bilgisi(db: Session, asset_id: uuid.UUID) -> dict | None:
    """Bir varligin aktif gorevini (hangi ekip, ne zaman, otomatik mi elle mi)
    dondurur; aktif gorev yoksa None (varlik havuzda bekliyor)."""
    row = db.execute(
        select(Assignment, User)
        .join(User, User.id == Assignment.worker_id)
        .where(
            Assignment.asset_id == asset_id,
            Assignment.status == AssignmentStatus.atandi,
        )
    ).first()
    if row is None:
        return None
    gorev, worker = row
    return {
        "worker_id": worker.id,
        "worker_ad": worker.full_name or worker.email,
        "assigned_at": gorev.created_at,
        "otomatik": gorev.assigned_by is None,
    }


def gorevlerim(db: Session, worker_id: uuid.UUID):
    """Bir ekibin aktif gorevlerini (varlik + koordinat + talep ayrintilari)
    dondurur."""
    stmt = (
        select(
            Assignment,
            Asset,
            func.ST_X(Asset.geometry).label("longitude"),
            func.ST_Y(Asset.geometry).label("latitude"),
            *_talep_sutunlari(),
        )
        .join(Asset, Asset.id == Assignment.asset_id)
        .where(
            Assignment.worker_id == worker_id,
            Assignment.status == AssignmentStatus.atandi,
        )
        .order_by(Assignment.created_at.desc())
    )
    return db.execute(stmt).all()


def tamamlananlarim(db: Session, worker_id: uuid.UUID, limit: int = 30):
    """Ekibin geri alinabilir tamamlanmis gorevleri: yalnizca hala 'iyi'
    durumdaki varliklar ve varlik basina yalnizca en son tamamlanan gorev.
    Aksi halde ayni varligin iki kaydi birden geri alinip "bir varlik = tek
    aktif gorev" kisitini ihlal edebilirdi."""
    # Varlik basina en son tamamlanan gorev (DISTINCT ON asset_id).
    en_son = (
        select(Assignment.id.label("aid"))
        .join(Asset, Asset.id == Assignment.asset_id)
        .where(
            Assignment.worker_id == worker_id,
            Assignment.status == AssignmentStatus.tamamlandi,
            Asset.status == AssetStatus.iyi,
        )
        .distinct(Assignment.asset_id)
        .order_by(Assignment.asset_id, Assignment.completed_at.desc())
        .subquery()
    )
    stmt = (
        select(
            Assignment,
            Asset,
            func.ST_X(Asset.geometry).label("longitude"),
            func.ST_Y(Asset.geometry).label("latitude"),
            *_talep_sutunlari(),
        )
        .join(Asset, Asset.id == Assignment.asset_id)
        .where(Assignment.id.in_(select(en_son.c.aid)))
        .order_by(Assignment.completed_at.desc())
        .limit(limit)
    )
    return db.execute(stmt).all()


def son_tamamlananlar(db: Session, kisi_basi: int = SON_TAMAMLANAN_SAYISI):
    """Her ekibin en son tamamladigi `kisi_basi` gorev (ekip popup'indaki "Son
    Tamir Edilenler" listesi). Ekip basina ayri sorgu yerine tek sorguda
    pencere fonksiyonuyla kirpilir."""
    sira = (
        func.row_number()
        .over(
            partition_by=Assignment.worker_id,
            order_by=Assignment.completed_at.desc(),
        )
        .label("sira")
    )
    alt = (
        select(Assignment.id.label("aid"), sira)
        .where(Assignment.status == AssignmentStatus.tamamlandi)
        .subquery()
    )
    stmt = (
        select(Assignment, Asset)
        .join(Asset, Asset.id == Assignment.asset_id)
        .where(Assignment.id.in_(select(alt.c.aid).where(alt.c.sira <= kisi_basi)))
        .order_by(Assignment.completed_at.desc())
    )
    return db.execute(stmt).all()


def tamamlanani_geri_al(
    db: Session, assignment_id: uuid.UUID, worker_id: uuid.UUID
) -> Asset | None:
    """Yanlislikla tamamlanan gorevi geri alir: gorev tekrar 'atandi', varlik
    'bakim_lazim' olur. Nadir bir durum oldugu icin kapasite dolu olsa bile izin
    verilir. Gorev bu ekibe ait ve tamamlanmis degilse None doner."""
    gorev = db.get(Assignment, assignment_id)
    if (
        gorev is None
        or gorev.worker_id != worker_id
        or gorev.status != AssignmentStatus.tamamlandi
    ):
        return None
    asset = db.get(Asset, gorev.asset_id)
    if asset is None:
        return None

    # Varlik bu arada baska bir goreve atanmis olabilir; tekil kisiti ihlal edip
    # 500 vermek yerine None donulur.
    zaten_aktif = db.execute(
        select(Assignment.id).where(
            Assignment.asset_id == asset.id,
            Assignment.status == AssignmentStatus.atandi,
        )
    ).first()
    if zaten_aktif is not None:
        return None

    gorev.status = AssignmentStatus.atandi
    gorev.completed_at = None
    asset.status = AssetStatus.bakim_lazim
    asset.repaired_at = None
    add_log(
        db,
        action=LogAction.asset_status_changed,
        actor=None,
        entity_type="asset",
        entity_id=asset.id,
        entity_name=asset.name,
        detail="Tamamlanan iş geri alındı (yeniden bakım bekliyor)",
    )
    return asset


def aktif_atamalar(db: Session, kapsam_turleri=None):
    """Tum aktif ('atandi') gorevleri worker_id + varlik + koordinatla dondurur
    (personel yonetim panosunda ekip bazinda gruplanir). En eski once.

    `kapsam_turleri` verilirse yalnizca o departmanin turlerindeki isler doner."""
    stmt = (
        select(
            Assignment,
            Asset,
            func.ST_X(Asset.geometry).label("longitude"),
            func.ST_Y(Asset.geometry).label("latitude"),
            yaka_crud.nokta_yakasi_ifadesi(Asset.geometry).label("yaka"),
        )
        .join(Asset, Asset.id == Assignment.asset_id)
        .where(Assignment.status == AssignmentStatus.atandi)
        .order_by(Assignment.created_at.asc())
    )
    if kapsam_turleri is not None:
        stmt = stmt.where(Asset.type.in_(kapsam_turleri))
    return db.execute(stmt).all()


def _kayit_gorev_satirlari(db: Session, model, nokta, tip: str, kosullar, sira):
    """Bir bolge/guzergah kaydini pano satirina cevirir: kayit + temsil
    noktasinin koordinatlari + yakasi + hangi tablodan geldigi.

    `tip` satirin icinde tasinir cunku iki tablonun sonucu tek listede
    birlesiyor ve arayuz alani guzergahtan ayirt edebilmeli (rozet, renk)."""
    stmt = (
        select(
            model,
            func.ST_X(nokta).label("longitude"),
            func.ST_Y(nokta).label("latitude"),
            yaka_crud.nokta_yakasi_ifadesi(nokta).label("yaka"),
            func.cast(tip, String).label("tip"),
        )
        .where(*kosullar)
        .order_by(sira)
    )
    return db.execute(stmt).all()


def _kapsam_kosulu(model, departman: str | None):
    """Kaydin kendi `departman` sutununa dayali kapsam: o mudurlugun kayitlari
    + genel (NULL) kayitlar."""
    return or_(model.departman.is_(None), model.departman == departman)


def aktif_bolge_gorevleri(db: Session, departman: str | None = None):
    """Ekiplere atanmis, tamamlanmamis bolgeler ve guzergahlar tek listede
    (pano ve ekip popup'inda tekil gorevlerle birlikte listelenir). Kapsam
    kaydin KENDI departman sutunundan gecer - bir bolgenin turu yoktur.

    `departman` verilirse yalnizca o mudurlugun ve genel kayitlar doner."""
    satirlar = []
    for model, nokta, tip in (
        (Bolge, bolge_temsil_noktasi(), "alan"),
        (Guzergah, guzergah_temsil_noktasi(), "cizgi"),
    ):
        kosullar = [model.worker_id.isnot(None), model.tamamlandi_at.is_(None)]
        if departman is not None:
            kosullar.append(_kapsam_kosulu(model, departman))
        satirlar += _kayit_gorev_satirlari(
            db, model, nokta, tip, kosullar, model.assigned_at.asc()
        )
    return satirlar


def bekleyen_bolge_havuzu(db: Session, departman: str | None = None):
    """Atanmamis, tamamlanmamis bolgeler ve guzergahlar - varlik havuzunun
    bolge karsiligi. Personel panosunda "bekleyen isler" olarak gosterilir."""
    satirlar = []
    for model, nokta, tip in (
        (Bolge, bolge_temsil_noktasi(), "alan"),
        (Guzergah, guzergah_temsil_noktasi(), "cizgi"),
    ):
        kosullar = [model.worker_id.is_(None), model.tamamlandi_at.is_(None)]
        if departman is not None:
            kosullar.append(_kapsam_kosulu(model, departman))
        satirlar += _kayit_gorev_satirlari(
            db, model, nokta, tip, kosullar, model.created_at.asc()
        )
    return satirlar


def havuz_varliklari(db: Session, kapsam_turleri=None):
    """Havuzda bekleyen (bakim_lazim + aktif gorevi olmayan) varliklari koordinatla
    dondurur (personel elle atayabilsin diye). En eski once.

    `kapsam_turleri` verilirse yalnizca o departmanin isleri doner."""
    atanmis = select(Assignment.asset_id).where(
        Assignment.status == AssignmentStatus.atandi
    )
    stmt = (
        select(
            Asset,
            func.ST_X(Asset.geometry).label("longitude"),
            func.ST_Y(Asset.geometry).label("latitude"),
            yaka_crud.nokta_yakasi_ifadesi(Asset.geometry).label("yaka"),
        )
        .where(Asset.status == AssetStatus.bakim_lazim, Asset.id.not_in(atanmis))
        # En uzun bekleyen once (updated_at = bakima dusme zamani).
        .order_by(Asset.updated_at.asc())
    )
    if kapsam_turleri is not None:
        stmt = stmt.where(Asset.type.in_(kapsam_turleri))
    return db.execute(stmt).all()


def ekipler_ozeti(db: Session, departman: str | None = None):
    """Saha ekiplerini konum + son gorulme + aktif yuk ile dondurur.

    `departman` verilirse yalnizca o mudurlugun ekipleri doner: bir Park ve
    Bahceler calisaninin Fen Isleri ekiplerini gormesinin bir islevi yok, ona
    is de atayamaz."""
    cnt = _aktif_sayi_subq().label("aktif_gorev")
    stmt = (
        select(
            User.id,
            User.full_name,
            User.email,
            func.ST_X(User.last_location).label("longitude"),
            func.ST_Y(User.last_location).label("latitude"),
            User.last_seen_at,
            cnt,
            yaka_crud.ekip_yakasi_ifadesi().label("yaka"),
            User.departman,
        )
        .where(User.role == UserRole.saha_calisani, User.is_active.is_(True))
        .order_by(User.full_name)
    )
    if departman is not None:
        stmt = stmt.where(User.departman == departman)
    return db.execute(stmt).all()
