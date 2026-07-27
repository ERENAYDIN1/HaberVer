import { authHeader } from "../auth/token";
import type {
  AktifGorevBilgi,
  EkipGorevleri,
  EkipOzet,
  GorevFeatureCollection,
  HavuzVarlik,
} from "../types/saha";

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

/** Giris yapan saha ekibinin yakinda tamamladigi gorevler ('Tamamlanan İşler'). */
export function tamamlananlarim() {
  return istekJson<GorevFeatureCollection>("/saha/tamamlananlarim");
}

/** Saha ekibi yanlislikla tamamladigi bir gorevi geri alir (yeniden bakim). */
export function tamamlananiGeriAl(assignment_id: string) {
  return istekBos("/saha/tamamlanan-geri-al", {
    method: "POST",
    body: JSON.stringify({ assignment_id }),
  });
}

/** Personel: tum saha ekiplerinin konum + yuk ozeti. */
export function ekipler() {
  return istekJson<EkipOzet[]>("/saha/ekipler");
}

/** Personel yonetim panosu: her ekip + kendine dusen aktif gorevler. */
export function ekipGorevleri() {
  return istekJson<EkipGorevleri[]>("/saha/ekip-gorevleri");
}

/** Personel: havuzda bekleyen (atanmamis) bakim varliklari. */
export function havuz() {
  return istekJson<HavuzVarlik[]>("/saha/havuz");
}

/** Personel: bir bakim varligini elle bir ekibe (yeniden) yonlendirir. */
export function ekibeAta(asset_id: string, worker_id: string) {
  return istekBos("/saha/ata", {
    method: "POST",
    body: JSON.stringify({ asset_id, worker_id }),
  });
}

/** Personel: bir varligin o an atali oldugu ekip bilgisi (havuzdaysa null). */
export function gorevDurumu(asset_id: string) {
  return istekJson<AktifGorevBilgi | null>(`/saha/gorev/${asset_id}`);
}

/** Personel: bir varligin aktif gorevini iptal edip havuza geri alir. */
export function gorevGeriAl(asset_id: string) {
  return istekBos("/saha/geri-al", {
    method: "POST",
    body: JSON.stringify({ asset_id }),
  });
}
