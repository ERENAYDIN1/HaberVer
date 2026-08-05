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
export const HALKALI_GORUNUMLER = TALEP_GORUNUMLERI.filter(
  (d) => TALEP_GIYSISI[d].halka
);
export const ROZETLI_GORUNUMLER = TALEP_GORUNUMLERI.filter(
  (d) => TALEP_GIYSISI[d].rozet !== null
);

/* --- Talep sekli ---------------------------------------------------------
 *
 * Vatandas artik yalnizca bir nokta isaretlemiyor: bir yol catlagi CIZGI, bir
 * cukur alani POLIGON olarak bildirilebilir. Bir yol catlagi nokta degildir ve
 * tek noktaya sikistirilinca sahadaki isin buyuklugu kayboluyordu.
 *
 * Onaydan olusan VARLIK yine noktadir (talebin temsil noktasi): envanter,
 * atama mesafesi ve harita isaretcisi tek nokta uzerinden calisir. Ham sekil
 * talep kaydinda bir belge olarak durur. */

export const TALEP_SEKILLERI = ["Point", "LineString", "Polygon"] as const;
export type TalepSekilTipi = (typeof TALEP_SEKILLERI)[number];

export const TALEP_SEKIL_ETIKETLERI: Record<TalepSekilTipi, string> = {
  Point: "Nokta",
  LineString: "Çizgi",
  Polygon: "Alan",
};

/** Vatandas formundaki sade dil: teknik ad degil, ne ise yaradigi. */
export const TALEP_SEKIL_ACIKLAMASI: Record<TalepSekilTipi, string> = {
  Point: "Tek bir yer",
  LineString: "Bir hat boyunca",
  Polygon: "Bir bölge içinde",
};

export interface LineStringGeometry {
  type: "LineString";
  coordinates: [number, number][];
}

export interface TalepPolygonGeometry {
  type: "Polygon";
  /** Tek dis halka; ic halka ("delik") vatandas formunda desteklenmez. */
  coordinates: [number, number][][];
}

export type TalepGeometrisi =
  | PointGeometry
  | LineStringGeometry
  | TalepPolygonGeometry;

/** Elle cizim icin nokta siniri; backend'deki MAKS_TALEP_NOKTASI ile ayni. */
export const MAKS_TALEP_NOKTASI = 500;

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
  /** Seklin temsil noktasi [lon, lat]; cizgi/alan taleplerde harita pini ve
   *  mesafe hesabi bunu kullanir. */
  nokta: [number, number] | null;
  /** Yalnizca frontend'de doldurulur (bkz. `talepGorunumu`); backend boyle bir
   *  alan dondurmez. Yoksa `status`a dusulur. */
  gorunum?: TalepGorunumu;
}

export interface ReportFeature {
  type: "Feature";
  geometry: TalepGeometrisi;
  properties: ReportProperties;
}

/** Talebin harita pininin oturacagi nokta. Temsil noktasi backend'den gelir;
 *  gelmiyorsa (eski onbellek) nokta geometriden dusulur. */
export function talepNoktasi(f: ReportFeature): [number, number] | null {
  if (f.properties.nokta) return f.properties.nokta;
  return f.geometry.type === "Point"
    ? (f.geometry.coordinates as [number, number])
    : null;
}

/** Sekil cizgi/alan mi (haritada ayrica cizilmesi gerekir)? */
export function sekilliTalep(f: ReportFeature): boolean {
  return f.geometry.type !== "Point";
}

export interface ReportFeatureCollection {
  type: "FeatureCollection";
  features: ReportFeature[];
}
