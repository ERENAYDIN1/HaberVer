import type { AssetSource, AssetStatus, AssetType, PointGeometry } from "./asset";

/** Bir saha ekibine ayni anda dusebilecek en fazla aktif gorev (backend'deki
 *  MAKS_AKTIF_GOREV ile ayni olmali). */
export const MAKS_AKTIF_GOREV = 3;

/** Otomatik atamada bir ekibe olan azami mesafe (km, backend'deki
 *  MAKS_ATAMA_MESAFE_M ile ayni olmali). Yalnizca metin gostermek icin. */
export const MAKS_ATAMA_MESAFE_KM = 5;

/** Bir varligin o an atali oldugu ekip bilgisi (GET /api/saha/gorev/{asset_id});
 *  varlik havuzda bekliyorsa null doner. */
export interface AktifGorevBilgi {
  worker_id: string;
  worker_ad: string;
  assigned_at: string;
  /** true: sistemin otomatik atadigi, false: bir personelin elle atadigi. */
  otomatik: boolean;
}

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

/** Personel yonetim panosunda bir ekibin altindaki tek gorev + varlik ozeti
 *  (GET /api/saha/ekip-gorevleri icindeki her eleman). */
export interface GorevOzet {
  assignment_id: string;
  asset_id: string;
  name: string;
  type: AssetType;
  status: AssetStatus;
  source: AssetSource;
  /** true: otomatik atandi, false: bir personel elle atadi. */
  otomatik: boolean;
  assigned_at: string;
  longitude: number;
  latitude: number;
}

/** Bir ekip + kendine dusen aktif gorevler (GET /api/saha/ekip-gorevleri). */
export interface EkipGorevleri extends EkipOzet {
  gorevler: GorevOzet[];
}

/** Havuzda bekleyen (henuz atanmamis) bakim varligi (GET /api/saha/havuz). */
export interface HavuzVarlik {
  asset_id: string;
  name: string;
  type: AssetType;
  source: AssetSource;
  longitude: number;
  latitude: number;
  created_at: string;
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
