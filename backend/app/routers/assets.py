import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..crud import asset as crud
from ..database import get_db
from ..schemas.asset import (
    AssetCreate,
    AssetFeature,
    AssetFeatureCollection,
    AssetUpdate,
)

router = APIRouter(prefix="/api/assets", tags=["assets"])


@router.post("", response_model=AssetFeature, status_code=status.HTTP_201_CREATED)
def create_asset(data: AssetCreate, db: Session = Depends(get_db)):
    row = crud.create_asset(db, data)
    return AssetFeature.from_row(row)


@router.get("", response_model=AssetFeatureCollection)
def list_assets(db: Session = Depends(get_db)):
    rows = crud.list_assets(db)
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
