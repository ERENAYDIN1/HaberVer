/** Tum turler; backend'in `asset_type` enum'uyla birebir (`reports.type` de
 *  ayni enum'u paylasir). Sira tur grubuna goredir: acilir listeler ve lejant
 *  bu siradan beslendigi icin ayrica siralanmalari gerekmez. */
export const ASSET_TYPES = [
  // Yeşil alan ve park
  "agac",
  "sulama",
  "oyun_grubu",
  "bank",
  "cop_kutusu",
  // Aydınlatma ve elektrik
  "direk",
  "elektrik_panosu",
  // Yol ve kaldırım
  "yol",
  "kaldirim",
  "rogar",
  "trafik_levhasi",
  // Altyapı / su
  "su_hatti",
  // Diğer
  "diger",
] as const;
export const ASSET_STATUSES = ["iyi", "bakim_lazim"] as const;
export const ASSET_SOURCES = ["kayitli", "ihbar"] as const;

export type AssetType = (typeof ASSET_TYPES)[number];
export type AssetStatus = (typeof ASSET_STATUSES)[number];
export type AssetSource = (typeof ASSET_SOURCES)[number];

/** Envantere elle eklenebilen turler: `diger` haric hepsi. "Diğer" yalnizca
 *  bir talep kategorisidir, envantere boyle bir kayit acilmaz. */
export const KAYITLI_ASSET_TYPES = ASSET_TYPES.filter(
  (t) => t !== "diger"
) as readonly Exclude<AssetType, "diger">[];

/** Arayuzde gosterilecek Turkce etiketler. */
export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  agac: "Ağaç",
  sulama: "Sulama",
  oyun_grubu: "Oyun Grubu",
  bank: "Bank",
  cop_kutusu: "Çöp Kutusu",
  direk: "Aydınlatma Direği",
  elektrik_panosu: "Elektrik Panosu",
  yol: "Yol / Asfalt",
  kaldirim: "Kaldırım",
  rogar: "Rögar Kapağı",
  trafik_levhasi: "Trafik Levhası",
  su_hatti: "Su Hattı",
  diger: "Diğer",
};

export const ASSET_STATUS_LABELS: Record<AssetStatus, string> = {
  iyi: "İyi",
  bakim_lazim: "Bakım Lazım",
};

/* Tur gruplari: 13 tur icin 13 ayirt edilebilir renk olmadigindan renk grubu,
 * glif turu anlatir. Yalnizca bir arayuz kavramidir; backend'de `asset_type`
 * duz bir enum'dur. */

export const TIP_GRUPLARI = [
  "yesil",
  "aydinlatma",
  "yol",
  "altyapi",
  "diger",
] as const;
export type TipGrubu = (typeof TIP_GRUPLARI)[number];

export const TIP_GRUP_ETIKETLERI: Record<TipGrubu, string> = {
  yesil: "Yeşil Alan ve Park",
  aydinlatma: "Aydınlatma ve Elektrik",
  yol: "Yol ve Kaldırım",
  altyapi: "Altyapı / Su",
  diger: "Diğer",
};

/** Dar yerler icin kisa grup adi (grafik ekseni, rozetler). */
export const TIP_GRUP_KISA: Record<TipGrubu, string> = {
  yesil: "Yeşil/Park",
  aydinlatma: "Aydınlatma",
  yol: "Yol",
  altyapi: "Altyapı",
  diger: "Diğer",
};

export const TIP_GRUBU: Record<AssetType, TipGrubu> = {
  agac: "yesil",
  sulama: "yesil",
  oyun_grubu: "yesil",
  bank: "yesil",
  cop_kutusu: "yesil",
  direk: "aydinlatma",
  elektrik_panosu: "aydinlatma",
  yol: "yol",
  kaldirim: "yol",
  rogar: "yol",
  trafik_levhasi: "yol",
  su_hatti: "altyapi",
  diger: "diger",
};

/** Grup -> hex renk; harita, lejant ve bildirimler bu tek kaynaktan beslenir. */
export const GRUP_RENGI: Record<TipGrubu, string> = {
  yesil: "#059669",
  aydinlatma: "#0284c7",
  yol: "#f97316",
  altyapi: "#0891b2",
  diger: "#64748b",
};

/** Grup -> Tailwind rozet sinifi; JIT sablon dizgilerini taramadigi icin
 *  siniflar acik yazilir. */
export const GRUP_ROZET_SINIFI: Record<TipGrubu, string> = {
  yesil: "border-emerald-200 bg-emerald-50 text-emerald-700",
  aydinlatma: "border-sky-200 bg-sky-50 text-sky-700",
  yol: "border-orange-200 bg-orange-50 text-orange-700",
  altyapi: "border-cyan-200 bg-cyan-50 text-cyan-700",
  diger: "border-slate-200 bg-slate-50 text-slate-600",
};

/** Bir grubun altindaki turler (acilir listelerde <optgroup>, lejantta baslik). */
export const GRUP_TURLERI: Record<TipGrubu, AssetType[]> = TIP_GRUPLARI.reduce(
  (acc, grup) => {
    acc[grup] = ASSET_TYPES.filter((t) => TIP_GRUBU[t] === grup);
    return acc;
  },
  {} as Record<TipGrubu, AssetType[]>
);

/** Tur -> hex renk, grubundan turetilir. Ikon karsiligi: icons.tsx TIP_IKONU. */
export const TIP_RENGI = Object.fromEntries(
  ASSET_TYPES.map((t) => [t, GRUP_RENGI[TIP_GRUBU[t]]])
) as Record<AssetType, string>;

/** Bilinmeyen/eski bir tur icin notr gri (veri beklenmedik bir tur donerse). */
export const TIP_RENGI_VARSAYILAN = "#64748b";

/** Tur -> Tailwind rozet sinifi (liste satirlarindaki kucuk ikon kutusu). */
export const TIP_ROZET_SINIFI = Object.fromEntries(
  ASSET_TYPES.map((t) => [t, GRUP_ROZET_SINIFI[TIP_GRUBU[t]]])
) as Record<AssetType, string>;

export const TIP_ROZET_SINIFI_VARSAYILAN =
  "border-slate-200 bg-slate-50 text-slate-500";

/** Talep kaynakli bir varligin tamir edildikten kac gun sonra otomatik
 *  silinecegi (backend'deki TAMIR_SAKLAMA_GUN ile ayni olmali). */
export const TAMIR_SAKLAMA_GUN = 5;

/** Durum etiketi. Talep kaynakli ve "iyi" durumdaki varlik tanim geregi tamir
 *  edilmistir; kayitli varlikta normal "İyi" etiketi kalir. */
export function durumEtiketi(status: AssetStatus, source: AssetSource): string {
  if (status === "iyi" && source === "ihbar") return "Tamir Edildi";
  return ASSET_STATUS_LABELS[status];
}

/** Otomatik silmeye kalan tam gun (yukari yuvarlanir, suresi gecmisse 0). */
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
  ihbar: "Talep Edilen",
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
  /** "Tamir Edildi" zamani; otomatik silme geri sayimi bundan hesaplanir. */
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

/** Cok parcali alanlar icin (orn. tamamen adalardan olusan bir ilce). */
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
