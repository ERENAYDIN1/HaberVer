"""Kaydedilmis guzergahlar (bkz. models/guzergah.py).

crud/bolge.py'nin cizgi karsiligi. Iki modul ayni sirayla ayni fonksiyonlari
tasir; ayrilan tek sey geometri kurulumu (LINESTRING), olcu (uzunluk) ve temsil
noktasi (hattin ortasi).
"""

import json
import uuid
from datetime import datetime, timezone

from geoalchemy2 import Geography
from sqlalchemy import cast, func, or_, select
from sqlalchemy.orm import Session

from ..models.guzergah import Guzergah
from ..models.log import LogAction
from ..models.user import User
from ..schemas.guzergah import GuzergahCikti, GuzergahGirdi, GuzergahGuncelle
from . import assignment as assignment_crud
from . import yaka as yaka_crud
from .geo import cizgi_geojson
from .log import add_log


def _geometri(noktalar: list[list[tuple[float, float]]]):
    """Tek nokta dizisini PostGIS LINESTRING'ine cevirir. Alanlardaki
    MakeValid'e gerek yok: bir hat kendi uzerinden gecse de gecerli kalir."""
    return func.ST_SetSRID(func.ST_GeomFromGeoJSON(cizgi_geojson(noktalar[0])), 4326)


def _temsil_noktasi():
    """Kaydin tek temsil noktasi: hattin ortasi. Mesafe/yaka hesabi (otomatik
    atama) ve arayuzdeki "bu is hangi yakada" rozeti ayni noktayi okur."""
    return func.ST_LineInterpolatePoint(Guzergah.geom, 0.5)


def _uzunluk_m(geom):
    """Bir geometri ifadesinin jeodezik uzunlugu (m). create/update aninda
    Guzergah.uzunluk_m sutununa yazilir (bkz. crud/bolge.py::_alan_m2)."""
    return func.ST_Length(cast(geom, Geography))


def _select_with_geo():
    """Guzergah satirini GeoJSON metni + atanan ekibin adiyla birlikte secer
    (tek sorgu, N+1 yok). Olcu (uzunluk_m) artik kalici sutundur, burada
    yeniden hesaplanmaz."""
    ekip = User.__table__.alias("ekip")
    return (
        select(
            Guzergah,
            func.ST_AsGeoJSON(Guzergah.geom).label("gj"),
            func.coalesce(ekip.c.full_name, ekip.c.email).label("worker_ad"),
            yaka_crud.nokta_yakasi_ifadesi(_temsil_noktasi()).label("yaka"),
        )
        .outerjoin(ekip, ekip.c.id == Guzergah.worker_id)
        .order_by(Guzergah.created_at.desc())
    )


def _noktalar(gj: str) -> list[list[tuple[float, float]]]:
    """GeoJSON metnini API'nin (tek elemanli) dizi-listesi sekline cevirir -
    bolgelerle ayni kap, boylece frontend'in cizim mantigi ayrismaz."""
    geo = json.loads(gj)
    return [[(float(x), float(y)) for x, y in geo["coordinates"]]]


def _cikti(row) -> GuzergahCikti:
    guzergah, gj, worker_ad, yaka = row
    return GuzergahCikti(
        yaka=yaka,
        id=guzergah.id,
        ad=guzergah.ad,
        aciklama=guzergah.aciklama,
        renk=guzergah.renk,
        departman=guzergah.departman,
        noktalar=_noktalar(gj),
        uzunluk_m=guzergah.uzunluk_m,
        worker_id=guzergah.worker_id,
        worker_ad=worker_ad,
        assigned_at=guzergah.assigned_at,
        tamamlandi_at=guzergah.tamamlandi_at,
        created_at=guzergah.created_at,
        updated_at=guzergah.updated_at,
    )


def departman_kosulu(departman: str | None):
    """Bir mudurlugun gorebilecegi guzergahlarin kosulu: kendi kayitlari +
    GENEL kayitlar (departman NULL); bkz. crud/bolge.py."""
    return or_(Guzergah.departman.is_(None), Guzergah.departman == departman)


def list_guzergahlar(
    db: Session, departman: str | None = None, sinirli: bool = False
) -> list[GuzergahCikti]:
    """Kaydedilmis tum guzergahlar. `sinirli=True` (admin disi personel) ise
    yalnizca `departman`in ve genel kayitlar doner."""
    stmt = _select_with_geo()
    if sinirli:
        stmt = stmt.where(departman_kosulu(departman))
    return [_cikti(r) for r in db.execute(stmt).all()]


def list_guzergahlarim(db: Session, worker_id: uuid.UUID) -> list[GuzergahCikti]:
    """Bir saha ekibine atanmis guzergahlar (kendi ekraninda gorur)."""
    stmt = _select_with_geo().where(Guzergah.worker_id == worker_id)
    return [_cikti(r) for r in db.execute(stmt).all()]


def get_guzergah(db: Session, guzergah_id: uuid.UUID) -> GuzergahCikti | None:
    row = db.execute(_select_with_geo().where(Guzergah.id == guzergah_id)).first()
    return _cikti(row) if row else None


def create_guzergah(
    db: Session, data: GuzergahGirdi, actor: User | None
) -> GuzergahCikti:
    geom = _geometri(data.noktalar)
    guzergah = Guzergah(
        ad=data.ad,
        aciklama=data.aciklama,
        renk=data.renk,
        departman=data.departman,
        geom=geom,
        uzunluk_m=_uzunluk_m(geom),
        created_by=actor.id if actor else None,
    )
    db.add(guzergah)
    db.flush()
    add_log(
        db,
        action=LogAction.bolge_created,
        actor=actor,
        entity_type="guzergah",
        entity_id=guzergah.id,
        entity_name=guzergah.ad,
        detail="Çizgi",
        departman=guzergah.departman,
    )
    assignment_crud.guzergah_otomatik_ata(db, guzergah)
    db.commit()
    return get_guzergah(db, guzergah.id)


def update_guzergah(
    db: Session, guzergah_id: uuid.UUID, data: GuzergahGuncelle, actor: User | None
) -> GuzergahCikti | None:
    guzergah = db.get(Guzergah, guzergah_id)
    if guzergah is None:
        return None
    payload = data.model_dump(exclude_unset=True)
    noktalar = payload.pop("noktalar", None)
    for alan, deger in payload.items():
        setattr(guzergah, alan, deger)
    if noktalar is not None:
        geom = _geometri(noktalar)
        guzergah.geom = geom
        guzergah.uzunluk_m = _uzunluk_m(geom)
    if payload or noktalar is not None:
        add_log(
            db,
            action=LogAction.bolge_updated,
            actor=actor,
            entity_type="guzergah",
            entity_id=guzergah.id,
            entity_name=guzergah.ad,
            detail="Şekil güncellendi" if noktalar is not None else None,
            departman=guzergah.departman,
        )
    db.commit()
    return get_guzergah(db, guzergah_id)


def delete_guzergah(db: Session, guzergah_id: uuid.UUID, actor: User | None) -> bool:
    guzergah = db.get(Guzergah, guzergah_id)
    if guzergah is None:
        return False
    add_log(
        db,
        action=LogAction.bolge_deleted,
        actor=actor,
        entity_type="guzergah",
        entity_id=guzergah.id,
        entity_name=guzergah.ad,
        departman=guzergah.departman,
    )
    db.delete(guzergah)
    db.commit()
    return True


def ata(
    db: Session,
    guzergah_id: uuid.UUID,
    worker: User | None,
    actor: User | None,
) -> GuzergahCikti | None:
    """Guzergahi bir ekibe atar; worker None ise atamayi kaldirir. Elle atama
    kapasite/yaka/mudurluk kisitlarindan muaftir (bkz. crud/bolge.py::ata)."""
    guzergah = db.get(Guzergah, guzergah_id)
    if guzergah is None:
        return None
    guzergah.worker_id = worker.id if worker else None
    guzergah.assigned_at = datetime.now(timezone.utc) if worker else None
    guzergah.assigned_by = actor.id if actor and worker else None
    guzergah.tamamlandi_at = None
    guzergah.tamamlayan_id = None
    add_log(
        db,
        action=LogAction.bolge_assigned,
        actor=actor,
        entity_type="guzergah",
        entity_id=guzergah.id,
        entity_name=guzergah.ad,
        detail=(
            f"{worker.full_name or worker.email} ekibine atandı"
            if worker
            else "Atama kaldırıldı"
        ),
        departman=guzergah.departman,
    )
    db.commit()
    return get_guzergah(db, guzergah_id)


def tamamla(
    db: Session,
    guzergah_id: uuid.UUID,
    tamamlandi: bool,
    actor: User | None,
) -> GuzergahCikti | None:
    """Guzergahi tamamlandi (ya da tamamlandi=False ile yeniden acik)
    isaretler. Kayit silinmez: ekip yanlislikla kapattigi isi geri alabilsin."""
    guzergah = db.get(Guzergah, guzergah_id)
    if guzergah is None:
        return None
    guzergah.tamamlandi_at = datetime.now(timezone.utc) if tamamlandi else None
    guzergah.tamamlayan_id = actor.id if (actor and tamamlandi) else None
    add_log(
        db,
        action=LogAction.bolge_completed if tamamlandi else LogAction.bolge_reopened,
        actor=actor,
        entity_type="guzergah",
        entity_id=guzergah.id,
        entity_name=guzergah.ad,
        detail="Tamamlandı" if tamamlandi else "Tamamlama geri alındı",
        departman=guzergah.departman,
    )
    if tamamlandi:
        assignment_crud.bekleyen_gorevleri_dagit(db)
    db.commit()
    return get_guzergah(db, guzergah_id)
