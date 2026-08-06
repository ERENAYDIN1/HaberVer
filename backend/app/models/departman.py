"""Departmanlar (mudurlukler) ve tur -> departman yonlendirme tablosu.

Vatandas bir talep gonderdiginde sectigi TUR, talebin hangi mudurluge
dusecegini belirler: yoldaki catlak Fen Isleri'ne, kurumus agac Park ve
Bahceler'e gider. Bu yonlendirme kodda sabit degil `tur_departman` tablosunda
durur - bir belediye orgutlenmesini degistirdiginde migration yazilmasin,
admin panelinden guncellensin diye.

Tur SOZLUGUNUN kendisi ayri bir tablodur (`turler`, bkz. models/tur.py):
departmanlastirma turlerin ne oldugunu degil, KIME GITTIGINI tanimlar. Ikisi
de admin ekranindan yonetilir ama ayri kalir - bir turu yeniden yonlendirmek
onu yeniden TANIMLAMAK degildir."""

from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
    text,
)
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
    # Listeleme sirasi (`turler.sira` ile ayni desen). Alfabetik siralama
    # "Cozum Merkezi (Beyaz Masa)"yi - siniflandirilamayan talebin dustugu
    # triyaj kovasini - listenin basina tasiyordu; bir "diger" kovasi her
    # zaman en altta durmali. Yeni mudurlukler varsayilan 100 ile onun onune
    # girer.
    sira: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("100")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class TurDepartman(Base):
    """Tur -> departman yonlendirmesi. Her turun TAM BIR departmani vardir
    (birincil anahtar `tur`), dolayisiyla bir talebin sahibi her zaman tekil
    olarak bellidir - "iki mudurluk de bakar" belirsizligi olusamaz."""

    __tablename__ = "tur_departman"

    # Turun kendisi `turler` tablosunda yasar; buradaki FK CASCADE'dir:
    # yonlendirme turun bir ozelligidir, tur silinince pesinden gider.
    tur: Mapped[AssetType] = mapped_column(
        String(32), ForeignKey("turler.kod", ondelete="CASCADE"), primary_key=True
    )
    departman_kod: Mapped[str] = mapped_column(
        String(32), ForeignKey("departmanlar.kod", ondelete="RESTRICT"), nullable=False
    )
