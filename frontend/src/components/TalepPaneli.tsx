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
import ListeAraciCubugu from "./ListeAraciCubugu";
import { useAramaSifirla, useListeAraci } from "../hooks/useListeAraci";
import {
  aramaMetni,
  atanmamisOnce,
  metinKarsilastir,
  suzVeSirala,
  tariheGoreYeni,
  type SiralamaSecenegi,
} from "../utils/listeAraci";
import TalepSatiri from "./TalepSatiri";
import Modal from "./Modal";
import TipCoktanSecici from "./TipCoktanSecici";
import VarlikSatiri from "./VarlikSatiri";
import { hepsi } from "../hooks/useKatmanlar";
import { turAdi, turKodlari } from "../data/turSozlugu";
import type { AssetType } from "../types/asset";

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

/** Varsayilan "en yeni". */
const TALEP_SIRALAMASI: readonly SiralamaSecenegi<ReportFeature>[] = [
  {
    deger: "yeni",
    etiket: "En yeni",
    karsilastir: (a, b) =>
      tariheGoreYeni(a.properties.created_at, b.properties.created_at),
  },
  {
    deger: "eski",
    etiket: "En eski",
    karsilastir: (a, b) =>
      tariheGoreYeni(b.properties.created_at, a.properties.created_at),
  },
  {
    deger: "tur",
    etiket: "Türe göre",
    karsilastir: (a, b) => {
      const fark = metinKarsilastir(
        turAdi(a.properties.type),
        turAdi(b.properties.type)
      );
      return fark !== 0
        ? fark
        : tariheGoreYeni(a.properties.created_at, b.properties.created_at);
    },
  },
];

/** Talepten olusan varliklarin siralamasi. "Ada göre" bilincli olarak yok:
 *  varlik adi vatandasin serbest metninden gelir, alfabetik siralama anlamli
 *  bir kumeleme uretmez. */
const TALEP_VARLIK_SIRALAMASI: readonly SiralamaSecenegi<AssetFeature>[] = [
  {
    deger: "yeni",
    etiket: "En yeni",
    karsilastir: (a, b) =>
      tariheGoreYeni(a.properties.created_at, b.properties.created_at),
  },
  {
    deger: "eski",
    etiket: "En eski",
    karsilastir: (a, b) =>
      tariheGoreYeni(b.properties.created_at, a.properties.created_at),
  },
  {
    deger: "tur",
    etiket: "Türe göre",
    karsilastir: (a, b) => {
      const fark = metinKarsilastir(
        turAdi(a.properties.type),
        turAdi(b.properties.type)
      );
      return fark !== 0
        ? fark
        : tariheGoreYeni(a.properties.created_at, b.properties.created_at);
    },
  },
];

/** "Onaylandı" sekmesine "Önce atanmamış" eklenir - dort sekme icinde acik isi
 *  (`bakim_lazim`) listeleyen tek sekme orasi, digerlerinde secenek anlamsiz
 *  olurdu. */
function talepVarlikSiralamasi(
  atanmamisIdler: ReadonlySet<string> | undefined,
  durum: TalepGorunumu
): readonly SiralamaSecenegi<AssetFeature>[] {
  if (!atanmamisIdler || durum !== "onaylandi") return TALEP_VARLIK_SIRALAMASI;
  return [
    ...TALEP_VARLIK_SIRALAMASI,
    {
      deger: "atanmamis",
      etiket: "Önce atanmamış",
      karsilastir: atanmamisOnce<AssetFeature>(
        atanmamisIdler,
        (a) => a.properties.id,
        (a) => a.properties.status === "bakim_lazim",
        (a) => a.properties.created_at
      ),
    },
  ];
}

interface TalepPaneliProps {
  /** Alt sekme; App.tsx'te tutulur ki bildirimden gelen bir kayit dogru
   *  sekmeyi acabilsin. */
  durum: TalepGorunumu;
  onDurumChange: (d: TalepGorunumu) => void;
  onVarlikOlustu?: () => void;
  onTaleplerChange?: (talepler: ReportFeature[]) => void;
  seciliRaporId?: string | null;
  onRaporSec?: (id: string) => void;
  talepVarlikSorgu: TalepVarlikSorguSonucu;
  seciliVarlikId?: string | null;
  onVarlikSec: (id: string) => void;
  ekipler?: EkipOzet[];
  onVarligaGit?: (asset: AssetFeature) => void;
  /** Haritada bir alan seciliyse liste de o sinirla daralir; yoksa null. */
  alandaMi?: ((nokta: [number, number]) => boolean) | null;
  atanmamisIdler?: ReadonlySet<string>;
  /** Lejanttaki mudurluk alt-filtresiyle AYNI state'i okur (App.tsx). Yalnizca
   *  "Onaylandı"/"Bekleyen" gorunumlerinde kisitlar. */
  mudurlukSecili?: (gorunum: TalepGorunumu, tur: AssetType) => boolean;
  mobil?: boolean;
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
  atanmamisIdler,
  mudurlukSecili,
  mobil,
}: TalepPaneliProps) {
  const { user } = useAuth();
  const tamCrudYetkisi = user?.role !== "saha_calisani";
  const deleteAsset = useDeleteAsset();
  const repairAsset = useRepairAsset();
  const [duzenlenen, setDuzenlenen] = useState<AssetFeature | null>(null);
  const [detayAsset, setDetayAsset] = useState<AssetFeature | null>(null);
  const seciliVarlikRef = useRef<HTMLLIElement>(null);
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
  // sorgulariyla ayni onbellegi paylasir. Varlik listeleyen sekmelerde talep
  // cekilmez.
  const varlikListesi = varlikSekmesi(durum);
  const talepSorgu = useQuery({
    queryKey: ["reports", durum],
    queryFn: () => listReports(durum as ReportStatus),
    enabled: !varlikListesi,
  });
  // Tip filtresi: haritayla paylasilmayan yerel bir state.
  const tumTurKodlari = turKodlari();
  const [tipler, setTipler] = useState<Record<AssetType, boolean>>(() =>
    hepsi(tumTurKodlari)
  );
  const tipDegistir = (t: AssetType) =>
    setTipler((onceki) => ({ ...onceki, [t]: !onceki[t] }));
  // Yeni bir tur eklenirse kutucugu acik baslar (eksik anahtar = gizli olmasin).
  useEffect(() => {
    setTipler((onceki) => {
      const eksik = tumTurKodlari.filter((t) => !(t in onceki));
      return eksik.length ? { ...onceki, ...hepsi(eksik) } : onceki;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tumTurKodlari.length]);
  const tipSuzgeciAktif = tumTurKodlari.some((t) => !tipler[t]);

  // Memo'lanir: her render'da yeni bir dizi `onTaleplerChange` efektini
  // surekli tetikler.
  const talepler = useMemo(() => {
    if (varlikListesi) return BOS_TALEPLER;
    const tumu = talepSorgu.data?.features ?? BOS_TALEPLER;
    return tumu.filter((f) => {
      if (tipSuzgeciAktif && !tipler[f.properties.type]) return false;
      if (mudurlukSecili && !mudurlukSecili(durum, f.properties.type)) return false;
      if (!alandaMi) return true;
      // Alan suzgeci seklin temsil noktasina bakar.
      const n = talepNoktasi(f);
      return n ? alandaMi(n) : false;
    });
  }, [varlikListesi, talepSorgu.data, alandaMi, tipler, tipSuzgeciAktif, mudurlukSecili, durum]);
  const yukleniyor = !varlikListesi && talepSorgu.isLoading;
  const hata = islemHatasi ?? (talepSorgu.error as Error | null)?.message ?? null;

  const onTaleplerChangeRef = useRef(onTaleplerChange);
  useEffect(() => {
    onTaleplerChangeRef.current = onTaleplerChange;
  });

  // DIKKAT: buraya `talepler` gider, arama/siralama uygulanmis liste degil -
  // haritada bir sorgu yaptigini sanan kullanici pinlerini kaybetmemeli.
  useEffect(() => {
    onTaleplerChangeRef.current?.(talepler);
  }, [talepler]);

  // Kapsam verilmez, yani siralama dort alt-sekmede de ortaktir (bekleyen ->
  // onayli -> tamir ayni isin asamalaridir).
  const { arama, setArama, sira: hamSira, setSira } = useListeAraci("yeni");
  // Arama sekme degisince sifirlanir (siralama sifirlanmaz).
  useAramaSifirla(setArama, durum);

  const varlikSiralamalari = useMemo(
    () => talepVarlikSiralamasi(atanmamisIdler, durum),
    [atanmamisIdler, durum]
  );
  const aktifSecenekler = varlikListesi ? varlikSiralamalari : TALEP_SIRALAMASI;
  /** Secili siralama aktif sekmede yoksa varsayilana duser ("Önce atanmamış"
   *  yalnizca "Onaylandı"da var). */
  const sira = aktifSecenekler.some((s) => s.deger === hamSira)
    ? hamSira
    : aktifSecenekler[0].deger;

  const gosterilenTalepler = useMemo(
    () =>
      suzVeSirala(
        talepler,
        arama,
        (f) =>
          aramaMetni(
            f.properties.name,
            f.properties.note,
            turAdi(f.properties.type)
          ),
        TALEP_SIRALAMASI,
        sira
      ),
    [talepler, arama, sira]
  );

  /** Onay/ret sonrasi uc durum sorgusu birden gecersiz kilinir. */
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

  /** Reddi geri al: talep "beklemede"ye doner. Alt sekme burada degistirilmez. */
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

  const onayliVarliklar = talepVarlikSorgu.data?.features ?? [];
  const sekmeVarliklari = onayliVarliklar.filter(
    (a) =>
      (durum === "tamir"
        ? a.properties.status === "iyi"
        : a.properties.status === "bakim_lazim") &&
      (!tipSuzgeciAktif || tipler[a.properties.type]) &&
      (!mudurlukSecili || mudurlukSecili(durum, a.properties.type)) &&
      (!alandaMi || alandaMi(a.geometry.coordinates))
  );
  const gosterilenVarliklar = useMemo(
    () =>
      suzVeSirala(
        sekmeVarliklari,
        arama,
        (a) =>
          aramaMetni(
            a.properties.name,
            a.properties.brand_model,
            turAdi(a.properties.type)
          ),
        varlikSiralamalari,
        sira
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      talepVarlikSorgu.data,
      durum,
      tipler,
      tipSuzgeciAktif,
      mudurlukSecili,
      alandaMi,
      arama,
      sira,
      varlikSiralamalari,
    ]
  );

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
      <div
        className={`grid grid-cols-4 gap-1 border-b border-slate-200 ${
          mobil ? "px-3 py-1.5" : "px-4 py-2"
        }`}
      >
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

      <div
        className={`flex border-b border-slate-200 ${
          mobil ? "gap-1.5 px-3 py-1.5" : "gap-2 px-4 py-2"
        }`}
      >
        <TipCoktanSecici
          turler={tumTurKodlari}
          secili={tipler}
          onDegis={tipDegistir}
          hepsiEtiketi="Tüm tipler"
        />
      </div>

      <ListeAraciCubugu
        mobil={mobil}
        arama={{
          deger: arama,
          onDegis: setArama,
          ipucu: "Başlık, açıklama veya tür ara…",
          mobilIpucu: "Talep ara",
        }}
        siralama={{
          secenekler: aktifSecenekler,
          deger: sira,
          onDegis: setSira,
        }}
        sayac={{
          gorunen: varlikListesi
            ? gosterilenVarliklar.length
            : gosterilenTalepler.length,
          toplam: varlikListesi ? sekmeVarliklari.length : talepler.length,
          birim: varlikListesi ? "varlık" : "talep",
        }}
      />

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
          {!talepVarlikSorgu.isLoading && sekmeVarliklari.length === 0 && (
            <p className="p-6 text-center text-sm text-slate-500">
              {durum === "tamir"
                ? "Tamir edilmiş varlık yok."
                : "Bakım bekleyen, talepten oluşmuş varlık yok."}
            </p>
          )}
          {!talepVarlikSorgu.isLoading &&
            sekmeVarliklari.length > 0 &&
            gosterilenVarliklar.length === 0 && (
              <p className="p-6 text-center text-sm text-slate-500">
                "{arama.trim()}" aramasına uyan varlık yok.
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
          {!yukleniyor &&
            talepler.length > 0 &&
            gosterilenTalepler.length === 0 && (
              <p className="p-6 text-center text-sm text-slate-500">
                "{arama.trim()}" aramasına uyan talep yok.
              </p>
            )}

          <ul className="divide-y divide-slate-100">
            {gosterilenTalepler.map((ih) => {
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
