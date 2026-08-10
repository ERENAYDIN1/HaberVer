/** Giris/cikis akisinin baslatildigi yer. Token tarayicida tutulmaz: backend'in
 *  `sessions` tablosunda durur, tarayicida yalnizca httpOnly bir oturum
 *  cookie'si vardir (bkz. api/http.ts `credentials: "include"`). */

import { BASE_URL } from "../api/http";

/** Giris kendiliginden baslatildigi icin (bkz. RequireRole) dongu riski var:
 *  Keycloak'ta oturum acikken cookie bize ulasmiyorsa `/auth/me` bos doner ve
 *  kullanici iki sunucu arasinda sonsuza kadar gidip gelir. Bu isaret art
 *  arda denemeleri fark edip akisi `/giris` sayfasinda durdurur. */
const DENEME_ANAHTARI = "haberver_giris_denemesi";
const DONGU_ESIGI_MS = 15_000;

/** Son yonlendirmenin uzerinden esik kadar sure gecmediyse true. */
export function girisDongusuVarMi(): boolean {
  const ham = sessionStorage.getItem(DENEME_ANAHTARI);
  if (!ham) return false;
  return Date.now() - Number(ham) < DONGU_ESIGI_MS;
}

/** Oturum kurulunca cagrilir: sonraki giris ihtiyaci dongu sayilmasin. */
export function girisDenemesiniUnut(): void {
  sessionStorage.removeItem(DENEME_ANAHTARI);
}

/** Cikis surerken giris baslatilmasini engeller. Cikis iki adimlidir (once
 *  yerel oturum silinir, sonra Keycloak'in cikis adresine gidilir); arada
 *  RequireRole girisi yeniden baslatirsa cikis navigasyonu iptal olur ve
 *  kullanici sessizce hesabina geri alinir. */
let cikisSuruyor = false;

export function cikisiBaslat(): void {
  cikisSuruyor = true;
}

/** Keycloak giris ekranina gider; state/nonce/PKCE'yi backend uretir ve giris
 *  bitince kullanici `donus` yoluna doner.
 *
 *  `yontem`: "push" kullanicinin dugmeye bastigi durum, gecmise durak ekler
 *  (geri tusu /giris sayfasina doner). "replace" RequireRole'un otomatik
 *  yonlendirmesi icindir; durak eklemedigi icin geri tusu tum giris zincirini
 *  atlayip kullanicinin gercekten geldigi yere doner. */
export function girisBaslat(
  donus: string = window.location.pathname,
  yontem: "push" | "replace" = "push"
): void {
  if (cikisSuruyor) return;
  sessionStorage.setItem(DENEME_ANAHTARI, String(Date.now()));
  const hedef = `${BASE_URL}/auth/login?next=${encodeURIComponent(donus)}`;
  if (yontem === "replace") window.location.replace(hedef);
  else window.location.href = hedef;
}

/** Keycloak'in KAYIT ekranina gider (vatandas oz-kaydi orada yapilir). */
export function kayitBaslat(donus: string = "/vatandas"): void {
  window.location.href = `${BASE_URL}/auth/login?kayit=true&next=${encodeURIComponent(
    donus
  )}`;
}
