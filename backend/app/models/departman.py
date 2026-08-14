"""Departmanlar (mudurlukler).

Vatandas bir talep gonderdiginde sectigi TUR, talebin hangi mudurluge
dusecegini belirler: yoldaki catlak Fen Isleri'ne, kurumus agac Park ve
Bahceler'e gider. Bu yonlendirme kodda sabit degil `turler.departman_kod`
kolonunda durur (bkz. models/tur.py) - bir belediye orgutlenmesini
degistirdiginde migration yazilmasin, admin panelinden guncellensin diye.

Tur SOZLUGUNUN kendisi ayni tablodadir (`turler`) ama iki kavram kavramsal
olarak ayri kalir: departmanlastirma turlerin ne oldugunu degil, KIME
GITTIGINI tanimlar. Ikisi de admin ekranindan yonetilir ama ayri uclardan -
bir turu yeniden yonlendirmek onu yeniden TANIMLAMAK degildir."""

from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Integer,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class Departman(Base):
    """Bir belediye mudurlugu. `kod` dogal anahtardir (users.departman ve
    turler.departman_kod buna baglanir) - yakalar tablosuyla ayni desen."""

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
