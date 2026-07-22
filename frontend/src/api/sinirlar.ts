import { authHeader } from "../auth/token";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api";

export interface IlOzet {
  kod: string;
  ad: string;
}

export interface IlceOzet {
  kod: string;
  ad: string;
  ilKodu: string;
}

export interface SinirGeometri {
  kod: string;
  ad: string;
  noktalar: [number, number][];
}

async function istek<T>(yol: string): Promise<T> {
  const response = await fetch(`${BASE_URL}${yol}`, { headers: authHeader() });
  if (!response.ok) throw new Error(`İstek başarısız oldu (HTTP ${response.status})`);
  return response.json() as Promise<T>;
}

export function iller() {
  return istek<IlOzet[]>("/sinirlar/iller");
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
