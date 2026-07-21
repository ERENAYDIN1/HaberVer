import { useCallback, useState } from "react";

import { assetsWithin } from "./api/assets";
import AssetForm from "./components/AssetForm";
import AssetList from "./components/AssetList";
import Dashboard from "./components/Dashboard";
import MapView from "./components/MapView";
import Modal from "./components/Modal";
import { useAssets } from "./hooks/useAssets";
import type {
  AssetFeature,
  AssetFeatureCollection,
  AssetFilters,
} from "./types/asset";

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

  // --- Alan (poligon) secimi ---
  const [cizimModu, setCizimModu] = useState(false);
  const [cizimNoktalari, setCizimNoktalari] = useState<[number, number][]>([]);
  const [alanSonucu, setAlanSonucu] = useState<AssetFeatureCollection | null>(
    null
  );
  const [alanHatasi, setAlanHatasi] = useState<string | null>(null);
  const [alanYukleniyor, setAlanYukleniyor] = useState(false);

  const sorgu = useAssets(filters);
  // Bir alan secildiyse liste ve ozet o sonucu gosterir.
  const gosterilen = alanSonucu ?? sorgu.data;

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

  const alanSecimiBaslat = () => {
    setCizimModu(true);
    setCizimNoktalari([]);
    setAlanSonucu(null);
    setAlanHatasi(null);
    setSeciliId(null);
  };

  const alanSecimiIptal = () => {
    setCizimModu(false);
    setCizimNoktalari([]);
  };

  const alanSecimiTemizle = () => {
    setAlanSonucu(null);
    setCizimNoktalari([]);
    setAlanHatasi(null);
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
      setAlanSonucu(sonuc);
      setCizimModu(false);
      setSekme("liste");
    } catch (e) {
      setAlanHatasi((e as Error).message);
    } finally {
      setAlanYukleniyor(false);
    }
  };

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      <div className="absolute inset-0">
        <MapView
          assets={gosterilen}
          seciliId={seciliId}
          onVarlikSec={varlikSecildi}
          onHaritaTikla={haritaTiklandi}
          cizimModu={cizimModu}
          cizimNoktalari={cizimNoktalari}
          onCizimNokta={cizimNoktaEkle}
        />
      </div>

      {/* Alan secimi kontrolleri - harita stil seciciden once, en ustte */}
      <div className="absolute right-4 top-4 z-10 flex flex-col items-end gap-2">
        {!cizimModu && !alanSonucu && (
          <button
            onClick={alanSecimiBaslat}
            className="rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-lg ring-1 ring-black/5 transition hover:bg-slate-50"
          >
            ⬚ Alan seç
          </button>
        )}

        {cizimModu && (
          <div className="w-64 rounded-lg bg-white p-3 shadow-lg ring-1 ring-black/5">
            <p className="mb-2 text-xs text-slate-600">
              Haritada köşe noktalarına tıklayarak bir alan çiz.
              <span className="mt-1 block font-medium text-slate-800">
                {cizimNoktalari.length} nokta
                {cizimNoktalari.length < 3 && " (en az 3 gerekli)"}
              </span>
            </p>
            {alanHatasi && (
              <p className="mb-2 rounded bg-red-50 px-2 py-1 text-xs text-red-700">
                {alanHatasi}
              </p>
            )}
            <div className="flex gap-2">
              <button
                onClick={alanSecimiIptal}
                className="flex-1 rounded border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
              >
                İptal
              </button>
              <button
                onClick={alanSecimiTamamla}
                disabled={cizimNoktalari.length < 3 || alanYukleniyor}
                className="flex-1 rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {alanYukleniyor ? "Sorgulanıyor..." : "Tamamla"}
              </button>
            </div>
          </div>
        )}

        {alanSonucu && !cizimModu && (
          <div className="rounded-lg bg-white px-4 py-2.5 shadow-lg ring-1 ring-black/5">
            <p className="text-sm text-slate-700">
              Alanda{" "}
              <span className="font-semibold">{alanSonucu.features.length}</span>{" "}
              varlık
            </p>
            <button
              onClick={alanSecimiTemizle}
              className="mt-1 text-xs font-medium text-emerald-700 hover:underline"
            >
              Seçimi temizle
            </button>
          </div>
        )}
      </div>

      {/* Harita uzerinde kayan panel */}
      {panelAcik ? (
        <aside className="absolute bottom-4 left-4 top-4 z-10 flex w-[380px] max-w-[calc(100%-2rem)] flex-col overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-black/5">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div>
              <h1 className="text-lg font-bold text-emerald-700">🌳 GreenAsset</h1>
              <p className="text-xs text-slate-500">Akıllı Şehir Varlık Yönetimi</p>
            </div>
            <button
              onClick={() => setPanelAcik(false)}
              aria-label="Paneli gizle"
              title="Paneli gizle"
              className="rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            >
              ◀
            </button>
          </div>

          <div className="flex border-b border-slate-200">
            <SekmeButonu aktif={sekme === "liste"} onClick={() => setSekme("liste")}>
              Varlıklar
            </SekmeButonu>
            <SekmeButonu aktif={sekme === "ekle"} onClick={() => setSekme("ekle")}>
              Yeni Ekle
            </SekmeButonu>
            <SekmeButonu aktif={sekme === "ozet"} onClick={() => setSekme("ozet")}>
              Özet
            </SekmeButonu>
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
              <p className="mb-3 rounded bg-slate-50 px-3 py-2 text-xs text-slate-600">
                💡 Haritada boş bir noktaya tıklayarak koordinatı otomatik
                doldurabilirsin.
              </p>
              <AssetForm koordinat={koordinat} />
            </div>
          )}

          {sekme === "ozet" && (
            <Dashboard data={gosterilen} alanSecimiAktif={alanSonucu !== null} />
          )}
        </aside>
      ) : (
        <button
          onClick={() => setPanelAcik(true)}
          className="absolute left-4 top-4 z-10 rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-lg ring-1 ring-black/5 transition hover:bg-slate-50"
        >
          ▶ Paneli göster
        </button>
      )}

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
          ? "border-emerald-600 text-emerald-700"
          : "border-transparent text-slate-500 hover:text-slate-700"
      }`}
    >
      {children}
    </button>
  );
}
