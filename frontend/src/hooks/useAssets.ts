import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createAsset,
  deleteAsset,
  listAssets,
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
  return useMutation({
    mutationFn: (id: string) => deleteAsset(id),
    onSuccess: invalidate,
  });
}
