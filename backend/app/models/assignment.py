import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Text, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class AssignmentStatus(str, enum.Enum):
    atandi = "atandi"
    tamamlandi = "tamamlandi"
    iptal = "iptal"


class Assignment(Base):
    """Bir 'bakim_lazim' varligin bir saha calisanina (ekibe) atanmasi - is emri.
    Varlik 'iyi'ye cekilince gorev 'tamamlandi', baska ekibe yonlendirilince
    eskisi 'iptal' olur. Her varligin ayni anda tek aktif ('atandi') gorevi
    olur (kismi tekil indeks). Ekip = saha_calisani hesabi (worker_id)."""

    __tablename__ = "assignments"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    asset_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("assets.id", ondelete="CASCADE"), nullable=False
    )
    worker_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    status: Mapped[AssignmentStatus] = mapped_column(
        Enum(AssignmentStatus, name="assignment_status"),
        nullable=False,
        server_default=AssignmentStatus.atandi.value,
    )
    # Elle atayan personel; NULL ise otomatik (en yakin ekibe) atanmistir.
    assigned_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
