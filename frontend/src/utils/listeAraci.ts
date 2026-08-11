/** Liste panellerindeki arama/siralama hesaplari.
 *
 *  Bilesenden AYRI bir modul: `ListeAraciCubugu.tsx` yalnizca bilesen export
 *  etsin diye (bir React dosyasindan veri/fonksiyon export etmek Fast
 *  Refresh'i bozuyor - `tipGlifleri.ts`'in `icons.tsx`'ten ayrilmasiyla ayni
 *  gerekce). Buradaki hicbir sey React'e dokunmaz, saf hesaptir. */

/** Cubugun acilirda gostermesi icin gereken tek sey: deger + etiket.
 *  Karsilastirici burada DEGIL - cubuk siralamayi kendisi yapmaz, yalnizca
 *  secimi bildirir. Tipi jenerik tutmak, tek cubugun iki farkli listeyi (ham
 *  talep / varlik) besledigi TalepPaneli'nde gereksiz bir tip catismasi
 *  yaratiyordu. */
export interface SiralamaEtiketi {
  deger: string;
  etiket: string;
}

/** Bir siralama secenegi: acilirda gorunen etiket + karsilastirma islevi.
 *  Karsilastirici disaridan gelir cunku her panelin siralayacagi alan farkli
 *  (varlikta ad/durum, talepte tur, bolgede buyukluk) - ortak olan yalnizca
 *  yuzeydir. */
export interface SiralamaSecenegi<T> extends SiralamaEtiketi {
  karsilastir: (a: T, b: T) => number;
}

/** Turkce siralama: duz `sort()` "İ/ı" ve "Ş/ş" gibi harfleri yanlis yere
 *  koyar (Unicode kod noktasina gore siralar). Tur sozlugundeki desenle ayni. */
export function metinKarsilastir(a: string, b: string): number {
  return a.localeCompare(b, "tr");
}

/** Yeniden eskiye: ISO tarih dizgileri dogrudan karsilastirilabilir, ama
 *  bozuk/eksik tarih listeyi kirmasin diye Date'e cevrilir. */
export function tariheGoreYeni(a: string, b: string): number {
  return new Date(b).getTime() - new Date(a).getTime();
}

/** Arama metnini normalize eder: kucuk harfe cevirir ve Turkce'ye ozgu
 *  harfleri sadelestirir. "cop" yazan kullanici "Çöp Kutusu"nu bulmali -
 *  mobilde Turkce klavye tuslarina uzanmak zahmetli, masaustunde de kimse
 *  arama kutusuna sapkali harf yazmiyor. */
export function aramaNormalize(s: string): string {
  return (
    s
      .toLocaleLowerCase("tr")
      .replace(/[çÇ]/g, "c")
      .replace(/[ğĞ]/g, "g")
      .replace(/[ıİiI]/g, "i")
      .replace(/[öÖ]/g, "o")
      .replace(/[şŞ]/g, "s")
      .replace(/[üÜ]/g, "u")
      // Duzeltme isaretli harfler ("Güzergâh", "kâğıt"): kullanici bunlari
      // sapkasiz yazar. Yukaridaki kurallar bunlari kacirir - NFD ile ayrilip
      // birlesen aksan isaretleri (U+0300-U+036F) atilir.
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
  );
}

/** Bir kaydin arama metnini olusturur: null/undefined alanlar atilir. */
export function aramaMetni(...parcalar: (string | null | undefined)[]): string {
  return aramaNormalize(parcalar.filter(Boolean).join(" "));
}

/** "Önce atanmamış" siralamasinin karsilastiricisi (varlik listeleri).
 *
 *  Uc kademe, bilincli olarak bu sirayla:
 *    0. atanmamis bakim isi  - "kime is dusmedi" sorusunun cevabi, tepede
 *    1. atanmis bakim isi    - devam eden is
 *    2. bakim gerektirmeyen  - atanmasi zaten soz konusu degil, en sonda
 *
 *  Ucuncu kademe olmasa "İyi" durumdaki varliklar atanmislarla karisir ve
 *  liste "hangi is bekliyor" sorusunu cevaplamaz olurdu. Kademe icinde en
 *  yeniye duser: ikinci bir olcut olmazsa ayni gruptaki kayitlarin sirasi
 *  backend'in kaprisine kalir.
 *
 *  `atanmamisIdler` havuz ucundan gelir (`GET /saha/havuz`) - varlik
 *  listesinin kendisi atama bilgisi tasimaz.
 */
export function atanmamisOnce<T>(
  atanmamisIdler: ReadonlySet<string>,
  id: (k: T) => string,
  bakimBekliyor: (k: T) => boolean,
  olusturma: (k: T) => string
): (a: T, b: T) => number {
  const kademe = (k: T) => {
    if (!bakimBekliyor(k)) return 2;
    return atanmamisIdler.has(id(k)) ? 0 : 1;
  };
  return (a, b) => {
    const fark = kademe(a) - kademe(b);
    return fark !== 0 ? fark : tariheGoreYeni(olusturma(a), olusturma(b));
  };
}

/** Bir listeyi arama + siralamadan gecirir. Kopyalanir: react-query
 *  onbellegindeki diziyi yerinde siralamak onbellegi bozar. */
export function suzVeSirala<T>(
  kayitlar: readonly T[],
  arama: string,
  metin: (k: T) => string,
  secenekler: readonly SiralamaSecenegi<T>[],
  sira: string
): T[] {
  const q = aramaNormalize(arama.trim());
  const suzulmus = q ? kayitlar.filter((k) => metin(k).includes(q)) : kayitlar;
  const secenek = secenekler.find((s) => s.deger === sira) ?? secenekler[0];
  return [...suzulmus].sort(secenek.karsilastir);
}
