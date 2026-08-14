/** Kaydedilmis guzergahlar (cizgi).
 *  Backend: models/guzergah.py, routers/guzergahlar.py
 *
 *  Bolgelerle (types/bolge.ts) ayni alanlari tasir; ayrilan tek sey olcunun
 *  uzunluk olmasi. Arayuzde ikisi birlesik `Bolge` tipiyle gosterilir. */

import type { BolgeGirdi, BolgeGuncelle } from "./bolge";

/** `GET /api/guzergahlar` yanitinin HAM sekli - onbellege bu girer. */
export interface GuzergahYanit {
  id: string;
  ad: string;
  aciklama: string | null;
  renk: string;
  /** Tek elemanli halka listesi: guzergahin nokta dizisi. */
  noktalar: [number, number][][];
  departman: string | null;
  /** PostGIS'in jeodezik uzunluk olcusu (metre). */
  uzunluk_m: number | null;
  worker_id: string | null;
  worker_ad: string | null;
  assigned_at: string | null;
  yaka: string | null;
  tamamlandi_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Girdi/guncelleme sekilleri bolgelerle birebir aynidir (uc, nokta sayisini
 *  kendi tipine gore dogrular); ayri isim yalnizca cagri yerinde hangi ucun
 *  kastedildigi okunsun diye. */
export type GuzergahGirdi = BolgeGirdi;
export type GuzergahGuncelle = BolgeGuncelle;
