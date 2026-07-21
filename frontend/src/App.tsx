import { useCallback, useMemo, useState } from "react";

import { assetsWithin } from "./api/assets";
import AssetForm from "./components/AssetForm";
import AssetList from "./components/AssetList";
import CizimPaneli from "./components/CizimPaneli";
import Dashboard from "./components/Dashboard";
import {
  IconChevronLeft,
  IconChevronRight,
  IconLasso,
  IconRuler,
  IconTree,
} from "./components/icons";
import MapStyleSwitcher from "./components/MapStyleSwitcher";
import MapView from "./components/MapView";
import Modal from "./components/Modal";
import { VARSAYILAN_STIL, type HaritaStilId } from "./data/mapStyles";
import { useAssets } from "./hooks/useAssets";
import type { AssetFeature, AssetFeatureCollection, AssetFilters } from "./types/asset";
import type { TamamlananAlan } from "./types/alan";
import { mesafeEtiketi, poligonAlaniM2, toplamMesafeMetre } from "./utils/geo";

type Sekme = "liste" | "ekle" | "ozet";

export default function App() {
  const [filters, setFilters] = useState<AssetFilters>({});
  const [sekme, setSekme] = useState<Sekme>("liste");
  const [seciliId, setSeciliId] = useState<string | null>(null);
  const [duzenlenen, setDuzenlenen] = useState<AssetFeature | null>(null);
  const [koordinat, setKoordinat] = useState<
    { longitude: number; latitude: number } | undefined
  >();
  const [panelAcik, setPanelAcik] = useState(true);
  const [aktifStilId, setAktifStilId] = useState<HaritaStilId>(VARSAYILAN_STIL);

  // --- Alan (poligon) secimi - birden fazla alan ayni anda acik kalabilir ---
  const [cizimModu, setCizimModu] = useState(false);
  const [cizimNoktalari, setCizimNoktalari] = useState<[number, number][]>([]);
  const [cizimRengi, setCizimRengi] = useState("#059669");
  const [tamamlananAlanlar, setTamamlananAlanlar] = useState<TamamlananAlan[]>([]);
  const [alanHatasi, setAlanHatasi] = useState<string | null>(null);
  const [alanYukleniyor, setAlanYukleniyor] = useState(false);

  // --- Mesafe olcum araci ---
  const [olcumModu, setOlcumModu] = useState(false);
  const [olcumNoktalari, setOlcumNoktalari] = useState<[number, number][]>([]);

  const alanM2 = useMemo(() => poligonAlaniM2(cizimNoktalari), [cizimNoktalari]);
  const olcumMesafeM = useMemo(
    () => toplamMesafeMetre(olcumNoktalari),
    [olcumNoktalari]
  );

  const sorgu = useAssets(filters);
  // Tamamlanmis alanlar varsa liste/ozet, birlestirilmis (tekilleştirilmiş) sonucu gosterir.
  const birlesikAlanSonucu = useMemo<AssetFeatureCollection | null>(() => {
    if (tamamlananAlanlar.length === 0) return null;
    const gorulen = new Map<string, AssetFeature>();
    for (const alan of tamamlananAlanlar) {
      for (const f of alan.sonuc.features) gorulen.set(f.properties.id, f);
    }
    return { type: "FeatureCollection", features: [...gorulen.values()] };
  }, [tamamlananAlanlar]);
  const gosterilen = birlesikAlanSonucu ?? sorgu.data;

  const haritaTiklandi = useCallback(
    (c: { longitude: number; latitude: number }) => {
      setKoordinat(c);
      setSekme("ekle");
      setPanelAcik(true);
    },
    []
  );

  const varlikSecildi = useCallback((id: string) => {
    setSeciliId(id);
    setSekme("liste");
    setPanelAcik(true);
  }, []);

  const cizimNoktaEkle = useCallback((nokta: [number, number]) => {
    setCizimNoktalari((n) => [...n, nokta]);
  }, []);

  const olcumNoktaEkle = useCallback((nokta: [number, number]) => {
    setOlcumNoktalari((n) => [...n, nokta]);
  }, []);

  const alanSecimiBaslat = () => {
    if (olcumModu) olcumIptal();
    setCizimModu(true);
    setCizimNoktalari([]);
    setAlanHatasi(null);
    setSeciliId(null);
  };

  const alanSecimiIptal = () => {
    setCizimModu(false);
    setCizimNoktalari([]);
  };

  const alanKaldir = (id: string) => {
    setTamamlananAlanlar((a) => a.filter((alan) => alan.id !== id));
  };

  const tumAlanlariTemizle = () => {
    setTamamlananAlanlar([]);
  };

  const alanSecimiTamamla = async () => {
    if (cizimNoktalari.length < 3) return;
    setAlanYukleniyor(true);
    setAlanHatasi(null);
    try {
      const sonuc = await assetsWithin({
        polygon: {
          type: "Polygon",
          // Halka kapatilir: ilk nokta sona eklenir.
          coordinates: [[...cizimNoktalari, cizimNoktalari[0]]],
        },
        ...filters,
      });
      setTamamlananAlanlar((a) => [
        ...a,
        {
          id: crypto.randomUUID(),
          noktalar: cizimNoktalari,
          renk: cizimRengi,
          sonuc,
        },
      ]);
      // Bu alan bitti; cizimi sifirla ki kullanici hemen bir sonrakine baslayabilsin.
      setCizimModu(false);
      setCizimNoktalari([]);
      setSekme("liste");
    } catch (e) {
      setAlanHatasi((e as Error).message);
    } finally {
      setAlanYukleniyor(false);
    }
  };

  const olcumBaslat = () => {
    if (cizimModu) alanSecimiIptal();
    setOlcumModu(true);
    setOlcumNoktalari([]);
  };

  const olcumIptal = () => {
    setOlcumModu(false);
    setOlcumNoktalari([]);
  };

  const olcumBitir = () => {
    if (olcumNoktalari.length < 2) return;
    setOlcumModu(false);
  };

  const olcumTemizle = () => {
    setOlcumModu(false);
    setOlcumNoktalari([]);
  };

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-100">
      {/* Ust bar (uygulama header'i) */}
      <header className="z-20 flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center border border-emerald-700 bg-emerald-600">
            <IconTree className="h-4 w-4 text-white" />
          </div>
          <div className="leading-tight">
            <h1 className="text-sm font-semibold tracking-tight text-slate-900">
              GreenAsset
            </h1>
            <p className="text-[11px] text-slate-500">
              Akıllı Şehir Varlık Yönetimi
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <MapStyleSwitcher aktifId={aktifStilId} onSec={setAktifStilId} />

          {/* Mesafe olcum kontrolu - detaylar alt ortadaki arac panelinde */}
          <button
            onClick={olcumModu ? olcumIptal : olcumBaslat}
            className={`flex items-center gap-1.5 border px-3 py-1.5 text-sm font-medium transition ${
              olcumModu || olcumNoktalari.length >= 2
                ? "border-blue-600 bg-blue-600 text-white hover:bg-blue-700"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            <IconRuler className="h-3.5 w-3.5" />
            {olcumModu
              ? "Ölçülüyor…"
              : olcumNoktalari.length >= 2
                ? mesafeEtiketi(olcumMesafeM)
                : "Ölç"}
          </button>

          {/* Alan secim kontrolu - detaylar alt ortadaki arac panelinde */}
          <button
            onClick={cizimModu ? alanSecimiIptal : alanSecimiBaslat}
            className={`flex items-center gap-1.5 border px-3 py-1.5 text-sm font-medium transition ${
              cizimModu || tamamlananAlanlar.length > 0
                ? "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            <IconLasso className="h-3.5 w-3.5" />
            {cizimModu
              ? "Çiziliyor…"
              : tamamlananAlanlar.length > 0
                ? `${tamamlananAlanlar.length} alan seçili`
                : "Alan seç"}
          </button>
        </div>
      </header>

      <CizimPaneli
        cizimModu={cizimModu}
        cizimNoktalari={cizimNoktalari}
        cizimRengi={cizimRengi}
        onCizimRengiSec={setCizimRengi}
        alanM2={alanM2}
        alanHatasi={alanHatasi}
        alanYukleniyor={alanYukleniyor}
        onAlanIptal={alanSecimiIptal}
        onAlanTamamla={alanSecimiTamamla}
        tamamlananAlanlar={tamamlananAlanlar}
        onAlanKaldir={alanKaldir}
        onTumAlanlariTemizle={tumAlanlariTemizle}
        olcumModu={olcumModu}
        olcumNoktalari={olcumNoktalari}
        olcumMesafeM={olcumMesafeM}
        onOlcumIptal={olcumIptal}
        onOlcumBitir={olcumBitir}
        onOlcumTemizle={olcumTemizle}
      />

      {/* Govde: docked sidebar + harita */}
      <div className="flex min-h-0 flex-1">
        {panelAcik && (
          <aside className="flex w-[360px] shrink-0 flex-col border-r border-slate-300 bg-white">
            <div className="flex items-stretch border-b border-slate-300 bg-slate-50">
              <SekmeButonu aktif={sekme === "liste"} onClick={() => setSekme("liste")}>
                Varlıklar
              </SekmeButonu>
              <SekmeButonu aktif={sekme === "ekle"} onClick={() => setSekme("ekle")}>
                Yeni Ekle
              </SekmeButonu>
              <SekmeButonu aktif={sekme === "ozet"} onClick={() => setSekme("ozet")}>
                Özet
              </SekmeButonu>
              <button
                onClick={() => setPanelAcik(false)}
                aria-label="Paneli gizle"
                title="Paneli gizle"
                className="flex items-center border-l border-slate-300 px-2.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              >
                <IconChevronLeft className="h-3.5 w-3.5" />
              </button>
            </div>

            {sekme === "liste" && (
              <AssetList
                data={gosterilen}
                isLoading={sorgu.isLoading}
                isError={sorgu.isError}
                error={sorgu.error as Error | null}
                filters={filters}
                onFiltersChange={setFilters}
                seciliId={seciliId}
                onSec={setSeciliId}
                onDuzenle={setDuzenlenen}
              />
            )}

            {sekme === "ekle" && (
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                <p className="mb-3 border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  Haritada boş bir noktaya tıklayarak koordinatı otomatik
                  doldurabilirsin.
                </p>
                <AssetForm koordinat={koordinat} />
              </div>
            )}

            {sekme === "ozet" && (
              <Dashboard
                data={gosterilen}
                alanSecimiAktif={tamamlananAlanlar.length > 0}
              />
            )}
          </aside>
        )}

        {/* Harita alani */}
        <div className="relative min-w-0 flex-1">
          <MapView
            assets={gosterilen}
            seciliId={seciliId}
            onVarlikSec={varlikSecildi}
            onHaritaTikla={haritaTiklandi}
            cizimModu={cizimModu}
            cizimNoktalari={cizimNoktalari}
            onCizimNokta={cizimNoktaEkle}
            cizimRengi={cizimRengi}
            tamamlananAlanlar={tamamlananAlanlar}
            olcumModu={olcumModu}
            olcumNoktalari={olcumNoktalari}
            onOlcumNokta={olcumNoktaEkle}
            aktifStilId={aktifStilId}
          />

          {!panelAcik && (
            <button
              onClick={() => setPanelAcik(true)}
              className="absolute left-3 top-3 z-10 flex items-center gap-1.5 border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              <IconChevronRight className="h-3.5 w-3.5" />
              Paneli göster
            </button>
          )}
        </div>
      </div>

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

function SekmeButonu({
  aktif,
  onClick,
  children,
}: {
  aktif: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 border-b-2 px-3 py-2.5 text-sm font-medium transition ${
        aktif
          ? "border-emerald-600 bg-white text-slate-900"
          : "border-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-700"
      }`}
    >
      {children}
    </button>
  );
}
