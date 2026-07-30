import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class LogAction(str, enum.Enum):
    asset_created = "asset_created"
    asset_updated = "asset_updated"
    asset_status_changed = "asset_status_changed"
    asset_deleted = "asset_deleted"
    report_approved = "report_approved"
    report_rejected = "report_rejected"
    # Reddedilen ihbarin reddi geri alinip tekrar "beklemede"ye dondurulmesi.
    report_reopened = "report_reopened"
    user_created = "user_created"
    user_updated = "user_updated"
    assignment_created = "assignment_created"
    assignment_completed = "assignment_completed"
    assignment_cancelled = "assignment_cancelled"
    bolge_created = "bolge_created"
    bolge_updated = "bolge_updated"
    bolge_deleted = "bolge_deleted"
    # Gorev bolgesinin bir ekibe atanmasi VE atamanin kaldirilmasi (detayda yazar).
    bolge_assigned = "bolge_assigned"
    # Saha ekibinin bolgeyi/guzergahi tamamlamasi ve tamamlamayi geri almasi.
    bolge_completed = "bolge_completed"
    bolge_reopened = "bolge_reopened"


class ActivityLog(Base):
    """Sistemdeki islemlerin (varlik ekleme/guncelleme/silme, durum degisimi,
    ihbar onay/ret, personel ekleme) audit log kaydi. Kim, ne zaman, ne
    yaptigini tutar - CLAUDE.md'deki 'bakim gecmisi' gereksinimi."""

    __tablename__ = "activity_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    action: Mapped[LogAction] = mapped_column(
        Enum(LogAction, name="log_action"), nullable=False
    )
    # Kullanici silinirse (ileride) kayit kaybolmasin diye ada da anlik kopya
    # (snapshot) tutulur; actor_id SET NULL olsa bile actor_name kalir.
    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    actor_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False)
    entity_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    entity_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    detail: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
