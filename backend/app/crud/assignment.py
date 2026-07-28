"""Gorev (assignment) atama mantigi: en yakin uygun ekibi bulma, atama/yeniden
atama, gorev tamamlama ve ekip/kuyruk ozetleri. 'Ekip' = saha_calisani hesabi.

Bu modul yalnizca modelleri import eder (asset/report crud'unu DEGIL); boylece
report.approve_report ve asset.update_asset buradan cagirdiginda dongusel import
olusmaz."""

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

# Bir saha ekibine ayni anda dusebilecek en fazla aktif gorev sayisi.
MAKS_AKTIF_GOREV = 3

# Otomatik atamada bir bakim varligini bir ekibe baglamak icin izin verilen azami
# mesafe (metre, ~5 km). Bundan uzaktaki tek uygun (bos) ekip bile olsa varlik
# atanmaz; havuzda bekler ve menzildeki bir ekibin kapasitesi acildiginda ona
# yonlendirilir. Elle atamada (personel) bu sinir uygulanmaz - personel yetkisi
# istedigi ekibe (menzil disi olsa da) atayabilir.
MAKS_ATAMA_MESAFE_M = 5000


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
    """Konumu bilinen, aktif, kapasitesi (aktif gorev < MAKS) olan, varlikla AYNI
    YAKADA bulunan ve varliga en fazla MAKS_ATAMA_MESAFE_M mesafede olan saha
    calisanlari arasindan en yakin olani dondurur. Uygun ekip yoksa None (varlik
    atanmadan havuzda bekler; personel elle yonlendirebilir ya da bir ekip menzile
    girip/kapasite acilinca otomatik yonlendirilir).

    Yaka kisiti mesafe esiginin yerine degil, USTUNE gelir: Bogaz'in iki yakasi
    kus ucusu 2 km olabilir ama arac ile ancak koprüden (~25 km) gecilir, yani
    hicbir mesafe esigi tek basina 'karsiya gecme' kuralini kuramaz."""
    asset_yaka = yaka_crud.yaka_bul(db, asset_geom)
    cnt = _aktif_sayi_subq().label("cnt")
    mesafe = func.ST_DistanceSphere(User.last_location, asset_geom)
    kosullar = [
        User.role == UserRole.saha_calisani,
        User.is_active.is_(True),
        User.last_location.isnot(None),
        mesafe <= MAKS_ATAMA_MESAFE_M,
    ]
    # asset_yaka None ise (yakalar tablosu bos) kisit uygulanmaz - sistem eski
    # davranisina duser, sessizce hicbir sey atanmamasindansa.
    if asset_yaka is not None:
        kosullar.append(yaka_crud.ekip_yakasi_ifadesi() == asset_yaka)
    rows = db.execute(select(User, cnt).where(*kosullar).order_by(mesafe.asc())).all()
    for user, aktif in rows:
        if aktif < MAKS_AKTIF_GOREV:
            return user
    return None


def bekleyen_gorevleri_dagit(db: Session) -> int:
    """Havuzda bekleyen (durumu 'bakim_lazim' ve aktif gorevi olmayan) varliklari,
    en eski once (FIFO) olacak sekilde, mesafe sinirini saglayan en yakin uygun
    ekiplere otomatik dagitir. Bir ekibin kapasitesi acildiginda (gorev
    tamamlaninca) veya bir ekip menzile girecek sekilde konumunu guncelledginde
    cagirilir. Atanan gorev sayisini dondurur. commit CAGIRMAZ - cagiran commit
    eder."""
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
            # Havuza giris (bakima dusme/olusma) sirasina gore FIFO: updated_at
            # varlik bakim_lazim'a cekildiginde tazelenir, en uzun bekleyen once.
            .order_by(Asset.updated_at.asc())
        )
        .scalars()
        .all()
    )
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
    """Varligi bir ekibe atar. Varlikta zaten aktif gorev varsa onu 'iptal' edip
    yenisini acar (yeniden yonlendirme). commit CAGIRMAZ - cagiran taraf commit
    eder. Kapasite doluysa ValueError firlatir."""
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
    """Varligin aktif gorevini 'tamamlandi' yapar (varlik 'iyi'ye cekilince
    cagirilir). Aktif gorev yoksa sessizce gecer. commit cagirmaz."""
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
    # Bu ekibin kapasitesi acildi: havuzda bekleyen varliklari yeniden dagit.
    bekleyen_gorevleri_dagit(db)


def geri_al(db: Session, asset_id: uuid.UUID, actor: User | None = None) -> bool:
    """Varligin aktif gorevini 'iptal' edip varligi havuza dondurur (personel
    elle atamayi geri alir). Aktif gorev yoksa False. Otomatik yeniden dagitim
    TETIKLEMEZ - amac bilincli olarak varligi havuzda beklemeye almaktir; kontenjan
    acildiginda / personel elle atadiginda tekrar yonlendirilir. commit cagirmaz."""
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
    """Bir ekibin GERI ALINABILIR tamamlanmis gorevlerini dondurur: yalnizca hala
    'iyi' (tamir edilmis) durumdaki varliklar ve VARLIK BASINA yalnizca en son
    tamamlanan gorev. Boylece ayni varlik icin birden fazla tamamlanmis kayit
    listeye dusup, ikisini birden geri alinca aktif gorev tekil kisitini (bir
    varlik = tek aktif gorev) ihlal etmez. En son tamamlanan once."""
    # Once varlik basina en son tamamlanan gorevi sec (DISTINCT ON asset_id).
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


def tamamlanani_geri_al(
    db: Session, assignment_id: uuid.UUID, worker_id: uuid.UUID
) -> Asset | None:
    """Ekibin yanlislikla tamamladigi bir gorevi geri alir: gorevi tekrar 'atandi'
    yapar ve varligi 'bakim_lazim'a dondurur. Bu ekibin kapasitesi dolmus olsa bile
    (arada havuzdan yeni is dusmus olabilir) izin verilir - nadir bir durum oldugu
    icin ekip gecici olarak MAKS_AKTIF_GOREV'i asabilir. commit cagirmaz.

    Gorev bu ekibe ait ve 'tamamlandi' degilse None doner."""
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

    # Varlik bu arada yeniden bakima dusup baska bir goreve atanmis olabilir; o
    # zaman geri alma "bir varlik = tek aktif gorev" tekil kisitini ihlal eder.
    # Boyle bir durumda 500 yerine temiz bir "bulunamadi/cakisti" (None) donduru.
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
        # En uzun bekleyen once (updated_at = bakima dusme/olusma zamani).
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
