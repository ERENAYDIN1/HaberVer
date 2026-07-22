import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from ..crud import asset as crud
from ..database import get_db
from ..models.asset import AssetStatus, AssetType
from ..schemas.asset import (
    AssetCreate,
    AssetFeature,
    AssetFeatureCollection,
    AssetUpdate,
    WithinQuery,
)
from ..security import personel

# Tum varlik uclari personel (admin/calisan) erisimine acik; vatandaslar
# varlik yonetimine erisemez, yalnizca ihbar gonderir.
router = APIRouter(
    prefix="/api/assets", tags=["assets"], dependencies=[Depends(personel)]
)


@router.post("", response_model=AssetFeature, status_code=status.HTTP_201_CREATED)
def create_asset(data: AssetCreate, db: Session = Depends(get_db)):
    row = crud.create_asset(db, data)
    return AssetFeature.from_row(row)


@router.get("", response_model=AssetFeatureCollection)
def list_assets(
    type: AssetType | None = Query(default=None, description="Varlik tipine gore filtrele"),
    status: AssetStatus | None = Query(default=None, description="Duruma gore filtrele"),
    db: Session = Depends(get_db),
):
    rows = crud.list_assets(db, asset_type=type, status=status)
    return AssetFeatureCollection.from_rows(rows)


@router.post("/within", response_model=AssetFeatureCollection)
def assets_within(query: WithinQuery, db: Session = Depends(get_db)):
    """Verilen poligonun icine dusen varliklari dondurur (PostGIS ST_Within)."""
    rows = crud.assets_within(
        db,
        polygon_geojson=query.polygon.model_dump_json(),
        asset_type=query.type,
        status=query.status,
    )
    return AssetFeatureCollection.from_rows(rows)


@router.get("/{asset_id}", response_model=AssetFeature)
def get_asset(asset_id: uuid.UUID, db: Session = Depends(get_db)):
    row = crud.get_asset(db, asset_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Varlik bulunamadi")
    return AssetFeature.from_row(row)


@router.put("/{asset_id}", response_model=AssetFeature)
def update_asset(
    asset_id: uuid.UUID, data: AssetUpdate, db: Session = Depends(get_db)
):
    row = crud.update_asset(db, asset_id, data)
    if row is None:
        raise HTTPException(status_code=404, detail="Varlik bulunamadi")
    return AssetFeature.from_row(row)


@router.delete("/{asset_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_asset(asset_id: uuid.UUID, db: Session = Depends(get_db)):
    if not crud.delete_asset(db, asset_id):
        raise HTTPException(status_code=404, detail="Varlik bulunamadi")
