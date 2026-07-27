import type { AssetSource, AssetStatus, AssetType, PointGeometry } from "./asset";

/** Bir saha ekibine ayni anda dusebilecek en fazla aktif gorev (backend'deki
 *  MAKS_AKTIF_GOREV ile ayni olmali). */
export const MAKS_AKTIF_GOREV = 3;

/** Bir saha ekibinin (saha_calisani) konum + yuk ozeti (GET /api/saha/ekipler). */
export interface EkipOzet {
  id: string;
  full_name: string | null;
  email: string;
  longitude: number | null;
  latitude: number | null;
  last_seen_at: string | null;
  aktif_gorev: number;
}

/** Bir gorevin (assignment) + uzerindeki varligin ozellikleri. */
export interface GorevProperties {
  assignment_id: string;
  assigned_at: string;
  asset_id: string;
  name: string;
  type: AssetType;
  status: AssetStatus;
  source: AssetSource;
  brand_model: string | null;
  photo_url: string | null;
  install_date: string | null;
}

export interface GorevFeature {
  type: "Feature";
  geometry: PointGeometry;
  properties: GorevProperties;
}

export interface GorevFeatureCollection {
  type: "FeatureCollection";
  features: GorevFeature[];
}
