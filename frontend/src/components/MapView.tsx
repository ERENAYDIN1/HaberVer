import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";

import { fotoUrl } from "../api/reports";
import { ilSiniri, konumCozumle } from "../api/sinirlar";
import { HARITA_STILLERI, type HaritaStilId } from "../data/mapStyles";
import type { TamamlananAlan } from "../types/alan";
import {
  ASSET_SOURCE_LABELS,
  ASSET_TYPE_LABELS,
  durumEtiketi,
} from "../types/asset";
import type { AssetFeature, AssetFeatureCollection } from "../types/asset";
import { REPORT_STATUS_LABELS } from "../types/report";
import type { ReportFeature, ReportFeatureCollection } from "../types/report";
import { MAKS_AKTIF_GOREV } from "../types/saha";
import type { EkipGorevleri } from "../types/saha";
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

/** Ihbar noktasi durumuna gore renk: beklemede mor (yeni ihbar kimligi),
 *  onaylandi yesil (cozuldu), reddedildi kirmizi. Sag-ustteki katman
 *  filtresindeki durum rozetleriyle birebir ayni palet. */
const IHBAR_DURUM_RENGI_IFADESI = [
  "match",
  ["get", "status"],
  "onaylandi",
  "#059669",
  "reddedildi",
  "#e11d48",
  IHBAR_RENK,
] as unknown as maplibregl.ExpressionSpecification;

const BOS_KOLEKSIYON: AssetFeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

const BOS_GEOJSON = {
  type: "FeatureCollection",
  features: [],
} as unknown as GeoJSON.FeatureCollection;

/** Varlik tipine gore isaretci rengi - liste rozetleriyle ayni palet
 *  (agac=yesil, direk=mavi, sulama=camgobegi). Harita uzerinde tur tek bakista
 *  ayirt edilsin diye kullanilir; bilinmeyen tip icin notr gri. */
const TIP_RENGI_IFADESI = [
  "match",
  ["get", "type"],
  "agac",
  "#059669",
  "direk",
  "#0284c7",
  "sulama",
  "#0891b2",
  "#64748b",
] as unknown as maplibregl.ExpressionSpecification;

/** Her tur icin beyaz cizgi glifi (marker dairesinin ortasina bindirilir).
 *  Path'ler icons.tsx'teki IconTree/IconLamp/IconDrop ile ayni. */
const TIP_GLIFLERI: Record<string, string> = {
  agac: '<path d="M12 3 6.5 11h2.7L5 18h6M12 3l5.5 8h-2.7L19 18h-6"/><path d="M12 14v7"/>',
  direk: '<path d="M12 2v3M8.5 5h7l-1.3 4.5h-4.4L8.5 5z"/><path d="M12 9.5V21M9 21h6"/>',
  sulama:
    '<path d="M12 3s6 6.3 6 10.5a6 6 0 0 1-12 0C6 9.3 12 3 12 3z"/><path d="M9.5 13.5a2.5 2.5 0 0 0 2.5 2.5"/>',
};

/** Bir turun beyaz glifini SVG->raster cevirip haritaya `tip-<tur>` adiyla ekler. */
function tipIkonuYukle(map: maplibregl.Map, tur: string, ic: string): Promise<void> {
  const id = `tip-${tur}`;
  if (map.hasImage(id)) return Promise.resolve();
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="48" height="48" ` +
    `fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" ` +
    `stroke-linejoin="round">${ic}</svg>`;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      if (!map.hasImage(id)) map.addImage(id, img, { pixelRatio: 2 });
      resolve();
    };
    img.onerror = () => resolve();
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  });
}

/** Tum tur gliflerini haritaya yukler (stil degisiminde tekrar cagrilir). */
function tipIkonlariniHazirla(map: maplibregl.Map): Promise<void> {
  return Promise.all(
    Object.entries(TIP_GLIFLERI).map(([tur, ic]) => tipIkonuYukle(map, tur, ic))
  ).then(() => undefined);
}

/** Bir varlik/ihbara ucarken kullanilan zoom/sure degerleri: haritadaki bir
 *  noktaya tiklandiginda daha yakina ama asiri olmayan bir zoom, listeden
 *  secildiginde ise daha uzak bir zoom kullanilir; her iki durumda da
 *  animasyon eskisinden belirgin sekilde yavastir. */
const SECIM_UCUS_HARITADAN = { zoom: 14, duration: 1500 };
const SECIM_UCUS_LISTEDEN = { zoom: 12.5, duration: 2000 };
/** Sinir/arama gibi diger ucus hedeflerinde kullanilan (yavaslatilmis) sure. */
const UCUS_SURESI_VARSAYILAN = 1600;

const IKON_KATMAN_YERLESIMI: Record<string, unknown> = {
  "icon-size": ["interpolate", ["linear"], ["zoom"], 10, 0.7, 16, 1.05],
  "icon-allow-overlap": true,
  "icon-ignore-placement": true,
};

/** Isaretci olculeri tek yerde: tur glifi sehir olceginde (z10-12) de okunabilsin
 *  diye daireler buyuk, beyaz halka kalin ve altlarinda yumusak bir golge var. */
const ISARETCI = {
  /** Varlik dairesi yaricapi (zoom 10 -> 16 arasi interpolasyon). */
  varlikYaricap: ["interpolate", ["linear"], ["zoom"], 10, 11, 16, 17],
  /** Ihbar dairesi - varliklardan bir tik kucuk kalir. */
  ihbarYaricap: ["interpolate", ["linear"], ["zoom"], 10, 9.5, 16, 15],
  /** "Bakim lazim" amber uyari halkasi - ana dairenin disinda kalmali. */
  uyariYaricap: ["interpolate", ["linear"], ["zoom"], 10, 14, 16, 20],
  /** Secim halkalari - uyari halkasinin da disinda. */
  varlikSecimYaricap: ["interpolate", ["linear"], ["zoom"], 10, 16, 16, 22],
  ihbarSecimYaricap: ["interpolate", ["linear"], ["zoom"], 10, 14, 16, 20],
  beyazHalka: 2.5,
} as const;

/** Isaretcinin altina yumusak golge - dairenin hafif buyugu, asagi kaydirilmis
 *  ve bulaniklastirilmis siyah bir daire (altliktan bagimsiz derinlik hissi). */
function golgeBoyasi(yaricap: unknown): Record<string, unknown> {
  return {
    "circle-radius": yaricap,
    "circle-color": "#0f172a",
    "circle-opacity": 0.22,
    "circle-blur": 0.5,
    "circle-translate": [0, 2],
  };
}

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
  /** Bir varlik popup'undaki "Detaylari Gor" butonuna tiklaninca - sol-alttaki
   *  zengin detay kartini acar (artik secim aninda otomatik acilmiyor). */
  onVarlikDetay?: (id: string) => void;
  /** Bir ihbar popup'undaki "Detaylari Gor" butonuna tiklaninca - ayni sekilde
   *  ihbarin ozet kartini acar. */
  onIhbarDetay?: (id: string) => void;
  /** Harita her hareket ettiginde (pan/zoom) gorunen alanin sinirlarini bildirir;
   *  konum aramasini o an ekranda gorunen bolgeye onceliklendirmek icin kullanilir. */
  onGorunumDegisti?: (bounds: [[number, number], [number, number]]) => void;
  /** Personel gorunumunde canli saha ekibi konumlari (DOM marker olarak cizilir);
   *  verilmezse hicbir sey gosterilmez. */
  ekipler?: EkipGorevleri[];
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
  onVarlikDetay,
  onIhbarDetay,
  ekipler,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const hazirRef = useRef(false);
  /** Aktif cizimin alan etiketi (m2/ha) ve tamamlanan alanlarin kalici etiketleri. */
  const cizimEtiketRef = useRef<maplibregl.Marker | null>(null);
  const tamamlananEtiketleriRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  /** Canli saha ekibi konumlari - DOM marker olarak; stil degisiminden
   *  etkilenmez (style katmani degil), ekipler prop'u degisince senkronlanir. */
  const ekipMarkerlariRef = useRef<Map<string, maplibregl.Marker>>(new Map());
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
  const onVarlikDetayRef = useRef(onVarlikDetay);
  const onIhbarDetayRef = useRef(onIhbarDetay);
  /** Cizim/olcum sirasinda son bilinen fare konumu (elastik cizgi icin). */
  const sonFareRef = useRef<[number, number] | null>(null);
  /** Son secim (varlik/ihbar) haritadaki bir noktaya tiklanarak mi yapildi;
   * flyTo hedef zoom/suresi buna gore ayarlanir (harita tiklamasinda daha
   * yakin, listeden secimde daha uzak ve daha yavas). */
  const sonSecimHaritadanRef = useRef(false);
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
    onVarlikDetayRef.current = onVarlikDetay;
    onIhbarDetayRef.current = onIhbarDetay;
  });

  // Layer-scoped click/hover callback'leri sabit referans olarak tutulur ki
  // stil degisiminde map.off/map.on ile guvenle yeniden baglanabilsin.
  // "assets-circle" ve "assets-icon" (aynı sekilde "reports-circle"/"reports-icon")
  // ayni nokta icin ayri katmanlar oldugundan, tek bir tiklama her iki katmanin
  // click handler'ini da tetikler; ayni DOM olayini iki kez islemeyi onlemek icin
  // son islenen originalEvent'i tutuyoruz (aksi halde secim toggle'i kendi
  // kendini iptal eder: sec -> hemen ardindan tekrar tikla -> null).
  const sonIslenenAssetsOlayiRef = useRef<MouseEvent | null>(null);
  const sonIslenenReportsOlayiRef = useRef<MouseEvent | null>(null);
  const assetsTiklandiRef = useRef((e: maplibregl.MapLayerMouseEvent) => {
    if (cizimModuRef.current || olcumModuRef.current) return;
    if (sonIslenenAssetsOlayiRef.current === e.originalEvent) return;
    sonIslenenAssetsOlayiRef.current = e.originalEvent;
    const id = e.features?.[0]?.properties?.id;
    if (typeof id === "string") {
      sonSecimHaritadanRef.current = true;
      onVarlikSecRef.current(id);
    }
  });
  const reportsTiklandiRef = useRef((e: maplibregl.MapLayerMouseEvent) => {
    if (cizimModuRef.current || olcumModuRef.current) return;
    if (sonIslenenReportsOlayiRef.current === e.originalEvent) return;
    sonIslenenReportsOlayiRef.current = e.originalEvent;
    const id = e.features?.[0]?.properties?.id;
    if (typeof id === "string") {
      sonSecimHaritadanRef.current = true;
      onIhbarSecRef.current?.(id);
    }
  });
  // Popup metnini keskin tutar: MapLibre popup'u tam CSS pikseline yuvarlar,
  // ama Windows'ta kesirli olceklemede (%125/%150) bu kesirli bir CIHAZ
  // pikseline denk gelip yaziyi bulaniklastirir. Her render'da popup'un toplam
  // ceviri (translate) degerini cihaz piksel izgarasina oturtarak bunu giderir
  // (DPR=1'de zaten hizali oldugundan dokunmaz).
  const popupHizalaRef = useRef(() => {
    const el = popupRef.current?.getElement() as HTMLElement | undefined;
    if (!el) return;
    const dpr = window.devicePixelRatio || 1;
    if (dpr === 1) return;
    const t = getComputedStyle(el).transform;
    if (!t || t === "none") return;
    let m: DOMMatrixReadOnly;
    try {
      m = new DOMMatrixReadOnly(t);
    } catch {
      return;
    }
    const izgara = (v: number) => Math.round(v * dpr) / dpr;
    const yeni = `translate(${izgara(m.m41)}px, ${izgara(m.m42)}px)`;
    if (el.style.transform !== yeni) el.style.transform = yeni;
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
    if (map.getLayer("assets-icon")) katmanlar.push("assets-icon");
    if (map.getLayer("reports-circle")) katmanlar.push("reports-circle");
    if (map.getLayer("reports-icon")) katmanlar.push("reports-icon");
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

    // anchor sabit: harita kaydirilirken popup bir anda karsi tarafa "atlamasin"
    // (sabit anchor olmadan MapLibre gorunurde tutmak icin anchor'i degistirir).
    const popup = new maplibregl.Popup({
      offset: 14,
      closeButton: false,
      anchor: "bottom",
    })
      .setLngLat(secili.geometry.coordinates)
      .setHTML(popupIcerigi(secili))
      .addTo(map);
    popupRef.current = popup;
    konumSatiriDoldur(popup, secili);
    popup
      .getElement()
      ?.querySelector(".popup-detay-btn")
      ?.addEventListener("click", () => onVarlikDetayRef.current?.(secili.properties.id));
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
    const popup = new maplibregl.Popup({
      offset: 14,
      closeButton: false,
      anchor: "bottom",
    })
      .setLngLat(secili.geometry.coordinates)
      .setHTML(ihbarPopupIcerigi(secili))
      .addTo(map);
    popupRef.current = popup;
    popup
      .getElement()
      ?.querySelector(".popup-detay-btn")
      ?.addEventListener("click", () => onIhbarDetayRef.current?.(secili.properties.id));
  }

  /** Kaynaklar/katmanlar yoksa (ilk yukleme ya da stil degisimi sonrasi) yeniden kurar. */
  function kaynaklariHazirla(map: maplibregl.Map) {
    // Maske en altta eklenir ki varlik/cizim katmanlarini ortmesin.
    maskeKaynagiHazirla(map);

    if (!map.getSource(SOURCE_ID)) {
      map.addSource(SOURCE_ID, { type: "geojson", data: BOS_KOLEKSIYON });

      // En altta yumusak golge - isaretcileri altliktan ayirip kabartir.
      map.addLayer({
        id: "assets-golge",
        type: "circle",
        source: SOURCE_ID,
        paint: golgeBoyasi(ISARETCI.varlikYaricap) as never,
      });

      // Bakim gereken varliklar icin amber uyari halkasi (dairenin altinda,
      // tur renginden bagimsiz olarak "dikkat" sinyali verir).
      map.addLayer({
        id: "assets-durum",
        type: "circle",
        source: SOURCE_ID,
        filter: ["==", ["get", "status"], "bakim_lazim"],
        paint: {
          "circle-radius": ISARETCI.uyariYaricap as never,
          "circle-color": "#f59e0b",
          "circle-opacity": 0.28,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#f59e0b",
        },
      });

      // Ana isaretci: dolgu TUR rengine gore (agac/direk/sulama), beyaz cerceve.
      map.addLayer({
        id: "assets-circle",
        type: "circle",
        source: SOURCE_ID,
        paint: {
          "circle-radius": ISARETCI.varlikYaricap as never,
          "circle-color": TIP_RENGI_IFADESI,
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

    if (!map.getSource(REPORTS_SOURCE_ID)) {
      map.addSource(REPORTS_SOURCE_ID, { type: "geojson", data: BOS_GEOJSON });

      map.addLayer({
        id: "reports-golge",
        type: "circle",
        source: REPORTS_SOURCE_ID,
        paint: golgeBoyasi(ISARETCI.ihbarYaricap) as never,
      });

      // Ihbar noktalari - varliklardan (yesil/amber) acikca ayrilsin diye mor.
      map.addLayer({
        id: "reports-circle",
        type: "circle",
        source: REPORTS_SOURCE_ID,
        paint: {
          "circle-radius": ISARETCI.ihbarYaricap as never,
          "circle-color": IHBAR_DURUM_RENGI_IFADESI,
          "circle-stroke-width": ISARETCI.beyazHalka,
          "circle-stroke-color": "#ffffff",
        },
      });
      map.addLayer({
        id: "reports-selected",
        type: "circle",
        source: REPORTS_SOURCE_ID,
        filter: ["==", ["get", "id"], ""],
        paint: {
          "circle-radius": ISARETCI.ihbarSecimYaricap as never,
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

    // Tur gliflerini (beyaz ikonlar) yukleyip sembol katmanlarini ekle.
    // Async: gliflerin raster'a cevrilmesini bekler, boylece "eksik gorsel"
    // uyarisi cikmadan katman referansi hazir olur.
    tipIkonlariniHazirla(map).then(() => {
      if (mapRef.current !== map) return; // bu arada harita/stil degistiyse birak

      if (map.getSource(SOURCE_ID) && !map.getLayer("assets-icon")) {
        map.addLayer({
          id: "assets-icon",
          type: "symbol",
          source: SOURCE_ID,
          layout: {
            "icon-image": ["concat", "tip-", ["get", "type"]],
            ...IKON_KATMAN_YERLESIMI,
          },
        });
        map.off("click", "assets-icon", assetsTiklandiRef.current);
        map.on("click", "assets-icon", assetsTiklandiRef.current);
        map.off("mouseenter", "assets-icon", fareGirdiRef.current);
        map.on("mouseenter", "assets-icon", fareGirdiRef.current);
        map.off("mouseleave", "assets-icon", fareCiktiRef.current);
        map.on("mouseleave", "assets-icon", fareCiktiRef.current);
      }

      if (map.getSource(REPORTS_SOURCE_ID) && !map.getLayer("reports-icon")) {
        map.addLayer({
          id: "reports-icon",
          type: "symbol",
          source: REPORTS_SOURCE_ID,
          layout: {
            "icon-image": ["concat", "tip-", ["get", "type"]],
            ...IKON_KATMAN_YERLESIMI,
          },
        });
        map.off("click", "reports-icon", reportsTiklandiRef.current);
        map.on("click", "reports-icon", reportsTiklandiRef.current);
        map.off("mouseenter", "reports-icon", fareGirdiRef.current);
        map.on("mouseenter", "reports-icon", fareGirdiRef.current);
        map.off("mouseleave", "reports-icon", fareCiktiRef.current);
        map.on("mouseleave", "reports-icon", fareCiktiRef.current);
      }
    });
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
    // Acik popup'i her karede cihaz piksel izgarasina hizala (kesirli DPR'de
    // metin bulanikligini onler). Harita kaldirilinca map.remove() temizler.
    map.on("render", popupHizalaRef.current);

    // Kapsayici boyutu degisince (orn. sol kenar cubugu acilip kapaninca)
    // MapLibre kendiliginden yeniden boyutlanmaz; ResizeObserver ile tetikleriz.
    const boyutGozlemci = new ResizeObserver(() => map.resize());
    boyutGozlemci.observe(containerRef.current);

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
      boyutGozlemci.disconnect();
      popupRef.current?.remove();
      cizimEtiketRef.current?.remove();
      for (const marker of tamamlananEtiketleriRef.current.values()) marker.remove();
      tamamlananEtiketleriRef.current.clear();
      for (const marker of ekipMarkerlariRef.current.values()) marker.remove();
      ekipMarkerlariRef.current.clear();
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

    const haritadanMi = sonSecimHaritadanRef.current;
    sonSecimHaritadanRef.current = false;

    if (seciliIhbarId && reports) {
      const secili = reports.features.find(
        (f) => f.properties.id === seciliIhbarId
      );
      if (secili) {
        const hedef = haritadanMi ? SECIM_UCUS_HARITADAN : SECIM_UCUS_LISTEDEN;
        map.flyTo({
          center: secili.geometry.coordinates,
          zoom: Math.max(map.getZoom(), hedef.zoom),
          duration: hedef.duration,
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

  // --- Canli saha ekibi konumlarini (DOM marker) senkronla ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const guncel = new Set<string>();
    for (const e of ekipler ?? []) {
      if (e.longitude == null || e.latitude == null) continue;
      guncel.add(e.id);
      let marker = ekipMarkerlariRef.current.get(e.id);
      if (!marker) {
        const el = document.createElement("div");
        ekipMarkerGuncelle(el, e);
        const yeni = new maplibregl.Marker({ element: el, anchor: "bottom" })
          .setLngLat([e.longitude, e.latitude])
          .setPopup(
            new maplibregl.Popup({
              offset: 30,
              closeButton: true,
              anchor: "bottom",
            }).setHTML(ekipPopupHtml(e))
          )
          .addTo(map);
        // Marker'a tiklama, haritanin kendi tiklamasi (sol "Ekle" formunu acar)
        // olarak algilanmasin: mousedown'i canvas'a birakma. MapLibre'nin
        // otomatik popup toggle'i harita click'ine bagli oldugundan mousedown
        // durunca calismaz; bu yuzden popup'i kendimiz ac/kapa.
        el.addEventListener("mousedown", (ev) => ev.stopPropagation());
        el.addEventListener("click", (ev) => {
          ev.stopPropagation();
          yeni.togglePopup();
        });
        marker = yeni;
        ekipMarkerlariRef.current.set(e.id, marker);
      } else {
        marker.setLngLat([e.longitude, e.latitude]);
        ekipMarkerGuncelle(marker.getElement(), e);
        marker.getPopup()?.setHTML(ekipPopupHtml(e));
      }
    }
    for (const [id, marker] of ekipMarkerlariRef.current) {
      if (!guncel.has(id)) {
        marker.remove();
        ekipMarkerlariRef.current.delete(id);
      }
    }
  }, [ekipler]);

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
      map.fitBounds(ucusHedefi.bounds, { padding: 40, duration: UCUS_SURESI_VARSAYILAN });
    } else {
      map.flyTo({
        center: ucusHedefi.merkez,
        zoom: ucusHedefi.zoom ?? Math.max(map.getZoom(), 15),
        duration: UCUS_SURESI_VARSAYILAN,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ucusHedefi?.anahtar]);

  // --- Secim degisince: vurgula, ucur, popup ac ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !hazirRef.current) return;

    secimUygula(map);

    const haritadanMi = sonSecimHaritadanRef.current;
    sonSecimHaritadanRef.current = false;

    if (seciliId && assets) {
      const secili = assets.features.find((f) => f.properties.id === seciliId);
      if (secili) {
        const hedef = haritadanMi ? SECIM_UCUS_HARITADAN : SECIM_UCUS_LISTEDEN;
        map.flyTo({
          center: secili.geometry.coordinates,
          zoom: Math.max(map.getZoom(), hedef.zoom),
          duration: hedef.duration,
        });
      }
    }
  }, [seciliId, assets]);

  return <div ref={containerRef} className="greenasset-harita h-full w-full" />;
}

/** Varlik ve ihbar popup'lari icin ortak, sabit ve CIFT piksellik genislik.
 *  Ayni genislik iki popup'i birebir esitler (istenen: hepsi "onaylandi"
 *  boyutunda). Ayrica cift sayi olmasi kritik: MapLibre popup'i kesirsiz tam
 *  piksele yuvarlar ama anchor'daki `translate(-50%)` tek genislikte yarim
 *  piksele denk gelip metni bulaniklastiriyordu; cift genislikte -%50 tam
 *  piksele oturur ve yazi keskin kalir. (200 + ~20 padding = 220, cift.) */
const POPUP_GENISLIK = "200px";

function popupIcerigi(asset: AssetFeature): string {
  const { name, type, status, source, brand_model, install_date, photo_url } =
    asset.properties;
  const bakim = status === "bakim_lazim";
  const foto = fotoUrl(photo_url);
  const satirlar = [
    brand_model ? `<div>${kacis(brand_model)}</div>` : "",
    install_date ? `<div>Kurulum: ${kacis(install_date)}</div>` : "",
  ].join("");

  const turRenkleri: Record<string, string> = {
    agac: "#059669",
    direk: "#0284c7",
    sulama: "#0891b2",
  };
  const turRenk = turRenkleri[type] ?? "#64748b";

  return `
    <div style="font-family: system-ui, sans-serif; width: ${POPUP_GENISLIK}">
      ${
        foto
          ? `<img src="${kacis(foto)}" style="width:100%; max-height:120px; object-fit:cover; margin-bottom:6px; border:1px solid #e2e8f0;" />`
          : ""
      }
      <div style="font-weight: 600; margin-bottom: 4px">${kacis(name)}</div>
      <div style="color:#475569; font-size:12px; display:flex; align-items:center; gap:5px">
        <span style="display:inline-block; width:9px; height:9px; border-radius:9999px; background:${turRenk}"></span>
        ${ASSET_TYPE_LABELS[type]}
      </div>
      <div style="margin-top:6px; display:flex; gap:4px; flex-wrap:wrap">
        <span style="
          display:inline-block; padding:2px 8px; border-radius:9999px;
          font-size:11px; font-weight:500;
          background:${bakim ? "#fef3c7" : "#d1fae5"};
          color:${bakim ? "#92400e" : "#065f46"}">
          ${durumEtiketi(status, source)}
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
      <button type="button" class="popup-detay-btn" style="
        margin-top:8px; width:100%; padding:5px 0; border:1px solid #059669;
        border-radius:6px; background:#fff; color:#059669; font-size:11px;
        font-weight:600; cursor:pointer;">Detayları Gör</button>
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
    <div style="font-family: system-ui, sans-serif; width: ${POPUP_GENISLIK}">
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
          ? `<div style="color:#64748b; font-size:11px; margin-top:6px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden">${kacis(note)}</div>`
          : ""
      }
      <button type="button" class="popup-detay-btn" style="
        margin-top:8px; width:100%; padding:5px 0; border:1px solid #9333ea;
        border-radius:6px; background:#fff; color:#9333ea; font-size:11px;
        font-weight:600; cursor:pointer;">Detayları Gör</button>
    </div>
  `;
}

/** Bir saha ekibi DOM marker'inin icerigini (avatar + yuk rozeti + kisa ad
 *  etiketi) kurar/gunceller. Ayni element hem olusturmada hem guncellemede
 *  kullanilir. Etiket kisa tutulur (parantez ici, orn. "(Kadikoy)" atilir) -
 *  tam ad + gorevler markera tiklaninca acilan popup'ta gosterilir. */
function ekipMarkerGuncelle(el: HTMLElement, e: EkipGorevleri): void {
  const dolu = e.aktif_gorev >= MAKS_AKTIF_GOREV;
  const rozetRenk = dolu ? "#dc2626" : "#059669";
  const kisaAd = (e.full_name || e.email).replace(/\s*\(.*\)\s*$/, "");
  el.style.cursor = "pointer";
  el.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;font-family:system-ui,sans-serif">
      <div style="position:relative">
        <div style="width:28px;height:28px;border-radius:9999px;background:#4f46e5;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        </div>
        <div style="position:absolute;top:-6px;right:-8px;min-width:16px;height:16px;padding:0 3px;border-radius:9999px;background:${rozetRenk};color:#fff;font-size:10px;font-weight:700;line-height:16px;text-align:center;border:1.5px solid #fff">${e.aktif_gorev}</div>
      </div>
      <div style="margin-top:2px;max-width:84px;padding:1px 5px;border-radius:4px;background:rgba(15,23,42,.82);color:#fff;font-size:9px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${kacis(kisaAd)}</div>
    </div>`;
  el.title = "Detay için tıklayın";
}

/** Bir saha ekibi marker'ina tiklaninca acilan popup: tam ad + yuk + son
 *  gorulme + o an ustundeki aktif gorevlerin listesi (istek: haritadan ekibe
 *  basinca hangi gorevler onda, kac tane gorunsun). */
function ekipPopupHtml(e: EkipGorevleri): string {
  const dolu = e.aktif_gorev >= MAKS_AKTIF_GOREV;
  const rozetRenk = dolu ? "#dc2626" : "#059669";
  const sonGorulme = e.last_seen_at
    ? `Son görülme: ${new Date(e.last_seen_at).toLocaleString("tr-TR")}`
    : "Konum bilgisi yok";
  const satirlar = e.gorevler.length
    ? e.gorevler
        .map(
          (g) =>
            `<li style="margin-bottom:2px">${kacis(g.name)} <span style="color:#94a3b8">· ${kacis(
              ASSET_TYPE_LABELS[g.type]
            )}</span></li>`
        )
        .join("")
    : `<li style="list-style:none;margin-left:-14px;color:#94a3b8">Şu an aktif görev yok</li>`;
  return (
    `<div style="font-family:system-ui,sans-serif;min-width:190px;max-width:240px">` +
    `<div style="font-weight:600;font-size:13px;color:#0f172a">${kacis(e.full_name || e.email)}</div>` +
    `<div style="display:inline-block;margin:4px 0;padding:1px 8px;border-radius:9999px;background:${rozetRenk};color:#fff;font-size:11px;font-weight:700">${e.aktif_gorev}/${MAKS_AKTIF_GOREV} görev</div>` +
    `<div style="font-size:10px;color:#94a3b8;margin-bottom:6px">${kacis(sonGorulme)}</div>` +
    `<div style="font-size:11px;font-weight:600;color:#475569;margin-bottom:2px">Üzerindeki İşler</div>` +
    `<ul style="margin:0;padding-left:14px;font-size:11px;color:#334155;line-height:1.45">${satirlar}</ul>` +
    `</div>`
  );
}

/** Kullanici verisini HTML'e gomerken kacis uygular. */
function kacis(metin: string): string {
  return metin
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
