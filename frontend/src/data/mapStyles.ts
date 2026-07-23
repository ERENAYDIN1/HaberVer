import type { StyleSpecification } from "maplibre-gl";
import hibritStilJson from "./hibritStil.json";

/** Uydu raster goruntusu + Liberty'nin canli vektor etiketleri (OpenFreeMap).
 *  Raster stillerin aksine etiketler haritayla birlikte donen, dinamik nesneler. */
const hibritStili = hibritStilJson as unknown as StyleSpecification;

/** Istanbul merkezine yakin, onizlemelerde kullanilan sabit bir tile (z/x/y). */
const ONIZLEME_TILE = { z: 15, x: 19021, y: 12284 };

function googleStili(lyrs: string): StyleSpecification {
  return {
    version: 8,
    sources: {
      google: {
        type: "raster",
        tiles: [`https://mt.google.com/vt/lyrs=${lyrs}&x={x}&y={y}&z={z}`],
        tileSize: 256,
        attribution: "© Google",
      },
    },
    layers: [{ id: "google", type: "raster", source: "google" }],
  };
}

function googleOnizlemeUrl(lyrs: string): string {
  const { z, x, y } = ONIZLEME_TILE;
  return `https://mt.google.com/vt/lyrs=${lyrs}&x=${x}&y=${y}&z=${z}`;
}

/** Standart OpenStreetMap raster altligi (API anahtari gerektirmez). */
function osmStili(): StyleSpecification {
  return {
    version: 8,
    sources: {
      osm: {
        type: "raster",
        tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        attribution: "© OpenStreetMap katkida bulunanlar",
      },
    },
    layers: [{ id: "osm", type: "raster", source: "osm" }],
  };
}

function osmOnizlemeUrl(): string {
  const { z, x, y } = ONIZLEME_TILE;
  return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
}

export type HaritaStilId = "hibrit" | "uydu" | "osm" | "liberty" | "voyager";

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
    id: "hibrit",
    etiket: "Hibrit",
    stil: hibritStili,
    onizleme: { tip: "vektor" },
  },
  {
    id: "uydu",
    etiket: "Uydu",
    stil: googleStili("s"),
    onizleme: { tip: "raster", url: googleOnizlemeUrl("s") },
  },
  {
    id: "osm",
    etiket: "OpenStreetMap",
    stil: osmStili(),
    onizleme: { tip: "raster", url: osmOnizlemeUrl() },
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

export const ONIZLEME_MERKEZI: [number, number] = [28.9784, 41.0082];

export const VARSAYILAN_STIL: HaritaStilId = "liberty";
