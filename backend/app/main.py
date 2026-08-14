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
    departmanlar,
    geo,
    guzergahlar,
    logs,
    media,
    olaylar,
    talepler,
    saha,
    sinirlar,
    turler,
    users,
)

logger = logging.getLogger(__name__)


async def _bakim_dongusu() -> None:
    """Zamana bagli temizlik: suresi gecmis oturumlar + saklama suresi dolmus
    talep varliklari.

    Bu isler okuma uclarina iliştirilmez; oyle yapildiginda her GET bir
    DELETE + COMMIT uretiyor ve okuma gecikmesi silinecek kayit sayisina bagli
    hale geliyordu. Siklik hassas degil: saklama suresi gunlerle olculur."""
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


app = FastAPI(title="haber ver+ API", version="0.1.0", lifespan=lifespan)

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
    """CSRF savunmasinin ikinci katmani. Cookie `SameSite=Lax` oldugu icin
    capraz siteden gelen POST'ta tarayici cookie'yi zaten gondermez; bu ara
    katman ayni kurali sunucu tarafinda da dogrular (form tabanli multipart
    yuklemeler icin onemli).

    Origin basligi olmayan istekler yalnizca oturum cookie'si yokken gecer:
    curl/testler calisir, cookie'li istek ise her zaman kaynagini kanitlar."""
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
app.include_router(departmanlar.router)
app.include_router(turler.router)
app.include_router(assets.router)
app.include_router(talepler.router)
app.include_router(saha.router)
app.include_router(bolgeler.router)
app.include_router(guzergahlar.router)
app.include_router(sinirlar.router)
app.include_router(geo.router)
app.include_router(logs.router)
app.include_router(olaylar.router)
# Talep fotograflari bilincli olarak `StaticFiles` mount'u degil normal bir
# router: mount security.py'nin disinda kalip dosyalari kimlik dogrulamasiz
# servis ediyordu.
app.include_router(media.router)


@app.get("/health")
def health():
    return {"status": "ok"}
