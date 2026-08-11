import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import exists, func, select
from sqlalchemy.orm import Session

from ..models import Asset, User
from ..models.asset import AssetSource, AssetStatus, AssetType
from ..models.assignment import Assignment, AssignmentStatus
from ..models.log import LogAction
from ..schemas.asset import AssetCreate, AssetUpdate
from . import assignment as assignment_crud
from .log import add_log

# Talep kaynakli bir varlik tamir edildikten bu kadar gun sonra otomatik silinir.
TAMIR_SAKLAMA_GUN = 5


def _select_with_coords():
    """Asset satirini geometriden cikarilan longitude/latitude ve aktif bir
    goreve atanmis olup olmadigi (harita isaretcisindeki atama noktasi icin)
    ile secer. Correlated EXISTS: LEFT JOIN + GROUP BY yerine, tek satirlik
    bool - performans kuralina uygun (1 sorgu, N+1 yok)."""
    return select(
        Asset,
        func.ST_X(Asset.geometry).label("longitude"),
        func.ST_Y(Asset.geometry).label("latitude"),
        exists(
            select(Assignment.id).where(
                Assignment.asset_id == Asset.id,
                Assignment.status == AssignmentStatus.atandi,
            )
        ).label("assigned"),
    )


def _point(longitude: float, latitude: float):
    return func.ST_SetSRID(func.ST_MakePoint(longitude, latitude), 4326)


def _apply_filters(
    stmt,
    asset_type: AssetType | None,
    status: AssetStatus | None,
    source: AssetSource | None = None,
    kapsam_turleri: set[AssetType] | None = None,
):
    if asset_type is not None:
        stmt = stmt.where(Asset.type == asset_type)
    if status is not None:
        stmt = stmt.where(Asset.status == status)
    if source is not None:
        stmt = stmt.where(Asset.source == source)
    # Departman kapsami: None = sinirsiz (admin). Bos kume gecerli bir degerdir
    # ve hicbir satir dondurmez - departmani olmayan personel icin dogru sonuc.
    if kapsam_turleri is not None:
        stmt = stmt.where(Asset.type.in_(kapsam_turleri))
    return stmt


def purge_expired_repaired(db: Session) -> int:
    """Suresi dolmus (tamir edilip TAMIR_SAKLAMA_GUN gecmis) talep varliklarini
    siler. Yalnizca `main.py::_bakim_dongusu` cagirir; bir okuma ucundan
    cagrilmamali - her GET'i DELETE + COMMIT'e cevirir."""
    esik = datetime.now(timezone.utc) - timedelta(days=TAMIR_SAKLAMA_GUN)
    expired = (
        db.execute(
            select(Asset).where(
                Asset.source == AssetSource.ihbar,
                Asset.status == AssetStatus.iyi,
                Asset.repaired_at.is_not(None),
                Asset.repaired_at < esik,
            )
        )
        .scalars()
        .all()
    )
    for asset in expired:
        add_log(
            db,
            action=LogAction.asset_deleted,
            actor=None,
            entity_type="asset",
            entity_id=asset.id,
            entity_name=asset.name,
            detail="Tamir sonrası otomatik silindi",
            tur=asset.type,
        )
        db.delete(asset)
    if expired:
        db.commit()
    return len(expired)


def list_assets(
    db: Session,
    asset_type: AssetType | None = None,
    status: AssetStatus | None = None,
    source: AssetSource | None = None,
    kapsam_turleri: set[AssetType] | None = None,
):
    stmt = _apply_filters(
        _select_with_coords(), asset_type, status, source, kapsam_turleri
    )
    return db.execute(stmt.order_by(Asset.created_at.desc())).all()


def assets_within(
    db: Session,
    polygon_geojson: str,
    asset_type: AssetType | None = None,
    status: AssetStatus | None = None,
    source: AssetSource | None = None,
    kapsam_turleri: set[AssetType] | None = None,
):
    """Verilen poligonun icine dusen varliklar (ST_Within; geometri sutunundaki
    GiST indeksinden faydalanir)."""
    polygon = func.ST_SetSRID(func.ST_GeomFromGeoJSON(polygon_geojson), 4326)
    stmt = _select_with_coords().where(func.ST_Within(Asset.geometry, polygon))
    stmt = _apply_filters(stmt, asset_type, status, source, kapsam_turleri)
    return db.execute(stmt.order_by(Asset.created_at.desc())).all()


def get_asset(db: Session, asset_id: uuid.UUID):
    stmt = _select_with_coords().where(Asset.id == asset_id)
    return db.execute(stmt).first()


def create_asset(db: Session, data: AssetCreate, actor: User | None = None):
    asset = Asset(
        name=data.name,
        type=data.type,
        status=data.status,
        source=AssetSource.kayitli,
        geometry=_point(data.longitude, data.latitude),
        install_date=data.install_date,
        brand_model=data.brand_model,
        photo_url=data.photo_url,
    )
    db.add(asset)
    db.flush()  # id'yi almak icin (server_default gen_random_uuid())

    add_log(
        db,
        action=LogAction.asset_created,
        actor=actor,
        entity_type="asset",
        entity_id=asset.id,
        entity_name=asset.name,
        tur=asset.type,
    )
    # Dogrudan "Bakim Lazim" eklenen varlik da otomatik yonlendirilir.
    if asset.status == AssetStatus.bakim_lazim:
        ekip = assignment_crud.en_yakin_uygun_ekip(db, asset.geometry, asset.type)
        if ekip is not None:
            assignment_crud.ata(db, asset, ekip, assigned_by=None)
    db.commit()
    return get_asset(db, asset.id)


def update_asset(
    db: Session, asset_id: uuid.UUID, data: AssetUpdate, actor: User | None = None
):
    asset = db.get(Asset, asset_id)
    if asset is None:
        return None

    payload = data.model_dump(exclude_unset=True)
    longitude = payload.pop("longitude", None)
    latitude = payload.pop("latitude", None)
    eski_durum = asset.status

    for field, value in payload.items():
        setattr(asset, field, value)

    # Sema dogrulamasi ikisinin birlikte gelmesini garanti eder.
    koordinat_degisti = longitude is not None and latitude is not None
    if koordinat_degisti:
        asset.geometry = _point(longitude, latitude)

    if payload or koordinat_degisti:
        if "status" in payload and payload["status"] != eski_durum:
            # Tamir zamani otomatik silme sayacini besler; varlik tekrar
            # bakima donerse temizlenir.
            if asset.status == AssetStatus.iyi:
                asset.repaired_at = datetime.now(timezone.utc)
                # Aktif saha gorevi de kapanir; /onar ile PUT tek yerden gecer.
                assignment_crud.gorev_tamamla(db, asset.id, actor=actor)
            elif asset.status == AssetStatus.bakim_lazim:
                asset.repaired_at = None
            add_log(
                db,
                action=LogAction.asset_status_changed,
                actor=actor,
                entity_type="asset",
                entity_id=asset.id,
                entity_name=asset.name,
                detail=f"{eski_durum.value} → {asset.status.value}",
                tur=asset.type,
            )
            # Bakima cekilen varlik en yakin uygun ekibe yonlendirilir; uygun
            # ekip yoksa havuzda bekler.
            if asset.status == AssetStatus.bakim_lazim:
                db.flush()
                ekip = assignment_crud.en_yakin_uygun_ekip(db, asset.geometry, asset.type)
                if ekip is not None:
                    assignment_crud.ata(db, asset, ekip, assigned_by=None)
        else:
            add_log(
                db,
                action=LogAction.asset_updated,
                actor=actor,
                entity_type="asset",
                entity_id=asset.id,
                entity_name=asset.name,
                tur=asset.type,
            )

    db.commit()
    return get_asset(db, asset_id)


def delete_asset(db: Session, asset_id: uuid.UUID, actor: User | None = None) -> bool:
    asset = db.get(Asset, asset_id)
    if asset is None:
        return False

    add_log(
        db,
        action=LogAction.asset_deleted,
        actor=actor,
        entity_type="asset",
        entity_id=asset.id,
        entity_name=asset.name,
        tur=asset.type,
    )
    db.delete(asset)
    db.commit()
    return True
