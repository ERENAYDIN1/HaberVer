import { useQuery, useQueryClient } from "@tanstack/react-query";
import type maplibregl from "maplibre-gl";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getAsset } from "./api/assets";
import { bolgeler as bolgeleriGetir } from "./api/bolgeler";
import { bolgeGuncelle } from "./api/bolgeler";
import {
  ekipGorevleri as ekipGorevleriGetir,
  havuz as havuzGetir,
} from "./api/saha";
import { useAuth } from "./auth/AuthContext";
import {
  useCanliGuncelleme,
  YEDEK_YOKLAMA_MS,
} from "./hooks/useCanliGuncelleme";
import AssetDetayModal from "./components/AssetDetayModal";
import AssetForm from "./components/AssetForm";
import AssetList from "./components/AssetList";
import BildirimZili, { type Bildirim } from "./components/BildirimZili";
import BolgeDetayModal from "./components/BolgeDetayModal";
import BolgeKaydetModal, { type BolgeTaslagi } from "./components/BolgeKaydetModal";
import BolgePaneli from "./components/BolgePaneli";
import BolgeSekilPaneli from "./components/BolgeSekilPaneli";
import CizimPaneli from "./components/CizimPaneli";
import { EklePaneli, type EkleKipi } from "./components/EklePaneli";
import Dashboard from "./components/Dashboard";
import DepartmanEtiketi from "./components/DepartmanEtiketi";
import DepartmanYonetimi from "./components/DepartmanYonetimi";
import {
  IconChartBar,
  IconHistory,
  IconInbox,
  IconLasso,
  IconLayers,
  IconLogout,
  IconMenu,
  IconPin,
  IconPlus,
  IconRefresh,
  IconRoute,
  IconUsers,
  IconX,
} from "./components/icons";
import TalepPaneli from "./components/TalepPaneli";
import KatmanKontrolu, {
  type AltGrup,
  type KatmanAnahtari,
} from "./components/KatmanKontrolu";
import Kenarcubugu, { type KenarOgesi } from "./components/Kenarcubugu";
import AltSekmeCubugu, {
  ALT_CUBUK_YUKSEKLIGI,
} from "./components/mobil/AltSekmeCubugu";
import Sheet from "./components/mobil/Sheet";
import { useMobil } from "./hooks/useMobil";
import { HaberVerLogo } from "./components/icons";
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
import { useAlanSecimi } from "./hooks/useAlanSecimi";
import { useTalepGorunumleri } from "./hooks/useTalepGorunumleri";
import { useSekilDuzenleme } from "./hooks/useSekilDuzenleme";
import { useTalepSekilDuzenleme } from "./hooks/useTalepSekilDuzenleme";
import {
  DEPARTMANSIZ,
  useKatmanlar,
  type BolgeKatmani,
} from "./hooks/useKatmanlar";
import {
  useDepartmanlar,
  useTurDepartmanEslemesi,
} from "./hooks/useDepartmanlar";
import { turAdi, turKodlari, turRengi } from "./data/turSozlugu";
import {
  YONLENDIRILMEMIS_AD,
  YONLENDIRILMEMIS_RENK,
  departmanTurGruplari,
  lejantDepartmanlari,
  lejantTurleri,
} from "./types/departman";
import {
  ASSET_STATUS_LABELS,
  ASSET_STATUSES,
  GRUP_RENGI,
  TIP_GRUPLARI,
} from "./types/asset";
import { USER_ROLE_LABELS } from "./types/auth";
import type {
  AssetFeature,
  AssetFeatureCollection,
  AssetFilters,
  AssetStatus,
  AssetType,
} from "./types/asset";
import type { TamamlananAlan } from "./types/alan";
import type { Bolge, BolgeTipi } from "./types/bolge";
import {
  TALEP_DURUM_RENGI,
  TALEP_GORUNUMLERI,
  REPORT_STATUS_LABELS,
  talepNoktasi,
} from "./types/report";
import type {
  TalepGorunumu,
  ReportFeature,
  ReportFeatureCollection,
} from "./types/report";
import { noktaAlandaMi, poligonSinirKutusu } from "./utils/geo";
import { EKIP_VARSAYILAN_RENK } from "./utils/haritaPopup";
import type { EkipDepartmanBilgisi } from "./utils/haritaPopup";
import { ISTANBUL_MERKEZI } from "./utils/istanbulMaskesi";

/** Durum swatch'inin KENARLIK rengi; dolgu her zaman tur (grup) rengidir. */
const VARLIK_DURUM_RENGI: Record<AssetStatus, string> = {
  iyi: "#0f766e",
  bakim_lazim: "#f59e0b",
};

/** Durum swatch'inin dilimleri: gruplarin gercek harita renkleri. */
const IYI_SWATCH_RENKLERI = TIP_GRUPLARI.map((g) => GRUP_RENGI[g]);

/** Acilis (ve "Temizle") degerleri; katman/lejant baslangiclari `hooks/useKatmanlar.ts`'te. */
const BASLANGIC = {
  filtreler: { source: "kayitli" } as AssetFilters,
  sekme: "liste" as Sekme,
  talepDurum: "onaylandi" as TalepGorunumu,
  cizimRengi: "#059669",
  zoom: 11,
} as const;

/** Sol paneldeki sekmeler (Ozet/Gecmis/Personel modal olarak acilir). */
type Sekme = "liste" | "ekle" | "talepler" | "bolgeler" | "guzergahlar";

/** Bolge sekmesi -> kayit turu + harita katmani eslesmesi. */
const BOLGE_SEKMELERI = {
  bolgeler: { tip: "alan", katman: "bolgeler" },
  guzergahlar: { tip: "cizgi", katman: "guzergahlar" },
} as const;

/** Mudurlugu olmayan ("Genel") bolge/guzergah kayitlarinin lejant rengi.
 *  Notr slate: bir mudurlugun rengiyle karistirilmasin. */
const GENEL_BOLGE_RENGI = "#64748b";

/** Bir sekme kaydedilmis bolge/guzergah paneli mi? */
function bolgeSekmesi(s: Sekme | null): s is keyof typeof BOLGE_SEKMELERI {
  return s === "bolgeler" || s === "guzergahlar";
}

/** Sekme basligi/ikonu ve tema rengi. */
const SEKME_TANIMLARI: Record<
  Sekme,
  { etiket: string; ikon: (p: { className?: string }) => React.ReactElement; renk: string }
> = {
  liste: { etiket: "Varlıklar", ikon: IconPin, renk: "emerald" },
  ekle: { etiket: "Ekle", ikon: IconPlus, renk: "blue" },
  talepler: { etiket: "Talepler", ikon: IconInbox, renk: "amber" },
  bolgeler: { etiket: "Bölgeler", ikon: IconLayers, renk: "violet" },
  guzergahlar: { etiket: "Güzergâhlar", ikon: IconRoute, renk: "blue" },
};

/** Ust bardan modal olarak acilan yonetim/raporlama ekranlari. */
type UstModal = "ozet" | "log" | "personel" | "saha" | "departman";

export default function App() {
  const { user, cikisYap } = useAuth();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<AssetFilters>(BASLANGIC.filtreler);
  const [sekme, setSekme] = useState<Sekme>(BASLANGIC.sekme);
  const [ustModal, setUstModal] = useState<UstModal | null>(null);
  /** Her "Temizle"de artar: kendi ic durumu olan yuzen bilesenler bunu key
   *  olarak alip yeniden kurulur. */
  const [sifirlamaNo, setSifirlamaNo] = useState(0);
  const [seciliId, setSeciliId] = useState<string | null>(null);
  const [talepler, setTalepler] = useState<ReportFeature[]>([]);
  const [seciliTalepId, setSeciliTalepId] = useState<string | null>(null);
  const [talepDurum, setTalepDurum] = useState<TalepGorunumu>(BASLANGIC.talepDurum);
  const [duzenlenen, setDuzenlenen] = useState<AssetFeature | null>(null);
  const [koordinat, setKoordinat] = useState<
    { longitude: number; latitude: number } | undefined
  >();
  const [panelAcik, setPanelAcik] = useState(false);
  const [aktifStilId, setAktifStilId] = useState<HaritaStilId>(VARSAYILAN_STIL);
  const [kenarAcik, setKenarAcik] = useState(true);

  // --- Yalnizca mobil kabuk ---
  // Mobilde her is kendi sheet'ini acar; masaustunde ayni bilgi yuzen
  // panellerde ayni anda ekranda durabiliyor.
  const mobil = useMobil();
  /** Yonetim ekranlari + kullanici + cikis (header'daki hamburger). */
  const [mobilMenu, setMobilMenu] = useState(false);
  /** Lejant + tur/durum filtresi + harita stili tek sheet'te. */
  const [mobilKatman, setMobilKatman] = useState(false);
  /** Sifirlamanin ikinci adimi: uygulamada window.confirm yok (bkz.
   *  Aksiyonlar/SilOnayi), geri alinamayan islem onay ister. */
  const [mobilSifirlaOnayi, setMobilSifirlaOnayi] = useState(false);
  // Katman gorunurlugu + tur/durum alt-filtreleri. Sag-ustteki lejant ile sol
  // paneldeki acilirlar ayni state'i yazar (bkz. useKatmanlar).
  const {
    katmanlar,
    katmanTurleri,
    katmanVarlikDurumlari,
    katmanDurumlari,
    ekipDepartmaniSecili,
    bolgeDepartmani,
    talepDepartmani,
    katmanDegistir,
    katmanTuruDegistir,
    katmanTurGrubuDegistir,
    katmanVarlikDurumuDegistir,
    katmanDurumuDegistir,
    ekipDepartmaniDegistir,
    panelDurumuSec,
    katmaniAc,
    yalnizVarlikVeyaTalep,
    talepDurumunuSec,
    sifirla: katmanlariSifirla,
  } = useKatmanlar();

  // Panel kapaliyken hicbir sekme aktif sayilmaz.
  const aktifSekme: Sekme | null = panelAcik ? sekme : null;

  /** "Ekle" sekmesinde secili kip; null ise "ne eklemek istiyorsun?" ekrani
   *  gosterilir. Alan/cizgi kipleri harita uzerinde cizim baslatir. */
  const [ekleKipi, setEkleKipi] = useState<EkleKipi | null>(null);
  // Ref: `useAlanSecimi`'nin geri cagrimi kurulusta baglanip guncel kipi ozel
  // okur; `sekmeSec` `ekleKipiBirak`'tan once tanimlandigi icin o da ref kullanir.
  const ekleKipiRef = useRef<EkleKipi | null>(null);
  ekleKipiRef.current = ekleKipi;
  const ekleKipiBirakRef = useRef<() => void>(() => {});

  /** Paneli kapatir; kaydedilmemis bir VARLIK ekleme yarim kalmissa kipi de
   *  birakir. Yalnizca `varlik` kipinde: alan/cizgi kiplerinde panelin kapali
   *  olmasi zaten normal akistir, orada kipi birakmak devam eden cizimi yakardi. */
  const paneliKapat = () => {
    setPanelAcik(false);
    if (ekleKipiRef.current === "varlik") ekleKipiBirakRef.current();
  };

  const sekmeSec = (id: Sekme) => {
    // Mobilde katman/menu sheet'leri panelin uzerine biner; yeni sekme
    // istendiginde ustteki kapanmali (masaustunde bu iki state etkisiz).
    setMobilKatman(false);
    setMobilMenu(false);
    if (id !== "ekle") ekleKipiBirakRef.current();
    if (panelAcik && sekme === id) {
      paneliKapat();
      return;
    }
    setSekme(id);
    setPanelAcik(true);
  };

  const [ucusHedefi, setUcusHedefi] = useState<UcusHedefi | null>(null);
  const [haritaGorunumu, setHaritaGorunumu] = useState<
    [[number, number], [number, number]] | null
  >(null);
  const [harita, setHarita] = useState<maplibregl.Map | null>(null);

  /** Alan secimi: cizim, olcum, secili alanlarin varlik sonuclari ve
   *  ilce/mahalle sinirlari - hepsi ayni `tamamlananAlanlar` listesini besler. */
  const {
    cizimModu,
    cizimNoktalari,
    cizimRengi,
    setCizimRengi,
    alanM2,
    alanHatasi,
    alanYukleniyor,
    cizimNoktaEkle,
    cizimGeriAl,
    alanSecimiBaslat,
    alanSecimiIptal,
    alanSecimiTamamla,
    olcumModu,
    olcumNoktalari,
    olcumMesafeM,
    olcumNoktaEkle,
    olcumGeriAl,
    olcumBaslat,
    olcumIptal,
    olcumBitir,
    olcumTemizle,
    tamamlananAlanlar,
    birlesikAlanSonucu,
    alanOlculeri,
    alanOzetiSonuc,
    alanKaldir,
    alanlariTemizle,
    tumAlanlariTemizle,
    ilceKodu,
    mahalleKodu,
    ilceSec,
    mahalleSec,
    idariHatasi,
    idariSinirKutusu,
    cizimVeOlcumuKapat,
    sifirla: alanSeciminiSifirla,
  } = useAlanSecimi({
    filters,
    varsayilanRenk: BASLANGIC.cizimRengi,
    ucur: setUcusHedefi,
    // Cizim baslarken varlik secimi birakilir, isaretci cizimin altinda kalmasin.
    onCizimBasladi: () => setSeciliId(null),
    // "Ekle" akisinda degil: orada niyet kayittir, panel "Kaydet" gosteren
    // cizim akisinda kalmali.
    onAlanTamamlandi: () => {
      if (ekleKipiRef.current === null) setSekme("liste");
    },
  });

  // "Temizle": tum calisma durumunu BASLANGIC degerlerine dondurur, haritayi
  // acilis gorunumune ucurur. Harita stili ve kenar cubugu bilincli olarak
  // korunur: bunlar gorunum tercihidir.
  const sifirla = () => {
    setSifirlamaNo((n) => n + 1);
    setFilters(BASLANGIC.filtreler);
    setSekme(BASLANGIC.sekme);
    setPanelAcik(false);
    setUstModal(null);
    setSeciliId(null);
    setDetayAsset(null);
    setSeciliTalepId(null);
    setDetayRapor(null);
    setTalepler([]);
    setTalepDurum(BASLANGIC.talepDurum);
    setDuzenlenen(null);
    setKoordinat(undefined);
    setEkleKipi(null);
    // Ana katmanlar kapanir, alt filtreler isaretli kalir: katman tekrar
    // acildiginda kullanici elenmis degil tam listeyi gorur.
    katmanlariSifirla();
    alanSeciminiSifirla();
    setBolgeTaslagi(null);
    setDetayBolgeId(null);
    setSeciliBolgeId(null);
    sekilDuzenlemeKapat();
    talepSekilDuzenlemeKapat();
    // Kaydedilmis bolgeler silinmez, yalnizca katmanlari kapanir.
    setGizliBolgeler(new Set());
    setUcusHedefi({
      anahtar: crypto.randomUUID(),
      tip: "nokta",
      merkez: ISTANBUL_MERKEZI,
      zoom: BASLANGIC.zoom,
    });
  };

  /** "Ekle" panelinde kip secimi. Alan/cizgi kipleri dogrudan harita uzerinde
   *  cizimi baslatir, ikinci bir "basla" adimi yoktur. */
  const ekleKipiSec = (kip: EkleKipi) => {
    setEkleKipi(kip);
    setKoordinat(undefined);
    // Cizim kiplerinde panel cekilir: gereken her sey (nokta sayisi, olcu,
    // "Geri al", "Tamamla") zaten alt-ortadaki cizim panelinde. Varlik
    // kipinde panel acik kalir, form orada.
    if (kip !== "varlik") setPanelAcik(false);
    if (kip === "alan") {
      olcumIptal();
      alanSecimiBaslat();
    } else if (kip === "cizgi") {
      alanSecimiIptal();
      olcumBaslat();
    } else {
      cizimVeOlcumuKapat();
      olcumTemizle();
    }
  };

  /** Kip secimine geri donus: yarim kalan cizim birakilir; `olcumTemizle`
   *  de cagrilir cunku `cizimVeOlcumuKapat` tek basina yarim bir hat birakirdi. */
  const ekleKipiBirak = () => {
    setEkleKipi(null);
    setKoordinat(undefined);
    cizimVeOlcumuKapat();
    olcumTemizle();
  };
  ekleKipiBirakRef.current = ekleKipiBirak;

  /** Cizim panelindeki "İptal"/"Temizle" AYNI ZAMANDA ekleme akisini de biter
   *  (`ekleKipi` yerinde kalsaydi panel bir sonraki acilista hala "ekleniyor"
   *  seridini gosterirdi). Sorgu amacli alan secimi/olcumde `ekleKipi` zaten
   *  null oldugundan davranis degismez. */
  const cizimIptalEt = (iptal: () => void) => () => {
    iptal();
    if (ekleKipiRef.current !== null) {
      setEkleKipi(null);
      setKoordinat(undefined);
      cizimVeOlcumuKapat();
      olcumTemizle();
    }
  };

  // --- Kaydedilmis bolgeler (gorev bolgeleri / guzergahlar) ---------------
  const [gizliBolgeler, setGizliBolgeler] = useState<Set<string>>(new Set());
  const [bolgeTaslagi, setBolgeTaslagi] = useState<BolgeTaslagi | null>(null);
  /** Detay modalinde acik olan kaydin ID'si - KAYDIN KENDISI DEGIL. Kaydi
   *  state'e kopyalamak onu donduruyordu: sunucudaki degisiklik tazelense
   *  bile modal acildigi andaki goruntuyu gosterirdi. ID tutulup kayit
   *  sorgudan turetilince modal her tazelemede kendiliginden guncellenir. */
  const [detayBolgeId, setDetayBolgeId] = useState<string | null>(null);
  const [seciliBolgeId, setSeciliBolgeId] = useState<string | null>(null);

  const sorgu = useAssets(filters);
  // Alan secimi varsa LISTE/OZET birlestirilmis sonucu gosterir. Harita
  // bunu bilincli okumaz (bkz. `varlikKatmanTaban`): alan secmek bir SORGU
  // aracidir, haritanin geri kalanini silmek degil.
  const gosterilen = birlesikAlanSonucu ?? sorgu.data;

  const personel = user?.role === "admin" || user?.role === "calisan";

  // Canli guncelleme: sunucu degisiklikleri SSE ile bildirir; yoklama
  // periyotlari yedektir (bkz. YEDEK_YOKLAMA_MS).
  useCanliGuncelleme(Boolean(user));

  /** Talepler + gorunum turetmesi. Secim callback'leri `onayliEsleme`yi
   *  okudugu icin onlardan once cagrilir. */
  const {
    talepVarlikSorgu,
    bekleyenTalepSorgu,
    bekleyenTalepSayisi,
    onayliEsleme,
    gorunumler: talepGorunumleri,
  } = useTalepGorunumleri({ personel });

  // Talep secimi sekme degisiminde bilincli olarak temizlenmez; haritada
  // secilen isaretci panel kapaliyken de secili kalir.

  const haritaTiklandi = useCallback(
    (c: { longitude: number; latitude: number }) => {
      // Bos alana tiklamak her zaman secimi temizler.
      setSeciliId(null);
      setDetayAsset(null);
      setSeciliTalepId(null);
      setDetayRapor(null);
      setSeciliBolgeId(null);
      // Koordinat yalnizca "Ekle" formu zaten acikken doldurulur: haritayi
      // gezerken istemeden forma dusulmesin.
      if (aktifSekme !== "ekle") return;
      setKoordinat(c);
    },
    [aktifSekme]
  );

  // Hem listeden hem haritadan cagrilir; secili olana tekrar tiklamak secimi
  // iptal eder. Secim kapali paneli ACMAZ, ama panel acikken dogru sekmeye gecer.
  const varlikSecildi = useCallback(
    (id: string) => {
      const kapaniyor = seciliId === id;
      setSeciliId(kapaniyor ? null : id);
      setDetayAsset(null);
      if (kapaniyor) {
        setSeciliTalepId(null);
        return;
      }
      // Talepten olusan varlikta kaynak talep da secilir: haritadaki isaretci
      // ham talep noktasi, panel ise ondan olusan varliktir.
      setSeciliTalepId(onayliEsleme.varliktanRapora.get(id) ?? null);
      setDetayRapor(null);
      setSeciliBolgeId(null);
      // "Onaylandı"/"Tamir Edildi" zaten talep varliklarini listeler.
      const talepVarlikSekmesi =
        sekme === "talepler" && (talepDurum === "onaylandi" || talepDurum === "tamir");
      if (panelAcik && !talepVarlikSekmesi) setSekme("liste");
    },
    [seciliId, panelAcik, sekme, talepDurum, onayliEsleme]
  );

  // Ham talep secimi - hem listeden hem haritadan cagrilir.
  const talepSecildi = useCallback(
    (id: string) => {
      const kapaniyor = seciliTalepId === id;
      setSeciliTalepId(kapaniyor ? null : id);
      setDetayRapor(null);
      if (kapaniyor) {
        setSeciliId(null);
        return;
      }
      // varlikSecildi'nin simetrigi: talepten olusan varlik da secili sayilir.
      setSeciliId(onayliEsleme.rapordanVarliga.get(id) ?? null);
      setDetayAsset(null);
      setSeciliBolgeId(null);
      if (panelAcik) setSekme("talepler");
    },
    [seciliTalepId, panelAcik, onayliEsleme]
  );

  // --- Secili alan(lar) diger katmanlari da suzer -------------------------
  // Varliklar backend'de suzuluyor (`assetsWithin`); talep/bolge/ekip
  // katmanlari ayni sinirla burada client-side elenir. Nokta, secili
  // alanlardan HERHANGI birinin icindeyse yeterlidir (tek tek denenir).
  const alandaMi = useMemo(() => {
    if (tamamlananAlanlar.length === 0) return null;
    // Sinir kutusu on elemesi: ilce/mahalle halkalari binlerce noktali,
    // uzaktaki bir nokta icin ray-casting'e hic girilmemeli.
    const parcalar = tamamlananAlanlar.map((a) => ({
      halkalar: a.noktalar,
      kutu: poligonSinirKutusu(a.noktalar.flat()),
    }));
    return (nokta: [number, number]) =>
      parcalar.some(
        ({ halkalar, kutu }) =>
          nokta[0] >= kutu[0][0] &&
          nokta[0] <= kutu[1][0] &&
          nokta[1] >= kutu[0][1] &&
          nokta[1] <= kutu[1][1] &&
          noktaAlandaMi(nokta, halkalar)
      );
  }, [tamamlananAlanlar]);

  /** Bir bolge/guzergah secili alana degiyor mu: koselerinden biri icerideyse
   *  yeter. Kismen kesisen bir gorev bolgesi de o ilcenin isidir, tamamen
   *  disarida kalanlar elenir. */
  const bolgeAlanda = useCallback(
    (bolge: Bolge) => !alandaMi || bolge.noktalar.some((h) => h.some(alandaMi)),
    [alandaMi]
  );

  // --- Bildirimler (header zili) ------------------------------------------
  const bakimSorgu = useAssets({ status: "bakim_lazim" });

  // Canli ekip konumlari + aktif gorevleri.
  const ekipSorgu = useQuery({
    // ANAHTAR SahaEkipleri panosuyla AYNI: farkli anahtarlarda ikisi ayri
    // istek atip biri invalidate olurken digeri bayat kaliyordu.
    queryKey: ["saha", "ekip-gorevleri"],
    queryFn: ekipGorevleriGetir,
    enabled: personel,
    // SSE ana yol; bu yalnizca yedek (bkz. useCanliGuncelleme).
    refetchInterval: YEDEK_YOKLAMA_MS,
  });

  /** Havuzda bekleyen (hicbir ekibe atanmamis) bakim varliklari. ANAHTAR
   *  SahaEkipleri panosuyla AYNI (`["saha","havuz"]`), ekip sorgusundaki
   *  kararin aynisi. `AssetProperties` atama tasimadigi icin burada okunur. */
  const havuzSorgu = useQuery({
    queryKey: ["saha", "havuz"],
    queryFn: havuzGetir,
    enabled: personel,
    refetchInterval: YEDEK_YOKLAMA_MS,
  });
  /** Atanmamis varlik id'leri. Havuz yalnizca `bakim_lazim` varliklari dondurur. */
  const atanmamisIdler = useMemo(
    () => new Set((havuzSorgu.data ?? []).map((h) => h.asset_id)),
    [havuzSorgu.data]
  );

  const departmanSorgu = useDepartmanlar();
  /** Lejantta adi gecebilecek mudurlukler: admin tum sozlugu, departmani olan
   *  personel yalnizca kendisininkini gorur. */
  const gorunurDepartmanlar = useMemo(
    () => lejantDepartmanlari(departmanSorgu.data, user?.departman),
    [departmanSorgu.data, user?.departman]
  );
  const eslemeSorgu = useTurDepartmanEslemesi();

  const bolgeSorgu = useQuery({
    queryKey: ["bolgeler"],
    queryFn: bolgeleriGetir,
    enabled: personel,
  });
  /** Detay modalinin gosterecegi CANLI kayit: id state'te, veri sorguda.
   *  Kayit silinince (ya da kapsamdan cikinca) listeden duser ve modal
   *  kendiliginde kapanir. */
  const detayBolge = useMemo(
    () => bolgeSorgu.data?.find((b) => b.id === detayBolgeId) ?? null,
    [bolgeSorgu.data, detayBolgeId]
  );

  // Alanlar ve guzergahlar ayri katmanlar oldugu icin gorunur listeleri de
  // ayri hesaplanir; departman alt-filtresi burada uygulanir. Alan secimi
  // burada uygulanmaz (secili alan bir SORGU sinirridir, kayit silmez);
  // panel tarafi `alanda` propuyla daralmaya devam eder.
  const [gorunurAlanlar, gorunurGuzergahlar] = useMemo(() => {
    const gorunur = (bolgeSorgu.data ?? []).filter((b) => !gizliBolgeler.has(b.id));
    return [
      gorunur.filter(
        (b) => b.tip === "alan" && bolgeDepartmani.bolgeler.secili(b.departman)
      ),
      gorunur.filter(
        (b) => b.tip === "cizgi" && bolgeDepartmani.guzergahlar.secili(b.departman)
      ),
    ];
  }, [bolgeSorgu.data, gizliBolgeler, bolgeDepartmani]);
  const haritaBolgeleri = useMemo(() => {
    const liste = [
      ...(katmanlar.bolgeler ? gorunurAlanlar : []),
      ...(katmanlar.guzergahlar ? gorunurGuzergahlar : []),
    ];
    // Iki katman da kapaliysa undefined don (katman tamamen kalkar).
    return liste.length > 0 || katmanlar.bolgeler || katmanlar.guzergahlar
      ? liste
      : undefined;
  }, [katmanlar.bolgeler, katmanlar.guzergahlar, gorunurAlanlar, gorunurGuzergahlar]);

  const bolgeGorunurlukDegis = useCallback((id: string) => {
    setGizliBolgeler((g) => {
      const yeni = new Set(g);
      if (yeni.has(id)) yeni.delete(id);
      else yeni.add(id);
      return yeni;
    });
  }, []);

  // "Tümünü göster/gizle" yalnizca panelin kendi turunu etkiler.
  const bolgeleriGoster = useCallback((idler: string[]) => {
    setGizliBolgeler((g) => {
      const yeni = new Set(g);
      for (const id of idler) yeni.delete(id);
      return yeni;
    });
  }, []);

  const bolgeleriGizle = useCallback((idler: string[]) => {
    setGizliBolgeler((g) => {
      const yeni = new Set(g);
      for (const id of idler) yeni.add(id);
      return yeni;
    });
  }, []);

  // Bolge secimi: paneli acmaz, acikken dogru sekmeye gecer (varlik/talep
  // secimiyle ayni kurallar).
  const bolgeSecildi = useCallback(
    (id: string) => {
      const kapaniyor = seciliBolgeId === id;
      setSeciliBolgeId(kapaniyor ? null : id);
      if (kapaniyor) return;
      // Tek secim kurali: bolge secilince varlik/talep secimi birakilir.
      setSeciliId(null);
      setDetayAsset(null);
      setSeciliTalepId(null);
      setDetayRapor(null);
      const tip = bolgeSorgu.data?.find((b) => b.id === id)?.tip;
      if (panelAcik && tip) setSekme(tip === "cizgi" ? "guzergahlar" : "bolgeler");
    },
    [seciliBolgeId, panelAcik, bolgeSorgu.data]
  );

  /** Bir bolgenin tum halkalarini kapsayan sinir kutusuna ucar. */
  const bolgeyeGit = useCallback((bolge: Bolge) => {
    // "Git" ayni zamanda secimdir: kayit haritada isaretli kalir.
    setSeciliBolgeId(bolge.id);
    setUcusHedefi({
      anahtar: crypto.randomUUID(),
      tip: "sinir",
      bounds: poligonSinirKutusu(bolge.noktalar.flat()),
    });
    // Gizliyse gorunur yap: hem turun katmani hem kaydin tekil gizlemesi acilir.
    const katman: KatmanAnahtari = bolge.tip === "cizgi" ? "guzergahlar" : "bolgeler";
    katmaniAc(katman);
    setGizliBolgeler((g) => {
      if (!g.has(bolge.id)) return g;
      const yeni = new Set(g);
      yeni.delete(bolge.id);
      return yeni;
    });
  }, []);

  /** Harita etiketi uzerinden yeniden adlandirma; hata MapView'de yakalanir. */
  const bolgeAdiDegistir = useCallback(
    async (id: string, ad: string) => {
      await bolgeGuncelle(id, { ad });
      queryClient.invalidateQueries({ queryKey: ["bolgeler"] });
    },
    [queryClient]
  );

  // --- Sekil (geometri) duzenleme ----------------------------------------
  const {
    duzenleme: sekilDuzenleme,
    hata: sekilHatasi,
    kaydediliyor: sekilKaydediliyor,
    genisletiliyor: sekilGenisletiliyor,
    degismis: sekilDegismis,
    geriAlinabilir: sekilGeriAlinabilir,
    baslat: sekilDuzenlemeBaslat,
    kapat: sekilDuzenlemeKapat,
    degisti: sekilDegisti,
    geriAl: sekilGeriAl,
    kaydet: sekilKaydet,
    genislet: sekilGenislet,
  } = useSekilDuzenleme({
    bolgeler: bolgeSorgu.data,
    bolgeyeGit,
    // Cizim/olcum VE talep sekli duzenlemesi ile ayni alt paneli paylasir.
    onBaslarken: () => {
      cizimVeOlcumuKapat();
      talepSekilDuzenlemeKapat();
    },
  });

  /** Talebin (cizgi/alan) haritada konumuna ucurur + secili yapar - `bolgeyeGit`
   *  ile ayni desen. */
  const raporaGit = useCallback(
    (report: ReportFeature) => {
      setSeciliTalepId(report.properties.id);
      setSeciliId(onayliEsleme.rapordanVarliga.get(report.properties.id) ?? null);
      katmaniAc("talepler");
      const nokta = talepNoktasi(report);
      if (report.geometry.type === "Point" || !nokta) {
        if (nokta) {
          setUcusHedefi({
            anahtar: crypto.randomUUID(),
            tip: "nokta",
            merkez: nokta,
            zoom: 16,
          });
        }
        return;
      }
      const koordinatlar =
        report.geometry.type === "LineString"
          ? report.geometry.coordinates
          : report.geometry.coordinates.flat();
      setUcusHedefi({
        anahtar: crypto.randomUUID(),
        tip: "sinir",
        bounds: poligonSinirKutusu(koordinatlar),
      });
    },
    [onayliEsleme, katmaniAc]
  );

  const {
    duzenleme: talepSekilDuzenleme,
    hata: talepSekilHatasi,
    kaydediliyor: talepSekilKaydediliyor,
    genisletiliyor: talepSekilGenisletiliyor,
    degismis: talepSekilDegismis,
    geriAlinabilir: talepSekilGeriAlinabilir,
    baslat: talepSekilDuzenlemeBaslat,
    kapat: talepSekilDuzenlemeKapat,
    degisti: talepSekilDegisti,
    geriAl: talepSekilGeriAl,
    kaydet: talepSekilKaydet,
    genislet: talepSekilGenislet,
  } = useTalepSekilDuzenleme({
    talepler,
    raporaGit,
    onBaslarken: () => {
      cizimVeOlcumuKapat();
      sekilDuzenlemeKapat();
    },
    onKaydedildi: () => {
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      queryClient.invalidateQueries({ queryKey: ["saha"] });
    },
  });

  /** Tamamlanmis bir alani "görev bölgesi" olarak kaydetme formunu acar. */
  const alanKaydetIste = useCallback((alan: TamamlananAlan, sira: number) => {
    setBolgeTaslagi({
      tip: "alan",
      noktalar: alan.noktalar,
      renk: alan.renk,
      onerilenAd: alan.etiket ?? `Alan ${sira + 1}`,
      kaynak: { tip: "alan", id: alan.id },
    });
  }, []);

  /** Olculen cizgiyi guzergah olarak kaydetme formunu acar. */
  const olcumKaydetIste = () => {
    if (olcumNoktalari.length < 2) return;
    setBolgeTaslagi({
      tip: "cizgi",
      noktalar: [olcumNoktalari],
      renk: "#2563eb",
      kaynak: { tip: "olcum" },
    });
  };


  // --- Harita katman verileri (sag-ustteki KatmanKontrolu'ne bagli) --------
  // HARITA ALAN SECIMINDEN ETKILENMEZ: taban her zaman ham sorgudur, secili
  // alanin disindaki isaretciler haritada kalir - alan secmek "say/listele"
  // demektir, "haritadan sil" demek degil. Panel/ozet `gosterilen`den daralir.
  const varlikKatmanTaban = sorgu.data;
  // Alt-filtre sayaclari her kirilim icin, DIGER kirilimin secimi uygulanmis
  // taban uzerinden sayilir; boylece rakamlar haritadakiyle tutarli kalir.
  const { varlikTurSayilari, varlikDurumSayilari } = useMemo(() => {
    const turSayilari = Object.fromEntries(
      turKodlari().map((t) => [t, 0])
    ) as Record<AssetType, number>;
    const durumSayilari: Record<AssetStatus, number> = { iyi: 0, bakim_lazim: 0 };
    for (const f of varlikKatmanTaban?.features ?? []) {
      const { type, status } = f.properties;
      if (katmanVarlikDurumlari[status]) turSayilari[type] += 1;
      if (katmanTurleri[type]) durumSayilari[status] += 1;
    }
    return { varlikTurSayilari: turSayilari, varlikDurumSayilari: durumSayilari };
  }, [varlikKatmanTaban, katmanTurleri, katmanVarlikDurumlari]);
  const varlikKatmanVeri = useMemo<AssetFeatureCollection | undefined>(() => {
    if (!varlikKatmanTaban) return undefined;
    const tumTurler = turKodlari().every((t) => katmanTurleri[t]);
    const tumDurumlar = ASSET_STATUSES.every((s) => katmanVarlikDurumlari[s]);
    if (tumTurler && tumDurumlar) return varlikKatmanTaban;
    return {
      type: "FeatureCollection",
      features: varlikKatmanTaban.features.filter(
        (f) => katmanTurleri[f.properties.type] && katmanVarlikDurumlari[f.properties.status]
      ),
    };
  }, [varlikKatmanTaban, katmanTurleri, katmanVarlikDurumlari]);

  /** PANEL/liste tarafinin varlik koleksiyonu: haritanin aksine alan secimiyle
   *  daralir (`gosterilen` = secili alanlarin `assetsWithin` sonucu). Tur/durum
   *  filtresi ikisinde de ayni; ayrilan tek sey alan sinirridir. */
  const varlikPanelVeri = useMemo<AssetFeatureCollection | undefined>(() => {
    if (!gosterilen) return undefined;
    const tumTurler = turKodlari().every((t) => katmanTurleri[t]);
    const tumDurumlar = ASSET_STATUSES.every((s) => katmanVarlikDurumlari[s]);
    if (tumTurler && tumDurumlar) return gosterilen;
    return {
      type: "FeatureCollection",
      features: gosterilen.features.filter(
        (f) =>
          katmanTurleri[f.properties.type] &&
          katmanVarlikDurumlari[f.properties.status]
      ),
    };
  }, [gosterilen, katmanTurleri, katmanVarlikDurumlari]);

  /** Talep gruplarinin secili alanla sinirlanmis hali; lejant sayaclari ve
   *  panel listeleri bunu okur (harita ham gruplari cizer). Bildirim zilinin
   *  sayaci bilincli olarak ham sorgudan gelir: zil sistemin tamamini anlatir,
   *  haritanin secimini degil. */
  const talepGorunumleriAlanda = useMemo(() => {
    return Object.fromEntries(
      TALEP_GORUNUMLERI.map((g) => [
        g,
        talepGorunumleri[g].filter((f) => {
          if (alandaMi) {
            const n = talepNoktasi(f);
            if (!n || !alandaMi(n)) return false;
          }
          // Mudurluk alt-filtresi yalnizca "Onaylandı"/"Bekleyen"de uygulanir;
          // gecmis kayit olan "Tamir Edildi"/"Reddedildi" bundan muaftir.
          const filtre = talepDepartmani[g];
          if (filtre) {
            const departman = eslemeSorgu.data?.[f.properties.type] ?? null;
            if (!filtre.secili(departman)) return false;
          }
          return true;
        }),
      ])
    ) as Record<TalepGorunumu, ReportFeature[]>;
  }, [talepGorunumleri, alandaMi, eslemeSorgu.data, talepDepartmani]);

  // Talep katmani: secili gorunumlerin talepleri id'ye gore tekillestirilir.
  // ALAN SECIMI haritayi daraltmaz, ama MUDURLUK alt-filtresi haritayi da
  // suzer: bu "sorgu" degil "hangi katman gorunsun" secimidir.
  const talepKatmanVeri = useMemo<ReportFeatureCollection>(() => {
    const gorulen = new Map<string, ReportFeature>();
    for (const gorunum of TALEP_GORUNUMLERI) {
      if (!katmanDurumlari[gorunum]) continue;
      const filtre = talepDepartmani[gorunum];
      for (const f of talepGorunumleri[gorunum]) {
        if (filtre) {
          const departman = eslemeSorgu.data?.[f.properties.type] ?? null;
          if (!filtre.secili(departman)) continue;
        }
        gorulen.set(f.properties.id, f);
      }
    }
    return { type: "FeatureCollection", features: [...gorulen.values()] };
  }, [katmanDurumlari, talepGorunumleri, talepDepartmani, eslemeSorgu.data]);

  // Secilen talebin gorunumu panelin alt sekmesini de belirler (ham durum
  // degil): tamir edilmis bir talep "Onaylandı" sekmesinde bulunmaz.
  useEffect(() => {
    if (!seciliTalepId) return;
    const secili = talepKatmanVeri.features.find(
      (f) => f.properties.id === seciliTalepId
    )?.properties;
    if (secili) setTalepDurum(secili.gorunum ?? secili.status);
  }, [seciliTalepId, talepKatmanVeri]);

  /** Haritada gosterilen ekipler. Yalnizca KATMAN suzulur: atama acilirlari
   *  (AssetDetayModal, SahaEkipleri, BolgePaneli) tam listeyi gormeye devam
   *  eder - secili ilcenin disindaki bir ekibe elle is verilebilmeli.
   *
   *  Departman alt-filtresi burada uygulanir: butun mudurluklerin ekipleri
   *  ayni anda cizilince harita okunmaz hale geliyordu. ALAN SECIMI burada da
   *  uygulanmaz (varlik/talep katmanlariyla ayni gerekce): bir ilce secmek
   *  ekibin haritadan silinmesi demek degil - ustelik cogu zaman ise en yakin
   *  ekip tam da secili alanin disindadir. */
  const haritaEkipleri = useMemo(() => {
    const ekipler = ekipSorgu.data;
    if (!ekipler) return ekipler;
    return ekipler.filter((e) => ekipDepartmaniSecili(e.departman));
  }, [ekipSorgu.data, ekipDepartmaniSecili]);

  /** Departman kodu -> ad + rozet rengi. Ekip pinleri, ekip popup'i ve
   *  lejanttaki ekip alt-filtresi ayni sozlukten beslenir; renk backend'deki
   *  `departmanlar.renk`tir. */
  const ekipDepartmanlari = useMemo<EkipDepartmanBilgisi>(
    () =>
      Object.fromEntries(
        (departmanSorgu.data ?? []).map((d) => [d.kod, { ad: d.ad, renk: d.renk }])
      ),
    [departmanSorgu.data]
  );

  const katmanSayilari: Record<KatmanAnahtari, number> = {
    varliklar: varlikKatmanVeri?.features.length ?? 0,
    talepler: talepKatmanVeri.features.length,
    bolgeler: gorunurAlanlar.length,
    guzergahlar: gorunurGuzergahlar.length,
    ekipler: haritaEkipleri?.length ?? 0,
  };

  // Sag-ustteki katman kontrolune gecen alt-filtre tanimlari (etiket/renk/sayi).
  const varlikAltFiltre = useMemo<AltGrup[]>(() => {
    // Turler MUDURLUK MUDURLUK listelenir: baslik "bu is kime gidiyor"u
    // anlatir (mudurluk rengi), secenegin swatch'i haritada basilan grup rengidir.
    const esleme = eslemeSorgu.data;
    const secenek = (t: AssetType) => ({
      anahtar: t,
      etiket: turAdi(t),
      renk: turRengi(t),
      secili: katmanTurleri[t],
      sayi: varlikTurSayilari[t],
    });

    // Sozluk gelmeden gruplanmaz - yoksa ilk karede her tur "yönlendirilmemiş"
    // basligina duser, sonra yerine otururdu. Departmani olan personelde tur
    // listesi de kendi mudurluguyle daralir (`lejantTurleri`).
    const kirilim = departmanTurGruplari(
      gorunurDepartmanlar,
      esleme,
      lejantTurleri(turKodlari(), esleme, user?.departman)
    );
    const gruplar: AltGrup[] = (
      kirilim ?? [{ departman: null, turler: turKodlari() }]
    ).map((g) => {
      // Baslik kutucugu mudurlugun tum turlerini birlikte acar/kapatir;
      // sayaci mudurlugun toplamidir (kapali turler dahil).
      const acik = g.turler.filter((t) => katmanTurleri[t]).length;
      return {
        baslik: g.departman?.ad ?? (kirilim ? YONLENDIRILMEMIS_AD : "Tür"),
        baslikRengi: g.departman?.renk ?? YONLENDIRILMEMIS_RENK,
        baslikDurumu:
          acik === g.turler.length ? "hepsi" : acik === 0 ? "hicbiri" : "kismi",
        baslikSayisi: g.turler.reduce((t, tur) => t + varlikTurSayilari[tur], 0),
        onBaslikSec: () =>
          katmanTurGrubuDegistir(g.turler, acik !== g.turler.length),
        onSec: katmanTuruDegistir,
        secenekler: g.turler.map(secenek),
      } satisfies AltGrup;
    });

    gruplar.push({
      baslik: "Durum",
      onSec: katmanVarlikDurumuDegistir,
      secenekler: ASSET_STATUSES.map((s) => ({
        anahtar: s,
        etiket: ASSET_STATUS_LABELS[s],
        renk: VARLIK_DURUM_RENGI[s],
        // Dolgu her iki durumda da tur rengi; farki kenarlik tasir.
        renkler: IYI_SWATCH_RENKLERI,
        secili: katmanVarlikDurumlari[s],
        sayi: varlikDurumSayilari[s],
      })),
    });

    return gruplar;
  }, [
    gorunurDepartmanlar,
    user?.departman,
    eslemeSorgu.data,
    katmanTurleri,
    varlikTurSayilari,
    katmanVarlikDurumlari,
    varlikDurumSayilari,
    katmanTuruDegistir,
    katmanTurGrubuDegistir,
    katmanVarlikDurumuDegistir,
  ]);
  /** Saha Ekipleri katmaninin departman alt-filtresi. Yalnizca EKIBI OLAN
   *  mudurlukler listelenir; sayaclar TUM ekiplerden alinir (alan secimi
   *  uygulanmaz), yoksa secili departmani kapatinca kendi sayisi sifira duserdi. */
  const ekipAltFiltre = useMemo<AltGrup[]>(() => {
    const tumEkipler = ekipSorgu.data ?? [];
    const sayilar = new Map<string, number>();
    for (const e of tumEkipler) {
      const anahtar = e.departman ?? DEPARTMANSIZ;
      sayilar.set(anahtar, (sayilar.get(anahtar) ?? 0) + 1);
    }
    const secenekler = (gorunurDepartmanlar ?? [])
      .filter((d) => sayilar.has(d.kod))
      .map((d) => ({
        anahtar: d.kod,
        etiket: d.ad,
        renk: d.renk,
        secili: ekipDepartmaniSecili(d.kod),
        sayi: sayilar.get(d.kod) ?? 0,
      }));
    if (sayilar.has(DEPARTMANSIZ)) {
      secenekler.push({
        anahtar: DEPARTMANSIZ,
        etiket: "Departmansız",
        renk: EKIP_VARSAYILAN_RENK,
        secili: ekipDepartmaniSecili(null),
        sayi: sayilar.get(DEPARTMANSIZ) ?? 0,
      });
    }
    return [{ baslik: "Müdürlük", onSec: ekipDepartmaniDegistir, secenekler }];
  }, [
    ekipSorgu.data,
    gorunurDepartmanlar,
    ekipDepartmaniSecili,
    ekipDepartmaniDegistir,
  ]);

  /** Bolge ve guzergah katmanlarinin departman alt-filtresi (ayri state).
   *  Ekip katmanindan farkli: gorulebilen AKTIF mudurluklerin hepsi listelenir
   *  (kaydi olmayan "0" ile), pasif mudurluk yalnizca kaydi varsa listelenir.
   *  Departmansiz kayitlar "Genel"dir (tum personel gorur), "sahipsiz" degil. */
  const bolgeAltFiltreleri = useMemo<Record<BolgeKatmani, AltGrup[]>>(() => {
    const kirilim = (tip: BolgeTipi, katman: BolgeKatmani): AltGrup[] => {
      const sayilar = new Map<string, number>();
      for (const b of bolgeSorgu.data ?? []) {
        if (b.tip !== tip) continue;
        const anahtar = b.departman ?? DEPARTMANSIZ;
        sayilar.set(anahtar, (sayilar.get(anahtar) ?? 0) + 1);
      }
      const filtre = bolgeDepartmani[katman];
      const secenekler = (gorunurDepartmanlar ?? [])
        .filter((d) => d.aktif || sayilar.has(d.kod))
        .map((d) => ({
          anahtar: d.kod,
          etiket: d.ad,
          renk: d.renk,
          secili: filtre.secili(d.kod),
          sayi: sayilar.get(d.kod) ?? 0,
        }));
      secenekler.push({
        anahtar: DEPARTMANSIZ,
        etiket: "Genel",
        renk: GENEL_BOLGE_RENGI,
        secili: filtre.secili(null),
        sayi: sayilar.get(DEPARTMANSIZ) ?? 0,
      });
      return [{ baslik: "Müdürlük", onSec: filtre.degistir, secenekler }];
    };
    return {
      bolgeler: kirilim("alan", "bolgeler"),
      guzergahlar: kirilim("cizgi", "guzergahlar"),
    };
  }, [bolgeSorgu.data, gorunurDepartmanlar, bolgeDepartmani]);

  // Mudurluk alt-filtresi icin "Onaylandı" ve "Bekleyen" ayri Map'te sayilir
  // ki birinde bir mudurlugu kapatmak digerinin sayaclarini etkilemesin.
  const talepMudurlukSayilari = useMemo(() => {
    const sonuc: Partial<Record<TalepGorunumu, Map<string, number>>> = {};
    for (const g of ["onaylandi", "beklemede"] as const) {
      const sayilar = new Map<string, number>();
      for (const f of talepGorunumleri[g]) {
        if (alandaMi) {
          const n = talepNoktasi(f);
          if (!n || !alandaMi(n)) continue;
        }
        const anahtar = eslemeSorgu.data?.[f.properties.type] ?? DEPARTMANSIZ;
        sayilar.set(anahtar, (sayilar.get(anahtar) ?? 0) + 1);
      }
      sonuc[g] = sayilar;
    }
    return sonuc;
  }, [talepGorunumleri, alandaMi, eslemeSorgu.data]);

  /** TalepPaneli'ne gecirilen mudurluk suzgusu: lejanttaki kutucuklarla AYNI
   *  `talepDepartmani` state'ini okur. "Onaylandı"/"Bekleyen" disinda kisit yok. */
  const talepMudurlukSecili = useCallback(
    (gorunum: TalepGorunumu, tur: AssetType) => {
      const filtre = talepDepartmani[gorunum];
      if (!filtre) return true;
      const departman = eslemeSorgu.data?.[tur] ?? null;
      return filtre.secili(departman);
    },
    [talepDepartmani, eslemeSorgu.data]
  );

  // Her durum satiri KENDI grubudur (tek ortak "Durum" grubu degil): boylece
  // her gorunumun mudurluk kirilimi DOM'da tam kendi altina girer.
  const talepAltFiltre = useMemo<AltGrup[]>(() => {
    const durumSatiri = (d: TalepGorunumu): AltGrup => ({
      onSec: katmanDurumuDegistir,
      secenekler: [
        {
          anahtar: d,
          etiket: REPORT_STATUS_LABELS[d],
          renk: TALEP_DURUM_RENGI[d],
          secili: katmanDurumlari[d],
          sayi: talepGorunumleriAlanda[d].length,
        },
      ],
    });

    // Mudurluk kirilimi yalnizca "Onaylandı"/"Bekleyen"de vardir, her biri
    // kendi state'i ile - bir gorunumun secimi digerini etkilemez.
    const mudurlukGrubu = (gorunum: TalepGorunumu): AltGrup | null => {
      const filtre = talepDepartmani[gorunum];
      const sayilar = talepMudurlukSayilari[gorunum];
      if (!filtre || !sayilar) return null;
      const secenekler = (gorunurDepartmanlar ?? [])
        .filter((d) => sayilar.has(d.kod))
        .map((d) => ({
          anahtar: d.kod,
          etiket: d.ad,
          renk: d.renk,
          secili: filtre.secili(d.kod),
          sayi: sayilar.get(d.kod) ?? 0,
        }));
      if (sayilar.has(DEPARTMANSIZ)) {
        secenekler.push({
          anahtar: DEPARTMANSIZ,
          etiket: YONLENDIRILMEMIS_AD,
          renk: YONLENDIRILMEMIS_RENK,
          secili: filtre.secili(null),
          sayi: sayilar.get(DEPARTMANSIZ) ?? 0,
        });
      }
      if (secenekler.length === 0) return null;
      return {
        // Baslik yok: bu grup kendi durum satirinin alt-filtresidir;
        // `girintili` bagimliligi anlatir.
        onSec: filtre.degistir,
        secenekler,
        girintili: true,
        aktif: katmanDurumlari[gorunum],
      };
    };

    const gruplar: AltGrup[] = [];
    for (const d of TALEP_GORUNUMLERI) {
      gruplar.push(durumSatiri(d));
      const mg = mudurlukGrubu(d);
      if (mg) gruplar.push(mg);
    }
    return gruplar;
  }, [
    katmanDurumlari,
    talepGorunumleriAlanda,
    katmanDurumuDegistir,
    gorunurDepartmanlar,
    talepMudurlukSayilari,
    talepDepartmani,
  ]);

  // --- Sekme -> lejant (ana katmanlar) senkronu ---------------------------
  // Lejant, panelde o an secili olani isaretler; her sekme degisiminde
  // yeniden kurulur, yalnizca ANA katmanlari kapsar. "ekle" sekmesinde ve
  // panel kapaliyken katmanlara dokunulmaz; "Saha Ekipleri" hic degistirilmez.
  useEffect(() => {
    if (aktifSekme === "talepler") {
      yalnizVarlikVeyaTalep("talepler");
      talepDurumunuSec(talepDurum);
    } else if (aktifSekme === "liste") {
      yalnizVarlikVeyaTalep("varliklar");
    } else if (bolgeSekmesi(aktifSekme)) {
      katmaniAc(BOLGE_SEKMELERI[aktifSekme].katman);
    }
  }, [aktifSekme, talepDurum, yalnizVarlikVeyaTalep, talepDurumunuSec, katmaniAc]);

  // Bildirimden varliga git: kaynagina gore dogru sekmeyi acar, secer, ucar.
  const bildirimVarligaGit = useCallback((asset: AssetFeature) => {
    alanlariTemizle();
    if (asset.properties.source === "ihbar") {
      setSekme("talepler");
      // Tamir edilmis varlik "Onaylandı"da degil "Tamir Edildi"de listelenir.
      setTalepDurum(asset.properties.status === "iyi" ? "tamir" : "onaylandi");
    } else {
      setSekme("liste");
    }
    setPanelAcik(true);
    setSeciliId(asset.properties.id);
    setDetayAsset(null);
    setSeciliTalepId(null);
    setSeciliBolgeId(null);
    setUcusHedefi({
      anahtar: crypto.randomUUID(),
      tip: "nokta",
      merkez: asset.geometry.coordinates,
      zoom: 16,
    });
  }, [alanlariTemizle]);

  // Bildirimden talebe git.
  const bildirimTalepaGit = useCallback((report: ReportFeature) => {
    setSekme("talepler");
    setPanelAcik(true);
    setSeciliTalepId(report.properties.id);
    setDetayRapor(null);
    setSeciliId(null);
    setSeciliBolgeId(null);
    const nokta = talepNoktasi(report);
    if (nokta) {
      setUcusHedefi({
        anahtar: crypto.randomUUID(),
        tip: "nokta",
        merkez: nokta,
        zoom: 16,
      });
    }
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
          turAdi(p.type) + (p.source === "ihbar" ? " · Talepten" : ""),
        zaman: p.updated_at,
        kategori: "bakim",
        onTikla: () => bildirimVarligaGit(f),
      });
    }
    if (personel) {
      for (const r of bekleyenTalepSorgu.data?.features ?? []) {
        const p = r.properties;
        liste.push({
          id: p.id,
          tip: p.type,
          baslik: `Yeni talep: ${p.name}`,
          altbaslik: p.note?.trim() || turAdi(p.type),
          zaman: p.created_at,
          kategori: "talep",
          onTikla: () => bildirimTalepaGit(r),
        });
      }
    }
    liste.sort((a, b) => +new Date(b.zaman) - +new Date(a.zaman));
    return liste.slice(0, 30);
  }, [
    bakimSorgu.data,
    bekleyenTalepSorgu.data,
    personel,
    bildirimVarligaGit,
    bildirimTalepaGit,
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
        id: "talepler",
        etiket: "Talepler",
        ikon: IconInbox,
        onClick: () => sekmeSec("talepler"),
        aktif: aktifSekme === "talepler",
        rozet: bekleyenTalepSayisi,
      },
      {
        id: "bolgeler",
        etiket: "Bölgeler",
        ikon: IconLayers,
        onClick: () => sekmeSec("bolgeler"),
        aktif: aktifSekme === "bolgeler",
      },
      {
        id: "guzergahlar",
        etiket: "Güzergâhlar",
        ikon: IconRoute,
        onClick: () => sekmeSec("guzergahlar"),
        aktif: aktifSekme === "guzergahlar",
      }
    );
  }

  const kenarYonetimOgeleri: KenarOgesi[] = personel
    ? [
        {
          id: "saha",
          etiket: "Saha Ekipleri ve Havuz",
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
    kenarYonetimOgeleri.push({
      id: "departman",
      etiket: "Departmanlar",
      ikon: IconLayers,
      onClick: () => setUstModal("departman"),
      aktif: ustModal === "departman",
    });
  }

  const kenarAltOgeler: KenarOgesi[] = [
    { id: "temizle", etiket: "Sıfırla", ikon: IconRefresh, onClick: sifirla },
  ];

  // Secili varlik: o an haritada gosterilen koleksiyondan aranir.
  const seciliVarlik = useMemo<AssetFeature | null>(
    () => gosterilen?.features.find((f) => f.properties.id === seciliId) ?? null,
    [gosterilen, seciliId]
  );
  const [detayAsset, setDetayAsset] = useState<AssetFeature | null>(null);

  // Secili talep: once panelin yukledigi listede, yoksa harita katmaninda
  // aranir; boylece hangi sekmede gorunurse gorunsun detayi acilabilir.
  const seciliRapor = useMemo<ReportFeature | null>(() => {
    if (!seciliTalepId) return null;
    return (
      talepler.find((r) => r.properties.id === seciliTalepId) ??
      talepKatmanVeri.features.find((r) => r.properties.id === seciliTalepId) ??
      null
    );
  }, [talepler, talepKatmanVeri, seciliTalepId]);
  const [detayRapor, setDetayRapor] = useState<ReportFeature | null>(null);

  /** "Varlığı Yönet": talepten olusan varligin detay modalini acar. Hem harita
   *  popup'i hem talep detayi bunu cagirir; varlik yoksa talep detayina duser. */
  const talepVarligiYonet = useCallback(
    (raporId: string) => {
      const varlikId = onayliEsleme.rapordanVarliga.get(raporId);
      const varlik = talepVarlikSorgu.data?.features.find(
        (f) => f.properties.id === varlikId
      );
      if (varlik) {
        // Iki modal ust uste binmesin.
        setDetayRapor(null);
        setDetayAsset(varlik);
      } else setDetayRapor(seciliRapor);
    },
    [talepVarlikSorgu.data, seciliRapor]
  );

  /** "Konuma Git": haritayi varligin konumuna ucurur. `seciliId`'ye bilincli
   *  olarak dokunmaz - MapView'in secim ucusu varlik o an haritadaki
   *  koleksiyonda yoksa calismazdi, bu yol koleksiyondan bagimsizdir. */
  const varligaGit = useCallback((asset: AssetFeature) => {
    setUcusHedefi({
      anahtar: crypto.randomUUID(),
      tip: "nokta",
      merkez: asset.geometry.coordinates,
      zoom: 16,
    });
  }, []);

  /** Ekip popup'indaki bir ise tiklaninca varligin detay modalini acar. Varlik
   *  acik listelerde olmayabilir ve durumu taze olmali, bu yuzden her zaman
   *  API'den cekilir. Harita oynatilmaz: modal acmak bir gezinme degildir. */
  const ekipGoreviAcildi = useCallback(async (assetId: string) => {
    try {
      const varlik = await getAsset(assetId);
      setDetayRapor(null);
      setDetayBolgeId(null);
      setDetayAsset(varlik);
    } catch (e) {
      window.alert(`Varlık açılamadı: ${(e as Error).message}`);
    }
  }, []);

  /** Ekip popup'indaki bir bolge/guzergah satirina tiklaninca kaydin detay
   *  modalini acar - tekil isteki `ekipGoreviAcildi`'nin karsiligi. Varliktan
   *  farkli olarak API'den cekilmez: `["bolgeler"]` sorgusu kullanicinin
   *  gorebildigi TUM kayitlari tasir (kapsam backend'de uygulanir), tekil bir
   *  uc de yok. Lejant filtresiyle gizlenmis bir kayit da acilabilir: popup'ta
   *  gorunen bir satirin tiklanamamasi anlasilmaz olurdu. */
  const ekipBolgesiAcildi = useCallback(
    (bolgeId: string) => {
      // Kaydin listede olup olmadigi yine kontrol edilir (silinmis bir satira
      // tiklanabilir), ama modale ID verilir - veriyi sorgu tasir.
      if (!bolgeSorgu.data?.some((b) => b.id === bolgeId)) return;
      setDetayAsset(null);
      setDetayRapor(null);
      setDetayBolgeId(bolgeId);
    },
    [bolgeSorgu.data]
  );

  /** Aktif sekmenin govdesi. Masaustunde yuzen panelin, mobilde sheet'in
   *  icine girer - iki kabuk da AYNI paneli gosterir, mobil icin ayri bir
   *  liste/form yazilmadi. */
  const panelGovdesi = (
    <div className="flex min-h-0 flex-1 flex-col">
      {sekme === "liste" && (
        <AssetList
          // Liste secili alanla daralir, harita tam kalir (bkz. `varlikKatmanTaban`).
          data={varlikPanelVeri}
          isLoading={sorgu.isLoading}
          isError={sorgu.isError}
          error={sorgu.error as Error | null}
          turler={katmanTurleri}
          onTurDegistir={katmanTuruDegistir}
          onTurGrubuDegistir={katmanTurGrubuDegistir}
          durumlar={katmanVarlikDurumlari}
          onDurumSec={panelDurumuSec}
          seciliId={seciliId}
          onSec={varlikSecildi}
          onDuzenle={setDuzenlenen}
          ilceKodu={ilceKodu}
          onIlceSec={ilceSec}
          mahalleKodu={mahalleKodu}
          onMahalleSec={mahalleSec}
          idariHatasi={idariHatasi}
          ekipler={ekipSorgu.data}
          onVarligaGit={varligaGit}
          atanmamisIdler={personel ? atanmamisIdler : undefined}
          mobil={mobil}
        />
      )}

      {sekme === "ekle" && (
        <EklePaneli
          kip={ekleKipi}
          onKipSec={ekleKipiSec}
          onGeri={ekleKipiBirak}
          mobil={mobil}
          form={
            <AssetForm
              koordinat={koordinat}
              // Kayit bitince kip birakilir, panel "ne eklemek istiyorsun?"
              // ekranina doner (bos form acik kalirsa kullanici kaydin
              // gectigini goremezdi).
              onDone={ekleKipiBirak}
            />
          }
        />
      )}

      {sekme === "talepler" && (
        <TalepPaneli
          durum={talepDurum}
          onDurumChange={setTalepDurum}
          onVarlikOlustu={() => {
            // Onay yeni bir varlik olusturup ekibe atar; iki sorgu tazelenmeli.
            queryClient.invalidateQueries({ queryKey: ["assets"] });
            queryClient.invalidateQueries({ queryKey: ["saha"] });
          }}
          onTaleplerChange={setTalepler}
          mudurlukSecili={talepMudurlukSecili}
          seciliRaporId={seciliTalepId}
          onRaporSec={talepSecildi}
          talepVarlikSorgu={talepVarlikSorgu}
          seciliVarlikId={seciliId}
          onVarlikSec={varlikSecildi}
          ekipler={ekipSorgu.data}
          onVarligaGit={varligaGit}
          // Panel secili alanla daralir; harita katmani tam kalir.
          alandaMi={alandaMi}
          atanmamisIdler={personel ? atanmamisIdler : undefined}
          mobil={mobil}
        />
      )}

      {bolgeSekmesi(sekme) && (
        <BolgePaneli
          // Bilincli olarak `key={sekme}` YOK: ayrim panelin icinde
          // `useListeAraci`'nin `kapsam`i ile yapilir (arama sifirlanir,
          // siralama sekme basina hatirlanir).
          tip={BOLGE_SEKMELERI[sekme].tip}
          alanda={alandaMi ? bolgeAlanda : null}
          ekipler={ekipSorgu.data}
          gizliler={gizliBolgeler}
          onGorunurlukDegis={bolgeGorunurlukDegis}
          onTumunuGoster={bolgeleriGoster}
          onTumunuGizle={bolgeleriGizle}
          katmanAcik={katmanlar[BOLGE_SEKMELERI[sekme].katman]}
          onKatmaniAc={() => katmanDegistir(BOLGE_SEKMELERI[sekme].katman)}
          onBolgeyeGit={bolgeyeGit}
          onSekilDuzenle={sekilDuzenlemeBaslat}
          sekilDuzenlenenId={sekilDuzenleme?.id ?? null}
          seciliId={seciliBolgeId}
          onDetay={(b) => setDetayBolgeId(b.id)}
          mobil={mobil}
        />
      )}
    </div>
  );

  /** Harita. Iki kabuk da AYNI ornegi kullanir; mobilde tek fark, uzerine
   *  binen kontrollerin yerlesimidir. */
  const haritaBlogu = (
    <MapView
      assets={katmanlar.varliklar ? varlikKatmanVeri : undefined}
      reports={katmanlar.talepler ? talepKatmanVeri : undefined}
      seciliTalepId={seciliTalepId}
      onTalepSec={talepSecildi}
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
      onHaritaHazir={setHarita}
      // Popup'lardaki tek dugme: islemler acilan detay modallerinin isidir.
      onVarlikDetay={() => setDetayAsset(seciliVarlik)}
      onTalepDetay={() => setDetayRapor(seciliRapor)}
      ekipler={katmanlar.ekipler ? haritaEkipleri : undefined}
      ekipDepartmanlari={ekipDepartmanlari}
      onEkipGorevSec={personel ? ekipGoreviAcildi : undefined}
      onEkipBolgeSec={personel ? ekipBolgesiAcildi : undefined}
      bolgeler={haritaBolgeleri}
      seciliBolgeId={seciliBolgeId}
      onBolgeSec={bolgeSecildi}
      onBolgeDetay={setDetayBolgeId}
      onBolgeAdDegis={personel ? bolgeAdiDegistir : undefined}
      sekilDuzenleme={sekilDuzenleme ?? talepSekilDuzenleme}
      onSekilDegis={sekilDuzenleme ? sekilDegisti : talepSekilDegisti}
      // Yalnizca varlik ekleme kipinde kapatilir: buyuk bir bolgenin icine
      // tiklayarak varlik eklenebilmeli.
      bolgeTiklanabilir={!(panelAcik && sekme === "ekle" && ekleKipi === "varlik")}
    />
  );

  /** Alt-ortada tek panel durur: sekil duzenlenirken cizim/olcum paneli yerine
   *  sekil paneli gorunur. Mobilde ikisi de alt sekme cubugunun ustune oturur
   *  (`altOfset`), masaustunde ekranin dibinden 1.5rem yukarida. */
  const aracOfseti = mobil ? ALT_CUBUK_YUKSEKLIGI : undefined;
  const aracPaneli = sekilDuzenleme ? (
    <BolgeSekilPaneli
      duzenleme={sekilDuzenleme}
      degisti={sekilDegismis}
      onVazgec={sekilDuzenlemeKapat}
      onKaydet={sekilKaydet}
      kaydediliyor={sekilKaydediliyor}
      hata={sekilHatasi}
      onGenislet={sekilGenislet}
      genisletiliyor={sekilGenisletiliyor}
      onGeriAl={sekilGeriAl}
      geriAlinabilir={sekilGeriAlinabilir}
      altOfset={aracOfseti}
    />
  ) : talepSekilDuzenleme ? (
    <BolgeSekilPaneli
      duzenleme={talepSekilDuzenleme}
      degisti={talepSekilDegismis}
      onVazgec={talepSekilDuzenlemeKapat}
      onKaydet={talepSekilKaydet}
      kaydediliyor={talepSekilKaydediliyor}
      hata={talepSekilHatasi}
      // Genisletme yalnizca ALAN (Polygon) taleplerde anlamli; cizgide
      // BolgeSekilPaneli zaten bu bolumu gostermez (`duzenleme.tip==="cizgi"`).
      onGenislet={talepSekilGenislet}
      genisletiliyor={talepSekilGenisletiliyor}
      onGeriAl={talepSekilGeriAl}
      geriAlinabilir={talepSekilGeriAlinabilir}
      altOfset={aracOfseti}
    />
  ) : (
    <CizimPaneli
      cizimModu={cizimModu}
      cizimNoktalari={cizimNoktalari}
      cizimRengi={cizimRengi}
      onCizimRengiSec={setCizimRengi}
      alanM2={alanM2}
      alanHatasi={alanHatasi}
      alanYukleniyor={alanYukleniyor}
      onAlanIptal={cizimIptalEt(alanSecimiIptal)}
      onAlanGeriAl={cizimGeriAl}
      onAlanTamamla={alanSecimiTamamla}
      tamamlananAlanlar={tamamlananAlanlar}
      onAlanKaldir={alanKaldir}
      onTumAlanlariTemizle={cizimIptalEt(tumAlanlariTemizle)}
      alanOlculeri={alanOlculeri}
      toplamNetM2={alanOzetiSonuc?.toplam_m2}
      hamToplamM2={alanOzetiSonuc?.ham_toplam_m2}
      kaydedebilir={personel}
      onAlanKaydet={alanKaydetIste}
      onOlcumKaydet={olcumKaydetIste}
      olcumModu={olcumModu}
      olcumNoktalari={olcumNoktalari}
      olcumMesafeM={olcumMesafeM}
      onOlcumIptal={cizimIptalEt(olcumIptal)}
      onOlcumGeriAl={olcumGeriAl}
      onOlcumBitir={olcumBitir}
      onOlcumTemizle={cizimIptalEt(olcumTemizle)}
      altOfset={aracOfseti}
    />
  );

  const masaustuKabuk = (
    <>
      {/* Ust bar (uygulama header'i) */}
      <header className="z-20 flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4">
        <div className="flex items-center gap-3">
          {/* Sol kenar cubugunu genislet/daralt */}
          <button
            onClick={() => setKenarAcik((v) => !v)}
            aria-label="Menüyü aç/kapat"
            title="Menü"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <IconMenu className="h-5 w-5" />
          </button>

          <div className="flex select-none items-center gap-4">
            <HaberVerLogo className="h-9 w-auto shrink-0" />
            <p className="hidden text-[9.5px] font-semibold uppercase leading-[1.5] tracking-[0.14em] text-slate-400 lg:block">
              Akıllı Şehir
              <br />
              Hızlı Çözüm
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

          {/* Ust barda AKTIF bir alan sorgusunun gostergesi durur: alan secimi
              listeleri daraltir, neyin daralttigi ekranda gorunmeli. */}
          {tamamlananAlanlar.length > 0 && (
            <span className="flex items-center">
              <button
                onClick={() => sekmeSec("liste")}
                title="Seçili alanın sonuçlarını göster"
                className="flex items-center gap-1.5 rounded-full border border-emerald-600 bg-emerald-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm shadow-emerald-600/20 transition-all hover:bg-emerald-500 hover:shadow-md"
              >
                <IconLasso className="h-3.5 w-3.5" />
                {`${tamamlananAlanlar.length} alan seçili`}
              </button>
              <button
                onClick={tumAlanlariTemizle}
                title="Alan seçiminden çık"
                aria-label="Alan seçiminden çık"
                className="ml-1 flex h-8 w-8 items-center justify-center rounded-full border border-emerald-600 bg-emerald-600 text-white shadow-sm transition hover:bg-emerald-500"
              >
                <IconX className="h-3.5 w-3.5" />
              </button>
            </span>
          )}

          <div className="mx-1 h-6 w-px bg-slate-200" />

          <BildirimZili bildirimler={bildirimler} />

          <div className="flex items-center gap-2">
            <div className="flex flex-col items-end leading-tight">
              <p className="text-xs font-medium text-slate-700">
                {user?.full_name || user?.email}
              </p>
              {user && (
                <p className="text-[11px] text-slate-400">
                  {USER_ROLE_LABELS[user.role]}
                </p>
              )}
              {/* Admin'de (departman NULL) hicbir sey cizilmez. */}
              <DepartmanEtiketi kod={user?.departman} className="mt-0.5" />
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

      {aracPaneli}

      {/* Govde: tam ekran harita + uzerine binen kenar cubugu ve yuzen paneller.
          Cubuk akisin disindadir (yoksa acilip kapanmasi haritayi yeniden
          boyutlandirirdi); genisligi `--kenar` degiskeniyle yayilir. */}
      <div
        className="relative min-h-0 flex-1"
        style={
          { "--kenar": kenarAcik ? "15rem" : "68px" } as CSSProperties
        }
      >
        <Kenarcubugu
          genis={kenarAcik}
          ogeler={kenarAnaOgeler}
          yonetimOgeleri={kenarYonetimOgeleri}
          altOgeler={kenarAltOgeler}
        />

        <div className="relative h-full w-full">
          {haritaBlogu}

        {/* Sag-ustteki lejant + katman filtresi. */}
        <KatmanKontrolu
          key={sifirlamaNo}
          gorunur={katmanlar}
          onDegistir={katmanDegistir}
          sayilar={katmanSayilari}
          altlar={{
            varliklar: varlikAltFiltre,
            talepler: talepAltFiltre,
            bolgeler: bolgeAltFiltreleri.bolgeler,
            guzergahlar: bolgeAltFiltreleri.guzergahlar,
            ekipler: ekipAltFiltre,
          }}
          // Ilce/mahalle secimi AssetList'teki acilirlarla ayni state.
          bolge={{ ilceKodu, onIlceSec: ilceSec, mahalleKodu, onMahalleSec: mahalleSec }}
        />

        <MapStilKontrolu aktifId={aktifStilId} onSec={setAktifStilId} harita={harita} />

        {/* Aktif sekmenin yuzen paneli: kenar cubugunun sagindan acilir. Sekil
            duzenlenirken gizlenir (secili sekme STATE'te durur, sekil
            kapatilinca panel oldugu yerden geri acilir). */}
        {panelAcik && !sekilDuzenleme && !talepSekilDuzenleme && (
          <div className="absolute bottom-4 top-4 z-20 flex w-[360px] max-w-[calc(100vw_-_var(--kenar)_-_2rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white/95 shadow-2xl backdrop-blur-sm transition-[left] duration-200 ease-out" style={{ left: "calc(var(--kenar) + 1rem)" }}>
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
                onClick={paneliKapat}
                aria-label="Paneli kapat"
                title="Paneli kapat"
                className="flex h-6 w-6 items-center justify-center rounded-lg opacity-70 transition hover:bg-white/60 hover:opacity-100"
              >
                <IconX className="h-4 w-4" />
              </button>
            </div>

            {panelGovdesi}
          </div>
        )}

        </div>
      </div>
    </>
  );

  /** Haritanin sag ustundeki dikey arac yigini: katman sheet'i + sifirlama. */
  const mobilAracYigini = (
    <div className="absolute right-3 top-3 z-20 flex flex-col items-end gap-2">
      <MobilAracDugmesi
        etiket="Katmanlar ve lejant"
        aktif={mobilKatman}
        rozet={Object.values(katmanlar).filter(Boolean).length}
        onClick={() => {
          setMobilMenu(false);
          setMobilSifirlaOnayi(false);
          setMobilKatman(true);
        }}
      >
        <IconLayers className="h-5 w-5" />
      </MobilAracDugmesi>

      {/* Cizim/ekleme icin burada dugme YOK: alt sekme cubugundaki "Ekle"
          tek giris kapisidir. */}

      {/* Sifirla tum calisma durumunu basa dondurur (cizim ici temizlik
          CizimPaneli'nde). Onay SilOnayi desenindedir: dugmenin kendisi
          iki secenege doner. */}
      {mobilSifirlaOnayi ? (
        <div className="flex items-center gap-1 rounded-xl border border-red-200 bg-white/95 p-1 shadow-lg backdrop-blur-md">
          <button
            onClick={() => setMobilSifirlaOnayi(false)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500"
            aria-label="Vazgeç"
          >
            <IconX className="h-4 w-4" />
          </button>
          <button
            onClick={() => {
              setMobilSifirlaOnayi(false);
              sifirla();
            }}
            className="h-9 shrink-0 rounded-full bg-red-600 px-3 text-[13px] font-semibold text-white"
          >
            Sıfırla
          </button>
        </div>
      ) : (
        <MobilAracDugmesi
          etiket="Sıfırla"
          tehlike
          onClick={() => setMobilSifirlaOnayi(true)}
        >
          <IconRefresh className="h-5 w-5" />
        </MobilAracDugmesi>
      )}
    </div>
  );

  const mobilKabuk = (
    <>
      {/* Arama header'da kalici durur, yalnizca buyutec + "Ara" kadar yer
          kaplar; odaklaninca kalan bosluga dogru genisler. */}
      <header className="z-20 flex h-14 shrink-0 items-center gap-1 border-b border-slate-200 bg-white px-2">
        <button
          onClick={() => {
            setMobilKatman(false);
            setMobilMenu(true);
          }}
          aria-label="Menüyü aç"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-500"
        >
          <IconMenu className="h-5 w-5" />
        </button>

        <div className="flex min-w-0 select-none items-center">
          <HaberVerLogo className="h-8 w-auto shrink-0" />
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          <KonumArama
            gorunenAlan={haritaGorunumu}
            zorunluAlan={idariSinirKutusu}
            yerTutucu="Ara"
            dar
            genislikSinifi="w-[104px] focus-within:w-44 transition-[width]"
            onSecildi={(konum) =>
              setUcusHedefi({
                anahtar: crypto.randomUUID(),
                tip: "nokta",
                merkez: konum,
                zoom: 16,
              })
            }
          />
          <BildirimZili bildirimler={bildirimler} />
        </div>
      </header>

      {aracPaneli}

      <div className="relative min-h-0 flex-1">
        <div className="absolute inset-0">{haritaBlogu}</div>

        {/* Sifirlama onayi disariya dokununca vazgecilir. */}
        {mobilSifirlaOnayi && (
          <button
            aria-label="Sıfırlamadan vazgeç"
            onClick={() => setMobilSifirlaOnayi(false)}
            className="absolute inset-0 z-10 cursor-default"
          />
        )}

        {mobilAracYigini}

        <AltSekmeCubugu ogeler={kenarAnaOgeler} />

        {/* Aktif sekmenin paneli. Sheet haritayi kapatmaz: kullanici yarim
            kademede listeyi okurken isaretcileri gormeye devam eder. */}
        <Sheet
          // Sekil duzenlenirken cekilir; secili sekme STATE'te durdugu icin
          // kaydet/vazgec/kapat sonrasi panel oldugu yerden geri acilir.
          acik={panelAcik && !sekilDuzenleme && !talepSekilDuzenleme}
          baslik={SEKME_TANIMLARI[sekme].etiket}
          onKapat={paneliKapat}
          altBosluk={ALT_CUBUK_YUKSEKLIGI}
          // Bolge/guzergah sekmelerinde alt-orta arac paneli de haritanin
          // ustunde durur; tam kademe ikisine birden yer birakmiyordu.
          enGenisKademe={bolgeSekmesi(sekme) ? "yarim" : "tam"}
          // Her sekme YARIM kademede acilir: panellerin hepsi haritayla
          // birlikte kullaniliyor. Tam kademe icin tutamak var.
          baslangic="yarim"
          baslikSinifi={SEKME_RENK_SINIFLARI[SEKME_TANIMLARI[sekme].renk].aktif}
          govdeSinifi="flex min-h-0 flex-1 flex-col"
          ikon={
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
          }
        >
          {panelGovdesi}
        </Sheet>

        {/* Lejant + tur/durum filtresi + harita cesidi tek sheet'te. */}
        <Sheet
          acik={mobilKatman}
          baslik="Katmanlar ve Lejant"
          onKapat={() => setMobilKatman(false)}
          altBosluk={ALT_CUBUK_YUKSEKLIGI}
          ustte
          ikon={
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
              <IconLayers className="h-4 w-4" />
            </span>
          }
        >
          <KatmanKontrolu
            key={sifirlamaNo}
            gomulu
            gorunur={katmanlar}
            onDegistir={katmanDegistir}
            sayilar={katmanSayilari}
            altlar={{
              varliklar: varlikAltFiltre,
              talepler: talepAltFiltre,
              bolgeler: bolgeAltFiltreleri.bolgeler,
              guzergahlar: bolgeAltFiltreleri.guzergahlar,
              ekipler: ekipAltFiltre,
            }}
            bolge={{ ilceKodu, onIlceSec: ilceSec, mahalleKodu, onMahalleSec: mahalleSec }}
          />
          <div className="border-t border-slate-200 p-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Harita çeşidi
            </p>
            <MapStilKontrolu
              gomulu
              aktifId={aktifStilId}
              onSec={setAktifStilId}
              harita={harita}
            />
          </div>
        </Sheet>

        {/* Yonetim ekranlari + kullanici + cikis; harita gerektirmedikleri
            icin alt sekme cubuguna girmez. */}
        <Sheet
          acik={mobilMenu}
          baslik="Menü"
          onKapat={() => setMobilMenu(false)}
          altBosluk={ALT_CUBUK_YUKSEKLIGI}
          ustte
          ikon={
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
              <IconMenu className="h-4 w-4" />
            </span>
          }
        >
          <div className="p-3">
            <div className="mb-3 rounded-xl bg-slate-50 p-3">
              <p className="text-sm font-medium text-slate-800">
                {user?.full_name || user?.email}
              </p>
              {user && (
                <p className="text-xs text-slate-500">
                  {USER_ROLE_LABELS[user.role]}
                </p>
              )}
              <DepartmanEtiketi kod={user?.departman} className="mt-1" />
            </div>

            {kenarYonetimOgeleri.length > 0 && (
              <>
                <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Yönetim
                </p>
                <div className="mb-3 space-y-0.5">
                  {kenarYonetimOgeleri.map((oge) => (
                    <MobilMenuSatiri
                      key={oge.id}
                      oge={oge}
                      onSecildi={() => setMobilMenu(false)}
                    />
                  ))}
                </div>
              </>
            )}

            <div className="space-y-0.5 border-t border-slate-100 pt-2">
              {kenarAltOgeler.map((oge) => (
                <MobilMenuSatiri
                  key={oge.id}
                  oge={oge}
                  onSecildi={() => setMobilMenu(false)}
                />
              ))}
              <button
                onClick={cikisYap}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-red-600 transition hover:bg-red-50"
              >
                <IconLogout className="h-5 w-5 shrink-0" />
                Çıkış Yap
              </button>
            </div>
          </div>
        </Sheet>
      </div>
    </>
  );

  return (
    <div className="ekran-yuksekligi flex w-screen flex-col overflow-hidden bg-slate-100">
      {mobil ? mobilKabuk : masaustuKabuk}

      <AssetDetayModal
        asset={detayAsset}
        onKapat={() => setDetayAsset(null)}
        atayabilir={personel}
        ekipler={ekipSorgu.data}
        // Tek prefix'ten tazelenir: ekip yukleri/gorev listesi/havuz birlikte.
        onAtandi={() => queryClient.invalidateQueries({ queryKey: ["saha"] })}
        // Iki modal ust uste binmesin diye duzenlemeye gecerken detay kapanir.
        onDuzenle={
          personel
            ? (asset) => {
                setDetayAsset(null);
                setDuzenlenen(asset);
              }
            : undefined
        }
        onSilindi={() => {
          setDetayAsset(null);
          setSeciliId(null);
        }}
        onGit={varligaGit}
      />
      <ReportDetayModal
        report={detayRapor}
        onKapat={() => setDetayRapor(null)}
        islemYetkisi={personel}
        onVarligiYonet={personel ? talepVarligiYonet : undefined}
        onSekilDuzenle={
          personel
            ? (report) => {
                setDetayRapor(null);
                talepSekilDuzenlemeBaslat(report);
              }
            : undefined
        }
        onIslemBitti={() => {
          setDetayRapor(null);
          setSeciliTalepId(null);
          queryClient.invalidateQueries({ queryKey: ["reports"] });
          queryClient.invalidateQueries({ queryKey: ["assets"] });
          queryClient.invalidateQueries({ queryKey: ["saha"] });
        }}
      />

      {/* Haritadaki bir alana/cizgiye tiklandiginda acilan detay karti. */}
      <BolgeDetayModal
        bolge={detayBolge}
        onKapat={() => setDetayBolgeId(null)}
        onGit={bolgeyeGit}
        onSekilDuzenle={personel ? sekilDuzenlemeBaslat : undefined}
        ekipler={personel ? ekipSorgu.data : undefined}
        yonetebilir={personel}
        // Soz DONDURULUR: modal tazelemenin bitmesini bekler, yoksa secici
        // eski atamayi gosterirdi.
        onDegisti={() =>
          Promise.all([
            queryClient.invalidateQueries({ queryKey: ["bolgeler"] }),
            queryClient.invalidateQueries({ queryKey: ["saha"] }),
          ])
        }
        onSilindi={() => {
          setDetayBolgeId(null);
          setSeciliBolgeId(null);
          queryClient.invalidateQueries({ queryKey: ["bolgeler"] });
          queryClient.invalidateQueries({ queryKey: ["saha"] });
        }}
      />

      {/* Cizilen alan/cizgiyi adlandirip kalici bir "bölge" olarak kaydeder. */}
      <BolgeKaydetModal
        taslak={bolgeTaslagi}
        onKapat={() => setBolgeTaslagi(null)}
        onKaydedildi={() => {
          queryClient.invalidateQueries({ queryKey: ["bolgeler"] });
          // Yeni kayit otomatik atanmis olabilir (bkz. crud/bolge.py::create_bolge).
          queryClient.invalidateQueries({ queryKey: ["saha"] });
          // Sekil artik "Bölgeler" katmaninda; gecici cizim listesinde de
          // kalirsa iki kez gorunup alan ozetinde iki kez sayilirdi.
          const kaynak = bolgeTaslagi?.kaynak;
          if (kaynak?.tip === "alan") alanKaldir(kaynak.id);
          else if (kaynak?.tip === "olcum") olcumTemizle();
          ekleKipiBirak();
          setSekme(bolgeTaslagi?.tip === "cizgi" ? "guzergahlar" : "bolgeler");
          setPanelAcik(true);
        }}
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

      {/* Ust bardan acilan yonetim/raporlama ekranlari (modal olarak). */}
      <Modal
        acik={ustModal === "ozet"}
        baslik="Özet"
        genis
        icerikSinifi=""
        onKapat={() => setUstModal(null)}
      >
        {/* Ozet listeyle ayni kumeyi raporlar: alan secimi aktifken sayilar
            secili alanin icini anlatir. Harita katmani tam kalir. */}
        <Dashboard
          data={varlikPanelVeri}
          talepGorunumleri={personel ? talepGorunumleriAlanda : undefined}
          alanSecimiAktif={tamamlananAlanlar.length > 0}
        />
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
        acik={ustModal === "departman"}
        baslik="Departmanlar"
        genis
        icerikSinifi="flex h-[70vh] flex-col"
        onKapat={() => setUstModal(null)}
      >
        {user?.role === "admin" && <DepartmanYonetimi />}
      </Modal>

      <Modal
        acik={ustModal === "saha"}
        baslik="Saha Ekipleri ve Havuz"
        genis
        icerikSinifi="flex h-[70vh] flex-col"
        onKapat={() => setUstModal(null)}
      >
        {personel && (
          <SahaEkipleri
            onVarlikDetay={ekipGoreviAcildi}
            onBolgeDetay={ekipBolgesiAcildi}
          />
        )}
      </Modal>
    </div>
  );
}

/** Sekme renklerinin Tailwind siniflari. Tailwind JIT sablon dizgilerini
 *  (`border-${renk}-600`) taramadigi icin tam metin yazilir. */
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

/** Mobilde haritanin sag ustundeki yuvarlak arac dugmesi. Dokunmatik hedef
 *  44px'in uzerinde tutulur; masaustundeki kucuk ikon dugmeleri parmakla
 *  tutturulamiyordu. */
function MobilAracDugmesi({
  etiket,
  aktif,
  tehlike,
  rozet,
  onClick,
  children,
}: {
  etiket: string;
  aktif?: boolean;
  /** Geri alinamayan islem (Sifirla): dolgu yerine kirmizi ikon. */
  tehlike?: boolean;
  rozet?: number;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={etiket}
      aria-pressed={tehlike ? undefined : aktif}
      className={`relative flex h-11 w-11 items-center justify-center rounded-xl border shadow-lg backdrop-blur-md transition ${
        aktif
          ? "border-emerald-600 bg-emerald-600 text-white"
          : tehlike
            ? "border-red-200 bg-white/90 text-red-600"
            : "border-slate-200/80 bg-white/90 text-slate-600"
      }`}
    >
      {children}
      {rozet != null && rozet > 0 && (
        <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-emerald-600 px-1 text-[10px] font-bold text-white ring-2 ring-white">
          {rozet}
        </span>
      )}
    </button>
  );
}


/** Mobil menu sheet'indeki tek satir. Kenar cubugunun ogesini (`KenarOgesi`)
 *  oldugu gibi alir - mobil ayri bir menu tanimi tasimaz. */
function MobilMenuSatiri({
  oge,
  onSecildi,
}: {
  oge: KenarOgesi;
  onSecildi: () => void;
}) {
  const { etiket, ikon: Ikon, onClick, aktif, rozet } = oge;
  return (
    <button
      onClick={() => {
        onClick();
        onSecildi();
      }}
      aria-pressed={aktif}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition ${
        aktif ? "bg-emerald-50 text-emerald-700" : "text-slate-700 hover:bg-slate-100"
      }`}
    >
      <Ikon
        className={`h-5 w-5 shrink-0 ${aktif ? "text-emerald-600" : "text-slate-400"}`}
      />
      <span className="flex-1 truncate text-left">{etiket}</span>
      {rozet != null && rozet > 0 && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-100 px-1.5 text-xs font-semibold text-amber-700">
          {rozet > 99 ? "99+" : rozet}
        </span>
      )}
    </button>
  );
}
