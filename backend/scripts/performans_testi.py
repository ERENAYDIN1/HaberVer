"""B turu (performans + yetki tutarliligi) degisikliklerinin dogrulanmasi.

Her testin olctugu sey, degisiklikten ONCEKI davranisin somut izidir:
SQL sorgu SAYISI. "Daha hizli hissettiriyor" bir olcut degil; burada sorgular
sayilir, cunku duzeltilen sey tam olarak "gereksiz sorgu uretiliyordu"ydu.

Kullanim (backend container icinde):
    python scripts/performans_testi.py [admin_eposta] [admin_parola]
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import sqlalchemy as sa  # noqa: E402
from sqlalchemy import event  # noqa: E402

from app.database import SessionLocal, engine  # noqa: E402
from auth_akis_testi import API, admin_girisi, giris  # noqa: E402

ORIGIN = {"Origin": "http://localhost:5173"}


class Sayac:
    """Bir blok icinde calisan SQL ifadelerini sayar."""

    def __init__(self):
        self.sorgular: list[str] = []

    def __enter__(self):
        event.listen(engine, "before_cursor_execute", self._kaydet)
        return self

    def __exit__(self, *_):
        event.remove(engine, "before_cursor_execute", self._kaydet)

    def _kaydet(self, conn, cursor, statement, params, context, executemany):
        self.sorgular.append(statement)

    def yazma_sayisi(self) -> int:
        return sum(
            1
            for s in self.sorgular
            if s.lstrip().upper().startswith(("DELETE", "UPDATE", "INSERT"))
        )


def okuma_yazma_yapmamali() -> None:
    """B2: `GET /api/assets` artik DELETE/COMMIT uretmemeli.

    Once `list_assets` icinde `purge_expired_repaired` cagriliyordu; frontend
    bu ucu duzenli yokladigi icin her poll bir yazma islemiydi."""
    print("\n--- B2: okuma uclari yazma yapmiyor ---")
    from app.crud import asset as asset_crud

    db = SessionLocal()
    try:
        with Sayac() as s:
            asset_crud.list_assets(db)
        yazma = s.yazma_sayisi()
        assert yazma == 0, f"list_assets {yazma} yazma islemi uretti"
        print(f"[ok] list_assets: {len(s.sorgular)} sorgu, 0 yazma")

        with Sayac() as s:
            asset_crud.assets_within(
                db,
                polygon_geojson=(
                    '{"type":"Polygon","coordinates":'
                    "[[[28.8,40.9],[29.2,40.9],[29.2,41.2],[28.8,41.2],[28.8,40.9]]]}"
                ),
            )
        yazma = s.yazma_sayisi()
        assert yazma == 0, f"assets_within {yazma} yazma islemi uretti"
        print(f"[ok] assets_within: {len(s.sorgular)} sorgu, 0 yazma")

        # Fonksiyonun kendisi hala calismali - yalnizca cagrildigi yer degisti.
        assert callable(asset_crud.purge_expired_repaired)
        with Sayac() as s:
            asset_crud.purge_expired_repaired(db)
        print(f"[ok] purge_expired_repaired elle cagrilinca calisiyor ({len(s.sorgular)} sorgu)")
    finally:
        db.close()


def konum_ping_ucuz_olmali() -> None:
    """B3: ayni yerden gelen konum bildirimi havuzu yeniden dagitmamali.

    Uc HTTP uzerinden DEGIL, dogrudan cagrilir: sayac bu surecteki engine'i
    dinler, HTTP istegi ise backend sunucusunun AYRI surecinde calisir ve
    oradaki sorgular buradan gorunmez. Olculen mantik tamamen bu fonksiyonun
    icinde oldugundan dogrudan cagirmak hem dogru hem daha kesin bir olcum."""
    print("\n--- B3: konum ping'i havuzu her seferinde dagitmiyor ---")
    from app.models.user import User, UserRole
    from app.routers.saha import konum_guncelle
    from app.schemas.saha import KonumGuncelle

    db = SessionLocal()
    try:
        ekip = db.execute(
            sa.select(User).where(User.role == UserRole.saha_calisani).limit(1)
        ).scalar_one()

        # Baslangic konumu (bu cagri esigi asabilir, olculmuyor).
        konum_guncelle(KonumGuncelle(longitude=29.0257, latitude=40.9903), ekip, db)

        # AYNI yerden ikinci bildirim: yer degistirme ~0 m -> dagitim OLMAMALI.
        with Sayac() as s:
            konum_guncelle(KonumGuncelle(longitude=29.0257, latitude=40.9903), ekip, db)
        duran = len(s.sorgular)
        print(f"[ok] ayni konumdan tekrar ping: {duran} sorgu")

        # ~15 km oteye tasin: esik (250 m) asilir -> dagitim CALISMALI.
        with Sayac() as s:
            konum_guncelle(KonumGuncelle(longitude=28.8500, latitude=41.0100), ekip, db)
        hareketli = len(s.sorgular)
        print(f"[ok] ~15 km oteye tasininca: {hareketli} sorgu (dagitim calisti)")

        assert hareketli > duran, (
            f"esik asilinca dagitim calismali (duran={duran}, hareketli={hareketli})"
        )
        print(f"[ok] duran ekip {hareketli - duran} sorgu tasarruf ediyor (her ping'te)")
    finally:
        db.rollback()
        db.close()


def kapasite_kilidi() -> None:
    """B4: `ata` ekip satirini kilitliyor mu (yaris korumasi)."""
    print("\n--- B4: kapasite kontrolu kilit aliyor ---")
    kaynak = Path("app/crud/assignment.py").read_text(encoding="utf-8")
    assert "with_for_update()" in kaynak, "ata() ekip satirini kilitlemiyor"
    print("[ok] ata() icinde satir kilidi (with_for_update) var")

    # Kilit gercekten calisiyor mu: iki es zamanli oturumdan ikincisi beklemeli.
    db1, db2 = SessionLocal(), SessionLocal()
    try:
        worker_id = db1.execute(
            sa.text("SELECT id FROM users WHERE role='saha_calisani' LIMIT 1")
        ).scalar_one()
        db1.execute(
            sa.text("SELECT id FROM users WHERE id=:i FOR UPDATE"), {"i": worker_id}
        )
        db2.execute(sa.text("SET lock_timeout = '400ms'"))
        try:
            db2.execute(
                sa.text("SELECT id FROM users WHERE id=:i FOR UPDATE"), {"i": worker_id}
            )
            raise AssertionError("ikinci oturum kilide takilmadi")
        except sa.exc.OperationalError:
            print("[ok] kilit gercekten bloke ediyor (ikinci oturum zaman asimina ugradi)")
    finally:
        db1.rollback(); db2.rollback()
        db1.close(); db2.close()


def yetki_aynadan_okunmuyor() -> None:
    """B5: bolge tamamlamada rol, `user.role` kolonundan okunmamali."""
    print("\n--- B5: yetki karari ayna kolondan verilmiyor ---")
    kaynak = Path("app/routers/bolgeler.py").read_text(encoding="utf-8")
    assert "user.role is UserRole.saha_calisani" not in kaynak, "hala kolondan okuyor"
    assert "baglam.etkin_rol is UserRole.saha_calisani" in kaynak
    print("[ok] bolge_tamamla artik baglam.etkin_rol okuyor")

    # Davranis korunmali: saha ekibi kendisine ATANMAMIS bolgeyi kapatamamali.
    admin = admin_girisi()
    bolgeler = admin.get(f"{API}/api/bolgeler").json()
    saha = giris("sahaekibi1@haberver.com", "saha1234")
    benim = {b["id"] for b in saha.get(f"{API}/api/bolgeler/benim").json()}
    yabanci = [b for b in bolgeler if b["id"] not in benim]
    if not yabanci:
        print("[atlandi] bu ekibe atanmamis bolge yok")
        return
    r = saha.post(
        f"{API}/api/bolgeler/{yabanci[0]['id']}/tamamla",
        json={"tamamlandi": True},
        headers=ORIGIN,
    )
    assert r.status_code == 403, f"beklenen 403, gelen {r.status_code}"
    print(f"[ok] saha ekibi -> yabanci bolgeyi tamamla: 403 ({r.json()['detail']})")


def main() -> None:
    okuma_yazma_yapmamali()
    konum_ping_ucuz_olmali()
    kapasite_kilidi()
    yetki_aynadan_okunmuyor()
    print("\nTUM PERFORMANS/TUTARLILIK TESTLERI GECTI")


if __name__ == "__main__":
    main()
