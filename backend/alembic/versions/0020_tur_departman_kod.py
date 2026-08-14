"""tur_departman join tablosu kaldirildi, turler.departman_kod kolonu eklendi

`tur_departman` (tur PK -> departman_kod) 1-1 bir iliskiyi ayri bir tabloda
tutuyordu; her turun tam olarak bir departmani var, dolayisiyla join tablosu
gereksiz dolaylamaydi. Ayni iliski artik dogrudan `turler.departman_kod`
kolonunda - `users.departman`/`users.yaka` ile ayni desen.

`departman_kod` NOT NULL: hicbir kod yolu departmansiz tur uretmiyor
(TurCreate.departman zorunlu alan, crud.tur.create() turu ve yonlendirmesini
hep tek islemde yaziyordu). FK RESTRICT davranisi (bir departman, ona bagli
turler varken silinemez) aynen korunur.

Revision ID: 0020
Revises: 0019
Create Date: 2026-08-14

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0020"
down_revision: Union[str, None] = "0019"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("turler", sa.Column("departman_kod", sa.String(32), nullable=True))

    op.execute(
        """
        UPDATE turler
           SET departman_kod = tur_departman.departman_kod
          FROM tur_departman
         WHERE turler.kod = tur_departman.tur
        """
    )

    bos = (
        op.get_bind()
        .execute(sa.text("SELECT kod FROM turler WHERE departman_kod IS NULL"))
        .scalars()
        .all()
    )
    if bos:
        raise RuntimeError(
            "Departmansiz tur(ler) bulundu, NOT NULL'a gecilemiyor: "
            + ", ".join(bos)
        )

    op.alter_column("turler", "departman_kod", nullable=False)
    op.create_foreign_key(
        "fk_turler_departman_kod_departmanlar",
        "turler",
        "departmanlar",
        ["departman_kod"],
        ["kod"],
        ondelete="RESTRICT",
    )

    op.drop_table("tur_departman")


def downgrade() -> None:
    op.create_table(
        "tur_departman",
        sa.Column("tur", sa.String(32), nullable=False),
        sa.Column("departman_kod", sa.String(32), nullable=False),
        sa.ForeignKeyConstraint(
            ["tur"], ["turler.kod"], name="fk_tur_departman_tur_turler", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["departman_kod"], ["departmanlar.kod"], ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("tur", name="tur_departman_pkey"),
    )
    op.execute(
        """
        INSERT INTO tur_departman (tur, departman_kod)
        SELECT kod, departman_kod FROM turler
        """
    )
    op.drop_constraint(
        "fk_turler_departman_kod_departmanlar", "turler", type_="foreignkey"
    )
    op.drop_column("turler", "departman_kod")
