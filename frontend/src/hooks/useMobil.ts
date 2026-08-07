import { useCallback, useSyncExternalStore } from "react";

/** Mobil kabugun devreye girdigi tek kirilim noktasi.
 *
 *  768px BILINCLI bir secim: bu genisligin ustunde masaustu duzeni (380px yan
 *  panel + harita) dar da olsa calisiyor ve saha ekibinin tableti bugunku
 *  ekrani gormeye devam ediyor. Deger tek yerde durur ki mobil dal ile CSS'teki
 *  `md:` siniflari ayni yerde ayrilsin - Tailwind'in `md` kirilimi de 768px. */
export const MOBIL_ESIGI = 768;

const SORGU = `(max-width: ${MOBIL_ESIGI - 1}px)`;

/** Ekran mobil genisliginde mi. Yalnizca CSS'in cozemedigi yerlerde kullanilir
 *  (farkli bilesen agaci, MapLibre yeniden olcumu, popup davranisi); salt
 *  gorsel farklar Tailwind'in `md:` onekiyle yazilir.
 *
 *  `useSyncExternalStore` ile okunur: medya sorgusu React'in disinda yasayan
 *  bir kaynak ve ilk deger senkron gerekiyor - bir kare masaustu duzenini
 *  cizip sonra mobile gecmek haritayi bosuna iki kez kurdururdu. */
export function useMobil(): boolean {
  const abone = useCallback((degisti: () => void) => {
    const mql = window.matchMedia(SORGU);
    mql.addEventListener("change", degisti);
    return () => mql.removeEventListener("change", degisti);
  }, []);

  return useSyncExternalStore(
    abone,
    () => window.matchMedia(SORGU).matches,
    // Sunucu tarafi render yok; jsdom testlerinde `matchMedia` bulunmayabilir
    // diye guvenli varsayilan masaustudur.
    () => false
  );
}
