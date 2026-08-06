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

/** Ana harita bilinmiyorken (ve testlerde) kullanilan kadraj: Bogaz'in iki
 *  yakasi, Bakirkoy-Umraniye arasini kapsayan hafif genis aci. */
export const ONIZLEME_MERKEZI: [number, number] = [28.975, 41.025];
export const ONIZLEME_ZOOM = 9.6;

/** Onizleme kutusu 80x80 piksel; ana haritanin zoom'u orada tek bir sokak
 *  parcasina denk gelirdi. Birkac kademe geri cekilince onizleme "burasi
 *  neresi" sorusunu cevaplar ve daha az tile ister. */
const ONIZLEME_ZOOM_FARKI = 2.5;

export function onizlemeZoomu(anaZoom: number): number {
  return Math.max(0, anaZoom - ONIZLEME_ZOOM_FARKI);
}

export const VARSAYILAN_STIL: HaritaStilId = "liberty";
