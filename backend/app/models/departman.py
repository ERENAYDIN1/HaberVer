"""Departmanlar (mudurlukler) ve tur -> departman yonlendirme tablosu.

Vatandas bir talep gonderdiginde sectigi TUR, talebin hangi mudurluge
dusecegini belirler: yoldaki catlak Fen Isleri'ne, kurumus agac Park ve
Bahceler'e gider. Bu yonlendirme kodda sabit degil `tur_departman` tablosunda
durur - bir belediye orgutlenmesini degistirdiginde migration yazilmasin,
admin panelinden guncellensin diye.

Tur SOZLUGUNUN kendisi (13 tur, gliflari, renk gruplari) yerinde kalir:
`asset_type` PG enum'u ve frontend'deki `types/asset.ts`. Departmanlastirma
turlerin ne oldugunu degil, KIME GITTIGINI tanimlar."""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, String, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base
from .asset import AssetType


class Departman(Base):
    """Bir belediye mudurlugu. `kod` dogal anahtardir (users.departman ve
    tur_departman.departman_kod buna baglanir) - yakalar tablosuyla ayni desen."""

    __tablename__ = "departmanlar"

    kod: Mapped[str] = mapped_column(String(32), primary_key=True)
    ad: Mapped[str] = mapped_column(String(120), nullable=False)
    aciklama: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Rozet/panel rengi. HARITA ISARETCILERINI ETKILEMEZ: onlarin rengi tur
    # grubundan gelir (frontend GRUP_RENGI). Iki renk sistemi bilincli olarak
    # ayri tutulur, yoksa haritada ayni sekil iki farkli anlamda renklenirdi.
    renk: Mapped[str] = mapped_column(String(9), nullable=False)
    aktif: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("true")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class TurDepartman(Base):
    """Tur -> departman yonlendirmesi. Her turun TAM BIR departmani vardir
    (birincil anahtar `tur`), dolayisiyla bir talebin sahibi her zaman tekil
    olarak bellidir - "iki mudurluk de bakar" belirsizligi olusamaz."""

    __tablename__ = "tur_departman"

    tur: Mapped[AssetType] = mapped_column(
        Enum(AssetType, name="asset_type", create_type=False), primary_key=True
    )
    departman_kod: Mapped[str] = mapped_column(
        String(32), ForeignKey("departmanlar.kod", ondelete="RESTRICT"), nullable=False
    )
