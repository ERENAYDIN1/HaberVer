import type {
  AssetCreateInput,
  AssetFeature,
  AssetFeatureCollection,
  AssetFilters,
  AssetUpdateInput,
  WithinQuery,
} from "../types/asset";
import { istek } from "./http";

export function listAssets(filters: AssetFilters = {}) {
  const params = new URLSearchParams();
  if (filters.type) params.set("type", filters.type);
  if (filters.status) params.set("status", filters.status);
  if (filters.source) params.set("source", filters.source);
  const query = params.toString();
  return istek<AssetFeatureCollection>(`/assets${query ? `?${query}` : ""}`);
}

/** Tek bir varligi id ile ceker. Haritadaki ekip popup'indan bir ise
 *  tiklandiginda kullanilir: o varlik o an ekrandaki listelerde olmayabilir
 *  (baska filtre/sekme acik olabilir) ve durumu her halukarda taze olmali. */
export function getAsset(id: string) {
  return istek<AssetFeature>(`/assets/${id}`);
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
