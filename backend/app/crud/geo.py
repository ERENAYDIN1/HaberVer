"""Cizilen alanlarin PostGIS ile olculmesi.

Neden backend: frontend'deki alan hesabi (utils/geo.ts, shoelace) TEK bir
poligon icin yeterli, ama birden fazla alanin CAKISMASINI cozemez - iki alan
ust uste bindiginde ikisinin alani ayri ayri toplanir ve ayni yer iki kez
sayilir. Poligon kesisimi/farki elle yazilmasi zor (ve kutuphane eklemeyi
gerektiren) bir islem; PostGIS zaten projede var ve sonucu jeodezik olarak
tam veriyor.
"""

import json

from sqlalchemy import text
from sqlalchemy.orm import Session


def halkalar_geojson(noktalar: list[list[tuple[float, float]]]) -> str:
    """Halka listesini GeoJSON MultiPolygon metnine cevirir - her halka kendi
    parcasi olur (frontend'deki halkalarGeometrisi ile ayni anlam). Halkalar
    kapali degilse kapatilir."""
    parcalar = []
    for halka in noktalar:
        koordinatlar = [[float(x), float(y)] for x, y in halka]
        if koordinatlar[0] != koordinatlar[-1]:
            koordinatlar.append(koordinatlar[0])
        parcalar.append([koordinatlar])
    return json.dumps({"type": "MultiPolygon", "coordinates": parcalar})


def cizgi_geojson(noktalar: list[tuple[float, float]]) -> str:
    return json.dumps(
        {
            "type": "LineString",
            "coordinates": [[float(x), float(y)] for x, y in noktalar],
        }
    )


# Her alanin kendi buyuklugu + KENDISINDEN ONCEKI alanlarla cakismayan (net)
# kismi. Net parcalar tanim geregi ayrik oldugundan toplamlari alanlarin
# birlesim (union) alanina esittir - toplam ayrica hesaplanmaz.
#
# ST_MakeValid + ST_CollectionExtract(...,3): kullanici kendi kendini kesen bir
# poligon cizdiginde (ayni yerin uzerinden ikinci kez gecince) geometri gecersiz
# olur; bu ikili onu gecerli bir MULTIPOLYGON'a normalize eder.
_ALAN_OZETI_SQL = text(
    """
    WITH girdi AS (
        SELECT ordinality AS sira, deger AS gj
        FROM jsonb_array_elements_text(CAST(:girdi AS jsonb))
             WITH ORDINALITY AS t(deger, ordinality)
    ),
    g AS (
        SELECT sira,
               ST_CollectionExtract(
                   ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(gj), 4326)), 3
               ) AS geom
        FROM girdi
    )
    SELECT g.sira,
           ST_Area(g.geom::geography) AS kendi_m2,
           ST_Area(
               ST_Difference(
                   g.geom,
                   COALESCE(
                       (SELECT ST_UnaryUnion(ST_Collect(o.geom))
                          FROM g o WHERE o.sira < g.sira),
                       ST_GeomFromText('POLYGON EMPTY', 4326)
                   )
               )::geography
           ) AS net_m2
    FROM g
    ORDER BY g.sira
    """
)


def alan_olculeri(
    db: Session, alanlar: list[list[list[tuple[float, float]]]]
) -> list[tuple[float, float]]:
    """Girdiyle ayni sirada (kendi_m2, net_m2) ciftleri dondurur."""
    girdi = json.dumps([halkalar_geojson(halkalar) for halkalar in alanlar])
    rows = db.execute(_ALAN_OZETI_SQL, {"girdi": girdi}).all()
    return [(float(r.kendi_m2 or 0.0), float(r.net_m2 or 0.0)) for r in rows]


# Bir alani her yonunde `mesafe` metre genisletir (negatifse daraltir).
# `::geography` uzerinden tamponlanir ki mesafe gercek metre olsun (4326
# derecelerinde degil). quad_segs=2 bilincli: kose yuvarlamalari 8 yerine 2
# segmentle uretilir, boylece elle duzenlenebilir sayida kose kalir - bu sekil
# haritada koseleri surukleyerek duzenlenmeye devam edecek.
_TAMPON_SQL = text(
    """
    WITH g AS (
        SELECT ST_CollectionExtract(
                   ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(:gj), 4326)), 3
               ) AS geom
    ),
    t AS (
        SELECT ST_CollectionExtract(
                   ST_MakeValid(
                       ST_Buffer(geom::geography, :mesafe, 'quad_segs=2')::geometry
                   ), 3
               ) AS geom
        FROM g
    )
    SELECT ST_AsGeoJSON(ST_Multi(geom)) AS gj,
           ST_Area(geom::geography) AS alan_m2
    FROM t
    """
)


def alan_tamponu(
    db: Session, noktalar: list[list[tuple[float, float]]], mesafe_m: float
) -> tuple[list[list[tuple[float, float]]], float]:
    """Alani `mesafe_m` metre genisletir/daraltir; (halkalar, alan_m2) doner.

    Daraltma alani tamamen yok edebilir (ince bir seride -50 m uygulamak gibi);
    o durumda bos bir halka listesi doner ve cagiran taraf reddeder."""
    row = db.execute(
        _TAMPON_SQL, {"gj": halkalar_geojson(noktalar), "mesafe": float(mesafe_m)}
    ).first()
    if row is None or not row.gj:
        return [], 0.0

    geo = json.loads(row.gj)
    parcalar = (
        geo["coordinates"] if geo["type"] == "MultiPolygon" else [geo["coordinates"]]
    )
    # Yalnizca dis halkalar: kaydedilen bolgeler kullanicinin cizdigi basit
    # alanlardir, delikli poligon uretilmez (bkz. crud/bolge.py::_noktalar).
    halkalar = [
        [(float(x), float(y)) for x, y in parca[0]] for parca in parcalar if parca
    ]
    return halkalar, float(row.alan_m2 or 0.0)
