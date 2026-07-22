import { useEffect, useRef, useState, type ReactElement } from "react";

import { fotoUrl } from "../api/reports";
import { useAuth } from "../auth/AuthContext";
import { useDeleteAsset, useRepairAsset } from "../hooks/useAssets";
import { useIlceler, useIller } from "../hooks/useSinirlar";
import {
  ASSET_SOURCE_LABELS,
  ASSET_SOURCES,
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
import AssetDetayModal from "./AssetDetayModal";
import { IconBench, IconInbox, IconLamp, IconPin, IconTree, IconX } from "./icons";

const TIP_IKONU: Record<string, (props: { className?: string }) => ReactElement> = {
  agac: IconTree,
  bank: IconBench,
  direk: IconLamp,
};

const selectClass =
  "flex-1 border border-slate-300 bg-white px-2 py-1.5 text-xs focus:border-emerald-500 focus:outline-none";

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
  /** Il/ilce sinirina gore filtreleme (haritada da vurgulanir). */
  ilKodu: string | null;
  ilceKodu: string | null;
  onIlSec: (kod: string | null) => void;
  onIlceSec: (kod: string | null) => void;
  idariHatasi?: string | null;
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
  ilKodu,
  ilceKodu,
  onIlSec,
  onIlceSec,
  idariHatasi,
}: AssetListProps) {
  const { user } = useAuth();
  const tamCrudYetkisi = user?.role !== "saha_calisani";
  const deleteAsset = useDeleteAsset();
  const repairAsset = useRepairAsset();
  const seciliRef = useRef<HTMLLIElement>(null);
  const illerSorgu = useIller();
  const ilcelerSorgu = useIlceler(ilKodu);
  const [detayAsset, setDetayAsset] = useState<AssetFeature | null>(null);

  // Kaynak (kayitli/ihbar) hic secilmemisse varsayilan olarak "kayitli" kabul
  // edilir - iki kaynak birbirine karismasin diye her zaman bir sekme aktiftir.
  const aktifKaynak = filters.source ?? "kayitli";

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
      {/* Kayitli varliklar / ihbardan gelenler - birbirine karismasin diye
          ayri sekmeler, ayni anda sadece biri gorunur. */}
      <div className="flex border-b border-slate-300 bg-slate-50">
        {ASSET_SOURCES.map((s) => (
          <button
            key={s}
            onClick={() => onFiltersChange({ ...filters, source: s })}
            className={`flex flex-1 items-center justify-center gap-1.5 border-b-2 px-3 py-2 text-[13px] font-medium transition ${
              aktifKaynak === s
                ? "border-emerald-600 bg-white text-slate-900"
                : "border-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            }`}
          >
            {s === "ihbar" && <IconInbox className="h-3.5 w-3.5" />}
            {ASSET_SOURCE_LABELS[s]}
          </button>
        ))}
      </div>

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

      <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
        <select
          className={selectClass}
          value={ilKodu ?? ""}
          onChange={(e) => onIlSec(e.target.value || null)}
        >
          <option value="">İl seç</option>
          {illerSorgu.data?.map((il) => (
            <option key={il.kod} value={il.kod}>
              {il.ad}
            </option>
          ))}
        </select>

        <select
          className={selectClass}
          value={ilceKodu ?? ""}
          onChange={(e) => onIlceSec(e.target.value || null)}
          disabled={!ilKodu}
        >
          <option value="">
            {ilKodu ? "Tüm ilçeler" : "Önce il seçin"}
          </option>
          {ilcelerSorgu.data?.map((ilce) => (
            <option key={ilce.kod} value={ilce.kod}>
              {ilce.ad}
            </option>
          ))}
        </select>

        {ilKodu && (
          <button
            onClick={() => {
              onIlSec(null);
              onIlceSec(null);
            }}
            aria-label="İl/ilçe filtresini temizle"
            title="Temizle"
            className="shrink-0 text-slate-400 hover:text-red-600"
          >
            <IconX className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {idariHatasi && (
        <p className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">
          {idariHatasi}
        </p>
      )}

      {data && (
        <div className="border-b border-slate-100 bg-slate-50 px-4 py-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">
          {data.features.length} varlık
        </div>
      )}

      {deleteAsset.isError && (
        <p className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">
          {deleteAsset.error.message}
        </p>
      )}
      {repairAsset.isError && (
        <p className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">
          {repairAsset.error.message}
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading && <p className="p-3 text-sm text-slate-500">Yükleniyor...</p>}
        {isError && (
          <p className="p-3 text-sm text-red-600">{error?.message}</p>
        )}
        {data?.features.length === 0 && (
          <p className="p-6 text-center text-sm text-slate-500">
            Bu filtrelere uyan varlık yok.
          </p>
        )}

        <ul className="divide-y divide-slate-100">
          {data?.features.map((asset) => {
            const { id, name, type, status, brand_model, photo_url } =
              asset.properties;
            const [lng, lat] = asset.geometry.coordinates;
            const secili = id === seciliId;
            const bakim = status === "bakim_lazim";
            const TipIkonu = TIP_IKONU[type] ?? IconPin;

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
                  className={`w-full cursor-pointer border-l-2 px-4 py-2.5 text-left transition ${
                    secili
                      ? "border-emerald-600 bg-emerald-50"
                      : "border-transparent hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    {photo_url ? (
                      <img
                        src={fotoUrl(photo_url) ?? undefined}
                        alt=""
                        className="h-6 w-6 shrink-0 border border-slate-200 object-cover"
                      />
                    ) : (
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center border border-slate-200 bg-slate-50 text-slate-500">
                        <TipIkonu className="h-3.5 w-3.5" />
                      </span>
                    )}
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
                          className={`inline-flex items-center gap-1 border px-1.5 py-0.5 text-[11px] font-medium ${
                            bakim
                              ? "border-amber-300 bg-amber-50 text-amber-800"
                              : "border-emerald-300 bg-emerald-50 text-emerald-800"
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              bakim ? "bg-amber-500" : "bg-emerald-500"
                            }`}
                          />
                          {ASSET_STATUS_LABELS[status]}
                        </span>
                        <span className="font-mono text-[11px] text-slate-400">
                          {lng.toFixed(4)}, {lat.toFixed(4)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {secili && (
                    <div className="mt-2 flex gap-3 pl-[34px]">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDetayAsset(asset);
                        }}
                        className="text-xs font-medium text-slate-600 hover:underline"
                      >
                        Detay
                      </button>
                      {bakim && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            repairAsset.mutate(id);
                          }}
                          disabled={repairAsset.isPending}
                          className="text-xs font-medium text-emerald-700 hover:underline disabled:opacity-50"
                        >
                          Tamir Edildi
                        </button>
                      )}
                      {tamCrudYetkisi && (
                        <>
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
                        </>
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <AssetDetayModal asset={detayAsset} onKapat={() => setDetayAsset(null)} />
    </div>
  );
}
