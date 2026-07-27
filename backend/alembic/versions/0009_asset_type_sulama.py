"""asset_type enum'una 'sulama' ekle + kayitli banklari kaldir

Banklar proaktif takip edilmez (durup dururken kontrol edilmez); yalnizca
vatandas ihbari geldiginde bakilir. Bu yuzden kayitli (source='kayitli') bank
varliklari kaldirilir ve yerine proaktif izlenen 'sulama' (sulama sistemi)
turu eklenir. 'bank' enum degeri, ihbar akisi icin KORUNUR.

Revision ID: 0009
Revises: 0008
Create Date: 2026-07-27

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0009"
down_revision: Union[str, None] = "0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()

    # 1) asset_type enum'una 'sulama' degeri. Ayni migration icinde seed'de
    #    kullanabilmek icin autocommit_block ile ONCE commit edilir (Postgres
    #    yeni enum degerini ekleyen transaction kapanmadan kullandirmaz).
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE asset_type ADD VALUE IF NOT EXISTS 'sulama'")

    # 2) Kayitli bank varliklarini kaldir. Iliskili aktif gorevler assignments
    #    tablosundaki ON DELETE CASCADE ile otomatik silinir. Ihbar kaynakli
    #    banklar (source='ihbar') dokunulmadan korunur.
    op.execute("DELETE FROM assets WHERE type = 'bank' AND source = 'kayitli'")

    # 3) Silinen banklarin yerine ornek sulama varliklari (idempotent).
    sulama = [
        ("Kadıköy Moda Parkı Sulama Hattı", 29.0265, 40.9885),
        ("Beşiktaş Sahil Sulama Vanası", 29.0060, 41.0435),
        ("Bakırköy Botanik Sulama Sistemi", 28.8710, 40.9800),
    ]
    for ad, lon, lat in sulama:
        bind.execute(
            sa.text(
                """
                INSERT INTO assets (name, type, status, source, geometry)
                SELECT :ad, CAST(:tip AS asset_type), 'bakim_lazim', 'kayitli',
                       ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)
                WHERE NOT EXISTS (
                    SELECT 1 FROM assets WHERE name = :ad AND source = 'kayitli'
                )
                """
            ).bindparams(ad=ad, tip="sulama", lon=lon, lat=lat)
        )


def downgrade() -> None:
    # Not: Silinen kayitli bank varliklari ve asset_type enum'una eklenen
    # 'sulama' degeri Postgres'te geri alinamaz; birakilir. Seed edilen sulama
    # varliklari elle silinebilir.
    pass
