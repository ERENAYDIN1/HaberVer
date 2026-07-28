import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { assetsWithin } from "./api/assets";
import { listReports } from "./api/reports";
import { ekipGorevleri as ekipGorevleriGetir } from "./api/saha";
import { ilceSiniri, mahalleSiniri } from "./api/sinirlar";
import { useAuth } from "./auth/AuthContext";
import AssetDetayModal from "./components/AssetDetayModal";
import AssetForm from "./components/AssetForm";
import AssetList from "./components/AssetList";
import BildirimZili, { type Bildirim } from "./components/BildirimZili";
import CizimPaneli from "./components/CizimPaneli";
import Dashboard from "./components/Dashboard";
import {
  IconChartBar,
  IconHistory,
  IconInbox,
  IconLasso,
  IconLogout,
  IconMenu,
  IconPin,
  IconPlus,
  IconRefresh,
  IconRuler,
  IconUsers,
  IconX,
} from "./components/icons";
import HaritaLejant from "./components/HaritaLejant";
import IhbarPaneli from "./components/IhbarPaneli";
import KatmanKontrolu, { type KatmanAnahtari } from "./components/KatmanKontrolu";
import Kenarcubugu, { type KenarOgesi } from "./components/Kenarcubugu";
import { LogoAmblem } from "./components/icons";
import KonumArama from "./components/KonumArama";
import LogPaneli from "./components/LogPaneli";
import MapStilKontrolu from "./components/MapStilKontrolu";
import MapView, { type UcusHedefi } from "./components/MapView";
import Modal from "./components/Modal";
import PersonelYonetimi from "./components/PersonelYonetimi";
import ReportDetayModal from "./components/ReportDetayModal";
import SahaEkipleri from "./components/SahaEkipleri";
import { VARSAYILAN_STIL, type HaritaStilId } from "./data/mapStyles";
import { useAssets } from "./hooks/useAssets";
import { ASSET_TYPE_LABELS, ASSET_TYPES } from "./types/asset";
import { USER_ROLE_LABELS } from "./types/auth";
import type {
  AssetFeature,
  AssetFeatureCollection,
  AssetFilters,
  AssetType,
  MultiPolygonGeometry,
  PolygonGeometry,
} from "./types/asset";
import type { TamamlananAlan } from "./types/alan";
import {
  REPORT_STATUS_LABELS,
  REPORT_STATUSES,
} from "./types/report";
import type {
  ReportFeature,
  ReportFeatureCollection,
  ReportStatus,
} from "./types/report";
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

/** Katman filtresindeki tur/durum rozet renkleri - haritadaki isaretci
 *  renkleriyle birebir ayni (MapView TIP_RENGI_IFADESI / IHBAR_DURUM_RENGI_IFADESI). */
const TIP_RENGI: Record<AssetType, string> = {
  agac: "#059669",
  direk: "#0284c7",
  sulama: "#0891b2",
};
const IHBAR_DURUM_RENGI: Record<ReportStatus, string> = {
  beklemede: "#9333ea",
  onaylandi: "#059669",
  reddedildi: "#e11d48",
};

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
type UstModal = "ozet" | "log" | "personel" | "saha";

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
  // Ihbarlar sekmesinin durum alt-sekmesi (Bekleyen İhbar/Onaylandı/Reddedildi).
  // Burada tutulur ki bir bakim bildirimine tiklaninca dogrudan "onaylandi"ya
  // gecilebilsin ve harita, o an ham ihbar noktalarini mi yoksa onaylanmis
  // ihbarlardan olusan varliklari mi gosterecegini bilsin.
  const [ihbarDurum, setIhbarDurum] = useState<ReportStatus>("beklemede");
  const [duzenlenen, setDuzenlenen] = useState<AssetFeature | null>(null);
  const [koordinat, setKoordinat] = useState<
    { longitude: number; latitude: number } | undefined
  >();
  // Acilista panel kapali gelir: harita tertemiz gorunur, kullanici sol
  // kenardan bir sekme secince ilgili panel acilir.
  const [panelAcik, setPanelAcik] = useState(false);
  const [aktifStilId, setAktifStilId] = useState<HaritaStilId>(VARSAYILAN_STIL);
  // Sol kenar cubugu genis (etiketli) mi - header'daki menu dugmesiyle degisir.
  const [kenarAcik, setKenarAcik] = useState(true);
  // Haritadaki uc genel-bakis katmaninin (varlik/ihbar/saha ekibi) gorunurlugu -
  // sag-ustteki KatmanKontrolu'nden bagimsizca acilip kapatilir. Sekmelerden
  // bagimsizdir: kullanici istedigi kombinasyonu ayni anda gorebilir.
  const [katmanlar, setKatmanlar] = useState<Record<KatmanAnahtari, boolean>>({
    varliklar: true,
    ihbarlar: false,
    ekipler: true,
  });
  const katmanDegistir = useCallback((anahtar: KatmanAnahtari) => {
    setKatmanlar((k) => ({ ...k, [anahtar]: !k[anahtar] }));
  }, []);
  // Varlik katmaninin tur alt-filtresi (haritada hangi turler gorunsun) - tumu acik.
  const [katmanTurleri, setKatmanTurleri] = useState<Record<AssetType, boolean>>({
    agac: true,
    direk: true,
    sulama: true,
  });
  const katmanTuruDegistir = useCallback((anahtar: string) => {
    setKatmanTurleri((t) => ({ ...t, [anahtar]: !t[anahtar as AssetType] }));
  }, []);
  // Ihbar katmaninin durum alt-filtresi - varsayilan yalniz bekleyen ihbarlar
  // (onaylanan/reddedilen genel bakisi kalabalik yapmasin, istenirse acilir).
  const [katmanDurumlari, setKatmanDurumlari] = useState<Record<ReportStatus, boolean>>({
    beklemede: true,
    onaylandi: false,
    reddedildi: false,
  });
  const katmanDurumuDegistir = useCallback((anahtar: string) => {
    setKatmanDurumlari((d) => ({ ...d, [anahtar]: !d[anahtar as ReportStatus] }));
  }, []);

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
    setDetayAsset(null);
    setSeciliIhbarId(null);
    setDetayRapor(null);
    setIhbarDurum("beklemede");
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

  // Onaylanmis ihbarlardan olusan varliklar - "İhbarlar > Onaylandı" sekmesi
  // bunu normal bir varlik listesi gibi gosterir (bkz. IhbarPaneli), harita
  // da bu sekmedeyken ihbar noktasi yerine bu varliklari isaretler.
  const ihbarVarlikSorgu = useAssets({ source: "ihbar" });

  // "İhbarlar > Onaylandı" alt-sekmesinde ham ihbar noktalari yerine, onaylanmis
  // ihbarlardan olusan varliklar (renkli tur isaretcileri) gosterilir.
  const ihbarOnayliGorunumu = aktifSekme === "ihbarlar" && ihbarDurum === "onaylandi";

  // Ihbarlar sekmesinden cikinca (veya panel kapaninca) haritadaki ihbar
  // noktalarini ve secimini temizle.
  useEffect(() => {
    if (aktifSekme !== "ihbarlar") {
      setIhbarlar([]);
      setSeciliIhbarId(null);
      setDetayRapor(null);
    }
  }, [aktifSekme]);

  const haritaTiklandi = useCallback(
    (c: { longitude: number; latitude: number }) => {
      // Bos alana tiklamak (bir varlik ustune degil) her zaman secimi
      // temizler - kullanici secili varligi birakip haritayi sade halde
      // gormek isteyebilir.
      setSeciliId(null);
      setDetayAsset(null);
      setSeciliIhbarId(null);
      setDetayRapor(null);
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
  // tekrar tiklamak secimi iptal eder (toggle). "İhbarlar > Onaylandı"
  // sekmesindeyken secim ayni ekranda kalir (Varliklar sekmesine atlamaz) -
  // bu sekme zaten kendi varlik listesini (ihbardan olusanlar) gosteriyor.
  const varlikSecildi = useCallback(
    (id: string) => {
      setSeciliId((mevcut) => (mevcut === id ? null : id));
      setDetayAsset(null);
      if (!(sekme === "ihbarlar" && ihbarDurum === "onaylandi")) {
        setSekme("liste");
      }
      setPanelAcik(true);
    },
    [sekme, ihbarDurum]
  );

  // Ham ihbar (Bekleyen/Reddedildi) secimi - hem listeden hem haritadan cagrilir.
  const ihbarSecildi = useCallback((id: string) => {
    setSeciliIhbarId((mevcut) => (mevcut === id ? null : id));
    setDetayRapor(null);
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

  // --- Bildirimler (header zili) ------------------------------------------
  // Yalniz admin/calisan ihbarlari yonetir; saha_calisani ihbar gormez.
  const personel = user?.role === "admin" || user?.role === "calisan";
  // Bakim bekleyen varliklar (her iki kaynaktan) - ana listeden bagimsiz sorgu.
  const bakimSorgu = useAssets({ status: "bakim_lazim" });
  // Bekleyen ihbarlar - yalniz personel icin cekilir.
  const bekleyenIhbarSorgu = useQuery({
    queryKey: ["reports", "beklemede"],
    queryFn: () => listReports("beklemede"),
    enabled: personel,
  });
  const bekleyenIhbarSayisi = bekleyenIhbarSorgu.data?.features.length ?? 0;

  // Canli saha ekibi konumlari + kendilerine dusen aktif gorevler - yalniz
  // personel icin. Haritada marker + tiklayinca gorev popup'i, ayrica varlik
  // detayindaki elle atama listesini besler. (EkipGorevleri, EkipOzet'in ust
  // kumesi oldugundan yalniz konum/yuk isteyen tuketiciler de calisir.)
  const ekipSorgu = useQuery({
    queryKey: ["saha", "ekipler"],
    queryFn: ekipGorevleriGetir,
    enabled: personel,
    refetchInterval: 20000,
  });

  // Onaylanan/reddedilen ihbarlar - yalniz ihbar katmani acikken cekilir (genel
  // bakis icin harita uzerinde durum alt-filtresiyle acilip kapanabilir). Bekleyen
  // ihbarlar zaten yukarida (bildirim zili icin) cekiliyor.
  const onaylananIhbarSorgu = useQuery({
    queryKey: ["reports", "onaylandi"],
    queryFn: () => listReports("onaylandi"),
    enabled: personel && katmanlar.ihbarlar,
  });
  const reddedilenIhbarSorgu = useQuery({
    queryKey: ["reports", "reddedildi"],
    queryFn: () => listReports("reddedildi"),
    enabled: personel && katmanlar.ihbarlar,
  });
  const ihbarDurumSorgusu: Record<ReportStatus, typeof bekleyenIhbarSorgu> = {
    beklemede: bekleyenIhbarSorgu,
    onaylandi: onaylananIhbarSorgu,
    reddedildi: reddedilenIhbarSorgu,
  };

  // --- Harita katman verileri (sag-ustteki KatmanKontrolu'ne bagli) --------
  // Sekmelerden bagimsiz: kullanici varlik/ihbar/saha ekibi katmanlarini istedigi
  // kombinasyonda ayni anda haritada gorebilir.
  //
  // Varlik katmani (taban): "Onaylandi" gorunumunde ihbar kaynagi varliklar, aksi
  // halde mevcut (alan/filtre suzulmus) liste. Uzerine tur alt-filtresi uygulanir.
  const varlikKatmanTaban = ihbarOnayliGorunumu ? ihbarVarlikSorgu.data : gosterilen;
  const varlikTurSayilari = useMemo(() => {
    const s: Record<AssetType, number> = { agac: 0, direk: 0, sulama: 0 };
    for (const f of varlikKatmanTaban?.features ?? []) s[f.properties.type] += 1;
    return s;
  }, [varlikKatmanTaban]);
  const varlikKatmanVeri = useMemo<AssetFeatureCollection | undefined>(() => {
    if (!varlikKatmanTaban) return undefined;
    if (ASSET_TYPES.every((t) => katmanTurleri[t])) return varlikKatmanTaban;
    return {
      type: "FeatureCollection",
      features: varlikKatmanTaban.features.filter((f) => katmanTurleri[f.properties.type]),
    };
  }, [varlikKatmanTaban, katmanTurleri]);

  // Ihbar katmani: secili durumlarin (beklemede/onaylandi/reddedildi) ihbarlari
  // birlestirilir (id'ye gore tekillestirilir). Panel secim vurgusu, sekmedeki
  // durumun alt-filtresi otomatik acildigi icin dogal olarak calisir.
  const ihbarKatmanVeri = useMemo<ReportFeatureCollection>(() => {
    const gorulen = new Map<string, ReportFeature>();
    for (const durum of REPORT_STATUSES) {
      if (!katmanDurumlari[durum]) continue;
      for (const f of ihbarDurumSorgusu[durum].data?.features ?? []) {
        gorulen.set(f.properties.id, f);
      }
    }
    return { type: "FeatureCollection", features: [...gorulen.values()] };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    katmanDurumlari,
    bekleyenIhbarSorgu.data,
    onaylananIhbarSorgu.data,
    reddedilenIhbarSorgu.data,
  ]);

  const katmanSayilari: Record<KatmanAnahtari, number> = {
    varliklar: varlikKatmanVeri?.features.length ?? 0,
    ihbarlar: ihbarKatmanVeri.features.length,
    ekipler: ekipSorgu.data?.length ?? 0,
  };

  // Sag-ustteki katman kontrolune gecen alt-filtre tanimlari (etiket/renk/sayi).
  const varlikAltFiltre = useMemo(
    () =>
      ASSET_TYPES.map((t) => ({
        anahtar: t,
        etiket: ASSET_TYPE_LABELS[t],
        renk: TIP_RENGI[t],
        secili: katmanTurleri[t],
        sayi: varlikTurSayilari[t],
      })),
    [katmanTurleri, varlikTurSayilari]
  );
  const ihbarAltFiltre = useMemo(
    () =>
      REPORT_STATUSES.map((d) => ({
        anahtar: d,
        etiket: REPORT_STATUS_LABELS[d],
        renk: IHBAR_DURUM_RENGI[d],
        secili: katmanDurumlari[d],
        sayi: ihbarDurumSorgusu[d].data?.features.length ?? 0,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      katmanDurumlari,
      bekleyenIhbarSorgu.data,
      onaylananIhbarSorgu.data,
      reddedilenIhbarSorgu.data,
    ]
  );

  // Ihbarlar sekmesi acilinca ihbar katmanini + o an bakilan durumun alt-filtresini
  // otomatik goster (panel ve harita uyumlu olsun) - kullanici yine kapatabilir.
  useEffect(() => {
    if (aktifSekme !== "ihbarlar") return;
    setKatmanlar((k) => (k.ihbarlar ? k : { ...k, ihbarlar: true }));
    setKatmanDurumlari((d) => (d[ihbarDurum] ? d : { ...d, [ihbarDurum]: true }));
  }, [aktifSekme, ihbarDurum]);

  // Bir bildirime tiklaninca ilgili varliga git: kaynagina gore dogru sekmeye
  // gec (kayitli -> Varliklar, ihbardan gelen -> İhbarlar > Onaylandı), sec
  // ve haritayi oraya ucur.
  const bildirimVarligaGit = useCallback((asset: AssetFeature) => {
    setTamamlananAlanlar([]);
    if (asset.properties.source === "ihbar") {
      setSekme("ihbarlar");
      setIhbarDurum("onaylandi");
    } else {
      setSekme("liste");
    }
    setPanelAcik(true);
    setSeciliId(asset.properties.id);
    setDetayAsset(null);
    setUcusHedefi({
      anahtar: crypto.randomUUID(),
      tip: "nokta",
      merkez: asset.geometry.coordinates,
      zoom: 16,
    });
  }, []);

  // Bir ihbar bildirimine tiklaninca İhbarlar sekmesini ac, ihbari sec, ucur.
  const bildirimIhbaraGit = useCallback((report: ReportFeature) => {
    setSekme("ihbarlar");
    setPanelAcik(true);
    setSeciliIhbarId(report.properties.id);
    setDetayRapor(null);
    setUcusHedefi({
      anahtar: crypto.randomUUID(),
      tip: "nokta",
      merkez: report.geometry.coordinates,
      zoom: 16,
    });
  }, []);

  const bildirimler = useMemo<Bildirim[]>(() => {
    const liste: Bildirim[] = [];
    for (const f of bakimSorgu.data?.features ?? []) {
      const p = f.properties;
      liste.push({
        id: p.id,
        tip: p.type,
        baslik: `${p.name} bakım bekliyor`,
        altbaslik:
          ASSET_TYPE_LABELS[p.type] + (p.source === "ihbar" ? " · İhbardan" : ""),
        zaman: p.updated_at,
        kategori: "bakim",
        onTikla: () => bildirimVarligaGit(f),
      });
    }
    if (personel) {
      for (const r of bekleyenIhbarSorgu.data?.features ?? []) {
        const p = r.properties;
        liste.push({
          id: p.id,
          tip: p.type,
          baslik: `Yeni ihbar: ${p.name}`,
          altbaslik: p.note?.trim() || ASSET_TYPE_LABELS[p.type],
          zaman: p.created_at,
          kategori: "ihbar",
          onTikla: () => bildirimIhbaraGit(r),
        });
      }
    }
    liste.sort((a, b) => +new Date(b.zaman) - +new Date(a.zaman));
    return liste.slice(0, 30);
  }, [
    bakimSorgu.data,
    bekleyenIhbarSorgu.data,
    personel,
    bildirimVarligaGit,
    bildirimIhbaraGit,
  ]);

  // --- Sol kenar cubugu ogeleri (rol'e gore) ------------------------------
  const kenarAnaOgeler: KenarOgesi[] = [
    {
      id: "liste",
      etiket: "Varlıklar",
      ikon: IconPin,
      onClick: () => sekmeSec("liste"),
      aktif: aktifSekme === "liste",
    },
  ];
  if (personel) {
    kenarAnaOgeler.push(
      {
        id: "ekle",
        etiket: "Ekle",
        ikon: IconPlus,
        onClick: () => sekmeSec("ekle"),
        aktif: aktifSekme === "ekle",
      },
      {
        id: "ihbarlar",
        etiket: "İhbarlar",
        ikon: IconInbox,
        onClick: () => sekmeSec("ihbarlar"),
        aktif: aktifSekme === "ihbarlar",
        rozet: bekleyenIhbarSayisi,
      }
    );
  }

  const kenarYonetimOgeleri: KenarOgesi[] = personel
    ? [
        {
          id: "saha",
          etiket: "Saha Ekipleri",
          ikon: IconUsers,
          onClick: () => setUstModal("saha"),
          aktif: ustModal === "saha",
        },
        {
          id: "ozet",
          etiket: "Özet",
          ikon: IconChartBar,
          onClick: () => setUstModal("ozet"),
          aktif: ustModal === "ozet",
        },
        {
          id: "log",
          etiket: "Geçmiş",
          ikon: IconHistory,
          onClick: () => setUstModal("log"),
          aktif: ustModal === "log",
        },
      ]
    : [];
  if (user?.role === "admin") {
    kenarYonetimOgeleri.push({
      id: "personel",
      etiket: "Personel",
      ikon: IconUsers,
      onClick: () => setUstModal("personel"),
      aktif: ustModal === "personel",
    });
  }

  const kenarAltOgeler: KenarOgesi[] = [
    { id: "temizle", etiket: "Temizle", ikon: IconRefresh, onClick: sifirla },
  ];

  // Secili varlik (detay karti icin) - o an haritada gosterilen koleksiyondan;
  // "İhbarlar > Onaylandı" sekmesindeyken bu koleksiyon ihbardan olusan
  // varliklardir (bkz. ihbarOnayliGorunumu).
  const seciliVarlik = useMemo<AssetFeature | null>(() => {
    const havuz = ihbarOnayliGorunumu ? ihbarVarlikSorgu.data : gosterilen;
    return havuz?.features.find((f) => f.properties.id === seciliId) ?? null;
  }, [gosterilen, ihbarVarlikSorgu.data, ihbarOnayliGorunumu, seciliId]);
  const [detayAsset, setDetayAsset] = useState<AssetFeature | null>(null);

  // Secili ihbar (detay modali icin) - once panelin yukledigi ihbarlarda, yoksa
  // haritadaki ihbar katmani verisinde aranir; boylece ihbar noktasi hangi sekmede
  // gorunuyorsa gorunsun detay acilabilir (katman filtresiyle Varliklar sekmesinde
  // de ihbar noktalari gorulebiliyor).
  const seciliRapor = useMemo<ReportFeature | null>(() => {
    if (!seciliIhbarId) return null;
    return (
      ihbarlar.find((r) => r.properties.id === seciliIhbarId) ??
      ihbarKatmanVeri.features.find((r) => r.properties.id === seciliIhbarId) ??
      null
    );
  }, [ihbarlar, ihbarKatmanVeri, seciliIhbarId]);
  const [detayRapor, setDetayRapor] = useState<ReportFeature | null>(null);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-100">
      {/* Ust bar (uygulama header'i) */}
      <header className="z-20 flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4">
        <div className="flex items-center gap-3">
          {/* Sol kenar cubugunu genislet/daralt (referanstaki hamburger). */}
          <button
            onClick={() => setKenarAcik((v) => !v)}
            aria-label="Menüyü aç/kapat"
            title="Menü"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <IconMenu className="h-5 w-5" />
          </button>

          <div className="flex select-none items-center gap-2">
            <LogoAmblem className="h-10 w-10 shrink-0" />
            <div className="leading-none">
              <h1 className="text-[15px] font-bold tracking-tight text-slate-900">
                Green<span className="text-emerald-600">Asset</span>
              </h1>
              <p className="mt-1 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                Akıllı Şehir Varlık Yönetimi
              </p>
            </div>
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
            className={`flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-medium shadow-sm transition-all hover:shadow-md ${
              olcumModu || olcumNoktalari.length >= 2
                ? "border-blue-600 bg-blue-600 text-white shadow-blue-600/20 hover:bg-blue-500"
                : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-800"
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
            className={`flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-medium shadow-sm transition-all hover:shadow-md ${
              cizimModu || tamamlananAlanlar.length > 0
                ? "border-emerald-600 bg-emerald-600 text-white shadow-emerald-600/20 hover:bg-emerald-500"
                : "border-slate-200 bg-white text-slate-700 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-800"
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

          <BildirimZili bildirimler={bildirimler} />

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
              className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-2 text-sm font-medium text-slate-700 shadow-sm transition-all hover:bg-slate-50 hover:text-red-500 hover:shadow-md"
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

      {/* Govde: sol kenar cubugu + tam ekran harita ve uzerindeki yuzen paneller */}
      <div className="flex min-h-0 flex-1">
        <Kenarcubugu
          genis={kenarAcik}
          ogeler={kenarAnaOgeler}
          yonetimOgeleri={kenarYonetimOgeleri}
          altOgeler={kenarAltOgeler}
        />

        <div className="relative min-h-0 flex-1">
          <MapView
          assets={katmanlar.varliklar ? varlikKatmanVeri : undefined}
          reports={katmanlar.ihbarlar ? ihbarKatmanVeri : undefined}
          seciliIhbarId={seciliIhbarId}
          onIhbarSec={ihbarSecildi}
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
          onVarlikDetay={() => setDetayAsset(seciliVarlik)}
          onIhbarDetay={() => setDetayRapor(seciliRapor)}
          ekipler={katmanlar.ekipler ? ekipSorgu.data : undefined}
        />

        {/* Harita ust-ortasindaki aciklama seridi: varlik turleri + canli sayaclar.
            Yalniz varlik katmani acikken anlamli oldugundan ona bagli gosterilir. */}
        {katmanlar.varliklar && <HaritaLejant data={varlikKatmanVeri} />}

        {/* Sag-ustteki lejant + katman filtresi: varlik/ihbar/saha ekibi
            katmanlarini bagimsizca acip kapatir (genel bakis). */}
        <KatmanKontrolu
          gorunur={katmanlar}
          onDegistir={katmanDegistir}
          sayilar={katmanSayilari}
          varlikAlt={varlikAltFiltre}
          onVarlikAlt={katmanTuruDegistir}
          ihbarAlt={ihbarAltFiltre}
          onIhbarAlt={katmanDurumuDegistir}
        />

        <MapStilKontrolu aktifId={aktifStilId} onSec={setAktifStilId} />

        {/* Aktif sekmenin yuzen paneli - sol kenar cubugunun hemen sagindan acilir. */}
        {panelAcik && (
          <div className="absolute bottom-4 left-4 top-4 z-20 flex w-[360px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white/95 shadow-2xl backdrop-blur-sm">
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
                  durum={ihbarDurum}
                  onDurumChange={setIhbarDurum}
                  onVarlikOlustu={() =>
                    queryClient.invalidateQueries({ queryKey: ["assets"] })
                  }
                  onIhbarlarChange={setIhbarlar}
                  seciliRaporId={seciliIhbarId}
                  onRaporSec={ihbarSecildi}
                  ihbarVarlikSorgu={ihbarVarlikSorgu}
                  seciliVarlikId={seciliId}
                  onVarlikSec={varlikSecildi}
                />
              )}
            </div>
          </div>
        )}

        </div>
      </div>

      {/* Varlik/ihbar detayi artik sol-altta yer kaplayan ayri bir kart yerine
          tek, ortalanmis bir modalde gosterilir - haritadaki popup'taki
          "Detaylari Gor" ve listedeki "Detay" butonu ayni modali acar. */}
      <AssetDetayModal
        asset={detayAsset}
        onKapat={() => setDetayAsset(null)}
        atayabilir={personel}
        ekipler={ekipSorgu.data}
        onAtandi={() =>
          queryClient.invalidateQueries({ queryKey: ["saha", "ekipler"] })
        }
      />
      <ReportDetayModal report={detayRapor} onKapat={() => setDetayRapor(null)} />

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

      <Modal
        acik={ustModal === "saha"}
        baslik="Saha Ekipleri"
        genis
        icerikSinifi="flex h-[70vh] flex-col"
        onKapat={() => setUstModal(null)}
      >
        {personel && <SahaEkipleri />}
      </Modal>
    </div>
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
