import uuid
from datetime import datetime, timezone

from sqlalchemy import exists, func, select
from sqlalchemy.orm import Session

from ..models.asset import Asset, AssetSource, AssetStatus, AssetType
from ..models.assignment import Assignment, AssignmentStatus
from ..models.log import LogAction
from ..models.talep import Talep, TalepStatus
from ..models.user import User
from . import assignment as assignment_crud
from .log import add_log


def _select_with_coords():
    """Talep satiri + ham seklin GeoJSON'u + temsil noktasinin koordinatlari.

    ST_X/ST_Y dogrudan `geometry` uzerinde calistirilmaz - onlar `nokta`
    sutunundan okunur. Ayrica olusan varligin durumu LEFT JOIN ile gelir:
    vatandas varlik listesini goremedigi icin "Tamir Edildi" bilgisini baska
    turlu ogrenemezdi. `assigned`, onaylanmis bir talepten dogan varligin
    (varsa) aktif bir goreve bagli olup olmadigidir - harita pini de daire
    gibi ayni atama noktasini gostersin diye (bkz. crud/asset.py)."""
    return (
        select(
            Talep,
            func.ST_AsGeoJSON(Talep.geometry).label("geojson"),
            func.ST_X(Talep.temsil_noktasi).label("longitude"),
            func.ST_Y(Talep.temsil_noktasi).label("latitude"),
            Asset.status.label("asset_status"),
            exists(
                select(Assignment.id).where(
                    Assignment.asset_id == Talep.created_asset_id,
                    Assignment.status == AssignmentStatus.atandi,
                )
            ).label("assigned"),
        )
        .outerjoin(Asset, Asset.id == Talep.created_asset_id)
    )


def _geometri(geojson: str):
    return func.ST_SetSRID(func.ST_GeomFromGeoJSON(geojson), 4326)


def get(db: Session, talep_id: uuid.UUID):
    return db.execute(
        _select_with_coords().where(Talep.id == talep_id)
    ).first()


def list_talepler(
    db: Session,
    status: TalepStatus | None = None,
    reporter_id: uuid.UUID | None = None,
    kapsam_turleri: set[AssetType] | None = None,
    gizliler_haric: bool = False,
):
    stmt = _select_with_coords()
    if status is not None:
        stmt = stmt.where(Talep.status == status)
    if reporter_id is not None:
        stmt = stmt.where(Talep.reporter_id == reporter_id)
    # Departman kapsami: None = sinirsiz (admin). Bos kume hicbir satir
    # dondurmez - departmani olmayan personel icin dogru sonuc.
    if kapsam_turleri is not None:
        stmt = stmt.where(Talep.type.in_(kapsam_turleri))
    if gizliler_haric:
        stmt = stmt.where(Talep.reporter_hidden_at.is_(None))
    return db.execute(stmt.order_by(Talep.created_at.desc())).all()


def create_talep(
    db: Session,
    reporter_id: uuid.UUID,
    name: str,
    type_,
    geojson: str,
    note: str | None = None,
    photo_url: str | None = None,
):
    """Vatandas talebi olusturur. `geojson` yalnizca bir Point olabilir; temsil
    noktasi da odur (bkz. migration 0016)."""
    geom = _geometri(geojson)
    talep = Talep(
        reporter_id=reporter_id,
        name=name,
        type=type_,
        note=note,
        geometry=geom,
        temsil_noktasi=geom,
        photo_url=photo_url,
    )
    db.add(talep)
    db.commit()
    return get(db, talep.id)


def gizle(db: Session, talep: Talep, gizli: bool = True):
    """Vatandasin talebi kendi listesinden kaldirmasi/geri getirmesi.

    GERCEK SILME DEGILDIR: onaylanmis bir talep silinseydi ondan olusan varlik,
    saha atamasi ve audit log kayitlari sahipsiz kalirdi. Personel tarafi ve
    log bu islemden hic etkilenmez, bu yuzden ayrica loglanmaz - kullanici
    kendi gorunumunu duzenliyor, sistemde bir sey degistirmiyor."""
    talep.reporter_hidden_at = datetime.now(timezone.utc) if gizli else None
    db.commit()
    return get(db, talep.id)


def approve_talep(
    db: Session,
    talep: Talep,
    reviewer: User,
    yeni_tip: AssetType | None = None,
):
    """Talebi onaylar: 'Bakim Lazim' durumunda yeni bir Asset olusturur ve
    talebi 'onaylandi' olarak isaretleyip olusan varliga baglar.

    `yeni_tip` verilirse (personel onay ekraninda turu duzeltmisse) hem olusan
    varlik hem TALEP KAYDI bu turle yazilir - aksi halde kuyrukta arsivlenen
    talep vatandasin yanlis secimini gostermeye devam ederdi."""
    tur_notu: str | None = None
    if yeni_tip is not None and yeni_tip != talep.type:
        tur_notu = f"Tür düzeltildi: {talep.type.value} → {yeni_tip.value}"
        talep.type = yeni_tip

    asset = Asset(
        name=talep.name,
        type=talep.type,
        status=AssetStatus.bakim_lazim,
        source=AssetSource.ihbar,
        geometry=talep.temsil_noktasi,
        photo_url=talep.photo_url,
    )
    db.add(asset)
    db.flush()  # asset.id'yi almak icin

    talep.status = TalepStatus.onaylandi
    talep.reviewed_by = reviewer.id
    talep.reviewed_at = datetime.now(timezone.utc)
    talep.created_asset_id = asset.id

    # LogAction.report_* degerleri ve entity_type="report" BILINCLI olarak
    # degismedi: bunlar DB'de yazili gecmis veridir (PG enum + mevcut satirlar),
    # yeniden adlandirmak eski audit kayitlarini sahipsiz birakirdi.
    add_log(
        db,
        action=LogAction.report_approved,
        actor=reviewer,
        entity_type="report",
        entity_id=talep.id,
        entity_name=talep.name,
        detail=tur_notu,
        tur=talep.type,
    )
    add_log(
        db,
        action=LogAction.asset_created,
        actor=reviewer,
        entity_type="asset",
        entity_id=asset.id,
        entity_name=asset.name,
        detail="Talepten oluşturuldu",
        tur=asset.type,
    )

    # Olusan bakim varligini en yakin uygun saha ekibine otomatik yonlendir.
    # Uygun ekip yoksa (hepsi dolu / konumu yok) varlik atanmadan kalir;
    # personel daha sonra elle atayabilir.
    ekip = assignment_crud.en_yakin_uygun_ekip(db, asset.geometry, asset.type)
    if ekip is not None:
        assignment_crud.ata(db, asset, ekip, assigned_by=None)

    db.commit()
    return get(db, talep.id)


def reject_talep(
    db: Session,
    talep: Talep,
    reviewer: User,
    review_note: str | None = None,
):
    talep.status = TalepStatus.reddedildi
    talep.reviewed_by = reviewer.id
    talep.reviewed_at = datetime.now(timezone.utc)
    talep.review_note = review_note

    add_log(
        db,
        action=LogAction.report_rejected,
        actor=reviewer,
        entity_type="report",
        entity_id=talep.id,
        entity_name=talep.name,
        detail=review_note,
        tur=talep.type,
    )
    db.commit()
    return get(db, talep.id)


def reopen_talep(db: Session, talep: Talep, reviewer: User):
    """Reddedilen bir talebin reddini geri alir: kayit 'beklemede'ye doner ve
    inceleme izleri (kim/ne zaman/ret nedeni) temizlenir - talep, hic
    sonuclandirilmamis gibi kuyruga geri girer ve tekrar onaylanabilir.

    Onaylanmis talepler icin cagrilmaz (router 409 doner): onay bir varlik
    olusturdugundan geri alinmasi o varligi ve atamasini da bozardi."""
    talep.status = TalepStatus.beklemede
    talep.reviewed_by = None
    talep.reviewed_at = None
    talep.review_note = None

    add_log(
        db,
        action=LogAction.report_reopened,
        actor=reviewer,
        entity_type="report",
        entity_id=talep.id,
        entity_name=talep.name,
        detail="Ret geri alındı",
        tur=talep.type,
    )
    db.commit()
    return get(db, talep.id)
