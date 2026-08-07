import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from .. import olaylar
from ..crud import asset as crud
from ..crud import assignment as assignment_crud
from ..crud import tur as tur_crud
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
from ..security import Kapsam, get_context, kapsam, personel, saha_dahil

router = APIRouter(prefix="/api/assets", tags=["assets"])


def _tur_dogrula(db: Session, tur: AssetType) -> None:
    """Tur artik bir enum degil `turler` tablosunun bir satiri, dolayisiyla
    pydantic onu dogrulayamaz. Kontrol burada yapilmazsa gecersiz bir tur
    veritabanindaki FK'ye carpar ve kullaniciya 500 doner."""
    if not tur_crud.gecerli(db, tur):
        raise HTTPException(
            status_code=422, detail=f"Gecersiz tur: {tur}"
        )


def _varlik_degisti() -> None:
    """Varlik listesi degisti.

    `saha` da yayinlanir: bir varligin durumu `iyi`ye cekilince aktif gorev
    kapanir ve havuz yeniden dagitilir (crud/asset.py::update_asset ->
    gorev_tamamla), yani baska bir ekibe o an yeni is dusmus olabilir. Silme de
    ayni sekilde ekibin listesinden bir isi dusurur."""
    olaylar.yayinla("assets")
    olaylar.yayinla("saha")


def _kapsamda(row, alan: Kapsam):
    """Kapsam disindaki bir varlik icin 404 - 403 degil. Varligin VARLIGI da
    baska departmanin bilgisidir; "yetkin yok" demek kaydin var oldugunu
    sizdirir. Yazma uclarinda (create/update) 403 kullanilir, cunku orada
    kullanici zaten neyi denedigini biliyor."""
    if row is not None and not alan.izinli(row[0].type):
        return None
    return row


@router.post(
    "",
    response_model=AssetFeature,
    status_code=status.HTTP_201_CREATED,
)
def create_asset(
    data: AssetCreate,
    user: User = Depends(personel),
    alan: Kapsam = Depends(kapsam),
    db: Session = Depends(get_db),
):
    _tur_dogrula(db, data.type)
    alan.dogrula(data.type)
    row = crud.create_asset(db, data, actor=user)
    _varlik_degisti()
    return AssetFeature.from_row(row)


@router.get("", response_model=AssetFeatureCollection, dependencies=[Depends(saha_dahil)])
def list_assets(
    type: AssetType | None = Query(default=None, description="Varlik tipine gore filtrele"),
    status: AssetStatus | None = Query(default=None, description="Duruma gore filtrele"),
    source: AssetSource | None = Query(
        default=None, description="Kayitli/talep kaynagina gore filtrele"
    ),
    alan: Kapsam = Depends(kapsam),
    db: Session = Depends(get_db),
):
    rows = crud.list_assets(
        db, asset_type=type, status=status, source=source, kapsam_turleri=alan.turler
    )
    return AssetFeatureCollection.from_rows(rows)


@router.post(
    "/within", response_model=AssetFeatureCollection, dependencies=[Depends(saha_dahil)]
)
def assets_within(
    query: WithinQuery,
    alan: Kapsam = Depends(kapsam),
    db: Session = Depends(get_db),
):
    """Verilen poligonun icine dusen varliklari dondurur (PostGIS ST_Within)."""
    rows = crud.assets_within(
        db,
        polygon_geojson=query.polygon.model_dump_json(),
        asset_type=query.type,
        status=query.status,
        source=query.source,
        kapsam_turleri=alan.turler,
    )
    return AssetFeatureCollection.from_rows(rows)


@router.get(
    "/{asset_id}", response_model=AssetFeature, dependencies=[Depends(saha_dahil)]
)
def get_asset(
    asset_id: uuid.UUID,
    alan: Kapsam = Depends(kapsam),
    db: Session = Depends(get_db),
):
    row = _kapsamda(crud.get_asset(db, asset_id), alan)
    if row is None:
        raise HTTPException(status_code=404, detail="Varlik bulunamadi")
    return AssetFeature.from_row(row)


@router.put("/{asset_id}", response_model=AssetFeature)
def update_asset(
    asset_id: uuid.UUID,
    data: AssetUpdate,
    user: User = Depends(personel),
    alan: Kapsam = Depends(kapsam),
    db: Session = Depends(get_db),
):
    mevcut = crud.get_asset(db, asset_id)
    if mevcut is None:
        raise HTTPException(status_code=404, detail="Varlik bulunamadi")
    # Hem MEVCUT hem HEDEF tur kapsamda olmali: aksi halde bir departman kendi
    # varligini baska departmanin turune cevirip erisimini kaybettirebilirdi.
    alan.dogrula(mevcut[0].type)
    if data.type is not None:
        _tur_dogrula(db, data.type)
        alan.dogrula(data.type)

    row = crud.update_asset(db, asset_id, data, actor=user)
    if row is None:
        raise HTTPException(status_code=404, detail="Varlik bulunamadi")
    _varlik_degisti()
    return AssetFeature.from_row(row)


@router.post("/{asset_id}/onar", response_model=AssetFeature)
def repair_asset(
    asset_id: uuid.UUID,
    user: User = Depends(saha_dahil),
    # Rol buradan okunur, `user.role` kolonundan degil (bkz. security.py).
    # FastAPI bagimliliklari onbellekledigi icin ek sorgu olusmaz.
    baglam: OturumBaglami = Depends(get_context),
    alan: Kapsam = Depends(kapsam),
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
    mevcut = _kapsamda(crud.get_asset(db, asset_id), alan)
    if mevcut is None:
        raise HTTPException(status_code=404, detail="Varlik bulunamadi")

    if baglam.etkin_rol is UserRole.saha_calisani:
        gorev = assignment_crud.aktif_gorev_bilgisi(db, asset_id)
        if gorev is None or gorev["worker_id"] != user.id:
            raise HTTPException(
                status_code=403, detail="Bu iş size atanmamış"
            )

    row = crud.update_asset(db, asset_id, AssetUpdate(status=AssetStatus.iyi), actor=user)
    if row is None:
        raise HTTPException(status_code=404, detail="Varlik bulunamadi")
    _varlik_degisti()
    return AssetFeature.from_row(row)


@router.delete("/{asset_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_asset(
    asset_id: uuid.UUID,
    user: User = Depends(personel),
    alan: Kapsam = Depends(kapsam),
    db: Session = Depends(get_db),
):
    if _kapsamda(crud.get_asset(db, asset_id), alan) is None:
        raise HTTPException(status_code=404, detail="Varlik bulunamadi")
    if not crud.delete_asset(db, asset_id, actor=user):
        raise HTTPException(status_code=404, detail="Varlik bulunamadi")
    _varlik_degisti()
