import type {
  Departman,
  EslemeYaniti,
  TurDepartmanEslemesi,
} from "../types/departman";
import { istek } from "./http";

export function listDepartmanlar() {
  return istek<Departman[]>("/departmanlar");
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
