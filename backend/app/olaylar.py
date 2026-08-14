"""Canli guncelleme kanali (SSE) icin surec ici olay veri yolu.

NEDEN: Ekranlar 10-30 sn'de bir yoklama yapiyordu. Atama personelin
ekraninda olur, ekip bunu ancak bir sonraki cekimde ogrenirdi; arada bosa
giden onlarca istek vardi. Burada tersine cevriliyor - degisiklik olunca
sunucu haber veriyor.

TASARIM KARARI - OLAY VERI TASIMAZ, YALNIZCA "SU ANAHTAR DEGISTI" DER.
Istemci sinyali alinca ilgili react-query anahtarini invalidate eder ve
veriyi HER ZAMANKI ucdan yeniden ceker. Boylece kapsam kurallari
(security.Kapsam, departman suzgeci, 404-vs-403 ayrimi) tek yerde -
mevcut router'larda - kalir. Olayin icinde kayit gonderilseydi ayni
suzgecleri burada ikinci kez yazmak gerekirdi ve iki mudurluk arasindaki
sizinti tam olarak orada olusurdu.

KIMLERE GIDER: Olaylar ROL/KULLANICI HEDEFLIDIR (bkz. `Hedef`). Bir saha
ekibine yalnizca kendisini ilgilendiren sinyal gider; bir mudurlugun
personeli digerinin bolge degisikligini duymaz. Sinyalin kendisi veri
tasimasa da "bir sey degisti" bilgisi bile gereksiz yere yayilmamali.

SUREC ICI: Bugun tek uvicorn sureci calisiyor (Dockerfile'da --workers
yok), bu yuzden basit bir asyncio kuyrugu yeterli. Birden fazla worker'a
gecilirse bu modulun yerine Redis pub/sub konmali - `yayinla` ve
`abone_ol` imzalari aynen kalabilir, degisen yalnizca tasima olur.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from dataclasses import dataclass, field
from typing import Literal

logger = logging.getLogger(__name__)

# Bir istemcinin biriktirebilecegi en fazla olay. Yavas/askida kalmis bir
# baglanti sinirsiz bellek tuketmemeli; dolarsa en eskiler dusurulur ve
# istemci zaten yedek yoklamayla (frontend'de ~60 sn) kendini toparlar.
KUYRUK_SINIRI = 100

# Istemcinin bagli kaldigini anlamasi icin gonderilen yorum satiri araligi
# (saniye). Araya giren proxy'ler sessiz baglantiyi kapatabilir; bu satir
# hem baglantiyi canli tutar hem kopmayi hizla fark ettirir.
NABIZ_SANIYE = 25

#: Istemcideki react-query anahtarlarinin koku. Olay adi bilincli olarak
#: frontend'in sorgu anahtariyla AYNI yazilir: "hangi olay hangi ekrani
#: tazeler" sorusu iki tarafta da tek kelimeyle cevaplanabilsin.
OlayAdi = Literal["saha", "bolgeler", "guzergahlar", "assets", "reports", "logs"]


@dataclass(frozen=True)
class Hedef:
    """Bir olayin kimlere gidecegi.

    Alanlarin hepsi bos ise olay TUM personele gider (admin dahil). Kurallar
    birlestirilir: `roller` verilirse yalnizca o roldekiler, `kullanici_id`
    verilirse yalnizca o kisi, `departman` verilirse o mudurlugun personeli
    (+ admin, cunku admin butun mudurluklerin ekranini goruyor).
    """

    roller: frozenset[str] = frozenset()
    kullanici_id: uuid.UUID | None = None
    departman: str | None = None

    def uygun(self, rol: str, kisi_id: uuid.UUID, kisi_departman: str | None) -> bool:
        if self.kullanici_id is not None:
            return self.kullanici_id == kisi_id
        if self.roller and rol not in self.roller:
            return False
        # Admin'in departmani yoktur ve hepsini gorur; departman kisiti ona
        # uygulanmaz, yoksa kendi actigi bolgenin sinyalini alamazdi.
        if self.departman is not None and rol != "admin":
            # NULL departmanli kayit "genel"dir, herkese gider (bkz.
            # crud/bolge.py::departman_kosulu).
            if kisi_departman != self.departman:
                return False
        return True


@dataclass(eq=False)
class Abone:
    """Tek bir SSE baglantisi.

    `eq=False` GEREKLI: dataclass varsayilan olarak `__eq__` uretir ve bu
    `__hash__`i None yapar, yani nesne bir set'e konamaz (`_aboneler`).
    Kimlik karsilastirmasi zaten dogru davranis - iki ayri baglanti ayni
    kullaniciya ait olsa bile ayri abonedir."""

    rol: str
    kullanici_id: uuid.UUID
    departman: str | None
    kuyruk: asyncio.Queue[str] = field(
        default_factory=lambda: asyncio.Queue(maxsize=KUYRUK_SINIRI)
    )


_aboneler: set[Abone] = set()


def abone_ol(rol: str, kullanici_id: uuid.UUID, departman: str | None) -> Abone:
    abone = Abone(rol=rol, kullanici_id=kullanici_id, departman=departman)
    _aboneler.add(abone)
    return abone


def abonelikten_cik(abone: Abone) -> None:
    _aboneler.discard(abone)


def yayinla(olay: OlayAdi, hedef: Hedef | None = None) -> None:
    """Bir olayi uygun abonelere birakir.

    SENKRON ve HATA YUTAR: cagiran taraf bir CRUD islemidir; canli guncelleme
    kanalindaki bir aksaklik atamanin kendisini basarisiz yapmamali. Ayrica
    `db.commit()`ten SONRA cagrilmalidir - istemci sinyali alir almaz veriyi
    yeniden cekecek, o an veritabaninda yeni hali durmali.
    """
    hedef = hedef or Hedef()
    for abone in list(_aboneler):
        if not hedef.uygun(abone.rol, abone.kullanici_id, abone.departman):
            continue
        try:
            abone.kuyruk.put_nowait(olay)
        except asyncio.QueueFull:
            # Yavas istemci: en eskiyi at, yenisini koy. Sinyaller birbirinin
            # ayni oldugu icin (yalnizca anahtar adi) kayip zararsizdir.
            try:
                abone.kuyruk.get_nowait()
                abone.kuyruk.put_nowait(olay)
            except (asyncio.QueueEmpty, asyncio.QueueFull):
                logger.debug("Olay kuyrugu dolu, sinyal atlandi: %s", olay)
        except Exception:  # kanal hatasi islemi bozmamali
            logger.exception("Olay yayinlanamadi: %s", olay)
