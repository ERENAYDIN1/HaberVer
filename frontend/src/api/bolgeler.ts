import type { BolgeGirdi, BolgeGuncelle, BolgeYanit } from "../types/bolge";
import { istek } from "./http";

/** Personel: kaydedilmis tum gorev bolgeleri (alan). */
export function bolgeler() {
  return istek<BolgeYanit[]>("/bolgeler");
}

/** Saha ekibi: yalnizca kendisine atanan gorev bolgeleri. */
export function bolgelerim() {
  return istek<BolgeYanit[]>("/bolgeler/benim");
}

export function bolgeOlustur(data: BolgeGirdi) {
  return istek<BolgeYanit>("/bolgeler", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function bolgeGuncelle(id: string, data: BolgeGuncelle) {
  return istek<BolgeYanit>(`/bolgeler/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function bolgeSil(id: string) {
  return istek<void>(`/bolgeler/${id}`, { method: "DELETE" });
}

/** Bolgeyi bir saha ekibine atar; worker_id null ise atamayi kaldirir. */
export function bolgeAta(id: string, worker_id: string | null) {
  return istek<BolgeYanit>(`/bolgeler/${id}/ata`, {
    method: "POST",
    body: JSON.stringify({ worker_id }),
  });
}

/** Saha ekibi: atanan bolgeyi tamamlandi isaretler; tamamlandi=false
 *  yanlislikla kapatilan isi geri alir. */
export function bolgeTamamla(id: string, tamamlandi = true) {
  return istek<BolgeYanit>(`/bolgeler/${id}/tamamla`, {
    method: "POST",
    body: JSON.stringify({ tamamlandi }),
  });
}
