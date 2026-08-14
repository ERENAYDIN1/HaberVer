"""Tur sozlugu (bkz. models/tur.py).

Sozluk bir tablodur, bu yuzden "gecerli tur" artik bir enum uyeligi degil bir
SORGU sonucudur. Yazma uclari (varlik/talep olusturma, tur duzeltme) bu
moduldeki `gecerli` uzerinden gecer; veritabanindaki FK ikinci savunma hattidir.
"""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models.asset import Asset
from ..models.departman import TurDepartman
from ..models.log import LogAction
from ..models.talep import Talep
from ..models.tur import Tur
from ..models.user import User
from ..schemas.tur import TurCreate, TurUpdate
from .log import add_log


def list_turler(db: Session) -> list[Tur]:
    """Tum turler, ada gore. Sozlukte gorunurluk ayari yok: burada donen her
    tur her yerde (lejant, talep formu, envanter formu) secilebilir."""
    return list(db.execute(select(Tur).order_by(Tur.ad)).scalars().all())


def get(db: Session, kod: str) -> Tur | None:
    return db.get(Tur, kod)


def gecerli(db: Session, kod: str) -> bool:
    """Kod sozlukte var mi."""
    return db.get(Tur, kod) is not None


def kullanim(db: Session, kod: str) -> dict[str, int]:
    """Turu kac varlik/talep kullaniyor. Silme reddedilirken gerekcedir."""
    return {
        "varlik": db.execute(
            select(func.count(Asset.id)).where(Asset.type == kod)
        ).scalar_one(),
        "talep": db.execute(
            select(func.count(Talep.id)).where(Talep.type == kod)
        ).scalar_one(),
    }


def create(db: Session, data: TurCreate, actor: User | None) -> Tur:
    """Turu ve YONLENDIRMESINI birlikte yazar. Ikisi tek islemde olmali:
    yonlendirmesiz bir tur hicbir mudurlugun kapsamina girmez, yani hem
    personelden hem otomatik atamadan gorunmez olurdu."""
    tur = Tur(
        kod=data.kod,
        ad=data.ad,
        grup=data.grup,
        glif=data.glif,
    )
    db.add(tur)
    # flush ZORUNLU: `tur_departman.tur` -> `turler.kod` FK'si var ama ORM
    # tarafinda iki model arasinda bir iliski tanimli degil, dolayisiyla
    # SQLAlchemy INSERT sirasini kendiliginden cikaramaz ve yonlendirme
    # satirini once yazmaya calisirdi.
    db.flush()
    db.add(TurDepartman(tur=data.kod, departman_kod=data.departman))
    add_log(
        db,
        action=LogAction.tur_created,
        actor=actor,
        entity_type="tur",
        entity_id=None,
        entity_name=data.ad,
        detail=f"{data.kod} → {data.departman}",
    )
    db.commit()
    return tur


def update(db: Session, kod: str, data: TurUpdate, actor: User | None) -> Tur | None:
    tur = db.get(Tur, kod)
    if tur is None:
        return None
    degisiklikler = data.model_dump(exclude_unset=True)
    yazilan = {
        alan: deger
        for alan, deger in degisiklikler.items()
        if getattr(tur, alan) != deger
    }
    for alan, deger in yazilan.items():
        setattr(tur, alan, deger)
    if yazilan:
        add_log(
            db,
            action=LogAction.tur_updated,
            actor=actor,
            entity_type="tur",
            entity_id=None,
            entity_name=tur.ad,
            detail=", ".join(sorted(yazilan)),
        )
    db.commit()
    return tur


def delete(db: Session, kod: str, actor: User | None) -> bool:
    """Turu siler. Kullanimda olup olmadigini cagiran taraf kontrol eder
    (`kullanim`); buraya gelindiginde karar verilmistir. `tur_departman`
    satiri FK CASCADE ile birlikte gider."""
    tur = db.get(Tur, kod)
    if tur is None:
        return False
    add_log(
        db,
        action=LogAction.tur_deleted,
        actor=actor,
        entity_type="tur",
        entity_id=None,
        entity_name=tur.ad,
        detail=kod,
    )
    db.delete(tur)
    db.commit()
    return True
