import type {
  Departman,
  DepartmanCreateInput,
  DepartmanUpdateInput,
  EslemeYaniti,
  TurDepartmanEslemesi,
} from "../types/departman";
import { istek } from "./http";

export function listDepartmanlar() {
  return istek<Departman[]>("/departmanlar");
}

/** Yeni mudurluk (yalnizca admin). Kod sonradan degistirilemez. */
export function createDepartman(data: DepartmanCreateInput) {
  return istek<Departman>("/departmanlar", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateDepartman(kod: string, data: DepartmanUpdateInput) {
  return istek<Departman>(`/departmanlar/${kod}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

/** Herhangi bir bagi olan mudurluk silinemez (409); pasife alinir. */
export function deleteDepartman(kod: string) {
  return istek<void>(`/departmanlar/${kod}`, { method: "DELETE" });
}

export function getEsleme() {
  return istek<EslemeYaniti>("/departmanlar/esleme");
}

/** Tur -> departman yonlendirmesini gunceller (yalnizca admin). Kismi:
 *  gonderilmeyen tur oldugu gibi kalir. */
export function updateEsleme(esleme: TurDepartmanEslemesi) {
  return istek<EslemeYaniti>("/departmanlar/esleme", {
    method: "PUT",
    body: JSON.stringify({ esleme }),
  });
}
