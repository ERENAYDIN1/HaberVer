"""create activity_logs table (audit log)

Revision ID: 0005
Revises: 0004
Create Date: 2026-07-23

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    log_action = postgresql.ENUM(
        "asset_created",
        "asset_updated",
        "asset_status_changed",
        "asset_deleted",
        "report_approved",
        "report_rejected",
        "user_created",
        name="log_action",
        create_type=False,
    )
    log_action.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "activity_logs",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            primary_key=True,
        ),
        sa.Column("action", log_action, nullable=False),
        sa.Column(
            "actor_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("actor_name", sa.String(255), nullable=True),
        sa.Column("entity_type", sa.String(50), nullable=False),
        sa.Column("entity_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("entity_name", sa.String(255), nullable=True),
        sa.Column("detail", sa.String(500), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "idx_activity_logs_created_at", "activity_logs", ["created_at"]
    )


def downgrade() -> None:
    op.drop_index("idx_activity_logs_created_at", table_name="activity_logs")
    op.drop_table("activity_logs")
    postgresql.ENUM(name="log_action").drop(op.get_bind(), checkfirst=True)
