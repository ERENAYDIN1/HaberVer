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
 *  olanlar (Tamir Edildi, Reddedildi). */
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

/** Ihbar gorunumu -> hex renk. Haritadaki ihbar PIN'leri (MapView, gorunum
 *  basina bir hazir goruntu uretir) ve sag-ustteki lejant swatch'lari bu TEK
 *  kaynaktan beslenir - daha once ayni palet App.tsx ve MapView.tsx'te iki
 *  kopyaydi.
 *
 *  Not: bu renkler yalnizca IHBAR kayitlarinin durumunu anlatir. Varlik
 *  isaretcileri daire, ihbarlar pin cizildigi icin ayni yesil tonu iki yerde
 *  gorunse bile sinif karismaz (bkz. MapView "Isaretci gorsel dili"). */
export const IHBAR_DURUM_RENGI: Record<IhbarGorunumu, string> = {
  beklemede: "#9333ea",
  onaylandi: "#059669",
  reddedildi: "#e11d48",
  // Tamir edilen (kapanmis) is: bilincli olarak notr gri - haritada "artik is
  // yok" demek.
  tamir: "#64748b",
};

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
