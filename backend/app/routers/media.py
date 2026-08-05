"""Yuklenen talep fotograflarinin KIMLIK DOGRULAMALI servisi.

Bu dosya, `main.py`'deki `app.mount("/media", StaticFiles(...))` cagrisinin
yerini alir. Eski hali tum router'larin ve `security.py`'nin disindaydi: dosya
adini bilen herkes - giris yapmamis olsa bile - vatandasin gonderdigi fotografi
indirebiliyordu. Dosya adlari UUID4 oldugu icin tahmin edilemezdi, ama URL'ler
sizabilir (referrer, paylasim, log) ve sistemin geri kalani "sinir verisi bile
giris ister" seviyesindeyken bu bir bosluktu.

Erisim `saha_dahil` ile verilir: fotografi personel (onay ekraninda) ve saha
ekibi (sahada varligi bulmak icin) gorur. Vatandasin kendi talebinin fotografini
gormesi ayrica ele alinir (bkz. asagidaki `_erisebilir`).
"""

import re

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..crud.session import OturumBaglami
from ..database import get_db
from ..models.report import Report
from ..models.user import UserRole
from ..security import Kapsam, get_context, kapsam

router = APIRouter(prefix=f"/{settings.media_dir}", tags=["media"])

# Dosya adi yalnizca kaydettigimiz bicimde olabilir: UUID4 + izinli uzanti.
# Yolu "temizlemek" yerine kabul edilen bicimi tanimlamak, dizin disina cikma
# denemelerini (`..`, egik cizgi, NUL, mutlak yol) tumden kapatir.
DOSYA_DESENI = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$"
)

MEDIA_TIPLERI = {".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}


def _erisebilir(
    db: Session, baglam: OturumBaglami, alan: Kapsam, goreli_yol: str
) -> bool:
    """Admin tum talep fotograflarini gorur. `calisan`/`saha_calisani` yalnizca
    KENDI DEPARTMANININ turlerindeki talebin fotografini gorur - liste uclari
    departmana gore suzuluyorken medya ucu acik kalsaydi kural katman
    degistirir gibi gorunur, dosya adini ele geciren biri onu asardi.

    Vatandas YALNIZCA kendi gonderdigi talebin fotografini gorur; yoksa bir
    vatandas hesabi tum talep arsivini gezebilirdi."""
    if baglam.etkin_rol is UserRole.admin:
        return True
    if baglam.etkin_rol in (UserRole.calisan, UserRole.saha_calisani):
        tur = db.execute(
            select(Report.type).where(Report.photo_url == goreli_yol)
        ).scalar_one_or_none()
        # Talebe bagli olmayan bir dosya (orn. elle eklenmis varlik fotografi)
        # departman kisitina tabi degildir.
        return tur is None or alan.izinli(tur)
    if baglam.etkin_rol is UserRole.vatandas:
        return (
            db.execute(
                select(Report.id).where(
                    Report.photo_url == goreli_yol,
                    Report.reporter_id == baglam.user.id,
                )
            ).first()
            is not None
        )
    return False


@router.get("/reports/{dosya}")
def talep_fotografi(
    dosya: str,
    baglam: OturumBaglami = Depends(get_context),
    alan: Kapsam = Depends(kapsam),
    db: Session = Depends(get_db),
):
    if not DOSYA_DESENI.match(dosya):
        raise HTTPException(status_code=404, detail="Dosya bulunamadi")

    goreli_yol = f"/{settings.media_dir}/reports/{dosya}"
    if not _erisebilir(db, baglam, alan, goreli_yol):
        raise HTTPException(status_code=403, detail="Bu dosyaya erisim yetkiniz yok")

    yol = settings.media_yolu / "reports" / dosya
    if not yol.is_file():
        raise HTTPException(status_code=404, detail="Dosya bulunamadi")

    # media_type uzantidan turetilen sabit bir degerdir; dosya icerigine ya da
    # istemcinin sozune bagli degil.
    return FileResponse(
        yol,
        media_type=MEDIA_TIPLERI[yol.suffix],
        headers={
            # Yetkiye bagli kaynak: paylasimli onbellege girmemeli.
            "Cache-Control": "private, max-age=300",
            "X-Content-Type-Options": "nosniff",
        },
    )
