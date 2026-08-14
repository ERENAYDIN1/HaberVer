"""Tur sozlugu: varlik/talep turlerinin kendisi.

Tur bir Python/PG enum'u DEGIL bir tablodur (`departmanlar`, `yakalar` ile ayni
desen). Gerekce: bir belediye "kamera" ya da "yangin muslugu" turunu eklemek
istediginde bunun yolu migration yazmak veya veritabanina elle `ALTER TYPE`
cekmek olmamali; ustelik PostgreSQL enum'undan deger silinemedigi icin yanlis
eklenen bir tur kalici olurdu.

Renk BURADA YOK: turun rengi grubundan gelir (frontend `GRUP_RENGI`). Iki renk
kaynagi olusursa ayni tur haritada ve listede farkli renklenebilir - bu yuzden
sadece `grup` saklanir. `glif` de bir ANAHTARDIR; SVG'nin kendisi frontend'in
glif kitapligindadir (`data/tipGlifleri.ts`), yani yeni tur eklemek cizim
yapmayi degil listeden secmeyi gerektirir.

Gorunurluk/sira ayari da yok: sozlukteki her tur her yerde gecerlidir - eklendigi
anda hem lejantta, hem vatandasin talep formunda, hem personelin "Ekle"
formunda cikar. Tek istisna silmedir ve o da FK ile korunur (kullanimda olan
tur silinemez).

`departman_kod`: turun hangi mudurluge yonlendigi. Ayri bir `tur_departman`
join tablosu YERINE dogrudan buradaki kolondur - iliski 1-1 (her turun tam
bir mudurlugu var), `users.departman`/`users.yaka` ile ayni desen. Yonlendirme
kodda sabit degil bu kolondadir - bir belediye orgutlenmesini degistirdiginde
migration degil, admin panelinde bir satir degisir.
"""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base

# Turun ait oldugu gorsel grup. Frontend'in renk paletiyle birebir; veritabani
# tarafinda CHECK ile sabitlenir (migration 0009).
TUR_GRUPLARI = (
    "yesil",
    "temizlik",
    "aydinlatma",
    "yol",
    "ulasim",
    "altyapi",
    "diger",
)


class Tur(Base):
    __tablename__ = "turler"

    kod: Mapped[str] = mapped_column(String(32), primary_key=True)
    ad: Mapped[str] = mapped_column(String(120), nullable=False)
    grup: Mapped[str] = mapped_column(String(32), nullable=False)
    glif: Mapped[str | None] = mapped_column(String(32), nullable=True)
    departman_kod: Mapped[str] = mapped_column(
        String(32), ForeignKey("departmanlar.kod", ondelete="RESTRICT"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
