import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models.asset import Asset, AssetSource, AssetStatus
from ..models.report import Report, ReportStatus


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


def approve_report(db: Session, report: Report, reviewer_id: uuid.UUID):
    """Ihbari onaylar: 'Bakim Lazim' durumunda yeni bir Asset olusturur ve
    ihbari 'onaylandi' olarak isaretleyip olusan varliga baglar."""
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
    report.reviewed_by = reviewer_id
    report.reviewed_at = datetime.now(timezone.utc)
    report.created_asset_id = asset.id
    db.commit()
    return get(db, report.id)


def reject_report(
    db: Session,
    report: Report,
    reviewer_id: uuid.UUID,
    review_note: str | None = None,
):
    report.status = ReportStatus.reddedildi
    report.reviewed_by = reviewer_id
    report.reviewed_at = datetime.now(timezone.utc)
    report.review_note = review_note
    db.commit()
    return get(db, report.id)
