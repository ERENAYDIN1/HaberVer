import type { AssetType, PointGeometry } from "./asset";

export const REPORT_STATUSES = ["beklemede", "onaylandi", "reddedildi"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  beklemede: "Bekleyen İhbar",
  onaylandi: "Onaylandı",
  reddedildi: "Reddedildi",
};

/** Ihbar durumu -> hex renk. Haritadaki ihbar PIN'leri (MapView, durum basina
 *  bir hazir goruntu uretir) ve sag-ustteki lejant swatch'lari bu TEK kaynaktan
 *  beslenir - daha once ayni palet App.tsx ve MapView.tsx'te iki kopyaydi.
 *
 *  Not: bu renkler yalnizca IHBAR kayitlarinin durumunu anlatir. Varlik
 *  isaretcileri daire, ihbarlar pin cizildigi icin ayni yesil tonu iki yerde
 *  gorunse bile sinif karismaz (bkz. MapView "Isaretci gorsel dili"). */
export const IHBAR_DURUM_RENGI: Record<ReportStatus, string> = {
  beklemede: "#9333ea",
  onaylandi: "#059669",
  reddedildi: "#e11d48",
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
