import type {
  GuzergahGirdi,
  GuzergahGuncelle,
  GuzergahYanit,
} from "../types/guzergah";
import { istek } from "./http";

/** Personel: kaydedilmis tum guzergahlar (cizgi). */
export function guzergahlar() {
  return istek<GuzergahYanit[]>("/guzergahlar");
}

/** Saha ekibi: yalnizca kendisine atanan guzergahlar. */
export function guzergahlarim() {
  return istek<GuzergahYanit[]>("/guzergahlar/benim");
}

export function guzergahOlustur(data: GuzergahGirdi) {
  return istek<GuzergahYanit>("/guzergahlar", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function guzergahGuncelle(id: string, data: GuzergahGuncelle) {
  return istek<GuzergahYanit>(`/guzergahlar/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function guzergahSil(id: string) {
  return istek<void>(`/guzergahlar/${id}`, { method: "DELETE" });
}

/** Guzergahi bir saha ekibine atar; worker_id null ise atamayi kaldirir. */
export function guzergahAta(id: string, worker_id: string | null) {
  return istek<GuzergahYanit>(`/guzergahlar/${id}/ata`, {
    method: "POST",
    body: JSON.stringify({ worker_id }),
  });
}

/** Saha ekibi: atanan guzergahi tamamlandi isaretler; tamamlandi=false
 *  yanlislikla kapatilan isi geri alir. */
export function guzergahTamamla(id: string, tamamlandi = true) {
  return istek<GuzergahYanit>(`/guzergahlar/${id}/tamamla`, {
    method: "POST",
    body: JSON.stringify({ tamamlandi }),
  });
}
