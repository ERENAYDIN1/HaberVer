/** Kaydedilmis gorev bolgeleri (alan).
 *  Backend: models/bolge.py, routers/bolgeler.py
 *
 *  Guzergahlar (cizgi) artik AYRI bir tablo ve ayri bir uctur (types/guzergah.ts).
 *  Arayuzde ikisi ayni panellerde/haritada yan yana durdugu icin ortak bir
 *  goruntuleme tipi tanimlanir (`KayitliCizim`): `tip` alani kaydin hangi
 *  uctan geldigini soyler ve iki listenin birlestirildigi yerde (App.tsx'teki
 *  useMemo) yazilir - ONBELLEGE HAM YANIT girer, etiketleme yalnizca tuketim
 *  noktasinda yapilir. */

export const BOLGE_TIPLERI = ["alan", "cizgi"] as const;
export type BolgeTipi = (typeof BOLGE_TIPLERI)[number];

export const BOLGE_TIP_ETIKETLERI: Record<BolgeTipi, string> = {
  alan: "Görev Bölgesi",
  cizgi: "Güzergâh",
};

/** Iki kayit turunun paylastigi alanlar (geometri olcusu disinda hepsi). */
interface KayitliCizimTaban {
  id: string;
  ad: string;
  aciklama: string | null;
  renk: string;
  /** Halka listesi: alanlarda poligon halkalari, guzergahlarda tek elemanli
   *  nokta dizisi. Iki uc ayni sekli dondurur ki cizim/duzenleme mantigi
   *  ayrismasin. */
  noktalar: [number, number][][];
  /** Kaydi sahiplenen mudurluk; null = genel (tum personel gorur). Bir
   *  mudurlugun cizdigi calisma alanini digeri gormemeli, yoksa kendi alakasiz
   *  ekibine atayabilir. Adi departman sozlugunden cozulur. */
  departman: string | null;
  worker_id: string | null;
  worker_ad: string | null;
  assigned_at: string | null;
  /** Isin dustugu yaka; kaydin temsil noktasindan (alan -> icindeki bir nokta,
   *  cizgi -> hattin ortasi) backend'de cozulur. Elle atamada "karşı yaka"
   *  uyarisi varliklardakiyle ayni bilgiye dayansin diye tasinir. */
  yaka: string | null;
  /** Saha ekibi isi bitirdiyse dolu; null ise is devam ediyor. */
  tamamlandi_at: string | null;
  created_at: string;
  updated_at: string;
}

/** `GET /api/bolgeler` yanitinin HAM sekli - onbellege bu girer. */
export interface BolgeYanit extends KayitliCizimTaban {
  /** PostGIS'in jeodezik alan olcusu. */
  alan_m2: number | null;
}

/** Panellerin/haritanin okudugu birlesik kayit: iki uctan gelen satirlar
 *  `tip` ile etiketlenip tek listede toplanir. */
export interface Bolge extends KayitliCizimTaban {
  tip: BolgeTipi;
  /** Alanlarda dolu, guzergahlarda null. */
  alan_m2: number | null;
  /** Guzergahlarda dolu, alanlarda null. */
  uzunluk_m: number | null;
}

export interface BolgeGirdi {
  ad: string;
  aciklama?: string | null;
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
   *  nokta eklenerek ya da alan genisletilip daraltilarak degistirilir. */
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
