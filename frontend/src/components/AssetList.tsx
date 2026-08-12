import { useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "../auth/AuthContext";
import { useDeleteAsset, useRepairAsset } from "../hooks/useAssets";
import { useDepartmanlar } from "../hooks/useDepartmanlar";
import { useIlceler, useMahalleler } from "../hooks/useSinirlar";
import { departmanBul } from "../types/departman";
import { turAdi, turKodlari } from "../data/turSozlugu";
import { ASSET_STATUSES, ASSET_STATUS_LABELS } from "../types/asset";
import type {
  AssetFeature,
  AssetFeatureCollection,
  AssetStatus,
  AssetType,
} from "../types/asset";
import AssetDetayModal, { useVarlikYonetimi } from "./AssetDetayModal";
import type { EkipOzet } from "../types/saha";
import { ISTANBUL_IL_KODU } from "../utils/istanbulMaskesi";
import ListeAraciCubugu from "./ListeAraciCubugu";
import { useListeAraci } from "../hooks/useListeAraci";
import {
  aramaMetni,
  atanmamisOnce,
  metinKarsilastir,
  suzVeSirala,
  tariheGoreYeni,
  type SiralamaSecenegi,
} from "../utils/listeAraci";
import TipCoktanSecici from "./TipCoktanSecici";
import VarlikSatiri from "./VarlikSatiri";
import { IconX } from "./icons";

const selectClass =
  "flex-1 border border-slate-300 bg-white px-2 py-1.5 text-xs focus:border-emerald-500 focus:outline-none";

/** Acilir + lejant kutucuklari AYNI state'i paylastigi icin acilirin
 *  gosteremeyecegi bir ara durum olusabilir (orn. lejanttan 3 tur isaretli);
 *  o durumda bu sentetik deger gosterilir. */
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

/** KARISIK durumda acilirda gorunen metin. */
function karisikEtiketi(acikSayisi: number, ad: string): string {
  return acikSayisi === 0 ? `Hiçbir ${ad} seçili değil` : `${acikSayisi} ${ad} seçili`;
}

/** Varsayilan "en yeni". "Bakım Lazım önce" varsayilan yapilmadi - yoksa yeni
 *  eklenen bir "iyi" varlik listenin dibine dusup kaydedildigi fark edilmezdi. */
const VARLIK_SIRALAMASI: readonly SiralamaSecenegi<AssetFeature>[] = [
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
    deger: "ad",
    etiket: "Ada göre (A-Z)",
    karsilastir: (a, b) => metinKarsilastir(a.properties.name, b.properties.name),
  },
  {
    deger: "durum",
    etiket: "Bakım Lazım önce",
    karsilastir: (a, b) => {
      const agirlik = (s: AssetStatus) => (s === "bakim_lazim" ? 0 : 1);
      const fark = agirlik(a.properties.status) - agirlik(b.properties.status);
      // Esit durumda en yeniye duser.
      return fark !== 0
        ? fark
        : tariheGoreYeni(a.properties.created_at, b.properties.created_at);
    },
  },
];

/** Havuz bilgisi geldiyse (yalnizca personel, `GET /saha/havuz`) listeye
 *  "Önce atanmamış" secenegini ekler. */
function varlikSiralamasi(
  atanmamisIdler?: ReadonlySet<string>
): readonly SiralamaSecenegi<AssetFeature>[] {
  if (!atanmamisIdler) return VARLIK_SIRALAMASI;
  return [
    ...VARLIK_SIRALAMASI,
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

interface AssetListProps {
  data?: AssetFeatureCollection;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  /** Tur/durum filtresi: haritadaki lejantla PAYLASILAN state (bkz. App.tsx). */
  turler: Record<AssetType, boolean>;
  onTurDegistir: (tur: AssetType) => void;
  /** Bir mudurlugun tum turlerini birlikte ac/kapa. Departman ayri bir state
   *  degil: secim ayni tur kutucuklarina yazilir (bkz. useKatmanlar). */
  onTurGrubuDegistir: (turler: readonly AssetType[], secili: boolean) => void;
  durumlar: Record<AssetStatus, boolean>;
  onDurumSec: (durum: AssetStatus | null) => void;
  seciliId: string | null;
  onSec: (id: string) => void;
  onDuzenle: (asset: AssetFeature) => void;
  ilceKodu: string | null;
  onIlceSec: (kod: string | null) => void;
  /** Ilce secildiginde kademeli olarak mahalleye kadar filtreleme. */
  mahalleKodu: string | null;
  onMahalleSec: (kod: string | null) => void;
  idariHatasi?: string | null;
  ekipler?: EkipOzet[];
  onVarligaGit?: (asset: AssetFeature) => void;
  /** Havuzda bekleyen varliklarin id'leri; verilirse "Önce atanmamış"
   *  siralamasi acilir. Yalnizca personel icin doludur. */
  atanmamisIdler?: ReadonlySet<string>;
  mobil?: boolean;
}

export default function AssetList({
  data,
  isLoading,
  isError,
  error,
  turler,
  onTurDegistir,
  onTurGrubuDegistir,
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
  atanmamisIdler,
  mobil,
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

  const tumTurKodlari = turKodlari();
  const durumDegeri = acilirDegeri(ASSET_STATUSES, durumlar);

  // Departmani olan personel kapsam rozetini gorur; admin'e cizilmez.
  const adminMi = user?.role === "admin";
  const { data: departmanlar } = useDepartmanlar();
  const kendiDepartmani = departmanBul(departmanlar, user?.departman);
  const acikDurumSayisi = ASSET_STATUSES.filter((s) => durumlar[s]).length;

  // Arama + siralama YALNIZCA PANELI etkiler; haritanin tabani her zaman ham
  // sorgudur (bkz. CLAUDE.md "Alan secimi HARITAYI DARALTMAZ").
  const { arama, setArama, sira, setSira } = useListeAraci("yeni");

  const siralamalar = useMemo(
    () => varlikSiralamasi(atanmamisIdler),
    [atanmamisIdler]
  );

  const tumVarliklar = data?.features;
  const gosterilen = useMemo(
    () =>
      tumVarliklar &&
      suzVeSirala(
        tumVarliklar,
        arama,
        // Tur ADI da aranir: kullanici "aydınlatma direği" diye arar, tur
        // kodunu (`direk`) bilmez.
        (a) =>
          aramaMetni(
            a.properties.name,
            a.properties.brand_model,
            turAdi(a.properties.type)
          ),
        siralamalar,
        sira
      ),
    [tumVarliklar, arama, sira, siralamalar]
  );

  // Haritadan secim yapildiginda listedeki karti gorunur alana kaydir.
  useEffect(() => {
    seciliRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [seciliId]);

  const sil = (asset: AssetFeature) => {
    deleteAsset.mutate(asset.properties.id, {
      onSuccess: () => {
        if (detayAsset?.properties.id === asset.properties.id) setDetayAsset(null);
      },
    });
  };

  // --- Filtre kontrolleri --- (iki kabuk da ayni kontrolleri gosterir, yalnizca dizilis degisir)
  const kapsamRozeti =
    !adminMi && kendiDepartmani ? (
      <p
        className={`border-b border-slate-200 text-[11px] ${
          mobil ? "px-3 py-1" : "px-4 py-2"
        }`}
        style={{ color: kendiDepartmani.renk }}
      >
        <span className="font-medium">{kendiDepartmani.ad}</span>
        <span className="text-slate-400"> · yalnızca bu müdürlüğün kayıtları</span>
      </p>
    ) : null;

  // Departman filtresi ayri bir acilir degil: mudurluk secimi tip acilirinin
  // kendi baslik satirlarindadir (bir mudurluge tik koymak altindaki turlerin
  // hepsini secer).
  const tipFiltresi = (
    <TipCoktanSecici
      turler={tumTurKodlari}
      secili={turler}
      onDegis={onTurDegistir}
      onGrupDegis={onTurGrubuDegistir}
      hepsiEtiketi="Tüm tipler"
    />
  );

  const durumFiltresi = (
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
  );

  const ilceFiltresi = (
    <div className="flex min-w-0 flex-1 items-center gap-2">
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
  );

  // Mahalle secimi yalnizca bir ilce secildiginde gorunur (kademeli).
  const mahalleFiltresi = ilceKodu ? (
    <div className="flex min-w-0 flex-1 items-center gap-2">
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
  ) : null;

  /** Mobil: tum filtreler TEK blokta, ikiserli sarar. Masaustu: bugunku
   *  gruplanmis bordurlu bloklar (panel genis, dikey yer sorun degil). */
  const filtreler = mobil ? (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 px-3 py-1.5">
      <div className="flex min-w-0 flex-1 basis-[calc(50%-0.375rem)] gap-1.5">
        {tipFiltresi}
      </div>
      <div className="flex min-w-0 flex-1 basis-[calc(50%-0.375rem)] gap-1.5">
        {durumFiltresi}
      </div>
      <div className="flex min-w-0 basis-full gap-1.5">
        {ilceFiltresi}
        {mahalleFiltresi}
      </div>
    </div>
  ) : (
    <div className="flex flex-wrap gap-1.5 border-b border-slate-200 px-4 py-2">
      <div className="flex min-w-0 basis-full gap-1.5">
        {tipFiltresi}
        {durumFiltresi}
      </div>
      <div className="flex min-w-0 basis-full gap-1.5">
        {ilceFiltresi}
        {mahalleFiltresi}
      </div>
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {kapsamRozeti}
      {filtreler}

      <ListeAraciCubugu
        mobil={mobil}
        arama={{
          deger: arama,
          onDegis: setArama,
          ipucu: "Ad, marka veya tür ara…",
          mobilIpucu: "Varlık ara",
        }}
        siralama={{ secenekler: siralamalar, deger: sira, onDegis: setSira }}
        sayac={{
          gorunen: gosterilen?.length ?? 0,
          toplam: tumVarliklar?.length ?? 0,
          birim: "varlık",
        }}
      />

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
        {/* Bos liste mesaji sebebini soyler: arama yuzunden bosaldiysa
            filtreleri kurcalamak yanlis yol olurdu. */}
        {data?.features.length === 0 && (
          <p className="p-6 text-center text-sm text-slate-500">
            Bu filtrelere uyan varlık yok.
          </p>
        )}
        {data && data.features.length > 0 && gosterilen?.length === 0 && (
          <p className="p-6 text-center text-sm text-slate-500">
            "{arama.trim()}" aramasına uyan varlık yok.
          </p>
        )}

        <ul className="divide-y divide-slate-100">
          {gosterilen?.map((asset) => {
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
