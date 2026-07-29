export const ASSET_TYPES = ["agac", "direk", "sulama"] as const;
export const ASSET_STATUSES = ["iyi", "bakim_lazim"] as const;
export const ASSET_SOURCES = ["kayitli", "ihbar"] as const;

export type AssetType = (typeof ASSET_TYPES)[number];
export type AssetStatus = (typeof ASSET_STATUSES)[number];
export type AssetSource = (typeof ASSET_SOURCES)[number];

/** Belediyeye dogrudan KAYITLI varlik olarak eklenebilen turler. Su an tum
 *  varlik turleri kayitli olarak eklenebiliyor (bank turu tamamen kaldirildi). */
export const KAYITLI_ASSET_TYPES = ["agac", "direk", "sulama"] as const;

/** Arayuzde gosterilecek Turkce etiketler. */
export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  agac: "Ağaç",
  direk: "Direk",
  sulama: "Sulama",
};

export const ASSET_STATUS_LABELS: Record<AssetStatus, string> = {
  iyi: "İyi",
  bakim_lazim: "Bakım Lazım",
};

/** Tur -> hex renk. Harita isaretcileri (MapView), lejant ve bildirim noktalari
 *  bu tek kaynaktan beslenir - palet daha once bes ayri dosyada kopyalanmisti.
 *  Turun ikon karsiligi icin bkz. components/icons.tsx `TIP_IKONU`. */
export const TIP_RENGI: Record<AssetType, string> = {
  agac: "#059669",
  direk: "#0284c7",
  sulama: "#0891b2",
};

/** Bilinmeyen/eski bir tur icin notr gri (veri beklenmedik bir tur donerse). */
export const TIP_RENGI_VARSAYILAN = "#64748b";

/** Tur -> Tailwind rozet sinifi (liste satirlarindaki kucuk ikon kutusu). */
export const TIP_ROZET_SINIFI: Record<AssetType, string> = {
  agac: "border-emerald-200 bg-emerald-50 text-emerald-700",
  direk: "border-sky-200 bg-sky-50 text-sky-700",
  sulama: "border-cyan-200 bg-cyan-50 text-cyan-700",
};

export const TIP_ROZET_SINIFI_VARSAYILAN =
  "border-slate-200 bg-slate-50 text-slate-500";

/** Ihbar kaynakli bir varligin tamir edildikten kac gun sonra otomatik
 *  silinecegi (backend'deki TAMIR_SAKLAMA_GUN ile ayni olmali). */
export const TAMIR_SAKLAMA_GUN = 5;

/** Durum etiketi - ihbar kaynakli ve durumu "iyi" olan varliklar tanim geregi
 *  tamir edilmis demektir; bu baglamda "İyi" yerine "Tamir Edildi" gosterilir.
 *  Kayitli varliklarda (hic bozulmamis olabilir) normal "İyi" etiketi kalir. */
export function durumEtiketi(status: AssetStatus, source: AssetSource): string {
  if (status === "iyi" && source === "ihbar") return "Tamir Edildi";
  return ASSET_STATUS_LABELS[status];
}

/** Tamir edilmis ihbar varligi icin otomatik silmeye kalan tam gun sayisi
 *  (yukari yuvarlanir; suresi gecmisse 0). repaired_at yoksa null. */
export function kalanSilmeGunu(repairedAt: string | null): number | null {
  if (!repairedAt) return null;
  const silmeZamani =
    new Date(repairedAt).getTime() + TAMIR_SAKLAMA_GUN * 24 * 60 * 60 * 1000;
  const kalanMs = silmeZamani - Date.now();
  if (kalanMs <= 0) return 0;
  return Math.ceil(kalanMs / (24 * 60 * 60 * 1000));
}

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
  /** "Tamir Edildi" isaretlenme zamani (ISO); ihbar kaynakli varliklarda
   *  5 gunluk otomatik silme geri sayimi bundan hesaplanir. */
  repaired_at: string | null;
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
