import type { Bolge, BolgeGirdi, BolgeGuncelle } from "../types/bolge";
import { istek } from "./http";

/** Personel: kaydedilmis tum gorev bolgeleri ve guzergahlar. */
export function bolgeler() {
  return istek<Bolge[]>("/bolgeler");
}

/** Saha ekibi: yalnizca kendisine atanan gorev bolgeleri. */
export function bolgelerim() {
  return istek<Bolge[]>("/bolgeler/benim");
}

export function bolgeOlustur(data: BolgeGirdi) {
  return istek<Bolge>("/bolgeler", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function bolgeGuncelle(id: string, data: BolgeGuncelle) {
  return istek<Bolge>(`/bolgeler/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function bolgeSil(id: string) {
  return istek<void>(`/bolgeler/${id}`, { method: "DELETE" });
}

/** Bolgeyi/guzergahi bir saha ekibine atar; worker_id null ise atamayi kaldirir. */
export function bolgeAta(id: string, worker_id: string | null) {
  return istek<Bolge>(`/bolgeler/${id}/ata`, {
    method: "POST",
    body: JSON.stringify({ worker_id }),
  });
}

/** Saha ekibi: atanan bolgeyi/guzergahi tamamlandi isaretler; tamamlandi=false
 *  yanlislikla kapatilan isi geri alir. */
export function bolgeTamamla(id: string, tamamlandi = true) {
  return istek<Bolge>(`/bolgeler/${id}/tamamla`, {
    method: "POST",
    body: JSON.stringify({ tamamlandi }),
  });
}
