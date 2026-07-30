import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import {
  approveReport,
  listReports,
  rejectReport,
  reopenReport,
} from "../api/reports";
import { useAuth } from "../auth/AuthContext";
import { useDeleteAsset, useRepairAsset } from "../hooks/useAssets";
import {
  TAMIR_SAKLAMA_GUN,
  type AssetFeature,
  type AssetFeatureCollection,
} from "../types/asset";
import { REPORT_STATUSES, type ReportFeature, type ReportStatus } from "../types/report";
import type { EkipOzet } from "../types/saha";
import AssetDetayModal, { useVarlikYonetimi } from "./AssetDetayModal";
import AssetForm from "./AssetForm";
import IhbarSatiri from "./IhbarSatiri";
import Modal from "./Modal";
import VarlikSatiri from "./VarlikSatiri";

interface IhbarVarlikSorguSonucu {
  data?: AssetFeatureCollection;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
}

/** Durum sekmelerinde kullanilan kisa etiketler - REPORT_STATUS_LABELS'daki
 *  tam metinler ("Bekleyen İhbar" gibi) sekme genisligini esitsiz yapiyordu;
 *  burada uc sekme de ayni (kisa) uzunlukta olacak sekilde ayrica tanimlanir. */
/** Sabit bos liste: "Onaylandı" sekmesinde (ve veri gelmeden once) ust bilesene
 *  bildirilen deger her render'da yeni bir dizi olmasin - aksi halde
 *  onIhbarlarChange efekti kendini surekli tetikler. */
const BOS_IHBARLAR: ReportFeature[] = [];

const SEKME_ETIKETLERI: Record<ReportStatus, string> = {
  beklemede: "Bekleyen",
  onaylandi: "Onaylandı",
  reddedildi: "Reddedildi",
};

interface IhbarPaneliProps {
  /** Durum sekmesi (Bekleyen İhbar/Onaylandı/Reddedildi) - App.tsx'te tutulur;
   *  boylece bir bakim bildirimine tiklaninca dogrudan "onaylandi"ya gecilebilir
   *  ve harita, o an ham ihbar noktalarini mi yoksa onaylanmis ihbarlardan
   *  olusan varliklari mi gosterecegini bilir. */
  durum: ReportStatus;
  onDurumChange: (d: ReportStatus) => void;
  /** Bir ihbar onaylanip varliga donusunce ana varlik listesini tazelemek icin. */
  onVarlikOlustu?: () => void;
  /** Yuklenen (ham) ihbarlar degisince ust bilesene bildirir (haritada gostermek icin). */
  onIhbarlarChange?: (ihbarlar: ReportFeature[]) => void;
  /** Bekleyen/Reddedildi sekmelerinde haritada vurgulanacak secili ihbarin id'si. */
  seciliRaporId?: string | null;
  onRaporSec?: (id: string) => void;
  /** Onaylanmis ihbarlardan olusan varliklar - App.tsx zaten haritada gostermek
   *  icin bu sorguyu tutuyor, burada tekrar cekmek yerine ayni veri kullanilir. */
  ihbarVarlikSorgu: IhbarVarlikSorguSonucu;
  /** "Onaylandı" sekmesindeki bir varliga tiklaninca - normal varlik
   *  secimiyle (harita + detay karti) ayni kanali kullanir. */
  seciliVarlikId?: string | null;
  onVarlikSec: (id: string) => void;
  /** Saha ekipleri - "Onaylandı" listesindeki bir varligin detayindan da ekibe
   *  atama/atanan ekibi degistirme yapilabilsin diye (haritadaki isaretcinin
   *  "Yönet" dugmesiyle ayni yetenek). */
  ekipler?: EkipOzet[];
}

export default function IhbarPaneli({
  durum,
  onDurumChange,
  onVarlikOlustu,
  onIhbarlarChange,
  seciliRaporId,
  onRaporSec,
  ihbarVarlikSorgu,
  seciliVarlikId,
  onVarlikSec,
  ekipler,
}: IhbarPaneliProps) {
  const { user } = useAuth();
  const tamCrudYetkisi = user?.role !== "saha_calisani";
  const deleteAsset = useDeleteAsset();
  const repairAsset = useRepairAsset();
  const [duzenlenen, setDuzenlenen] = useState<AssetFeature | null>(null);
  const [detayAsset, setDetayAsset] = useState<AssetFeature | null>(null);
  const seciliVarlikRef = useRef<HTMLLIElement>(null);
  // "Varlıklar" panelindekiyle ayni yonetim kumesi (bkz. useVarlikYonetimi).
  const yonetim = useVarlikYonetimi({
    ekipler,
    onDuzenle: setDuzenlenen,
    detayKapat: () => setDetayAsset(null),
  });

  const queryClient = useQueryClient();
  const [islemHatasi, setIslemHatasi] = useState<string | null>(null);
  const [islemdeki, setIslemdeki] = useState<string | null>(null);

  // Ihbar listesi ARTIK react-query uzerinden: App'teki harita/lejant sorgulari
  // ("reports" onekli) ile AYNI onbellegi paylasir. Eskiden bu panel kendi
  // fetch'ini yapiyordu; onay/ret sonrasi yalnizca panel tazeleniyor, harita ve
  // lejant sayaclari eski veriyle kaliyordu (alt filtreyi kapat-ac etmek de
  // ise yaramiyordu, cunku onbellekteki veri hala eskiydi).
  //
  // "Onaylandı" alt-sekmesinde ham ihbar kaydi degil, olusan varliklar gosterilir
  // (ihbarVarlikSorgu ust bilesenden gelir) - o sekmede ihbar cekmeye gerek yok.
  const ihbarSorgu = useQuery({
    queryKey: ["reports", durum],
    queryFn: () => listReports(durum),
    enabled: durum !== "onaylandi",
  });
  const ihbarlar = durum === "onaylandi" ? BOS_IHBARLAR : ihbarSorgu.data?.features ?? BOS_IHBARLAR;
  const yukleniyor = durum !== "onaylandi" && ihbarSorgu.isLoading;
  const hata = islemHatasi ?? (ihbarSorgu.error as Error | null)?.message ?? null;

  const onIhbarlarChangeRef = useRef(onIhbarlarChange);
  useEffect(() => {
    onIhbarlarChangeRef.current = onIhbarlarChange;
  });

  // Yuklenen ihbarlari ust bilesene bildir (haritada gostermek/secmek icin).
  useEffect(() => {
    onIhbarlarChangeRef.current?.(ihbarlar);
  }, [ihbarlar]);

  /** Onay/ret sonrasi: ihbarin durumu degistigi icin UC durum sorgusu da
   *  ("beklemede"/"onaylandi"/"reddedildi") gecersiz kilinir - panel, harita
   *  noktalari, lejant sayaclari ve bildirim zili tek hamlede tazelenir. */
  const ihbarlariTazele = () =>
    queryClient.invalidateQueries({ queryKey: ["reports"] });

  const onayla = async (id: string) => {
    setIslemdeki(id);
    setIslemHatasi(null);
    try {
      await approveReport(id);
      await ihbarlariTazele();
      onVarlikOlustu?.();
    } catch (e) {
      setIslemHatasi((e as Error).message);
    } finally {
      setIslemdeki(null);
    }
  };

  const reddet = async (id: string) => {
    const neden = window.prompt("Ret nedeni (opsiyonel):") ?? undefined;
    setIslemdeki(id);
    setIslemHatasi(null);
    try {
      await rejectReport(id, neden || undefined);
      await ihbarlariTazele();
    } catch (e) {
      setIslemHatasi((e as Error).message);
    } finally {
      setIslemdeki(null);
    }
  };

  /** Reddi geri al: ihbar tekrar "beklemede"ye doner. Alt sekme burada
   *  degistirilmez - App'teki secim/durum senkronu (secili ihbar hangi
   *  durumdaysa o sekme acilir) kaydi Bekleyen listesinde secili gosterir. */
  const geriAl = async (id: string) => {
    setIslemdeki(id);
    setIslemHatasi(null);
    try {
      await reopenReport(id);
      await ihbarlariTazele();
    } catch (e) {
      setIslemHatasi((e as Error).message);
    } finally {
      setIslemdeki(null);
    }
  };

  // Onay satirin kendi icinde (SilOnayi) alinir - bkz. AssetList'teki ikizi.
  const sil = (asset: AssetFeature) => {
    deleteAsset.mutate(asset.properties.id, {
      onSuccess: () => {
        if (detayAsset?.properties.id === asset.properties.id) setDetayAsset(null);
      },
    });
  };

  // Haritadan secim yapildiginda "Onaylandı" listesindeki karti gorunur
  // alana kaydir (kayitli varliklardaki ayni davranisin esdegeri).
  useEffect(() => {
    seciliVarlikRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [seciliVarlikId]);

  // Ayni davranis "Bekleyen"/"Reddedildi" listesindeki secili ihbar icin.
  useEffect(() => {
    seciliVarlikRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [seciliRaporId]);

  // "Onaylandı" sekmesindeki varliklari duruma gore ayir: once bakim
  // bekleyenler, sonra tamir edilenler (otomatik silme kuyrugunda).
  const onayliVarliklar = ihbarVarlikSorgu.data?.features ?? [];
  const bakimVarliklar = onayliVarliklar.filter(
    (a) => a.properties.status === "bakim_lazim"
  );
  const tamirVarliklar = onayliVarliklar.filter(
    (a) => a.properties.status === "iyi"
  );

  // Iki bolumde de ayni VarlikSatiri kurulumu kullanildigindan tek yerde uret.
  const varlikSatiriRender = (asset: AssetFeature) => {
    const id = asset.properties.id;
    const secili = id === seciliVarlikId;
    return (
      <VarlikSatiri
        key={id}
        ref={secili ? seciliVarlikRef : undefined}
        asset={asset}
        secili={secili}
        onSec={onVarlikSec}
        onDetay={setDetayAsset}
        onDuzenle={setDuzenlenen}
        tamCrudYetkisi={tamCrudYetkisi}
        onTamirEt={(assetId) => repairAsset.mutate(assetId)}
        tamirPending={repairAsset.isPending}
        onSil={sil}
        silPending={deleteAsset.isPending}
      />
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Durum filtresi - uc sekme de esit genislikte (flex-1) ve kisa
          etiketlerle (SEKME_ETIKETLERI) ayni buyuklukte gorunur; tam etiket
          (ornek "Bekleyen İhbar") satirlar/rozetlerde hala kullanilir. */}
      <div className="flex gap-1 border-b border-slate-200 px-4 py-2">
        {REPORT_STATUSES.map((d) => (
          <button
            key={d}
            onClick={() => onDurumChange(d)}
            className={`flex-1 border px-2 py-1 text-center text-xs font-medium transition ${
              durum === d
                ? "border-emerald-600 bg-emerald-600 text-white"
                : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {SEKME_ETIKETLERI[d]}
          </button>
        ))}
      </div>

      {hata && (
        <p className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">
          {hata}
        </p>
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

      {durum === "onaylandi" ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {ihbarVarlikSorgu.isLoading && (
            <p className="p-4 text-sm text-slate-500">Yükleniyor…</p>
          )}
          {ihbarVarlikSorgu.isError && (
            <p className="p-3 text-sm text-red-600">
              {ihbarVarlikSorgu.error?.message}
            </p>
          )}
          {ihbarVarlikSorgu.data?.features.length === 0 && (
            <p className="p-6 text-center text-sm text-slate-500">
              Onaylanmış ihbardan oluşan varlık yok.
            </p>
          )}

          {/* Bakim lazim olanlar ustte, tamir edilenler (durum 'iyi') altta ayri
              bir bolumde - tamir edilenler TAMIR_SAKLAMA_GUN sonra otomatik
              silinir (VarlikSatiri her satirda kalan gunu gosterir). */}
          <ul className="divide-y divide-slate-100">
            {bakimVarliklar.map((asset) => varlikSatiriRender(asset))}
          </ul>

          {tamirVarliklar.length > 0 && (
            <>
              <div className="border-y border-slate-200 bg-slate-50 px-4 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Tamir Edildi
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  Tamir edilen varlıklar {TAMIR_SAKLAMA_GUN} gün sonra otomatik
                  olarak silinir.
                </p>
              </div>
              <ul className="divide-y divide-slate-100">
                {tamirVarliklar.map((asset) => varlikSatiriRender(asset))}
              </ul>
            </>
          )}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {yukleniyor && <p className="p-4 text-sm text-slate-500">Yükleniyor…</p>}
          {!yukleniyor && ihbarlar.length === 0 && (
            <p className="p-6 text-center text-sm text-slate-500">
              Bu durumda ihbar yok.
            </p>
          )}

          <ul className="divide-y divide-slate-100">
            {ihbarlar.map((ih) => {
              const secili = ih.properties.id === seciliRaporId;
              return (
                <IhbarSatiri
                  key={ih.properties.id}
                  ref={secili ? seciliVarlikRef : undefined}
                  report={ih}
                  secili={secili}
                  onSec={(id) => onRaporSec?.(id)}
                  onayReddetYetkisi={tamCrudYetkisi}
                  onOnayla={onayla}
                  onReddet={reddet}
                  onGeriAl={geriAl}
                  islemPending={islemdeki === ih.properties.id}
                />
              );
            })}
          </ul>
        </div>
      )}

      <AssetDetayModal
        asset={detayAsset}
        onKapat={() => setDetayAsset(null)}
        {...yonetim}
      />

      <Modal
        acik={duzenlenen !== null}
        baslik="Varlığı Düzenle"
        onKapat={() => setDuzenlenen(null)}
      >
        {duzenlenen && (
          <AssetForm
            key={duzenlenen.properties.id}
            asset={duzenlenen}
            onDone={() => setDuzenlenen(null)}
          />
        )}
      </Modal>
    </div>
  );
}
