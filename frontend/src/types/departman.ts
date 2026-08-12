import { GRUP_RENGI, TIP_GRUPLARI, type AssetType, type TipGrubu } from "./asset";

/** Bir belediye mudurlugu. Sozluk BACKEND'DEN gelir (`departmanlar` tablosu),
 *  burada sabitlenmez. */
export interface Departman {
  kod: string;
  ad: string;
  aciklama: string | null;
  /** Rozet/panel rengi. Harita isaretcilerini DOGRUDAN etkilemez - onlarin
   *  rengi tur grubundan gelir (`GRUP_RENGI`); ayni renk olmalari beklenir
   *  ama kaynaklari ayridir (bkz. `grupUyumsuzlugu`). */
  renk: string;
  aktif: boolean;
  /** Listeleme sirasi (kucukten buyuge); triyaj kovasi ("Çözüm Merkezi")
   *  buyuk bir degerle en altta durur. */
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

/** "Veri henuz yuklenmedi" durumunu sessizce tolere eder (undefined doner). */
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
  /** `null` = hicbir mudurluge yonlendirilmemis turler; boyle bir tur
   *  lejanttan/acilirdan DUSMEMELI. */
  departman: Departman | null;
  turler: AssetType[];
}

/** Turleri MUDURLUK MUDURLUK gruplar - lejantin, tur acilirlarinin ve yonetim
 * ekraninin ORTAK kategorilemesi. Sozluk henuz yuklenmediyse `null` doner
 * (duz liste cizilir) - yoksa ilk karede her tur "yonlendirilmemis" gorunup
 * sonra yerine oturur. */
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

/** Bir mudurlugun rozet renginin karsiligi olan gorsel grup; eslesme RENKTEN
 *  kurulur (bkz. `Departman.renk`). Karsiligi yoksa `undefined`. */
export function departmanGrubu(
  departman: Departman | undefined | null
): TipGrubu | undefined {
  if (!departman) return undefined;
  const renk = departman.renk.toLowerCase();
  return TIP_GRUPLARI.find((g) => GRUP_RENGI[g].toLowerCase() === renk);
}

/** Bir tur haritada mudurlugunden BASKA bir renkle mi cizilecek? Dondurulen
 *  metin uyari kutusunda gosterilir; uyum varsa `null`. Kural zorlanmaz,
 *  yalnizca gorunur kilinir. */
export function grupUyumsuzlugu(
  grup: TipGrubu,
  departman: Departman | undefined | null
): string | null {
  if (!departman) return null;
  if (GRUP_RENGI[grup].toLowerCase() === departman.renk.toLowerCase()) return null;
  return `Bu türün harita rengi ${departman.ad} başlığından farklı olacak.`;
}

/** Lejantin ISIMLENDIREBILECEGI mudurlukler - burada kisitlanan sozluk degil
 * LEJANT: departmani olan personel yalnizca kendi mudurlugunun kayitlarini
 * gorur, geri kalan basliklar hep bos cikardi.
 *
 * `kendiDepartmani` NULL = sinirsiz (admin), bos kumeyle ayni sey degil -
 * backend'deki `Kapsam` ayriminin frontend karsiligi. */
export function lejantDepartmanlari(
  departmanlar: readonly Departman[] | undefined,
  kendiDepartmani: string | null | undefined
): readonly Departman[] | undefined {
  if (!departmanlar || !kendiDepartmani) return departmanlar;
  return departmanlar.filter((d) => d.kod === kendiDepartmani);
}

/** Lejantta gosterilebilecek turler. Mudurluk basliklarini elemek yetmez:
 * kapsam disi turler yoksa "Henüz Yönlendirilmemiş" kovasina dusup lejantta
 * kalirdi. Yonlendirmesi olmayan turler bilincli olarak DUSER (yalnizca admin
 * gormeli). Esleme henuz yuklenmediyse daraltma yapilmaz. */
export function lejantTurleri(
  turler: readonly AssetType[],
  esleme: TurDepartmanEslemesi | undefined,
  kendiDepartmani: string | null | undefined
): readonly AssetType[] {
  if (!kendiDepartmani || !esleme) return turler;
  return turler.filter((t) => esleme[t] === kendiDepartmani);
}

/** Yonlendirmesi olmayan turlerin dustugu kovanin adi/rengi. Tek yerde
 *  tanimlanir ki lejant, acilir ve yonetim ekrani ayni sozu soylesin. */
export const YONLENDIRILMEMIS_AD = "Henüz Yönlendirilmemiş";
export const YONLENDIRILMEMIS_RENK = "#94a3b8";
