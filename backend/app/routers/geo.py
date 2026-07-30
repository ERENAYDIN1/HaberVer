from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..crud import geo as crud
from ..database import get_db
from ..schemas.geo import (
    AlanOlcusu,
    AlanOzeti,
    AlanOzetiGirdi,
    TamponCikti,
    TamponGirdi,
)
from ..security import personel, saha_dahil

router = APIRouter(prefix="/api/geo", tags=["geo"])


@router.post("/alan-ozeti", response_model=AlanOzeti, dependencies=[Depends(saha_dahil)])
def alan_ozeti(girdi: AlanOzetiGirdi, db: Session = Depends(get_db)):
    """Secili alanlarin cakismayi hesaba katan olcu ozeti.

    Ayni yerin uzerinden ikinci kez gecildiginde toplam buyumemeli: her alanin
    'net' katkisi kendisinden onceki alanlarla cakismayan kismidir, toplam da
    bu net parcalarin toplamidir (yani birlesim alani)."""
    olculer = crud.alan_olculeri(db, [a.noktalar for a in girdi.alanlar])
    satirlar = [
        AlanOlcusu(id=alan.id, kendi_m2=kendi, net_m2=net)
        for alan, (kendi, net) in zip(girdi.alanlar, olculer)
    ]
    return AlanOzeti(
        alanlar=satirlar,
        toplam_m2=sum(s.net_m2 for s in satirlar),
        ham_toplam_m2=sum(s.kendi_m2 for s in satirlar),
    )


@router.post("/tampon", response_model=TamponCikti, dependencies=[Depends(personel)])
def alan_tamponu(girdi: TamponGirdi, db: Session = Depends(get_db)):
    """Bir alani her yonunde verilen metre kadar genisletir (negatifse daraltir).

    Sekil duzenlemede "alani biraz buyut" istegi koseleri tek tek surukleyerek
    yapilamaz; ST_Buffer bunu jeodezik olarak, kenarlara paralel sekilde yapar."""
    halkalar, alan_m2 = crud.alan_tamponu(db, girdi.noktalar, girdi.mesafe_m)
    if not halkalar:
        raise HTTPException(
            status_code=422,
            detail="Bu kadar daraltınca alandan geriye bir şey kalmıyor",
        )
    return TamponCikti(noktalar=halkalar, alan_m2=alan_m2)
