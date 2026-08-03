import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";

import { ilSiniri } from "../api/sinirlar";
import { HARITA_STILLERI, type HaritaStilId } from "../data/mapStyles";
import type { TamamlananAlan } from "../types/alan";
import type { Bolge, SekilDuzenleme } from "../types/bolge";
import type { AssetFeatureCollection } from "../types/asset";
import { HALKALI_GORUNUMLER, ROZETLI_GORUNUMLER } from "../types/report";
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
} from "../utils/geo";
import { BOS_GEOJSON } from "../utils/geojson";
import { haritayaKapaliAttributionEkle } from "../utils/haritaAttribution";
// Isaretci goruntuleri (pin/glif/halka/rozet SVG'leri) ve bunlara bagli stil
// ifadeleri ayri modulde: bu dosya haritanin yasam dongusune odakli kalsin.
import {
  IHBAR_OPAKLIK_IFADESI,
  TIP_RENGI_IFADESI,
  VARLIK_UYARI_RENK,
  gorunumFiltresi,
  tipIkonlariniHazirla,
} from "../utils/haritaIkonlari";
// Popup/marker HTML uretimi ayri modulde: bu dosya haritanin yasam dongusune
// (kaynak/katman/effect) odakli kalsin diye.
import {
  bolgePopupIcerigi,
  ekipMarkerGuncelle,
  ekipPopupHtml,
  ihbarPopupIcerigi,
  konumSatiriDoldur,
  popupIcerigi,
} from "../utils/haritaPopup";
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
/** Kaydedilmis gorev bolgeleri / guzergahlar - anlik secimlerden (yukaridaki
 *  TAMAMLANAN) ayri bir kaynakta durur: kalicidir, secimler temizlenince
 *  haritadan kalkmaz ve kesik cizgiyle cizilerek gorsel olarak da ayrilir. */
const BOLGE_SOURCE_ID = "bolgeler";
/** Sekli duzenlenmekte olan bolge/guzergah - kendi kaynaginda cizilir ki
 *  koseleri suruklenirken kalici katmanla (ve digerlerinin tiklama alanlariyla)
 *  karismasin; duzenlenen kayit BOLGE_SOURCE_ID'den bu sirada cikarilir. */
const SEKIL_SOURCE_ID = "sekil-duzenleme";
const OLCUM_SOURCE_ID = "olcum";
const DINAMIK_SOURCE_ID = "dinamik-onizleme";
const OLCUM_RENK = "#2563eb";
/* ------------------------------------------------------------------ *
 * Isaretci gorsel dili - UC BILGI, UC AYRI TASIYICI
 *
 *   RENK          -> KATEGORI. Turun grup rengi (types/asset.ts GRUP_RENGI),
 *                    hem varlik dairesinde hem ihbar pininde. Baska hicbir sey
 *                    anlatmaz.
 *   SEKIL         -> KAYDIN KAYNAGI. Dolu DAIRE = envanterdeki varlik,
 *                    damla PIN = vatandas ihbari.
 *   HALKA + ROZET -> IS DURUMU. Amber dolu halka + "!" = acik is; mor KESIKLI
 *                    halka + "?" = karar bekliyor; halka yok + sonumleme =
 *                    kapanmis (tamir "✓" %50, red "✕" %38).
 *   GLIF          -> TUR (beyaz cizgi ikonu, data/tipGlifleri.ts).
 *
 * Onceki tasarimda renk hem kategoriyi hem durumu tasiyordu ve iki palet uc
 * tonda cakisiyordu (zumrut = "Yeşil Alan" VE "Onaylandı", slate = "Diğer" VE
 * "Tamir Edildi", mor = "ihbardan dogdu" VE "bekleyen"); ustune "bakim lazim"
 * varligin dolgusu amber'e cevriliyor, yani o varligin KATEGORISI haritada
 * tamamen kayboluyordu.
 *
 * Kilit karar: bakim gerektiren bir varlik ile onaylanmis bir ihbar AYNI amber
 * giysiyi giyer - ikisi de ekibin gitmesi gereken acik istir. Aralarindaki tek
 * fark sekil. Boylece "ayni is" mesaji renk feda edilmeden verilir.
 * ------------------------------------------------------------------ */

const BOS_KOLEKSIYON: AssetFeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

/** Bir varlik/ihbara ucarken kullanilan zoom/sure degerleri: haritadaki bir
 *  noktaya tiklandiginda daha yakina ama asiri olmayan bir zoom, listeden
 *  secildiginde ise daha uzak bir zoom kullanilir; her iki durumda da
 *  animasyon eskisinden belirgin sekilde yavastir. */
const SECIM_UCUS_HARITADAN = { zoom: 14, duration: 1500 };
const SECIM_UCUS_LISTEDEN = { zoom: 12.5, duration: 2000 };
/** Sinir/arama gibi diger ucus hedeflerinde kullanilan (yavaslatilmis) sure. */
const UCUS_SURESI_VARSAYILAN = 1600;

const IKON_KATMAN_YERLESIMI: Record<string, unknown> = {
  "icon-size": ["interpolate", ["linear"], ["zoom"], 10, 0.55, 16, 0.95],
  "icon-allow-overlap": true,
  "icon-ignore-placement": true,
};

/** Pin ailesi (pin, glif, halka, rozet): ucu koordinata otursun diye alttan
 *  cakili. Hepsi ayni viewBox/olcuyu kullandigi icin parcalar birbirine
 *  otomatik oturur.
 *
 *  OLCU KURALI: pinin BAS CAPI = varlik dairesinin CAPI. Bas capi viewBox'ta
 *  sabit 19.2 birim (2 * PIN_BAS_YARICAP) ve 1 birim = icon-size 1'de 1 px
 *  oldugundan olcek dogrudan turetilir:
 *    z10 -> daire r 8    => 16 / 19.2 = 0.83
 *    z16 -> daire r 14.5 => 29 / 19.2 = 1.51
 *  Eskiden pin IKON_KATMAN_YERLESIMI'ni (0.55 -> 0.95) paylasiyordu, yani basi
 *  18px capindaydi ve yanindaki 29px'lik daireden yapisal olarak kucuktu;
 *  glifi de ayni oranda kuculdugu icin okunmuyordu. */
const PIN_KATMAN_YERLESIMI: Record<string, unknown> = {
  ...IKON_KATMAN_YERLESIMI,
  "icon-size": ["interpolate", ["linear"], ["zoom"], 10, 0.83, 16, 1.51],
  "icon-anchor": "bottom",
};

/** Secili ihbarin altina cizilen koyu pin - normalden bir tik buyuk olmasi
 *  kalin bir kontur etkisi verir (olcek PIN_KATMAN_YERLESIMI'nin ~1.22 kati). */
const PIN_SECIM_YERLESIMI: Record<string, unknown> = {
  ...PIN_KATMAN_YERLESIMI,
  "icon-size": ["interpolate", ["linear"], ["zoom"], 10, 1.01, 16, 1.84],
};

/** Varlik rozeti: kaymasi goruntuye gomulu oldugu icin merkeze cakili. Olcek,
 *  rozet diskinin daire kenarinda pin rozetiyle AYNI capa gelmesi icin
 *  turetildi (rozet merkezi tuval merkezinden 14.0 birim uzakta, hedef
 *  daire yaricapinin ~1.31 kati).
 *
 *  minzoom: uzakta ~8px'lik bir "!" okunmaz; o mesafede durumu amber uyari
 *  HALKASI zaten tasiyor, rozet yakinlasinca devreye giriyor. */
const VARLIK_ROZET_YERLESIMI: Record<string, unknown> = {
  "icon-size": ["interpolate", ["linear"], ["zoom"], 10, 0.75, 16, 1.36],
  "icon-allow-overlap": true,
  "icon-ignore-placement": true,
};
/** Rozetlerin gorunmeye basladigi zoom (hem varlik hem ihbar tarafinda). */
const ROZET_MINZOOM = 12.5;

/** Isaretci olculeri tek yerde: tur glifi okunabilir kalsin diye daireler
 *  belirgin (kalin beyaz halka + yumusak golge), ama uzaklasinca (z10-12)
 *  birbirine girmesin diye o uctaki yaricaplar belirgin sekilde kucuk. */
const ISARETCI = {
  /** Varlik dairesi yaricapi (zoom 10 -> 16 arasi interpolasyon). */
  varlikYaricap: ["interpolate", ["linear"], ["zoom"], 10, 8, 16, 14.5],
  /** Ihbar pininin ucundaki yer golgesi (pin havada durmasin). */
  ihbarGolgeYaricap: ["interpolate", ["linear"], ["zoom"], 10, 2.5, 16, 4],
  /** "Bakim lazim" amber uyari halkasi - ana dairenin disinda kalmali. Artik
   *  durumun TEK gorsel tasiyicisi (dolgu tur rengine birakildi), bu yuzden
   *  ihbar pinindeki halkayla ayni agirlikta okunmali. */
  uyariYaricap: ["interpolate", ["linear"], ["zoom"], 10, 10.5, 16, 17],
  /** Secim halkalari - uyari halkasinin da disinda. */
  varlikSecimYaricap: ["interpolate", ["linear"], ["zoom"], 10, 12.5, 16, 19],
  beyazHalka: 2.2,
} as const;

/** Isaretcinin altina yumusak golge - dairenin hafif buyugu, asagi kaydirilmis
 *  ve bulaniklastirilmis siyah bir daire (altliktan bagimsiz derinlik hissi). */
function golgeBoyasi(yaricap: unknown, opaklik: unknown = 1): Record<string, unknown> {
  return {
    "circle-radius": yaricap,
    "circle-color": "#0f172a",
    // Sonumlenen ihbarlarda golge de sonmeli, yoksa %38 opak bir pinin altinda
    // tam opak bir golge kaliyor.
    "circle-opacity": ["*", 0.22, opaklik],
    "circle-blur": 0.5,
    "circle-translate": [0, 2],
  };
}

/** Sekil duzenlemedeki bir tutamagin DOM elemani. `orta=true` kenar ortasindaki
 *  "yeni kose ekle" tutamagidir: koselerden ayirt edilsin diye daha kucuk,
 *  yari saydam ve icinde "+" isareti tasir. */
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

/** Haritayi belirli bir bolgeye/noktaya ucurmak icin komut. `anahtar` her
 *  degistiginde yeniden tetiklenir (ayni hedefe tekrar ucmak istenirse bile
 *  benzersiz uretilmelidir, orn. crypto.randomUUID()). */
export type UcusHedefi =
  | { anahtar: string; tip: "sinir"; bounds: [[number, number], [number, number]] }
  | { anahtar: string; tip: "nokta"; merkez: [number, number]; zoom?: number };

interface MapViewProps {
  assets?: AssetFeatureCollection;
  /** "Ä°hbarlar" sekmesi aktifken haritada gosterilecek ihbar (report) noktalari;
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
  /** Varlik popup'undaki "Düzenle" - dogrudan duzenleme formunu acar. Verilmezse
   *  (yetkisi olmayan roller) dugme popup'ta hic cizilmez. */
  onVarlikDuzenle?: (id: string) => void;
  /** Bir ihbar popup'undaki "Detaylari Gor" butonuna tiklaninca - ayni sekilde
   *  ihbarin ozet kartini acar. */
  onIhbarDetay?: (id: string) => void;
  /** ONAYLANMIS ihbar popup'undaki "Yönet" - ihbardan olusan varligin detay
   *  modalini (ekibe atama/degistirme, duzenle, sil) acar. Verilmezse dugme
   *  cizilmez; ayrica bu prop popup'in "personel" modunda oldugunu belirtir. */
  onIhbarVarlikYonet?: (id: string) => void;
  /** REDDEDILMIS ihbar popup'undaki "Reddi Geri Al" - ihbari tekrar
   *  "beklemede"ye ceker. Verilmezse dugme cizilmez. */
  onIhbarGeriAl?: (id: string) => void;
  /** Harita her hareket ettiginde (pan/zoom) gorunen alanin sinirlarini bildirir;
   *  konum aramasini o an ekranda gorunen bolgeye onceliklendirmek icin kullanilir. */
  onGorunumDegisti?: (bounds: [[number, number], [number, number]]) => void;
  /** Personel gorunumunde canli saha ekibi konumlari (DOM marker olarak cizilir);
   *  verilmezse hicbir sey gosterilmez. */
  ekipler?: EkipGorevleri[];
  /** Ekip popup'indaki bir is satirina (aktif gorev ya da son tamir edilen)
   *  tiklandiginda o varligin id'siyle cagrilir - ust bilesen varlik detay
   *  modalini acar (tamir/atama/duzenleme orada yapilir). */
  onEkipGorevSec?: (assetId: string) => void;
  /** Haritada gosterilecek kaydedilmis bolgeler/guzergahlar (Bölgeler paneli
   *  hangilerinin gorunur oldugunu belirler). */
  bolgeler?: Bolge[];
  /** Haritadaki bir bolge/guzergah popup'indaki "Detay" dugmesi - alanlar ve
   *  cizgiler de varlik isaretcileri gibi tiklanip detayi gorulebilir. */
  onBolgeDetay?: (id: string) => void;
  /** Secili bolge/guzergah - varlik/ihbar isaretcileriyle ayni mantik: haritada
   *  belirgin (duz, kalin) bir kenarlikla isaretlenir. */
  seciliBolgeId?: string | null;
  /** Bir bolgeye/guzergaha tiklaninca (secim). */
  onBolgeSec?: (id: string) => void;
  /** Popup'taki "Şekli Düzenle" - haritada kose duzenleme modunu baslatir. */
  onSekilDuzenle?: (id: string) => void;
  /** Bir bolge/guzergahin adinin HARITADAKI etiket uzerinden degistirilmesi:
   *  etikette kalem dugmesi cikar, cift tiklamak da duzenlemeyi acar. Verilmezse
   *  etiketler salt okunurdur (yetkisiz gorunumler icin). Donen soz reddedilirse
   *  etiket eski ada geri doner ve hatayi kendi uzerinde gosterir. */
  onBolgeAdDegis?: (id: string, ad: string) => void | Promise<void>;
  /** Sekli duzenlenmekte olan bolge (taslak geometri). Verildiginde bu kayit
   *  kalici bolge katmanindan cikarilir ve koseleri suruklenebilir hale gelir. */
  sekilDuzenleme?: SekilDuzenleme | null;
  /** Taslak geometri degisince (kose suruklendi/eklendi/silindi). */
  onSekilDegis?: (noktalar: [number, number][][]) => void;
  /** Bolge dolgusu/cizgisi tiklamayi yakalasin mi (varsayilan: evet). Kapaliyken
   *  tiklama altliga gecer - "Ekle" formu acikken kullanici genis bir gorev
   *  bolgesinin uzerine varlik koyabilsin diye kapatilir. */
  bolgeTiklanabilir?: boolean;
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
  onVarlikDuzenle,
  onIhbarDetay,
  onIhbarVarlikYonet,
  onIhbarGeriAl,
  ekipler,
  onEkipGorevSec,
  bolgeler,
  onBolgeDetay,
  seciliBolgeId,
  onBolgeSec,
  onSekilDuzenle,
  onBolgeAdDegis,
  sekilDuzenleme,
  onSekilDegis,
  bolgeTiklanabilir = true,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  /** Acik popup hangi secime ait: varlik / ihbar / bolge. Ayni anda tek popup
   *  gosterilir, ama her secim yalnizca KENDI popup'ini kapatabilir - yoksa
   *  bir bolge secilirken varlik secimi temizlendigi icin (secimUygula) yeni
   *  acilan bolge popup'i aninda kapaniyordu. */
  const popupTuruRef = useRef<"varlik" | "ihbar" | "bolge" | null>(null);
  const hazirRef = useRef(false);
  /** Aktif cizimin alan etiketi (m2/ha) ve tamamlanan alanlarin kalici etiketleri. */
  const cizimEtiketRef = useRef<maplibregl.Marker | null>(null);
  const tamamlananEtiketleriRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  /** Kaydedilmis bolgelerin ad/olcu etiketleri (DOM marker). */
  const bolgeEtiketleriRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  /** Adi o an etiket uzerinde duzenlenen bolgenin id'si: bu kayit icin etiket
   *  metni yeniden yazilmaz, yoksa `bolgeler` prop'unun her tazelenmesi acik
   *  girdiyi silip yazilani kaybettirirdi. */
  const etiketDuzenlenenRef = useRef<string | null>(null);
  /** Sekil duzenlemedeki kose ve kenar-ortasi tutamaklari (DOM marker).
   *  Suruklenebilir olmalari gerektigi icin katman degil marker'dirlar. */
  const sekilTutamaklariRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  /** Suruklerken canli guncellenen taslak geometri: her fare hareketinde React
   *  state'i guncellemek (ve marker'lari yeniden kurmak) yerine burada tutulur;
   *  surukleme bitince tek seferde yukari bildirilir. */
  const sekilTaslakRef = useRef<[number, number][][]>([]);
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
  const bolgelerRef = useRef(bolgeler);
  const onBolgeDetayRef = useRef(onBolgeDetay);
  const seciliBolgeIdRef = useRef(seciliBolgeId);
  const onBolgeSecRef = useRef(onBolgeSec);
  const onSekilDuzenleRef = useRef(onSekilDuzenle);
  const onBolgeAdDegisRef = useRef(onBolgeAdDegis);
  const sekilDuzenlemeRef = useRef(sekilDuzenleme);
  const onSekilDegisRef = useRef(onSekilDegis);
  const bolgeTiklanabilirRef = useRef(bolgeTiklanabilir);
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
  const onVarlikDuzenleRef = useRef(onVarlikDuzenle);
  const onIhbarDetayRef = useRef(onIhbarDetay);
  const onIhbarVarlikYonetRef = useRef(onIhbarVarlikYonet);
  const onIhbarGeriAlRef = useRef(onIhbarGeriAl);
  const onEkipGorevSecRef = useRef(onEkipGorevSec);
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
    bolgelerRef.current = bolgeler;
    onBolgeDetayRef.current = onBolgeDetay;
    seciliBolgeIdRef.current = seciliBolgeId;
    onBolgeSecRef.current = onBolgeSec;
    onSekilDuzenleRef.current = onSekilDuzenle;
    onBolgeAdDegisRef.current = onBolgeAdDegis;
    sekilDuzenlemeRef.current = sekilDuzenleme;
    onSekilDegisRef.current = onSekilDegis;
    bolgeTiklanabilirRef.current = bolgeTiklanabilir;
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
    onVarlikDuzenleRef.current = onVarlikDuzenle;
    onIhbarDetayRef.current = onIhbarDetay;
    onIhbarVarlikYonetRef.current = onIhbarVarlikYonet;
    onIhbarGeriAlRef.current = onIhbarGeriAl;
    onEkipGorevSecRef.current = onEkipGorevSec;
  });

  // Layer-scoped click/hover callback'leri sabit referans olarak tutulur ki
  // stil degisiminde map.off/map.on ile guvenle yeniden baglanabilsin.
  // "assets-circle" ve "assets-icon" (ihbarlarda "reports-pin"/"reports-icon")
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
  /** Haritadaki bir bolgeye/guzergaha tiklaninca popup acar: alanlar ve
   *  cizgiler de tikladiginda detayini gosteren birer isaretci gibi davranir.
   *  Ayni tiklama hem dolgu hem cizgi katmanini tetikleyebildiginden (varlik
   *  isaretcilerindeki gibi) son islenen DOM olayi tutulur. */
  const sonIslenenBolgeOlayiRef = useRef<MouseEvent | null>(null);
  const bolgeTiklandiRef = useRef((e: maplibregl.MapLayerMouseEvent) => {
    if (cizimModuRef.current || olcumModuRef.current) return;
    if (!bolgeTiklanabilirRef.current) return;
    // Sekil duzenlenirken tiklamalar tutamaklara aittir; baska bir bolgeye
    // gecis kazara yapilmasin.
    if (sekilDuzenlemeRef.current) return;
    if (sonIslenenBolgeOlayiRef.current === e.originalEvent) return;
    sonIslenenBolgeOlayiRef.current = e.originalEvent;

    const id = e.features?.[0]?.properties?.id;
    const bolge = (bolgelerRef.current ?? []).find((b) => b.id === id);
    const map = mapRef.current;
    if (!bolge || !map) return;

    // Alan/cizgi de bir isaretci gibi SECILIR: haritada belirgin kenarlikla
    // isaretlenir ve (panel acikken) sol panelde de ayni kayit vurgulanir.
    onBolgeSecRef.current?.(bolge.id);

    popupRef.current?.remove();
    const popup = new maplibregl.Popup({
      offset: 8,
      closeButton: true,
      // Kapatma carpisi varsayilan haliyle cok kucuk kaliyordu; olcusu
      // `index.css`'teki `.bolge-popup` kuralinda biraz buyutuluyor.
      className: "bolge-popup",
    })
      .setLngLat(e.lngLat)
      .setHTML(bolgePopupIcerigi(bolge))
      .addTo(map);
    popupRef.current = popup;
    popupTuruRef.current = "bolge";
    const el = popup.getElement();
    el?.querySelector(".popup-detay-btn")?.addEventListener("click", () => {
      onBolgeDetayRef.current?.(bolge.id);
    });
    el?.querySelector(".popup-sekil-btn")?.addEventListener("click", () => {
      popup.remove();
      onSekilDuzenleRef.current?.(bolge.id);
    });
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
    // Sekil duzenlenirken bos haritaya tiklamak "Ekle" formunu acmasin -
    // kullanici o an bir bolgenin siniriyla ugrasiyor.
    if (sekilDuzenlemeRef.current) return;

    const katmanlar = ["assets-circle"];
    // "reports-halka" bilincli olarak DISARIDA: dekoratif, pinin cevresinde
    // genis bir alan kaplar ve buraya girseydi tiklanabilir olmadigi halde
    // "dolu" sayilip koordinat secimini olu bir halkaya cevirirdi.
    for (const k of [
      "assets-icon",
      "assets-rozet",
      "reports-circle",
      "reports-pin",
      "reports-icon",
      "reports-rozet",
    ]) {
      if (map.getLayer(k)) katmanlar.push(k);
    }
    // Bolge dolgusu/cizgisi de "dolu" sayilir: uzerine tiklamak kendi
    // popup'ini acar, bos harita tiklamasi olarak islenmemeli. Tiklama kapaliyken
    // ("Ekle" formu acikken) bu katmanlar sayilmaz, koordinat secimi calisir.
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
      const metin = alan.etiket ? `${alan.etiket} Â· ${buyukluk}` : buyukluk;
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

  /** Kaydedilmis bolgeleri/guzergahlari haritada gosterir. Anlik alan
   *  secimlerinden ayri bir kaynak/katman kullanir: kesik cizgili kenarlik ve
   *  ad etiketiyle "bu kayitli bir bolge" oldugu bakisla anlasilir. */
  function bolgeleriUygula(map: maplibregl.Map) {
    const source = map.getSource(BOLGE_SOURCE_ID) as
      | maplibregl.GeoJSONSource
      | undefined;
    if (!source) return;

    // Sekli duzenlenen kayit burada cizilmez: kendi (suruklenebilir) kaynaginda
    // gosterilir, yoksa eski hali altta hayalet gibi durur.
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
      // id: tiklama olayinda hangi bolgenin popup'i acilacagini belirler.
      properties: { id: bolge.id, renk: bolge.renk },
    }));

    source.setData({ type: "FeatureCollection", features });
    bolgeEtiketleriUygula(map, liste);
  }

  /** Her kayitli bolgenin adi + olcusu (+ atanan ekip) icin kalici etiket.
   *  Etiketin ad kismi (yetkiliye) YERINDE duzenlenebilir: paneli acmadan,
   *  haritada gordugu yerden adi degistirebilsin. */
  function bolgeEtiketleriUygula(map: maplibregl.Map, liste: Bolge[]) {
    const guncelIdler = new Set<string>();

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
        // Ekip isi kapattiysa etikette de gorunsun - personel haritaya bakip
        // hangi bolgenin bittigini anlayabilsin.
        (bolge.tamamlandi_at ? " · ✓" : "");
      // Cizgide etiket, hattin UZUNLUGUNUN ortasina konur (nokta ortalamasi
      // degil): kavisli/L seklindeki bir guzergahta ortalama cizginin hic
      // gecmedigi bir yere duser ve yakinlastikca etiket hattan koparmis gibi
      // gorunur. Alanda etiket en buyuk halkanin ortasinda kalir.
      const merkez = cizgi
        ? cizgiOrtaNoktasi(bolge.noktalar[0])
        : enBuyukHalkaMerkezi(bolge.noktalar);

      let marker = bolgeEtiketleriRef.current.get(bolge.id);
      if (!marker) {
        marker = new maplibregl.Marker({
          element: bolgeEtiketiElemani(bolge.id),
          // Guzergah etiketi hattin hemen USTUNDE durur, uzerini kapatmaz;
          // alan etiketi (eskiden oldugu gibi) noktasinda ortalanir.
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
      // Kayitli bolge etiketi, anlik secim etiketinden renk seridiyle ayrilir.
      el.style.borderLeft = `3px solid ${bolge.renk}`;
      const adEl = el.querySelector<HTMLElement>("[data-rol=ad]");
      const ekEl = el.querySelector<HTMLElement>("[data-rol=ek]");
      // Ad o an duzenleniyorsa metne dokunulmaz (acik girdinin yaninda duran
      // eski ad, kaydedilene kadar oldugu gibi kalir).
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

  /** Kayitli bolge etiketi: ad / olcu-ekip / kalem dugmesi. Kapsayici bilincli
   *  olarak `pointer-events:none` kalir (etiket haritaya/alana yapilan tiklamayi
   *  yutmasin); yalnizca ad metni ve kalem dugmesi olay alir. Tek tiklama gene
   *  haritaya gecer (alan popup'i acilir), duzenlemeyi CIFT tiklama ya da kalem
   *  acar. */
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
        // Haritanin cift-tik yakinlastirmasi devreye girmesin.
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
      kalem.style.cssText =
        "pointer-events:auto; cursor:pointer; border:0; background:transparent; " +
        "color:#fff; opacity:0.6; padding:0 1px; font-size:11px; line-height:1;";
      kalem.addEventListener("mouseenter", () => (kalem.style.opacity = "1"));
      kalem.addEventListener("mouseleave", () => (kalem.style.opacity = "0.6"));
      // Kalem, altindaki alanin popup'ini acmasin / haritayi kaydirmasin.
      kalem.addEventListener("mousedown", (e) => e.stopPropagation());
      kalem.addEventListener("click", (e) => {
        e.stopPropagation();
        bolgeAdiDuzenle(el, id);
      });
      el.append(kalem);
    }

    return el;
  }

  /** Etiketin ad kismini bir metin girdisiyle degistirir: Enter/odak kaybi
   *  kaydeder, Esc vazgecer. Kaydetmede ad IYIMSER olarak etikete yazilir -
   *  sunucu yaniti (ve `bolgeler` prop'unun tazelenmesi) gecikse de etiket
   *  aninda yeni adi gosterir. */
  function bolgeAdiDuzenle(el: HTMLElement, id: string) {
    const degistir = onBolgeAdDegisRef.current;
    const adEl = el.querySelector<HTMLElement>("[data-rol=ad]");
    const kalemEl = el.querySelector<HTMLElement>("[data-rol=kalem]");
    const bolge = (bolgelerRef.current ?? []).find((b) => b.id === id);
    if (!degistir || !adEl || !bolge) return;
    // Ayni anda tek etiket duzenlenir; acik girdiye tekrar basmak onu bozmasin.
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
      // Enter'dan sonra gelen blur ikinci kez tetiklemesin.
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
          // Kaydedilemedi: iyimser yazi geri alinir ve etiket kisa sure
          // kirmizi yanar - haritada toast/uyari seridi yok, geri bildirim
          // etiketin kendi uzerinde verilir.
          adEl.textContent = bolge.ad;
          adEl.title = `Ad kaydedilemedi: ${hata.message}`;
          const eskiZemin = el.style.background;
          el.style.background = "rgba(153,27,27,0.9)";
          window.setTimeout(() => (el.style.background = eskiZemin), 2000);
        });
      }
    };

    girdi.addEventListener("input", genisligiAyarla);
    // Girdideki tuslar/tiklamalar haritaya (kisayollar, pan) gitmesin.
    girdi.addEventListener("mousedown", (e) => e.stopPropagation());
    girdi.addEventListener("dblclick", (e) => e.stopPropagation());
    girdi.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") kapat(true);
      else if (e.key === "Escape") kapat(false);
    });
    girdi.addEventListener("blur", () => kapat(true));
  }

  /** Taslagin derin kopyasi: yukari bildirilen deger ile ref'teki canli kopya
   *  hicbir zaman ayni diziyi paylasmamali (surukleme sirasinda mutasyon var). */
  function sekilTaslakKopyasi(): [number, number][][] {
    return sekilTaslakRef.current.map((halka) =>
      halka.map((n) => [n[0], n[1]] as [number, number])
    );
  }

  function sekilBildir() {
    onSekilDegisRef.current?.(sekilTaslakKopyasi());
  }

  /** Sekli duzenlenen bolgenin taslak geometrisini haritada gosterir. */
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

  /** Kenar ortasindaki "+" tutamaklarini taslaga gore yeniden konumlandirir -
   *  bir kose suruklenirken komsu kenarlarin ortasi da kaymali. */
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

  /** Sekil duzenleme tutamaklarini kurar: her kosede suruklenebilir bir nokta,
   *  her kenarin ortasinda yeni kose ekleyen bir "+". Tutamaklar katman degil
   *  DOM marker'dir - MapLibre'nin suruklenebilir marker'i hazir olarak
   *  fare/dokunma isini halleder. Sayilari her eklemede/silmede degistigi icin
   *  fark tutmak yerine tamami yeniden kurulur (duzenlenebilir sekiller
   *  SEKIL_MAKS_NOKTA ile sinirli, maliyeti onemsiz). */
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
          // Bir alan en az 3, bir guzergah en az 2 noktayla var olabilir.
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
          // Konum marker'dan okunur: kose suruklendiyse orta nokta tasinmis olur.
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

  /** Acik popup verilen turlerden birine aitse kapatir; degilse dokunmaz. */
  function popupKapat(turler: ("varlik" | "ihbar" | "bolge")[]) {
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

    // Ayni anda tek popup: baska turde bir popup acikken de degistirilir.
    popupRef.current?.remove();
    // anchor sabit: harita kaydirilirken popup bir anda karsi tarafa "atlamasin"
    // (sabit anchor olmadan MapLibre gorunurde tutmak icin anchor'i degistirir).
    const popup = new maplibregl.Popup({
      offset: 14,
      closeButton: false,
      anchor: "bottom",
    })
      .setLngLat(secili.geometry.coordinates)
      .setHTML(popupIcerigi(secili, Boolean(onVarlikDuzenleRef.current)))
      .addTo(map);
    popupRef.current = popup;
    popupTuruRef.current = "varlik";
    konumSatiriDoldur(popup, secili);
    const el = popup.getElement();
    el
      ?.querySelector(".popup-detay-btn")
      ?.addEventListener("click", () => onVarlikDetayRef.current?.(secili.properties.id));
    el
      ?.querySelector(".popup-duzenle-btn")
      ?.addEventListener("click", () => onVarlikDuzenleRef.current?.(secili.properties.id));
  }

  /** Secili bolge/guzergahi haritada belirgin kenarlikla isaretler. Popup'a
   *  DOKUNMAZ: bolge popup'i tiklama aninda acilir, secim efekti onu kapatmamali. */
  function secimBolgeUygula(map: maplibregl.Map) {
    if (!map.getLayer("bolge-secili")) return;
    const id = seciliBolgeIdRef.current;
    map.setFilter("bolge-secili", ["==", ["get", "id"], id ?? ""]);
    if (!id) popupKapat(["bolge"]);
  }

  /** Secili ihbari haritada vurgular ve popup acar (varlik secimiyle ayni
   *  popup'i paylasir; ikisi ayni anda secili olmaz - farkli sekmeler). */
  function secimIhbarUygula(map: maplibregl.Map) {
    if (!map.getLayer("reports-selected")) return;
    const id = seciliIhbarIdRef.current;
    map.setFilter("reports-selected", ["==", ["get", "id"], id ?? ""]);

    const secili = id
      ? reportsRef.current?.features.find((f) => f.properties.id === id)
      : undefined;
    if (!secili) {
      popupKapat(["ihbar"]);
      return;
    }

    popupRef.current?.remove();
    const popup = new maplibregl.Popup({
      // Ihbar PIN olarak ciziliyor: popup pinin ustunde kalsin diye offset
      // pinin yuksekligi kadar (varlik dairelerindeki 14'ten fazla). Pin
      // buyudugu (icon-size 0.95 -> 1.51) ve etrafina durum halkasi geldigi
      // icin 34'ten 50'ye cikti - eskisi kalsaydi balon pinin basina binerdi.
      offset: 50,
      closeButton: false,
      anchor: "bottom",
    })
      .setLngLat(secili.geometry.coordinates)
      // Personel modu: ikinci dugmelerden en az biri baglanmissa popup islem
      // dugmesi cizer (hangisi cizilecegini ihbarin durumu belirler).
      .setHTML(
        ihbarPopupIcerigi(
          secili,
          Boolean(onIhbarVarlikYonetRef.current || onIhbarGeriAlRef.current)
        )
      )
      .addTo(map);
    popupRef.current = popup;
    popupTuruRef.current = "ihbar";
    const el = popup.getElement();
    el
      ?.querySelector(".popup-detay-btn")
      ?.addEventListener("click", () => onIhbarDetayRef.current?.(secili.properties.id));
    el
      ?.querySelector(".popup-varlik-btn")
      ?.addEventListener("click", () =>
        onIhbarVarlikYonetRef.current?.(secili.properties.id)
      );
    el?.querySelector(".popup-geri-al-btn")?.addEventListener("click", () => {
      popup.remove();
      onIhbarGeriAlRef.current?.(secili.properties.id);
    });
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

      // Bakim gereken varliklar icin amber uyari halkasi. Artik durumun TEK
      // gorsel tasiyicisi: dolgu tur rengine birakildigi icin "dikkat" sinyali
      // tamamen buraya (ve zoom >= ROZET_MINZOOM'da "!" rozetine) bindi.
      // Onaylanmis ihbar pininin halkasiyla ayni amber - ikisi de acik is.
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

      // Ana isaretci: dolgu HER ZAMAN tur (grup) rengi, beyaz cerceve.
      // Eskiden "bakim lazim" varliklarda dolgu amber'e cevriliyordu; bu, o
      // varligin kategorisini haritada tamamen siliyordu. Durum artik yukaridaki
      // halkada, kategori ise burada - iki eksen birbirine karismiyor.
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

      // Not: "ihbardan dogmus varlik" icin cizilen ince MOR ic halka
      // ("assets-ihbar-kaynak") KALDIRILDI. Kokeni artik seklin kendisi
      // tasiyor (pin = vatandas ihbari) ve mor tek anlamina - "karar bekliyor"
      // - geri dondu; ayrica ic halka amber uyari halkasiyla birlikte
      // isaretciyi ic ice uc halkaya boguyordu.

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

      // Ihbarin PIN ucundaki yer golgesi. Pinin kendisi bir symbol katmanidir
      // ve goruntuler asenkron yuklendigi icin sonradan eklenir; bu kucuk daire
      // hem pinin "yere basmasini" saglar hem SENKRON var oldugundan tiklama/
      // hover baglantilarinin (ve katman sirasi kontrolunun) sabit dayanagidir.
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
      // Secili kayit: kesik kenarligin uzerine DUZ bir hat cizilir - varlik/ihbar
      // isaretcilerindeki secim halkasinin bolge karsiligi. Kalinlik bilincli
      // olarak normal kenarlikla ayni (2.5): secimi kalinlik degil, kesik
      // cizginin duz hatta donmesi anlatir - kalin hat sekli kabalastiriyordu.
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
      // Gorunmez, kalin vurus alani: 2.5px'lik bir guzergah cizgisini tam
      // uzerinden tutturmak zor - tiklama/imlec bu genis seride yakalanir.
      map.addLayer({
        id: "bolge-vurus",
        type: "line",
        source: BOLGE_SOURCE_ID,
        paint: { "line-color": "#000000", "line-width": 16, "line-opacity": 0 },
      });
    }

    if (!map.getSource(SEKIL_SOURCE_ID)) {
      map.addSource(SEKIL_SOURCE_ID, { type: "geojson", data: BOS_GEOJSON });

      // Duzenlenen sekil, kalici bolgelerden daha belirgin cizilir (duz ve
      // kalin kenarlik): o an "uzerinde calisilan" sekil oldugu bakisla belli.
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

    // Idempotent baglama: once cikar, sonra ekle - stil degisiminde Ã§ift kayit olmasin.
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
    // Kaydedilmis bolgeler/guzergahlar da tiklanabilir (dolgu + kalin vurus
    // seridi); ayni tiklama iki katmani da tetikleyebilir, handler tekrari
    // originalEvent ile eler.
    for (const katman of ["bolge-fill", "bolge-vurus"]) {
      map.off("click", katman, bolgeTiklandiRef.current);
      map.on("click", katman, bolgeTiklandiRef.current);
      map.off("mouseenter", katman, fareGirdiRef.current);
      map.on("mouseenter", katman, fareGirdiRef.current);
      map.off("mouseleave", katman, fareCiktiRef.current);
      map.on("mouseleave", katman, fareCiktiRef.current);
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
    secimIhbarUygula(map);
    secimBolgeUygula(map);
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

        // Bakim gerektiren varligin sag-ust omzundaki amber "!" rozeti -
        // onaylanmis ihbar pininkiyle ayni simge ve ayni renk.
        map.addLayer({
          id: "assets-rozet",
          type: "symbol",
          source: SOURCE_ID,
          minzoom: ROZET_MINZOOM,
          filter: ["==", ["get", "status"], "bakim_lazim"],
          layout: {
            "icon-image": "varlik-rozet-bakim",
            ...VARLIK_ROZET_YERLESIMI,
          },
        });
        map.off("click", "assets-rozet", assetsTiklandiRef.current);
        map.on("click", "assets-rozet", assetsTiklandiRef.current);
        map.off("mouseenter", "assets-rozet", fareGirdiRef.current);
        map.on("mouseenter", "assets-rozet", fareGirdiRef.current);
        map.off("mouseleave", "assets-rozet", fareCiktiRef.current);
        map.on("mouseleave", "assets-rozet", fareCiktiRef.current);
      }

      if (map.getSource(REPORTS_SOURCE_ID) && !map.getLayer("reports-icon")) {
        // Secim pini EN ALTA: normal pinin arkasindan tasarak kontur olur.
        map.addLayer({
          id: "reports-selected",
          type: "symbol",
          source: REPORTS_SOURCE_ID,
          filter: ["==", ["get", "id"], ""],
          layout: { "icon-image": "ihbar-pin-secim", ...PIN_SECIM_YERLESIMI },
        });
        // Durum halkasi pinin ARKASINDA: amber dolu = acik is, mor kesikli =
        // karar bekliyor. Kapanmis gorunumlerde (tamir/red) halka yok, o yuzden
        // katman yalnizca HALKALI_GORUNUMLER'e filtrelenir.
        map.addLayer({
          id: "reports-halka",
          type: "symbol",
          source: REPORTS_SOURCE_ID,
          filter: gorunumFiltresi(HALKALI_GORUNUMLER),
          layout: {
            "icon-image": [
              "concat",
              "ihbar-halka-",
              ["coalesce", ["get", "gorunum"], ["get", "status"]],
            ],
            ...PIN_KATMAN_YERLESIMI,
          },
          paint: { "icon-opacity": IHBAR_OPAKLIK_IFADESI as never },
        });
        // Ihbar pini - dolgusu artik varliklarla AYNI tur (grup) rengi; sekil
        // (damla) kaydin vatandastan geldigini, halka+rozet ise durumunu
        // anlatir. `gorunum` App tarafinda eklenir; yoksa ham duruma dusulur.
        map.addLayer({
          id: "reports-pin",
          type: "symbol",
          source: REPORTS_SOURCE_ID,
          layout: {
            "icon-image": ["concat", "ihbar-pin-", ["get", "type"]],
            ...PIN_KATMAN_YERLESIMI,
          },
          paint: { "icon-opacity": IHBAR_OPAKLIK_IFADESI as never },
        });
        // Tur glifi, pinle ayni viewBox'ta kucultulmus varyantindan (pin-glif-*)
        // basilir; boylece basina tam oturur, icon-offset hesabi gerekmez.
        map.addLayer({
          id: "reports-icon",
          type: "symbol",
          source: REPORTS_SOURCE_ID,
          layout: {
            "icon-image": ["concat", "pin-glif-", ["get", "type"]],
            ...PIN_KATMAN_YERLESIMI,
          },
          paint: { "icon-opacity": IHBAR_OPAKLIK_IFADESI as never },
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
              "ihbar-rozet-",
              ["coalesce", ["get", "gorunum"], ["get", "status"]],
            ],
            ...PIN_KATMAN_YERLESIMI,
          },
          paint: { "icon-opacity": IHBAR_OPAKLIK_IFADESI as never },
        });
        // Halka tiklamaya baglanmaz: dolgusu pinin cevresinde genis bir alan
        // kaplar ve bos haritaya tiklamayi (koordinat secimini) yutardi.
        for (const katman of ["reports-pin", "reports-icon", "reports-rozet"]) {
          map.off("click", katman, reportsTiklandiRef.current);
          map.on("click", katman, reportsTiklandiRef.current);
          map.off("mouseenter", katman, fareGirdiRef.current);
          map.on("mouseenter", katman, fareGirdiRef.current);
          map.off("mouseleave", katman, fareCiktiRef.current);
          map.on("mouseleave", katman, fareCiktiRef.current);
        }
        // Secim katmani artik asenkron eklendigi icin, bu arada yapilmis bir
        // secimin filtresi kaybolmasin diye guncel secim tekrar uygulanir.
        secimIhbarUygula(map);
      }
    });
  }

  // --- Haritayi bir kez kur ---
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // Temizlikte kullanilacak marker koleksiyonlari burada yakalanir: ref.current
    // temizlik calisirken degismis olabilir (lint uyarisi); bu iki ref hicbir
    // zaman yeniden atanmadigi icin yerel degisken birebir aynisini gosterir.
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
      hazirRef.current = false;
    };
    // `kaynaklariHazirla` bilerek bagimlilik degil: her render'da yeniden
    // olusan bir fonksiyon: listeye eklenirse bu effect her render'da yeniden
    // calisir, yani harita yikilip yeniden kurulur (zoom/secim/cizim sifirlanir).
    // Harita bir kez kurulur, sonrasi ref'lerle yonetilir.
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
    // Yalnizca stil kimligi degisince calismali; `kaynaklariHazirla` bagimlilik
    // olsaydi her render'da stil yeniden yuklenirdi (bkz. kurulum effect'i).
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // Cizim yardimcilari her render'da yeniden olusur; bagimlilik yapilirsa
    // katmanlar her render'da yeniden yazilir (bkz. kurulum effect'i).
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
  // Duzenlenen kayit ayrica kalici bolge katmanindan cikarilir (ve duzenleme
  // bitince geri konur), yoksa eski hali altta hayalet gibi durur.
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
        const popup = new maplibregl.Popup({
          // Pin (30px) + ucu (7px) kadar yukaridan acilsin ki isaretciyi
          // ortmesin.
          offset: 42,
          closeButton: true,
          anchor: "bottom",
          // Metin bulanikligina karsi (tam piksel satir yuksekligi + katman
          // promosyonunun kaldirilmasi) - kurallar index.css'te.
          className: "ekip-popup",
        }).setHTML(ekipPopupHtml(e));
        // Is satirlarina tiklama: dinleyici tek tek satirlara DEGIL popup
        // kapsayicisina baglanir (delegasyon) - icerik her veri tazelemesinde
        // setHTML ile yeniden yazildigi icin satirlara baglanan dinleyiciler
        // kaybolurdu. MapLibre popup kapsayicisini her acilista yeniden
        // olusturdugundan, ayni elemana iki kez baglamamak icin isaretlenir.
        popup.on("open", () => {
          const kapsayici = popup.getElement();
          if (!kapsayici || kapsayici.dataset.gorevBagli) return;
          kapsayici.dataset.gorevBagli = "1";
          kapsayici.addEventListener("click", (ev) => {
            const hedef = (ev.target as HTMLElement | null)?.closest<HTMLElement>(
              "[data-gorev-asset]"
            );
            const assetId = hedef?.dataset.gorevAsset;
            if (!assetId) return;
            ev.stopPropagation();
            onEkipGorevSecRef.current?.(assetId);
          });
        });
        const yeni = new maplibregl.Marker({ element: el, anchor: "bottom" })
          .setLngLat([e.longitude, e.latitude])
          .setPopup(popup)
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

  // --- Cizim/olcum modunda imleci artiya cevir, elastik onizlemeyi sifirla ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getCanvas().style.cursor = cizimModu || olcumModu ? "crosshair" : "";
    // Mod KAPANIRKEN de calisir: "Bitir"/"Tamamla" sonrasi imlece uzanan
    // elastik cizgi (ve kapanis onizlemesi) haritada asili kalmasin - o cizgi
    // yalnizca cizim sirasindaki bir yardimcidir, kaydedilen sekle dahil degil.
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

  return <div ref={containerRef} className="greenasset-harita h-full w-full" />;
}
