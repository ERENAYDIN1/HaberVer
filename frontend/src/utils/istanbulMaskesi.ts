import type maplibregl from "maplibre-gl";

import { BOS_GEOJSON } from "./geojson";

/** Proje kapsami tek il: haritalarin varsayilan merkezi ve detay alani. */
export const ISTANBUL_MERKEZI: [number, number] = [28.9784, 41.0082];
export const ISTANBUL_IL_KODU = "34";

/** Harita her yonde ~400 km'e kadar kaydirilabilir (sehir komsu illerle
 *  birlikte gorulsun); detay alani yine de yalnizca il siniridir. */
export const ISTANBUL_SINIRLARI: [[number, number], [number, number]] = [
  [24.2, 37.4],
  [33.8, 44.6],
];

export const MASKE_SOURCE_ID = "istanbul-maskesi";
export const MASKE_DOLGU_LAYER_ID = "istanbul-maske-dolgu";
export const MASKE_CIZGI_LAYER_ID = "istanbul-maske-cizgi";


/** Il sinirinin disinda kalan her yeri kaplayan maske poligonu: buyuk bir dis
 *  dikdortgen + il sinirinin halkalari ic halka (delik) olarak. Ters sarim
 *  sayesinde MapLibre bu halkalari otomatik olarak delik sayar. */
export function maskeGeometrisi(halkalar: [number, number][][]): GeoJSON.Polygon {
  const disKutu: [number, number][] = [
    [-180, -85],
    [180, -85],
    [180, 85],
    [-180, 85],
    [-180, -85],
  ];
  return {
    type: "Polygon",
    coordinates: [disKutu, ...halkalar.map((halka) => [...halka, halka[0]])],
  };
}

/** Maske kaynagini/katmanlarini ekler (idempotent): yari saydam dolgu + il
 *  kenarini izleyen vurgu cizgisi. Tum stillerde ayni sekilde kullanilir. */
export function maskeKaynagiHazirla(map: maplibregl.Map) {
  if (map.getSource(MASKE_SOURCE_ID)) return;
  map.addSource(MASKE_SOURCE_ID, { type: "geojson", data: BOS_GEOJSON });
  map.addLayer({
    id: MASKE_DOLGU_LAYER_ID,
    type: "fill",
    source: MASKE_SOURCE_ID,
    paint: { "fill-color": "#e2e8f0", "fill-opacity": 0.55 },
  });
  map.addLayer({
    id: MASKE_CIZGI_LAYER_ID,
    type: "line",
    source: MASKE_SOURCE_ID,
    paint: { "line-color": "#059669", "line-width": 0.25, "line-opacity": 0.9 },
  });
}

/** Sinir verisi ve stil ikisi de hazir olunca cagrilir; maskeyi doldurur. */
export function istanbulMaskesiUygula(
  map: maplibregl.Map,
  halkalar: [number, number][][] | null
) {
  const source = map.getSource(MASKE_SOURCE_ID) as
    | maplibregl.GeoJSONSource
    | undefined;

  if (!halkalar) {
    source?.setData(BOS_GEOJSON);
    return;
  }

  source?.setData({
    type: "FeatureCollection",
    features: [
      { type: "Feature", geometry: maskeGeometrisi(halkalar), properties: {} },
    ],
  });
}
