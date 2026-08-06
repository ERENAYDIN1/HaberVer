/** Kaydedilmis cizimler: gorev bolgeleri (alan) ve guzergahlar (cizgi).
 *  Backend: models/bolge.py, routers/bolgeler.py */

export const BOLGE_TIPLERI = ["alan", "cizgi"] as const;
export type BolgeTipi = (typeof BOLGE_TIPLERI)[number];

export const BOLGE_TIP_ETIKETLERI: Record<BolgeTipi, string> = {
  alan: "Görev Bölgesi",
  cizgi: "Güzergâh",
};

export interface Bolge {
  id: string;
  ad: string;
  aciklama: string | null;
  tip: BolgeTipi;
  renk: string;
  /** Halka listesi. tip='alan' -> poligon halkalari (kapali degil),
   *  tip='cizgi' -> tek elemanli, cizginin nokta dizisi. */
  noktalar: [number, number][][];
  /** PostGIS'in jeodezik olcusu - alan bolgelerde dolu, cizgilerde null. */
  alan_m2: number | null;
  /** Cizgilerde dolu, alan bolgelerde null. */
  uzunluk_m: number | null;
  /** Kaydi sahiplenen mudurluk; null = genel (tum personel gorur). Bir
   *  mudurlugun cizdigi calisma alanini digeri gormemeli, yoksa kendi alakasiz
   *  ekibine atayabilir. Adi departman sozlugunden cozulur. */
  departman: string | null;
  /** Atanan saha ekibi (alan -> gorev bolgesi, cizgi -> guzergah). */
  worker_id: string | null;
  worker_ad: string | null;
  assigned_at: string | null;
  /** Saha ekibi isi bitirdiyse dolu; null ise is devam ediyor. */
  tamamlandi_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BolgeGirdi {
  ad: string;
  aciklama?: string | null;
  tip: BolgeTipi;
  renk: string;
  /** Yalnizca ADMIN icin anlamli: departmani olan personelin kaydi her zaman
   *  kendi mudurlugune yazilir, gonderilen deger yok sayilir. */
  departman?: string | null;
  noktalar: [number, number][][];
}

export interface BolgeGuncelle {
  ad?: string;
  aciklama?: string | null;
  renk?: string;
  /** Kaydi baska bir mudurluge devretmek (yalnizca admin); null = genel. */
  departman?: string | null;
  /** Sekil (geometri) guncellemesi - haritada koseler suruklenerek, kenara
   *  nokta eklenerek ya da alan genisletilip daraltilarak degistirilir. Kaydin
   *  tipi degismez: alan alan, guzergah cizgi kalir. */
  noktalar?: [number, number][][];
}

/** Haritada sekli duzenlenmekte olan bir bolge/guzergah. `noktalar` kaydin
 *  kendisinden bagimsiz bir taslaktir: kullanici "Kaydet" demeden backend'e
 *  yazilmaz, "Vazgeç" ile atilir. */
export interface SekilDuzenleme {
  id: string;
  ad: string;
  tip: BolgeTipi;
  renk: string;
  noktalar: [number, number][][];
}
