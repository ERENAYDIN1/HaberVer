import { useQuery, useQueryClient } from "@tanstack/react-query";
import type maplibregl from "maplibre-gl";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { getAsset } from "./api/assets";
import { bolgeler as bolgeleriGetir } from "./api/bolgeler";
import { bolgeGuncelle } from "./api/bolgeler";
import { ekipGorevleri as ekipGorevleriGetir } from "./api/saha";
import { useAuth } from "./auth/AuthContext";
import AssetDetayModal from "./components/AssetDetayModal";
import AssetForm from "./components/AssetForm";
import AssetList from "./components/AssetList";
import BildirimZili, { type Bildirim } from "./components/BildirimZili";
import BolgeDetayModal from "./components/BolgeDetayModal";
import BolgeKaydetModal, { type BolgeTaslagi } from "./components/BolgeKaydetModal";
import BolgePaneli from "./components/BolgePaneli";
import BolgeSekilPaneli from "./components/BolgeSekilPaneli";
import CizimPaneli from "./components/CizimPaneli";
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
  IconRuler,
  IconUsers,
  IconX,
} from "./components/icons";
import TalepPaneli from "./components/TalepPaneli";
import KatmanKontrolu, {
  type AltGrup,
  type KatmanAnahtari,
} from "./components/KatmanKontrolu";
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
import { useAlanSecimi } from "./hooks/useAlanSecimi";
import { useTalepGorunumleri } from "./hooks/useTalepGorunumleri";
import { useSekilDuzenleme } from "./hooks/useSekilDuzenleme";
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
import { mesafeEtiketi, noktaAlandaMi, poligonSinirKutusu } from "./utils/geo";
import { EKIP_VARSAYILAN_RENK } from "./utils/haritaPopup";
import type { EkipDepartmanBilgisi } from "./utils/haritaPopup";
import { ISTANBUL_MERKEZI } from "./utils/istanbulMaskesi";

/** Lejanttaki durum swatch'inin KENARLIK rengi. Haritada her iki durumdaki
 *  varlik da tur (grup) rengiyle cizildigi icin dolgu buradan gelmez; durumu
 *  anlatan sey amber uyari halkasi + "!" rozetidir. */
const VARLIK_DURUM_RENGI: Record<AssetStatus, string> = {
  iyi: "#0f766e",
  bakim_lazim: "#f59e0b",
};

/** Durum swatch'inin dilimleri: gruplarin gercek harita renkleri. */
const IYI_SWATCH_RENKLERI = TIP_GRUPLARI.map((g) => GRUP_RENGI[g]);

/** Acilis (ve "Temizle") degerleri: hem useState baslangiclari hem sifirla()
 *  buradan okur. Katman/lejant baslangiclari `hooks/useKatmanlar.ts`'te. */
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
  // Varsayilan "kayitli" varliklar; talepten gelenler ayri sekmede.
  const [filters, setFilters] = useState<AssetFilters>(BASLANGIC.filtreler);
  const [sekme, setSekme] = useState<Sekme>(BASLANGIC.sekme);
  const [ustModal, setUstModal] = useState<UstModal | null>(null);
  /** Her "Temizle"de artar: kendi ic durumu olan yuzen bilesenler (lejant
   *  karti) key olarak bunu alip yeniden kurulur. */
  const [sifirlamaNo, setSifirlamaNo] = useState(0);
  const [seciliId, setSeciliId] = useState<string | null>(null);
  // TalepPaneli'nin yukledigi talepler; haritada da gosterilirler.
  const [talepler, setTalepler] = useState<ReportFeature[]>([]);
  const [seciliTalepId, setSeciliTalepId] = useState<string | null>(null);
  // Talepler sekmesinin alt-sekmesi. Burada tutulur ki bildirimden gelen bir
  // varlik dogru alt-sekmeyi acabilsin.
  const [talepDurum, setTalepDurum] = useState<TalepGorunumu>(BASLANGIC.talepDurum);
  const [duzenlenen, setDuzenlenen] = useState<AssetFeature | null>(null);
  const [koordinat, setKoordinat] = useState<
    { longitude: number; latitude: number } | undefined
  >();
  // Acilista panel kapali gelir, harita sade gorunur.
  const [panelAcik, setPanelAcik] = useState(false);
  const [aktifStilId, setAktifStilId] = useState<HaritaStilId>(VARSAYILAN_STIL);
  // Sol kenar cubugu genis (etiketli) mi.
  const [kenarAcik, setKenarAcik] = useState(true);
  // Katman gorunurlugu + tur/durum alt-filtreleri. Sag-ustteki lejant ile sol
  // paneldeki acilirlar ayni state'i yazar (bkz. useKatmanlar).
  const {
    katmanlar,
    katmanTurleri,
    katmanVarlikDurumlari,
    katmanDurumlari,
    ekipDepartmaniSecili,
    bolgeDepartmani,
    katmanDegistir,
    katmanTuruDegistir,
    katmanTurGrubuDegistir,
    katmanVarlikDurumuDegistir,
    katmanDurumuDegistir,
    ekipDepartmaniDegistir,
    panelTuruSec,
    departmanTurleriniSec,
    panelDurumuSec,
    katmaniAc,
    yalnizVarlikVeyaTalep,
    talepDurumunuSec,
    sifirla: katmanlariSifirla,
  } = useKatmanlar();

  // Panel kapaliyken hicbir sekme aktif sayilmaz.
  const aktifSekme: Sekme | null = panelAcik ? sekme : null;

  // Aktif kutucuga tekrar tiklamak paneli kapatir.
  const sekmeSec = (id: Sekme) => {
    if (panelAcik && sekme === id) {
      setPanelAcik(false);
      return;
    }
    setSekme(id);
    setPanelAcik(true);
  };

  const [ucusHedefi, setUcusHedefi] = useState<UcusHedefi | null>(null);
  const [haritaGorunumu, setHaritaGorunumu] = useState<
    [[number, number], [number, number]] | null
  >(null);
  // Stil onizlemeleri ana haritanin kadrajini takip eder; kurulunca bir kez
  // yazilir, sonrasinda senkron MapLibre olaylari uzerinden yurur.
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
    // Alan bitince sonuclarin listelendigi sekmeye gec.
    onAlanTamamlandi: () => setSekme("liste"),
  });

  // "Temizle": tum calisma durumunu (secimler, filtreler, cizim/olcum,
  // ilce/mahalle, acik panel ve modal) BASLANGIC degerlerine dondurur ve
  // haritayi acilis gorunumune ucurur. Harita stili ve kenar cubugunun
  // acik/kapali olusu bilincli olarak korunur: bunlar gorunum tercihi.
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
    // Ana katmanlar kapanir, alt filtreler isaretli kalir: katman tekrar
    // acildiginda kullanici elenmis degil tam listeyi gorur.
    katmanlariSifirla();
    alanSeciminiSifirla();
    setBolgeTaslagi(null);
    setDetayBolge(null);
    setSeciliBolgeId(null);
    // Yarim kalan sekil duzenlemesi birakilir (kaydedilmemis taslak gider).
    sekilDuzenlemeKapat();
    // Kaydedilmis bolgeler silinmez, yalnizca katmanlari kapanir. Tek tek
    // yapilmis gizlemeler varsayilana (hepsi gorunur) doner.
    setGizliBolgeler(new Set());
    setUcusHedefi({
      anahtar: crypto.randomUUID(),
      tip: "nokta",
      merkez: ISTANBUL_MERKEZI,
      zoom: BASLANGIC.zoom,
    });
  };

  // --- Kaydedilmis bolgeler (gorev bolgeleri / guzergahlar) ---------------
  // Haritada gizlenmis olanlarin id'leri; varsayilan olarak hepsi gorunur.
  const [gizliBolgeler, setGizliBolgeler] = useState<Set<string>>(new Set());
  // Kaydedilmek uzere olan cizim; kaydetme modali bunun uzerinden acilir.
  const [bolgeTaslagi, setBolgeTaslagi] = useState<BolgeTaslagi | null>(null);
  const [detayBolge, setDetayBolge] = useState<Bolge | null>(null);
  const [seciliBolgeId, setSeciliBolgeId] = useState<string | null>(null);

  const sorgu = useAssets(filters);
  // Alan secimi varsa liste/ozet birlestirilmis sonucu gosterir.
  const gosterilen = birlesikAlanSonucu ?? sorgu.data;

  // Yalniz admin/calisan talepleri yonetir.
  const personel = user?.role === "admin" || user?.role === "calisan";

  /** Talepler + gorunum turetmesi (onaylanmis talep, varligi tamir edilince
   *  "Tamir Edildi"ye duser). Secim callback'leri `onayliEsleme`yi okudugu
   *  icin onlardan once cagrilir. */
  const {
    talepVarlikSorgu,
    bekleyenTalepSorgu,
    bekleyenTalepSayisi,
    onayliEsleme,
    gorunumler: talepGorunumleri,
  } = useTalepGorunumleri({ personel });

  // Not: talep secimi sekme degisiminde bilincli olarak temizlenmez; haritada
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
  // Varliklar zaten backend'de suzuluyor (`assetsWithin`); talep, bolge ve
  // ekip katmanlari ayni sinirla burada, client-side elenir - yoksa lejant
  // "ilce secili" derken ilcenin disindaki talepleri/ekipleri saymaya devam
  // ederdi. Olcut varliklarinkiyle ayni: nokta secili alanlardan HERHANGI
  // birinin icinde mi (alanlar birlestirilerek degil tek tek denenir; varlik
  // sonuclari da id'ye gore birlestiriliyor).
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
  // Bakim bekleyen varliklar - ana listeden bagimsiz sorgu.
  const bakimSorgu = useAssets({ status: "bakim_lazim" });

  // Canli ekip konumlari + aktif gorevleri. Haritadaki marker'lari, ekip
  // popup'ini ve varlik detayindaki elle atama listesini besler.
  const ekipSorgu = useQuery({
    queryKey: ["saha", "ekipler"],
    queryFn: ekipGorevleriGetir,
    enabled: personel,
    refetchInterval: 20000,
  });

  // Departman sozlugu: ekip isaretcilerinin rengi ve lejanttaki ekip
  // alt-filtresi buradan beslenir (uzun staleTime, bkz. useDepartmanlar).
  const departmanSorgu = useDepartmanlar();
  /** Lejantta adi gecebilecek mudurlukler: admin tum sozlugu, departmani olan
   *  personel yalnizca kendisininkini gorur (bkz. `lejantDepartmanlari`).
   *  `AssetList`'teki departman filtresiyle ayni sinir. */
  const gorunurDepartmanlar = useMemo(
    () => lejantDepartmanlari(departmanSorgu.data, user?.departman),
    [departmanSorgu.data, user?.departman]
  );
  // Tur -> mudurluk yonlendirmesi; lejanttaki varlik kirilimi bunu okur.
  const eslemeSorgu = useTurDepartmanEslemesi();

  // Kaydedilmis bolgeler: panel ve haritadaki kalici katman ayni sorguyu paylasir.
  const bolgeSorgu = useQuery({
    queryKey: ["bolgeler"],
    queryFn: bolgeleriGetir,
    enabled: personel,
  });
  // Alanlar ve guzergahlar ayri katmanlar oldugu icin gorunur listeleri de
  // ayri hesaplanir; MapView'a yalnizca acik olanlarin birlesimi gider.
  // Departman alt-filtresi de burada uygulanir (ekip katmanindaki desen):
  // admin butun mudurluklerin calisma alanlarini ayni anda goruyor.
  const [gorunurAlanlar, gorunurGuzergahlar] = useMemo(() => {
    const gorunur = (bolgeSorgu.data ?? [])
      .filter((b) => !gizliBolgeler.has(b.id))
      .filter((b) => bolgeAlanda(b));
    return [
      gorunur.filter(
        (b) => b.tip === "alan" && bolgeDepartmani.bolgeler.secili(b.departman)
      ),
      gorunur.filter(
        (b) => b.tip === "cizgi" && bolgeDepartmani.guzergahlar.secili(b.departman)
      ),
    ];
  }, [bolgeSorgu.data, gizliBolgeler, bolgeAlanda, bolgeDepartmani]);
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

  // "Tümünü göster/gizle" yalnizca panelin kendi turunu etkiler: id'ler
  // panelden gelir, diger turun gorunurlugune dokunulmaz.
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

  // Bolge secimi haritadan ya da panelden gelir; varlik/talep secimiyle ayni
  // kurallara uyar: paneli acmaz, acikken dogru sekmeye gecer.
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
    baslat: sekilDuzenlemeBaslat,
    kapat: sekilDuzenlemeKapat,
    degisti: sekilDegisti,
    sekliSifirla: sekilSifirla,
    kaydet: sekilKaydet,
    genislet: sekilGenislet,
  } = useSekilDuzenleme({
    bolgeler: bolgeSorgu.data,
    bolgeyeGit,
    // Cizim/olcum ile ayni alt paneli paylasir, ikisi birlikte acilamaz.
    onBaslarken: cizimVeOlcumuKapat,
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
  // Sekmelerden bagimsiz: kullanici katmanlari istedigi kombinasyonda gorebilir.
  const varlikKatmanTaban = gosterilen;
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

  /** Talep gruplarinin secili alanla sinirlanmis hali; hem harita katmani hem
   *  lejant sayaclari bunu okur. Bildirim zilinin sayaci bilincli olarak ham
   *  sorgudan gelir: zil sistemin tamamini anlatir, haritanin secimini degil. */
  const talepGorunumleriAlanda = useMemo(() => {
    if (!alandaMi) return talepGorunumleri;
    return Object.fromEntries(
      TALEP_GORUNUMLERI.map((g) => [
        g,
        talepGorunumleri[g].filter((f) => {
          const n = talepNoktasi(f);
          return n ? alandaMi(n) : false;
        }),
      ])
    ) as Record<TalepGorunumu, ReportFeature[]>;
  }, [talepGorunumleri, alandaMi]);

  // Talep katmani: secili gorunumlerin talepleri id'ye gore tekillestirilir.
  const talepKatmanVeri = useMemo<ReportFeatureCollection>(() => {
    const gorulen = new Map<string, ReportFeature>();
    for (const gorunum of TALEP_GORUNUMLERI) {
      if (!katmanDurumlari[gorunum]) continue;
      for (const f of talepGorunumleriAlanda[gorunum]) gorulen.set(f.properties.id, f);
    }
    return { type: "FeatureCollection", features: [...gorulen.values()] };
  }, [katmanDurumlari, talepGorunumleriAlanda]);

  // Secilen talebin gorunumu panelin alt sekmesini de belirler, yoksa secili
  // kayit acilan listede gorunmezdi. Ham durum degil gorunum kullanilir:
  // tamir edilmis bir talep "Onaylandı" sekmesinde bulunmaz.
  useEffect(() => {
    if (!seciliTalepId) return;
    const secili = talepKatmanVeri.features.find(
      (f) => f.properties.id === seciliTalepId
    )?.properties;
    if (secili) setTalepDurum(secili.gorunum ?? secili.status);
  }, [seciliTalepId, talepKatmanVeri]);

  /** Haritada gosterilen ekipler. Yalnizca KATMAN suzulur: atama acilirlari
   *  (AssetDetayModal, SahaEkipleri, BolgePaneli) tam listeyi gormeye devam
   *  eder - secili ilcenin disindaki bir ekibe elle is verilebilmeli. Konumu
   *  bilinmeyen ekip zaten haritada cizilmiyor, alan testinden de gecmez.
   *
   *  Departman alt-filtresi de burada uygulanir: butun mudurluklerin ekipleri
   *  ayni anda cizilince harita okunmaz hale geliyordu. */
  const haritaEkipleri = useMemo(() => {
    const ekipler = ekipSorgu.data;
    if (!ekipler) return ekipler;
    return ekipler.filter(
      (e) =>
        ekipDepartmaniSecili(e.departman) &&
        (!alandaMi ||
          (e.longitude != null &&
            e.latitude != null &&
            alandaMi([e.longitude, e.latitude])))
    );
  }, [ekipSorgu.data, alandaMi, ekipDepartmaniSecili]);

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
    // anlatir ve mudurlugun kendi rengini tasir. Secenegin swatch'i ise
    // haritada gercekten basilan grup rengidir; 0012'den beri ikisi tum
    // turlerde ayni renge oturur.
    const esleme = eslemeSorgu.data;
    const secenek = (t: AssetType) => ({
      anahtar: t,
      etiket: turAdi(t),
      renk: turRengi(t),
      secili: katmanTurleri[t],
      sayi: varlikTurSayilari[t],
    });

    // Ortak kategorileme: acilir listeler ve yonetim ekrani da ayni gruplamayi
    // kullanir. Sozluk gelmeden gruplanmaz - yoksa ilk karede her tur
    // "yönlendirilmemiş" basligi altina duser, sonra yerine otururdu.
    //
    // Departmani olan personelde tur listesi de kendi mudurluguyle daralir
    // (`lejantTurleri`): yalnizca basliklari elemek kapsam disi turleri
    // "Henüz Yönlendirilmemiş" kovasina dokerdi.
    const kirilim = departmanTurGruplari(
      gorunurDepartmanlar,
      esleme,
      lejantTurleri(turKodlari(), esleme, user?.departman)
    );
    const gruplar: AltGrup[] = (
      kirilim ?? [{ departman: null, turler: turKodlari() }]
    ).map((g) => {
      // Kirilim uc kademeli: Varlıklar → Müdürlükler → Türler. Baslik
      // kutucugu mudurlugun tum turlerini birlikte acar/kapatir; sayaci da
      // mudurlugun toplamidir (kapali turler dahil - baslik "bu mudurlukte kac
      // varlik var"i anlatir, "kacini seciyorum"u degil).
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
  /** Saha Ekipleri katmaninin departman alt-filtresi.
   *
   *  Yalnizca EKIBI OLAN mudurlukler listelenir: bos bir satir kullaniciya
   *  kapatacak bir sey vermez. Sayaclar alan secimi uygulanmis listeden degil
   *  TUM ekiplerden alinir - lejant "bu mudurlukte kac ekip var"i anlatir,
   *  secili departmanin kendi sayisi kapatilinca sifira dusmemeli. */
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
        // Ad kisaltilmaz: lejantin her yerinde mudurluk tam adiyla anilir
        // (uzun ad kirpilir, tam hali tooltip'te).
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

  /** Bolge ve guzergah katmanlarinin departman alt-filtresi (ikisi de ayni
   *  kirilimi alir, ayri state uzerinden).
   *
   *  Ekip katmanindan bir farkla: burada gorulebilen AKTIF mudurluklerin
   *  hepsi listelenir, kaydi olmayan "0" ile gorunur. Lejant o katmanda hangi
   *  mudurluklerin calisma alani oldugunu da anlatir - satirin hic olmamasi
   *  ile "0" yazmasi arasindaki fark budur. Kapanmis (pasif) mudurluk yalnizca
   *  kaydi varsa listelenir: emekliye ayrilmis bir mudurlugu bos satirla
   *  diriltmeyelim. Departmani olan personelde liste kendi mudurlugu + "Genel"e
   *  iner (`lejantDepartmanlari`); "0 kayit" satiri ancak gorebildigi bir
   *  mudurluk icin bilgidir, digerlerinde sadece bir isim ifsasi olurdu.
   *  Sayaclar alan secimi/gizleme uygulanmamis tam listeden gelir.
   *  Departmansiz kayitlar "Genel"dir (tum personelin gordugu calisma
   *  alanlari), "sahipsiz" degil - o satir her zaman durur. */
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
          // Ad kisaltilmaz: lejantin her yerinde mudurluk tam adiyla anilir
        // (uzun ad kirpilir, tam hali tooltip'te).
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

  const talepAltFiltre = useMemo<AltGrup[]>(
    () => [
      {
        onSec: katmanDurumuDegistir,
        secenekler: TALEP_GORUNUMLERI.map((d) => ({
          anahtar: d,
          etiket: REPORT_STATUS_LABELS[d],
          renk: TALEP_DURUM_RENGI[d],
          secili: katmanDurumlari[d],
          sayi: talepGorunumleriAlanda[d].length,
        })),
      },
    ],
    [katmanDurumlari, talepGorunumleriAlanda, katmanDurumuDegistir]
  );

  // --- Sekme -> lejant (ana katmanlar) senkronu ---------------------------
  // Lejant, panelde o an secili olani isaretler; her sekme degisiminde
  // yeniden kurulur ki alakasiz katmanlar acik kalmasin. Yalnizca ANA
  // katmanlari kapsar - tur/durum alt-filtresi zaten ortak state'tir.
  // Kullanici arada lejanttan baska bir katman acarsa efekt bir sonraki sekme
  // degisimine kadar ona dokunmaz. "Saha Ekipleri" hic degistirilmez.
  useEffect(() => {
    if (aktifSekme === "talepler") {
      yalnizVarlikVeyaTalep("talepler");
      talepDurumunuSec(talepDurum);
    } else if (aktifSekme === "liste") {
      yalnizVarlikVeyaTalep("varliklar");
    } else if (bolgeSekmesi(aktifSekme)) {
      // Yalnizca o sekmenin katmani acilir; bolgeler varliklarin ustune binen
      // baglam katmanlaridir, digerlerine dokunulmaz.
      katmaniAc(BOLGE_SEKMELERI[aktifSekme].katman);
    }
    // "ekle" sekmesinde ve panel kapaliyken katmanlara dokunulmaz.
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
    kenarYonetimOgeleri.push({
      id: "departman",
      etiket: "Departmanlar",
      ikon: IconLayers,
      onClick: () => setUstModal("departman"),
      aktif: ustModal === "departman",
    });
  }

  const kenarAltOgeler: KenarOgesi[] = [
    { id: "temizle", etiket: "Temizle", ikon: IconRefresh, onClick: sifirla },
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
      setDetayBolge(null);
      setDetayAsset(varlik);
    } catch (e) {
      window.alert(`Varlık açılamadı: ${(e as Error).message}`);
    }
  }, []);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-100">
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

          {/* Cizgi cizme/olcme kontrolu - detaylar alt ortadaki arac panelinde.
              arac yalnizca mesafe okumak icin
              degil, kaydedilip ekibe atanabilen bir guzergah cizmek icin de
              kullaniliyor; mesafe onun sonucu. */}
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
              ? "Çiziliyor…"
              : olcumNoktalari.length >= 2
                ? mesafeEtiketi(olcumMesafeM)
                : "Çiz"}
          </button>

          {/* Alan secim kontrolu. Alan secilmisken yanindaki "cikis" dugmesi
              secimi bitirir; ana dugme yeni bir alan cizmeye baslar. */}
          <span className="flex items-center">
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
          {!cizimModu && tamamlananAlanlar.length > 0 && (
            <button
              onClick={tumAlanlariTemizle}
              title="Alan seçiminden çık"
              aria-label="Alan seçiminden çık"
              className="ml-1 flex h-8 w-8 items-center justify-center rounded-full border border-emerald-600 bg-emerald-600 text-white shadow-sm transition hover:bg-emerald-500"
            >
              <IconX className="h-3.5 w-3.5" />
            </button>
          )}
          </span>

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
              {/* Kullanicinin mudurlugu: ekrandaki listelerin neden dar
                  oldugunu anlatan bilgi, kimligin yaninda durur. Admin'de
                  (departman NULL) hicbir sey cizilmez. */}
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

      {/* Alt-ortada tek panel durur: sekil duzenlenirken cizim/olcum paneli
          yerine sekil paneli gorunur. */}
      {sekilDuzenleme ? (
        <BolgeSekilPaneli
          duzenleme={sekilDuzenleme}
          degisti={sekilDegismis}
          onVazgec={sekilDuzenlemeKapat}
          onKaydet={sekilKaydet}
          kaydediliyor={sekilKaydediliyor}
          hata={sekilHatasi}
          onGenislet={sekilGenislet}
          genisletiliyor={sekilGenisletiliyor}
          onSifirla={sekilSifirla}
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
        onAlanIptal={alanSecimiIptal}
        onAlanGeriAl={cizimGeriAl}
        onAlanTamamla={alanSecimiTamamla}
        tamamlananAlanlar={tamamlananAlanlar}
        onAlanKaldir={alanKaldir}
        onTumAlanlariTemizle={tumAlanlariTemizle}
        alanOlculeri={alanOlculeri}
        toplamNetM2={alanOzetiSonuc?.toplam_m2}
        hamToplamM2={alanOzetiSonuc?.ham_toplam_m2}
        kaydedebilir={personel}
        onAlanKaydet={alanKaydetIste}
        onOlcumKaydet={olcumKaydetIste}
        olcumModu={olcumModu}
        olcumNoktalari={olcumNoktalari}
        olcumMesafeM={olcumMesafeM}
        onOlcumIptal={olcumIptal}
        onOlcumGeriAl={olcumGeriAl}
        onOlcumBitir={olcumBitir}
        onOlcumTemizle={olcumTemizle}
      />
      )}

      {/* Govde: tam ekran harita + uzerine binen kenar cubugu ve yuzen paneller.
          Cubuk akisin disindadir, yoksa acilip kapanmasi haritayi yeniden
          boyutlandirirdi; genisligi `--kenar` degiskeniyle yayilir ve sola
          hizali her sey ona gore kayar. */}
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
          // Popup'lardaki tek dugme: duzenleme, atama, onay/ret, reddi geri
          // alma ve sekil duzenleme acilan detay modallerinin isidir.
          onVarlikDetay={() => setDetayAsset(seciliVarlik)}
          onTalepDetay={() => setDetayRapor(seciliRapor)}
          ekipler={katmanlar.ekipler ? haritaEkipleri : undefined}
          ekipDepartmanlari={ekipDepartmanlari}
          onEkipGorevSec={personel ? ekipGoreviAcildi : undefined}
          bolgeler={haritaBolgeleri}
          seciliBolgeId={seciliBolgeId}
          onBolgeSec={bolgeSecildi}
          onBolgeDetay={(id) =>
            setDetayBolge(bolgeSorgu.data?.find((b) => b.id === id) ?? null)
          }
          // Ad haritadaki etiket uzerinden de degistirilebilir (yalniz personel).
          onBolgeAdDegis={personel ? bolgeAdiDegistir : undefined}
          sekilDuzenleme={sekilDuzenleme}
          onSekilDegis={sekilDegisti}
          bolgeTiklanabilir={!(panelAcik && sekme === "ekle")}
        />

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

        {/* Aktif sekmenin yuzen paneli: kenar cubugunun sagindan acilir,
            sol bosluk `--kenar` uzerinden verilir. */}
        {panelAcik && (
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
                  // Haritayla ayni koleksiyon: liste, sayaclar ve isaretciler
                  // tek filtre state'inden turer.
                  data={varlikKatmanVeri}
                  isLoading={sorgu.isLoading}
                  isError={sorgu.isError}
                  error={sorgu.error as Error | null}
                  turler={katmanTurleri}
                  onTurSec={panelTuruSec}
                  onDepartmanSec={departmanTurleriniSec}
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

              {sekme === "talepler" && (
                <TalepPaneli
                  durum={talepDurum}
                  onDurumChange={setTalepDurum}
                  onVarlikOlustu={() => {
                    // Onay yeni bir varlik olusturup ekibe atar; iki sorgu da
                    // tazelenmeli.
                    queryClient.invalidateQueries({ queryKey: ["assets"] });
                    queryClient.invalidateQueries({ queryKey: ["saha"] });
                  }}
                  onTaleplerChange={setTalepler}
                  seciliRaporId={seciliTalepId}
                  onRaporSec={talepSecildi}
                  talepVarlikSorgu={talepVarlikSorgu}
                  seciliVarlikId={seciliId}
                  onVarlikSec={varlikSecildi}
                  ekipler={ekipSorgu.data}
                  onVarligaGit={varligaGit}
                  // Lejant/harita ile ayni sinir: secili ilce-mahalle disindaki
                  // talepler listede de gorunmez.
                  alandaMi={alandaMi}
                />
              )}

              {bolgeSekmesi(sekme) && (
                <BolgePaneli
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
                  onDetay={setDetayBolge}
                />
              )}
            </div>
          </div>
        )}

        </div>
      </div>

      {/* Varlik detayi: harita popup'indaki "Detayları Gör" ile listedeki
          "Detay" ayni modali acar. */}
      <AssetDetayModal
        asset={detayAsset}
        onKapat={() => setDetayAsset(null)}
        atayabilir={personel}
        ekipler={ekipSorgu.data}
        onAtandi={() =>
          queryClient.invalidateQueries({ queryKey: ["saha", "ekipler"] })
        }
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
        onKapat={() => setDetayBolge(null)}
        onGit={bolgeyeGit}
        onSekilDuzenle={personel ? sekilDuzenlemeBaslat : undefined}
        // Ekibe aktarma/silme paneldeki kartla ayni islemler.
        ekipler={personel ? ekipSorgu.data : undefined}
        yonetebilir={personel}
        onDegisti={() => queryClient.invalidateQueries({ queryKey: ["bolgeler"] })}
        onSilindi={() => {
          setDetayBolge(null);
          setSeciliBolgeId(null);
          queryClient.invalidateQueries({ queryKey: ["bolgeler"] });
        }}
      />

      {/* Cizilen alan/cizgiyi adlandirip kalici bir "bölge" olarak kaydeder. */}
      <BolgeKaydetModal
        taslak={bolgeTaslagi}
        onKapat={() => setBolgeTaslagi(null)}
        onKaydedildi={() => {
          queryClient.invalidateQueries({ queryKey: ["bolgeler"] });
          // Sekil artik "Bölgeler" katmaninda; gecici cizim listesinde de
          // kalirsa iki kez gorunur ve alan ozetinde iki kez sayilirdi.
          const kaynak = bolgeTaslagi?.kaynak;
          if (kaynak?.tip === "alan") alanKaldir(kaynak.id);
          else if (kaynak?.tip === "olcum") olcumTemizle();
          // Yeni kaydin turune gore dogru sekme acilir.
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
        {/* Ozet, liste/harita ile ayni suzulmus kumeyi kullanir. */}
        <Dashboard
          data={varlikKatmanVeri}
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
