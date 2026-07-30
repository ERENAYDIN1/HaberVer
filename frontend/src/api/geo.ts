import { istek } from "./http";

export interface AlanOlcusu {
  id: string;
  /** Alanin kendi buyuklugu (cakismaya bakilmaksizin). */
  kendi_m2: number;
  /** Kendisinden ONCEKI alanlarla cakismayan, toplama net katkisi. Tamamen
   *  mevcut bir alanin uzerine cizildiyse 0. */
  net_m2: number;
}

export interface AlanOzeti {
  alanlar: AlanOlcusu[];
  /** Birlesim (union) alani - cakisan yerler tek kez sayilir. */
  toplam_m2: number;
  /** Ham toplam; cakisma varsa toplam_m2'den buyuktur. */
  ham_toplam_m2: number;
}

/** Secili alanlarin cakismayi hesaba katan olcu ozetini PostGIS ile hesaplar.
 *  Frontend'deki shoelace hesabi tek poligon icin yeterli ama iki alan ust uste
 *  bindiginde ayni yeri iki kez sayar; bu uc onu cozer. */
export function alanOzeti(alanlar: { id: string; noktalar: [number, number][][] }[]) {
  return istek<AlanOzeti>("/geo/alan-ozeti", {
    method: "POST",
    body: JSON.stringify({ alanlar }),
  });
}

export interface Tampon {
  noktalar: [number, number][][];
  alan_m2: number;
}

/** Bir alani her yonunde `mesafeM` metre genisletir (negatifse daraltir).
 *  Sekil duzenlemede "alani biraz buyut" istegi koseleri tek tek surukleyerek
 *  yapilamaz; PostGIS'in ST_Buffer'i bunu kenarlara paralel ve jeodezik yapar. */
export function alanTamponu(noktalar: [number, number][][], mesafeM: number) {
  return istek<Tampon>("/geo/tampon", {
    method: "POST",
    body: JSON.stringify({ noktalar, mesafe_m: mesafeM }),
  });
}
