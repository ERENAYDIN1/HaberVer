import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createAsset,
  deleteAsset,
  listAssets,
  repairAsset,
  updateAsset,
} from "../api/assets";
import type {
  AssetCreateInput,
  AssetFilters,
  AssetUpdateInput,
} from "../types/asset";

const ASSETS_KEY = ["assets"] as const;

export function useAssets(filters: AssetFilters = {}) {
  return useQuery({
    queryKey: [...ASSETS_KEY, filters],
    queryFn: () => listAssets(filters),
  });
}

/** Ekleme/guncelleme/silme sonrasi listeyi tazeler. */
function useAssetsInvalidator() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ASSETS_KEY });
}

/** Varligin durumunu degistiren islemler (tamir/silme) ayni zamanda GOREV
 *  tablosunu da degistirir: tamir aktif gorevi kapatir, kapasite acilinca havuz
 *  yeniden dagitilir. Bu yuzden "saha" sorgulari (ekip yukleri, ekip gorev
 *  listeleri, havuz) da tazelenir - yoksa haritadaki ekip rozeti/popup'i bir
 *  sonraki periyodik cekime kadar bitmis isi gostermeye devam ediyordu. */
function useSahaInvalidator() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["saha"] });
}

export function useCreateAsset() {
  const invalidate = useAssetsInvalidator();
  return useMutation({
    mutationFn: (data: AssetCreateInput) => createAsset(data),
    onSuccess: invalidate,
  });
}

export function useUpdateAsset() {
  const invalidate = useAssetsInvalidator();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: AssetUpdateInput }) =>
      updateAsset(id, data),
    onSuccess: invalidate,
  });
}

export function useDeleteAsset() {
  const invalidate = useAssetsInvalidator();
  const sahaTazele = useSahaInvalidator();
  return useMutation({
    mutationFn: (id: string) => deleteAsset(id),
    onSuccess: () => {
      invalidate();
      sahaTazele();
    },
  });
}

export function useRepairAsset() {
  const invalidate = useAssetsInvalidator();
  const sahaTazele = useSahaInvalidator();
  return useMutation({
    mutationFn: (id: string) => repairAsset(id),
    onSuccess: () => {
      invalidate();
      sahaTazele();
    },
  });
}
