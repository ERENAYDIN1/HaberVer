"""Kimlik dogrulamanin Keycloak'a tasinmasi

Uc degisiklik:

1. `users.keycloak_id` - yerel satirla Keycloak kullanicisinin baglantisi.
   `users.id` DEGISMEZ: ona bagli 10 yabanci anahtar var (assignments,
   gorev_bolgeleri, reports, logs) ve birincil anahtari yeniden yazmanin
   hicbir kazanci yok. Bos (NULL) birakilan satirlar ilk giriste e-posta
   uzerinden eslenip doldurulur (bkz. crud/user.py::keycloak_eslestir).
2. `users.hashed_password` DUSURULUR. Parolalar artik Keycloak'ta; auth
   tasindiktan sonra elde parola hash'i tutmak olu kimlik bilgisi riskidir.
   (Baseline 0001 dondurulmus oldugu icin kolonu hala olusturur, burada
   dusuruyoruz.)
3. `sessions` tablosu - BFF oturumlari. Tarayici yalnizca oturum id'sini
   tasiyan httpOnly cookie'yi gorur, Keycloak token'lari bu satirda kalir.

Revision ID: 0006
Revises: 0005
Create Date: 2026-07-30

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("keycloak_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_unique_constraint("uq_users_keycloak_id", "users", ["keycloak_id"])
    op.drop_column("users", "hashed_password")

    op.create_table(
        "sessions",
        sa.Column(
            "id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "user_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("access_token", sa.Text(), nullable=False),
        sa.Column("refresh_token", sa.Text(), nullable=True),
        sa.Column("id_token", sa.Text(), nullable=True),
        sa.Column("keycloak_sid", sa.String(64), nullable=True),
        sa.Column("token_expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "last_used_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index("ix_sessions_user_id", "sessions", ["user_id"])
    # Suresi gecmis oturumlarin toplu temizligi icin.
    op.create_index("ix_sessions_expires_at", "sessions", ["expires_at"])


def downgrade() -> None:
    op.drop_table("sessions")
    # Geri donuste parola kolonu bos bir dizgiyle geri gelir: eski parolalar
    # kurtarilamaz (zaten kurtarilmamalidir), hesaplar yeniden acilmalidir.
    op.add_column(
        "users",
        sa.Column("hashed_password", sa.String(255), nullable=False, server_default=""),
    )
    op.drop_constraint("uq_users_keycloak_id", "users", type_="unique")
    op.drop_column("users", "keycloak_id")
