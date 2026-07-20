import { useCallback, useState } from "react";

import AssetForm from "./components/AssetForm";
import AssetList from "./components/AssetList";
import MapView from "./components/MapView";
import Modal from "./components/Modal";
import { useAssets } from "./hooks/useAssets";
import type { AssetFeature, AssetFilters } from "./types/asset";

type Sekme = "liste" | "ekle";

export default function App() {
  const [filters, setFilters] = useState<AssetFilters>({});
  const [sekme, setSekme] = useState<Sekme>("liste");
  const [seciliId, setSeciliId] = useState<string | null>(null);
  const [duzenlenen, setDuzenlenen] = useState<AssetFeature | null>(null);
  const [koordinat, setKoordinat] = useState<
    { longitude: number; latitude: number } | undefined
  >();
  const [panelAcik, setPanelAcik] = useState(true);

  const { data, isLoading, isError, error } = useAssets(filters);

  // Haritada bos alana tiklanirsa koordinati forma tasi ve ekleme sekmesine gec.
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

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      {/* Arka planda tam ekran harita */}
      <div className="absolute inset-0">
        <MapView
          assets={data}
          seciliId={seciliId}
          onVarlikSec={varlikSecildi}
          onHaritaTikla={haritaTiklandi}
        />
      </div>

      {/* Harita uzerinde kayan panel */}
      {panelAcik ? (
        <aside className="absolute left-4 top-4 bottom-4 z-10 flex w-[380px] max-w-[calc(100%-2rem)] flex-col overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-black/5">
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
            <SekmeButonu
              aktif={sekme === "liste"}
              onClick={() => setSekme("liste")}
            >
              Varlıklar
            </SekmeButonu>
            <SekmeButonu aktif={sekme === "ekle"} onClick={() => setSekme("ekle")}>
              Yeni Ekle
            </SekmeButonu>
          </div>

          {sekme === "liste" ? (
            <AssetList
              data={data}
              isLoading={isLoading}
              isError={isError}
              error={error as Error | null}
              filters={filters}
              onFiltersChange={setFilters}
              seciliId={seciliId}
              onSec={setSeciliId}
              onDuzenle={setDuzenlenen}
            />
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <p className="mb-3 rounded bg-slate-50 px-3 py-2 text-xs text-slate-600">
                💡 Haritada boş bir noktaya tıklayarak koordinatı otomatik
                doldurabilirsin.
              </p>
              <AssetForm koordinat={koordinat} />
            </div>
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
      className={`flex-1 border-b-2 px-4 py-2.5 text-sm font-medium transition ${
        aktif
          ? "border-emerald-600 text-emerald-700"
          : "border-transparent text-slate-500 hover:text-slate-700"
      }`}
    >
      {children}
    </button>
  );
}
