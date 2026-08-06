import { GRUP_RENGI, TIP_GRUPLARI, type AssetType, type TipGrubu } from "./asset";

/** Bir belediye mudurlugu. Sozluk BACKEND'DEN gelir (`departmanlar` tablosu),
 *  burada sabitlenmez: bir belediye orgutlenmesini degistirdiginde frontend
 *  yeniden derlenmemeli. */
export interface Departman {
  kod: string;
  ad: string;
  aciklama: string | null;
  /** Rozet/panel rengi. Harita isaretcilerini DOGRUDAN etkilemez - onlarin
   *  rengi tur grubundan gelir (`GRUP_RENGI`); iki sistem ayridir cunku
   *  mudurluk veridir, palet kodda yasar. Yine de ayni renk olmalari beklenir:
   *  lejantta mudurluk basliginin altinda baska bir mudurlugun rengiyle cizilen
   *  bir tur satiri haritanin sifresini bozar (bkz. `grupUyumsuzlugu`). */
  renk: string;
  aktif: boolean;
  /** Listeleme sirasi (kucukten buyuge). Mudurluk lejantta ve tur
   *  acilirlarinda ANA BASLIK oldugu icin bu, kullanicinin gordugu duzendir;
   *  triyaj kovasi ("Çözüm Merkezi") buyuk bir degerle en altta durur. */
  sira: number;
}

/** POST /api/departmanlar govdesi. Kod dogal anahtardir: personel, tur, bolge
 *  ve audit log satirlari ona baglanir, sonradan degistirilemez. */
export interface DepartmanCreateInput {
  kod: string;
  ad: string;
  aciklama: string | null;
  renk: string;
  aktif: boolean;
  sira: number;
}

/** PATCH /api/departmanlar/{kod} govdesi. */
export type DepartmanUpdateInput = Partial<Omit<DepartmanCreateInput, "kod">>;

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

/** Bir mudurluk ve kapsadigi turler. */
export interface DepartmanTurGrubu {
  /** `null` = hicbir mudurluge yonlendirilmemis turler. Pratikte bos kalir
   *  (backend her ture bir mudurluk zorunlu kilar), ama bir yonlendirme satiri
   *  elle silinirse tur lejanttan/acilirdan DUSMEMELI. */
  departman: Departman | null;
  turler: AssetType[];
}

/**
 * Turleri MUDURLUK MUDURLUK gruplar - lejantin, tur acilirlarinin ve yonetim
 * ekraninin ORTAK kategorilemesi. Baslik "bu is kime gidiyor"u anlatir; bir
 * turun haritada hangi renkle cizildigi ayri bir sistemdir (`GRUP_RENGI`) ve
 * ikisi bilincli olarak ortusmez.
 *
 * Sozluk (departman listesi ya da esleme) henuz yuklenmediyse `null` doner:
 * cagiran taraf duz bir liste cizer. Yoksa ilk karede her tur "yonlendirilmemis"
 * gorunur, sonra yerine otururdu.
 */
export function departmanTurGruplari(
  departmanlar: readonly Departman[] | undefined,
  esleme: TurDepartmanEslemesi | undefined,
  turler: readonly AssetType[]
): DepartmanTurGrubu[] | null {
  if (!departmanlar || !esleme) return null;

  const gruplar: DepartmanTurGrubu[] = [];
  const eslenen = new Set<AssetType>();
  // Sozluk sirasi korunur: esleme nesnesinin anahtar sirasina guvenilmez.
  for (const departman of departmanlar) {
    const kapsam = turler.filter((t) => esleme[t] === departman.kod);
    if (kapsam.length === 0) continue;
    kapsam.forEach((t) => eslenen.add(t));
    gruplar.push({ departman, turler: kapsam });
  }

  const artan = turler.filter((t) => !eslenen.has(t));
  if (artan.length > 0) gruplar.push({ departman: null, turler: artan });
  return gruplar;
}

/** Bir mudurlugun rozet renginin karsiligi olan gorsel grup. Palet ile
 *  mudurluk renkleri birebir ortustugu icin (bkz. `Departman.renk`) eslesme
 *  RENKTEN kurulur: yeni bir mudurluk paletten bir renk secince turleri de
 *  kendiliginden dogru grupla acilir. Karsiligi yoksa `undefined`. */
export function departmanGrubu(
  departman: Departman | undefined | null
): TipGrubu | undefined {
  if (!departman) return undefined;
  const renk = departman.renk.toLowerCase();
  return TIP_GRUPLARI.find((g) => GRUP_RENGI[g].toLowerCase() === renk);
}

/** Bir tur haritada mudurlugunden BASKA bir renkle mi cizilecek? Dondurulen
 *  metin uyari kutusunda gosterilir; uyum varsa `null`.
 *
 *  Kural zorlanmaz, yalnizca gorunur kilinir: palet kodda sabit oldugu icin
 *  yeni bir mudurluk renginin karsiligi olan bir grup her zaman olmayabilir. */
export function grupUyumsuzlugu(
  grup: TipGrubu,
  departman: Departman | undefined | null
): string | null {
  if (!departman) return null;
  if (GRUP_RENGI[grup].toLowerCase() === departman.renk.toLowerCase()) return null;
  return `Bu türün harita rengi ${departman.ad} başlığından farklı olacak.`;
}

/** Yonlendirmesi olmayan turlerin dustugu kovanin adi/rengi. Tek yerde
 *  tanimlanir ki lejant, acilir ve yonetim ekrani ayni sozu soylesin. */
export const YONLENDIRILMEMIS_AD = "Henüz Yönlendirilmemiş";
export const YONLENDIRILMEMIS_RENK = "#94a3b8";
