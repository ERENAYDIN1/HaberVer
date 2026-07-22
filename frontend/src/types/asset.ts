export const ASSET_TYPES = ["agac", "bank", "direk"] as const;
export const ASSET_STATUSES = ["iyi", "bakim_lazim"] as const;
export const ASSET_SOURCES = ["kayitli", "ihbar"] as const;

export type AssetType = (typeof ASSET_TYPES)[number];
export type AssetStatus = (typeof ASSET_STATUSES)[number];
export type AssetSource = (typeof ASSET_SOURCES)[number];

/** Arayuzde gosterilecek Turkce etiketler. */
export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  agac: "Ağaç",
  bank: "Bank",
  direk: "Direk",
};

export const ASSET_STATUS_LABELS: Record<AssetStatus, string> = {
  iyi: "İyi",
  bakim_lazim: "Bakım Lazım",
};

export const ASSET_SOURCE_LABELS: Record<AssetSource, string> = {
  kayitli: "Kayıtlı Varlık",
  ihbar: "İhbar Edilen",
};

/** Backend'in GeoJSON Feature'inda donen properties alani. */
export interface AssetProperties {
  id: string;
  name: string;
  type: AssetType;
  status: AssetStatus;
  source: AssetSource;
  install_date: string | null;
  brand_model: string | null;
  photo_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface PointGeometry {
  type: "Point";
  /** [longitude, latitude] */
  coordinates: [number, number];
}

export interface AssetFeature {
  type: "Feature";
  geometry: PointGeometry;
  properties: AssetProperties;
}

export interface AssetFeatureCollection {
  type: "FeatureCollection";
  features: AssetFeature[];
}

export interface PolygonGeometry {
  type: "Polygon";
  coordinates: [number, number][][];
}

/** Birden fazla ayri parcali alanlar icin (orn. Bogaz'la ikiye bolunmus il
 *  siniri, ya da tamamen adalardan olusan bir ilce). */
export interface MultiPolygonGeometry {
  type: "MultiPolygon";
  coordinates: [number, number][][][];
}

/** POST /api/assets govdesi. */
export interface AssetCreateInput {
  name: string;
  type: AssetType;
  status: AssetStatus;
  longitude: number;
  latitude: number;
  install_date?: string | null;
  brand_model?: string | null;
  photo_url?: string | null;
}

/** PUT /api/assets/{id} govdesi - tum alanlar opsiyonel. */
export type AssetUpdateInput = Partial<AssetCreateInput>;

/** GET /api/assets sorgu filtreleri. */
export interface AssetFilters {
  type?: AssetType;
  status?: AssetStatus;
  source?: AssetSource;
}

/** POST /api/assets/within govdesi. */
export interface WithinQuery {
  polygon: PolygonGeometry | MultiPolygonGeometry;
  type?: AssetType;
  status?: AssetStatus;
  source?: AssetSource;
}
