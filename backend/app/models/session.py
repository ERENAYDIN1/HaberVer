import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class Session(Base):
    """Bir tarayici oturumu. Keycloak token'lari BURADA durur; tarayiciya
    yalnizca bu satirin id'sini tasiyan httpOnly cookie gider (BFF deseni).
    Boylece XSS ile calinabilecek bir token yoktur ve cikis gercek anlamda
    iptal demektir (satir silinir).

    `refresh_token` saklanir cunku iki isi vardir: (1) access token'i yenilemek,
    (2) yenileme basarisiz olunca Keycloak tarafinda oturumun iptal edildigini
    anlamak - yetki degisikligi bize bu yolla yansir.
    """

    __tablename__ = "sessions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    access_token: Mapped[str] = mapped_column(Text, nullable=False)
    refresh_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Cikista Keycloak oturumunu da kapatmak icin (id_token_hint).
    id_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Keycloak'taki oturum id'si (`sid`) - ayni oturumun izini surmek icin.
    keycloak_sid: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # Access token'in son kullanma ani; gectiginde refresh ile yenilenir ve
    # ayni anda roller Keycloak'tan tazelenir.
    token_expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    # Oturumun mutlak son kullanma ani (yenilemeden bagimsiz ust sinir).
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    last_used_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
