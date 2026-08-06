/** Tur KODU. Tur sozlugu artik derleme zamani sabiti degil backend verisidir
 *  (`turler` tablosu, bkz. data/turSozlugu.ts): admin arayuzden tur ekleyip
 *  cikarabilsin diye. Bu yuzden burada bir birlesim tipi degil duz `string`
 *  var - gecerlilik veritabanindaki FK ile korunur. Ad/renk/glif icin
 *  `turSozlugu.ts`'teki `turAdi`/`turRengi`/`turGlifi` kullanilir. */
export type AssetType = string;

export const ASSET_STATUSES = ["iyi", "bakim_lazim"] as const;
export const ASSET_SOURCES = ["kayitli", "ihbar"] as const;

export type AssetStatus = (typeof ASSET_STATUSES)[number];
export type AssetSource = (typeof ASSET_SOURCES)[number];

export const ASSET_STATUS_LABELS: Record<AssetStatus, string> = {
  iyi: "İyi",
  bakim_lazim: "Bakım Lazım",
};

/* Tur gruplari: onlarca tur icin onlarca ayirt edilebilir renk olmadigindan
 * renk grubu, glif turu anlatir. Gruplarin KENDISI burada sabittir (renk
 * paleti kodda yasar); bir turun hangi gruba dustugu ise sozluk verisidir ve
 * admin ekranindan degistirilebilir. */

export const TIP_GRUPLARI = [
  "yesil",
  "temizlik",
  "aydinlatma",
  "yol",
  "ulasim",
  "altyapi",
  "diger",
] as const;
export type TipGrubu = (typeof TIP_GRUPLARI)[number];

export const TIP_GRUP_ETIKETLERI: Record<TipGrubu, string> = {
  yesil: "Yeşil Alan ve Park",
  temizlik: "Temizlik ve Çöp",
  aydinlatma: "Aydınlatma ve Elektrik",
  yol: "Yol ve Kaldırım",
  ulasim: "Ulaşım ve Trafik",
  altyapi: "Altyapı / Su",
  diger: "Diğer",
};

/** Dar yerler icin kisa grup adi (grafik ekseni, rozetler). */
export const TIP_GRUP_KISA: Record<TipGrubu, string> = {
  yesil: "Yeşil/Park",
  temizlik: "Temizlik",
  aydinlatma: "Aydınlatma",
  yol: "Yol",
  ulasim: "Ulaşım",
  altyapi: "Altyapı",
  diger: "Diğer",
};

/** Grup -> hex renk; harita, lejant ve bildirimler bu tek kaynaktan beslenir.
 *
 *  Tonlar birbirinden AYIRT EDILEBILIR olmak zorunda: `aydinlatma` eskiden
 *  gok mavisiydi (#0284c7) ve `altyapi`nin camgobegine 8 derece hue
 *  uzakliktaydi - bir aydinlatma diregi ile su hatti isaretcisi haritada ayni
 *  maviye dusuyordu. Su icin dogal renk camgobegi oldugundan tasinan taraf
 *  aydinlatma oldu (indigo).
 *
 *  `ulasim` ve `temizlik` gruplari ANLAM tarafindan dogdu: turleri baska bir
 *  mudurlugun renginde ciziliyordu (trafik levhasi Fen Isleri'nin turuncusuyla,
 *  cop kutusu Park ve Bahceler'in zumrut yesiliyle). Grup renkleri artik ait
 *  olduklari mudurlugun rozet rengiyle birebir ayni; lejantta baslik ile satir
 *  swatch'i tek bir sey soyler. Iki sistem yine de AYRIDIR (bkz. types/
 *  departman.ts): mudurluk veridir, palet kodda yasar - yeni acilan bir
 *  mudurlugun turleri mevcut bir gruptan renk alir, frontend derlemesi
 *  beklemez. */
export const GRUP_RENGI: Record<TipGrubu, string> = {
  yesil: "#059669",
  temizlik: "#4d7c0f",
  aydinlatma: "#4338ca",
  yol: "#f97316",
  ulasim: "#be185d",
  altyapi: "#0891b2",
  diger: "#64748b",
};

/** Grup -> Tailwind rozet sinifi; JIT sablon dizgilerini taramadigi icin
 *  siniflar acik yazilir. */
export const GRUP_ROZET_SINIFI: Record<TipGrubu, string> = {
  yesil: "border-emerald-200 bg-emerald-50 text-emerald-700",
  temizlik: "border-lime-200 bg-lime-50 text-lime-700",
  aydinlatma: "border-indigo-200 bg-indigo-50 text-indigo-700",
  yol: "border-orange-200 bg-orange-50 text-orange-700",
  ulasim: "border-pink-200 bg-pink-50 text-pink-700",
  altyapi: "border-cyan-200 bg-cyan-50 text-cyan-700",
  diger: "border-slate-200 bg-slate-50 text-slate-600",
};

/** Bilinmeyen/eski bir tur icin notr gri (veri beklenmedik bir tur donerse). */
export const TIP_RENGI_VARSAYILAN = "#64748b";

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
