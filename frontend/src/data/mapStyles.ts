import type { StyleSpecification } from "maplibre-gl";

/** Ankara merkezine yakin, onizlemelerde kullanilan sabit bir tile (z/x/y). */
const ONIZLEME_TILE = { z: 15, x: 19374, y: 12410 };

function googleStili(lyrs: string): StyleSpecification {
  return {
    version: 8,
    sources: {
      google: {
        type: "raster",
        tiles: [`https://mt.google.com/vt/lyrs=${lyrs}&x={x}&y={y}&z={z}&scale=2`],
        tileSize: 256,
        attribution: "© Google",
      },
    },
    layers: [{ id: "google", type: "raster", source: "google" }],
  };
}

function googleOnizlemeUrl(lyrs: string): string {
  const { z, x, y } = ONIZLEME_TILE;
  return `https://mt.google.com/vt/lyrs=${lyrs}&x=${x}&y=${y}&z=${z}&scale=2`;
}

/** Kabartma (relief) stili: MapLibre'nin yerel "color-relief" katmani + acik
 *  kaynakli global yukseklik verisi (AWS Terrarium). Google'in "h" katmani
 *  yol/etiketleri seffaf olarak ustune biner, boylece hem renkli kabartma
 *  hem de okunabilir yer adlari bir arada olur. */
function kabartmaStili(): StyleSpecification {
  return {
    version: 8,
    sources: {
      yukseklik: {
        type: "raster-dem",
        tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
        tileSize: 256,
        encoding: "terrarium",
        maxzoom: 15,
        attribution: "Terrain: Mapzen / AWS Open Data Terrain Tiles",
      },
      "google-etiket": {
        type: "raster",
        tiles: [`https://mt.google.com/vt/lyrs=h&x={x}&y={y}&z={z}&scale=2`],
        tileSize: 256,
        attribution: "© Google",
      },
    },
    layers: [
      {
        id: "kabartma-renk",
        type: "color-relief",
        source: "yukseklik",
        paint: {
          "color-relief-color": [
            "interpolate",
            ["linear"],
            ["elevation"],
            0,
            "rgb(63,124,161)",
            1,
            "rgb(96,158,116)",
            200,
            "rgb(150,180,112)",
            600,
            "rgb(198,180,120)",
            1200,
            "rgb(172,132,96)",
            2000,
            "rgb(150,112,96)",
            3000,
            "rgb(255,255,255)",
          ],
        },
      },
      { id: "kabartma-etiket", type: "raster", source: "google-etiket" },
    ],
  };
}

export type HaritaStilId =
  | "yol"
  | "melez"
  | "uydu"
  | "kabartma"
  | "liberty"
  | "voyager";

export interface HaritaStilTanimi {
  id: HaritaStilId;
  etiket: string;
  stil: StyleSpecification | string;
  /** Raster onizlemeler dogrudan <img>, arazi iki katmanin ustuste bindirilmis
   *  onizlemesini gosterir, vektor stiller mini canli harita ile gosterilir. */
  onizleme:
    | { tip: "raster"; url: string }
    | { tip: "raster-yigin"; urls: [string, string] }
    | { tip: "vektor" };
}

export const HARITA_STILLERI: HaritaStilTanimi[] = [
  {
    id: "yol",
    etiket: "Yol Haritası",
    stil: googleStili("m"),
    onizleme: { tip: "raster", url: googleOnizlemeUrl("m") },
  },
  {
    id: "melez",
    etiket: "Melez",
    stil: googleStili("y"),
    onizleme: { tip: "raster", url: googleOnizlemeUrl("y") },
  },
  {
    id: "uydu",
    etiket: "Uydu",
    stil: googleStili("s"),
    onizleme: { tip: "raster", url: googleOnizlemeUrl("s") },
  },
  {
    id: "kabartma",
    etiket: "Kabartma",
    stil: kabartmaStili(),
    // Statik bir tile'dan kabartma renklendirmesi uretilemez (GL katmani
    // istemcide hesaplanir); onizleme icin kucuk canli bir harita kullanilir.
    onizleme: { tip: "vektor" },
  },
  {
    id: "liberty",
    etiket: "Liberty",
    stil: "https://tiles.openfreemap.org/styles/liberty",
    onizleme: { tip: "vektor" },
  },
  {
    id: "voyager",
    etiket: "Voyager",
    stil: "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json",
    onizleme: { tip: "vektor" },
  },
];

export const ONIZLEME_MERKEZI: [number, number] = [32.8597, 39.9334];

export const VARSAYILAN_STIL: HaritaStilId = "yol";
