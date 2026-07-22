import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from ..crud import asset as crud
from ..database import get_db
from ..models.asset import AssetSource, AssetStatus, AssetType
from ..schemas.asset import (
    AssetCreate,
    AssetFeature,
    AssetFeatureCollection,
    AssetUpdate,
    WithinQuery,
)
from ..security import personel, saha_dahil

router = APIRouter(prefix="/api/assets", tags=["assets"])


@router.post(
    "",
    response_model=AssetFeature,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(personel)],
)
def create_asset(data: AssetCreate, db: Session = Depends(get_db)):
    row = crud.create_asset(db, data)
    return AssetFeature.from_row(row)


@router.get("", response_model=AssetFeatureCollection, dependencies=[Depends(saha_dahil)])
def list_assets(
    type: AssetType | None = Query(default=None, description="Varlik tipine gore filtrele"),
    status: AssetStatus | None = Query(default=None, description="Duruma gore filtrele"),
    source: AssetSource | None = Query(
        default=None, description="Kayitli/ihbar kaynagina gore filtrele"
    ),
    db: Session = Depends(get_db),
):
    rows = crud.list_assets(db, asset_type=type, status=status, source=source)
    return AssetFeatureCollection.from_rows(rows)


@router.post(
    "/within", response_model=AssetFeatureCollection, dependencies=[Depends(saha_dahil)]
)
def assets_within(query: WithinQuery, db: Session = Depends(get_db)):
    """Verilen poligonun icine dusen varliklari dondurur (PostGIS ST_Within)."""
    rows = crud.assets_within(
        db,
        polygon_geojson=query.polygon.model_dump_json(),
        asset_type=query.type,
        status=query.status,
        source=query.source,
    )
    return AssetFeatureCollection.from_rows(rows)


@router.get(
    "/{asset_id}", response_model=AssetFeature, dependencies=[Depends(saha_dahil)]
)
def get_asset(asset_id: uuid.UUID, db: Session = Depends(get_db)):
    row = crud.get_asset(db, asset_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Varlik bulunamadi")
    return AssetFeature.from_row(row)


@router.put(
    "/{asset_id}", response_model=AssetFeature, dependencies=[Depends(personel)]
)
def update_asset(
    asset_id: uuid.UUID, data: AssetUpdate, db: Session = Depends(get_db)
):
    row = crud.update_asset(db, asset_id, data)
    if row is None:
        raise HTTPException(status_code=404, detail="Varlik bulunamadi")
    return AssetFeature.from_row(row)


@router.post(
    "/{asset_id}/onar",
    response_model=AssetFeature,
    dependencies=[Depends(saha_dahil)],
)
def repair_asset(asset_id: uuid.UUID, db: Session = Depends(get_db)):
    """Varligi 'Tamir Edildi' olarak isaretler (durumu 'iyi'ye ceker); saha
    calisaninin tam varlik duzenleme yetkisi olmadan kullanabilecegi tek islem."""
    row = crud.update_asset(db, asset_id, AssetUpdate(status=AssetStatus.iyi))
    if row is None:
        raise HTTPException(status_code=404, detail="Varlik bulunamadi")
    return AssetFeature.from_row(row)


@router.delete(
    "/{asset_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(personel)]
)
def delete_asset(asset_id: uuid.UUID, db: Session = Depends(get_db)):
    if not crud.delete_asset(db, asset_id):
        raise HTTPException(status_code=404, detail="Varlik bulunamadi")
