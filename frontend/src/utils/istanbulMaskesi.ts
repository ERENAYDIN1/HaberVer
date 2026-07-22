import type maplibregl from "maplibre-gl";

/** Proje kapsami en fazla bir il (Istanbul); haritalarin varsayilan merkezi
 *  ve tek "detay alani" budur. */
export const ISTANBUL_MERKEZI: [number, number] = [28.9784, 41.0082];
export const ISTANBUL_IL_KODU = "34";

/** Kullanicinin sehri komsu illerle birlikte genis acidan gorebilmesi icin
 *  harita her yonde ~400km'e kadar kaydirilabilir/uzaklastirilabilir; asil
 *  "detay" alani (bkz. asagidaki maske) yine de sadece Istanbul il siniridir. */
export const ISTANBUL_SINIRLARI: [[number, number], [number, number]] = [
  [24.2, 37.4],
  [33.8, 44.6],
];

export const MASKE_SOURCE_ID = "istanbul-maskesi";
export const MASKE_DOLGU_LAYER_ID = "istanbul-maske-dolgu";
export const MASKE_CIZGI_LAYER_ID = "istanbul-maske-cizgi";

export const BOS_GEOJSON = {
  type: "FeatureCollection",
  features: [],
} as unknown as GeoJSON.FeatureCollection;

/** Genis (400km) gorunum alani icinde, Istanbul il sinirinin DISINDA kalan
 *  her yeri kaplayan bir "maske" poligonu uretir - buyuk bir dis dikdortgen +
 *  ic halka olarak il sinirinin tum parcalari (delik gibi davranir). Hem
 *  raster (Google Yol/Melez/Uydu) hem vektor (Liberty/Voyager) stillerde ayni
 *  yari saydam dolgu + Istanbul kenarini izleyen vurgu cizgisi kullanilir -
 *  altta yatan detay (yol, etiket, arazi) soluk da olsa gorunur kalir. */
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

/** Maske kaynagini/katmanlarini yoksa ekler (idempotent) - yari saydam dolgu
 *  + Istanbul kenarini izleyen bir vurgu cizgisi ("delik"in kenarlari bir
 *  "line" katmaniyla cizilince otomatik olarak tam Istanbul sinirini takip
 *  eder). Butun stillerde (raster/vektor) ayni sekilde kullanilir. */
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
    paint: { "line-color": "#059669", "line-width": 2, "line-opacity": 0.9 },
  });
}

/** Istanbul il siniri hazir olunca (fetch + stil yuklemesi ikisi de bitince)
 *  cagirilir: maske kaynagini Istanbul'un halkalariyla doldurur. */
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
