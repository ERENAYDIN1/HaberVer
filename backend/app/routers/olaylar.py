"""Canli guncelleme akisi (Server-Sent Events).

NEDEN SSE, WEBSOCKET DEGIL: Trafik tek yonludur (sunucu -> istemci); atama,
kaldirma, tamamlama ve otomatik dagitimin hepsi sunucuda olur. Istemciden
sunucuya giden tek surekli akis saha ekibinin konum ping'idir ve o, mevcut
POST ucunda kalmali (backend anlamli yer degistirmede havuzu yeniden
dagitiyor - istek/yanit dongusu gerekiyor).

Ek olarak SSE bu projeye uc pratik kolaylik getiriyor:
  * Cookie'ler kendiliginden gider - BFF oturumu (httpOnly cookie) hicbir
    degisiklik olmadan calisir. WebSocket el sikismasi da cookie tasir ama
    `origin_kontrolu` ara katmani upgrade isteklerini KAPSAMAZ; ayri bir
    origin dogrulamasi yazmak gerekirdi (yeni saldiri yuzeyi, sifir kazanc).
  * `EventSource` yeniden baglanmayi kendi yapar. Saha ekibinin mobil
    baglantisinda bu, elle yazilacak bir backoff dongusunden daha guvenilir.
  * Vite proxy'si degismeden calisir (`ws: true` gerekmez).
"""

import asyncio
import json
import logging

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from .. import olaylar as olay_yolu
from ..crud.session import OturumBaglami
from ..security import get_context

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/olaylar", tags=["olaylar"])


async def _akis(request: Request, abone: olay_yolu.Abone):
    """Olaylari SSE bicimine cevirip yayar; baglanti kopunca aboneligi birakir."""
    try:
        # Ilk paket: istemci `onopen`i beklemeden baglantinin kuruldugunu
        # bilsin ve (varsa) araya giren proxy tamponunu hemen bosaltsin.
        yield ": baglandi\n\n"
        while True:
            if await request.is_disconnected():
                break
            try:
                olay = await asyncio.wait_for(abone.kuyruk.get(), timeout=olay_yolu.NABIZ_SANIYE)
            except asyncio.TimeoutError:
                # Nabiz: sessiz baglantiyi proxy'ler kapatabiliyor. Yorum
                # satiri istemciye olay olarak gecmez.
                yield ": nabiz\n\n"
                continue
            yield f"event: tazele\ndata: {json.dumps({'anahtar': olay})}\n\n"
    except asyncio.CancelledError:  # istemci ayrildi
        raise
    finally:
        olay_yolu.abonelikten_cik(abone)


@router.get("")
async def olay_akisi(
    request: Request,
    baglam: OturumBaglami = Depends(get_context),
):
    """Giris yapmis kullaniciya kendisini ilgilendiren degisiklikleri yayar.

    Olaylar veri TASIMAZ, yalnizca "su anahtar degisti" der; istemci ilgili
    sorguyu her zamanki ucdan yeniden ceker. Kapsam kurallari boylece tek
    yerde kalir (bkz. app/olaylar.py)."""
    abone = olay_yolu.abone_ol(
        rol=baglam.etkin_rol.value,
        kullanici_id=baglam.user.id,
        departman=baglam.user.departman,
    )
    return StreamingResponse(
        _akis(request, abone),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            # nginx/Caddy arkasinda tamponlama SSE'yi ise yaramaz hale getirir.
            "X-Accel-Buffering": "no",
        },
    )
