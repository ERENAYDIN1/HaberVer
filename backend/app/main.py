from pathlib import Path
from urllib.parse import urlparse

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from .config import settings
from .routers import (
    assets,
    auth,
    bolgeler,
    geo,
    logs,
    reports,
    saha,
    sinirlar,
    users,
)

app = FastAPI(title="GreenAsset API", version="0.1.0")

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

# Yuklenen ihbar fotograflari icin statik servis. Dizin yoksa olusturulur.
_media_dir = Path(settings.media_dir)
_media_dir.mkdir(parents=True, exist_ok=True)
app.mount(f"/{settings.media_dir}", StaticFiles(directory=_media_dir), name="media")


@app.get("/health")
def health():
    return {"status": "ok"}
