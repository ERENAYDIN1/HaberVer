"""reports tablosu -> talepler

Proje genelinde "talep" terimi zaten kullaniliyordu (TalepPaneli, TalepSatiri,
useTalepGorunumleri); yalnizca bu alt sistemin DB tablosu, Python sinif/dosya
adlari ve API yolu Ingilizce kalmisti. Yeniden adlandirma tek yerden yapilir.

DOKUNULMAYANLAR (bilincli):
- `report_status` PG enum TIPININ adi: yalnizca Python sembolu (ReportStatus ->
  TalepStatus) degisti. Tip adini degistirmek kazanci olmayan ek bir riskti.
- `LogAction.report_*` enum degerleri ve `activity_logs.entity_type='report'`
  satirlari: bunlar DB'de YAZILI gecmis veridir; yeniden adlandirmak mevcut
  audit kayitlarini sahipsiz birakirdi.

`photo_url` icindeki `/media/reports/` yollari yeni yola cevrilir; diskteki
fiziksel klasor tasima islemi migration'in isi DEGILDIR (migration yalnizca SQL
olmali, dosya sistemi side-effect'i tasimamali) - ayri bir deployment adimidir.

Revision ID: 0017
Revises: 0016
Create Date: 2026-08-14

"""
from typing import Sequence, Union

from alembic import op

revision: str = "0017"
down_revision: Union[str, None] = "0016"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.rename_table("reports", "talepler")
    op.execute("ALTER INDEX idx_reports_geometry RENAME TO idx_talepler_geometry")
    op.execute("ALTER INDEX idx_reports_nokta RENAME TO idx_talepler_nokta")
    op.execute(
        "UPDATE talepler SET photo_url ="
        " replace(photo_url, '/media/reports/', '/media/talepler/')"
        " WHERE photo_url IS NOT NULL"
    )


def downgrade() -> None:
    op.execute(
        "UPDATE talepler SET photo_url ="
        " replace(photo_url, '/media/talepler/', '/media/reports/')"
        " WHERE photo_url IS NOT NULL"
    )
    op.execute("ALTER INDEX idx_talepler_geometry RENAME TO idx_reports_geometry")
    op.execute("ALTER INDEX idx_talepler_nokta RENAME TO idx_reports_nokta")
    op.rename_table("talepler", "reports")
