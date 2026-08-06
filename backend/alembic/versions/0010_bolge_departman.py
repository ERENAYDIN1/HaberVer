"""Gorev bolgeleri / guzergahlar mudurluge baglandi

Talepler ve varliklar TURLERI uzerinden bir mudurluge dusuyordu, ama harita
uzerinde cizilip kaydedilen alanlar/guzergahlar herkese acikti: Fen Isleri'nin
cizdigi bir asfalt guzergahini Park ve Bahceler de goruyor ve kendi ekibine
atayabiliyordu. Bolgenin bir turu olmadigi icin kapsam tur uzerinden
cozulemez - bu yuzden mudurluk kaydin KENDI sutununda durur.

NULL bilincli olarak "genel" demektir (tum personel gorur), "sahipsiz" degil:
admin'in departmani olmadigi icin onun cizdigi bolgeler dogal olarak NULL
kalir ve bunlarin herkese kapanmasi ilk kurulumda tum bolgeleri gorunmez
yapardi.

Revision ID: 0010
Revises: 0009
Create Date: 2026-08-06

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0010"
down_revision: Union[str, None] = "0009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "gorev_bolgeleri",
        sa.Column(
            "departman",
            sa.String(32),
            sa.ForeignKey("departmanlar.kod"),
            nullable=True,
        ),
    )
    # Mevcut kayitlar OLUSTURANIN mudurlugune baglanir: kaydi cizen kisi zaten
    # kendi isi icin cizmisti. Olusturani silinmis ya da admin olan kayitlar
    # NULL (genel) kalir.
    op.execute(
        """
        UPDATE gorev_bolgeleri b
           SET departman = u.departman
          FROM users u
         WHERE u.id = b.created_by AND u.departman IS NOT NULL
        """
    )
    op.create_index(
        "ix_gorev_bolgeleri_departman", "gorev_bolgeleri", ["departman"]
    )


def downgrade() -> None:
    op.drop_index("ix_gorev_bolgeleri_departman", table_name="gorev_bolgeleri")
    op.drop_column("gorev_bolgeleri", "departman")
