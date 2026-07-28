"""'bank' turunu tamamen kaldir

Bank varliklari artik hic takip edilmiyor (ne kayitli ne ihbar). Kalan tum
bank varliklari ve bank ihbarlari silinir, ardindan asset_type enum'u 'bank'
degeri olmadan yeniden olusturulur. Enum hem assets.type hem reports.type
tarafindan kullanildigindan iki kolon da yeni tipe cast edilir.

Revision ID: 0010
Revises: 0009
Create Date: 2026-07-28

"""
from typing import Sequence, Union

from alembic import op

revision: str = "0010"
down_revision: Union[str, None] = "0009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1) Kalan bank verisini temizle. assignments ON DELETE CASCADE ile,
    #    reports.created_asset_id ise ON DELETE SET NULL ile otomatik yonetilir.
    op.execute("DELETE FROM assets WHERE type = 'bank'")
    op.execute("DELETE FROM reports WHERE type = 'bank'")

    # 2) asset_type enum'unu 'bank' olmadan yeniden olustur. Postgres tek bir
    #    enum degerini dogrudan silemedigi icin tip yeniden yaratilir ve iki
    #    kolon da yeni tipe cast edilir (artik 'bank' satiri kalmadigindan cast
    #    guvenli).
    op.execute("ALTER TYPE asset_type RENAME TO asset_type_old")
    op.execute("CREATE TYPE asset_type AS ENUM ('agac', 'direk', 'sulama')")
    op.execute(
        "ALTER TABLE assets ALTER COLUMN type TYPE asset_type "
        "USING type::text::asset_type"
    )
    op.execute(
        "ALTER TABLE reports ALTER COLUMN type TYPE asset_type "
        "USING type::text::asset_type"
    )
    op.execute("DROP TYPE asset_type_old")


def downgrade() -> None:
    # 'bank' enum degerini geri ekle (silinen veriler geri gelmez).
    op.execute("ALTER TYPE asset_type ADD VALUE IF NOT EXISTS 'bank'")
