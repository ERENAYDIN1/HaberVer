import asyncio
import logging
from contextlib import asynccontextmanager
from urllib.parse import urlparse

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import settings
from .crud import asset as asset_crud
from .crud import session as oturum_crud
from .database import SessionLocal
from .routers import (
    assets,
    auth,
    bolgeler,
    geo,
    logs,
    media,
    reports,
    saha,
    sinirlar,
    users,
)

logger = logging.getLogger(__name__)


async def _bakim_dongusu() -> None:
    """Zamana bagli temizlik isleri: suresi gecmis oturumlar + tamir edilip
    saklama suresi dolmus ihbar varliklari.

    **Neden okuma uclarinda degil.** Ikisi de bir zamanlar (ya da hic) yanlis
    yerdeydi: `session.temizle` HICBIR YERDEN cagrilmiyordu, `asset.purge_
    expired_repaired` ise her `GET /api/assets` ve `POST /within` icinde
    calisiyordu. Ikincisi GET'i yazma islemine cevirir - frontend bu uclari
    duzenli olarak yokladigi icin her poll bir DELETE + COMMIT uretiyordu, es
    zamanli okuyucular ayni satirlar icin yarisiyor ve okuma gecikmesi
    silinecek kayit sayisina bagli hale geliyordu. Ikisinin de dogru yeri
    burasi: is zamana bagli, isteklere degil.

    Sikligin hassas olmasi gerekmiyor - saklama suresi 5 GUN (`TAMIR_SAKLAMA_
    GUN`), yani birkac saatlik gecikme davranisi degistirmez."""
    aralik = max(1, settings.oturum_temizleme_saat) * 3600
    while True:
        try:
            db = SessionLocal()
            try:
                silinen = oturum_crud.temizle(db)
                if silinen:
                    logger.info("Suresi gecmis %d oturum silindi", silinen)
                temizlenen = asset_crud.purge_expired_repaired(db)
                if temizlenen:
                    logger.info(
                        "Tamir sonrasi saklama suresi dolan %d varlik silindi",
                        temizlenen,
                    )
            finally:
                db.close()
        except Exception:  # bakim isi uygulamayi dusurmemeli
            logger.exception("Bakim dongusu basarisiz")
        await asyncio.sleep(aralik)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings.media_yolu.mkdir(parents=True, exist_ok=True)
    gorev = asyncio.create_task(_bakim_dongusu())
    try:
        yield
    finally:
        gorev.cancel()


app = FastAPI(title="GreenAsset API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin, settings.app_base_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

GUVENLI_METOTLAR = {"GET", "HEAD", "OPTIONS"}
IZINLI_ORIGINLER = {settings.app_base_url.rstrip("/"), settings.frontend_origin.rstrip("/")}


@app.middleware("http")
async def origin_kontrolu(request: Request, call_next):
    """CSRF savunmasinin ikinci katmani.

    Oturum cookie'si `SameSite=Lax` oldugu icin capraz siteden gelen POST
    isteklerine tarayici cookie'yi zaten eklemez; bu ara katman ayni seyi
    sunucu tarafinda da dogrular (eski tarayicilar, `Lax`'i esneten kenar
    durumlar ve form tabanli multipart yuklemeler icin - ihbar fotografi
    yukleme ucu boyle bir uctur).

    Origin basligi olmayan istekler yalnizca ortada bir oturum cookie'si
    YOKKEN gecirilir: tarayici disi istemciler (curl, testler) calismaya devam
    eder, cookie ile gelen bir istek ise her zaman kaynagini kanitlamak
    zorundadir."""
    if request.method not in GUVENLI_METOTLAR:
        origin = request.headers.get("origin")
        if origin is None:
            referer = request.headers.get("referer")
            if referer:
                cozum = urlparse(referer)
                origin = f"{cozum.scheme}://{cozum.netloc}"
        cookie_var = settings.session_cookie_name in request.cookies
        if origin is not None:
            if origin.rstrip("/") not in IZINLI_ORIGINLER:
                return JSONResponse(
                    status_code=status.HTTP_403_FORBIDDEN,
                    content={"detail": "Istek kaynagi dogrulanamadi"},
                )
        elif cookie_var:
            return JSONResponse(
                status_code=status.HTTP_403_FORBIDDEN,
                content={"detail": "Istek kaynagi dogrulanamadi"},
            )
    return await call_next(request)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(assets.router)
app.include_router(reports.router)
app.include_router(saha.router)
app.include_router(bolgeler.router)
app.include_router(sinirlar.router)
app.include_router(geo.router)
app.include_router(logs.router)
# Yuklenen ihbar fotograflari. Eskiden `app.mount(StaticFiles(...))` idi; o mount
# tum router'larin ve security.py'nin DISINDA kaldigi icin dosyalar kimlik
# dogrulamasi olmadan servis ediliyordu. Artik normal bir router (bkz. media.py).
app.include_router(media.router)


@app.get("/health")
def health():
    return {"status": "ok"}
