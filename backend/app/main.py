from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .config import settings
from .routers import assets, auth, logs, reports, saha, sinirlar, users

app = FastAPI(title="GreenAsset API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(assets.router)
app.include_router(reports.router)
app.include_router(saha.router)
app.include_router(sinirlar.router)
app.include_router(logs.router)

# Yuklenen ihbar fotograflari icin statik servis. Dizin yoksa olusturulur.
_media_dir = Path(settings.media_dir)
_media_dir.mkdir(parents=True, exist_ok=True)
app.mount(f"/{settings.media_dir}", StaticFiles(directory=_media_dir), name="media")


@app.get("/health")
def health():
    return {"status": "ok"}
