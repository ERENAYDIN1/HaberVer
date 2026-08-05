import type { AssetType } from "./asset";

/** Bir belediye mudurlugu. Sozluk BACKEND'DEN gelir (`departmanlar` tablosu),
 *  burada sabitlenmez: bir belediye orgutlenmesini degistirdiginde frontend
 *  yeniden derlenmemeli. */
export interface Departman {
  kod: string;
  ad: string;
  aciklama: string | null;
  /** Rozet/panel rengi. HARITA ISARETCILERINI ETKILEMEZ - onlarin rengi tur
   *  grubundan gelir (`GRUP_RENGI`). Iki renk sistemi bilincli olarak ayridir,
   *  yoksa haritada ayni sekil iki farkli anlamda renklenirdi. */
  renk: string;
  aktif: boolean;
}

/** tur -> departman_kod. `GET /api/departmanlar/esleme` yaniti. */
export type TurDepartmanEslemesi = Partial<Record<AssetType, string>>;

export interface EslemeYaniti {
  esleme: TurDepartmanEslemesi;
}

/** Departman sozlugu + esleme uzerinde calisan kucuk yardimcilar. Hepsi
 *  "veri henuz yuklenmedi" durumunu sessizce tolere eder (undefined doner),
 *  cunku bu bilgi bir ekranin cizilmesini engellemeyecek kadar ikincildir. */
export function departmanBul(
  departmanlar: readonly Departman[] | undefined,
  kod: string | null | undefined
): Departman | undefined {
  if (!kod) return undefined;
  return departmanlar?.find((d) => d.kod === kod);
}

/** Bir turun gidecegi departman. */
export function turDepartmani(
  esleme: TurDepartmanEslemesi | undefined,
  tur: AssetType | null | undefined
): string | undefined {
  if (!tur) return undefined;
  return esleme?.[tur];
}

export function departmanAdi(
  departmanlar: readonly Departman[] | undefined,
  kod: string | null | undefined
): string {
  return departmanBul(departmanlar, kod)?.ad ?? "—";
}

/** Bir departmanin kapsadigi turler (eslemenin ters yonu). */
export function departmanTurleri(
  esleme: TurDepartmanEslemesi | undefined,
  kod: string
): AssetType[] {
  if (!esleme) return [];
  return (Object.keys(esleme) as AssetType[]).filter((t) => esleme[t] === kod);
}
