/** Bolge/guzergah islemlerini kaydin tipine gore dogru uca yonlendirir.
 *
 *  Iki uc birebir ayni sekle sahip oldugu ve arayuzde iki kayit turu ayni
 *  panellerde yan yana durdugu icin cagri yerleri "hangi uc" sorusuyla
 *  ugrasmaz: ellerindeki kaydin `tip`ini verirler. */

import {
  bolgeAta,
  bolgeGuncelle,
  bolgeOlustur,
  bolgeSil,
  bolgeTamamla,
} from "./bolgeler";
import {
  guzergahAta,
  guzergahGuncelle,
  guzergahOlustur,
  guzergahSil,
  guzergahTamamla,
} from "./guzergahlar";
import { bolgeyeCevir, guzergahaCevir } from "../hooks/useKayitliCizimler";
import type { Bolge, BolgeGirdi, BolgeGuncelle, BolgeTipi } from "../types/bolge";

export function cizimOlustur(tip: BolgeTipi, data: BolgeGirdi): Promise<Bolge> {
  return tip === "cizgi"
    ? guzergahOlustur(data).then(guzergahaCevir)
    : bolgeOlustur(data).then(bolgeyeCevir);
}

export function cizimGuncelle(
  tip: BolgeTipi,
  id: string,
  data: BolgeGuncelle
): Promise<Bolge> {
  return tip === "cizgi"
    ? guzergahGuncelle(id, data).then(guzergahaCevir)
    : bolgeGuncelle(id, data).then(bolgeyeCevir);
}

export function cizimSil(tip: BolgeTipi, id: string): Promise<void> {
  return tip === "cizgi" ? guzergahSil(id) : bolgeSil(id);
}

export function cizimAta(
  tip: BolgeTipi,
  id: string,
  worker_id: string | null
): Promise<Bolge> {
  return tip === "cizgi"
    ? guzergahAta(id, worker_id).then(guzergahaCevir)
    : bolgeAta(id, worker_id).then(bolgeyeCevir);
}

export function cizimTamamla(
  tip: BolgeTipi,
  id: string,
  tamamlandi = true
): Promise<Bolge> {
  return tip === "cizgi"
    ? guzergahTamamla(id, tamamlandi).then(guzergahaCevir)
    : bolgeTamamla(id, tamamlandi).then(bolgeyeCevir);
}

/** Iki uc de tazelenir: bir islem yalnizca kendi tablosunu degistirse bile
 *  ekip yuku/kapasite ortaktir, ikinci listenin atamalari da kaymis olabilir. */
export const CIZIM_ANAHTARLARI = [["bolgeler"], ["guzergahlar"]] as const;
