import { authHeader, tokenSil } from "../auth/token";

/** Tum API modullerinin ortak fetch katmani. Daha once her modul (assets,
 *  reports, saha, sinirlar, auth, logs) kendi BASE_URL + hata okuma + istek
 *  sarmalayicisini tasiyordu; kopyalar zamanla ayristi ve 401 davranisi
 *  moduller arasinda tutarsiz kaldi (bazisi oturumu kapatiyor, bazisi
 *  kullaniciyi calismayan bir ekranda birakiyordu). Tek yer = tek davranis. */

export const BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api";

/** Backend origin'i (foto gibi statik dosyalar icin; /api eki cikarilir). */
export const MEDIA_ORIGIN = BASE_URL.replace(/\/api\/?$/, "");

/** Backend'in hata govdesini (422 dogrulama listeleri dahil) okunabilir tek
 *  bir mesaja cevirir. */
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

/** Oturumu sonlandirip kullaniciyi KENDI giris sayfasina yollar: iki ayri
 *  giris var (personel /giris, vatandas /vatandas/giris) ve vatandas personel
 *  ekraninda bulmamali kendini. Ayrim RequireRole'un `girisYolu` mantigiyla
 *  ayni (bkz. main.tsx). */
function oturumuKapat(): never {
  tokenSil();
  window.location.href = window.location.pathname.startsWith("/vatandas")
    ? "/vatandas/giris"
    : "/giris";
  throw new Error("Oturum sona erdi, lütfen tekrar giriş yapın");
}

export interface IstekSecenek extends RequestInit {
  /** 401 alininca oturumu kapatip giris sayfasina yonlendirir (varsayilan).
   *  Kimlik uclarinda (login/register) kapatilir: orada 401 "e-posta veya
   *  parola hatali" demektir, oturum zaten yoktur. */
  oturumKontrolu?: boolean;
}

async function yanitiCoz<T>(
  response: Response,
  oturumKontrolu: boolean
): Promise<T> {
  if (oturumKontrolu && response.status === 401) oturumuKapat();
  if (!response.ok) throw new Error(await hataMesaji(response));
  // 204 ve govdesiz yanitlar (DELETE, konum bildirimi vb.) icin json() cagrisi
  // hata verirdi; bu uclarda cagiranlar zaten `void` bekliyor.
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
    headers: {
      "Content-Type": "application/json",
      ...authHeader(),
      ...init.headers,
    },
  });
  return yanitiCoz<T>(response, oturumKontrolu);
}

/** Dosya yuklemeli (multipart) istek. Content-Type ELLE verilmez; tarayici
 *  multipart boundary'sini kendisi ekler. */
export async function istekForm<T>(
  yol: string,
  form: FormData,
  secenek: IstekSecenek = {}
): Promise<T> {
  const { oturumKontrolu = true, ...init } = secenek;
  const response = await fetch(`${BASE_URL}${yol}`, {
    method: "POST",
    ...init,
    headers: { ...authHeader(), ...init.headers },
    body: form,
  });
  return yanitiCoz<T>(response, oturumKontrolu);
}
