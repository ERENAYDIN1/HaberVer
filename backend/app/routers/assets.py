import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from ..crud import asset as crud
from ..crud import assignment as assignment_crud
from ..crud.session import OturumBaglami
from ..database import get_db
from ..models.asset import AssetSource, AssetStatus, AssetType
from ..models.user import User, UserRole
from ..schemas.asset import (
    AssetCreate,
    AssetFeature,
    AssetFeatureCollection,
    AssetUpdate,
    WithinQuery,
)
from ..security import get_context, personel, saha_dahil

router = APIRouter(prefix="/api/assets", tags=["assets"])


@router.post(
    "",
    response_model=AssetFeature,
    status_code=status.HTTP_201_CREATED,
)
def create_asset(
    data: AssetCreate, user: User = Depends(personel), db: Session = Depends(get_db)
):
    row = crud.create_asset(db, data, actor=user)
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


@router.put("/{asset_id}", response_model=AssetFeature)
def update_asset(
    asset_id: uuid.UUID,
    data: AssetUpdate,
    user: User = Depends(personel),
    db: Session = Depends(get_db),
):
    row = crud.update_asset(db, asset_id, data, actor=user)
    if row is None:
        raise HTTPException(status_code=404, detail="Varlik bulunamadi")
    return AssetFeature.from_row(row)


@router.post("/{asset_id}/onar", response_model=AssetFeature)
def repair_asset(
    asset_id: uuid.UUID,
    user: User = Depends(saha_dahil),
    # Rol buradan okunur, `user.role` kolonundan degil (bkz. security.py).
    # FastAPI bagimliliklari onbellekledigi icin ek sorgu olusmaz.
    baglam: OturumBaglami = Depends(get_context),
    db: Session = Depends(get_db),
):
    """Varligi 'Tamir Edildi' olarak isaretler (durumu 'iyi'ye ceker); saha
    calisaninin tam varlik duzenleme yetkisi olmadan kullanabilecegi tek islem.

    SAHA CALISANI YALNIZCA KENDISINE ATANMIS isi kapatabilir. Bu kural daha once
    yalnizca arayuzde vardi (SahaEkran sadece `GET /saha/gorevlerim`'i cizer),
    yani API'ye dogrudan gidilerek asilabiliyordu: bir saha hesabi kendisine
    atanmamis - hatta havuzda bekleyen - herhangi bir varligi kapatabiliyor,
    boylece baska ekibin gorevini `tamamlandi` yapip havuzu yeniden dagitiyor ve
    audit log'a yanlis aktoru yaziyordu. Arayuz bir yetki siniri degildir; kural
    burada duruyor ki yeni bir ekran eklendiginde sessizce kaybolmasin.

    Personel (admin/calisan) muaftir: varligi zaten PUT ile duzenleyebiliyorlar,
    burada kisitlamak yalnizca ayni isi iki yoldan yapmayi engellerdi."""
    if baglam.etkin_rol is UserRole.saha_calisani:
        gorev = assignment_crud.aktif_gorev_bilgisi(db, asset_id)
        if gorev is None or gorev["worker_id"] != user.id:
            raise HTTPException(
                status_code=403, detail="Bu iş size atanmamış"
            )

    row = crud.update_asset(db, asset_id, AssetUpdate(status=AssetStatus.iyi), actor=user)
    if row is None:
        raise HTTPException(status_code=404, detail="Varlik bulunamadi")
    return AssetFeature.from_row(row)


@router.delete("/{asset_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_asset(
    asset_id: uuid.UUID, user: User = Depends(personel), db: Session = Depends(get_db)
):
    if not crud.delete_asset(db, asset_id, actor=user):
        raise HTTPException(status_code=404, detail="Varlik bulunamadi")
