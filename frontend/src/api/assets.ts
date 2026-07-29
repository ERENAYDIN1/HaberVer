import { authHeader, tokenSil } from "../auth/token";
import type {
  AssetCreateInput,
  AssetFeature,
  AssetFeatureCollection,
  AssetFilters,
  AssetUpdateInput,
  WithinQuery,
} from "../types/asset";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api";

/** Backend'in 422 dogrulama hatalarini okunabilir tek bir mesaja cevirir. */
async function hataMesaji(response: Response): Promise<string> {
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

async function istek<T>(yol: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${yol}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...authHeader(), ...init?.headers },
  });

  if (response.status === 401) {
    // Token suresi dolmus/gecersiz - oturumu temizle, giris ekranina yonlendir.
    tokenSil();
    window.location.href = "/giris";
    throw new Error("Oturum sona erdi, lütfen tekrar giriş yapın");
  }

  if (!response.ok) {
    throw new Error(await hataMesaji(response));
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export function listAssets(filters: AssetFilters = {}) {
  const params = new URLSearchParams();
  if (filters.type) params.set("type", filters.type);
  if (filters.status) params.set("status", filters.status);
  if (filters.source) params.set("source", filters.source);
  const query = params.toString();
  return istek<AssetFeatureCollection>(`/assets${query ? `?${query}` : ""}`);
}

export function createAsset(data: AssetCreateInput) {
  return istek<AssetFeature>("/assets", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateAsset(id: string, data: AssetUpdateInput) {
  return istek<AssetFeature>(`/assets/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function deleteAsset(id: string) {
  return istek<void>(`/assets/${id}`, { method: "DELETE" });
}

export function assetsWithin(query: WithinQuery) {
  return istek<AssetFeatureCollection>("/assets/within", {
    method: "POST",
    body: JSON.stringify(query),
  });
}

/** Varligi 'Tamir Edildi' olarak isaretler (durumu 'iyi'ye ceker). Saha
 *  calisaninin tam duzenleme yetkisi olmadan kullanabildigi tek islem. */
export function repairAsset(id: string) {
  return istek<AssetFeature>(`/assets/${id}/onar`, { method: "POST" });
}
