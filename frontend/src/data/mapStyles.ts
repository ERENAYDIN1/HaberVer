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

export type HaritaStilId = "yol" | "arazi" | "melez" | "liberty" | "voyager";

export interface HaritaStilTanimi {
  id: HaritaStilId;
  etiket: string;
  stil: StyleSpecification | string;
  /** Raster onizlemeler dogrudan <img>, vektor stiller mini canli harita ile gosterilir. */
  onizleme: { tip: "raster"; url: string } | { tip: "vektor" };
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
    id: "arazi",
    etiket: "Arazi",
    stil: googleStili("p"),
    onizleme: { tip: "raster", url: googleOnizlemeUrl("p") },
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
