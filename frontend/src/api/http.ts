import { girisBaslat } from "../auth/token";

/** Tum API modullerinin ortak fetch katmani: tek BASE_URL, tek hata okuma,
 *  tek 401 davranisi. Kimlik `credentials: "include"` ile gonderilen httpOnly
 *  cookie'dedir; bu yuzden BASE_URL goreli bir yoldur ("/api") ve API'nin
 *  uygulamayla ayni origin'de olmasi gerekir. */

export const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";

/** Yuklenen dosyalarin origin'i (ayni origin oldugu icin yalnizca /api atilir). */
export const MEDIA_ORIGIN = BASE_URL.replace(/\/api\/?$/, "");

/** Hata govdesini (422 dogrulama listeleri dahil) tek bir mesaja cevirir. */
export async function hataMesaji(response: Response): Promise<string> {
  try {
    const body = await response.json();
    if (typeof body.detail === "string") return body.detail;
    if (Array.isArray(body.detail)) {
      return body.detail.map((d: { msg: string }) => d.msg).join(" · ");
    }
  } catch {
    // govde JSON degilse asagidaki genel mesaja dusulur
  }
  return `İstek başarısız oldu (HTTP ${response.status})`;
}

/** Oturum bitti: kullaniciyi Keycloak giris akisina sokar ve giris bitince
 *  ayni sayfaya dondurur. */
function oturumuKapat(): never {
  girisBaslat(window.location.pathname);
  throw new Error("Oturum sona erdi, lütfen tekrar giriş yapın");
}

export interface IstekSecenek extends RequestInit {
  /** 401'de giris akisini baslatir (varsayilan acik). Kimlik uclarinda
   *  kapatilir: orada 401 "kimlik hatali" demektir, oturum zaten yoktur. */
  oturumKontrolu?: boolean;
}

async function yanitiCoz<T>(
  response: Response,
  oturumKontrolu: boolean
): Promise<T> {
  if (oturumKontrolu && response.status === 401) oturumuKapat();
  if (!response.ok) throw new Error(await hataMesaji(response));
  // Govdesiz yanitlarda (204, DELETE vb.) json() hata verirdi.
  if (response.status === 204 || response.headers.get("content-length") === "0") {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

/** JSON govdeli standart istek. */
export async function istek<T>(
  yol: string,
  secenek: IstekSecenek = {}
): Promise<T> {
  const { oturumKontrolu = true, ...init } = secenek;
  const response = await fetch(`${BASE_URL}${yol}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  return yanitiCoz<T>(response, oturumKontrolu);
}

/** Multipart istek. Content-Type elle verilmez; boundary'yi tarayici ekler. */
export async function istekForm<T>(
  yol: string,
  form: FormData,
  secenek: IstekSecenek = {}
): Promise<T> {
  const { oturumKontrolu = true, ...init } = secenek;
  const response = await fetch(`${BASE_URL}${yol}`, {
    method: "POST",
    ...init,
    credentials: "include",
    headers: { ...init.headers },
    body: form,
  });
  return yanitiCoz<T>(response, oturumKontrolu);
}
