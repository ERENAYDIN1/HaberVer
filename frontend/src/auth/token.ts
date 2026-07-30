/** Kimlik artik tarayicida TASINMAZ.
 *
 *  Token'lar backend'de (`sessions` tablosu) durur; tarayicida yalnizca
 *  JavaScript'in okuyamadigi (httpOnly) bir oturum cookie'si vardir ve her
 *  istege tarayici tarafindan otomatik eklenir (`credentials: "include"`,
 *  bkz. api/http.ts). Bu yuzden saklanacak/eklenecek bir token kalmadi; dosya
 *  giris/cikis akisinin baslatildigi yer olarak duruyor.
 */

import { BASE_URL } from "../api/http";

/** Keycloak giris ekranina gider. state/nonce/PKCE'yi backend uretir; giris
 *  bitince kullanici `donus` yoluna geri doner. */
export function girisBaslat(donus: string = window.location.pathname): void {
  window.location.href = `${BASE_URL}/auth/login?next=${encodeURIComponent(donus)}`;
}

/** Keycloak'in KAYIT ekranina gider (vatandas oz-kaydi orada yapilir). */
export function kayitBaslat(donus: string = "/vatandas"): void {
  window.location.href = `${BASE_URL}/auth/login?kayit=true&next=${encodeURIComponent(
    donus
  )}`;
}
