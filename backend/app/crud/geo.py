"""Cizilen alanlarin PostGIS ile olculmesi.

Frontend'deki shoelace hesabi tek poligon icin yeterli ama cakisan alanlarda
ayni yeri iki kez sayar. Poligon kesisimi/farki elle yazilmasi zor bir islem;
PostGIS zaten projede var ve sonucu jeodezik olarak veriyor.
"""

import json

from sqlalchemy import text
from sqlalchemy.orm import Session


def halkalar_geojson(noktalar: list[list[tuple[float, float]]]) -> str:
    """Halka listesini GeoJSON MultiPolygon metnine cevirir; her halka kendi
    parcasi olur ve kapali degilse kapatilir."""
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


# Her alanin kendi buyuklugu + kendisinden oncekilerle cakismayan (net) kismi.
# Net parcalar ayrik oldugundan toplamlari birlesim alanina esittir, toplam
# ayrica hesaplanmaz. ST_MakeValid + ST_CollectionExtract, kullanicinin kendini
# kesen poligonunu gecerli bir MULTIPOLYGON'a normalize eder.
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


# Alani her yonunde `mesafe` metre genisletir (negatifse daraltir).
# `::geography` uzerinden tamponlanir ki mesafe gercek metre olsun. quad_segs=2
# bilincli: kose yuvarlamasi 8 yerine 2 segmentle uretilir, boylece sonuc elle
# duzenlenebilir sayida kosede kalir.
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
    # Yalnizca dis halkalar: kaydedilen bolgeler basit alanlardir, delikli
    # poligon uretilmez.
    halkalar = [
        [(float(x), float(y)) for x, y in parca[0]] for parca in parcalar if parca
    ]
    return halkalar, float(row.alan_m2 or 0.0)
