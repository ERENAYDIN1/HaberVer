import type { AssetType, PointGeometry } from "./asset";

/** Backend'in bildigi ihbar durumlari (reports.status). Arayuzdeki sekme/filtre
 *  siralamasi bunlardan DEGIL, asagidaki IHBAR_GORUNUMLERI'nden gelir. */
export const REPORT_STATUSES = ["onaylandi", "beklemede", "reddedildi"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

/** Sol paneldeki alt-sekmeler ve sag-ustteki lejant alt-filtresi bu kumeyi
 *  kullanir. "tamir" backend'de bir ihbar durumu DEGILDIR: onaylanmis bir
 *  ihbardan olusan varlik 'iyi'ye cekilince (tamir edildi) o ihbar bu turemis
 *  gruba gecer. Ayrim sart oldu cunku bitmis isler "Onaylandı"nin icinde
 *  kaldigi surece haritada hala acik is gibi gorunuyordu.
 *
 *  Siralama ACIK IS -> KAPANMIS IS: once uzerinde islem yapilacak olanlar
 *  (Onaylandı = ekip gidecek, Bekleyen = karar verilecek), sonra sonuclanmis
 *  olanlar (Tamir Edildi, Reddedildi). Bu ayrim haritadaki giysiyle birebir
 *  ortusur - ilk ikisi durum halkasi tasir, son ikisi sonumlenir
 *  (bkz. IHBAR_GIYSISI / HALKALI_GORUNUMLER). */
export const IHBAR_GORUNUMLERI = [
  "onaylandi",
  "beklemede",
  "tamir",
  "reddedildi",
] as const;
export type IhbarGorunumu = (typeof IHBAR_GORUNUMLERI)[number];

export const REPORT_STATUS_LABELS: Record<IhbarGorunumu, string> = {
  beklemede: "Bekleyen İhbar",
  onaylandi: "Onaylandı",
  reddedildi: "Reddedildi",
  tamir: "Tamir Edildi",
};

/** Bir ihbarin hangi GORUNUME dustugu: onaylanmislar, olusturduklari varligin
 *  durumuna gore ikiye ayrilir. `varlikDurumu` undefined ise varlik artik yok
 *  (tamir edilenler TAMIR_SAKLAMA_GUN sonra otomatik siliniyor) - o da bitmis
 *  is sayilir. `varlikBilgisiVar=false` (varlik sorgusu henuz yuklenmedi) ise
 *  siniflama yapilmaz, kayit "onaylandi"da kalir; yoksa acilista her sey bir an
 *  "Tamir Edildi"ye dusup geri zipliyordu. */
export function ihbarGorunumu(
  status: ReportStatus,
  varlikDurumu: "iyi" | "bakim_lazim" | undefined,
  varlikBilgisiVar: boolean
): IhbarGorunumu {
  if (status !== "onaylandi" || !varlikBilgisiVar) return status;
  return varlikDurumu === "bakim_lazim" ? "onaylandi" : "tamir";
}

/** Ihbar gorunumu -> DURUM SINYALI rengi. Bu renk artik pinin DOLGUSU degildir:
 *  pin (varlik dairesi gibi) turunun grup rengini tasir, durum ise pinin
 *  cevresindeki halka ve sag-ustteki rozetle anlatilir. Buradaki renk iste o
 *  halkanin/rozetin rengidir; lejant swatch'lari da ayni kaynaktan beslenir.
 *
 *  Neden degisti: eskiden dolgu duruma gore boyaniyordu ve palet varliklarin
 *  KATEGORI paletiyle (GRUP_RENGI) uc tonda cakisiyordu - zumrut hem "Yeşil
 *  Alan" hem "Onaylandı", slate hem "Diğer" hem "Tamir Edildi", mor hem
 *  "ihbardan dogdu" hem "bekleyen" demekti. Artik renk YALNIZCA kategoriyi,
 *  halka+rozet YALNIZCA durumu anlatir.
 *
 *  `onaylandi` bilincli olarak amber: bakim gerektiren bir varlikla onaylanmis
 *  bir ihbar ayni seydir (ekibin gitmesi gereken acik is), dolayisiyla ayni
 *  uyari rengini paylasirlar. Aralarindaki fark sekil - daire envanterin kendi
 *  kaydi, pin vatandastan geldi. */
export const IHBAR_DURUM_RENGI: Record<IhbarGorunumu, string> = {
  beklemede: "#9333ea",
  // Bakim lazim varlikla ayni amber: ikisi de ACIK IS (bkz. MapView
  // "assets-durum" uyari halkasi).
  onaylandi: "#f59e0b",
  reddedildi: "#e11d48",
  // Tamir edilen (kapanmis) is: bilincli olarak notr gri - haritada "artik is
  // yok" demek.
  tamir: "#64748b",
};

/** Rozet simgeleri. Text degil PATH cizilir: rozet ~17px capinda bir diskte
 *  basiliyor ve data-URI ile raster'a cevrilen bir SVG'de `<text>` tarayicinin
 *  font secimine kalirdi. */
export const DURUM_ROZETLERI = ["unlem", "soru", "onay", "carpi"] as const;
export type DurumRozeti = (typeof DURUM_ROZETLERI)[number];

/** Bir gorunumun harita "giysisi": pinin cevresindeki halka + rozet + sonumleme.
 *  Rengi IHBAR_DURUM_RENGI verir; burasi yalnizca SEKLI tarif eder. */
export interface IhbarGiysisi {
  /** Pinin basini cevreleyen durum halkasi cizilsin mi. */
  halka: boolean;
  /** Halka kesikli mi (karar bekleyen = henuz kesinlesmemis). */
  halkaKesikli: boolean;
  /** Sag-ustteki kucuk rozet; null ise rozet cizilmez. */
  rozet: DurumRozeti | null;
  /** Kapanmis kayitlar sonumlenir - haritada dururlar ama gorsel agirliklari
   *  acik islerle yarismaz. */
  opaklik: number;
}

export const IHBAR_GIYSISI: Record<IhbarGorunumu, IhbarGiysisi> = {
  // Acik is: dolu amber halka + "!" - bakim lazim varlikla ayni giysi.
  onaylandi: { halka: true, halkaKesikli: false, rozet: "unlem", opaklik: 1 },
  // Kapanmis is: halka yok, sonuk, kucuk bir onay isareti.
  tamir: { halka: false, halkaKesikli: false, rozet: "onay", opaklik: 0.5 },
  // Karar bekliyor: KESIKLI mor halka - "henuz kesinlesmedi" demek.
  beklemede: { halka: true, halkaKesikli: true, rozet: "soru", opaklik: 1 },
  // Reddedildi: en sonuk; haritadan silinmez ama neredeyse arka plana duser.
  reddedildi: { halka: false, halkaKesikli: false, rozet: "carpi", opaklik: 0.38 },
};

/** Halka/rozet cizilen gorunumler - katman filtreleri bunlardan turetilir ki
 *  MapLibre var olmayan bir goruntu adi ("ihbar-halka-tamir") istemesin. */
export const HALKALI_GORUNUMLER = IHBAR_GORUNUMLERI.filter(
  (d) => IHBAR_GIYSISI[d].halka
);
export const ROZETLI_GORUNUMLER = IHBAR_GORUNUMLERI.filter(
  (d) => IHBAR_GIYSISI[d].rozet !== null
);

export interface ReportProperties {
  id: string;
  reporter_id: string;
  name: string;
  type: AssetType;
  note: string | null;
  photo_url: string | null;
  status: ReportStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_asset_id: string | null;
  created_at: string;
  /** YALNIZCA frontend'de doldurulur (App.tsx, ihbarGorunumu ile) - backend
   *  boyle bir alan dondurmez. Harita pin rengi ve panel/lejant gruplamasi
   *  bunu okur; yoksa `status`a duser. */
  gorunum?: IhbarGorunumu;
}

export interface ReportFeature {
  type: "Feature";
  geometry: PointGeometry;
  properties: ReportProperties;
}

export interface ReportFeatureCollection {
  type: "FeatureCollection";
  features: ReportFeature[];
}
