import type maplibregl from "maplibre-gl";

import { BOS_GEOJSON } from "./geojson";
import {
  TALEP_OPAKLIK_IFADESI,
  tipRengiIfadesi,
  VARLIK_UYARI_RENK,
} from "./haritaIkonlari";
import { EKIP_VARSAYILAN_RENK } from "./haritaPopup";
import type { AssetFeatureCollection } from "../types/asset";

/** Varlik isaretcisindeki atama noktasinin rengi: saha ekibi pininin rengiyle
 *  ayni aile (bkz. haritaPopup.ts::EKIP_VARSAYILAN_RENK) - kullanici bu rengi
 *  zaten ekip pininden taniyor. Katmanin kendisi MapView'da eklenir (bkz.
 *  ATAMA_KAYMA_EKSENI). */
export const ATAMA_RENGI = EKIP_VARSAYILAN_RENK;

/** Haritadaki kaynak + katman kurulumu, aileye gore ayrilmis halde. Buradaki
 *  fonksiyonlar yalnizca `map`'e dokunur; olay baglama ve veri yazma guncel
 *  prop/ref degerlerine bagli oldugu icin MapView'da kalir.
 *
 *  Hepsi idempotenttir: stil degisiminde MapLibre tum kaynaklari dusurdugu
 *  icin ayni fonksiyonlar tekrar cagrilir. */

export const SOURCE_ID = "assets";
export const REPORTS_SOURCE_ID = "reports";
/** Cizgi/alan olarak bildirilen taleplerin HAM SEKLI. Pin katmanlari
 *  `REPORTS_SOURCE_ID`'de nokta geometrisiyle calismaya devam eder; sekil ayri
 *  kaynakta cizilir. Boylece pin/glif/halka/rozet/secim zinciri cok geometriye
 *  uyarlanmak zorunda kalmadi. */
export const TALEP_SEKIL_SOURCE_ID = "talep-sekil";
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
/** Rozetlerin gorunmeye basladigi zoom (hem varlik hem talep tarafinda). */
export const ROZET_MINZOOM = 12.5;

/** Isaretci olculeri: daireler glif okunacak kadar belirgin, ama uzaklasinca
 *  (z10-12) birbirine girmesin diye o uctaki yaricaplar kucuk. */
export const ISARETCI = {
  /** Varlik dairesi yaricapi (zoom 10 -> 16 interpolasyonu). */
  varlikYaricap: ["interpolate", ["linear"], ["zoom"], 10, 4.5, 16, 10],
  /** Talep pininin ucundaki yer golgesi (pin havada durmasin). */
  talepGolgeYaricap: ["interpolate", ["linear"], ["zoom"], 10, 1.5, 16, 3],
  /** "Bakim lazim" amber uyari halkasi; ana dairenin disinda kalir. */
  uyariYaricap: ["interpolate", ["linear"], ["zoom"], 10, 6.5, 16, 12.5],
  /** Secim halkasi; uyari halkasinin da disinda. */
  varlikSecimYaricap: ["interpolate", ["linear"], ["zoom"], 10, 8, 16, 14],
  beyazHalka: 2,
  /** Atama noktasi (bkz. assets-atama): ana daireden kucuk, sabit yaricap -
   *  cok kucuk zoomda dahi ayirt edilebilir kalsin diye interpolasyon yok. */
  atamaYaricap: 3.5,
} as const;

/** Atama noktasinin sag-alt koseye kaymasi (px).
 *
 *  DIKKAT: `circle-translate` array tipinde bir paint property'dir ve
 *  expression DIZININ KENDISI olmak zorundadir - `[expr, expr]` gibi eleman
 *  basina expression style-spec dogrulamasindan gecmez, MapLibre property'yi
 *  sessizce reddedip varsayilana ([0,0]) duser ve nokta dairenin tam ortasinda
 *  kalip gorunmez olur. Bu yuzden `interpolate` bir DIZI dondurur.
 *
 *  Olcu ANA DAIREYE degil `uyariYaricap`a (amber halka) gore: bakim bekleyen
 *  varlikta halka ana dairenin disindadir ve nokta ana daireye gore
 *  hizalanirsa halkanin ALTINDA kalip yariya kadar gizleniyordu. Halka
 *  yaricapinin kosegen izdusumu (r/√2) noktayi kenara oturtur. */
export const ATAMA_KAYMASI = [
  "interpolate",
  ["linear"],
  ["zoom"],
  10,
  ["literal", [4.6, 4.6]],
  16,
  ["literal", [8.8, 8.8]],
] as unknown as maplibregl.ExpressionSpecification;

/** Isaretcinin altina yumusak golge: asagi kaydirilmis, bulaniklastirilmis
 *  siyah daire - altliktan bagimsiz derinlik hissi verir. */
export function golgeBoyasi(yaricap: unknown, opaklik: unknown = 1): Record<string, unknown> {
  return {
    "circle-radius": yaricap,
    "circle-color": "#0f172a",
    // Sonumlenen taleplerde golge de sonmeli.
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
        "circle-color": tipRengiIfadesi() as never,
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
        "circle-stroke-width": 1,
        "circle-stroke-opacity": 0.6,
        "circle-stroke-color": "#000000",
      },
    });

    // Atama noktasi (assets-atama) BURADA EKLENMEZ: assets-icon/assets-rozet
    // symbol katmanlari glif goruntuleri yuklendikten sonra ASENKRON eklenir
    // (bkz. MapView::tipIkonlariniHazirla().then()) ve haritada bu circle
    // katmanlarindan sonra/USTUNDE kalir. Ayni z-siraya girsin diye atama
    // noktasi da o asenkron blokta, assets-rozet'ten SONRA eklenir.
  }
}

/** Vatandas talepleri: yer golgesi + secim pini + pin + glif + halka/rozet. */
export function talepKatmanlari(map: maplibregl.Map): void {
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
        ISARETCI.talepGolgeYaricap,
        TALEP_OPAKLIK_IFADESI
      ) as never,
    });
  }
}

/** Cizgi/alan taleplerin ham sekli. Pinlerin ALTINDA cizilir: sekil isin
 *  buyuklugunu anlatir, pin ise isin kendisidir ve ustte kalmali.
 *
 *  Renk kaydin gorunum rengidir (bekleyen mor, tamir gri...), pinle ayni
 *  sinyali tasisin diye - `renk` ozelligini MapView yazar. */
export function talepSekilKatmanlari(map: maplibregl.Map): void {
  if (!map.getSource(TALEP_SEKIL_SOURCE_ID)) {
    map.addSource(TALEP_SEKIL_SOURCE_ID, { type: "geojson", data: BOS_GEOJSON });

    map.addLayer({
      id: "talep-sekil-fill",
      type: "fill",
      source: TALEP_SEKIL_SOURCE_ID,
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: {
        "fill-color": ["get", "renk"],
        "fill-opacity": ["*", 0.16, ["coalesce", ["get", "opaklik"], 1]],
      },
    });
    map.addLayer({
      id: "talep-sekil-yol",
      type: "line",
      source: TALEP_SEKIL_SOURCE_ID,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": ["get", "renk"],
        "line-width": 3,
        "line-opacity": ["coalesce", ["get", "opaklik"], 1],
      },
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
      filter: ["==", ["geometry-type"], "Polygon"],
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
    // Guzergah yonu: hat boyunca dizilen oklar cizim yonunu isaret eder.
    // Yon burada bir suslemedir degil is bilgisidir - kaydin ILK noktasi saha
    // ekibinin yol tarifi hedefidir, yani hat bastan sona yurunur.
    map.addLayer({
      id: "bolge-yon",
      type: "symbol",
      source: BOLGE_SOURCE_ID,
      filter: ["==", ["geometry-type"], "LineString"],
      layout: {
        "symbol-placement": "line",
        "symbol-spacing": 70,
        "text-field": "▶",
        "text-size": 11,
        "text-keep-upright": false,
        "text-allow-overlap": true,
        "text-ignore-placement": true,
      },
      paint: {
        "text-color": ["get", "renk"],
        "text-halo-color": "#ffffff",
        "text-halo-width": 1.5,
      },
    });
    // Guzergahin baslangic ucu: ekibin yol tarifi hedefi tam bu nokta.
    map.addLayer({
      id: "bolge-bas",
      type: "circle",
      source: BOLGE_SOURCE_ID,
      filter: ["==", ["get", "bas"], true],
      paint: {
        "circle-radius": 5,
        "circle-color": ["get", "renk"],
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2,
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
