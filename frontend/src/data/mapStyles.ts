import type { StyleSpecification } from "maplibre-gl";

/** Istanbul merkezine yakin, onizlemelerde kullanilan sabit bir tile (z/x/y). */
const ONIZLEME_TILE = { z: 15, x: 19021, y: 12284 };

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

export type HaritaStilId = "yol" | "melez" | "uydu" | "liberty" | "voyager";

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
