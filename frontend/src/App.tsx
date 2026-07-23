import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { assetsWithin } from "./api/assets";
import { ilceSiniri, mahalleSiniri } from "./api/sinirlar";
import { useAuth } from "./auth/AuthContext";
import AssetForm from "./components/AssetForm";
import AssetList from "./components/AssetList";
import CizimPaneli from "./components/CizimPaneli";
import Dashboard from "./components/Dashboard";
import {
  IconChartBar,
  IconHistory,
  IconInbox,
  IconLasso,
  IconLogout,
  IconPin,
  IconPlus,
  IconRefresh,
  IconRuler,
  IconTree,
  IconUsers,
  IconX,
} from "./components/icons";
import IhbarPaneli from "./components/IhbarPaneli";
import KonumArama from "./components/KonumArama";
import LogPaneli from "./components/LogPaneli";
import MapStilKontrolu from "./components/MapStilKontrolu";
import MapView, { type UcusHedefi } from "./components/MapView";
import Modal from "./components/Modal";
import PersonelYonetimi from "./components/PersonelYonetimi";
import SekmeCubugu, { type SekmeKutucugu } from "./components/SekmeCubugu";
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
import type { ReportFeature, ReportFeatureCollection } from "./types/report";
import {
  mesafeEtiketi,
  poligonAlaniM2,
  poligonSinirKutusu,
  toplamMesafeMetre,
} from "./utils/geo";
import { ISTANBUL_MERKEZI } from "./utils/istanbulMaskesi";

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

/** Sol paneldeki sekmeler. Ozet/Gecmis/Personel artik burada degil; ust
 *  bardaki butonlardan modal olarak aciliyor (bkz. UstModal). */
type Sekme = "liste" | "ekle" | "ihbarlar";

/** Her sekmenin kendi ikonu ve rengi var, boyle sekmeler tek bakista
 *  birbirinden ayirt edilebiliyor (hepsi ayni emerald tonuydu). */
const SEKME_TANIMLARI: Record<
  Sekme,
  { etiket: string; ikon: (p: { className?: string }) => React.ReactElement; renk: string }
> = {
  liste: { etiket: "Varlıklar", ikon: IconPin, renk: "emerald" },
  ekle: { etiket: "Ekle", ikon: IconPlus, renk: "blue" },
  ihbarlar: { etiket: "İhbarlar", ikon: IconInbox, renk: "amber" },
};

/** Ust bardan modal olarak acilan yonetim/raporlama ekranlari. */
type UstModal = "ozet" | "log" | "personel";

export default function App() {
  const { user, cikisYap } = useAuth();
  const queryClient = useQueryClient();
  // Varsayilan olarak "kayitli" varliklar gosterilir; ihbardan gelenler ayri
  // sekmede tutulur ki iki kaynak birbirine karismasin.
  const [filters, setFilters] = useState<AssetFilters>({ source: "kayitli" });
  const [sekme, setSekme] = useState<Sekme>("liste");
  const [ustModal, setUstModal] = useState<UstModal | null>(null);
  const [seciliId, setSeciliId] = useState<string | null>(null);
  // "İhbarlar" sekmesindeki ihbarlar haritada gosterilir (IhbarPaneli'den yukari
  // tasinir); secili ihbara tiklaninca harita oraya ucar.
  const [ihbarlar, setIhbarlar] = useState<ReportFeature[]>([]);
  const [seciliIhbarId, setSeciliIhbarId] = useState<string | null>(null);
  const [duzenlenen, setDuzenlenen] = useState<AssetFeature | null>(null);
  const [koordinat, setKoordinat] = useState<
    { longitude: number; latitude: number } | undefined
  >();
  // Acilista panel kapali gelir: harita tertemiz gorunur, kullanici bir
  // kutucuga tiklayinca ilgili panel acilir.
  const [panelAcik, setPanelAcik] = useState(false);
  const [aktifStilId, setAktifStilId] = useState<HaritaStilId>(VARSAYILAN_STIL);

  // Sol çubuktaki kutucuklar rol'e göre; saha çalışanı yalnızca "Varlıklar"ı görür.
  const kutucuklar = useMemo<SekmeKutucugu<Sekme>[]>(() => {
    const ids: Sekme[] =
      user?.role === "saha_calisani" ? ["liste"] : ["liste", "ekle", "ihbarlar"];
    return ids.map((id) => ({ id, ...SEKME_TANIMLARI[id] }));
  }, [user?.role]);

  // Panel kapalıyken hiçbir sekme "aktif" sayılmaz (harita sade kalır; ihbar
  // noktaları gizlenir, boş haritaya tıklama Ekle formuna düşmez).
  const aktifSekme: Sekme | null = panelAcik ? sekme : null;

  // Kutucuğa tıklama: yeni sekme açar, aynı (aktif) kutucuğa tekrar tıklamak paneli kapatır.
  const sekmeSec = (id: Sekme) => {
    if (panelAcik && sekme === id) {
      setPanelAcik(false);
      return;
    }
    setSekme(id);
    setPanelAcik(true);
  };

  // "Temizle": tüm çalışma durumunu (seçimler, filtreler, çizim/ölçüm, ilçe/
  // mahalle, açık panel) sitenin ilk açıldığı hale döndürür ve haritayı
  // İstanbul başlangıç görünümüne (merkez + zoom 11) geri uçurur.
  const sifirla = () => {
    setFilters({ source: "kayitli" });
    setSekme("liste");
    setPanelAcik(false);
    setUstModal(null);
    setSeciliId(null);
    setSeciliIhbarId(null);
    setDuzenlenen(null);
    setKoordinat(undefined);
    setCizimModu(false);
    setCizimNoktalari([]);
    setAlanHatasi(null);
    setOlcumModu(false);
    setOlcumNoktalari([]);
    setTamamlananAlanlar([]);
    setIlceKodu(null);
    setMahalleKodu(null);
    setIdariHatasi(null);
    setIdariSinirKutusu(null);
    setUcusHedefi({
      anahtar: crypto.randomUUID(),
      tip: "nokta",
      merkez: ISTANBUL_MERKEZI,
      zoom: 11,
    });
  };

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

  // --- Ilce/mahalle sinirina gore filtreleme + harita arama (proje kapsami
  //     Istanbul ile sinirli oldugundan il secimi yok; once ilceye, ilce
  //     secilince kademeli olarak mahalleye kadar filtrelenebilir) ---
  const [ilceKodu, setIlceKodu] = useState<string | null>(null);
  const [mahalleKodu, setMahalleKodu] = useState<string | null>(null);
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

  // "İhbarlar" sekmesi aktifken (panel açık) harita, varliklar yerine ihbar
  // noktalarini gosterir; diger sekmelerde / panel kapalıyken varliklar gorunur.
  const ihbarSekmesi = aktifSekme === "ihbarlar";
  const ihbarKoleksiyonu = useMemo<ReportFeatureCollection>(
    () => ({ type: "FeatureCollection", features: ihbarlar }),
    [ihbarlar]
  );

  // Ihbarlar sekmesinden cikinca (veya panel kapaninca) haritadaki ihbar
  // noktalarini ve secimini temizle.
  useEffect(() => {
    if (aktifSekme !== "ihbarlar") {
      setIhbarlar([]);
      setSeciliIhbarId(null);
    }
  }, [aktifSekme]);

  const haritaTiklandi = useCallback(
    (c: { longitude: number; latitude: number }) => {
      // Bos alana tiklamak (bir varlik ustune degil) her zaman secimi
      // temizler - kullanici secili varligi birakip haritayi sade halde
      // gormek isteyebilir.
      setSeciliId(null);
      setSeciliIhbarId(null);
      // Saha calisaninin yeni varlik ekleme yetkisi yok; "Ekle" sekmesi de
      // gizli. Ihbarlar sekmesindeyken de bos alan tiklamasi "Ekle" formuna
      // dusmemeli (o an harita ihbar noktalarini gosteriyor).
      if (user?.role === "saha_calisani" || aktifSekme === "ihbarlar") return;
      setKoordinat(c);
      setSekme("ekle");
      setPanelAcik(true);
    },
    [user?.role, aktifSekme]
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
      setMahalleKodu(null);
    }
  };

  const tumAlanlariTemizle = () => {
    setTamamlananAlanlar([]);
    setIlceKodu(null);
    setMahalleKodu(null);
  };

  // Ilce degisince mahalle secimini sifirla (eski mahalle baska ilceden kalmasin).
  const ilceSec = (kod: string | null) => {
    setIlceKodu(kod);
    setMahalleKodu(null);
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

  // Ilce/mahalle secimi degisince aktif idari sinir geometrisini getirir,
  // mevcut alan altyapisina (tamamlananAlanlar) idari-sinir-id'siyle ekler/
  // degistirir ve haritayi o bolgeye ucurur. Aktif sinir: bir mahalle secildiyse
  // mahalle (daha ince), yoksa ilce, yoksa hicbiri. Filtreler degisince zaten
  // yukaridaki efekt bu girdiyi de yeniden sorgular (noktalar uzerinden).
  useEffect(() => {
    if (!ilceKodu && !mahalleKodu) {
      setTamamlananAlanlar((a) => a.filter((alan) => alan.id !== IDARI_ALAN_ID));
      setIdariSinirKutusu(null);
      return;
    }
    let iptal = false;
    setIdariHatasi(null);

    (async () => {
      try {
        const sinir = mahalleKodu
          ? await mahalleSiniri(mahalleKodu)
          : await ilceSiniri(ilceKodu!);
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
  }, [ilceKodu, mahalleKodu]);

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
        <div className="flex items-center gap-4">
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

          {/* Yonetim/raporlama ekranlari - haritanin yaninda durmasi gerekmedigi
              icin sol panelden alinip ust bara tasindi, modal olarak acilir.
              Saha calisani bunlari gormez (tam CRUD/onay yetkisi yok). */}
          {user?.role !== "saha_calisani" && (
            <nav className="flex items-center gap-1 border-l border-slate-200 pl-3">
              <UstBarButonu
                ikon={IconChartBar}
                onClick={() => setUstModal("ozet")}
              >
                Özet
              </UstBarButonu>
              <UstBarButonu
                ikon={IconHistory}
                onClick={() => setUstModal("log")}
              >
                Geçmiş
              </UstBarButonu>
              {user?.role === "admin" && (
                <UstBarButonu
                  ikon={IconUsers}
                  onClick={() => setUstModal("personel")}
                >
                  Personel
                </UstBarButonu>
              )}
            </nav>
          )}
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
                : "border-blue-200 bg-blue-50 text-blue-800 hover:border-blue-300 hover:bg-blue-100"
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
                : "border-emerald-200 bg-emerald-50 text-emerald-800 hover:border-emerald-300 hover:bg-emerald-100"
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

      {/* Govde: tam ekran harita + uzerinde yuzen sol arac cubugu ve panel */}
      <div className="relative min-h-0 flex-1">
        <MapView
          assets={ihbarSekmesi ? undefined : gosterilen}
          reports={ihbarSekmesi ? ihbarKoleksiyonu : undefined}
          seciliIhbarId={seciliIhbarId}
          onIhbarSec={(id) =>
            setSeciliIhbarId((mevcut) => (mevcut === id ? null : id))
          }
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

        {/* Sol kenardaki yuzen kutucuklar (Varliklar / Ekle / Ihbarlar).
            Etiket balonlari yalnizca panel kapaliyken gosterilir ki acik
            panelin uzerine tasmasinlar. */}
        <SekmeCubugu
          kutucuklar={kutucuklar}
          aktif={aktifSekme}
          onSec={sekmeSec}
          etiketleriGoster={!panelAcik}
          altAksiyon={{ etiket: "Temizle", ikon: IconRefresh, onClick: sifirla }}
        />

        {/* Aktif sekmenin yuzen paneli - kutucuklarin hemen sagindan acilir. */}
        {panelAcik && (
          <div className="absolute bottom-4 left-[76px] top-4 z-20 flex w-[360px] max-w-[calc(100vw-6rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white/95 shadow-2xl backdrop-blur-sm">
            <div
              className={`flex shrink-0 items-center justify-between border-b px-3.5 py-2.5 ${SEKME_RENK_SINIFLARI[SEKME_TANIMLARI[sekme].renk].aktif}`}
            >
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/70">
                  {(() => {
                    const Ikon = SEKME_TANIMLARI[sekme].ikon;
                    return (
                      <Ikon
                        className={`h-4 w-4 ${SEKME_RENK_SINIFLARI[SEKME_TANIMLARI[sekme].renk].ikonAktif}`}
                      />
                    );
                  })()}
                </span>
                <h2 className="text-sm font-semibold">
                  {SEKME_TANIMLARI[sekme].etiket}
                </h2>
              </div>
              <button
                onClick={() => setPanelAcik(false)}
                aria-label="Paneli kapat"
                title="Paneli kapat"
                className="flex h-6 w-6 items-center justify-center rounded-lg opacity-70 transition hover:bg-white/60 hover:opacity-100"
              >
                <IconX className="h-4 w-4" />
              </button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col">
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
                  onIlceSec={ilceSec}
                  mahalleKodu={mahalleKodu}
                  onMahalleSec={setMahalleKodu}
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

              {sekme === "ihbarlar" && (
                <IhbarPaneli
                  onVarlikOlustu={() =>
                    queryClient.invalidateQueries({ queryKey: ["assets"] })
                  }
                  onIhbarlarChange={setIhbarlar}
                  seciliId={seciliIhbarId}
                  onIhbarSec={(id) =>
                    setSeciliIhbarId((mevcut) => (mevcut === id ? null : id))
                  }
                />
              )}
            </div>
          </div>
        )}
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

      {/* Ust bardan acilan yonetim/raporlama ekranlari (modal olarak). */}
      <Modal
        acik={ustModal === "ozet"}
        baslik="Özet"
        genis
        icerikSinifi=""
        onKapat={() => setUstModal(null)}
      >
        <Dashboard data={gosterilen} alanSecimiAktif={tamamlananAlanlar.length > 0} />
      </Modal>

      <Modal
        acik={ustModal === "log"}
        baslik="İşlem Geçmişi"
        genis
        icerikSinifi="flex h-[70vh] flex-col"
        onKapat={() => setUstModal(null)}
      >
        <LogPaneli />
      </Modal>

      <Modal
        acik={ustModal === "personel"}
        baslik="Personel Yönetimi"
        genis
        icerikSinifi="flex h-[70vh] flex-col"
        onKapat={() => setUstModal(null)}
      >
        {user?.role === "admin" && <PersonelYonetimi />}
      </Modal>
    </div>
  );
}

/** Ust bardaki (GreenAsset yazisinin yanindaki) yonetim ekrani butonu. */
function UstBarButonu({
  ikon: Ikon,
  onClick,
  children,
}: {
  ikon: (p: { className?: string }) => React.ReactElement;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 border border-transparent px-2.5 py-1.5 text-[13px] font-medium text-slate-600 transition hover:border-slate-200 hover:bg-slate-50 hover:text-slate-900"
    >
      <Ikon className="h-3.5 w-3.5 text-slate-400" />
      {children}
    </button>
  );
}

/** Sekme renklerine gore tam Tailwind sinif adlari - Tailwind'in JIT
 *  taramasi dinamik `border-${renk}-600` gibi sablon dizgilerini
 *  yakalayamadigindan siniflar burada tam metin olarak tutulur. */
const SEKME_RENK_SINIFLARI: Record<
  string,
  { aktif: string; ikonAktif: string; ikonPasif: string }
> = {
  emerald: {
    aktif: "border-emerald-600 bg-emerald-50/60 text-emerald-900",
    ikonAktif: "text-emerald-600",
    ikonPasif: "text-emerald-400",
  },
  blue: {
    aktif: "border-blue-600 bg-blue-50/60 text-blue-900",
    ikonAktif: "text-blue-600",
    ikonPasif: "text-blue-400",
  },
  violet: {
    aktif: "border-violet-600 bg-violet-50/60 text-violet-900",
    ikonAktif: "text-violet-600",
    ikonPasif: "text-violet-400",
  },
  amber: {
    aktif: "border-amber-600 bg-amber-50/60 text-amber-900",
    ikonAktif: "text-amber-600",
    ikonPasif: "text-amber-400",
  },
  indigo: {
    aktif: "border-indigo-600 bg-indigo-50/60 text-indigo-900",
    ikonAktif: "text-indigo-600",
    ikonPasif: "text-indigo-400",
  },
  slate: {
    aktif: "border-slate-600 bg-slate-100/60 text-slate-900",
    ikonAktif: "text-slate-600",
    ikonPasif: "text-slate-400",
  },
};
