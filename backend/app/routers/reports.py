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
from pydantic import ValidationError
from sqlalchemy.orm import Session

from .. import olaylar
from ..config import settings
from ..crud import report as crud
from ..crud import tur as tur_crud
from ..database import get_db
from ..models.asset import AssetType
from ..models.report import ReportStatus
from ..models.user import User, UserRole
from ..schemas.report import (
    ReportFeature,
    ReportFeatureCollection,
    ReportReview,
    TalepGeometrisi,
)
from ..security import Kapsam, kapsam, personel, require_role

router = APIRouter(prefix="/api/reports", tags=["reports"])

IZINLI_FOTO_TIPLERI = {"image/jpeg", "image/png", "image/webp"}
MAKS_FOTO_BAYT = 5 * 1024 * 1024  # 5 MB
UZANTILAR = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}


# Dosya parca parca okunur (bkz. _fotograf_kaydet); tek seferde belleğe alinmaz.
OKUMA_PARCASI = 64 * 1024


def _talep_degisti(varlik_da: bool = False) -> None:
    """Talep listesi degisti (yeni talep, onay, ret, reddi geri alma).

    `varlik_da=True` yalnizca ONAYDA verilir: onay bir varlik olusturur ve onu
    otomatik atamaya sokar (crud/report.py::approve_report), yani envanter ve
    gorev dagilimi da degisir. Ret/geri-alma yalnizca talebi etkiler."""
    olaylar.yayinla("reports")
    if varlik_da:
        olaylar.yayinla("assets")
        olaylar.yayinla("saha")


def _imza_uyuyor(icerik: bytes, content_type: str | None) -> bool:
    """Dosyanin ilk baytlari, iddia edilen goruntu turunun sihirli sayisiyla
    uyusuyor mu? (JPEG: FFD8FF, PNG: 89PNG..., WEBP: RIFF....WEBP)"""
    if content_type == "image/jpeg":
        return icerik.startswith(b"\xff\xd8\xff")
    if content_type == "image/png":
        return icerik.startswith(b"\x89PNG\r\n\x1a\n")
    if content_type == "image/webp":
        return icerik[:4] == b"RIFF" and icerik[8:12] == b"WEBP"
    return False


def _fotograf_kaydet(foto: UploadFile) -> str:
    if foto.content_type not in IZINLI_FOTO_TIPLERI:
        raise HTTPException(
            status_code=400, detail="Sadece JPEG, PNG veya WEBP yuklenebilir"
        )

    # Boyut siniri dosya bellege alinmadan uygulanir: tum govdeyi okuyup sonra
    # uzunluguna bakmak, sinirin kendisini bir bellek tuketme yoluna cevirirdi.
    parcalar: list[bytes] = []
    toplam = 0
    while parca := foto.file.read(OKUMA_PARCASI):
        toplam += len(parca)
        if toplam > MAKS_FOTO_BAYT:
            raise HTTPException(
                status_code=413, detail="Fotograf en fazla 5 MB olabilir"
            )
        parcalar.append(parca)
    if not toplam:
        raise HTTPException(status_code=400, detail="Fotograf bos olamaz")
    icerik = b"".join(parcalar)

    # `content_type` istemcinin iddiasidir. Uzanti ve servis media_type'i ondan
    # turedigi icin ilk baytlardan da dogrulanir: "PNG diye gonderilen HTML"
    # diske yazilamasin.
    if not _imza_uyuyor(icerik, foto.content_type):
        raise HTTPException(
            status_code=400,
            detail="Dosya icerigi belirtilen goruntu turuyle uyusmuyor",
        )

    hedef_dizin = Path(settings.media_dir) / "reports"
    hedef_dizin.mkdir(parents=True, exist_ok=True)
    ad = f"{uuid.uuid4()}{UZANTILAR[foto.content_type]}"
    (hedef_dizin / ad).write_bytes(icerik)
    return f"/{settings.media_dir}/reports/{ad}"


def _talep_getir(db: Session, report_id: uuid.UUID, alan: Kapsam):
    """Talebi getirir ve departman kapsamini uygular.

    Kapsam disi bir talep 404 doner, 403 degil: talebin VARLIGI da baska
    mudurlugun bilgisidir, "yetkiniz yok" demek kaydin var oldugunu sizdirir."""
    row = crud.get(db, report_id)
    if row is None or not alan.izinli(row[0].type):
        raise HTTPException(status_code=404, detail="Talep bulunamadi")
    return row


@router.post("", response_model=ReportFeature, status_code=status.HTTP_201_CREATED)
def create_report(
    name: str = Form(..., min_length=1, max_length=255),
    type: AssetType = Form(...),
    geometry: str = Form(..., description="GeoJSON Point"),
    note: str = Form(..., min_length=1),
    photo: UploadFile = File(...),
    user: User = Depends(require_role(UserRole.vatandas)),
    db: Session = Depends(get_db),
):
    """Vatandas talebi olusturur (multipart). Aciklama ve fotograf zorunludur.

    Konum tek bir NOKTADIR; GeoJSON dizgisi olarak gelir (bkz. migration 0016).
    Isin buyuklugunu personel onaydan sonra actigi bolge/guzergah kaydiyla
    tanimlar."""
    if not note.strip():
        raise HTTPException(status_code=400, detail="Aciklama bos olamaz")
    # Tur bir enum degil `turler` tablosunun satiri: pydantic dogrulayamaz.
    if not tur_crud.gecerli(db, type):
        raise HTTPException(status_code=422, detail=f"Gecersiz tur: {type}")
    try:
        sekil = TalepGeometrisi.model_validate_json(geometry)
    except ValidationError as e:
        raise HTTPException(status_code=422, detail=f"Geçersiz konum: {e.errors()[0]['msg']}")

    photo_url = _fotograf_kaydet(photo)
    row = crud.create_report(
        db,
        reporter_id=user.id,
        name=name.strip(),
        type_=type,
        geojson=sekil.model_dump_json(),
        note=note.strip(),
        photo_url=photo_url,
    )
    # Yeni talep personelin bekleyenler listesine ve bildirim ziline dusmeli.
    _talep_degisti()
    return ReportFeature.from_row(row)


@router.get("/mine", response_model=ReportFeatureCollection)
def my_reports(
    user: User = Depends(require_role(UserRole.vatandas)),
    db: Session = Depends(get_db),
):
    """Vatandasin kendi talepleri. Kendi listesinden kaldirdiklari gelmez."""
    return ReportFeatureCollection.from_rows(
        crud.list_reports(db, reporter_id=user.id, gizliler_haric=True)
    )


@router.delete("/{report_id}", response_model=ReportFeature)
def hide_report(
    report_id: uuid.UUID,
    user: User = Depends(require_role(UserRole.vatandas)),
    db: Session = Depends(get_db),
):
    """Vatandas talebi KENDI LISTESINDEN kaldirir.

    Satir silinmez: onaylanmis bir talep gercekten silinseydi ondan olusan
    varlik, saha atamasi ve audit log kayitlari sahipsiz kalirdi. Personel
    tarafi ve gecmis bu islemden etkilenmez."""
    row = crud.get(db, report_id)
    if row is None or row[0].reporter_id != user.id:
        raise HTTPException(status_code=404, detail="Talep bulunamadi")
    return ReportFeature.from_row(crud.gizle(db, row[0]))


@router.get("", response_model=ReportFeatureCollection)
def list_reports(
    status: ReportStatus | None = None,
    _: User = Depends(personel),
    alan: Kapsam = Depends(kapsam),
    db: Session = Depends(get_db),
):
    """Personel tum talepleri (opsiyonel duruma gore) listeler - yalnizca KENDI
    DEPARTMANININ turlerinde. Vatandasin listeden kaldirdiklari burada durur."""
    return ReportFeatureCollection.from_rows(
        crud.list_reports(db, status=status, kapsam_turleri=alan.turler)
    )


@router.post("/{report_id}/onayla", response_model=ReportFeature)
def approve(
    report_id: uuid.UUID,
    data: ReportReview | None = None,
    user: User = Depends(personel),
    alan: Kapsam = Depends(kapsam),
    db: Session = Depends(get_db),
):
    """Talebi onaylar. Govde opsiyoneldir; `type` gonderilirse personel
    vatandasin sectigi turu duzeltmis olur (bkz. crud.approve_report).

    Tur duzeltmesi talebi BASKA BIR DEPARTMANA devredebilir: Cozum Merkezi
    'diger' olarak gelen bir talebi 'yol'a cektiginde kayit Fen Isleri'nin
    kapsamina gecer. Bu bilincli - triyaj mekanizmasi budur - ama hedef tur
    icin ayrica yetki aranmaz, yoksa 'diger' talepleri hicbir yere devredilemezdi."""
    row = _talep_getir(db, report_id, alan)
    report = row[0]
    if report.status != ReportStatus.beklemede:
        raise HTTPException(status_code=409, detail="Talep zaten sonuclandirilmis")
    if data and data.type is not None and not tur_crud.gecerli(db, data.type):
        raise HTTPException(
            status_code=422, detail=f"Gecersiz tur: {data.type}"
        )
    sonuc = ReportFeature.from_row(
        crud.approve_report(db, report, user, yeni_tip=data.type if data else None)
    )
    _talep_degisti(varlik_da=True)
    return sonuc


@router.post("/{report_id}/reddet", response_model=ReportFeature)
def reject(
    report_id: uuid.UUID,
    data: ReportReview,
    user: User = Depends(personel),
    alan: Kapsam = Depends(kapsam),
    db: Session = Depends(get_db),
):
    row = _talep_getir(db, report_id, alan)
    report = row[0]
    if report.status != ReportStatus.beklemede:
        raise HTTPException(status_code=409, detail="Talep zaten sonuclandirilmis")
    sonuc = ReportFeature.from_row(
        crud.reject_report(db, report, user, data.review_note)
    )
    _talep_degisti()
    return sonuc


@router.post("/{report_id}/geri-al", response_model=ReportFeature)
def reopen(
    report_id: uuid.UUID,
    user: User = Depends(personel),
    alan: Kapsam = Depends(kapsam),
    db: Session = Depends(get_db),
):
    """Reddedilen talebin reddini geri alir (tekrar 'beklemede')."""
    row = _talep_getir(db, report_id, alan)
    report = row[0]
    if report.status != ReportStatus.reddedildi:
        raise HTTPException(
            status_code=409, detail="Yalnizca reddedilmis taleplerin reddi geri alinabilir"
        )
    sonuc = ReportFeature.from_row(crud.reopen_report(db, report, user))
    _talep_degisti()
    return sonuc
