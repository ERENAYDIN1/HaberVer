import type { StyleSpecification } from "maplibre-gl";
import hibritStilJson from "./hibritStil.json";

/** Uydu raster goruntusu + Liberty'nin canli vektor etiketleri (OpenFreeMap).
 *  Raster stillerin aksine etiketler haritayla birlikte donen, dinamik nesneler. */
const hibritStili = hibritStilJson as unknown as StyleSpecification;

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

export type HaritaStilId = "hibrit" | "uydu" | "osm" | "liberty" | "voyager";

export interface HaritaStilTanimi {
  id: HaritaStilId;
  etiket: string;
  stil: StyleSpecification | string;
}

export const HARITA_STILLERI: HaritaStilTanimi[] = [
  { id: "hibrit", etiket: "Hibrit", stil: hibritStili },
  { id: "uydu", etiket: "Uydu", stil: googleStili("s") },
  { id: "osm", etiket: "OpenStreetMap", stil: osmStili() },
  { id: "liberty", etiket: "Liberty", stil: "https://tiles.openfreemap.org/styles/liberty" },
  {
    id: "voyager",
    etiket: "Voyager",
    stil: "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json",
  },
];

/** Tum stil onizlemeleri ayni kadraji gosterir: Bogaz'in iki yakasi, "Istanbul"
 *  etiketiyle birlikte Bakirkoy-Umraniye arasini kapsayan hafif genis aci.
 *  Zoom, kucuk onizleme kutularinda bu kadrajin sigmasi icin secildi. */
export const ONIZLEME_MERKEZI: [number, number] = [28.975, 41.025];
export const ONIZLEME_ZOOM = 9.6;

export const VARSAYILAN_STIL: HaritaStilId = "liberty";
