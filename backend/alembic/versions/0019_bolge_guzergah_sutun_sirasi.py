"""bolgeler/guzergahlar fiziksel sutun sirasi duzenlendi

Postgres ADD COLUMN her zaman sona ekler; alan_m2/uzunluk_m (0018) bu yuzden
tablonun sonunda kalmisti. Sutun sirasi sorgu/API davranisini etkilemez, ama
psql \\d / pgAdmin gibi araclarda okunurlugu bozuyordu. Tek yol tabloyu
yeniden olusturmak: gecici tablo istenen sirayla acilir, veri kopyalanir,
eski tablo silinir, yenisi adi alir.

Yeni sira: id, ad, aciklama, renk, departman, geom, alan_m2(/uzunluk_m),
worker_id, assigned_at, assigned_by, tamamlandi_at, tamamlayan_id,
created_by, created_at, updated_at - kimlik -> temel bilgi -> geometri+olcu
-> atama -> zaman damgalari.

Revision ID: 0019
Revises: 0018
Create Date: 2026-08-14

"""
from typing import Sequence, Union

from alembic import op

revision: str = "0019"
down_revision: Union[str, None] = "0018"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _yeniden_olustur(
    tablo: str, geom_tipi: str, olcu_sutunu: str, olcu_ifadesi: str
) -> None:
    op.execute(
        f"""
        CREATE TABLE {tablo}_yeni (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            ad varchar(120) NOT NULL,
            aciklama text,
            renk varchar(9) NOT NULL,
            departman varchar(32) REFERENCES departmanlar(kod),
            geom geometry({geom_tipi}, 4326) NOT NULL,
            {olcu_sutunu} double precision NOT NULL,
            worker_id uuid REFERENCES users(id) ON DELETE SET NULL,
            assigned_at timestamptz,
            assigned_by uuid REFERENCES users(id) ON DELETE SET NULL,
            tamamlandi_at timestamptz,
            tamamlayan_id uuid REFERENCES users(id) ON DELETE SET NULL,
            created_by uuid REFERENCES users(id) ON DELETE SET NULL,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        f"""
        INSERT INTO {tablo}_yeni
               (id, ad, aciklama, renk, departman, geom, {olcu_sutunu},
                worker_id, assigned_at, assigned_by, tamamlandi_at,
                tamamlayan_id, created_by, created_at, updated_at)
        SELECT id, ad, aciklama, renk, departman, geom, {olcu_ifadesi},
               worker_id, assigned_at, assigned_by, tamamlandi_at,
               tamamlayan_id, created_by, created_at, updated_at
          FROM {tablo}
        """
    )
    op.execute(f"DROP TABLE {tablo}")
    op.execute(f"ALTER TABLE {tablo}_yeni RENAME TO {tablo}")
    _kisitlari_yeniden_adlandir(tablo, "_yeni")

    op.create_index(f"idx_{tablo}_geom", tablo, ["geom"], postgresql_using="gist")
    op.create_index(f"idx_{tablo}_worker", tablo, ["worker_id"])
    op.create_index(f"ix_{tablo}_departman", tablo, ["departman"])


def _kisitlari_yeniden_adlandir(tablo: str, onek: str) -> None:
    """RENAME TABLE kisit adlarini otomatik degistirmez (Postgres kisit adi
    tablo adindan turer ama sonradan senkron kalmaz); adlar {tablo}{onek}_...
    seklinde asili kalmasin diye tek tek düzeltilir."""
    for kisit, hedef in (
        (f"{tablo}{onek}_pkey", f"{tablo}_pkey"),
        (f"{tablo}{onek}_assigned_by_fkey", f"{tablo}_assigned_by_fkey"),
        (f"{tablo}{onek}_created_by_fkey", f"{tablo}_created_by_fkey"),
        (f"{tablo}{onek}_departman_fkey", f"{tablo}_departman_fkey"),
        (f"{tablo}{onek}_tamamlayan_id_fkey", f"{tablo}_tamamlayan_id_fkey"),
        (f"{tablo}{onek}_worker_id_fkey", f"{tablo}_worker_id_fkey"),
    ):
        op.execute(f"ALTER TABLE {tablo} RENAME CONSTRAINT {kisit} TO {hedef}")


def upgrade() -> None:
    _yeniden_olustur("bolgeler", "MULTIPOLYGON", "alan_m2", "alan_m2")
    _yeniden_olustur("guzergahlar", "LINESTRING", "uzunluk_m", "uzunluk_m")


def downgrade() -> None:
    # Sutun sirasi API/sorgu davranisini etkilemedigi icin geri donus de ayni
    # yontemle (eski sirayi geri kurarak) yapilir; veri kaybi yok.
    _yeniden_olustur_eski("bolgeler", "MULTIPOLYGON", "alan_m2")
    _yeniden_olustur_eski("guzergahlar", "LINESTRING", "uzunluk_m")


def _yeniden_olustur_eski(tablo: str, geom_tipi: str, olcu_sutunu: str) -> None:
    op.execute(
        f"""
        CREATE TABLE {tablo}_eski (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            ad varchar(120) NOT NULL,
            aciklama text,
            renk varchar(9) NOT NULL,
            departman varchar(32) REFERENCES departmanlar(kod),
            worker_id uuid REFERENCES users(id) ON DELETE SET NULL,
            assigned_at timestamptz,
            assigned_by uuid REFERENCES users(id) ON DELETE SET NULL,
            tamamlandi_at timestamptz,
            tamamlayan_id uuid REFERENCES users(id) ON DELETE SET NULL,
            created_by uuid REFERENCES users(id) ON DELETE SET NULL,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now(),
            geom geometry({geom_tipi}, 4326) NOT NULL,
            {olcu_sutunu} double precision NOT NULL
        )
        """
    )
    op.execute(
        f"""
        INSERT INTO {tablo}_eski
               (id, ad, aciklama, renk, departman, worker_id, assigned_at,
                assigned_by, tamamlandi_at, tamamlayan_id, created_by,
                created_at, updated_at, geom, {olcu_sutunu})
        SELECT id, ad, aciklama, renk, departman, worker_id, assigned_at,
               assigned_by, tamamlandi_at, tamamlayan_id, created_by,
               created_at, updated_at, geom, {olcu_sutunu}
          FROM {tablo}
        """
    )
    op.execute(f"DROP TABLE {tablo}")
    op.execute(f"ALTER TABLE {tablo}_eski RENAME TO {tablo}")
    _kisitlari_yeniden_adlandir(tablo, "_eski")

    op.create_index(f"idx_{tablo}_geom", tablo, ["geom"], postgresql_using="gist")
    op.create_index(f"idx_{tablo}_worker", tablo, ["worker_id"])
    op.create_index(f"ix_{tablo}_departman", tablo, ["departman"])
