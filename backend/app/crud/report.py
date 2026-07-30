import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models.asset import Asset, AssetSource, AssetStatus, AssetType
from ..models.log import LogAction
from ..models.report import Report, ReportStatus
from ..models.user import User
from . import assignment as assignment_crud
from .log import add_log


def _select_with_coords():
    return select(
        Report,
        func.ST_X(Report.geometry).label("longitude"),
        func.ST_Y(Report.geometry).label("latitude"),
    )


def _point(longitude: float, latitude: float):
    return func.ST_SetSRID(func.ST_MakePoint(longitude, latitude), 4326)


def get(db: Session, report_id: uuid.UUID):
    return db.execute(
        _select_with_coords().where(Report.id == report_id)
    ).first()


def list_reports(
    db: Session,
    status: ReportStatus | None = None,
    reporter_id: uuid.UUID | None = None,
):
    stmt = _select_with_coords()
    if status is not None:
        stmt = stmt.where(Report.status == status)
    if reporter_id is not None:
        stmt = stmt.where(Report.reporter_id == reporter_id)
    return db.execute(stmt.order_by(Report.created_at.desc())).all()


def create_report(
    db: Session,
    reporter_id: uuid.UUID,
    name: str,
    type_,
    longitude: float,
    latitude: float,
    note: str | None = None,
    photo_url: str | None = None,
):
    report = Report(
        reporter_id=reporter_id,
        name=name,
        type=type_,
        note=note,
        geometry=_point(longitude, latitude),
        photo_url=photo_url,
    )
    db.add(report)
    db.commit()
    return get(db, report.id)


def approve_report(
    db: Session,
    report: Report,
    reviewer: User,
    yeni_tip: AssetType | None = None,
):
    """Ihbari onaylar: 'Bakim Lazim' durumunda yeni bir Asset olusturur ve
    ihbari 'onaylandi' olarak isaretleyip olusan varliga baglar.

    `yeni_tip` verilirse (personel onay ekraninda turu duzeltmisse) hem olusan
    varlik hem IHBAR KAYDI bu turle yazilir - aksi halde kuyrukta arsivlenen
    ihbar vatandasin yanlis secimini gostermeye devam ederdi."""
    tur_notu: str | None = None
    if yeni_tip is not None and yeni_tip != report.type:
        tur_notu = f"Tür düzeltildi: {report.type.value} → {yeni_tip.value}"
        report.type = yeni_tip

    asset = Asset(
        name=report.name,
        type=report.type,
        status=AssetStatus.bakim_lazim,
        source=AssetSource.ihbar,
        geometry=report.geometry,
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
    )
    add_log(
        db,
        action=LogAction.asset_created,
        actor=reviewer,
        entity_type="asset",
        entity_id=asset.id,
        entity_name=asset.name,
        detail="İhbardan oluşturuldu",
    )

    # Olusan bakim varligini en yakin uygun saha ekibine otomatik yonlendir.
    # Uygun ekip yoksa (hepsi dolu / konumu yok) varlik atanmadan kalir;
    # personel daha sonra elle atayabilir.
    ekip = assignment_crud.en_yakin_uygun_ekip(db, asset.geometry)
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
    )
    db.commit()
    return get(db, report.id)


def reopen_report(db: Session, report: Report, reviewer: User):
    """Reddedilen bir ihbarin reddini geri alir: kayit 'beklemede'ye doner ve
    inceleme izleri (kim/ne zaman/ret nedeni) temizlenir - ihbar, hic
    sonuclandirilmamis gibi kuyruga geri girer ve tekrar onaylanabilir.

    Onaylanmis ihbarlar icin cagrilmaz (router 409 doner): onay bir varlik
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
    )
    db.commit()
    return get(db, report.id)
