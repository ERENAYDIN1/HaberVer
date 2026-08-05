import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

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
import {
  TALEP_GORUNUMLERI,
  talepNoktasi,
  type TalepGorunumu,
  type ReportFeature,
  type ReportStatus,
} from "../types/report";
import type { EkipOzet } from "../types/saha";
import AssetDetayModal, { useVarlikYonetimi } from "./AssetDetayModal";
import AssetForm from "./AssetForm";
import TalepSatiri from "./TalepSatiri";
import Modal from "./Modal";
import VarlikSatiri from "./VarlikSatiri";

interface TalepVarlikSorguSonucu {
  data?: AssetFeatureCollection;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
}

/** Sabit bos liste: ust bilesene bildirilen deger her render'da yeni bir dizi
 *  olmasin, yoksa `onTaleplerChange` efekti kendini surekli tetikler. */
const BOS_TALEPLER: ReportFeature[] = [];

/** Sekme etiketleri kisa tutulur; REPORT_STATUS_LABELS'daki tam metinler
 *  sekme genisligini esitsiz yapiyor. */
const SEKME_ETIKETLERI: Record<TalepGorunumu, string> = {
  onaylandi: "Onaylandı",
  tamir: "Tamir Edildi",
  beklemede: "Bekleyen",
  reddedildi: "Reddedildi",
};

/** Bu sekme ham talep mi yoksa talepten olusan varliklari mi listeler:
 *  "Onaylandı" ve "Tamir Edildi" varlik, digerleri ham talep gosterir. */
function varlikSekmesi(g: TalepGorunumu): boolean {
  return g === "onaylandi" || g === "tamir";
}

interface TalepPaneliProps {
  /** Alt sekme; App.tsx'te tutulur ki bildirimden gelen bir kayit dogru
   *  sekmeyi acabilsin ve harita ne gosterecegini bilsin. */
  durum: TalepGorunumu;
  onDurumChange: (d: TalepGorunumu) => void;
  /** Onay yeni bir varlik olusturunca ana listeyi tazelemek icin. */
  onVarlikOlustu?: () => void;
  /** Yuklenen ham talepleri ust bilesene bildirir (haritada gosterilirler). */
  onTaleplerChange?: (talepler: ReportFeature[]) => void;
  seciliRaporId?: string | null;
  onRaporSec?: (id: string) => void;
  /** Talepten olusan varliklar; App.tsx zaten tuttugu icin tekrar cekilmez. */
  talepVarlikSorgu: TalepVarlikSorguSonucu;
  seciliVarlikId?: string | null;
  onVarlikSec: (id: string) => void;
  /** Saha ekipleri: varlik detayindan ekibe atama yapilabilsin diye. */
  ekipler?: EkipOzet[];
  onVarligaGit?: (asset: AssetFeature) => void;
  /** Haritada bir alan (ilce/mahalle ya da cizilen poligon) seciliyse liste de
   *  o sinirla daralir; yoksa null. Lejant sayaclariyla ayni olcut. */
  alandaMi?: ((nokta: [number, number]) => boolean) | null;
}

export default function TalepPaneli({
  durum,
  onDurumChange,
  onVarlikOlustu,
  onTaleplerChange,
  seciliRaporId,
  onRaporSec,
  talepVarlikSorgu,
  seciliVarlikId,
  onVarlikSec,
  ekipler,
  onVarligaGit,
  alandaMi,
}: TalepPaneliProps) {
  const { user } = useAuth();
  const tamCrudYetkisi = user?.role !== "saha_calisani";
  const deleteAsset = useDeleteAsset();
  const repairAsset = useRepairAsset();
  const [duzenlenen, setDuzenlenen] = useState<AssetFeature | null>(null);
  const [detayAsset, setDetayAsset] = useState<AssetFeature | null>(null);
  const seciliVarlikRef = useRef<HTMLLIElement>(null);
  // "Varlıklar" panelindekiyle ayni yonetim kumesi.
  const yonetim = useVarlikYonetimi({
    ekipler,
    onDuzenle: setDuzenlenen,
    onGit: onVarligaGit,
    detayKapat: () => setDetayAsset(null),
  });

  const queryClient = useQueryClient();
  const [islemHatasi, setIslemHatasi] = useState<string | null>(null);
  const [islemdeki, setIslemdeki] = useState<string | null>(null);

  // Talep listesi react-query uzerinden gider: App'teki harita/lejant
  // sorgulariyla ayni onbellegi paylasir, boylece onay/ret sonrasi hepsi
  // birlikte tazelenir. Varlik listeleyen sekmelerde talep cekilmez.
  const varlikListesi = varlikSekmesi(durum);
  const talepSorgu = useQuery({
    queryKey: ["reports", durum],
    queryFn: () => listReports(durum as ReportStatus),
    enabled: !varlikListesi,
  });
  // Alan suzgeci uygulanmis liste memo'lanir: her render'da yeni bir dizi
  // uretmek `onTaleplerChange` efektini surekli tetiklerdi.
  const talepler = useMemo(() => {
    if (varlikListesi) return BOS_TALEPLER;
    const tumu = talepSorgu.data?.features ?? BOS_TALEPLER;
    if (!alandaMi) return tumu;
    // Alan suzgeci seklin temsil noktasina bakar: bir cizgi/alan talebi
    // secili alana "girdi mi" sorusunun tek anlamli cevabi budur.
    return tumu.filter((f) => {
      const n = talepNoktasi(f);
      return n ? alandaMi(n) : false;
    });
  }, [varlikListesi, talepSorgu.data, alandaMi]);
  const yukleniyor = !varlikListesi && talepSorgu.isLoading;
  const hata = islemHatasi ?? (talepSorgu.error as Error | null)?.message ?? null;

  const onTaleplerChangeRef = useRef(onTaleplerChange);
  useEffect(() => {
    onTaleplerChangeRef.current = onTaleplerChange;
  });

  // Yuklenen talepleri ust bilesene bildir (haritada gostermek/secmek icin).
  useEffect(() => {
    onTaleplerChangeRef.current?.(talepler);
  }, [talepler]);

  /** Onay/ret sonrasi uc durum sorgusu birden gecersiz kilinir: panel, harita,
   *  lejant sayaclari ve bildirim zili tek hamlede tazelenir. */
  const talepleriTazele = () =>
    queryClient.invalidateQueries({ queryKey: ["reports"] });

  const onayla = async (id: string) => {
    setIslemdeki(id);
    setIslemHatasi(null);
    try {
      await approveReport(id);
      await talepleriTazele();
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
      await talepleriTazele();
    } catch (e) {
      setIslemHatasi((e as Error).message);
    } finally {
      setIslemdeki(null);
    }
  };

  /** Reddi geri al: talep "beklemede"ye doner. Alt sekme burada degistirilmez;
   *  App'teki secim senkronu kaydi Bekleyen listesinde secili gosterir. */
  const geriAl = async (id: string) => {
    setIslemdeki(id);
    setIslemHatasi(null);
    try {
      await reopenReport(id);
      await talepleriTazele();
    } catch (e) {
      setIslemHatasi((e as Error).message);
    } finally {
      setIslemdeki(null);
    }
  };

  // Silme onayi satirin kendi icinde (SilOnayi) alinir.
  const sil = (asset: AssetFeature) => {
    deleteAsset.mutate(asset.properties.id, {
      onSuccess: () => {
        if (detayAsset?.properties.id === asset.properties.id) setDetayAsset(null);
      },
    });
  };

  // Haritadan secim yapilinca listedeki karti gorunur alana kaydir.
  useEffect(() => {
    seciliVarlikRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [seciliVarlikId, seciliRaporId]);

  // Talepten olusan varliklar iki sekmeye bolunur: hala bakim bekleyenler
  // ("Onaylandı") ve tamir edilmis olanlar ("Tamir Edildi").
  const onayliVarliklar = talepVarlikSorgu.data?.features ?? [];
  const gosterilenVarliklar = onayliVarliklar.filter(
    (a) =>
      (durum === "tamir"
        ? a.properties.status === "iyi"
        : a.properties.status === "bakim_lazim") &&
      (!alandaMi || alandaMi(a.geometry.coordinates))
  );

  // Iki bolum de ayni VarlikSatiri kurulumunu kullanir.
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
      {/* Alt sekmeler: esit genislikte ve kisa etiketli; tam etiketler
          satirlarda/rozetlerde kullanilmaya devam eder. */}
      <div className="grid grid-cols-4 gap-1 border-b border-slate-200 px-4 py-2">
        {TALEP_GORUNUMLERI.map((d) => (
          <button
            key={d}
            onClick={() => onDurumChange(d)}
            className={`min-w-0 truncate border px-1 py-1 text-center text-[11px] font-medium transition ${
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

      {varlikListesi ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* Kalan gun her satirda VarlikSatiri tarafindan gosterilir. */}
          {durum === "tamir" && (
            <p className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-[11px] text-slate-500">
              Tamir edilen varlıklar {TAMIR_SAKLAMA_GUN} gün sonra otomatik
              olarak silinir.
            </p>
          )}
          {talepVarlikSorgu.isLoading && (
            <p className="p-4 text-sm text-slate-500">Yükleniyor…</p>
          )}
          {talepVarlikSorgu.isError && (
            <p className="p-3 text-sm text-red-600">
              {talepVarlikSorgu.error?.message}
            </p>
          )}
          {!talepVarlikSorgu.isLoading && gosterilenVarliklar.length === 0 && (
            <p className="p-6 text-center text-sm text-slate-500">
              {durum === "tamir"
                ? "Tamir edilmiş varlık yok."
                : "Bakım bekleyen, talepten oluşmuş varlık yok."}
            </p>
          )}

          <ul className="divide-y divide-slate-100">
            {gosterilenVarliklar.map((asset) => varlikSatiriRender(asset))}
          </ul>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {yukleniyor && <p className="p-4 text-sm text-slate-500">Yükleniyor…</p>}
          {!yukleniyor && talepler.length === 0 && (
            <p className="p-6 text-center text-sm text-slate-500">
              Bu durumda talep yok.
            </p>
          )}

          <ul className="divide-y divide-slate-100">
            {talepler.map((ih) => {
              const secili = ih.properties.id === seciliRaporId;
              return (
                <TalepSatiri
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
