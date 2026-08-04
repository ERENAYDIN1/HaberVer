"""Gorev atama mantigi: en yakin uygun ekibi bulma, atama, tamamlama ve
ekip/kuyruk ozetleri. "Ekip" = bir saha_calisani hesabi.

Yalnizca modelleri import eder (asset/report crud'unu degil): report ve asset
modulleri buradan cagirdigi icin aksi halde dongusel import olusur."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models.asset import Asset, AssetStatus
from ..models.assignment import Assignment, AssignmentStatus
from ..models.log import LogAction
from ..models.user import User, UserRole
from . import yaka as yaka_crud
from .log import add_log

# Bir ekibe ayni anda dusebilecek en fazla aktif gorev.
MAKS_AKTIF_GOREV = 3

# Otomatik atamada izin verilen azami mesafe (metre). Bundan uzaktaki bos bir
# ekip bile olsa varlik atanmaz, havuzda bekler. Elle atamada uygulanmaz.
MAKS_ATAMA_MESAFE_M = 5000

# Ekip basina dondurulen "son tamamlanan is" sayisi; haritadaki ekip popup'i
# dar oldugu icin kisa tutulur.
SON_TAMAMLANAN_SAYISI = 3


def aktif_gorev_sayisi(db: Session, worker_id: uuid.UUID) -> int:
    return (
        db.execute(
            select(func.count())
            .select_from(Assignment)
            .where(
                Assignment.worker_id == worker_id,
                Assignment.status == AssignmentStatus.atandi,
            )
        ).scalar_one()
    )


def _aktif_sayi_subq():
    """Her User icin aktif gorev sayisini veren korelasyonlu alt sorgu."""
    return (
        select(func.count())
        .select_from(Assignment)
        .where(
            Assignment.worker_id == User.id,
            Assignment.status == AssignmentStatus.atandi,
        )
        .correlate(User)
        .scalar_subquery()
    )


def en_yakin_uygun_ekip(db: Session, asset_geom) -> User | None:
    """Varliga en yakin uygun ekibi dondurur: konumu bilinen, aktif, kapasitesi
    olan, varlikla ayni yakada ve en fazla MAKS_ATAMA_MESAFE_M mesafedeki saha
    calisanlari arasindan. Uygun ekip yoksa None doner ve varlik havuzda bekler.

    Yaka kisiti mesafe esiginin yerine degil ustune gelir: Bogaz'in iki yakasi
    kus ucusu yakin gorunse de arac ancak kopruden gecer."""
    asset_yaka = yaka_crud.yaka_bul(db, asset_geom)
    cnt = _aktif_sayi_subq().label("cnt")
    mesafe = func.ST_DistanceSphere(User.last_location, asset_geom)
    kosullar = [
        User.role == UserRole.saha_calisani,
        User.is_active.is_(True),
        User.last_location.isnot(None),
        mesafe <= MAKS_ATAMA_MESAFE_M,
    ]
    # asset_yaka None ise (yakalar tablosu bos) kisit uygulanmaz; sessizce
    # hicbir sey atanmamasindansa mesafe kuralina duselim.
    if asset_yaka is not None:
        kosullar.append(yaka_crud.ekip_yakasi_ifadesi() == asset_yaka)
    rows = db.execute(select(User, cnt).where(*kosullar).order_by(mesafe.asc())).all()
    for user, aktif in rows:
        if aktif < MAKS_AKTIF_GOREV:
            return user
    return None


def bekleyen_gorevleri_dagit(db: Session) -> int:
    """Havuzda bekleyen varliklari (bakim_lazim + aktif gorevi olmayan) FIFO
    sirayla en yakin uygun ekiplere dagitir. Bir gorev tamamlaninca ya da bir
    ekip menzile girecek sekilde konum bildirince cagrilir. Atanan gorev
    sayisini dondurur; commit cagirmaz."""
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
    if not bekleyenler:
        return 0

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
        ekip = en_yakin_uygun_ekip(db, asset.geometry)
        if ekip is not None:
            ata(db, asset, ekip, assigned_by=None)
            dagitilan += 1
    return dagitilan


def ata(
    db: Session,
    asset: Asset,
    worker: User,
    assigned_by: User | None = None,
) -> Assignment:
    """Varligi bir ekibe atar; varlikta aktif gorev varsa onu iptal edip yenisini
    acar. Kapasite doluysa ValueError firlatir; commit cagirmaz."""
    # Ekip satiri kilitlenir: "say, sonra ekle" arasinda araya giren baska bir
    # atama ekibi kotanin uzerine cikarabiliyordu. Kismi tekil indeks yalnizca
    # "bir varlik = tek aktif gorev"i korur, ekip kotasi burada uygulanir.
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
    """Bir ekibin aktif gorevlerini (varlik + koordinat) dondurur."""
    stmt = (
        select(
            Assignment,
            Asset,
            func.ST_X(Asset.geometry).label("longitude"),
            func.ST_Y(Asset.geometry).label("latitude"),
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


def aktif_atamalar(db: Session):
    """Tum aktif ('atandi') gorevleri worker_id + varlik + koordinatla dondurur
    (personel yonetim panosunda ekip bazinda gruplanir). En eski once."""
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
    return db.execute(stmt).all()


def havuz_varliklari(db: Session):
    """Havuzda bekleyen (bakim_lazim + aktif gorevi olmayan) varliklari koordinatla
    dondurur (personel elle atayabilsin diye). En eski once."""
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
    return db.execute(stmt).all()


def ekipler_ozeti(db: Session):
    """Tum saha calisanlarini konum + son gorulme + aktif yuk ile dondurur."""
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
        )
        .where(User.role == UserRole.saha_calisani, User.is_active.is_(True))
        .order_by(User.full_name)
    )
    return db.execute(stmt).all()
