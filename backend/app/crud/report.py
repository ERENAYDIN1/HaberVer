import uuid
from datetime import datetime, timezone

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from ..models.asset import Asset, AssetSource, AssetStatus, AssetType
from ..models.log import LogAction
from ..models.report import Report, ReportStatus
from ..models.user import User
from . import assignment as assignment_crud
from .log import add_log


def _select_with_coords():
    """Talep satiri + ham seklin GeoJSON'u + temsil noktasinin koordinatlari.

    Geometri artik nokta olmak zorunda olmadigi icin (cizgi/alan da olabilir)
    ST_X/ST_Y dogrudan `geometry` uzerinde calistirilmaz - onlar `nokta`
    sutunundan okunur. Ayrica olusan varligin durumu LEFT JOIN ile gelir:
    vatandas varlik listesini goremedigi icin "Tamir Edildi" bilgisini baska
    turlu ogrenemezdi."""
    return (
        select(
            Report,
            func.ST_AsGeoJSON(Report.geometry).label("geojson"),
            func.ST_X(Report.temsil_noktasi).label("longitude"),
            func.ST_Y(Report.temsil_noktasi).label("latitude"),
            Asset.status.label("asset_status"),
        )
        .outerjoin(Asset, Asset.id == Report.created_asset_id)
    )


def _geometri(geojson: str):
    return func.ST_SetSRID(func.ST_GeomFromGeoJSON(geojson), 4326)


def temsil_nokta(geom):
    """Seklin temsil noktasi. Poligonda ST_PointOnSurface (centroid U seklindeki
    bir alanda seklin DISINA dusebilir), cizgide hattin tam ortasi (nokta
    ortalamasi L seklindeki bir rotada hattin hic gecmedigi yere duserdi).
    Migration 0008'deki ifadeyle ayni kural."""
    return case(
        (func.GeometryType(geom) == "POINT", geom),
        (func.GeometryType(geom) == "LINESTRING", func.ST_LineInterpolatePoint(geom, 0.5)),
        else_=func.ST_PointOnSurface(geom),
    )


def get(db: Session, report_id: uuid.UUID):
    return db.execute(
        _select_with_coords().where(Report.id == report_id)
    ).first()


def list_reports(
    db: Session,
    status: ReportStatus | None = None,
    reporter_id: uuid.UUID | None = None,
    kapsam_turleri: set[AssetType] | None = None,
    gizliler_haric: bool = False,
):
    stmt = _select_with_coords()
    if status is not None:
        stmt = stmt.where(Report.status == status)
    if reporter_id is not None:
        stmt = stmt.where(Report.reporter_id == reporter_id)
    # Departman kapsami: None = sinirsiz (admin). Bos kume hicbir satir
    # dondurmez - departmani olmayan personel icin dogru sonuc.
    if kapsam_turleri is not None:
        stmt = stmt.where(Report.type.in_(kapsam_turleri))
    if gizliler_haric:
        stmt = stmt.where(Report.reporter_hidden_at.is_(None))
    return db.execute(stmt.order_by(Report.created_at.desc())).all()


def create_report(
    db: Session,
    reporter_id: uuid.UUID,
    name: str,
    type_,
    geojson: str,
    note: str | None = None,
    photo_url: str | None = None,
):
    """Vatandas talebi olusturur. `geojson` bir Point, LineString veya Polygon
    olabilir; temsil noktasi PostGIS tarafinda turetilir (tek kaynak)."""
    geom = _geometri(geojson)
    report = Report(
        reporter_id=reporter_id,
        name=name,
        type=type_,
        note=note,
        geometry=geom,
        temsil_noktasi=temsil_nokta(geom),
        photo_url=photo_url,
    )
    db.add(report)
    db.commit()
    return get(db, report.id)


def gizle(db: Session, report: Report, gizli: bool = True):
    """Vatandasin talebi kendi listesinden kaldirmasi/geri getirmesi.

    GERCEK SILME DEGILDIR: onaylanmis bir talep silinseydi ondan olusan varlik,
    saha atamasi ve audit log kayitlari sahipsiz kalirdi. Personel tarafi ve
    log bu islemden hic etkilenmez, bu yuzden ayrica loglanmaz - kullanici
    kendi gorunumunu duzenliyor, sistemde bir sey degistirmiyor."""
    report.reporter_hidden_at = datetime.now(timezone.utc) if gizli else None
    db.commit()
    return get(db, report.id)


def approve_report(
    db: Session,
    report: Report,
    reviewer: User,
    yeni_tip: AssetType | None = None,
):
    """Talebi onaylar: 'Bakim Lazim' durumunda yeni bir Asset olusturur ve
    talebi 'onaylandi' olarak isaretleyip olusan varliga baglar.

    `yeni_tip` verilirse (personel onay ekraninda turu duzeltmisse) hem olusan
    varlik hem TALEP KAYDI bu turle yazilir - aksi halde kuyrukta arsivlenen
    talep vatandasin yanlis secimini gostermeye devam ederdi."""
    tur_notu: str | None = None
    if yeni_tip is not None and yeni_tip != report.type:
        tur_notu = f"Tür düzeltildi: {report.type.value} → {yeni_tip.value}"
        report.type = yeni_tip

    # Varlik her zaman NOKTADIR: talep bir cizgi/alan olsa bile envanter,
    # otomatik atamanin mesafe hesabi ve harita isaretcisi tek nokta uzerinden
    # calisir. Ham sekil `reports.geometry`de belge olarak durmaya devam eder.
    asset = Asset(
        name=report.name,
        type=report.type,
        status=AssetStatus.bakim_lazim,
        source=AssetSource.ihbar,
        geometry=report.temsil_noktasi,
        photo_url=report.photo_url,
    )
    db.add(asset)
    db.flush()  # asset.id'yi almak icin

    report.status = ReportStatus.onaylandi
    report.reviewed_by = reviewer.id
    report.reviewed_at = datetime.now(timezone.utc)
    report.created_asset_id = asset.id

    add_log(
        db,
        action=LogAction.report_approved,
        actor=reviewer,
        entity_type="report",
        entity_id=report.id,
        entity_name=report.name,
        detail=tur_notu,
        tur=report.type,
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
    return get(db, report.id)


def reject_report(
    db: Session,
    report: Report,
    reviewer: User,
    review_note: str | None = None,
):
    report.status = ReportStatus.reddedildi
    report.reviewed_by = reviewer.id
    report.reviewed_at = datetime.now(timezone.utc)
    report.review_note = review_note

    add_log(
        db,
        action=LogAction.report_rejected,
        actor=reviewer,
        entity_type="report",
        entity_id=report.id,
        entity_name=report.name,
        detail=review_note,
        tur=report.type,
    )
    db.commit()
    return get(db, report.id)


def reopen_report(db: Session, report: Report, reviewer: User):
    """Reddedilen bir talebin reddini geri alir: kayit 'beklemede'ye doner ve
    inceleme izleri (kim/ne zaman/ret nedeni) temizlenir - talep, hic
    sonuclandirilmamis gibi kuyruga geri girer ve tekrar onaylanabilir.

    Onaylanmis talepler icin cagrilmaz (router 409 doner): onay bir varlik
    olusturdugundan geri alinmasi o varligi ve atamasini da bozardi."""
    report.status = ReportStatus.beklemede
    report.reviewed_by = None
    report.reviewed_at = None
    report.review_note = None

    add_log(
        db,
        action=LogAction.report_reopened,
        actor=reviewer,
        entity_type="report",
        entity_id=report.id,
        entity_name=report.name,
        detail="Ret geri alındı",
        tur=report.type,
    )
    db.commit()
    return get(db, report.id)
