import { useEffect, useRef } from "react";

import { useDeleteAsset } from "../hooks/useAssets";
import {
  ASSET_STATUSES,
  ASSET_STATUS_LABELS,
  ASSET_TYPES,
  ASSET_TYPE_LABELS,
} from "../types/asset";
import type {
  AssetFeature,
  AssetFeatureCollection,
  AssetFilters,
} from "../types/asset";

const TIP_IKONU: Record<string, string> = {
  agac: "🌳",
  bank: "🪑",
  direk: "💡",
};

const selectClass =
  "flex-1 rounded border border-slate-300 px-2 py-1.5 text-xs focus:border-emerald-500 focus:outline-none";

interface AssetListProps {
  data?: AssetFeatureCollection;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  filters: AssetFilters;
  onFiltersChange: (f: AssetFilters) => void;
  seciliId: string | null;
  onSec: (id: string) => void;
  onDuzenle: (asset: AssetFeature) => void;
}

export default function AssetList({
  data,
  isLoading,
  isError,
  error,
  filters,
  onFiltersChange,
  seciliId,
  onSec,
  onDuzenle,
}: AssetListProps) {
  const deleteAsset = useDeleteAsset();
  const seciliRef = useRef<HTMLLIElement>(null);

  // Haritadan secim yapildiginda listedeki karti gorunur alana kaydir.
  useEffect(() => {
    seciliRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [seciliId]);

  const sil = (asset: AssetFeature) => {
    if (window.confirm(`"${asset.properties.name}" silinsin mi?`)) {
      deleteAsset.mutate(asset.properties.id);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex gap-2 border-b border-slate-200 px-4 py-3">
        <select
          className={selectClass}
          value={filters.type ?? ""}
          onChange={(e) =>
            onFiltersChange({
              ...filters,
              type: (e.target.value || undefined) as AssetFilters["type"],
            })
          }
        >
          <option value="">Tüm tipler</option>
          {ASSET_TYPES.map((t) => (
            <option key={t} value={t}>
              {ASSET_TYPE_LABELS[t]}
            </option>
          ))}
        </select>

        <select
          className={selectClass}
          value={filters.status ?? ""}
          onChange={(e) =>
            onFiltersChange({
              ...filters,
              status: (e.target.value || undefined) as AssetFilters["status"],
            })
          }
        >
          <option value="">Tüm durumlar</option>
          {ASSET_STATUSES.map((s) => (
            <option key={s} value={s}>
              {ASSET_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>

      {data && (
        <p className="px-4 pt-3 text-xs text-slate-500">
          {data.features.length} varlık
        </p>
      )}

      {deleteAsset.isError && (
        <p className="mx-4 mt-2 rounded bg-red-50 px-3 py-2 text-xs text-red-700">
          {deleteAsset.error.message}
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {isLoading && <p className="p-3 text-sm text-slate-500">Yükleniyor...</p>}
        {isError && (
          <p className="p-3 text-sm text-red-600">{error?.message}</p>
        )}
        {data?.features.length === 0 && (
          <p className="p-6 text-center text-sm text-slate-500">
            Bu filtrelere uyan varlık yok.
          </p>
        )}

        <ul className="space-y-1.5">
          {data?.features.map((asset) => {
            const { id, name, type, status, brand_model } = asset.properties;
            const [lng, lat] = asset.geometry.coordinates;
            const secili = id === seciliId;
            const bakim = status === "bakim_lazim";

            return (
              <li key={id} ref={secili ? seciliRef : undefined}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => onSec(id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSec(id);
                    }
                  }}
                  className={`w-full cursor-pointer rounded-lg border px-3 py-2.5 text-left transition ${
                    secili
                      ? "border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-lg leading-none">
                      {TIP_IKONU[type] ?? "📍"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800">
                        {name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {ASSET_TYPE_LABELS[type]}
                        {brand_model ? ` · ${brand_model}` : ""}
                      </p>
                      <div className="mt-1.5 flex items-center gap-2">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${
                            bakim
                              ? "bg-amber-100 text-amber-800"
                              : "bg-emerald-100 text-emerald-800"
                          }`}
                        >
                          {ASSET_STATUS_LABELS[status]}
                        </span>
                        <span className="font-mono text-[11px] text-slate-400">
                          {lng.toFixed(4)}, {lat.toFixed(4)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {secili && (
                    <div className="mt-2 flex gap-3 border-t border-emerald-200 pt-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDuzenle(asset);
                        }}
                        className="text-xs font-medium text-emerald-700 hover:underline"
                      >
                        Düzenle
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          sil(asset);
                        }}
                        disabled={deleteAsset.isPending}
                        className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
                      >
                        Sil
                      </button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
