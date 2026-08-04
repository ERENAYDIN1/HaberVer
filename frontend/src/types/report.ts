import type { AssetType, PointGeometry } from "./asset";

/** Backend'in bildigi ihbar durumlari (reports.status). Arayuzdeki siralama
 *  bunlardan degil, asagidaki IHBAR_GORUNUMLERI'nden gelir. */
export const REPORT_STATUSES = ["onaylandi", "beklemede", "reddedildi"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

/** Panel alt-sekmeleri ve lejant alt-filtresi bu kumeyi kullanir. "tamir"
 *  backend'de bir durum degildir: onaylanmis ihbardan olusan varlik 'iyi'ye
 *  cekilince ihbar bu turemis gruba gecer, yoksa bitmis isler haritada hala
 *  acik is gibi gorunurdu.
 *
 *  Siralama acik is -> kapanmis is; haritadaki giysiyle ortusur (ilk ikisi
 *  durum halkasi tasir, son ikisi sonumlenir). */
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

/** Bir ihbarin hangi gorunume dustugu. Onaylanmislar, olusturduklari varligin
 *  durumuna gore ayrilir; varlik silinmisse (tamir sonrasi otomatik silme) de
 *  bitmis is sayilir. `varlikBilgisiVar=false` iken siniflama yapilmaz, yoksa
 *  acilista her sey bir an "Tamir Edildi"ye dusup geri zipliyor. */
export function ihbarGorunumu(
  status: ReportStatus,
  varlikDurumu: "iyi" | "bakim_lazim" | undefined,
  varlikBilgisiVar: boolean
): IhbarGorunumu {
  if (status !== "onaylandi" || !varlikBilgisiVar) return status;
  return varlikDurumu === "bakim_lazim" ? "onaylandi" : "tamir";
}

/** Gorunume gore durum sinyali rengi. Pinin dolgusu degildir - pin turunun
 *  grup rengini tasir, durum ise halka ve rozetle anlatilir; lejant
 *  swatch'lari da buradan beslenir. */
export const IHBAR_DURUM_RENGI: Record<IhbarGorunumu, string> = {
  beklemede: "#9333ea",
  // Bakim lazim varlikla ayni amber: ikisi de acik is.
  onaylandi: "#f59e0b",
  reddedildi: "#e11d48",
  // Kapanmis is icin notr gri: "artik is yok".
  tamir: "#64748b",
};

/** Rozet simgeleri (SVG path adlari). */
export const DURUM_ROZETLERI = ["unlem", "soru", "onay", "carpi"] as const;
export type DurumRozeti = (typeof DURUM_ROZETLERI)[number];

/** Bir gorunumun harita "giysisi": pinin cevresindeki halka + rozet + sonumleme.
 *  Rengi IHBAR_DURUM_RENGI verir; burasi yalnizca SEKLI tarif eder. */
export interface IhbarGiysisi {
  /** Pinin basini cevreleyen durum halkasi cizilsin mi. */
  halka: boolean;
  /** Halka kesikli mi (karar bekleyen = henuz kesinlesmemis). */
  halkaKesikli: boolean;
  /** Sag-ustteki kucuk rozet; null ise cizilmez. */
  rozet: DurumRozeti | null;
  /** Kapanmis kayitlar sonumlenir, acik islerle gorsel agirlikta yarismasin. */
  opaklik: number;
}

export const IHBAR_GIYSISI: Record<IhbarGorunumu, IhbarGiysisi> = {
  // Acik is: dolu amber halka + "!", bakim lazim varlikla ayni giysi.
  onaylandi: { halka: true, halkaKesikli: false, rozet: "unlem", opaklik: 1 },
  // Kapanmis is: halkasiz, sonuk, kucuk onay isareti.
  tamir: { halka: false, halkaKesikli: false, rozet: "onay", opaklik: 0.5 },
  // Karar bekliyor: kesikli mor halka.
  beklemede: { halka: true, halkaKesikli: true, rozet: "soru", opaklik: 1 },
  // Reddedildi: en sonuk, neredeyse arka planda.
  reddedildi: { halka: false, halkaKesikli: false, rozet: "carpi", opaklik: 0.38 },
};

/** Halka/rozet cizilen gorunumler; katman filtreleri bunlardan turetilir ki
 *  MapLibre var olmayan bir goruntu adi istemesin. */
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
  /** Yalnizca frontend'de doldurulur (bkz. `ihbarGorunumu`); backend boyle bir
   *  alan dondurmez. Yoksa `status`a dusulur. */
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
