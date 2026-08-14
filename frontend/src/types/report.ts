import type { AssetStatus, AssetType, PointGeometry } from "./asset";

/** Backend'in bildigi talep durumlari (reports.status). Arayuzdeki siralama
 *  bunlardan degil, asagidaki TALEP_GORUNUMLERI'nden gelir. */
export const REPORT_STATUSES = ["onaylandi", "beklemede", "reddedildi"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

/** Panel alt-sekmeleri ve lejant alt-filtresi bu kumeyi kullanir. "tamir"
 *  backend'de bir durum degildir: onaylanmis talepten olusan varlik 'iyi'ye
 *  cekilince talep bu turemis gruba gecer, yoksa bitmis isler haritada hala
 *  acik is gibi gorunurdu.
 *
 *  Siralama acik is -> kapanmis is; haritadaki giysiyle ortusur (ilk ikisi
 *  durum halkasi tasir, son ikisi sonumlenir). */
export const TALEP_GORUNUMLERI = [
  "onaylandi",
  "beklemede",
  "tamir",
  "reddedildi",
] as const;
export type TalepGorunumu = (typeof TALEP_GORUNUMLERI)[number];

export const REPORT_STATUS_LABELS: Record<TalepGorunumu, string> = {
  beklemede: "Bekleyen Talep",
  onaylandi: "Onaylandı",
  reddedildi: "Reddedildi",
  tamir: "Tamir Edildi",
};

/** Bir talebin hangi gorunume dustugu. Onaylanmislar, olusturduklari varligin
 *  durumuna gore ayrilir; varlik silinmisse (tamir sonrasi otomatik silme) de
 *  bitmis is sayilir. `varlikBilgisiVar=false` iken siniflama yapilmaz, yoksa
 *  acilista her sey bir an "Tamir Edildi"ye dusup geri zipliyor. */
export function talepGorunumu(
  status: ReportStatus,
  varlikDurumu: "iyi" | "bakim_lazim" | undefined,
  varlikBilgisiVar: boolean
): TalepGorunumu {
  if (status !== "onaylandi" || !varlikBilgisiVar) return status;
  return varlikDurumu === "bakim_lazim" ? "onaylandi" : "tamir";
}

/** Gorunume gore durum sinyali rengi. Pinin dolgusu degildir - pin turunun
 *  grup rengini tasir, durum ise halka ve rozetle anlatilir; lejant
 *  swatch'lari da buradan beslenir. */
export const TALEP_DURUM_RENGI: Record<TalepGorunumu, string> = {
  beklemede: "#9333ea",
  onaylandi: "#f59e0b",
  reddedildi: "#e11d48",
  tamir: "#64748b",
};

/** Rozet simgeleri (SVG path adlari). */
export const DURUM_ROZETLERI = ["unlem", "soru", "onay", "carpi"] as const;
export type DurumRozeti = (typeof DURUM_ROZETLERI)[number];

/** Bir gorunumun harita "giysisi": pinin cevresindeki halka + rozet + sonumleme.
 *  Rengi TALEP_DURUM_RENGI verir; burasi yalnizca SEKLI tarif eder. */
export interface TalepGiysisi {
  /** Pinin basini cevreleyen durum halkasi cizilsin mi. */
  halka: boolean;
  /** Halka kesikli mi (karar bekleyen = henuz kesinlesmemis). */
  halkaKesikli: boolean;
  /** Sag-ustteki kucuk rozet; null ise cizilmez. */
  rozet: DurumRozeti | null;
  /** Kapanmis kayitlar sonumlenir, acik islerle gorsel agirlikta yarismasin. */
  opaklik: number;
}

export const TALEP_GIYSISI: Record<TalepGorunumu, TalepGiysisi> = {
  // Acik is: rozet YOK - halka ile "!" ayni seyi iki kez soyleyip pini
  // kalabalıklastiriyordu.
  onaylandi: { halka: true, halkaKesikli: false, rozet: null, opaklik: 1 },
  tamir: { halka: false, halkaKesikli: false, rozet: "onay", opaklik: 0.5 },
  beklemede: { halka: true, halkaKesikli: true, rozet: "soru", opaklik: 1 },
  reddedildi: { halka: false, halkaKesikli: false, rozet: "carpi", opaklik: 0.38 },
};

/** Halka/rozet cizilen gorunumler; katman filtreleri bunlardan turetilir ki
 *  MapLibre var olmayan bir goruntu adi istemesin. */
export const HALKALI_GORUNUMLER = TALEP_GORUNUMLERI.filter(
  (d) => TALEP_GIYSISI[d].halka
);
export const ROZETLI_GORUNUMLER = TALEP_GORUNUMLERI.filter(
  (d) => TALEP_GIYSISI[d].rozet !== null
);

/* --- Talep sekli ---------------------------------------------------------
 * Vatandas YALNIZCA nokta isaretler. Cizgi/alan destegi kaldirildi (backend:
 * migration 0016): isin bir hat ya da bolge boyunca uzandigini personel,
 * onaydan sonra actigi bir guzergah/bolge kaydiyla soyler - vatandas formunda
 * cizim, ogrenilmesi zor ve yanlis cizilmesi kolay bir adimdi. */

export type TalepGeometrisi = PointGeometry;

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
  /** Vatandas talebi kendi listesinden kaldirdi mi (kayit silinmez). */
  reporter_hidden_at: string | null;
  /** Onaydan olusan varligin GUNCEL durumu; varlik silinmisse null. Vatandas
   *  varlik listesini goremedigi icin "Tamir Edildi"yi baska turlu
   *  ogrenemezdi - vatandas ekraninin gorunum hesabi bunu okur. */
  asset_status: AssetStatus | null;
  /** Talebin temsil noktasi [lon, lat]. Harita pini ve mesafe hesabi bunu
   *  okur; onaylanmis talepte olusan varligin (duzeltilmis) konumunu tasir. */
  nokta: [number, number] | null;
  /** Onaydan dogan varlik (varsa) su an aktif bir goreve mi bagli. */
  assigned: boolean;
  /** Yalnizca frontend'de doldurulur (bkz. `talepGorunumu`); backend boyle bir
   *  alan dondurmez. Yoksa `status`a dusulur. */
  gorunum?: TalepGorunumu;
}

export interface ReportFeature {
  type: "Feature";
  geometry: TalepGeometrisi;
  properties: ReportProperties;
}

/** Talebin harita pininin oturacagi nokta. `nokta` alani once okunur cunku
 *  onaylanmis talepte VARLIGIN (personelin duzeltmis olabilecegi) konumunu
 *  tasir; `geometry` vatandasin gonderdigi ham kayit olarak durur. */
export function talepNoktasi(f: ReportFeature): [number, number] | null {
  if (f.properties.nokta) return f.properties.nokta;
  return f.geometry.coordinates as [number, number];
}

export interface ReportFeatureCollection {
  type: "FeatureCollection";
  features: ReportFeature[];
}
