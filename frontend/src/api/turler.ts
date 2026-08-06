import type { Tur, TurCreateInput, TurUpdateInput } from "../types/tur";
import { istek } from "./http";

export function listTurler() {
  return istek<Tur[]>("/turler");
}

/** Yeni tur (yalnizca admin). Mudurluk turle birlikte yazilir. */
export function createTur(data: TurCreateInput) {
  return istek<Tur>("/turler", { method: "POST", body: JSON.stringify(data) });
}

/** Kod degistirilemez; ad/grup/glif/gorunurluk duzeltilebilir. */
export function updateTur(kod: string, data: TurUpdateInput) {
  return istek<Tur>(`/turler/${kod}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

/** Kullanimda olan bir tur silinemez (409): once kayitlarin turu degismeli. */
export function deleteTur(kod: string) {
  return istek<void>(`/turler/${kod}`, { method: "DELETE" });
}
