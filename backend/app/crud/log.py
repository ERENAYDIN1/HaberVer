import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models.log import ActivityLog, LogAction
from ..models.user import User


def add_log(
    db: Session,
    *,
    action: LogAction,
    actor: User | None,
    entity_type: str,
    entity_id: uuid.UUID | None = None,
    entity_name: str | None = None,
    detail: str | None = None,
) -> ActivityLog:
    """Log kaydini olusturup session'a ekler; commit cagirmaz - ait oldugu
    islemin (asset/report/user degisikligi) commit'iyle birlikte atomik
    yazilsin diye cagiran taraf commit eder."""
    log = ActivityLog(
        action=action,
        actor_id=actor.id if actor else None,
        actor_name=(actor.full_name or actor.email) if actor else None,
        entity_type=entity_type,
        entity_id=entity_id,
        entity_name=entity_name,
        detail=detail,
    )
    db.add(log)
    return log


def list_logs(db: Session, limit: int = 200) -> list[ActivityLog]:
    stmt = select(ActivityLog).order_by(ActivityLog.created_at.desc()).limit(limit)
    return list(db.execute(stmt).scalars())
