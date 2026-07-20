import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import Asset
from ..schemas.asset import AssetCreate, AssetUpdate


def _select_with_coords():
    """Asset satirini, geometriden cikarilan longitude/latitude ile birlikte seceer."""
    return select(
        Asset,
        func.ST_X(Asset.geometry).label("longitude"),
        func.ST_Y(Asset.geometry).label("latitude"),
    )


def _point(longitude: float, latitude: float):
    return func.ST_SetSRID(func.ST_MakePoint(longitude, latitude), 4326)


def list_assets(db: Session):
    stmt = _select_with_coords().order_by(Asset.created_at.desc())
    return db.execute(stmt).all()


def get_asset(db: Session, asset_id: uuid.UUID):
    stmt = _select_with_coords().where(Asset.id == asset_id)
    return db.execute(stmt).first()


def create_asset(db: Session, data: AssetCreate):
    asset = Asset(
        name=data.name,
        type=data.type,
        status=data.status,
        geometry=_point(data.longitude, data.latitude),
        install_date=data.install_date,
        brand_model=data.brand_model,
        photo_url=data.photo_url,
    )
    db.add(asset)
    db.commit()
    return get_asset(db, asset.id)


def update_asset(db: Session, asset_id: uuid.UUID, data: AssetUpdate):
    asset = db.get(Asset, asset_id)
    if asset is None:
        return None

    payload = data.model_dump(exclude_unset=True)
    longitude = payload.pop("longitude", None)
    latitude = payload.pop("latitude", None)

    for field, value in payload.items():
        setattr(asset, field, value)

    # Sema dogrulamasi ikisinin birlikte gelmesini garanti eder.
    if longitude is not None and latitude is not None:
        asset.geometry = _point(longitude, latitude)

    db.commit()
    return get_asset(db, asset_id)


def delete_asset(db: Session, asset_id: uuid.UUID) -> bool:
    asset = db.get(Asset, asset_id)
    if asset is None:
        return False
    db.delete(asset)
    db.commit()
    return True
