import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import Asset, User
from ..models.asset import AssetSource, AssetStatus, AssetType
from ..models.log import LogAction
from ..schemas.asset import AssetCreate, AssetUpdate
from . import assignment as assignment_crud
from .log import add_log

# Ihbar kaynakli bir varlik "Tamir Edildi" (durum -> iyi) olarak isaretlendikten
# bu kadar gun sonra otomatik silinir (liste uclarinda tembel temizlik).
TAMIR_SAKLAMA_GUN = 5


def _select_with_coords():
    """Asset satirini, geometriden cikarilan longitude/latitude ile birlikte seceer."""
    return select(
        Asset,
        func.ST_X(Asset.geometry).label("longitude"),
        func.ST_Y(Asset.geometry).label("latitude"),
    )


def _point(longitude: float, latitude: float):
    return func.ST_SetSRID(func.ST_MakePoint(longitude, latitude), 4326)


def _apply_filters(
    stmt,
    asset_type: AssetType | None,
    status: AssetStatus | None,
    source: AssetSource | None = None,
):
    if asset_type is not None:
        stmt = stmt.where(Asset.type == asset_type)
    if status is not None:
        stmt = stmt.where(Asset.status == status)
    if source is not None:
        stmt = stmt.where(Asset.source == source)
    return stmt


def purge_expired_repaired(db: Session) -> int:
    """TAMIR_SAKLAMA_GUN gunden uzun sure once tamir edilmis (durum 'iyi') ihbar
    kaynakli varliklari otomatik siler. Ayri bir zamanlayici olmadigindan liste
    uclarinda tembel olarak cagirilir (her okuma once suresi dolanlari temizler)."""
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
):
    purge_expired_repaired(db)
    stmt = _apply_filters(_select_with_coords(), asset_type, status, source)
    return db.execute(stmt.order_by(Asset.created_at.desc())).all()


def assets_within(
    db: Session,
    polygon_geojson: str,
    asset_type: AssetType | None = None,
    status: AssetStatus | None = None,
    source: AssetSource | None = None,
):
    """Verilen GeoJSON poligonunun icine dusen varliklari dondurur (ST_Within).

    Geometri sutunundaki GiST indeksi sayesinde sorgu indeksten faydalanir.
    """
    purge_expired_repaired(db)
    polygon = func.ST_SetSRID(func.ST_GeomFromGeoJSON(polygon_geojson), 4326)
    stmt = _select_with_coords().where(func.ST_Within(Asset.geometry, polygon))
    stmt = _apply_filters(stmt, asset_type, status, source)
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
    )
    # Dogrudan "Bakim Lazim" olarak eklenen varlik da en yakin uygun ekibe
    # otomatik yonlendirilir (bkz. update_asset - ayni davranis).
    if asset.status == AssetStatus.bakim_lazim:
        ekip = assignment_crud.en_yakin_uygun_ekip(db, asset.geometry)
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
            # "Tamir Edildi" (iyi) isaretlenince tamir zamanini kaydet; tekrar
            # bakima donerse temizle - ihbar varliklarinin 5 gunluk otomatik
            # silme sayaci buna gore isler.
            if asset.status == AssetStatus.iyi:
                asset.repaired_at = datetime.now(timezone.utc)
                # Tamir edildi: varsa aktif saha gorevini de kapat (hem /onar
                # ucundan hem personel PUT'undan tek yerde tetiklenir).
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
            )
            # Kayitli bir varlik "Bakim Lazim"a cekilince (ihbar onayindaki gibi)
            # en yakin uygun saha ekibine otomatik yonlendirilir. Menzilde uygun
            # ekip yoksa havuzda bekler; bir ekip kapasite/menzil acinca otomatik
            # dagitilir (bekleyen_gorevleri_dagit).
            if asset.status == AssetStatus.bakim_lazim:
                db.flush()
                ekip = assignment_crud.en_yakin_uygun_ekip(db, asset.geometry)
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
    )
    db.delete(asset)
    db.commit()
    return True
