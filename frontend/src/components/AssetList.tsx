import { useEffect, useRef, useState } from "react";

import { useAuth } from "../auth/AuthContext";
import { useDeleteAsset, useRepairAsset } from "../hooks/useAssets";
import { useIlceler, useMahalleler } from "../hooks/useSinirlar";
import {
  ASSET_STATUSES,
  ASSET_STATUS_LABELS,
  ASSET_TYPES,
} from "../types/asset";
import type {
  AssetFeature,
  AssetFeatureCollection,
  AssetFilters,
} from "../types/asset";
import AssetDetayModal, { useVarlikYonetimi } from "./AssetDetayModal";
import type { EkipOzet } from "../types/saha";
import { ISTANBUL_IL_KODU } from "../utils/istanbulMaskesi";
import TipSecenekleri from "./TipSecenekleri";
import VarlikSatiri from "./VarlikSatiri";
import { IconX } from "./icons";

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
  /** Ilce sinirina gore filtreleme (haritada da vurgulanir). */
  ilceKodu: string | null;
  onIlceSec: (kod: string | null) => void;
  /** Ilce secildiginde kademeli olarak mahalleye kadar filtreleme. */
  mahalleKodu: string | null;
  onMahalleSec: (kod: string | null) => void;
  idariHatasi?: string | null;
  /** Saha ekipleri - bakim bekleyen bir varligin detayindan ekibe yonlendirme
   *  yapilabilsin diye ("İhbarlar > Onaylandı" panelindeki ayni yetenek). */
  ekipler?: EkipOzet[];
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
  ilceKodu,
  onIlceSec,
  mahalleKodu,
  onMahalleSec,
  idariHatasi,
  ekipler,
}: AssetListProps) {
  const { user } = useAuth();
  const tamCrudYetkisi = user?.role !== "saha_calisani";
  const deleteAsset = useDeleteAsset();
  const repairAsset = useRepairAsset();
  const seciliRef = useRef<HTMLLIElement>(null);
  const ilcelerSorgu = useIlceler(ISTANBUL_IL_KODU);
  // Mahalleler yalnizca bir ilce secildiginde getirilir (kademeli filtre).
  const mahallelerSorgu = useMahalleler(ilceKodu);
  const [detayAsset, setDetayAsset] = useState<AssetFeature | null>(null);
  const yonetim = useVarlikYonetimi({
    ekipler,
    onDuzenle,
    detayKapat: () => setDetayAsset(null),
  });

  // Haritadan secim yapildiginda listedeki karti gorunur alana kaydir.
  useEffect(() => {
    seciliRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [seciliId]);

  // Onay artik satirin kendi icinde (SilOnayi) aliniyor - tarayicinin
  // `window.confirm` kutusu kalkti, silme her yerde ayni iki adimla yapiliyor.
  const sil = (asset: AssetFeature) => {
    deleteAsset.mutate(asset.properties.id, {
      onSuccess: () => {
        if (detayAsset?.properties.id === asset.properties.id) setDetayAsset(null);
      },
    });
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
          <TipSecenekleri turler={ASSET_TYPES} />
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

      <div className="flex flex-col gap-2 border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <select
            className={selectClass}
            value={ilceKodu ?? ""}
            onChange={(e) => onIlceSec(e.target.value || null)}
          >
            <option value="">Tüm ilçeler (İstanbul)</option>
            {ilcelerSorgu.data?.map((ilce) => (
              <option key={ilce.kod} value={ilce.kod}>
                {ilce.ad}
              </option>
            ))}
          </select>

          {ilceKodu && (
            <button
              onClick={() => onIlceSec(null)}
              aria-label="İlçe filtresini temizle"
              title="Temizle"
              className="shrink-0 text-slate-400 hover:text-red-600"
            >
              <IconX className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Mahalle secimi yalnizca bir ilce secildiginde gorunur (kademeli). */}
        {ilceKodu && (
          <div className="flex items-center gap-2">
            <select
              className={selectClass}
              value={mahalleKodu ?? ""}
              onChange={(e) => onMahalleSec(e.target.value || null)}
              disabled={mahallelerSorgu.isLoading}
            >
              <option value="">
                {mahallelerSorgu.isLoading ? "Mahalleler yükleniyor…" : "Tüm mahalleler"}
              </option>
              {mahallelerSorgu.data?.map((mahalle) => (
                <option key={mahalle.kod} value={mahalle.kod}>
                  {mahalle.ad}
                </option>
              ))}
            </select>

            {mahalleKodu && (
              <button
                onClick={() => onMahalleSec(null)}
                aria-label="Mahalle filtresini temizle"
                title="Temizle"
                className="shrink-0 text-slate-400 hover:text-red-600"
              >
                <IconX className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {idariHatasi && (
        <p className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">
          {idariHatasi}
        </p>
      )}

      {data && (
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">
          <span>{data.features.length} varlık</span>
          {seciliId && (
            <button
              onClick={() => onSec(seciliId)}
              className="flex items-center gap-1 normal-case text-slate-500 hover:text-red-600"
            >
              <IconX className="h-3 w-3" />
              Seçimi temizle
            </button>
          )}
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
            const id = asset.properties.id;
            const secili = id === seciliId;
            return (
              <VarlikSatiri
                key={id}
                ref={secili ? seciliRef : undefined}
                asset={asset}
                secili={secili}
                onSec={onSec}
                onDetay={setDetayAsset}
                onDuzenle={onDuzenle}
                tamCrudYetkisi={tamCrudYetkisi}
                onTamirEt={(assetId) => repairAsset.mutate(assetId)}
                tamirPending={repairAsset.isPending}
                onSil={sil}
                silPending={deleteAsset.isPending}
              />
            );
          })}
        </ul>
      </div>

      {/* Detay modali "İhbarlar > Onaylandı" listesindekiyle AYNI yetenekleri
          sunar (ekibe yonlendirme dahil): bakim bekleyen bir varlik, hangi
          panelden acildigina gore farkli seyler yapabiliyordu. */}
      <AssetDetayModal
        asset={detayAsset}
        onKapat={() => setDetayAsset(null)}
        {...yonetim}
      />
    </div>
  );
}
