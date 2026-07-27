"""Gorev (assignment) atama mantigi: en yakin uygun ekibi bulma, atama/yeniden
atama, gorev tamamlama ve ekip/kuyruk ozetleri. 'Ekip' = saha_calisani hesabi.

Bu modul yalnizca modelleri import eder (asset/report crud'unu DEGIL); boylece
report.approve_report ve asset.update_asset buradan cagirdiginda dongusel import
olusmaz."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models.asset import Asset
from ..models.assignment import Assignment, AssignmentStatus
from ..models.log import LogAction
from ..models.user import User, UserRole
from .log import add_log

# Bir saha ekibine ayni anda dusebilecek en fazla aktif gorev sayisi.
MAKS_AKTIF_GOREV = 3


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
    """Konumu bilinen, aktif, kapasitesi (aktif gorev < MAKS) olan saha
    calisanlari arasindan varliga en yakin olani dondurur. Uygun ekip yoksa
    None (varlik atanmadan kalir; personel elle yonlendirebilir)."""
    cnt = _aktif_sayi_subq().label("cnt")
    rows = db.execute(
        select(User, cnt)
        .where(
            User.role == UserRole.saha_calisani,
            User.is_active.is_(True),
            User.last_location.isnot(None),
        )
        .order_by(func.ST_DistanceSphere(User.last_location, asset_geom).asc())
    ).all()
    for user, aktif in rows:
        if aktif < MAKS_AKTIF_GOREV:
            return user
    return None


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
        )
        .where(User.role == UserRole.saha_calisani, User.is_active.is_(True))
        .order_by(User.full_name)
    )
    return db.execute(stmt).all()
