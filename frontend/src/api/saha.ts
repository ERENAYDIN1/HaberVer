import { authHeader } from "../auth/token";
import type { EkipOzet, GorevFeatureCollection } from "../types/saha";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api";

async function hataMesaji(response: Response): Promise<string> {
  try {
    const body = await response.json();
    if (typeof body.detail === "string") return body.detail;
    if (Array.isArray(body.detail)) {
      return body.detail.map((d: { msg: string }) => d.msg).join(" · ");
    }
  } catch {
    // yoksay
  }
  return `İstek başarısız oldu (HTTP ${response.status})`;
}

async function istekJson<T>(yol: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${yol}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...authHeader(), ...init?.headers },
  });
  if (!response.ok) throw new Error(await hataMesaji(response));
  return response.json() as Promise<T>;
}

/** Yalniz durum kodu doner (204 gibi); govde beklenmez. */
async function istekBos(yol: string, init?: RequestInit): Promise<void> {
  const response = await fetch(`${BASE_URL}${yol}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...authHeader(), ...init?.headers },
  });
  if (!response.ok) throw new Error(await hataMesaji(response));
}

/** Saha calisani son konumunu bildirir. */
export function konumGuncelle(longitude: number, latitude: number) {
  return istekBos("/saha/konum", {
    method: "POST",
    body: JSON.stringify({ longitude, latitude }),
  });
}

/** Giris yapan saha ekibinin aktif gorevleri. */
export function gorevlerim() {
  return istekJson<GorevFeatureCollection>("/saha/gorevlerim");
}

/** Personel: tum saha ekiplerinin konum + yuk ozeti. */
export function ekipler() {
  return istekJson<EkipOzet[]>("/saha/ekipler");
}

/** Personel: bir bakim varligini elle bir ekibe (yeniden) yonlendirir. */
export function ekibeAta(asset_id: string, worker_id: string) {
  return istekBos("/saha/ata", {
    method: "POST",
    body: JSON.stringify({ asset_id, worker_id }),
  });
}
