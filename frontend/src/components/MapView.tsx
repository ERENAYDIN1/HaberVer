import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";

import { fotoUrl } from "../api/reports";
import { ilSiniri, konumCozumle } from "../api/sinirlar";
import { HARITA_STILLERI, type HaritaStilId } from "../data/mapStyles";
import type { TamamlananAlan } from "../types/alan";
import {
  ASSET_SOURCE_LABELS,
  ASSET_STATUS_LABELS,
  ASSET_TYPE_LABELS,
} from "../types/asset";
import type { AssetFeature, AssetFeatureCollection } from "../types/asset";
import { REPORT_STATUS_LABELS } from "../types/report";
import type { ReportFeature, ReportFeatureCollection } from "../types/report";
import {
  alanEtiketi,
  cokHalkaliAlanM2,
  enBuyukHalkaMerkezi,
  poligonAlaniM2,
  poligonMerkezi,
} from "../utils/geo";
import { haritayaKapaliAttributionEkle } from "../utils/haritaAttribution";
import {
  ISTANBUL_IL_KODU,
  ISTANBUL_MERKEZI,
  ISTANBUL_SINIRLARI,
  istanbulMaskesiUygula,
  maskeKaynagiHazirla,
} from "../utils/istanbulMaskesi";

const SOURCE_ID = "assets";
const REPORTS_SOURCE_ID = "reports";
const CIZIM_SOURCE_ID = "cizim";
const TAMAMLANAN_SOURCE_ID = "tamamlanan-alanlar";
const OLCUM_SOURCE_ID = "olcum";
const DINAMIK_SOURCE_ID = "dinamik-onizleme";
const OLCUM_RENK = "#2563eb";
/** Ihbar (report) noktalari, kayitli/ihbar VARLIKLARINDAN (yesil/amber) acikca
 *  ayrilsin diye mor tonuyla gosterilir - "İhbarlar" sekmesindeki queue. */
const IHBAR_RENK = "#9333ea";

const BOS_KOLEKSIYON: AssetFeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

const BOS_GEOJSON = {
  type: "FeatureCollection",
  features: [],
} as unknown as GeoJSON.FeatureCollection;

/** Haritayi belirli bir bolgeye/noktaya ucurmak icin komut. `anahtar` her
 *  degistiginde yeniden tetiklenir (ayni hedefe tekrar ucmak istenirse bile
 *  benzersiz uretilmelidir, orn. crypto.randomUUID()). */
export type UcusHedefi =
  | { anahtar: string; tip: "sinir"; bounds: [[number, number], [number, number]] }
  | { anahtar: string; tip: "nokta"; merkez: [number, number]; zoom?: number };

interface MapViewProps {
  assets?: AssetFeatureCollection;
  /** "İhbarlar" sekmesi aktifken haritada gosterilecek ihbar (report) noktalari;
   *  varliklardan farkli renkte cizilir. Diger sekmelerde bos/undefined. */
  reports?: ReportFeatureCollection;
  /** Panelde secili ihbarin id'si (haritada vurgulanir + popup acilir). */
  seciliIhbarId?: string | null;
  /** Haritadaki bir ihbar noktasina tiklaninca. */
  onIhbarSec?: (id: string) => void;
  /** Panelde/haritada secili varligin id'si. */
  seciliId: string | null;
  /** Haritadaki bir noktaya tiklaninca. */
  onVarlikSec: (id: string) => void;
  /** Bos bir alana tiklaninca (koordinati forma doldurmak icin). */
  onHaritaTikla: (koordinat: { longitude: number; latitude: number }) => void;
  /** Alan secim modu acikken tiklamalar poligon kosesi olarak toplanir. */
  cizimModu: boolean;
  cizimNoktalari: [number, number][];
  onCizimNokta: (nokta: [number, number]) => void;
  /** Cizilen alanin dolgu/cizgi rengi (kullanici paletten secer). */
  cizimRengi: string;
  /** Tamamlanmis, uzerinde durmaya devam eden alan secimleri (birden fazla olabilir). */
  tamamlananAlanlar: TamamlananAlan[];
  /** Mesafe olcum modu acikken tiklamalar bir cizgiye nokta olarak eklenir. */
  olcumModu: boolean;
  olcumNoktalari: [number, number][];
  onOlcumNokta: (nokta: [number, number]) => void;
  /** Aktif harita stili (kontrol App.tsx'teki ust cubukta). */
  aktifStilId: HaritaStilId;
  /** Verildiginde harita bu hedefe ucar (il/ilce secimi, arama sonucu vb.). */
  ucusHedefi?: UcusHedefi | null;
  /** Harita her hareket ettiginde (pan/zoom) gorunen alanin sinirlarini bildirir;
   *  konum aramasini o an ekranda gorunen bolgeye onceliklendirmek icin kullanilir. */
  onGorunumDegisti?: (bounds: [[number, number], [number, number]]) => void;
}

export default function MapView({
  assets,
  reports,
  seciliIhbarId,
  onIhbarSec,
  seciliId,
  onVarlikSec,
  onHaritaTikla,
  cizimModu,
  cizimNoktalari,
  onCizimNokta,
  cizimRengi,
  tamamlananAlanlar,
  olcumModu,
  olcumNoktalari,
  onOlcumNokta,
  aktifStilId,
  ucusHedefi,
  onGorunumDegisti,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const hazirRef = useRef(false);
  /** Aktif cizimin alan etiketi (m2/ha) ve tamamlanan alanlarin kalici etiketleri. */
  const cizimEtiketRef = useRef<maplibregl.Marker | null>(null);
  const tamamlananEtiketleriRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  /** Istanbul il sinirinin halkalari - bir kez getirilir, stil degisiminde
   *  maske katmani yeniden kurulunca buradan tekrar uygulanir. */
  const istanbulSiniriRef = useRef<[number, number][][] | null>(null);

  // Ilk render'daki stil, harita bir kez kurulurken kullanilir.
  const ilkStilIdRef = useRef(aktifStilId);
  const uygulananStilRef = useRef(aktifStilId);

  // Callback'leri ve degisen degerleri ref'te tutariz; boylece harita bir kez
  // kurulur ve harita stili degistiginde de en guncel veriyi yeniden uygulayabiliriz.
  const onVarlikSecRef = useRef(onVarlikSec);
  const onHaritaTiklaRef = useRef(onHaritaTikla);
  const onCizimNoktaRef = useRef(onCizimNokta);
  const cizimModuRef = useRef(cizimModu);
  const cizimRengiRef = useRef(cizimRengi);
  const tamamlananAlanlarRef = useRef(tamamlananAlanlar);
  const onOlcumNoktaRef = useRef(onOlcumNokta);
  const onGorunumDegistiRef = useRef(onGorunumDegisti);
  const olcumModuRef = useRef(olcumModu);
  const olcumNoktalariRef = useRef(olcumNoktalari);
  const assetsRef = useRef(assets);
  const reportsRef = useRef(reports);
  const seciliIhbarIdRef = useRef(seciliIhbarId);
  const onIhbarSecRef = useRef(onIhbarSec);
  const cizimNoktalariRef = useRef(cizimNoktalari);
  const seciliIdRef = useRef(seciliId);
  /** Cizim/olcum sirasinda son bilinen fare konumu (elastik cizgi icin). */
  const sonFareRef = useRef<[number, number] | null>(null);
  useEffect(() => {
    onVarlikSecRef.current = onVarlikSec;
    onHaritaTiklaRef.current = onHaritaTikla;
    onCizimNoktaRef.current = onCizimNokta;
    cizimModuRef.current = cizimModu;
    cizimRengiRef.current = cizimRengi;
    tamamlananAlanlarRef.current = tamamlananAlanlar;
    onOlcumNoktaRef.current = onOlcumNokta;
    onGorunumDegistiRef.current = onGorunumDegisti;
    olcumModuRef.current = olcumModu;
    olcumNoktalariRef.current = olcumNoktalari;
    assetsRef.current = assets;
    reportsRef.current = reports;
    seciliIhbarIdRef.current = seciliIhbarId;
    onIhbarSecRef.current = onIhbarSec;
    cizimNoktalariRef.current = cizimNoktalari;
    seciliIdRef.current = seciliId;
  });

  // Layer-scoped click/hover callback'leri sabit referans olarak tutulur ki
  // stil degisiminde map.off/map.on ile guvenle yeniden baglanabilsin.
  const assetsTiklandiRef = useRef((e: maplibregl.MapLayerMouseEvent) => {
    if (cizimModuRef.current || olcumModuRef.current) return;
    const id = e.features?.[0]?.properties?.id;
    if (typeof id === "string") onVarlikSecRef.current(id);
  });
  const reportsTiklandiRef = useRef((e: maplibregl.MapLayerMouseEvent) => {
    if (cizimModuRef.current || olcumModuRef.current) return;
    const id = e.features?.[0]?.properties?.id;
    if (typeof id === "string") onIhbarSecRef.current?.(id);
  });
  const fareGirdiRef = useRef(() => {
    const map = mapRef.current;
    if (map) map.getCanvas().style.cursor = "pointer";
  });
  const fareCiktiRef = useRef(() => {
    const map = mapRef.current;
    if (map) map.getCanvas().style.cursor = "";
  });
  const haritaTiklandiRef = useRef((e: maplibregl.MapMouseEvent) => {
    const map = mapRef.current;
    if (!map) return;
    const koordinat: [number, number] = [
      Number(e.lngLat.lng.toFixed(6)),
      Number(e.lngLat.lat.toFixed(6)),
    ];

    if (cizimModuRef.current) {
      onCizimNoktaRef.current(koordinat);
      return;
    }
    if (olcumModuRef.current) {
      onOlcumNoktaRef.current(koordinat);
      return;
    }

    const katmanlar = ["assets-circle"];
    if (map.getLayer("reports-circle")) katmanlar.push("reports-circle");
    const uzerinde = map.queryRenderedFeatures(e.point, { layers: katmanlar });
    if (uzerinde.length === 0) {
      onHaritaTiklaRef.current({ longitude: koordinat[0], latitude: koordinat[1] });
    }
  });
  /** Harita her hareket ettiginde gorunen alani bildirir (arama onceliklendirmesi icin). */
  const gorunumDegistiRef = useRef(() => {
    const map = mapRef.current;
    if (!map || !onGorunumDegistiRef.current) return;
    const sinirlar = map.getBounds();
    onGorunumDegistiRef.current([
      [sinirlar.getWest(), sinirlar.getSouth()],
      [sinirlar.getEast(), sinirlar.getNorth()],
    ]);
  });

  /** Cizim/olcum sirasinda fareyi takip ederek elastik onizleme cizgisini gunceller. */
  const fareHareketRef = useRef((e: maplibregl.MapMouseEvent) => {
    if (!cizimModuRef.current && !olcumModuRef.current) return;
    sonFareRef.current = [
      Number(e.lngLat.lng.toFixed(6)),
      Number(e.lngLat.lat.toFixed(6)),
    ];
    const map = mapRef.current;
    if (map) dinamikUygula(map);
  });

  /** Alan buyuklugu etiketi icin stillenmis bir DOM elemani olusturur. */
  function etiketElemaniOlustur(): HTMLDivElement {
    const el = document.createElement("div");
    el.style.cssText =
      "pointer-events:none; background:rgba(15,23,42,0.85); color:#fff; " +
      "font:600 11px system-ui,-apple-system,sans-serif; padding:2px 7px; " +
      "border-radius:4px; white-space:nowrap;";
    return el;
  }

  /** Aktif cizimin (fare dahil canli onizleme) alan etiketini gunceller. */
  function cizimEtiketiUygula(map: maplibregl.Map) {
    const noktalar = cizimNoktalariRef.current;
    if (!cizimModuRef.current || noktalar.length < 3) {
      cizimEtiketRef.current?.remove();
      cizimEtiketRef.current = null;
      return;
    }

    const fare = sonFareRef.current;
    const halka = fare ? [...noktalar, fare] : noktalar;
    const metin = alanEtiketi(poligonAlaniM2(halka));
    const merkez = poligonMerkezi(halka);

    if (!cizimEtiketRef.current) {
      cizimEtiketRef.current = new maplibregl.Marker({ element: etiketElemaniOlustur() })
        .setLngLat(merkez)
        .addTo(map);
    } else {
      cizimEtiketRef.current.setLngLat(merkez);
    }
    cizimEtiketRef.current.getElement().textContent = metin;
  }

  /** Tamamlanmis her alanin kendi kalici etiketini (m2/ha) senkronize eder. */
  function tamamlananEtiketleriUygula(map: maplibregl.Map) {
    const guncelIdler = new Set<string>();

    for (const alan of tamamlananAlanlarRef.current) {
      guncelIdler.add(alan.id);
      const buyukluk = alanEtiketi(cokHalkaliAlanM2(alan.noktalar));
      const metin = alan.etiket ? `${alan.etiket} · ${buyukluk}` : buyukluk;
      // Birden fazla halka varsa (orn. Istanbul'un iki yakasi) etiket en
      // buyuk parcanin ustune konur, iki parca arasindaki denizin ortasina degil.
      const merkez = enBuyukHalkaMerkezi(alan.noktalar);

      let marker = tamamlananEtiketleriRef.current.get(alan.id);
      if (!marker) {
        marker = new maplibregl.Marker({ element: etiketElemaniOlustur() })
          .setLngLat(merkez)
          .addTo(map);
        tamamlananEtiketleriRef.current.set(alan.id, marker);
      } else {
        marker.setLngLat(merkez);
      }
      marker.getElement().textContent = metin;
    }

    for (const [id, marker] of tamamlananEtiketleriRef.current) {
      if (!guncelIdler.has(id)) {
        marker.remove();
        tamamlananEtiketleriRef.current.delete(id);
      }
    }
  }

  /** Istanbul il siniri getirilince (ya da stil degisimi sonrasi katman
   *  yeniden kurulunca) maske kaynagina uygular - bkz. utils/istanbulMaskesi.ts. */
  function maskeUygula(map: maplibregl.Map) {
    istanbulMaskesiUygula(map, istanbulSiniriRef.current);
  }

  // --- Veriyi haritadaki kaynaga uygular (guncel ref degerlerinden okur) ---
  function veriUygula(map: maplibregl.Map) {
    const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    source?.setData(
      (assetsRef.current ?? BOS_KOLEKSIYON) as unknown as GeoJSON.FeatureCollection
    );
  }

  /** Ihbar (report) noktalarini haritadaki kaynaga uygular. */
  function reportsUygula(map: maplibregl.Map) {
    const source = map.getSource(REPORTS_SOURCE_ID) as
      | maplibregl.GeoJSONSource
      | undefined;
    source?.setData(
      (reportsRef.current ?? BOS_GEOJSON) as unknown as GeoJSON.FeatureCollection
    );
  }

  function cizimUygula(map: maplibregl.Map) {
    const source = map.getSource(CIZIM_SOURCE_ID) as
      | maplibregl.GeoJSONSource
      | undefined;
    if (!source) return;

    const noktalar = cizimNoktalariRef.current;
    const renk = cizimRengiRef.current;
    const features: GeoJSON.Feature[] = noktalar.map((nokta) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: nokta },
      properties: { tip: "nokta", renk },
    }));

    if (noktalar.length >= 2) {
      features.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates: noktalar },
        properties: { tip: "yol", renk },
      });
    }
    if (noktalar.length >= 3) {
      features.push({
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [[...noktalar, noktalar[0]]] },
        properties: { tip: "alan", renk },
      });
    }

    source.setData({ type: "FeatureCollection", features });
    dinamikUygula(map);
  }

  /** Tamamlanmis alan secimlerini (birden fazla olabilir) haritada kalici gosterir. */
  function tamamlananUygula(map: maplibregl.Map) {
    const source = map.getSource(TAMAMLANAN_SOURCE_ID) as
      | maplibregl.GeoJSONSource
      | undefined;
    if (!source) return;

    const features: GeoJSON.Feature[] = tamamlananAlanlarRef.current.map((alan) => ({
      type: "Feature",
      geometry:
        alan.noktalar.length === 1
          ? { type: "Polygon", coordinates: [[...alan.noktalar[0], alan.noktalar[0][0]]] }
          : {
              type: "MultiPolygon",
              coordinates: alan.noktalar.map((halka) => [[...halka, halka[0]]]),
            },
      properties: { renk: alan.renk },
    }));

    source.setData({ type: "FeatureCollection", features });
    tamamlananEtiketleriUygula(map);
  }

  function olcumUygula(map: maplibregl.Map) {
    const source = map.getSource(OLCUM_SOURCE_ID) as
      | maplibregl.GeoJSONSource
      | undefined;
    if (!source) return;

    const noktalar = olcumNoktalariRef.current;
    const features: GeoJSON.Feature[] = noktalar.map((nokta) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: nokta },
      properties: {},
    }));
    if (noktalar.length >= 2) {
      features.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates: noktalar },
        properties: {},
      });
    }

    source.setData({ type: "FeatureCollection", features });
    dinamikUygula(map);
  }

  /** Aktif cizime gore fareyi izleyen elastik cizgi + poligonu kapatacak
   *  kenarin onizlemesini gunceller. Nokta listeleri degismeden, sadece
   *  fare hareket ettikce cagrilir - React state'e dokunmaz. */
  function dinamikUygula(map: maplibregl.Map) {
    const source = map.getSource(DINAMIK_SOURCE_ID) as
      | maplibregl.GeoJSONSource
      | undefined;
    if (!source) return;

    const fare = sonFareRef.current;
    const features: GeoJSON.Feature[] = [];

    if (cizimModuRef.current && cizimNoktalariRef.current.length > 0) {
      const noktalar = cizimNoktalariRef.current;
      const son = noktalar[noktalar.length - 1];
      const renk = cizimRengiRef.current;
      if (fare) {
        features.push({
          type: "Feature",
          geometry: { type: "LineString", coordinates: [son, fare] },
          properties: { tip: "elastik", renk },
        });
      }
      if (noktalar.length >= 2) {
        // Kapanis kenari: fare biliniyorsa imlecten, degilse son noktadan ilk noktaya.
        const kapanisBaslangic = fare ?? son;
        features.push({
          type: "Feature",
          geometry: { type: "LineString", coordinates: [kapanisBaslangic, noktalar[0]] },
          properties: { tip: "kapanis", renk },
        });
        if (fare) {
          // Alan isaretlenmeden once, imlecin oldugu yere kadar canli dolgu onizlemesi.
          features.push({
            type: "Feature",
            geometry: {
              type: "Polygon",
              coordinates: [[...noktalar, fare, noktalar[0]]],
            },
            properties: { tip: "onizleme-alan", renk },
          });
        }
      }
    } else if (olcumModuRef.current && olcumNoktalariRef.current.length > 0 && fare) {
      const noktalar = olcumNoktalariRef.current;
      const son = noktalar[noktalar.length - 1];
      features.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates: [son, fare] },
        properties: { tip: "elastik", renk: OLCUM_RENK },
      });
    }

    source.setData({ type: "FeatureCollection", features });
    cizimEtiketiUygula(map);
  }

  function secimUygula(map: maplibregl.Map) {
    const id = seciliIdRef.current;
    map.setFilter("assets-selected", ["==", ["get", "id"], id ?? ""]);

    popupRef.current?.remove();
    popupRef.current = null;

    if (!id || !assetsRef.current) return;
    const secili = assetsRef.current.features.find((f) => f.properties.id === id);
    if (!secili) return;

    const popup = new maplibregl.Popup({ offset: 14, closeButton: false })
      .setLngLat(secili.geometry.coordinates)
      .setHTML(popupIcerigi(secili))
      .addTo(map);
    popupRef.current = popup;
    konumSatiriDoldur(popup, secili);
  }

  /** Secili ihbari haritada vurgular ve popup acar (varlik secimiyle ayni
   *  popup'i paylasir; ikisi ayni anda secili olmaz - farkli sekmeler). */
  function secimIhbarUygula(map: maplibregl.Map) {
    if (!map.getLayer("reports-selected")) return;
    const id = seciliIhbarIdRef.current;
    map.setFilter("reports-selected", ["==", ["get", "id"], id ?? ""]);

    if (!id) return;
    const secili = reportsRef.current?.features.find(
      (f) => f.properties.id === id
    );
    if (!secili) return;

    popupRef.current?.remove();
    popupRef.current = new maplibregl.Popup({ offset: 14, closeButton: false })
      .setLngLat(secili.geometry.coordinates)
      .setHTML(ihbarPopupIcerigi(secili))
      .addTo(map);
  }

  /** Kaynaklar/katmanlar yoksa (ilk yukleme ya da stil degisimi sonrasi) yeniden kurar. */
  function kaynaklariHazirla(map: maplibregl.Map) {
    // Maske en altta eklenir ki varlik/cizim katmanlarini ortmesin.
    maskeKaynagiHazirla(map);

    if (!map.getSource(SOURCE_ID)) {
      map.addSource(SOURCE_ID, { type: "geojson", data: BOS_KOLEKSIYON });

      map.addLayer({
        id: "assets-circle",
        type: "circle",
        source: SOURCE_ID,
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 5, 16, 10],
          "circle-color": [
            "match",
            ["get", "status"],
            "bakim_lazim",
            "#d97706",
            "#059669",
          ],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });

      map.addLayer({
        id: "assets-selected",
        type: "circle",
        source: SOURCE_ID,
        filter: ["==", ["get", "id"], ""],
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 11, 16, 18],
          "circle-color": "transparent",
          "circle-stroke-width": 3,
          "circle-stroke-color": "#0f766e",
        },
      });
    }

    if (!map.getSource(REPORTS_SOURCE_ID)) {
      map.addSource(REPORTS_SOURCE_ID, { type: "geojson", data: BOS_GEOJSON });

      // Ihbar noktalari - varliklardan (yesil/amber) acikca ayrilsin diye mor.
      map.addLayer({
        id: "reports-circle",
        type: "circle",
        source: REPORTS_SOURCE_ID,
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 5, 16, 10],
          "circle-color": IHBAR_RENK,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });
      map.addLayer({
        id: "reports-selected",
        type: "circle",
        source: REPORTS_SOURCE_ID,
        filter: ["==", ["get", "id"], ""],
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 11, 16, 18],
          "circle-color": "transparent",
          "circle-stroke-width": 3,
          "circle-stroke-color": "#6b21a8",
        },
      });
    }

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

    // Idempotent baglama: once cikar, sonra ekle - stil degisiminde çift kayit olmasin.
    map.off("click", "assets-circle", assetsTiklandiRef.current);
    map.on("click", "assets-circle", assetsTiklandiRef.current);
    map.off("mouseenter", "assets-circle", fareGirdiRef.current);
    map.on("mouseenter", "assets-circle", fareGirdiRef.current);
    map.off("mouseleave", "assets-circle", fareCiktiRef.current);
    map.on("mouseleave", "assets-circle", fareCiktiRef.current);
    map.off("click", "reports-circle", reportsTiklandiRef.current);
    map.on("click", "reports-circle", reportsTiklandiRef.current);
    map.off("mouseenter", "reports-circle", fareGirdiRef.current);
    map.on("mouseenter", "reports-circle", fareGirdiRef.current);
    map.off("mouseleave", "reports-circle", fareCiktiRef.current);
    map.on("mouseleave", "reports-circle", fareCiktiRef.current);
    map.off("click", haritaTiklandiRef.current);
    map.on("click", haritaTiklandiRef.current);
    map.off("mousemove", fareHareketRef.current);
    map.on("mousemove", fareHareketRef.current);
    map.off("moveend", gorunumDegistiRef.current);
    map.on("moveend", gorunumDegistiRef.current);

    hazirRef.current = true;
    maskeUygula(map);
    veriUygula(map);
    reportsUygula(map);
    cizimUygula(map);
    tamamlananUygula(map);
    olcumUygula(map);
    secimUygula(map);
    secimIhbarUygula(map);
    gorunumDegistiRef.current();
  }

  // --- Haritayi bir kez kur ---
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const ilkStil = HARITA_STILLERI.find(
      (s) => s.id === ilkStilIdRef.current
    )!.stil;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: ilkStil,
      center: ISTANBUL_MERKEZI,
      zoom: 11,
      maxBounds: ISTANBUL_SINIRLARI,
      attributionControl: false,
    });
    mapRef.current = map;

    map.addControl(new maplibregl.NavigationControl(), "bottom-right");
    map.addControl(new maplibregl.ScaleControl(), "bottom-left");
    haritayaKapaliAttributionEkle(map);

    map.on("load", () => kaynaklariHazirla(map));

    // Istanbul il sinirini bir kez getirir; maske katmani bu veriyle dolar.
    let iptal = false;
    ilSiniri(ISTANBUL_IL_KODU)
      .then((sinir) => {
        if (iptal) return;
        istanbulSiniriRef.current = sinir.noktalar;
        if (hazirRef.current) maskeUygula(map);
      })
      .catch(() => {
        // Sinir getirilemezse maske sessizce bos kalir, harita yine calisir.
      });

    return () => {
      iptal = true;
      popupRef.current?.remove();
      cizimEtiketRef.current?.remove();
      for (const marker of tamamlananEtiketleriRef.current.values()) marker.remove();
      tamamlananEtiketleriRef.current.clear();
      map.remove();
      mapRef.current = null;
      hazirRef.current = false;
    };
  }, []);

  // --- Harita stili degisince: yeni stili yukle, kaynaklari yeniden kur ---
  useEffect(() => {
    const map = mapRef.current;
    const tanim = HARITA_STILLERI.find((s) => s.id === aktifStilId);
    if (!map || !tanim) return;
    // Ilk kurulumda harita zaten bu stille olusturuldu; tekrar yukleme.
    if (uygulananStilRef.current === aktifStilId) return;
    uygulananStilRef.current = aktifStilId;

    hazirRef.current = false;
    map.once("style.load", () => kaynaklariHazirla(map));
    map.setStyle(tanim.stil);
  }, [aktifStilId]);

  // --- Veri degisince kaynagi guncelle ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (hazirRef.current) veriUygula(map);
  }, [assets]);

  // --- Ihbar noktalari degisince kaynagi guncelle ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (hazirRef.current) reportsUygula(map);
  }, [reports]);

  // --- Secili ihbar degisince: vurgula, popup ac, konumuna ucur ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !hazirRef.current) return;

    secimIhbarUygula(map);

    if (seciliIhbarId && reports) {
      const secili = reports.features.find(
        (f) => f.properties.id === seciliIhbarId
      );
      if (secili) {
        map.flyTo({
          center: secili.geometry.coordinates,
          zoom: Math.max(map.getZoom(), 15),
          duration: 900,
        });
      }
    }
  }, [seciliIhbarId, reports]);

  // --- Cizim noktalarini haritada goster ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (hazirRef.current) cizimUygula(map);
  }, [cizimNoktalari]);

  // --- Cizim rengi degisince mevcut alani/cizgiyi yeniden boya ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !hazirRef.current) return;
    cizimUygula(map);
  }, [cizimRengi]);

  // --- Tamamlanmis alanlar degisince (yeni eklendi/kaldirildi) haritayi guncelle ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (hazirRef.current) tamamlananUygula(map);
  }, [tamamlananAlanlar]);

  // --- Olcum noktalarini haritada goster ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (hazirRef.current) olcumUygula(map);
  }, [olcumNoktalari]);

  // --- Cizim/olcum modunda imleci artiya cevir, yeni oturumda elastik cizgiyi sifirla ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getCanvas().style.cursor = cizimModu || olcumModu ? "crosshair" : "";
    if (cizimModu || olcumModu) {
      sonFareRef.current = null;
      if (hazirRef.current) dinamikUygula(map);
    }
  }, [cizimModu, olcumModu]);

  // --- Bir ucus hedefi verilince: sinira/noktaya ucar ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ucusHedefi) return;

    if (ucusHedefi.tip === "sinir") {
      map.fitBounds(ucusHedefi.bounds, { padding: 40, duration: 900 });
    } else {
      map.flyTo({
        center: ucusHedefi.merkez,
        zoom: ucusHedefi.zoom ?? Math.max(map.getZoom(), 15),
        duration: 900,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ucusHedefi?.anahtar]);

  // --- Secim degisince: vurgula, ucur, popup ac ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !hazirRef.current) return;

    secimUygula(map);

    if (seciliId && assets) {
      const secili = assets.features.find((f) => f.properties.id === seciliId);
      if (secili) {
        map.flyTo({
          center: secili.geometry.coordinates,
          zoom: Math.max(map.getZoom(), 15),
          duration: 900,
        });
      }
    }
  }, [seciliId, assets]);

  return <div ref={containerRef} className="greenasset-harita h-full w-full" />;
}

function popupIcerigi(asset: AssetFeature): string {
  const { name, type, status, source, brand_model, install_date, photo_url } =
    asset.properties;
  const bakim = status === "bakim_lazim";
  const foto = fotoUrl(photo_url);
  const satirlar = [
    brand_model ? `<div>${kacis(brand_model)}</div>` : "",
    install_date ? `<div>Kurulum: ${kacis(install_date)}</div>` : "",
  ].join("");

  return `
    <div style="font-family: system-ui, sans-serif; min-width: 170px">
      ${
        foto
          ? `<img src="${kacis(foto)}" style="width:100%; max-height:120px; object-fit:cover; margin-bottom:6px; border:1px solid #e2e8f0;" />`
          : ""
      }
      <div style="font-weight: 600; margin-bottom: 4px">${kacis(name)}</div>
      <div style="color:#475569; font-size:12px">${ASSET_TYPE_LABELS[type]}</div>
      <div style="margin-top:6px; display:flex; gap:4px; flex-wrap:wrap">
        <span style="
          display:inline-block; padding:2px 8px; border-radius:9999px;
          font-size:11px; font-weight:500;
          background:${bakim ? "#fef3c7" : "#d1fae5"};
          color:${bakim ? "#92400e" : "#065f46"}">
          ${ASSET_STATUS_LABELS[status]}
        </span>
        <span style="
          display:inline-block; padding:2px 8px; border-radius:9999px;
          font-size:11px; font-weight:500;
          background:${source === "ihbar" ? "#fef3c7" : "#d1fae5"};
          color:${source === "ihbar" ? "#92400e" : "#065f46"}">
          ${ASSET_SOURCE_LABELS[source]}
        </span>
      </div>
      <div style="color:#64748b; font-size:11px; margin-top:6px">${satirlar}</div>
      <div class="popup-konum" style="color:#64748b; font-size:11px; margin-top:2px"></div>
    </div>
  `;
}

/** Popup acildiktan sonra ilce/mahalle bilgisini backend'den cekip yerlestirir. */
async function konumSatiriDoldur(popup: maplibregl.Popup, asset: AssetFeature) {
  const [lon, lat] = asset.geometry.coordinates;
  try {
    const konum = await konumCozumle(lat, lon);
    const metin = [konum.mahalle?.ad, konum.ilce?.ad].filter(Boolean).join(", ");
    if (!metin) return;
    const el = popup.getElement()?.querySelector(".popup-konum");
    if (el) el.textContent = `📍 ${metin}`;
  } catch {
    // Konum cozumlenemezse satiri bos birak.
  }
}

function ihbarPopupIcerigi(report: ReportFeature): string {
  const { name, type, status, note, photo_url } = report.properties;
  const foto = fotoUrl(photo_url);
  const durumRenk: Record<string, { bg: string; fg: string }> = {
    beklemede: { bg: "#fef3c7", fg: "#92400e" },
    onaylandi: { bg: "#d1fae5", fg: "#065f46" },
    reddedildi: { bg: "#fee2e2", fg: "#991b1b" },
  };
  const dr = durumRenk[status] ?? durumRenk.beklemede;

  return `
    <div style="font-family: system-ui, sans-serif; min-width: 180px">
      ${
        foto
          ? `<img src="${kacis(foto)}" style="width:100%; max-height:120px; object-fit:cover; margin-bottom:6px; border:1px solid #e2e8f0;" />`
          : ""
      }
      <div style="font-weight: 600; margin-bottom: 4px">${kacis(name)}</div>
      <div style="color:#475569; font-size:12px">${ASSET_TYPE_LABELS[type]} · İhbar</div>
      <div style="margin-top:6px">
        <span style="
          display:inline-block; padding:2px 8px; border-radius:9999px;
          font-size:11px; font-weight:500; background:${dr.bg}; color:${dr.fg}">
          ${REPORT_STATUS_LABELS[status]}
        </span>
      </div>
      ${
        note
          ? `<div style="color:#64748b; font-size:11px; margin-top:6px">${kacis(note)}</div>`
          : ""
      }
    </div>
  `;
}

/** Kullanici verisini HTML'e gomerken kacis uygular. */
function kacis(metin: string): string {
  return metin
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
