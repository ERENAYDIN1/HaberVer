import type maplibregl from "maplibre-gl";

import { BOS_GEOJSON } from "./geojson";
import {
  IHBAR_OPAKLIK_IFADESI,
  TIP_RENGI_IFADESI,
  VARLIK_UYARI_RENK,
} from "./haritaIkonlari";
import type { AssetFeatureCollection } from "../types/asset";

/** Haritadaki kaynak + katman kurulumu, aileye gore ayrilmis halde. Buradaki
 *  fonksiyonlar yalnizca `map`'e dokunur; olay baglama ve veri yazma guncel
 *  prop/ref degerlerine bagli oldugu icin MapView'da kalir.
 *
 *  Hepsi idempotenttir: stil degisiminde MapLibre tum kaynaklari dusurdugu
 *  icin ayni fonksiyonlar tekrar cagrilir. */

export const SOURCE_ID = "assets";
export const REPORTS_SOURCE_ID = "reports";
export const CIZIM_SOURCE_ID = "cizim";
export const TAMAMLANAN_SOURCE_ID = "tamamlanan-alanlar";
/** Kaydedilmis bolgeler: anlik secimlerden ayri kaynak - kalicidir, secim
 *  temizlenince haritadan kalkmaz ve kesik cizgiyle ayrica ayrilir. */
export const BOLGE_SOURCE_ID = "bolgeler";
/** Sekli duzenlenen kayit: kalici katmanla ve digerlerinin tiklama alanlariyla
 *  karismasin diye kendi kaynaginda cizilir. */
export const SEKIL_SOURCE_ID = "sekil-duzenleme";
export const OLCUM_SOURCE_ID = "olcum";
export const DINAMIK_SOURCE_ID = "dinamik-onizleme";
export const OLCUM_RENK = "#2563eb";

export const BOS_KOLEKSIYON: AssetFeatureCollection = {
  type: "FeatureCollection",
  features: [],
};
/** Rozetlerin gorunmeye basladigi zoom (hem varlik hem ihbar tarafinda). */
export const ROZET_MINZOOM = 12.5;

/** Isaretci olculeri: daireler glif okunacak kadar belirgin, ama uzaklasinca
 *  (z10-12) birbirine girmesin diye o uctaki yaricaplar kucuk. */
export const ISARETCI = {
  /** Varlik dairesi yaricapi (zoom 10 -> 16 interpolasyonu). */
  varlikYaricap: ["interpolate", ["linear"], ["zoom"], 10, 8, 16, 14.5],
  /** Ihbar pininin ucundaki yer golgesi (pin havada durmasin). */
  ihbarGolgeYaricap: ["interpolate", ["linear"], ["zoom"], 10, 2.5, 16, 4],
  /** "Bakim lazim" amber uyari halkasi; ana dairenin disinda kalir. */
  uyariYaricap: ["interpolate", ["linear"], ["zoom"], 10, 10.5, 16, 17],
  /** Secim halkasi; uyari halkasinin da disinda. */
  varlikSecimYaricap: ["interpolate", ["linear"], ["zoom"], 10, 12.5, 16, 19],
  beyazHalka: 2.2,
} as const;

/** Isaretcinin altina yumusak golge: asagi kaydirilmis, bulaniklastirilmis
 *  siyah daire - altliktan bagimsiz derinlik hissi verir. */
export function golgeBoyasi(yaricap: unknown, opaklik: unknown = 1): Record<string, unknown> {
  return {
    "circle-radius": yaricap,
    "circle-color": "#0f172a",
    // Sonumlenen ihbarlarda golge de sonmeli.
    "circle-opacity": ["*", 0.22, opaklik],
    "circle-blur": 0.5,
    "circle-translate": [0, 2],
  };
}


/** Kayitli varliklar: golge + durum halkasi + daire + tur glifi + rozet. */
export function varlikKatmanlari(map: maplibregl.Map): void {
  if (!map.getSource(SOURCE_ID)) {
    map.addSource(SOURCE_ID, { type: "geojson", data: BOS_KOLEKSIYON });

    // En altta golge; isaretcileri altliktan ayirir.
    map.addLayer({
      id: "assets-golge",
      type: "circle",
      source: SOURCE_ID,
      paint: golgeBoyasi(ISARETCI.varlikYaricap) as never,
    });

    // Bakim gerektiren varliklarda amber uyari halkasi: dolgu tur rengini
    // tasidigi icin durumun tek gorsel isareti budur ("!" rozetiyle birlikte).
    map.addLayer({
      id: "assets-durum",
      type: "circle",
      source: SOURCE_ID,
      filter: ["==", ["get", "status"], "bakim_lazim"],
      paint: {
        "circle-radius": ISARETCI.uyariYaricap as never,
        "circle-color": VARLIK_UYARI_RENK,
        "circle-opacity": 0.28,
        "circle-stroke-width": 2.4,
        "circle-stroke-color": VARLIK_UYARI_RENK,
      },
    });

    // Ana isaretci: dolgu her zaman tur rengi, beyaz cerceve.
    map.addLayer({
      id: "assets-circle",
      type: "circle",
      source: SOURCE_ID,
      paint: {
        "circle-radius": ISARETCI.varlikYaricap as never,
        "circle-color": TIP_RENGI_IFADESI as never,
        "circle-stroke-width": ISARETCI.beyazHalka,
        "circle-stroke-color": "#ffffff",
      },
    });

    map.addLayer({
      id: "assets-selected",
      type: "circle",
      source: SOURCE_ID,
      filter: ["==", ["get", "id"], ""],
      paint: {
        "circle-radius": ISARETCI.varlikSecimYaricap as never,
        "circle-color": "transparent",
        "circle-stroke-width": 3,
        "circle-stroke-color": "#0f766e",
      },
    });
  }
}

/** Vatandas ihbarlari: yer golgesi + secim pini + pin + glif + halka/rozet. */
export function ihbarKatmanlari(map: maplibregl.Map): void {
  if (!map.getSource(REPORTS_SOURCE_ID)) {
    map.addSource(REPORTS_SOURCE_ID, { type: "geojson", data: BOS_GEOJSON });

    // Pinin ucundaki yer golgesi. Pin symbol katmanidir ve goruntuleri
    // asenkron yuklendigi icin sonradan eklenir; bu daire senkron var
    // oldugundan tiklama/hover baglantilari icin sabit dayanaktir.
    map.addLayer({
      id: "reports-circle",
      type: "circle",
      source: REPORTS_SOURCE_ID,
      paint: golgeBoyasi(
        ISARETCI.ihbarGolgeYaricap,
        IHBAR_OPAKLIK_IFADESI
      ) as never,
    });
  }
}

/** Kullanicinin sectigi/cizdigi alanlar (ilce siniri dahil). */
export function secilenAlanKatmanlari(map: maplibregl.Map): void {
  if (!map.getSource(TAMAMLANAN_SOURCE_ID)) {
    map.addSource(TAMAMLANAN_SOURCE_ID, { type: "geojson", data: BOS_GEOJSON });

    map.addLayer({
      id: "tamamlanan-fill",
      type: "fill",
      source: TAMAMLANAN_SOURCE_ID,
      paint: { "fill-color": ["get", "renk"], "fill-opacity": 0.15 },
    });
    map.addLayer({
      id: "tamamlanan-yol",
      type: "line",
      source: TAMAMLANAN_SOURCE_ID,
      paint: { "line-color": ["get", "renk"], "line-width": 2 },
    });
  }
}

/** Kaydedilmis gorev bolgeleri ve guzergahlar - kesik cizgili kenarlik. */
export function bolgeKatmanlari(map: maplibregl.Map): void {
  if (!map.getSource(BOLGE_SOURCE_ID)) {
    map.addSource(BOLGE_SOURCE_ID, { type: "geojson", data: BOS_GEOJSON });

    map.addLayer({
      id: "bolge-fill",
      type: "fill",
      source: BOLGE_SOURCE_ID,
      filter: ["!=", ["geometry-type"], "LineString"],
      paint: { "fill-color": ["get", "renk"], "fill-opacity": 0.12 },
    });
    // Kesik kenarlik: kayitli bolgeyi anlik alan seciminden (duz cizgi) ayirir.
    map.addLayer({
      id: "bolge-yol",
      type: "line",
      source: BOLGE_SOURCE_ID,
      paint: {
        "line-color": ["get", "renk"],
        "line-width": 2.5,
        "line-dasharray": [3, 2],
      },
    });
    // Secili kayit: kesik kenarligin uzerine duz bir hat cizilir. Kalinlik
    // bilerek ayni; secimi kalinlik degil, cizginin duzlesmesi anlatir.
    map.addLayer({
      id: "bolge-secili",
      type: "line",
      source: BOLGE_SOURCE_ID,
      filter: ["==", ["get", "id"], ""],
      paint: {
        "line-color": ["get", "renk"],
        "line-width": 2.5,
        "line-opacity": 1,
      },
    });
    // Gorunmez kalin vurus seridi: ince bir cizgiyi tam uzerinden tutturmak
    // zor oldugu icin tiklama/imlec burada yakalanir.
    map.addLayer({
      id: "bolge-vurus",
      type: "line",
      source: BOLGE_SOURCE_ID,
      paint: { "line-color": "#000000", "line-width": 16, "line-opacity": 0 },
    });
  }
}

/** Sekli duzenlenen kayit - kalici katmandan AYRI kaynakta cizilir. */
export function sekilDuzenlemeKatmanlari(map: maplibregl.Map): void {
  if (!map.getSource(SEKIL_SOURCE_ID)) {
    map.addSource(SEKIL_SOURCE_ID, { type: "geojson", data: BOS_GEOJSON });

    // Duzenlenen sekil daha belirgin cizilir (duz ve kalin kenarlik).
    map.addLayer({
      id: "sekil-fill",
      type: "fill",
      source: SEKIL_SOURCE_ID,
      filter: ["!=", ["geometry-type"], "LineString"],
      paint: { "fill-color": ["get", "renk"], "fill-opacity": 0.22 },
    });
    map.addLayer({
      id: "sekil-yol",
      type: "line",
      source: SEKIL_SOURCE_ID,
      paint: { "line-color": ["get", "renk"], "line-width": 3 },
    });
  }
}

/** Devam eden alan cizimi. */
export function cizimKatmanlari(map: maplibregl.Map): void {
  if (!map.getSource(CIZIM_SOURCE_ID)) {
    map.addSource(CIZIM_SOURCE_ID, { type: "geojson", data: BOS_GEOJSON });

    map.addLayer({
      id: "cizim-fill",
      type: "fill",
      source: CIZIM_SOURCE_ID,
      filter: ["==", ["get", "tip"], "alan"],
      paint: { "fill-color": ["get", "renk"], "fill-opacity": 0.18 },
    });
    map.addLayer({
      id: "cizim-yol",
      type: "line",
      source: CIZIM_SOURCE_ID,
      filter: ["==", ["get", "tip"], "yol"],
      paint: { "line-color": ["get", "renk"], "line-width": 2 },
    });
    map.addLayer({
      id: "cizim-nokta",
      type: "circle",
      source: CIZIM_SOURCE_ID,
      filter: ["==", ["get", "tip"], "nokta"],
      paint: {
        "circle-radius": 5,
        "circle-color": ["get", "renk"],
        "circle-stroke-width": 2,
        "circle-stroke-color": "#ffffff",
      },
    });
  }
}

/** Mesafe olcumu. */
export function olcumKatmanlari(map: maplibregl.Map): void {
  if (!map.getSource(OLCUM_SOURCE_ID)) {
    map.addSource(OLCUM_SOURCE_ID, { type: "geojson", data: BOS_GEOJSON });

    map.addLayer({
      id: "olcum-yol",
      type: "line",
      source: OLCUM_SOURCE_ID,
      filter: ["==", ["geometry-type"], "LineString"],
      paint: { "line-color": OLCUM_RENK, "line-width": 2.5 },
    });
    map.addLayer({
      id: "olcum-nokta",
      type: "circle",
      source: OLCUM_SOURCE_ID,
      filter: ["==", ["geometry-type"], "Point"],
      paint: {
        "circle-radius": 5,
        "circle-color": OLCUM_RENK,
        "circle-stroke-width": 2,
        "circle-stroke-color": "#ffffff",
      },
    });
  }
}

/** Fareyi izleyen elastik onizleme cizgisi. */
export function dinamikOnizlemeKatmanlari(map: maplibregl.Map): void {
  if (!map.getSource(DINAMIK_SOURCE_ID)) {
    map.addSource(DINAMIK_SOURCE_ID, { type: "geojson", data: BOS_GEOJSON });

    // Alan isaretlenmeden onceki canli dolgu onizlemesi (imlec dahil).
    map.addLayer({
      id: "dinamik-onizleme-alan",
      type: "fill",
      source: DINAMIK_SOURCE_ID,
      filter: ["==", ["get", "tip"], "onizleme-alan"],
      paint: { "fill-color": ["get", "renk"], "fill-opacity": 0.1 },
    });
    // Kapanis onizlemesi: son nokta -> ilk nokta, kesik cizgiyle.
    map.addLayer({
      id: "dinamik-kapanis",
      type: "line",
      source: DINAMIK_SOURCE_ID,
      filter: ["==", ["get", "tip"], "kapanis"],
      paint: {
        "line-color": ["get", "renk"],
        "line-width": 1.5,
        "line-dasharray": [2, 2],
        "line-opacity": 0.75,
      },
    });
    // Elastik cizgi: son nokta -> fare imleci, fareyle birlikte canli guncellenir.
    map.addLayer({
      id: "dinamik-elastik",
      type: "line",
      source: DINAMIK_SOURCE_ID,
      filter: ["==", ["get", "tip"], "elastik"],
      paint: {
        "line-color": ["get", "renk"],
        "line-width": 1.5,
        "line-opacity": 0.9,
      },
    });
  }
}
