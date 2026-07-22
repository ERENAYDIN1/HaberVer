import type { AssetType, PointGeometry } from "./asset";

export const REPORT_STATUSES = ["beklemede", "onaylandi", "reddedildi"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  beklemede: "Beklemede",
  onaylandi: "Onaylandı",
  reddedildi: "Reddedildi",
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
