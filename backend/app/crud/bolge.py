"""Kaydedilmis gorev bolgeleri / guzergahlar (bkz. models/bolge.py)."""

import json
import uuid
from datetime import datetime, timezone

from geoalchemy2 import Geography
from sqlalchemy import case, cast, func, or_, select
from sqlalchemy.orm import Session

from ..models.bolge import Bolge, BolgeTipi
from ..models.log import LogAction
from ..models.user import User
from ..schemas.bolge import BolgeCikti, BolgeGirdi, BolgeGuncelle
from . import assignment as assignment_crud
from . import yaka as yaka_crud
from .geo import cizgi_geojson, halkalar_geojson
from .log import add_log


def _geometri(tip: BolgeTipi, noktalar: list[list[tuple[float, float]]]):
    """Nokta listesini tipine gore PostGIS geometrisine cevirir. Alanlar
    MakeValid'den gecirilir: kullanicinin kendi kendini kesen bir poligon
    cizmesi (ayni yerin uzerinden ikinci kez gecmesi) gecersiz geometri
    uretir. Hem yeni kayitta hem sekil duzenlemede ayni yol kullanilir."""
    if tip is BolgeTipi.cizgi:
        return func.ST_SetSRID(func.ST_GeomFromGeoJSON(cizgi_geojson(noktalar[0])), 4326)
    return func.ST_Multi(
        func.ST_CollectionExtract(
            func.ST_MakeValid(
                func.ST_SetSRID(
                    func.ST_GeomFromGeoJSON(halkalar_geojson(noktalar)), 4326
                )
            ),
            3,
        )
    )


def _temsil_noktasi():
    """Kaydin tek temsil noktasi: alan -> icinde garanti bir nokta, cizgi ->
    hattin ortasi. Mesafe/yaka hesabi (otomatik atama) ve arayuzdeki "bu is
    hangi yakada" rozeti ayni noktayi okur."""
    return case(
        (
            Bolge.tip == BolgeTipi.alan,
            func.ST_PointOnSurface(Bolge.geom),
        ),
        else_=func.ST_LineInterpolatePoint(Bolge.geom, 0.5),
    )


def _select_with_geo():
    """Bolge satirini GeoJSON metni + jeodezik olcusu + atanan ekibin adiyla
    birlikte secer (tek sorgu, N+1 yok). Isin yakasi da burada cozulur: elle
    atamada "karsi yaka" uyarisi varliklardakiyle ayni bilgiye dayanmali."""
    ekip = User.__table__.alias("ekip")
    return (
        select(
            Bolge,
            func.ST_AsGeoJSON(Bolge.geom).label("gj"),
            func.ST_Area(cast(Bolge.geom, Geography)).label("alan_m2"),
            func.ST_Length(cast(Bolge.geom, Geography)).label("uzunluk_m"),
            func.coalesce(ekip.c.full_name, ekip.c.email).label("worker_ad"),
            yaka_crud.nokta_yakasi_ifadesi(_temsil_noktasi()).label("yaka"),
        )
        .outerjoin(ekip, ekip.c.id == Bolge.worker_id)
        .order_by(Bolge.created_at.desc())
    )


def _noktalar(gj: str, tip: BolgeTipi) -> list[list[tuple[float, float]]]:
    """GeoJSON metnini API'nin halka-listesi sekline cevirir. Alanlarda her
    parcanin YALNIZCA dis halkasi dondurulur: kaydedilen bolgeler kullanicinin
    cizdigi basit alanlardir, delikli poligon uretilmez."""
    geo = json.loads(gj)
    if tip is BolgeTipi.cizgi:
        return [[(float(x), float(y)) for x, y in geo["coordinates"]]]
    parcalar = (
        geo["coordinates"]
        if geo["type"] == "MultiPolygon"
        else [geo["coordinates"]]
    )
    return [[(float(x), float(y)) for x, y in parca[0]] for parca in parcalar]


def _cikti(row) -> BolgeCikti:
    bolge, gj, alan_m2, uzunluk_m, worker_ad, yaka = row
    alan = bolge.tip is BolgeTipi.alan
    return BolgeCikti(
        yaka=yaka,
        id=bolge.id,
        ad=bolge.ad,
        aciklama=bolge.aciklama,
        tip=bolge.tip,
        renk=bolge.renk,
        departman=bolge.departman,
        noktalar=_noktalar(gj, bolge.tip),
        alan_m2=float(alan_m2) if alan and alan_m2 is not None else None,
        uzunluk_m=float(uzunluk_m) if not alan and uzunluk_m is not None else None,
        worker_id=bolge.worker_id,
        worker_ad=worker_ad,
        assigned_at=bolge.assigned_at,
        tamamlandi_at=bolge.tamamlandi_at,
        created_at=bolge.created_at,
        updated_at=bolge.updated_at,
    )


def departman_kosulu(departman: str | None):
    """Bir mudurlugun gorebilecegi bolgelerin kosulu: kendi kayitlari + GENEL
    kayitlar (departman NULL). Genel olanlar disarida birakilsaydi admin'in
    cizdigi bolgeleri kimse goremezdi - admin'in departmani yoktur."""
    return or_(Bolge.departman.is_(None), Bolge.departman == departman)


def list_bolgeler(
    db: Session, departman: str | None = None, sinirli: bool = False
) -> list[BolgeCikti]:
    """Kaydedilmis tum bolgeler/guzergahlar.

    `sinirli=True` (admin disi personel) ise yalnizca `departman`in ve genel
    kayitlar doner: bir mudurlugun cizdigi calisma alanini digeri gormemeli,
    yoksa kendi alakasiz ekibine atayabilir. Bayrak ayri bir parametredir cunku
    `departman=None` iki farkli sey demek olurdu - "admin, hepsini gorsun" ve
    "departmansiz personel, yalnizca genelleri gorsun"."""
    stmt = _select_with_geo()
    if sinirli:
        stmt = stmt.where(departman_kosulu(departman))
    return [_cikti(r) for r in db.execute(stmt).all()]


def list_bolgelerim(db: Session, worker_id: uuid.UUID) -> list[BolgeCikti]:
    """Bir saha ekibine atanmis gorev bolgeleri (kendi ekraninda gorur)."""
    stmt = _select_with_geo().where(Bolge.worker_id == worker_id)
    return [_cikti(r) for r in db.execute(stmt).all()]


def get_bolge(db: Session, bolge_id: uuid.UUID) -> BolgeCikti | None:
    row = db.execute(_select_with_geo().where(Bolge.id == bolge_id)).first()
    return _cikti(row) if row else None


def create_bolge(db: Session, data: BolgeGirdi, actor: User | None) -> BolgeCikti:
    bolge = Bolge(
        ad=data.ad,
        aciklama=data.aciklama,
        tip=data.tip,
        renk=data.renk,
        departman=data.departman,
        geom=_geometri(data.tip, data.noktalar),
        created_by=actor.id if actor else None,
    )
    db.add(bolge)
    db.flush()
    add_log(
        db,
        action=LogAction.bolge_created,
        actor=actor,
        entity_type="bolge",
        entity_id=bolge.id,
        entity_name=bolge.ad,
        detail="Alan" if data.tip is BolgeTipi.alan else "Çizgi",
        departman=bolge.departman,
    )
    # Bir bolge de tekil bakim isi gibi bir gorevdir: kaydedilir kaydedilmez
    # en yakin uygun ekibe gitmeyi dener (mesafe + yaka + mudurluk + kapasite).
    # Uygun ekip yoksa atanmadan bekler ve sonraki dagitimda yeniden denenir.
    assignment_crud.bolge_otomatik_ata(db, bolge)
    db.commit()
    return get_bolge(db, bolge.id)


def update_bolge(
    db: Session, bolge_id: uuid.UUID, data: BolgeGuncelle, actor: User | None
) -> BolgeCikti | None:
    bolge = db.get(Bolge, bolge_id)
    if bolge is None:
        return None
    payload = data.model_dump(exclude_unset=True)
    # Sekil (geometri) ayri ele alinir: ham nokta listesi degil, tipe gore
    # kurulmus bir PostGIS ifadesi yazilir. Kaydin tipi degismez.
    noktalar = payload.pop("noktalar", None)
    for alan, deger in payload.items():
        setattr(bolge, alan, deger)
    if noktalar is not None:
        bolge.geom = _geometri(bolge.tip, noktalar)
    if payload or noktalar is not None:
        add_log(
            db,
            action=LogAction.bolge_updated,
            actor=actor,
            entity_type="bolge",
            entity_id=bolge.id,
            entity_name=bolge.ad,
            detail="Şekil güncellendi" if noktalar is not None else None,
            departman=bolge.departman,
        )
    db.commit()
    return get_bolge(db, bolge_id)


def delete_bolge(db: Session, bolge_id: uuid.UUID, actor: User | None) -> bool:
    bolge = db.get(Bolge, bolge_id)
    if bolge is None:
        return False
    add_log(
        db,
        action=LogAction.bolge_deleted,
        actor=actor,
        entity_type="bolge",
        entity_id=bolge.id,
        entity_name=bolge.ad,
        departman=bolge.departman,
    )
    db.delete(bolge)
    db.commit()
    return True


def ata(
    db: Session,
    bolge_id: uuid.UUID,
    worker: User | None,
    actor: User | None,
) -> BolgeCikti | None:
    """Bolgeyi/guzergahi bir ekibe atar; worker None ise atamayi kaldirir.

    ELLE atama kapasiteyi de yaka/mudurluk kisitlarini da ASMAYA IZIN VERIR:
    yetki personeldedir, arayuz yalnizca uyarir (varlik atamasindaki desenle
    ayni - bkz. routers/saha.py::ata). Kota yalnizca OTOMATIK dagitimda sert
    kisittir. Atama kaldirilirsa kayit havuza doner ama hemen yeniden
    dagitilmaz: amac onu beklemeye almaktir (crud/assignment.py::geri_al ile
    ayni bilincli tercih)."""
    bolge = db.get(Bolge, bolge_id)
    if bolge is None:
        return None
    bolge.worker_id = worker.id if worker else None
    bolge.assigned_at = datetime.now(timezone.utc) if worker else None
    bolge.assigned_by = actor.id if actor and worker else None
    # Yeni atama yeni is demektir: onceki ekibin "tamamlandi" isareti tasinmaz,
    # yoksa bolge yeni ekibin ekraninda bastan bitmis gorunurdu.
    bolge.tamamlandi_at = None
    bolge.tamamlayan_id = None
    add_log(
        db,
        action=LogAction.bolge_assigned,
        actor=actor,
        entity_type="bolge",
        entity_id=bolge.id,
        entity_name=bolge.ad,
        detail=(
            f"{worker.full_name or worker.email} ekibine atandı"
            if worker
            else "Atama kaldırıldı"
        ),
        departman=bolge.departman,
    )
    db.commit()
    return get_bolge(db, bolge_id)


def tamamla(
    db: Session,
    bolge_id: uuid.UUID,
    tamamlandi: bool,
    actor: User | None,
) -> BolgeCikti | None:
    """Bolgeyi/guzergahi tamamlandi (ya da tamamlandi=False ile yeniden acik)
    isaretler. Kayit silinmez: ekip yanlislikla kapattigi isi geri alabilsin."""
    bolge = db.get(Bolge, bolge_id)
    if bolge is None:
        return None
    bolge.tamamlandi_at = datetime.now(timezone.utc) if tamamlandi else None
    bolge.tamamlayan_id = actor.id if (actor and tamamlandi) else None
    add_log(
        db,
        action=LogAction.bolge_completed if tamamlandi else LogAction.bolge_reopened,
        actor=actor,
        entity_type="bolge",
        entity_id=bolge.id,
        entity_name=bolge.ad,
        detail="Tamamlandı" if tamamlandi else "Tamamlama geri alındı",
        departman=bolge.departman,
    )
    # Tamamlanan is kapasite acar: bekleyen varlik/bolge kuyruklari yeniden
    # dagitilir (tekil gorevlerin tamamlanmasindaki desenle ayni).
    if tamamlandi:
        assignment_crud.bekleyen_gorevleri_dagit(db)
    db.commit()
    return get_bolge(db, bolge_id)
