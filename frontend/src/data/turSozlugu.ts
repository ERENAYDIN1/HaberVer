import {
  GRUP_RENGI,
  GRUP_ROZET_SINIFI,
  TIP_GRUPLARI,
  TIP_RENGI_VARSAYILAN,
  TIP_ROZET_SINIFI_VARSAYILAN,
  type AssetType,
  type TipGrubu,
} from "../types/asset";
import type { Tur } from "../types/tur";
import { GLIF_KITAPLIGI, VARSAYILAN_GLIF } from "./tipGlifleri";

/**
 * Tur sozlugunun calisma zamani kaydi.
 *
 * Turler artik derleme zamani sabiti degil BACKEND VERISIDIR (`turler`
 * tablosu): admin arayuzden yeni bir tur ekleyebilsin diye. Ama sozlugu okuyan
 * her yer React degil - harita katmanlari, popup HTML'leri ve CSV disa aktarma
 * duz fonksiyonlar. Bu yuzden sozluk burada, modul duzeyinde tutulur; React
 * tarafi `useTurler()` ile ayni veriyi ceker ve YUKLENENE KADAR korumali
 * ekranlar cizilmez (auth/RequireRole). Boylece asagidaki fonksiyonlar
 * cagrildiklarinda sozluk her zaman doludur ve senkron kalabilirler.
 *
 * Bilinmeyen bir kod her zaman sessizce tolere edilir (ad = kodun kendisi,
 * renk notr gri): silinmis bir turun eski kaydi bir ekrani cokertmemeli.
 *
 * Sozluk TEKTIR ve alt kumesi yoktur: `turKodlari()` neyi donduruyorsa lejant,
 * filtre, vatandas talep formu ve envanter formu ayni listeyi gorur.
 */

let SOZLUK: Tur[] = [];
let INDEKS = new Map<string, Tur>();
let SURUM = 0;

/** Sozluk her yazildiginda artan sayac. React tarafi bunu bir effect
 *  bagimliligi olarak kullanir: admin yeni bir tur eklediginde filtre
 *  kutucuklari kendini yeni ture gore tamamlayabilsin diye. */
export function turSozluguSurumu(): number {
  return SURUM;
}

export function setTurSozlugu(turler: Tur[]): void {
  SURUM += 1;
  SOZLUK = [...turler].sort((a, b) => a.ad.localeCompare(b.ad, "tr"));
  INDEKS = new Map(SOZLUK.map((t) => [t.kod, t]));
}

export function turSozluguHazirMi(): boolean {
  return SOZLUK.length > 0;
}

export function tumTurler(): Tur[] {
  return SOZLUK;
}

/** Sozlukteki tum kodlar. Tur secilebilen ve turle suzulen her yer (lejant,
 *  filtre, talep formu, envanter formu) bunu okur. */
export function turKodlari(): AssetType[] {
  return SOZLUK.map((t) => t.kod);
}

export function turKaydi(kod: AssetType): Tur | undefined {
  return INDEKS.get(kod);
}

export function turAdi(kod: AssetType): string {
  return INDEKS.get(kod)?.ad ?? kod;
}

export function turGrubu(kod: AssetType): TipGrubu {
  const grup = INDEKS.get(kod)?.grup;
  return grup && TIP_GRUPLARI.includes(grup) ? grup : "diger";
}

export function turRengi(kod: AssetType): string {
  const tur = INDEKS.get(kod);
  return tur ? GRUP_RENGI[turGrubu(kod)] : TIP_RENGI_VARSAYILAN;
}

export function turRozetSinifi(kod: AssetType): string {
  const tur = INDEKS.get(kod);
  return tur ? GRUP_ROZET_SINIFI[turGrubu(kod)] : TIP_ROZET_SINIFI_VARSAYILAN;
}

/** Bir grubun altindaki turler (acilir listelerde <optgroup>, lejantta baslik). */
export function grupTurleri(grup: TipGrubu): AssetType[] {
  return SOZLUK.filter((t) => t.grup === grup).map((t) => t.kod);
}

/** Turun cizgi glifi (ham SVG icerigi). Glifi secilmemis ya da bilinmeyen bir
 *  tur genel "diğer" glifine duser - yeni tur eklemek cizim yapmayi
 *  gerektirmesin diye. */
export function turGlifi(kod: AssetType): string {
  const anahtar = INDEKS.get(kod)?.glif;
  return (anahtar && GLIF_KITAPLIGI[anahtar]) || GLIF_KITAPLIGI[VARSAYILAN_GLIF];
}

/** MapLibre `match` ifadesi icin kod->renk cifti listesi. Harita katmanlari
 *  sozluk yuklendikten sonra kuruldugu icin bu her cagrida taze uretilir. */
export function turRenkCiftleri(): string[] {
  return SOZLUK.flatMap((t) => [t.kod, GRUP_RENGI[t.grup] ?? TIP_RENGI_VARSAYILAN]);
}
