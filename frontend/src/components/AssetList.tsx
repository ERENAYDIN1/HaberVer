import { useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "../auth/AuthContext";
import { useDeleteAsset, useRepairAsset } from "../hooks/useAssets";
import {
  useDepartmanlar,
  useTurDepartmanEslemesi,
} from "../hooks/useDepartmanlar";
import { useIlceler, useMahalleler } from "../hooks/useSinirlar";
import { departmanBul, departmanTurleri } from "../types/departman";
import {
  ASSET_STATUSES,
  ASSET_STATUS_LABELS,
  ASSET_TYPES,
} from "../types/asset";
import type {
  AssetFeature,
  AssetFeatureCollection,
  AssetStatus,
  AssetType,
} from "../types/asset";
import AssetDetayModal, { useVarlikYonetimi } from "./AssetDetayModal";
import type { EkipOzet } from "../types/saha";
import { ISTANBUL_IL_KODU } from "../utils/istanbulMaskesi";
import TipSecenekleri from "./TipSecenekleri";
import VarlikSatiri from "./VarlikSatiri";
import { IconX } from "./icons";

const selectClass =
  "flex-1 border border-slate-300 bg-white px-2 py-1.5 text-xs focus:border-emerald-500 focus:outline-none";

/** Acilirlar tekil secer, lejant kutucuklari coklu - ikisi AYNI state'i
 *  paylastigi icin acilirin gosteremeyecegi bir ara durum olusabilir (orn.
 *  lejanttan 3 tur isaretli). O durumda acilir bu sentetik degeri gosterir;
 *  secilmesi bir sey degistirmez (zaten mevcut durum), kullanici "Tüm tipler"e
 *  ya da tekil bir tipe donerek cikar. */
const KARISIK = "__karisik";

/** Isaretli anahtar sayisina gore acilirin gostermesi gereken deger:
 *  hepsi acik -> "" ("Tüm ..."), tek acik -> o anahtar, aksi halde KARISIK. */
function acilirDegeri<K extends string>(
  anahtarlar: readonly K[],
  secili: Record<K, boolean>
): string {
  const acik = anahtarlar.filter((a) => secili[a]);
  if (acik.length === anahtarlar.length) return "";
  if (acik.length === 1) return acik[0];
  return KARISIK;
}

/** KARISIK durumda acilirda gorunen metin - "hiçbiri" ayri yazilir, yoksa
 *  "0 tip seçili" gibi tuhaf bir ifade cikiyordu. */
function karisikEtiketi(acikSayisi: number, ad: string): string {
  return acikSayisi === 0 ? `Hiçbir ${ad} seçili değil` : `${acikSayisi} ${ad} seçili`;
}

interface AssetListProps {
  data?: AssetFeatureCollection;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  /** Tur/durum filtresi: haritadaki lejantla PAYLASILAN state (bkz. App.tsx).
   *  Buradaki acilir tekil secer (= yalnizca o kutucuk), lejant coklu secer;
   *  ikisi de ayni durumu yazdigi icin biri digerini sifirlamaz. */
  turler: Record<AssetType, boolean>;
  onTurSec: (tur: AssetType | null) => void;
  /** Departman filtresi: bir departman = bir tur kumesi oldugu icin AYRI BIR
   *  STATE DEGIL, ayni tur kutucuklarina yazilir (bkz. useKatmanlar). */
  onDepartmanSec: (turler: readonly AssetType[] | null) => void;
  durumlar: Record<AssetStatus, boolean>;
  onDurumSec: (durum: AssetStatus | null) => void;
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
   *  yapilabilsin diye ("Talepler > Onaylandı" panelindeki ayni yetenek). */
  ekipler?: EkipOzet[];
  /** Detay modalindaki "Konuma Git" - haritayi varligin konumuna ucurur. */
  onVarligaGit?: (asset: AssetFeature) => void;
}

export default function AssetList({
  data,
  isLoading,
  isError,
  error,
  turler,
  onTurSec,
  onDepartmanSec,
  durumlar,
  onDurumSec,
  seciliId,
  onSec,
  onDuzenle,
  ilceKodu,
  onIlceSec,
  mahalleKodu,
  onMahalleSec,
  idariHatasi,
  ekipler,
  onVarligaGit,
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
    onGit: onVarligaGit,
    detayKapat: () => setDetayAsset(null),
  });

  // Acilirlarin gosterecegi deger, paylasilan filtre state'inden turetilir -
  // lejanttan yapilan degisiklik buraya da aninda yansir.
  const tipDegeri = acilirDegeri(ASSET_TYPES, turler);
  const durumDegeri = acilirDegeri(ASSET_STATUSES, durumlar);
  const acikTipSayisi = ASSET_TYPES.filter((t) => turler[t]).length;

  // Departman filtresi yalnizca ADMIN'e gosterilir: diger personelin listesi
  // zaten backend'de kendi mudurluguyle sinirli, filtre tek secenekli olurdu.
  // Onlara bunun yerine "hangi mudurlugu goruyorsunuz" rozeti gosterilir.
  const adminMi = user?.role === "admin";
  const { data: departmanlar } = useDepartmanlar();
  const { data: esleme } = useTurDepartmanEslemesi();
  const kendiDepartmani = departmanBul(departmanlar, user?.departman);
  // Acilirin gosterecegi deger tur kutucuklarindan TURETILIR: lejanttan tek
  // tur kapatilinca filtre sessizce "yanlis departman" gostermesin.
  const seciliDepartman = useMemo(() => {
    if (!esleme || !adminMi) return "";
    const acik = ASSET_TYPES.filter((t) => turler[t]);
    if (acik.length === ASSET_TYPES.length) return "";
    const kodlar = new Set(acik.map((t) => esleme[t]));
    if (kodlar.size !== 1) return "";
    const kod = [...kodlar][0];
    if (!kod) return "";
    const tamKume = departmanTurleri(esleme, kod);
    return tamKume.length === acik.length ? kod : "";
  }, [esleme, turler, adminMi]);
  const acikDurumSayisi = ASSET_STATUSES.filter((s) => durumlar[s]).length;

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
      {/* Admin: departman filtresi. Diger personel: kapsam rozeti - listenin
          neden dar oldugu ekranda yazili olmali, "eksik veri" sanilmasin. */}
      {adminMi ? (
        <div className="border-b border-slate-200 px-4 py-3">
          <select
            className={selectClass}
            value={seciliDepartman}
            onChange={(e) => {
              const kod = e.target.value;
              onDepartmanSec(kod ? departmanTurleri(esleme, kod) : null);
            }}
          >
            <option value="">Tüm departmanlar</option>
            {(departmanlar ?? []).map((d) => (
              <option key={d.kod} value={d.kod}>
                {d.ad}
              </option>
            ))}
          </select>
        </div>
      ) : (
        kendiDepartmani && (
          <p
            className="border-b border-slate-200 px-4 py-2 text-[11px]"
            style={{ color: kendiDepartmani.renk }}
          >
            <span className="font-medium">{kendiDepartmani.ad}</span>
            <span className="text-slate-400"> · yalnızca bu müdürlüğün kayıtları</span>
          </p>
        )
      )}

      <div className="flex gap-2 border-b border-slate-200 px-4 py-3">
        <select
          className={selectClass}
          value={tipDegeri}
          onChange={(e) => {
            const v = e.target.value;
            if (v !== KARISIK) onTurSec((v || null) as AssetType | null);
          }}
        >
          <option value="">Tüm tipler</option>
          {tipDegeri === KARISIK && (
            <option value={KARISIK}>{karisikEtiketi(acikTipSayisi, "tip")}</option>
          )}
          <TipSecenekleri turler={ASSET_TYPES} />
        </select>

        <select
          className={selectClass}
          value={durumDegeri}
          onChange={(e) => {
            const v = e.target.value;
            if (v !== KARISIK) onDurumSec((v || null) as AssetStatus | null);
          }}
        >
          <option value="">Tüm durumlar</option>
          {durumDegeri === KARISIK && (
            <option value={KARISIK}>{karisikEtiketi(acikDurumSayisi, "durum")}</option>
          )}
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

      {/* Detay modali "Talepler > Onaylandı" listesindekiyle AYNI yetenekleri
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
