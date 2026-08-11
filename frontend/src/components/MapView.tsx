import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";

import { ilSiniri } from "../api/sinirlar";
import { HARITA_STILLERI, type HaritaStilId } from "../data/mapStyles";
import { turSozluguSurumu } from "../data/turSozlugu";
import type { TamamlananAlan } from "../types/alan";
import type { Bolge, SekilDuzenleme } from "../types/bolge";
import type { AssetFeatureCollection } from "../types/asset";
import {
  HALKALI_GORUNUMLER,
  ROZETLI_GORUNUMLER,
  TALEP_DURUM_RENGI,
  TALEP_GIYSISI,
  sekilliTalep,
  talepNoktasi,
} from "../types/report";
import type { ReportFeatureCollection } from "../types/report";
import type { EkipGorevleri } from "../types/saha";
import {
  alanEtiketi,
  cizgiOrtaNoktasi,
  cokHalkaliAlanM2,
  enBuyukHalkaMerkezi,
  mesafeEtiketi,
  poligonAlaniM2,
  poligonMerkezi,
  toplamMesafeMetre,
} from "../utils/geo";
import { BOS_GEOJSON } from "../utils/geojson";
import { haritayaKapaliAttributionEkle } from "../utils/haritaAttribution";
// Isaretci goruntuleri (pin/glif/halka/rozet) ve stil ifadeleri.
import {
  TALEP_OPAKLIK_IFADESI,
  gorunumFiltresi,
  tipIkonlariniHazirla,
  tipRengiIfadesi,
} from "../utils/haritaIkonlari";
// Kaynak/katman tanimlari. Olay baglama ve veri yazma burada kalir.
import {
  ATAMA_KAYMASI,
  ATAMA_RENGI,
  BOLGE_SOURCE_ID,
  BOS_KOLEKSIYON,
  CIZIM_SOURCE_ID,
  DINAMIK_SOURCE_ID,
  ISARETCI,
  OLCUM_RENK,
  OLCUM_SOURCE_ID,
  REPORTS_SOURCE_ID,
  TALEP_SEKIL_SOURCE_ID,
  ROZET_MINZOOM,
  SEKIL_SOURCE_ID,
  SOURCE_ID,
  TAMAMLANAN_SOURCE_ID,
  bolgeKatmanlari,
  cizimKatmanlari,
  dinamikOnizlemeKatmanlari,
  talepKatmanlari,
  talepSekilKatmanlari,
  olcumKatmanlari,
  sekilDuzenlemeKatmanlari,
  secilenAlanKatmanlari,
  varlikKatmanlari,
} from "../utils/haritaKatmanlari";
// Popup/marker HTML uretimi.
import {
  EKIP_VARSAYILAN_RENK,
  bolgePopupIcerigi,
  ekipMarkerGuncelle,
  ekipPopupHtml,
  talepPopupIcerigi,
  konumSatiriDoldur,
  popupIcerigi,
} from "../utils/haritaPopup";
import type { EkipDepartmanBilgisi } from "../utils/haritaPopup";
import {
  ISTANBUL_IL_KODU,
  ISTANBUL_MERKEZI,
  ISTANBUL_SINIRLARI,
  istanbulMaskesiUygula,
  maskeKaynagiHazirla,
} from "../utils/istanbulMaskesi";

/* Isaretci gorsel dili - her bilgiyi ayri bir tasiyici anlatir:
 *   RENK          -> tur grubu (types/asset.ts GRUP_RENGI)
 *   SEKIL         -> kaynak: daire = envanter varligi, pin = vatandas talebi
 *   HALKA + ROZET -> is durumu: amber "!" acik is, mor kesikli "?" karar bekliyor,
 *                    halkasiz + sonuk = kapanmis (tamir "✓" / red "✕")
 *   GLIF          -> tur ikonu (data/tipGlifleri.ts) */

/** Secime ucarken kullanilan zoom/sure: zoom ayni, haritadan secimde ucus
 *  daha kisa surer (kullanici zaten hedefe bakiyor). */
const SECIM_UCUS_HARITADAN = { zoom: 12.5, duration: 1500 };
const SECIM_UCUS_LISTEDEN = { zoom: 12.5, duration: 2000 };
const UCUS_SURESI_VARSAYILAN = 1600;

/** Bolge/guzergah ad+olcu etiketleri bu zoom'un altinda hic cizilmez: uzakta
 *  onlarca etiket ust uste binip haritayi kirletiyordu. Degeri buradan ayarla. */
const BOLGE_ETIKET_MINZOOM = 13;

const IKON_KATMAN_YERLESIMI: Record<string, unknown> = {
  "icon-size": ["interpolate", ["linear"], ["zoom"], 10, 0.32, 16, 0.65],
  "icon-allow-overlap": true,
  "icon-ignore-placement": true,
};

/** Pin ailesi (pin, glif, halka, rozet): ucu koordinata otursun diye alttan
 *  cakili, hepsi ayni viewBox'i kullanir. Olcek, pinin bas capi varlik
 *  dairesinin capina esit olacak sekilde secildi (bas capi = 19.2 birim). */
const PIN_KATMAN_YERLESIMI: Record<string, unknown> = {
  ...IKON_KATMAN_YERLESIMI,
  "icon-size": ["interpolate", ["linear"], ["zoom"], 10, 0.48, 16, 1.03],
  "icon-anchor": "bottom",
};

/** Secili talebin altina cizilen koyu pin: normalden ~1.22 kat buyuk, arkadan
 *  tasarak kontur etkisi verir. */
const PIN_SECIM_YERLESIMI: Record<string, unknown> = {
  ...PIN_KATMAN_YERLESIMI,
  "icon-size": ["interpolate", ["linear"], ["zoom"], 10, 0.59, 16, 1.26],
};

/** Sekil duzenleme tutamagi. `orta=true` ise kenar ortasindaki "yeni kose ekle"
 *  tutamagi: daha kucuk, yari saydam ve "+" isaretli. */
function tutamakElemani(renk: string, orta: boolean): HTMLDivElement {
  const el = document.createElement("div");
  const boy = orta ? 12 : 15;
  el.style.cssText =
    `width:${boy}px; height:${boy}px; border-radius:9999px; box-sizing:border-box; ` +
    `border:2px solid #ffffff; background:${renk}; cursor:${orta ? "copy" : "move"}; ` +
    `box-shadow:0 1px 3px rgba(15,23,42,0.45); display:flex; align-items:center; ` +
    `justify-content:center; color:#fff; font:700 9px/1 system-ui,sans-serif; ` +
    (orta ? "opacity:0.65;" : "");
  if (orta) el.textContent = "+";
  return el;
}

/** Haritayi bir bolgeye/noktaya ucurma komutu. `anahtar` degisince tetiklenir,
 *  bu yuzden ayni hedef icin bile benzersiz uretilmelidir. */
export type UcusHedefi =
  | { anahtar: string; tip: "sinir"; bounds: [[number, number], [number, number]] }
  | { anahtar: string; tip: "nokta"; merkez: [number, number]; zoom?: number };

interface MapViewProps {
  assets?: AssetFeatureCollection;
  /** "Talepler" sekmesi aktifken gosterilen talep noktalari. */
  reports?: ReportFeatureCollection;
  /** Secili talep: haritada vurgulanir ve popup'i acilir. */
  seciliTalepId?: string | null;
  onTalepSec?: (id: string) => void;
  seciliId: string | null;
  onVarlikSec: (id: string) => void;
  /** Bos bir alana tiklaninca (koordinati forma doldurmak icin). */
  onHaritaTikla: (koordinat: { longitude: number; latitude: number }) => void;
  /** Alan secim modu: tiklamalar poligon kosesi olarak toplanir. */
  cizimModu: boolean;
  cizimNoktalari: [number, number][];
  onCizimNokta: (nokta: [number, number]) => void;
  cizimRengi: string;
  /** Tamamlanmis, haritada duran alan secimleri. */
  tamamlananAlanlar: TamamlananAlan[];
  /** Mesafe olcum modu: tiklamalar cizgiye nokta olarak eklenir. */
  olcumModu: boolean;
  olcumNoktalari: [number, number][];
  onOlcumNokta: (nokta: [number, number]) => void;
  aktifStilId: HaritaStilId;
  /** Verildiginde harita bu hedefe ucar (ilce secimi, arama sonucu vb.). */
  ucusHedefi?: UcusHedefi | null;
  /** Popup'in TEK islem dugmesi. Duzenleme, atama, reddi geri alma vb. acilan
   *  detay modalinin isidir (bkz. haritaPopup.ts::detayDugmesi). */
  onVarlikDetay?: (id: string) => void;
  onTalepDetay?: (id: string) => void;
  /** Gorunen alani bildirir (konum aramasini onceliklendirmek icin). */
  onGorunumDegisti?: (bounds: [[number, number], [number, number]]) => void;
  /** Harita kurulunca/yikilinca instance'i disari verir. Stil onizlemeleri ana
   *  haritanin kadrajini React state'ine ugramadan takip etmek icin kullanir. */
  onHaritaHazir?: (map: maplibregl.Map | null) => void;
  /** Canli saha ekibi konumlari (personel gorunumu). */
  ekipler?: EkipGorevleri[];
  /** Departman kodu -> ad + renk. Ekip pinleri bagli olduklari mudurlugun
   *  rengiyle cizilir; verilmezse hepsi varsayilan indigo olur. */
  ekipDepartmanlari?: EkipDepartmanBilgisi;
  /** Ekip popup'indaki bir is satirina tiklaninca ilgili varligin id'siyle. */
  onEkipGorevSec?: (assetId: string) => void;
  /** Ayni popup'taki bolge/guzergah satirina tiklaninca kaydin id'siyle.
   *  Gorev tek kavram oldugu icin satirlar ayni listede durur, yalnizca
   *  actiklari detay farklidir. */
  onEkipBolgeSec?: (bolgeId: string) => void;
  /** Haritada gosterilecek kaydedilmis bolgeler/guzergahlar. */
  bolgeler?: Bolge[];
  onBolgeDetay?: (id: string) => void;
  seciliBolgeId?: string | null;
  onBolgeSec?: (id: string) => void;
  /** Adi harita etiketi uzerinden degistirir. Verilmezse etiketler salt
   *  okunurdur; donen soz reddedilirse etiket eski ada doner. */
  onBolgeAdDegis?: (id: string, ad: string) => void | Promise<void>;
  /** Sekli duzenlenen bolge: kalici katmandan cikarilir, koseleri suruklenir. */
  sekilDuzenleme?: SekilDuzenleme | null;
  onSekilDegis?: (noktalar: [number, number][][]) => void;
  /** Bolge dolgusu tiklamayi yakalasin mi. "Ekle" formu acikken kapatilir ki
   *  genis bir bolgenin uzerine varlik konabilsin. */
  bolgeTiklanabilir?: boolean;
}

export default function MapView({
  assets,
  reports,
  seciliTalepId,
  onTalepSec,
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
  onHaritaHazir,
  onVarlikDetay,
  onTalepDetay,
  ekipler,
  ekipDepartmanlari,
  onEkipGorevSec,
  onEkipBolgeSec,
  bolgeler,
  onBolgeDetay,
  seciliBolgeId,
  onBolgeSec,
  onBolgeAdDegis,
  sekilDuzenleme,
  onSekilDegis,
  bolgeTiklanabilir = true,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  /** Acik popup'in turu. Ayni anda tek popup gosterilir ama her secim yalnizca
   *  kendi popup'ini kapatabilir; yoksa bolge secilirken varlik seciminin
   *  temizlenmesi yeni acilan popup'i aninda kapatirdi. */
  const popupTuruRef = useRef<"varlik" | "talep" | "bolge" | null>(null);
  const hazirRef = useRef(false);
  /** Aktif cizimin alan etiketi ve tamamlanan alanlarin kalici etiketleri. */
  const cizimEtiketRef = useRef<maplibregl.Marker | null>(null);
  const tamamlananEtiketleriRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const bolgeEtiketleriRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  /** Adi o an etiket uzerinde duzenlenen bolge: metni yeniden yazilmaz, yoksa
   *  `bolgeler` tazelendiginde yazilan kaybolurdu. */
  const etiketDuzenlenenRef = useRef<string | null>(null);
  /** Sekil duzenleme tutamaklari; suruklenebilir olmalari gerektigi icin
   *  katman degil DOM marker. */
  const sekilTutamaklariRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  /** Suruklerken canli guncellenen taslak geometri; React state yerine burada
   *  tutulur, surukleme bitince tek seferde yukari bildirilir. */
  const sekilTaslakRef = useRef<[number, number][][]>([]);
  /** Canli ekip konumlari; DOM marker olduklari icin stil degisiminden etkilenmez. */
  const ekipMarkerlariRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  /** Harita ornegi STATE olarak da tutulur (ref'in yaninda): ekip marker'lari
   *  katman degil DOM marker oldugu icin `kaynaklariHazirla` onlari yeniden
   *  kurmaz, senkronlari yalnizca kendi effect'inde olur. O effect sadece
   *  `ekipler` degisince calissaydi, harita yeniden kuruldugunda (StrictMode'un
   *  cift mount'u, kapsayicinin yeniden monte olmasi) marker'lar yeni haritaya
   *  hic eklenmez, veri bir sonraki kez DEGISENE kadar eski/eksik kalirdi -
   *  katmani kapatip acmak da tam olarak bunu, yani prop kimligini
   *  degistirdigi icin duzeltiyordu. */
  const [haritaOrnegi, setHaritaOrnegi] = useState<maplibregl.Map | null>(null);
  /** Istanbul il siniri: bir kez getirilir, stil degisiminde maskeye tekrar uygulanir. */
  const istanbulSiniriRef = useRef<[number, number][][] | null>(null);

  // Ilk render'daki stil, harita bir kez kurulurken kullanilir.
  const ilkStilIdRef = useRef(aktifStilId);
  const uygulananStilRef = useRef(aktifStilId);

  // Callback ve degerler ref'te tutulur: harita bir kez kurulur, stil
  // degisiminde de en guncel veri yeniden uygulanabilir.
  const onVarlikSecRef = useRef(onVarlikSec);
  const onHaritaTiklaRef = useRef(onHaritaTikla);
  const onCizimNoktaRef = useRef(onCizimNokta);
  const cizimModuRef = useRef(cizimModu);
  const cizimRengiRef = useRef(cizimRengi);
  const tamamlananAlanlarRef = useRef(tamamlananAlanlar);
  const bolgelerRef = useRef(bolgeler);
  const onBolgeDetayRef = useRef(onBolgeDetay);
  const seciliBolgeIdRef = useRef(seciliBolgeId);
  const onBolgeSecRef = useRef(onBolgeSec);
  const onBolgeAdDegisRef = useRef(onBolgeAdDegis);
  const sekilDuzenlemeRef = useRef(sekilDuzenleme);
  const onSekilDegisRef = useRef(onSekilDegis);
  const bolgeTiklanabilirRef = useRef(bolgeTiklanabilir);
  const onOlcumNoktaRef = useRef(onOlcumNokta);
  const onGorunumDegistiRef = useRef(onGorunumDegisti);
  const onHaritaHazirRef = useRef(onHaritaHazir);
  const olcumModuRef = useRef(olcumModu);
  const olcumNoktalariRef = useRef(olcumNoktalari);
  const assetsRef = useRef(assets);
  const reportsRef = useRef(reports);
  const seciliTalepIdRef = useRef(seciliTalepId);
  const onTalepSecRef = useRef(onTalepSec);
  const cizimNoktalariRef = useRef(cizimNoktalari);
  const seciliIdRef = useRef(seciliId);
  const onVarlikDetayRef = useRef(onVarlikDetay);
  const onTalepDetayRef = useRef(onTalepDetay);
  const onEkipGorevSecRef = useRef(onEkipGorevSec);
  const onEkipBolgeSecRef = useRef(onEkipBolgeSec);
  /** Cizim/olcum sirasinda son bilinen fare konumu (elastik cizgi icin). */
  const sonFareRef = useRef<[number, number] | null>(null);
  /** Son secim haritadan mi yapildi: flyTo zoom/suresi buna gore secilir. */
  const sonSecimHaritadanRef = useRef(false);
  useEffect(() => {
    onVarlikSecRef.current = onVarlikSec;
    onHaritaTiklaRef.current = onHaritaTikla;
    onCizimNoktaRef.current = onCizimNokta;
    cizimModuRef.current = cizimModu;
    cizimRengiRef.current = cizimRengi;
    tamamlananAlanlarRef.current = tamamlananAlanlar;
    bolgelerRef.current = bolgeler;
    onBolgeDetayRef.current = onBolgeDetay;
    seciliBolgeIdRef.current = seciliBolgeId;
    onBolgeSecRef.current = onBolgeSec;
    onBolgeAdDegisRef.current = onBolgeAdDegis;
    sekilDuzenlemeRef.current = sekilDuzenleme;
    onSekilDegisRef.current = onSekilDegis;
    bolgeTiklanabilirRef.current = bolgeTiklanabilir;
    onOlcumNoktaRef.current = onOlcumNokta;
    onGorunumDegistiRef.current = onGorunumDegisti;
    onHaritaHazirRef.current = onHaritaHazir;
    olcumModuRef.current = olcumModu;
    olcumNoktalariRef.current = olcumNoktalari;
    assetsRef.current = assets;
    reportsRef.current = reports;
    seciliTalepIdRef.current = seciliTalepId;
    onTalepSecRef.current = onTalepSec;
    cizimNoktalariRef.current = cizimNoktalari;
    seciliIdRef.current = seciliId;
    onVarlikDetayRef.current = onVarlikDetay;
    onTalepDetayRef.current = onTalepDetay;
    onEkipGorevSecRef.current = onEkipGorevSec;
    onEkipBolgeSecRef.current = onEkipBolgeSec;
  });

  // Katman dinleyicileri sabit referansta tutulur ki stil degisiminde
  // map.off/map.on ile guvenle yeniden baglanabilsinler. Ayni nokta birden
  // fazla katmanda cizildigi icin (daire + glif + rozet) tek tiklama birden
  // cok handler tetikler; son islenen DOM olayi tutularak tekrar elenir.
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
      onTalepSecRef.current?.(id);
    }
  });
  /** Bolge/guzergaha tiklaninca secer ve popup acar - alanlar da birer
   *  isaretci gibi davranir. */
  const sonIslenenBolgeOlayiRef = useRef<MouseEvent | null>(null);
  const bolgeTiklandiRef = useRef((e: maplibregl.MapLayerMouseEvent) => {
    if (cizimModuRef.current || olcumModuRef.current) return;
    if (!bolgeTiklanabilirRef.current) return;
    // Sekil duzenlenirken tiklamalar tutamaklara aittir.
    if (sekilDuzenlemeRef.current) return;
    if (sonIslenenBolgeOlayiRef.current === e.originalEvent) return;
    sonIslenenBolgeOlayiRef.current = e.originalEvent;

    const id = e.features?.[0]?.properties?.id;
    const bolge = (bolgelerRef.current ?? []).find((b) => b.id === id);
    const map = mapRef.current;
    if (!bolge || !map) return;

    onBolgeSecRef.current?.(bolge.id);

    popupRef.current?.remove();
    const popup = new maplibregl.Popup({
      offset: 8,
      closeButton: true,
      // Kapatma carpisinin olcusu index.css'teki `.bolge-popup` kuralinda.
      className: "bolge-popup",
    })
      .setLngLat(e.lngLat)
      .setHTML(bolgePopupIcerigi(bolge))
      .addTo(map);
    popupRef.current = popup;
    popupTuruRef.current = "bolge";
    const el = popup.getElement();
    // Sekil duzenleme "Detay" modalinin icindedir (BolgeDetayModal): popup her
    // kayit turunde tek dugme gosterir.
    el?.querySelector(".popup-detay-btn")?.addEventListener("click", () => {
      onBolgeDetayRef.current?.(bolge.id);
    });
  });

  // Popup metnini keskin tutar: MapLibre CSS pikseline yuvarlar, kesirli DPR'de
  // (%125/%150) bu kesirli bir cihaz pikseline denk gelip yaziyi bulaniklastirir.
  // Her karede translate degerini cihaz piksel izgarasina oturtur.
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
    // Sekil duzenlenirken bos haritaya tiklamak "Ekle" formunu acmasin.
    if (sekilDuzenlemeRef.current) return;

    const katmanlar = ["assets-circle"];
    // "reports-halka" bilincli olarak disarida: dekoratif ve genis bir alan
    // kapladigi icin bos harita tiklamasini yutardi.
    for (const k of [
      "assets-icon",
      "assets-atama",
      "reports-circle",
      "reports-pin",
      "reports-icon",
      "reports-rozet",
      "reports-atama",
    ]) {
      if (map.getLayer(k)) katmanlar.push(k);
    }
    // Bolge dolgusu/cizgisi de "dolu" sayilir; tiklama kapaliyken sayilmaz.
    if (bolgeTiklanabilirRef.current) {
      for (const k of ["bolge-fill", "bolge-vurus"]) {
        if (map.getLayer(k)) katmanlar.push(k);
      }
    }
    const uzerinde = map.queryRenderedFeatures(e.point, { layers: katmanlar });
    if (uzerinde.length === 0) {
      onHaritaTiklaRef.current({ longitude: koordinat[0], latitude: koordinat[1] });
    }
  });
  /** Harita hareket ettikce gorunen alani bildirir. */
  const gorunumDegistiRef = useRef(() => {
    const map = mapRef.current;
    if (!map || !onGorunumDegistiRef.current) return;
    const sinirlar = map.getBounds();
    onGorunumDegistiRef.current([
      [sinirlar.getWest(), sinirlar.getSouth()],
      [sinirlar.getEast(), sinirlar.getNorth()],
    ]);
  });

  /** Fareyi izleyerek elastik onizleme cizgisini gunceller. */
  const fareHareketRef = useRef((e: maplibregl.MapMouseEvent) => {
    if (!cizimModuRef.current && !olcumModuRef.current) return;
    sonFareRef.current = [
      Number(e.lngLat.lng.toFixed(6)),
      Number(e.lngLat.lat.toFixed(6)),
    ];
    const map = mapRef.current;
    if (map) dinamikUygula(map);
  });

  /** Alan buyuklugu etiketi icin stillenmis DOM elemani.
   *
   *  `harita-etiket` sinifi metin netligini tasir: MapLibre marker'i
   *  `translate(-50%,-50%)` ile konumlandirdigi icin TEK sayili bir genislik/
   *  yukseklik yarim piksele duser ve metin bulaniklasir - ekip popup'indaki
   *  sorunun aynisi (bkz. index.css). */
  function etiketElemaniOlustur(): HTMLDivElement {
    const el = document.createElement("div");
    el.className = "harita-etiket";
    return el;
  }

  /** Aktif cizimin/olcumun (fare dahil) canli olcu etiketi.
   *
   *  Iki arac da ayni etiketi kullanir: alan cizerken m²/ha/km², mesafe
   *  olcerken m/km. **Etiket cizim surerken IMLECI izler** - uzun bir hatta
   *  orta nokta, buyuk bir alanda agirlik merkezi imlecin cok gerisinde kalir
   *  ve buyuyen sayiyi okumak icin goz geriye kaymak zorunda kalirdi. Fare
   *  bilinmiyorsa (imlec haritanin disinda) etiket sekle oturur. */
  function cizimEtiketiUygula(map: maplibregl.Map) {
    const cizimAcik = cizimModuRef.current;
    const olcumAcik = olcumModuRef.current;
    const noktalar = cizimAcik
      ? cizimNoktalariRef.current
      : olcumAcik
        ? olcumNoktalariRef.current
        : [];
    const fare = noktalar.length > 0 ? sonFareRef.current : null;
    const izlenen = fare ? [...noktalar, fare] : noktalar;
    // Alanda en az bir ucgen, hatta en az bir kenar olmali.
    const yeter = cizimAcik ? izlenen.length >= 3 : izlenen.length >= 2;

    if ((!cizimAcik && !olcumAcik) || !yeter) {
      cizimEtiketRef.current?.remove();
      cizimEtiketRef.current = null;
      return;
    }

    const metin = cizimAcik
      ? alanEtiketi(poligonAlaniM2(izlenen))
      : mesafeEtiketi(toplamMesafeMetre(izlenen));
    const kip = fare ? "imlec" : cizimAcik ? "alan" : "cizgi";
    const konum = fare
      ? fare
      : cizimAcik
        ? poligonMerkezi(izlenen)
        : cizgiOrtaNoktasi(izlenen);

    // Anchor/offset marker'a kurulusta verilir; kip degisince yeniden kurulur.
    if (cizimEtiketRef.current?.getElement().dataset.kip !== kip) {
      cizimEtiketRef.current?.remove();
      const el = etiketElemaniOlustur();
      el.dataset.kip = kip;
      cizimEtiketRef.current = new maplibregl.Marker({
        element: el,
        // Imleci izlerken etiket sag-altta durur: arti imlecin ucunu ve bir
        // sonraki tiklanacak yeri kapatmasin.
        anchor: kip === "imlec" ? "top-left" : kip === "cizgi" ? "bottom" : "center",
        offset: kip === "imlec" ? [14, 12] : kip === "cizgi" ? [0, -6] : [0, 0],
      })
        .setLngLat(konum)
        .addTo(map);
    } else {
      cizimEtiketRef.current.setLngLat(konum);
    }
    cizimEtiketRef.current.getElement().textContent = metin;
  }

  /** Tamamlanmis alanlarin kalici olcu etiketlerini senkronlar. */
  function tamamlananEtiketleriUygula(map: maplibregl.Map) {
    const guncelIdler = new Set<string>();

    for (const alan of tamamlananAlanlarRef.current) {
      guncelIdler.add(alan.id);
      const buyukluk = alanEtiketi(cokHalkaliAlanM2(alan.noktalar));
      const metin = alan.etiket ? `${alan.etiket} Â· ${buyukluk}` : buyukluk;
      // Cok parcali alanlarda etiket en buyuk parcanin ustune konur.
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

  /** Kaydedilmis bolgeleri/guzergahlari cizer. Anlik alan seciminden ayri
   *  kaynak/katman kullanir (kesik cizgili kenarlik + ad etiketi). */
  function bolgeleriUygula(map: maplibregl.Map) {
    const source = map.getSource(BOLGE_SOURCE_ID) as
      | maplibregl.GeoJSONSource
      | undefined;
    if (!source) return;

    // Sekli duzenlenen kayit kendi kaynaginda cizilir, burada atlanir.
    const duzenlenenId = sekilDuzenlemeRef.current?.id;
    const liste = (bolgelerRef.current ?? []).filter((b) => b.id !== duzenlenenId);
    const features: GeoJSON.Feature[] = liste.map((bolge) => ({
      type: "Feature",
      geometry:
        bolge.tip === "cizgi"
          ? { type: "LineString", coordinates: bolge.noktalar[0] }
          : bolge.noktalar.length === 1
            ? {
                type: "Polygon",
                coordinates: [[...bolge.noktalar[0], bolge.noktalar[0][0]]],
              }
            : {
                type: "MultiPolygon",
                coordinates: bolge.noktalar.map((halka) => [[...halka, halka[0]]]),
              },
      properties: { id: bolge.id, renk: bolge.renk },
    }));

    // Guzergahin BASLANGIC ucu ayri bir nokta olarak isaretlenir. Hat boyunca
    // dizilen oklar yonu soyler, ama "ekip nereden baslayacak" sorusunun
    // cevabi dogrudan gorunmeli: yol tarifi tam bu noktaya gider.
    for (const bolge of liste) {
      if (bolge.tip !== "cizgi") continue;
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: bolge.noktalar[0][0] },
        properties: { id: bolge.id, renk: bolge.renk, bas: true },
      });
    }

    source.setData({ type: "FeatureCollection", features });
    bolgeEtiketleriUygula(map, liste);
  }

  /** Her bolgenin ad + olcu (+ atanan ekip) etiketi. Ad kismi yetkili
   *  kullanicilar icin etiket uzerinde duzenlenebilir. Uzaklastikca onlarca
   *  etiket ust uste binip haritayi kirletiyordu: BOLGE_ETIKET_MINZOOM
   *  altinda hicbiri cizilmez, yalnizca sekil/cizgi kalir. */
  function bolgeEtiketleriUygula(map: maplibregl.Map, liste: Bolge[]) {
    const guncelIdler = new Set<string>();
    const gorunur = map.getZoom() >= BOLGE_ETIKET_MINZOOM;

    if (!gorunur) {
      for (const [id, marker] of bolgeEtiketleriRef.current) {
        if (etiketDuzenlenenRef.current === id) etiketDuzenlenenRef.current = null;
        marker.remove();
        bolgeEtiketleriRef.current.delete(id);
      }
      return;
    }

    for (const bolge of liste) {
      guncelIdler.add(bolge.id);
      const cizgi = bolge.tip === "cizgi";
      const olcu = cizgi
        ? bolge.uzunluk_m != null
          ? mesafeEtiketi(bolge.uzunluk_m)
          : null
        : alanEtiketi(bolge.alan_m2 ?? cokHalkaliAlanM2(bolge.noktalar));
      const ekMetin =
        (olcu ? ` · ${olcu}` : "") +
        (bolge.worker_ad ? ` · ${bolge.worker_ad}` : "") +
        (bolge.tamamlandi_at ? " · ✓" : "");
      // Cizgide etiket hattin uzunlugunun ortasina konur: nokta ortalamasi
      // L/kavisli guzergahlarda cizginin hic gecmedigi bir yere duserdi.
      const merkez = cizgi
        ? cizgiOrtaNoktasi(bolge.noktalar[0])
        : enBuyukHalkaMerkezi(bolge.noktalar);

      let marker = bolgeEtiketleriRef.current.get(bolge.id);
      if (!marker) {
        marker = new maplibregl.Marker({
          element: bolgeEtiketiElemani(bolge.id),
          // Guzergah etiketi hattin ustunde durur, alan etiketi ortalanir.
          anchor: cizgi ? "bottom" : "center",
          offset: cizgi ? [0, -5] : [0, 0],
        })
          .setLngLat(merkez)
          .addTo(map);
        bolgeEtiketleriRef.current.set(bolge.id, marker);
      } else {
        marker.setLngLat(merkez);
      }
      const el = marker.getElement();
      // Renk seridi kayitli bolgeyi anlik secim etiketinden ayirir.
      el.style.borderLeft = `3px solid ${bolge.renk}`;
      const adEl = el.querySelector<HTMLElement>("[data-rol=ad]");
      const ekEl = el.querySelector<HTMLElement>("[data-rol=ek]");
      // Ad o an duzenleniyorsa metne dokunulmaz.
      if (adEl && etiketDuzenlenenRef.current !== bolge.id) adEl.textContent = bolge.ad;
      if (ekEl) ekEl.textContent = ekMetin;
    }

    for (const [id, marker] of bolgeEtiketleriRef.current) {
      if (!guncelIdler.has(id)) {
        if (etiketDuzenlenenRef.current === id) etiketDuzenlenenRef.current = null;
        marker.remove();
        bolgeEtiketleriRef.current.delete(id);
      }
    }
  }

  /** Bolge etiketi: ad / olcu-ekip / kalem dugmesi. Kapsayici
   *  `pointer-events:none` kalir ki etiket altindaki alana yapilan tiklamayi
   *  yutmasin; yalnizca ad metni ve kalem olay alir. */
  function bolgeEtiketiElemani(id: string): HTMLDivElement {
    const el = etiketElemaniOlustur();
    el.style.display = "flex";
    el.style.alignItems = "center";
    el.style.gap = "4px";

    const ad = document.createElement("span");
    ad.dataset.rol = "ad";
    ad.style.pointerEvents = "auto";

    const ek = document.createElement("span");
    ek.dataset.rol = "ek";
    ek.style.opacity = "0.8";

    el.append(ad, ek);

    if (onBolgeAdDegisRef.current) {
      ad.style.cursor = "text";
      ad.title = "Adı değiştirmek için çift tıkla";
      ad.addEventListener("dblclick", (e) => {
        // Haritanin cift-tik yakinlastirmasini engelle.
        e.preventDefault();
        e.stopPropagation();
        bolgeAdiDuzenle(el, id);
      });

      const kalem = document.createElement("button");
      kalem.type = "button";
      kalem.dataset.rol = "kalem";
      kalem.textContent = "✎";
      kalem.title = "Adı değiştir";
      kalem.setAttribute("aria-label", "Adı değiştir");
      // Dolgu ve satir yuksekligi CIFT: flex satirinda ortalanan bir kutu tek
      // olcude olursa yarim piksele oturup metni bulaniklastirir (bkz. index.css
      // `.harita-etiket`).
      kalem.style.cssText =
        "pointer-events:auto; cursor:pointer; border:0; background:transparent; " +
        "color:#fff; opacity:0.6; padding:0 2px; font-size:11px; line-height:16px;";
      kalem.addEventListener("mouseenter", () => (kalem.style.opacity = "1"));
      kalem.addEventListener("mouseleave", () => (kalem.style.opacity = "0.6"));
      // Kalem altindaki alanin popup'ini acmasin, haritayi kaydirmasin.
      kalem.addEventListener("mousedown", (e) => e.stopPropagation());
      kalem.addEventListener("click", (e) => {
        e.stopPropagation();
        bolgeAdiDuzenle(el, id);
      });
      el.append(kalem);
    }

    return el;
  }

  /** Etiketin ad kismini metin girdisine cevirir: Enter/odak kaybi kaydeder,
   *  Esc vazgecer. Ad iyimser yazilir, istek reddedilirse geri alinir. */
  function bolgeAdiDuzenle(el: HTMLElement, id: string) {
    const degistir = onBolgeAdDegisRef.current;
    const adEl = el.querySelector<HTMLElement>("[data-rol=ad]");
    const kalemEl = el.querySelector<HTMLElement>("[data-rol=kalem]");
    const bolge = (bolgelerRef.current ?? []).find((b) => b.id === id);
    if (!degistir || !adEl || !bolge) return;
    // Ayni anda tek etiket duzenlenir.
    if (etiketDuzenlenenRef.current) return;
    etiketDuzenlenenRef.current = id;

    const girdi = document.createElement("input");
    girdi.value = bolge.ad;
    girdi.maxLength = 120;
    girdi.style.cssText =
      "pointer-events:auto; border:1px solid rgba(255,255,255,0.6); border-radius:3px; " +
      "background:rgba(15,23,42,0.9); color:#fff; font:600 11px system-ui,sans-serif; " +
      "padding:0 3px; outline:none;";
    const genisligiAyarla = () => {
      girdi.style.width = `${Math.min(28, Math.max(8, girdi.value.length + 1))}ch`;
    };
    genisligiAyarla();

    adEl.style.display = "none";
    if (kalemEl) kalemEl.style.display = "none";
    adEl.before(girdi);
    girdi.focus();
    girdi.select();

    let bitti = false;
    const kapat = (kaydet: boolean) => {
      // Enter'dan sonra gelen blur'u ele.
      if (bitti) return;
      bitti = true;
      const yeniAd = girdi.value.trim();
      girdi.remove();
      adEl.style.display = "";
      if (kalemEl) kalemEl.style.display = "";
      etiketDuzenlenenRef.current = null;
      if (kaydet && yeniAd && yeniAd !== bolge.ad) {
        adEl.textContent = yeniAd;
        adEl.title = "Adı değiştirmek için çift tıkla";
        Promise.resolve(degistir(id, yeniAd)).catch((hata: Error) => {
          // Haritada uyari seridi yok: hata etiketin uzerinde gosterilir.
          adEl.textContent = bolge.ad;
          adEl.title = `Ad kaydedilemedi: ${hata.message}`;
          const eskiZemin = el.style.background;
          el.style.background = "rgba(153,27,27,0.9)";
          window.setTimeout(() => (el.style.background = eskiZemin), 2000);
        });
      }
    };

    girdi.addEventListener("input", genisligiAyarla);
    // Girdideki tus/tiklamalar haritaya gitmesin.
    girdi.addEventListener("mousedown", (e) => e.stopPropagation());
    girdi.addEventListener("dblclick", (e) => e.stopPropagation());
    girdi.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") kapat(true);
      else if (e.key === "Escape") kapat(false);
    });
    girdi.addEventListener("blur", () => kapat(true));
  }

  /** Taslagin derin kopyasi: yukari bildirilen deger, surukleme sirasinda
   *  mutasyona ugrayan ref ile ayni diziyi paylasmamali. */
  function sekilTaslakKopyasi(): [number, number][][] {
    return sekilTaslakRef.current.map((halka) =>
      halka.map((n) => [n[0], n[1]] as [number, number])
    );
  }

  function sekilBildir() {
    onSekilDegisRef.current?.(sekilTaslakKopyasi());
  }

  /** Taslak geometriyi haritada gosterir. */
  function sekilUygula(map: maplibregl.Map) {
    const source = map.getSource(SEKIL_SOURCE_ID) as
      | maplibregl.GeoJSONSource
      | undefined;
    if (!source) return;

    const duzenleme = sekilDuzenlemeRef.current;
    const halkalar = sekilTaslakRef.current;
    if (!duzenleme || halkalar.length === 0) {
      source.setData(BOS_GEOJSON as unknown as GeoJSON.FeatureCollection);
      return;
    }

    const geometry: GeoJSON.Geometry =
      duzenleme.tip === "cizgi"
        ? { type: "LineString", coordinates: halkalar[0] }
        : {
            type: "MultiPolygon",
            coordinates: halkalar.map((halka) => [[...halka, halka[0]]]),
          };

    source.setData({
      type: "FeatureCollection",
      features: [{ type: "Feature", geometry, properties: { renk: duzenleme.renk } }],
    });
  }

  /** Kose suruklenirken komsu kenarlarin "+" tutamaklarini da tasir. */
  function sekilOrtaTutamaklariTasi() {
    const cizgi = sekilDuzenlemeRef.current?.tip === "cizgi";
    sekilTaslakRef.current.forEach((halka, h) => {
      const kenarSayisi = cizgi ? halka.length - 1 : halka.length;
      for (let i = 0; i < kenarSayisi; i++) {
        const marker = sekilTutamaklariRef.current.get(`orta-${h}-${i}`);
        if (!marker) continue;
        const a = halka[i];
        const b = halka[(i + 1) % halka.length];
        marker.setLngLat([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
      }
    });
  }

  /** Tutamaklari kurar: her kosede suruklenebilir nokta, her kenar ortasinda
   *  yeni kose ekleyen "+". Sayilari her eklemede degistigi icin fark tutmak
   *  yerine tamami yeniden kurulur (nokta sayisi sinirli, maliyeti onemsiz). */
  function sekilTutamaklariUygula(map: maplibregl.Map) {
    for (const marker of sekilTutamaklariRef.current.values()) marker.remove();
    sekilTutamaklariRef.current.clear();

    const duzenleme = sekilDuzenlemeRef.current;
    if (!duzenleme) return;

    const cizgi = duzenleme.tip === "cizgi";
    const enAzNokta = cizgi ? 2 : 3;

    sekilTaslakRef.current.forEach((halka, h) => {
      halka.forEach((nokta, i) => {
        const el = tutamakElemani(duzenleme.renk, false);
        el.title = "Sürükleyerek taşı · sağ tık ile sil";
        const marker = new maplibregl.Marker({ element: el, draggable: true })
          .setLngLat(nokta)
          .addTo(map);
        marker.on("drag", () => {
          const { lng, lat } = marker.getLngLat();
          sekilTaslakRef.current[h][i] = [
            Number(lng.toFixed(6)),
            Number(lat.toFixed(6)),
          ];
          sekilUygula(map);
          sekilOrtaTutamaklariTasi();
        });
        marker.on("dragend", sekilBildir);
        el.addEventListener("contextmenu", (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          // Alan en az 3, guzergah en az 2 nokta.
          if (sekilTaslakRef.current[h].length <= enAzNokta) return;
          sekilTaslakRef.current[h].splice(i, 1);
          sekilBildir();
        });
        sekilTutamaklariRef.current.set(`kose-${h}-${i}`, marker);
      });

      // Cizgide kapanis kenari yoktur; alanda son nokta ilk noktaya baglanir.
      const kenarSayisi = cizgi ? halka.length - 1 : halka.length;
      for (let i = 0; i < kenarSayisi; i++) {
        const a = halka[i];
        const b = halka[(i + 1) % halka.length];
        const el = tutamakElemani(duzenleme.renk, true);
        el.title = "Buraya yeni köşe ekle";
        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2])
          .addTo(map);
        el.addEventListener("mousedown", (ev) => ev.stopPropagation());
        el.addEventListener("click", (ev) => {
          ev.stopPropagation();
          // Konum marker'dan okunur: kose suruklendiyse orta nokta tasinmistir.
          const p = marker.getLngLat();
          sekilTaslakRef.current[h].splice(i + 1, 0, [
            Number(p.lng.toFixed(6)),
            Number(p.lat.toFixed(6)),
          ]);
          sekilBildir();
        });
        sekilTutamaklariRef.current.set(`orta-${h}-${i}`, marker);
      }
    });
  }

  /** Il sinirini maske kaynagina uygular (bkz. utils/istanbulMaskesi.ts). */
  function maskeUygula(map: maplibregl.Map) {
    istanbulMaskesiUygula(map, istanbulSiniriRef.current);
  }

  // Asagidaki *Uygula fonksiyonlari guncel ref degerlerini kaynaklara yazar.
  function veriUygula(map: maplibregl.Map) {
    const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    source?.setData(
      (assetsRef.current ?? BOS_KOLEKSIYON) as unknown as GeoJSON.FeatureCollection
    );
  }

  /** Talepler iki kaynaga birden yazilir:
   *
   *  - `reports`: her kayit NOKTA geometrisiyle (seklin temsil noktasi). Pin,
   *    glif, halka, rozet ve secim katmanlarinin tamami bu kaynagi okur, yani
   *    cizgi/alan destegi o zincire hic dokunmadi.
   *  - `talep-sekil`: yalnizca cizgi/alan kayitlarinin HAM SEKLI.
   *
   *  Ayrim, "isin yeri" ile "isin buyuklugu"nu ayri sorular olarak tutar. */
  function reportsUygula(map: maplibregl.Map) {
    const noktaSource = map.getSource(REPORTS_SOURCE_ID) as
      | maplibregl.GeoJSONSource
      | undefined;
    const sekilSource = map.getSource(TALEP_SEKIL_SOURCE_ID) as
      | maplibregl.GeoJSONSource
      | undefined;

    const kayitlar = reportsRef.current?.features ?? [];

    noktaSource?.setData({
      type: "FeatureCollection",
      features: kayitlar.flatMap((f) => {
        const nokta = talepNoktasi(f);
        if (!nokta) return [];
        return [
          {
            type: "Feature" as const,
            geometry: { type: "Point" as const, coordinates: nokta },
            properties: f.properties as unknown as GeoJSON.GeoJsonProperties,
          },
        ];
      }),
    });

    sekilSource?.setData({
      type: "FeatureCollection",
      features: kayitlar
        .filter(sekilliTalep)
        .map((f) => {
          const gorunum = f.properties.gorunum ?? f.properties.status;
          return {
            type: "Feature" as const,
            geometry: f.geometry as unknown as GeoJSON.Geometry,
            properties: {
              id: f.properties.id,
              renk: TALEP_DURUM_RENGI[gorunum],
              opaklik: TALEP_GIYSISI[gorunum].opaklik,
            },
          };
        }),
    });
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

  /** Tamamlanmis alan secimlerini haritada kalici gosterir. */
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

  /** Fareyi izleyen elastik cizgi + kapanis kenari onizlemesi. Yalnizca fare
   *  hareket ettikce calisir, React state'e dokunmaz. */
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
        // Kapanis kenari: fare biliniyorsa imlecten, degilse son noktadan.
        const kapanisBaslangic = fare ?? son;
        features.push({
          type: "Feature",
          geometry: { type: "LineString", coordinates: [kapanisBaslangic, noktalar[0]] },
          properties: { tip: "kapanis", renk },
        });
        if (fare) {
          // Imlecin oldugu yere kadar canli dolgu onizlemesi.
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

  /** Acik popup verilen turlerden birine aitse kapatir; degilse dokunmaz. */
  function popupKapat(turler: ("varlik" | "talep" | "bolge")[]) {
    if (!popupTuruRef.current || !turler.includes(popupTuruRef.current)) return;
    popupRef.current?.remove();
    popupRef.current = null;
    popupTuruRef.current = null;
  }

  function secimUygula(map: maplibregl.Map) {
    const id = seciliIdRef.current;
    map.setFilter("assets-selected", ["==", ["get", "id"], id ?? ""]);

    const secili = id
      ? assetsRef.current?.features.find((f) => f.properties.id === id)
      : undefined;
    if (!secili) {
      popupKapat(["varlik"]);
      return;
    }

    popupRef.current?.remove();
    // Sabit anchor: yoksa MapLibre popup'i gorunur tutmak icin karsi tarafa atar.
    const popup = new maplibregl.Popup({
      offset: 14,
      closeButton: false,
      anchor: "bottom",
    })
      .setLngLat(secili.geometry.coordinates)
      .setHTML(popupIcerigi(secili))
      .addTo(map);
    popupRef.current = popup;
    popupTuruRef.current = "varlik";
    konumSatiriDoldur(popup, secili);
    popup
      .getElement()
      ?.querySelector(".popup-detay-btn")
      ?.addEventListener("click", () => onVarlikDetayRef.current?.(secili.properties.id));
  }

  /** Secili bolgeyi belirgin kenarlikla isaretler. Acik popup'a dokunmaz:
   *  bolge popup'i tiklama aninda acilir, secim efekti onu kapatmamali. */
  function secimBolgeUygula(map: maplibregl.Map) {
    if (!map.getLayer("bolge-secili")) return;
    const id = seciliBolgeIdRef.current;
    map.setFilter("bolge-secili", ["==", ["get", "id"], id ?? ""]);
    if (!id) popupKapat(["bolge"]);
  }

  /** Secili talebi vurgular ve popup acar. */
  function secimTalepUygula(map: maplibregl.Map) {
    if (!map.getLayer("reports-selected")) return;
    const id = seciliTalepIdRef.current;
    map.setFilter("reports-selected", ["==", ["get", "id"], id ?? ""]);

    const secili = id
      ? reportsRef.current?.features.find((f) => f.properties.id === id)
      : undefined;
    if (!secili) {
      popupKapat(["talep"]);
      return;
    }

    popupRef.current?.remove();
    const popup = new maplibregl.Popup({
      // Talep pin olarak cizildigi icin offset pin yuksekligi + durum halkasi
      // kadar (varlik dairelerinde 14 yetiyor).
      offset: 50,
      closeButton: false,
      anchor: "bottom",
    })
      .setLngLat(talepNoktasi(secili) ?? [0, 0])
      .setHTML(talepPopupIcerigi(secili))
      .addTo(map);
    popupRef.current = popup;
    popupTuruRef.current = "talep";
    // Onay/ret, "Varlığı Yönet" ve "Reddi Geri Al" talep detay modalindedir:
    // popup her kayit turunde yalnizca kaydin kartini acar.
    popup
      .getElement()
      ?.querySelector(".popup-detay-btn")
      ?.addEventListener("click", () => onTalepDetayRef.current?.(secili.properties.id));
  }

  /** Bir katmana tiklama + imlec dinleyicilerini baglar. Once `off` cagrilir:
   *  stil degisiminde ayni dinleyici iki kez kayitli kalmasin. */
  function katmanBagla(
    map: maplibregl.Map,
    katman: string,
    tikla: (e: maplibregl.MapLayerMouseEvent) => void
  ) {
    map.off("click", katman, tikla);
    map.on("click", katman, tikla);
    map.off("mouseenter", katman, fareGirdiRef.current);
    map.on("mouseenter", katman, fareGirdiRef.current);
    map.off("mouseleave", katman, fareCiktiRef.current);
    map.on("mouseleave", katman, fareCiktiRef.current);
  }

  /** Kaynak/katmanlari kurar: ilk yuklemede ve her stil degisiminden sonra. */
  function kaynaklariHazirla(map: maplibregl.Map) {
    // Maske en altta eklenir ki varlik/cizim katmanlarini ortmesin.
    maskeKaynagiHazirla(map);

    // Talep sekilleri en altta: isin BUYUKLUGUNU anlatan baglam katmanidir,
    // uzerindeki varlik daireleri ve talep pinleri isin KENDISIDIR.
    talepSekilKatmanlari(map);
    varlikKatmanlari(map);
    talepKatmanlari(map);
    secilenAlanKatmanlari(map);
    bolgeKatmanlari(map);
    sekilDuzenlemeKatmanlari(map);
    cizimKatmanlari(map);
    olcumKatmanlari(map);
    dinamikOnizlemeKatmanlari(map);

    katmanBagla(map, "assets-circle", assetsTiklandiRef.current);
    katmanBagla(map, "reports-circle", reportsTiklandiRef.current);
    // Bolge dolgusu + kalin vurus seridi de tiklanabilir.
    for (const katman of ["bolge-fill", "bolge-vurus"]) {
      katmanBagla(map, katman, bolgeTiklandiRef.current);
    }
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
    bolgeleriUygula(map);
    sekilUygula(map);
    sekilTutamaklariUygula(map);
    olcumUygula(map);
    secimUygula(map);
    secimTalepUygula(map);
    secimBolgeUygula(map);
    gorunumDegistiRef.current();

    // Sembol katmanlari ancak glif goruntuleri yuklendikten sonra eklenebilir.
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
        katmanBagla(map, "assets-icon", assetsTiklandiRef.current);

        // "Bakim lazim" durumunun TEK gorsel isareti amber halkadir
        // (`assets-durum`). Ayrica bir "!" rozeti de basiliyordu; ayni kosula
        // bagli iki isaret ayni seyi iki kez soyleyip isaretciyi
        // kalabalıklastiriyordu, rozet kaldirildi.
        //
        // Aktif bir goreve bagli varliklarin sag-alt kosesinde kucuk bir
        // nokta: saha ekibi pininin rengiyle ayni aile (ATAMA_RENGI), "bir
        // ekiple iliskili" anlamini haritanin baska bir yerinden odunc alir.
        // BURADA (assets-icon ile ayni asenkron blokta) eklenir ki z-sirada
        // glif katmaniyla ayni seviyede kalsin.
        if (!map.getLayer("assets-atama")) {
          map.addLayer({
            id: "assets-atama",
            type: "circle",
            source: SOURCE_ID,
            filter: ["==", ["get", "assigned"], true],
            paint: {
              "circle-radius": ISARETCI.atamaYaricap,
              "circle-color": ATAMA_RENGI,
              "circle-stroke-width": 1.5,
              "circle-stroke-color": "#ffffff",
              "circle-translate": ATAMA_KAYMASI as never,
            },
          });
          katmanBagla(map, "assets-atama", assetsTiklandiRef.current);
        }
      }

      if (map.getSource(REPORTS_SOURCE_ID) && !map.getLayer("reports-icon")) {
        // Secim pini EN ALTA: normal pinin arkasindan tasarak kontur olur.
        map.addLayer({
          id: "reports-selected",
          type: "symbol",
          source: REPORTS_SOURCE_ID,
          filter: ["==", ["get", "id"], ""],
          layout: { "icon-image": "talep-pin-secim", ...PIN_SECIM_YERLESIMI },
        });
        // Durum halkasi pinin arkasinda: amber dolu = acik is, mor kesikli =
        // karar bekliyor. Kapanmis gorunumlerde halka cizilmez.
        map.addLayer({
          id: "reports-halka",
          type: "symbol",
          source: REPORTS_SOURCE_ID,
          filter: gorunumFiltresi(HALKALI_GORUNUMLER),
          layout: {
            "icon-image": [
              "concat",
              "talep-halka-",
              ["coalesce", ["get", "gorunum"], ["get", "status"]],
            ],
            ...PIN_KATMAN_YERLESIMI,
          },
          paint: { "icon-opacity": TALEP_OPAKLIK_IFADESI as never },
        });
        // Talep pini: dolgu varliklarla ayni tur rengi, damla sekli kaydin
        // vatandastan geldigini anlatir.
        map.addLayer({
          id: "reports-pin",
          type: "symbol",
          source: REPORTS_SOURCE_ID,
          layout: {
            "icon-image": ["concat", "talep-pin-", ["get", "type"]],
            ...PIN_KATMAN_YERLESIMI,
          },
          paint: { "icon-opacity": TALEP_OPAKLIK_IFADESI as never },
        });
        // Tur glifi pinle ayni viewBox'ta basilir, boylece icon-offset gerekmez.
        map.addLayer({
          id: "reports-icon",
          type: "symbol",
          source: REPORTS_SOURCE_ID,
          layout: {
            "icon-image": ["concat", "pin-glif-", ["get", "type"]],
            ...PIN_KATMAN_YERLESIMI,
          },
          paint: { "icon-opacity": TALEP_OPAKLIK_IFADESI as never },
        });
        // Durum rozeti en ustte, pinin sag-ust omzunda.
        map.addLayer({
          id: "reports-rozet",
          type: "symbol",
          source: REPORTS_SOURCE_ID,
          minzoom: ROZET_MINZOOM,
          filter: gorunumFiltresi(ROZETLI_GORUNUMLER),
          layout: {
            "icon-image": [
              "concat",
              "talep-rozet-",
              ["coalesce", ["get", "gorunum"], ["get", "status"]],
            ],
            ...PIN_KATMAN_YERLESIMI,
          },
          paint: { "icon-opacity": TALEP_OPAKLIK_IFADESI as never },
        });
        // Pinin sag-alt omzunda kucuk bir nokta: onaydan dogan varlik aktif
        // bir goreve bagliysa. `assets-atama` ile ayni fikir, ayni renk ve
        // AYNI KOSE (bkz. haritaIkonlari.ts::talepAtamaSvg) - daire ve pin
        // ayni sozlugu konussun diye.
        map.addLayer({
          id: "reports-atama",
          type: "symbol",
          source: REPORTS_SOURCE_ID,
          filter: ["==", ["get", "assigned"], true],
          layout: {
            "icon-image": "talep-pin-atama",
            ...PIN_KATMAN_YERLESIMI,
          },
          paint: { "icon-opacity": TALEP_OPAKLIK_IFADESI as never },
        });
        // Halka tiklamaya baglanmaz: genis bir alan kapladigi icin bos harita
        // tiklamasini (koordinat secimini) yutardi.
        for (const katman of [
          "reports-pin",
          "reports-icon",
          "reports-rozet",
          "reports-atama",
        ]) {
          katmanBagla(map, katman, reportsTiklandiRef.current);
        }
        // Secim katmani asenkron eklendi: bu arada yapilmis secimin filtresi
        // kaybolmasin diye tekrar uygulanir.
        secimTalepUygula(map);
      }
    });
  }

  // --- Haritayi bir kez kur ---
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // Marker koleksiyonlari temizlik icin burada yakalanir (lint kurali:
    // ref.current temizlik aninda degismis olabilir).
    const tamamlananEtiketleri = tamamlananEtiketleriRef.current;
    const bolgeEtiketleri = bolgeEtiketleriRef.current;
    const sekilTutamaklari = sekilTutamaklariRef.current;
    const ekipMarkerlari = ekipMarkerlariRef.current;

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
    setHaritaOrnegi(map);
    onHaritaHazirRef.current?.(map);

    map.addControl(new maplibregl.NavigationControl(), "bottom-right");
    map.addControl(new maplibregl.ScaleControl(), "bottom-left");
    haritayaKapaliAttributionEkle(map);

    map.on("load", () => kaynaklariHazirla(map));
    map.on("render", popupHizalaRef.current);
    // Bolge etiketleri BOLGE_ETIKET_MINZOOM esiginde gorunur/gizlenir olmali.
    map.on("zoomend", () => bolgeEtiketleriUygula(map, bolgelerRef.current ?? []));

    // MapLibre kapsayici boyutu degisince kendiliginden yeniden boyutlanmaz.
    const boyutGozlemci = new ResizeObserver(() => map.resize());
    boyutGozlemci.observe(containerRef.current);

    // Il siniri bir kez getirilir; maske katmani bu veriyle dolar.
    let iptal = false;
    ilSiniri(ISTANBUL_IL_KODU)
      .then((sinir) => {
        if (iptal) return;
        istanbulSiniriRef.current = sinir.noktalar;
        if (hazirRef.current) maskeUygula(map);
      })
      .catch(() => {
        // Sinir gelmezse maske bos kalir, harita yine calisir.
      });

    return () => {
      iptal = true;
      boyutGozlemci.disconnect();
      popupRef.current?.remove();
      cizimEtiketRef.current?.remove();
      for (const marker of tamamlananEtiketleri.values()) marker.remove();
      tamamlananEtiketleri.clear();
      for (const marker of bolgeEtiketleri.values()) marker.remove();
      bolgeEtiketleri.clear();
      for (const marker of sekilTutamaklari.values()) marker.remove();
      sekilTutamaklari.clear();
      for (const marker of ekipMarkerlari.values()) marker.remove();
      ekipMarkerlari.clear();
      map.remove();
      mapRef.current = null;
      setHaritaOrnegi(null);
      hazirRef.current = false;
      onHaritaHazirRef.current?.(null);
    };
    // `kaynaklariHazirla` bilerek bagimlilik degil: her render'da yeniden
    // olustugu icin listeye girerse harita her render'da yikilip kurulurdu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // Yalnizca stil kimligi degisince calismali (bkz. kurulum effect'i).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aktifStilId]);

  // --- Tur sozlugu degisince renk ifadesini ve glifleri tazele ---
  // Ikisi de katmanlar kurulurken sozlukten URETILIYOR (bkz. tipRengiIfadesi /
  // tipIkonlariniHazirla), yani admin calisirken yeni bir tur eklerse ya da bir
  // turun grubunu/glifini degistirirse harita bir sonraki stil degisimine kadar
  // bayat kalirdi. Sozluk pratikte nadiren degistigi icin ucuz bir effect.
  const sozlukSurumu = turSozluguSurumu();
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !hazirRef.current) return;
    if (map.getLayer("assets-circle")) {
      map.setPaintProperty("assets-circle", "circle-color", tipRengiIfadesi());
    }
    tipIkonlariniHazirla(map);
  }, [sozlukSurumu]);

  // --- Veri degisince kaynagi guncelle ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (hazirRef.current) veriUygula(map);
  }, [assets]);

  // --- Talep noktalari degisince kaynagi guncelle ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (hazirRef.current) reportsUygula(map);
  }, [reports]);

  // --- Secili talep degisince: vurgula, popup ac, konumuna ucur ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !hazirRef.current) return;

    secimTalepUygula(map);

    const haritadanMi = sonSecimHaritadanRef.current;
    sonSecimHaritadanRef.current = false;

    if (seciliTalepId && reports) {
      const secili = reports.features.find(
        (f) => f.properties.id === seciliTalepId
      );
      if (secili) {
        const hedef = haritadanMi ? SECIM_UCUS_HARITADAN : SECIM_UCUS_LISTEDEN;
        map.flyTo({
          center: talepNoktasi(secili) ?? [0, 0],
          zoom: Math.max(map.getZoom(), hedef.zoom),
          duration: hedef.duration,
        });
      }
    }
  }, [seciliTalepId, reports]);

  // --- Cizim noktalarini haritada goster ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (hazirRef.current) cizimUygula(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cizimNoktalari]);

  // --- Cizim rengi degisince mevcut alani/cizgiyi yeniden boya ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !hazirRef.current) return;
    cizimUygula(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cizimRengi]);

  // --- Tamamlanmis alanlar degisince (yeni eklendi/kaldirildi) haritayi guncelle ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (hazirRef.current) tamamlananUygula(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tamamlananAlanlar]);

  // --- Kaydedilmis bolgeler degisince (eklendi/silindi/renk-ad guncellendi) ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (hazirRef.current) bolgeleriUygula(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bolgeler]);

  // --- Secili bolge/guzergah degisince vurguyu guncelle ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !hazirRef.current) return;
    secimBolgeUygula(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seciliBolgeId]);

  // --- Sekil duzenleme: taslak degisince cizimi ve tutamaklari yenile ---
  // `bolgeleriUygula` da cagrilir: duzenlenen kayit kalici katmandan cikarilir,
  // duzenleme bitince geri konur.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !hazirRef.current) return;
    sekilTaslakRef.current = (sekilDuzenleme?.noktalar ?? []).map((halka) =>
      halka.map((n) => [n[0], n[1]] as [number, number])
    );
    sekilUygula(map);
    sekilTutamaklariUygula(map);
    bolgeleriUygula(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sekilDuzenleme]);

  // --- Olcum noktalarini haritada goster ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (hazirRef.current) olcumUygula(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [olcumNoktalari]);

  // --- Canli saha ekibi konumlarini (DOM marker) senkronla ---
  // Bagimliliklar arasinda HARITA ORNEGI de var: harita yeniden kurulursa
  // marker'lar yeni haritaya bu effect disinda eklenmez (bkz. `haritaOrnegi`).
  useEffect(() => {
    const map = haritaOrnegi;
    if (!map) {
      // Harita gitti: eski marker'lar olu bir haritaya bagli, kayit tutulursa
      // yeni harita kuruldugunda "zaten var" sayilip hic eklenmezler.
      for (const marker of ekipMarkerlariRef.current.values()) marker.remove();
      ekipMarkerlariRef.current.clear();
      return;
    }
    const guncel = new Set<string>();
    /** Ekibin mudurlugunun rengi/adi; departmansiz ekip varsayilan renkte. */
    const departmanBilgisi = (e: EkipGorevleri) =>
      (e.departman ? ekipDepartmanlari?.[e.departman] : undefined) ?? {
        ad: "",
        renk: EKIP_VARSAYILAN_RENK,
      };
    for (const e of ekipler ?? []) {
      if (e.longitude == null || e.latitude == null) continue;
      guncel.add(e.id);
      const { ad: departmanAd, renk } = departmanBilgisi(e);
      let marker = ekipMarkerlariRef.current.get(e.id);
      if (!marker) {
        const el = document.createElement("div");
        ekipMarkerGuncelle(el, e, renk);
        const popup = new maplibregl.Popup({
          // Pin (30px) + ucu (7px) kadar yukarida acilir, isaretciyi ortmez.
          offset: 42,
          closeButton: true,
          anchor: "bottom",
          // Metin bulanikligina karsi kurallar index.css'te.
          className: "ekip-popup",
        }).setHTML(ekipPopupHtml(e, renk, departmanAd));
        // Is satirlarina tiklama kapsayiciya delege edilir: icerik her veri
        // tazelemesinde setHTML ile yeniden yazildigi icin satira baglanan
        // dinleyiciler kaybolurdu. dataset isareti cift baglamayi onler.
        popup.on("open", () => {
          const kapsayici = popup.getElement();
          if (!kapsayici || kapsayici.dataset.gorevBagli) return;
          kapsayici.dataset.gorevBagli = "1";
          kapsayici.addEventListener("click", (ev) => {
            // Tekil is -> varlik detayi, bolge/guzergah -> bolge detayi. Ikisi
            // ayni listede oldugu icin tek dinleyici iki oznitelige de bakar.
            const hedef = (ev.target as HTMLElement | null)?.closest<HTMLElement>(
              "[data-gorev-asset],[data-gorev-bolge]"
            );
            if (!hedef) return;
            const assetId = hedef.dataset.gorevAsset;
            const bolgeId = hedef.dataset.gorevBolge;
            if (!assetId && !bolgeId) return;
            ev.stopPropagation();
            if (assetId) onEkipGorevSecRef.current?.(assetId);
            else if (bolgeId) onEkipBolgeSecRef.current?.(bolgeId);
          });
        });
        const yeni = new maplibregl.Marker({ element: el, anchor: "bottom" })
          .setLngLat([e.longitude, e.latitude])
          .setPopup(popup)
          .addTo(map);
        // mousedown canvas'a gitmezse harita tiklamasi ("Ekle" formu) acilmaz;
        // MapLibre'nin otomatik popup toggle'i da buna bagli oldugu icin
        // popup'i kendimiz ac/kapa.
        el.addEventListener("mousedown", (ev) => ev.stopPropagation());
        el.addEventListener("click", (ev) => {
          ev.stopPropagation();
          yeni.togglePopup();
        });
        marker = yeni;
        ekipMarkerlariRef.current.set(e.id, marker);
      } else {
        marker.setLngLat([e.longitude, e.latitude]);
        ekipMarkerGuncelle(marker.getElement(), e, renk);
        marker.getPopup()?.setHTML(ekipPopupHtml(e, renk, departmanAd));
      }
    }
    for (const [id, marker] of ekipMarkerlariRef.current) {
      if (!guncel.has(id)) {
        marker.remove();
        ekipMarkerlariRef.current.delete(id);
      }
    }
  }, [ekipler, ekipDepartmanlari, haritaOrnegi]);

  // --- Cizim/olcum modunda imleci artiya cevir, elastik onizlemeyi sifirla ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getCanvas().style.cursor = cizimModu || olcumModu ? "crosshair" : "";
    // Mod kapanirken de calisir: imlece uzanan elastik cizgi haritada asili
    // kalmasin.
    sonFareRef.current = null;
    if (hazirRef.current) dinamikUygula(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  return <div ref={containerRef} className="haberver-harita h-full w-full" />;
}
