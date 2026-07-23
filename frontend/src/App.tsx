import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { assetsWithin } from "./api/assets";
import { ilceSiniri } from "./api/sinirlar";
import { useAuth } from "./auth/AuthContext";
import AssetForm from "./components/AssetForm";
import AssetList from "./components/AssetList";
import CizimPaneli from "./components/CizimPaneli";
import Dashboard from "./components/Dashboard";
import {
  IconChevronLeft,
  IconChevronRight,
  IconLasso,
  IconLogout,
  IconRuler,
  IconTree,
} from "./components/icons";
import IhbarPaneli from "./components/IhbarPaneli";
import KonumArama from "./components/KonumArama";
import MapStilKontrolu from "./components/MapStilKontrolu";
import MapView, { type UcusHedefi } from "./components/MapView";
import Modal from "./components/Modal";
import PersonelYonetimi from "./components/PersonelYonetimi";
import { VARSAYILAN_STIL, type HaritaStilId } from "./data/mapStyles";
import { useAssets } from "./hooks/useAssets";
import { USER_ROLE_LABELS } from "./types/auth";
import type {
  AssetFeature,
  AssetFeatureCollection,
  AssetFilters,
  MultiPolygonGeometry,
  PolygonGeometry,
} from "./types/asset";
import type { TamamlananAlan } from "./types/alan";
import {
  mesafeEtiketi,
  poligonAlaniM2,
  poligonSinirKutusu,
  toplamMesafeMetre,
} from "./utils/geo";

/** Il/ilce sinir secimi de bir "tamamlanan alan" olarak temsil edilir; bu sabit
 *  id sayesinde yeni bir il/ilce secilince oncekinin yerine gecer. */
const IDARI_ALAN_ID = "idari-sinir";
const IDARI_ALAN_RENK = "#0891b2";

/** Halka listesinden (MultiPolygon parcalari) backend'e gonderilecek GeoJSON
 *  geometrisini uretir. Tek halkalı alanlarda (kullanicinin cizdigi alanlar)
 *  duz bir Polygon, birden fazla halkalı alanlarda (orn. Bogaz'la ikiye
 *  bolunmus il siniri) bir MultiPolygon dondurur. */
function halkalarGeometrisi(
  halkalar: [number, number][][]
): PolygonGeometry | MultiPolygonGeometry {
  if (halkalar.length === 1) {
    const halka = halkalar[0];
    return { type: "Polygon", coordinates: [[...halka, halka[0]]] };
  }
  return {
    type: "MultiPolygon",
    coordinates: halkalar.map((halka) => [[...halka, halka[0]]]),
  };
}

type Sekme = "liste" | "ekle" | "ozet" | "ihbarlar" | "personel";

export default function App() {
  const { user, cikisYap } = useAuth();
  const queryClient = useQueryClient();
  // Varsayilan olarak "kayitli" varliklar gosterilir; ihbardan gelenler ayri
  // sekmede tutulur ki iki kaynak birbirine karismasin.
  const [filters, setFilters] = useState<AssetFilters>({ source: "kayitli" });
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

  // --- Ilce sinirina gore filtreleme + harita arama (proje kapsami Istanbul
  //     ile sinirli oldugundan il secimi yok, dogrudan ilceye gore filtrelenir) ---
  const [ilceKodu, setIlceKodu] = useState<string | null>(null);
  const [idariHatasi, setIdariHatasi] = useState<string | null>(null);
  const [ucusHedefi, setUcusHedefi] = useState<UcusHedefi | null>(null);
  const [haritaGorunumu, setHaritaGorunumu] = useState<
    [[number, number], [number, number]] | null
  >(null);
  /** Secili ilcenin sinir kutusu; verilince arama bu bolgeyle SINIRLANIR
   *  (sadece oncelik degil) - "GOP secip Kucukkoy aradiginda Besiktas cikmasin". */
  const [idariSinirKutusu, setIdariSinirKutusu] = useState<
    [[number, number], [number, number]] | null
  >(null);

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
      // Bos alana tiklamak (bir varlik ustune degil) her zaman secimi
      // temizler - kullanici secili varligi birakip haritayi sade halde
      // gormek isteyebilir.
      setSeciliId(null);
      // Saha calisaninin yeni varlik ekleme yetkisi yok; "Ekle" sekmesi de
      // gizli, bu yuzden bos alana tiklamasi bunun disinda bir seyi
      // degistirmemeli.
      if (user?.role === "saha_calisani") return;
      setKoordinat(c);
      setSekme("ekle");
      setPanelAcik(true);
    },
    [user?.role]
  );

  // Hem listeden hem haritadan cagrilir; zaten secili olan bir varliga
  // tekrar tiklamak secimi iptal eder (toggle).
  const varlikSecildi = useCallback((id: string) => {
    setSeciliId((mevcut) => (mevcut === id ? null : id));
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
    if (id === IDARI_ALAN_ID) {
      setIlceKodu(null);
    }
  };

  const tumAlanlariTemizle = () => {
    setTamamlananAlanlar([]);
    setIlceKodu(null);
  };

  const alanSecimiTamamla = async () => {
    if (cizimNoktalari.length < 3) return;
    setAlanYukleniyor(true);
    setAlanHatasi(null);
    try {
      const sonuc = await assetsWithin({
        polygon: halkalarGeometrisi([cizimNoktalari]),
        ...filters,
      });
      setTamamlananAlanlar((a) => [
        ...a,
        {
          id: crypto.randomUUID(),
          noktalar: [cizimNoktalari],
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

  // Filtreler degistiginde, tamamlanmis alanlarin da uzerinde durdugu sorgu
  // sonuclarini yeniden getir - aksi halde alan secildikten sonra filtreler
  // donmus (alan tamamlandigi andaki) sonuclara bakmaya devam eder.
  const filtreIstekSirasiRef = useRef(0);
  useEffect(() => {
    if (tamamlananAlanlar.length === 0) return;
    const siraNo = ++filtreIstekSirasiRef.current;

    Promise.all(
      tamamlananAlanlar.map(async (alan) => {
        const sonuc = await assetsWithin({
          polygon: halkalarGeometrisi(alan.noktalar),
          ...filters,
        });
        return { ...alan, sonuc };
      })
    )
      .then((guncellenmis) => {
        // Bu sirada baska bir filtre degisikligi baslamissa, eski sonucu yoksay.
        if (filtreIstekSirasiRef.current === siraNo) setTamamlananAlanlar(guncellenmis);
      })
      .catch((e) => {
        if (filtreIstekSirasiRef.current === siraNo) setAlanHatasi((e as Error).message);
      });
    // tamamlananAlanlar kasitli olarak bagimlilik disi: yeni alan eklendiginde
    // zaten guncel filtreyle sorgulaniyor, burada sadece filtre degisince tetiklenmeli.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  // Ilce secimi degisince sinir geometrisini getirir, mevcut alan
  // altyapisina (tamamlananAlanlar) idari-sinir-id'siyle ekler/degistirir ve
  // haritayi o bolgeye ucurur. Filtreler degisince zaten yukaridaki efekt bu
  // girdiyi de yeniden sorgular (noktalar uzerinden calisiyor).
  useEffect(() => {
    if (!ilceKodu) {
      setTamamlananAlanlar((a) => a.filter((alan) => alan.id !== IDARI_ALAN_ID));
      setIdariSinirKutusu(null);
      return;
    }
    let iptal = false;
    setIdariHatasi(null);

    (async () => {
      try {
        const sinir = await ilceSiniri(ilceKodu);
        if (iptal) return;
        const sonuc = await assetsWithin({
          polygon: halkalarGeometrisi(sinir.noktalar),
          ...filters,
        });
        if (iptal) return;
        setTamamlananAlanlar((a) => [
          ...a.filter((alan) => alan.id !== IDARI_ALAN_ID),
          {
            id: IDARI_ALAN_ID,
            noktalar: sinir.noktalar,
            renk: IDARI_ALAN_RENK,
            sonuc,
            etiket: sinir.ad,
          },
        ]);
        const kutu = poligonSinirKutusu(sinir.noktalar.flat());
        setIdariSinirKutusu(kutu);
        setUcusHedefi({ anahtar: crypto.randomUUID(), tip: "sinir", bounds: kutu });
      } catch (e) {
        if (!iptal) setIdariHatasi((e as Error).message);
      }
    })();

    return () => {
      iptal = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ilceKodu]);

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
          <KonumArama
            gorunenAlan={haritaGorunumu}
            zorunluAlan={idariSinirKutusu}
            onSecildi={(konum) =>
              setUcusHedefi({
                anahtar: crypto.randomUUID(),
                tip: "nokta",
                merkez: konum,
                zoom: 16,
              })
            }
          />

          {/* Mesafe olcum kontrolu - detaylar alt ortadaki arac panelinde */}
          <button
            onClick={olcumModu ? olcumIptal : olcumBaslat}
            className={`flex items-center gap-1.5 border px-3 py-1.5 text-sm font-medium transition ${
              olcumModu || olcumNoktalari.length >= 2
                ? "border-blue-600 bg-blue-600 text-white hover:bg-blue-700"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            <IconRuler
              className={`h-3.5 w-3.5 ${
                olcumModu || olcumNoktalari.length >= 2 ? "" : "text-blue-500"
              }`}
            />
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
            <IconLasso
              className={`h-3.5 w-3.5 ${
                cizimModu || tamamlananAlanlar.length > 0 ? "" : "text-emerald-500"
              }`}
            />
            {cizimModu
              ? "Çiziliyor…"
              : tamamlananAlanlar.length > 0
                ? `${tamamlananAlanlar.length} alan seçili`
                : "Alan seç"}
          </button>

          <div className="mx-1 h-6 w-px bg-slate-200" />

          <div className="flex items-center gap-2">
            <div className="text-right leading-tight">
              <p className="text-xs font-medium text-slate-700">
                {user?.full_name || user?.email}
              </p>
              {user && (
                <p className="text-[11px] text-slate-400">
                  {USER_ROLE_LABELS[user.role]}
                </p>
              )}
            </div>
            <button
              onClick={cikisYap}
              title="Çıkış yap"
              className="flex items-center gap-1.5 border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              <IconLogout className="h-3.5 w-3.5" />
            </button>
          </div>
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
              {(
                [
                  { id: "liste", etiket: "Varlıklar" },
                  // Saha calisani tam CRUD/onay yetkisine sahip degil; sadece
                  // varliklari gorup "Tamir Edildi" isaretleyebilir.
                  ...(user?.role !== "saha_calisani"
                    ? [
                        { id: "ekle", etiket: "Ekle" },
                        { id: "ozet", etiket: "Özet" },
                        { id: "ihbarlar", etiket: "İhbarlar" },
                      ]
                    : []),
                  ...(user?.role === "admin"
                    ? [{ id: "personel", etiket: "Personel" }]
                    : []),
                ] as { id: Sekme; etiket: string }[]
              ).map((s) => (
                <SekmeButonu
                  key={s.id}
                  aktif={sekme === s.id}
                  onClick={() => setSekme(s.id)}
                >
                  {s.etiket}
                </SekmeButonu>
              ))}
              <button
                onClick={() => setPanelAcik(false)}
                aria-label="Paneli gizle"
                title="Paneli gizle"
                className="flex items-center border-l border-slate-300 px-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
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
                onSec={varlikSecildi}
                onDuzenle={setDuzenlenen}
                ilceKodu={ilceKodu}
                onIlceSec={setIlceKodu}
                idariHatasi={idariHatasi}
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

            {sekme === "ihbarlar" && (
              <IhbarPaneli
                onVarlikOlustu={() =>
                  queryClient.invalidateQueries({ queryKey: ["assets"] })
                }
              />
            )}

            {sekme === "personel" && user?.role === "admin" && <PersonelYonetimi />}
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
            ucusHedefi={ucusHedefi}
            onGorunumDegisti={setHaritaGorunumu}
          />

          <MapStilKontrolu aktifId={aktifStilId} onSec={setAktifStilId} />

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
      className={`flex-1 whitespace-nowrap border-b-2 px-2 py-2.5 text-[13px] font-medium transition ${
        aktif
          ? "border-emerald-600 bg-white text-slate-900"
          : "border-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-700"
      }`}
    >
      {children}
    </button>
  );
}
