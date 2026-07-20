import { useState } from "react";

import { useAssets, useDeleteAsset } from "../hooks/useAssets";
import {
  ASSET_STATUSES,
  ASSET_STATUS_LABELS,
  ASSET_TYPES,
  ASSET_TYPE_LABELS,
} from "../types/asset";
import type { AssetFeature, AssetFilters } from "../types/asset";
import AssetForm from "./AssetForm";
import Modal from "./Modal";

function StatusRozet({ asset }: { asset: AssetFeature }) {
  const bakimGerekli = asset.properties.status === "bakim_lazim";
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${
        bakimGerekli
          ? "bg-amber-100 text-amber-800"
          : "bg-emerald-100 text-emerald-800"
      }`}
    >
      {ASSET_STATUS_LABELS[asset.properties.status]}
    </span>
  );
}

const selectClass =
  "rounded border border-slate-300 px-2 py-1 text-sm focus:border-emerald-500 focus:outline-none";

export default function AssetTable() {
  const [filters, setFilters] = useState<AssetFilters>({});
  const [duzenlenen, setDuzenlenen] = useState<AssetFeature | null>(null);

  const { data, isLoading, isError, error } = useAssets(filters);
  const deleteAsset = useDeleteAsset();

  const sil = (asset: AssetFeature) => {
    if (window.confirm(`"${asset.properties.name}" silinsin mi?`)) {
      deleteAsset.mutate(asset.properties.id);
    }
  };

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-800">
          Kayıtlı Varlıklar
          {data && (
            <span className="ml-2 text-sm font-normal text-slate-500">
              ({data.features.length})
            </span>
          )}
        </h2>

        <div className="flex gap-2">
          <select
            className={selectClass}
            value={filters.type ?? ""}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                type: (e.target.value || undefined) as AssetFilters["type"],
              }))
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
              setFilters((f) => ({
                ...f,
                status: (e.target.value || undefined) as AssetFilters["status"],
              }))
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
      </div>

      {isLoading && <p className="text-sm text-slate-500">Yükleniyor...</p>}
      {isError && <p className="text-sm text-red-600">{(error as Error).message}</p>}

      {deleteAsset.isError && (
        <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          {deleteAsset.error.message}
        </p>
      )}

      {data && data.features.length === 0 && (
        <p className="py-6 text-center text-sm text-slate-500">
          Bu filtrelere uyan varlık yok.
        </p>
      )}

      {data && data.features.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <th className="pb-2 pr-3 font-medium">İsim</th>
                <th className="pb-2 pr-3 font-medium">Tip</th>
                <th className="pb-2 pr-3 font-medium">Durum</th>
                <th className="pb-2 pr-3 font-medium">Koordinat</th>
                <th className="pb-2 pr-3 font-medium">Kurulum</th>
                <th className="pb-2 font-medium">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {data.features.map((asset) => {
                const { id, name, type, install_date } = asset.properties;
                const [lng, lat] = asset.geometry.coordinates;
                return (
                  <tr key={id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-3 font-medium text-slate-800">{name}</td>
                    <td className="py-2 pr-3 text-slate-600">
                      {ASSET_TYPE_LABELS[type]}
                    </td>
                    <td className="py-2 pr-3">
                      <StatusRozet asset={asset} />
                    </td>
                    <td className="whitespace-nowrap py-2 pr-3 font-mono text-xs text-slate-500">
                      {lng.toFixed(4)}, {lat.toFixed(4)}
                    </td>
                    <td className="whitespace-nowrap py-2 pr-3 text-slate-500">
                      {install_date ?? "—"}
                    </td>
                    <td className="whitespace-nowrap py-2">
                      <button
                        onClick={() => setDuzenlenen(asset)}
                        className="mr-2 text-xs font-medium text-emerald-700 hover:underline"
                      >
                        Düzenle
                      </button>
                      <button
                        onClick={() => sil(asset)}
                        disabled={deleteAsset.isPending}
                        className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
                      >
                        Sil
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        acik={duzenlenen !== null}
        baslik="Varlığı Düzenle"
        onKapat={() => setDuzenlenen(null)}
      >
        {duzenlenen && (
          <AssetForm
            // key: farkli bir satir secildiginde form yeniden kurulsun
            key={duzenlenen.properties.id}
            asset={duzenlenen}
            onDone={() => setDuzenlenen(null)}
          />
        )}
      </Modal>
    </section>
  );
}
