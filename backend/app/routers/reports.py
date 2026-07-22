import uuid
from pathlib import Path

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    UploadFile,
    status,
)
from sqlalchemy.orm import Session

from ..config import settings
from ..crud import report as crud
from ..database import get_db
from ..models.asset import AssetType
from ..models.report import ReportStatus
from ..models.user import User, UserRole
from ..schemas.report import ReportFeature, ReportFeatureCollection, ReportReview
from ..security import get_current_user, personel, require_role

router = APIRouter(prefix="/api/reports", tags=["reports"])

IZINLI_FOTO_TIPLERI = {"image/jpeg", "image/png", "image/webp"}
MAKS_FOTO_BAYT = 5 * 1024 * 1024  # 5 MB
UZANTILAR = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}


def _fotograf_kaydet(foto: UploadFile) -> str:
    if foto.content_type not in IZINLI_FOTO_TIPLERI:
        raise HTTPException(
            status_code=400, detail="Sadece JPEG, PNG veya WEBP yuklenebilir"
        )
    icerik = foto.file.read()
    if len(icerik) > MAKS_FOTO_BAYT:
        raise HTTPException(status_code=400, detail="Fotograf en fazla 5 MB olabilir")

    hedef_dizin = Path(settings.media_dir) / "reports"
    hedef_dizin.mkdir(parents=True, exist_ok=True)
    ad = f"{uuid.uuid4()}{UZANTILAR[foto.content_type]}"
    (hedef_dizin / ad).write_bytes(icerik)
    return f"/{settings.media_dir}/reports/{ad}"


@router.post("", response_model=ReportFeature, status_code=status.HTTP_201_CREATED)
def create_report(
    name: str = Form(..., min_length=1, max_length=255),
    type: AssetType = Form(...),
    longitude: float = Form(..., ge=-180, le=180),
    latitude: float = Form(..., ge=-90, le=90),
    note: str = Form(..., min_length=1),
    photo: UploadFile = File(...),
    user: User = Depends(require_role(UserRole.vatandas)),
    db: Session = Depends(get_db),
):
    """Vatandas ihbari olusturur (multipart). Aciklama ve fotograf zorunludur."""
    if not note.strip():
        raise HTTPException(status_code=400, detail="Aciklama bos olamaz")
    photo_url = _fotograf_kaydet(photo)
    row = crud.create_report(
        db,
        reporter_id=user.id,
        name=name.strip(),
        type_=type,
        longitude=longitude,
        latitude=latitude,
        note=note.strip(),
        photo_url=photo_url,
    )
    return ReportFeature.from_row(row)


@router.get("/mine", response_model=ReportFeatureCollection)
def my_reports(
    user: User = Depends(require_role(UserRole.vatandas)),
    db: Session = Depends(get_db),
):
    return ReportFeatureCollection.from_rows(
        crud.list_reports(db, reporter_id=user.id)
    )


@router.get("", response_model=ReportFeatureCollection)
def list_reports(
    status: ReportStatus | None = None,
    _: User = Depends(personel),
    db: Session = Depends(get_db),
):
    """Personel (admin/calisan) tum ihbarlari (opsiyonel duruma gore) listeler."""
    return ReportFeatureCollection.from_rows(crud.list_reports(db, status=status))


@router.post("/{report_id}/onayla", response_model=ReportFeature)
def approve(
    report_id: uuid.UUID,
    user: User = Depends(personel),
    db: Session = Depends(get_db),
):
    row = crud.get(db, report_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Ihbar bulunamadi")
    report = row[0]
    if report.status != ReportStatus.beklemede:
        raise HTTPException(status_code=409, detail="Ihbar zaten sonuclandirilmis")
    return ReportFeature.from_row(crud.approve_report(db, report, user.id))


@router.post("/{report_id}/reddet", response_model=ReportFeature)
def reject(
    report_id: uuid.UUID,
    data: ReportReview,
    user: User = Depends(personel),
    db: Session = Depends(get_db),
):
    row = crud.get(db, report_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Ihbar bulunamadi")
    report = row[0]
    if report.status != ReportStatus.beklemede:
        raise HTTPException(status_code=409, detail="Ihbar zaten sonuclandirilmis")
    return ReportFeature.from_row(
        crud.reject_report(db, report, user.id, data.review_note)
    )
