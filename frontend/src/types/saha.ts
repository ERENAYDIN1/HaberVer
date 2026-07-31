import type { AssetSource, AssetStatus, AssetType, PointGeometry } from "./asset";

/** Bir saha ekibine ayni anda dusebilecek en fazla aktif gorev (backend'deki
 *  MAKS_AKTIF_GOREV ile ayni olmali). */
export const MAKS_AKTIF_GOREV = 3;

/** Otomatik atamada bir ekibe olan azami mesafe (km, backend'deki
 *  MAKS_ATAMA_MESAFE_M ile ayni olmali). Yalnizca metin gostermek icin. */
export const MAKS_ATAMA_MESAFE_KM = 5;

/** Yaka (kita) kodlari — backend'deki 'yakalar' tablosunun kod degerleri.
 *  Otomatik atamada ekip ile varligin yakasi ayni olmak zorundadir: Bogaz'in
 *  iki yakasi kus ucusu 2 km olabilir ama arac ile ancak koprüden gecilir,
 *  yani mesafe esigi tek basina 'karsiya gecme'yi engellemez. */
export const YAKALAR = ["avrupa", "anadolu", "ada"] as const;
export type Yaka = (typeof YAKALAR)[number];

export const YAKA_ETIKETLERI: Record<Yaka, string> = {
  avrupa: "Avrupa Yakası",
  anadolu: "Anadolu Yakası",
  ada: "Adalar",
};

/** Kisa rozet metni (dar alanlar icin). */
export const YAKA_KISA: Record<Yaka, string> = {
  avrupa: "Avrupa",
  anadolu: "Anadolu",
  ada: "Adalar",
};

export function yakaEtiketi(yaka: string | null | undefined): string | null {
  if (!yaka) return null;
  return YAKA_ETIKETLERI[yaka as Yaka] ?? yaka;
}

/** Bir varligin o an atali oldugu ekip bilgisi (GET /api/saha/gorev/{asset_id});
 *  varlik havuzda bekliyorsa null doner. */
export interface AktifGorevBilgi {
  worker_id: string;
  worker_ad: string;
  assigned_at: string;
  /** true: sistemin otomatik atadigi, false: bir personelin elle atadigi. */
  otomatik: boolean;
}

/** GET /api/saha/gorev/{asset_id} yaniti: varligin aktif gorevi (yoksa null) +
 *  varligin hangi yakada oldugu (elle atamada 'karsi yaka' uyarisi icin). */
export interface GorevDurumu {
  gorev: AktifGorevBilgi | null;
  varlik_yaka: string | null;
  varlik_yaka_ad: string | null;
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
  /** Ekibin etkin yakasi: kadro yakasi (users.yaka) varsa o, yoksa son
   *  konumundan turetilen. Konum da yoksa null. */
  yaka: string | null;
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
  /** Varligin dustugu yaka (panoda 'karsi yakaya tasima' uyarisi icin). */
  yaka: string | null;
}

/** Bir ekibin yakinda tamamladigi (tamir ettigi) is - haritadaki ekip
 *  popup'indaki kisa "Son Tamir Edilenler" listesi icin. Ekip basina en fazla
 *  birkac tane doner (backend'deki SON_TAMAMLANAN_SAYISI). */
export interface TamamlananOzet {
  assignment_id: string;
  asset_id: string;
  name: string;
  type: AssetType;
  /** Varligin O ANKI durumu (is geri alinmis olabilir). */
  status: AssetStatus;
  completed_at: string | null;
}

/** Bir ekip + kendine dusen aktif gorevler (GET /api/saha/ekip-gorevleri). */
export interface EkipGorevleri extends EkipOzet {
  gorevler: GorevOzet[];
  son_tamamlananlar: TamamlananOzet[];
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
  /** Varligin bakima dusme/son guncellenme zamani; havuzdaki bekleme suresi
   *  bundan hesaplanir (created_at kayitli varliklarda kurulus tarihidir). */
  updated_at: string;
  /** Varligin dustugu yaka (elle atarken 'karsi yaka' uyarisi icin). */
  yaka: string | null;
}

/** Bir gorevin (assignment) + uzerindeki varligin ozellikleri. */
export interface GorevProperties {
  assignment_id: string;
  assigned_at: string;
  /** Tamamlanan gorevlerde dolu; aktif gorevlerde null. */
  completed_at: string | null;
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
