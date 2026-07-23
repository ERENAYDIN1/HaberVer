import { authHeader } from "../auth/token";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api";

export interface IlceOzet {
  kod: string;
  ad: string;
  ilKodu: string;
}

export interface MahalleOzet {
  kod: string;
  ad: string;
  ilceKodu: string;
}

export interface SinirGeometri {
  kod: string;
  ad: string;
  /** Halka listesi (MultiPolygon parcalari) - Bogaz'la ikiye bolunmus il
   *  sinirlari veya tamamen adalardan olusan ilceler icin birden fazla halka
   *  olabilir. Tek parcali sinirlarda tek elemanli bir liste olur. */
  noktalar: [number, number][][];
}

async function istek<T>(yol: string): Promise<T> {
  const response = await fetch(`${BASE_URL}${yol}`, { headers: authHeader() });
  if (!response.ok) throw new Error(`İstek başarısız oldu (HTTP ${response.status})`);
  return response.json() as Promise<T>;
}

export function ilceler(ilKodu: string) {
  return istek<IlceOzet[]>(`/sinirlar/ilceler?il=${ilKodu}`);
}

export function ilSiniri(kod: string) {
  return istek<SinirGeometri>(`/sinirlar/il/${kod}`);
}

export function ilceSiniri(kod: string) {
  return istek<SinirGeometri>(`/sinirlar/ilce/${kod}`);
}

export function mahalleler(ilceKodu: string) {
  return istek<MahalleOzet[]>(`/sinirlar/mahalleler?ilce=${ilceKodu}`);
}

export function mahalleSiniri(kod: string) {
  return istek<SinirGeometri>(`/sinirlar/mahalle/${kod}`);
}

export interface KonumAdi {
  kod: string;
  ad: string;
}

export interface KonumCozumu {
  ilce: KonumAdi | null;
  mahalle: KonumAdi | null;
}

/** Bir koordinatin dustugu Istanbul ilce/mahallesini cozumler. */
export function konumCozumle(lat: number, lon: number) {
  return istek<KonumCozumu>(`/sinirlar/konum?lat=${lat}&lon=${lon}`);
}

/** Birden fazla koordinati tek istekte cozumler; sonuc girisle ayni sirada. */
export async function konumCozumleToplu(
  noktalar: [number, number][]
): Promise<KonumCozumu[]> {
  const response = await fetch(`${BASE_URL}/sinirlar/konum/toplu`, {
    method: "POST",
    headers: { ...authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({ noktalar }),
  });
  if (!response.ok) throw new Error(`İstek başarısız oldu (HTTP ${response.status})`);
  return response.json() as Promise<KonumCozumu[]>;
}
