/** Kimlik artik tarayicida TASINMAZ.
 *
 *  Token'lar backend'de (`sessions` tablosu) durur; tarayicida yalnizca
 *  JavaScript'in okuyamadigi (httpOnly) bir oturum cookie'si vardir ve her
 *  istege tarayici tarafindan otomatik eklenir (`credentials: "include"`,
 *  bkz. api/http.ts). Bu yuzden saklanacak/eklenecek bir token kalmadi; dosya
 *  giris/cikis akisinin baslatildigi yer olarak duruyor.
 */

import { BASE_URL } from "../api/http";

/** Uygulama artik girisi KENDILIGINDEN baslatiyor (bkz. RequireRole), yani
 *  yonlendirme kullanicinin bir dugmeye basmasina bagli degil. Bu da bir
 *  dongu riski dogurur: Keycloak'ta oturum acikken cookie bize ulasmiyorsa
 *  (SameSite/farkli origin) `/auth/me` bos doner, biz tekrar yonlendiririz ve
 *  kullanici iki sunucu arasinda sonsuza kadar gidip gelir - hicbir sey
 *  gormeden. Asagidaki isaret, art arda gelen denemeleri fark edip akisi
 *  `/giris` kacis sayfasinda durdurmak icindir. */
const DENEME_ANAHTARI = "greenasset_giris_denemesi";
const DONGU_ESIGI_MS = 15_000;

/** Son otomatik yonlendirmenin uzerinden esik kadar sure gecmediyse true:
 *  giris basarili olsaydi bu ikinci deneme hic gerekmezdi. */
export function girisDongusuVarMi(): boolean {
  const ham = sessionStorage.getItem(DENEME_ANAHTARI);
  if (!ham) return false;
  return Date.now() - Number(ham) < DONGU_ESIGI_MS;
}

/** Oturum kurulunca cagrilir: sonraki giris ihtiyaci dongu sayilmasin. */
export function girisDenemesiniUnut(): void {
  sessionStorage.removeItem(DENEME_ANAHTARI);
}

/** Cikis basladiginda kapanan kapi.
 *
 *  Cikis iki adimdir: once yerel oturum silinir, SONRA tarayici Keycloak'in
 *  cikis adresine gider. Arada React "kullanici yok" durumuna duser ve
 *  RequireRole girisi yeniden baslatmak ister; o yonlendirme cikis
 *  navigasyonunu IPTAL eder, Keycloak oturumu ayakta kalir ve kullanici
 *  sessizce hesabina geri alinir ("cikamiyorum"). Bayrak, cikis surerken
 *  hicbir yerden giris baslatilamamasini garanti eder - koruma tek bogazda,
 *  cagiran taraflarda degil. */
let cikisSuruyor = false;

export function cikisiBaslat(): void {
  cikisSuruyor = true;
}

/** Keycloak giris ekranina gider. state/nonce/PKCE'yi backend uretir; giris
 *  bitince kullanici `donus` yoluna geri doner. */
export function girisBaslat(donus: string = window.location.pathname): void {
  if (cikisSuruyor) return;
  sessionStorage.setItem(DENEME_ANAHTARI, String(Date.now()));
  window.location.href = `${BASE_URL}/auth/login?next=${encodeURIComponent(donus)}`;
}

/** Keycloak'in KAYIT ekranina gider (vatandas oz-kaydi orada yapilir). */
export function kayitBaslat(donus: string = "/vatandas"): void {
  window.location.href = `${BASE_URL}/auth/login?kayit=true&next=${encodeURIComponent(
    donus
  )}`;
}
