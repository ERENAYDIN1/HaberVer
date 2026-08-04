import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { getAsset } from "./api/assets";
import { bolgeler as bolgeleriGetir } from "./api/bolgeler";
import { bolgeGuncelle } from "./api/bolgeler";
import { reopenReport } from "./api/reports";
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
import IhbarPaneli from "./components/IhbarPaneli";
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
import { useIhbarGorunumleri } from "./hooks/useIhbarGorunumleri";
import { useSekilDuzenleme } from "./hooks/useSekilDuzenleme";
import { useKatmanlar } from "./hooks/useKatmanlar";
import {
  ASSET_STATUS_LABELS,
  ASSET_STATUSES,
  ASSET_TYPE_LABELS,
  ASSET_TYPES,
  GRUP_RENGI,
  GRUP_TURLERI,
  TIP_GRUP_ETIKETLERI,
  TIP_GRUPLARI,
  TIP_RENGI,
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
import type { Bolge } from "./types/bolge";
import {
  IHBAR_DURUM_RENGI,
  IHBAR_GORUNUMLERI,
  REPORT_STATUS_LABELS,
} from "./types/report";
import type {
  IhbarGorunumu,
  ReportFeature,
  ReportFeatureCollection,
} from "./types/report";
import { mesafeEtiketi, poligonSinirKutusu } from "./utils/geo";
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
  ihbarDurum: "onaylandi" as IhbarGorunumu,
  cizimRengi: "#059669",
  zoom: 11,
} as const;

/** Sol paneldeki sekmeler (Ozet/Gecmis/Personel modal olarak acilir). */
type Sekme = "liste" | "ekle" | "ihbarlar" | "bolgeler" | "guzergahlar";

/** Bolge sekmesi -> kayit turu + harita katmani eslesmesi. */
const BOLGE_SEKMELERI = {
  bolgeler: { tip: "alan", katman: "bolgeler" },
  guzergahlar: { tip: "cizgi", katman: "guzergahlar" },
} as const;

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
  ihbarlar: { etiket: "İhbarlar", ikon: IconInbox, renk: "amber" },
  bolgeler: { etiket: "Bölgeler", ikon: IconLayers, renk: "violet" },
  guzergahlar: { etiket: "Güzergâhlar", ikon: IconRoute, renk: "blue" },
};

/** Ust bardan modal olarak acilan yonetim/raporlama ekranlari. */
type UstModal = "ozet" | "log" | "personel" | "saha";

export default function App() {
  const { user, cikisYap } = useAuth();
  const queryClient = useQueryClient();
  // Varsayilan "kayitli" varliklar; ihbardan gelenler ayri sekmede.
  const [filters, setFilters] = useState<AssetFilters>(BASLANGIC.filtreler);
  const [sekme, setSekme] = useState<Sekme>(BASLANGIC.sekme);
  const [ustModal, setUstModal] = useState<UstModal | null>(null);
  /** Her "Temizle"de artar: kendi ic durumu olan yuzen bilesenler (lejant
   *  karti) key olarak bunu alip yeniden kurulur. */
  const [sifirlamaNo, setSifirlamaNo] = useState(0);
  const [seciliId, setSeciliId] = useState<string | null>(null);
  // IhbarPaneli'nin yukledigi ihbarlar; haritada da gosterilirler.
  const [ihbarlar, setIhbarlar] = useState<ReportFeature[]>([]);
  const [seciliIhbarId, setSeciliIhbarId] = useState<string | null>(null);
  // Ihbarlar sekmesinin alt-sekmesi. Burada tutulur ki bildirimden gelen bir
  // varlik dogru alt-sekmeyi acabilsin.
  const [ihbarDurum, setIhbarDurum] = useState<IhbarGorunumu>(BASLANGIC.ihbarDurum);
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
    katmanDegistir,
    katmanTuruDegistir,
    katmanVarlikDurumuDegistir,
    katmanDurumuDegistir,
    panelTuruSec,
    panelDurumuSec,
    katmaniAc,
    yalnizVarlikVeyaIhbar,
    ihbarDurumunuSec,
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
    alanSecimiBaslat,
    alanSecimiIptal,
    alanSecimiTamamla,
    olcumModu,
    olcumNoktalari,
    olcumMesafeM,
    olcumNoktaEkle,
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
    setSeciliIhbarId(null);
    setDetayRapor(null);
    setIhbarlar([]);
    setIhbarDurum(BASLANGIC.ihbarDurum);
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

  // Yalniz admin/calisan ihbarlari yonetir.
  const personel = user?.role === "admin" || user?.role === "calisan";

  /** Ihbarlar + gorunum turetmesi (onaylanmis ihbar, varligi tamir edilince
   *  "Tamir Edildi"ye duser). Secim callback'leri `onayliEsleme`yi okudugu
   *  icin onlardan once cagrilir. */
  const {
    ihbarVarlikSorgu,
    bekleyenIhbarSorgu,
    bekleyenIhbarSayisi,
    onayliEsleme,
    gorunumler: ihbarGorunumleri,
  } = useIhbarGorunumleri({ personel });

  // Not: ihbar secimi sekme degisiminde bilincli olarak temizlenmez; haritada
  // secilen isaretci panel kapaliyken de secili kalir.

  const haritaTiklandi = useCallback(
    (c: { longitude: number; latitude: number }) => {
      // Bos alana tiklamak her zaman secimi temizler.
      setSeciliId(null);
      setDetayAsset(null);
      setSeciliIhbarId(null);
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
        setSeciliIhbarId(null);
        return;
      }
      // Ihbardan olusan varlikta kaynak ihbar da secilir: haritadaki isaretci
      // ham ihbar noktasi, panel ise ondan olusan varliktir.
      setSeciliIhbarId(onayliEsleme.varliktanRapora.get(id) ?? null);
      setDetayRapor(null);
      setSeciliBolgeId(null);
      // "Onaylandı"/"Tamir Edildi" zaten ihbar varliklarini listeler.
      const ihbarVarlikSekmesi =
        sekme === "ihbarlar" && (ihbarDurum === "onaylandi" || ihbarDurum === "tamir");
      if (panelAcik && !ihbarVarlikSekmesi) setSekme("liste");
    },
    [seciliId, panelAcik, sekme, ihbarDurum, onayliEsleme]
  );

  // Ham ihbar secimi - hem listeden hem haritadan cagrilir.
  const ihbarSecildi = useCallback(
    (id: string) => {
      const kapaniyor = seciliIhbarId === id;
      setSeciliIhbarId(kapaniyor ? null : id);
      setDetayRapor(null);
      if (kapaniyor) {
        setSeciliId(null);
        return;
      }
      // varlikSecildi'nin simetrigi: ihbardan olusan varlik da secili sayilir.
      setSeciliId(onayliEsleme.rapordanVarliga.get(id) ?? null);
      setDetayAsset(null);
      setSeciliBolgeId(null);
      if (panelAcik) setSekme("ihbarlar");
    },
    [seciliIhbarId, panelAcik, onayliEsleme]
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

  // Kaydedilmis bolgeler: panel ve haritadaki kalici katman ayni sorguyu paylasir.
  const bolgeSorgu = useQuery({
    queryKey: ["bolgeler"],
    queryFn: bolgeleriGetir,
    enabled: personel,
  });
  // Alanlar ve guzergahlar ayri katmanlar oldugu icin gorunur listeleri de
  // ayri hesaplanir; MapView'a yalnizca acik olanlarin birlesimi gider.
  const [gorunurAlanlar, gorunurGuzergahlar] = useMemo(() => {
    const gorunur = (bolgeSorgu.data ?? []).filter((b) => !gizliBolgeler.has(b.id));
    return [
      gorunur.filter((b) => b.tip === "alan"),
      gorunur.filter((b) => b.tip === "cizgi"),
    ];
  }, [bolgeSorgu.data, gizliBolgeler]);
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

  // Bolge secimi haritadan ya da panelden gelir; varlik/ihbar secimiyle ayni
  // kurallara uyar: paneli acmaz, acikken dogru sekmeye gecer.
  const bolgeSecildi = useCallback(
    (id: string) => {
      const kapaniyor = seciliBolgeId === id;
      setSeciliBolgeId(kapaniyor ? null : id);
      if (kapaniyor) return;
      // Tek secim kurali: bolge secilince varlik/ihbar secimi birakilir.
      setSeciliId(null);
      setDetayAsset(null);
      setSeciliIhbarId(null);
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
      ASSET_TYPES.map((t) => [t, 0])
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
    const tumTurler = ASSET_TYPES.every((t) => katmanTurleri[t]);
    const tumDurumlar = ASSET_STATUSES.every((s) => katmanVarlikDurumlari[s]);
    if (tumTurler && tumDurumlar) return varlikKatmanTaban;
    return {
      type: "FeatureCollection",
      features: varlikKatmanTaban.features.filter(
        (f) => katmanTurleri[f.properties.type] && katmanVarlikDurumlari[f.properties.status]
      ),
    };
  }, [varlikKatmanTaban, katmanTurleri, katmanVarlikDurumlari]);

  // Ihbar katmani: secili gorunumlerin ihbarlari id'ye gore tekillestirilir.
  const ihbarKatmanVeri = useMemo<ReportFeatureCollection>(() => {
    const gorulen = new Map<string, ReportFeature>();
    for (const gorunum of IHBAR_GORUNUMLERI) {
      if (!katmanDurumlari[gorunum]) continue;
      for (const f of ihbarGorunumleri[gorunum]) gorulen.set(f.properties.id, f);
    }
    return { type: "FeatureCollection", features: [...gorulen.values()] };
  }, [katmanDurumlari, ihbarGorunumleri]);

  // Secilen ihbarin gorunumu panelin alt sekmesini de belirler, yoksa secili
  // kayit acilan listede gorunmezdi. Ham durum degil gorunum kullanilir:
  // tamir edilmis bir ihbar "Onaylandı" sekmesinde bulunmaz.
  useEffect(() => {
    if (!seciliIhbarId) return;
    const secili = ihbarKatmanVeri.features.find(
      (f) => f.properties.id === seciliIhbarId
    )?.properties;
    if (secili) setIhbarDurum(secili.gorunum ?? secili.status);
  }, [seciliIhbarId, ihbarKatmanVeri]);

  const katmanSayilari: Record<KatmanAnahtari, number> = {
    varliklar: varlikKatmanVeri?.features.length ?? 0,
    ihbarlar: ihbarKatmanVeri.features.length,
    bolgeler: gorunurAlanlar.length,
    guzergahlar: gorunurGuzergahlar.length,
    ekipler: ekipSorgu.data?.length ?? 0,
  };

  // Sag-ustteki katman kontrolune gecen alt-filtre tanimlari (etiket/renk/sayi).
  const varlikAltFiltre = useMemo<AltGrup[]>(
    () => [
      // Turler grup grup listelenir: grup basligi ayni zamanda renk
      // aciklamasidir, gruptaki turler ayni renkle farkli glifle cizilir.
      ...TIP_GRUPLARI.map((grup) => ({
        baslik: TIP_GRUP_ETIKETLERI[grup],
        onSec: katmanTuruDegistir,
        secenekler: GRUP_TURLERI[grup].map((t) => ({
          anahtar: t,
          etiket: ASSET_TYPE_LABELS[t],
          renk: TIP_RENGI[t],
          secili: katmanTurleri[t],
          sayi: varlikTurSayilari[t],
        })),
      })),
      {
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
      },
    ],
    [
      katmanTurleri,
      varlikTurSayilari,
      katmanVarlikDurumlari,
      varlikDurumSayilari,
      katmanTuruDegistir,
      katmanVarlikDurumuDegistir,
    ]
  );
  const ihbarAltFiltre = useMemo<AltGrup[]>(
    () => [
      {
        onSec: katmanDurumuDegistir,
        secenekler: IHBAR_GORUNUMLERI.map((d) => ({
          anahtar: d,
          etiket: REPORT_STATUS_LABELS[d],
          renk: IHBAR_DURUM_RENGI[d],
          secili: katmanDurumlari[d],
          sayi: ihbarGorunumleri[d].length,
        })),
      },
    ],
    [katmanDurumlari, ihbarGorunumleri, katmanDurumuDegistir]
  );

  // --- Sekme -> lejant (ana katmanlar) senkronu ---------------------------
  // Lejant, panelde o an secili olani isaretler; her sekme degisiminde
  // yeniden kurulur ki alakasiz katmanlar acik kalmasin. Yalnizca ANA
  // katmanlari kapsar - tur/durum alt-filtresi zaten ortak state'tir.
  // Kullanici arada lejanttan baska bir katman acarsa efekt bir sonraki sekme
  // degisimine kadar ona dokunmaz. "Saha Ekipleri" hic degistirilmez.
  useEffect(() => {
    if (aktifSekme === "ihbarlar") {
      yalnizVarlikVeyaIhbar("ihbarlar");
      ihbarDurumunuSec(ihbarDurum);
    } else if (aktifSekme === "liste") {
      yalnizVarlikVeyaIhbar("varliklar");
    } else if (bolgeSekmesi(aktifSekme)) {
      // Yalnizca o sekmenin katmani acilir; bolgeler varliklarin ustune binen
      // baglam katmanlaridir, digerlerine dokunulmaz.
      katmaniAc(BOLGE_SEKMELERI[aktifSekme].katman);
    }
    // "ekle" sekmesinde ve panel kapaliyken katmanlara dokunulmaz.
  }, [aktifSekme, ihbarDurum, yalnizVarlikVeyaIhbar, ihbarDurumunuSec, katmaniAc]);

  // Bildirimden varliga git: kaynagina gore dogru sekmeyi acar, secer, ucar.
  const bildirimVarligaGit = useCallback((asset: AssetFeature) => {
    alanlariTemizle();
    if (asset.properties.source === "ihbar") {
      setSekme("ihbarlar");
      // Tamir edilmis varlik "Onaylandı"da degil "Tamir Edildi"de listelenir.
      setIhbarDurum(asset.properties.status === "iyi" ? "tamir" : "onaylandi");
    } else {
      setSekme("liste");
    }
    setPanelAcik(true);
    setSeciliId(asset.properties.id);
    setDetayAsset(null);
    setSeciliIhbarId(null);
    setSeciliBolgeId(null);
    setUcusHedefi({
      anahtar: crypto.randomUUID(),
      tip: "nokta",
      merkez: asset.geometry.coordinates,
      zoom: 16,
    });
  }, [alanlariTemizle]);

  // Bildirimden ihbara git.
  const bildirimIhbaraGit = useCallback((report: ReportFeature) => {
    setSekme("ihbarlar");
    setPanelAcik(true);
    setSeciliIhbarId(report.properties.id);
    setDetayRapor(null);
    setSeciliId(null);
    setSeciliBolgeId(null);
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

  // Secili ihbar: once panelin yukledigi listede, yoksa harita katmaninda
  // aranir; boylece hangi sekmede gorunurse gorunsun detayi acilabilir.
  const seciliRapor = useMemo<ReportFeature | null>(() => {
    if (!seciliIhbarId) return null;
    return (
      ihbarlar.find((r) => r.properties.id === seciliIhbarId) ??
      ihbarKatmanVeri.features.find((r) => r.properties.id === seciliIhbarId) ??
      null
    );
  }, [ihbarlar, ihbarKatmanVeri, seciliIhbarId]);
  const [detayRapor, setDetayRapor] = useState<ReportFeature | null>(null);

  /** "Varlığı Yönet": ihbardan olusan varligin detay modalini acar. Hem harita
   *  popup'i hem ihbar detayi bunu cagirir; varlik yoksa ihbar detayina duser. */
  const ihbarVarligiYonet = useCallback(
    (raporId: string) => {
      const varlikId = onayliEsleme.rapordanVarliga.get(raporId);
      const varlik = ihbarVarlikSorgu.data?.features.find(
        (f) => f.properties.id === varlikId
      );
      if (varlik) {
        // Iki modal ust uste binmesin.
        setDetayRapor(null);
        setDetayAsset(varlik);
      } else setDetayRapor(seciliRapor);
    },
    [ihbarVarlikSorgu.data, seciliRapor]
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

  /** "Reddi Geri Al". Secim birakilmaz: ihbar "beklemede"ye dondugu icin
   *  alt-sekme senkronu paneli Bekleyen'e alir, kayit orada secili kalir. */
  const ihbarGeriAl = useCallback(
    async (raporId: string) => {
      try {
        await reopenReport(raporId);
        setDetayRapor(null);
        await queryClient.invalidateQueries({ queryKey: ["reports"] });
      } catch (e) {
        window.alert((e as Error).message);
      }
    },
    [queryClient]
  );

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
          // Yalniz personel: silme/tamir/atama detay modalinin icinde.
          onVarlikDuzenle={personel ? () => setDuzenlenen(seciliVarlik) : undefined}
          onIhbarDetay={() => setDetayRapor(seciliRapor)}
          onIhbarVarlikYonet={personel ? ihbarVarligiYonet : undefined}
          onIhbarGeriAl={personel ? ihbarGeriAl : undefined}
          ekipler={katmanlar.ekipler ? ekipSorgu.data : undefined}
          onEkipGorevSec={personel ? ekipGoreviAcildi : undefined}
          bolgeler={haritaBolgeleri}
          seciliBolgeId={seciliBolgeId}
          onBolgeSec={bolgeSecildi}
          onBolgeDetay={(id) =>
            setDetayBolge(bolgeSorgu.data?.find((b) => b.id === id) ?? null)
          }
          onSekilDuzenle={(id) => {
            const bolge = bolgeSorgu.data?.find((b) => b.id === id);
            if (bolge) sekilDuzenlemeBaslat(bolge);
          }}
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
          varlikAlt={varlikAltFiltre}
          ihbarAlt={ihbarAltFiltre}
        />

        <MapStilKontrolu aktifId={aktifStilId} onSec={setAktifStilId} />

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

              {sekme === "ihbarlar" && (
                <IhbarPaneli
                  durum={ihbarDurum}
                  onDurumChange={setIhbarDurum}
                  onVarlikOlustu={() => {
                    // Onay yeni bir varlik olusturup ekibe atar; iki sorgu da
                    // tazelenmeli.
                    queryClient.invalidateQueries({ queryKey: ["assets"] });
                    queryClient.invalidateQueries({ queryKey: ["saha"] });
                  }}
                  onIhbarlarChange={setIhbarlar}
                  seciliRaporId={seciliIhbarId}
                  onRaporSec={ihbarSecildi}
                  ihbarVarlikSorgu={ihbarVarlikSorgu}
                  seciliVarlikId={seciliId}
                  onVarlikSec={varlikSecildi}
                  ekipler={ekipSorgu.data}
                  onVarligaGit={varligaGit}
                />
              )}

              {bolgeSekmesi(sekme) && (
                <BolgePaneli
                  tip={BOLGE_SEKMELERI[sekme].tip}
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
        onVarligiYonet={personel ? ihbarVarligiYonet : undefined}
        onIslemBitti={() => {
          setDetayRapor(null);
          setSeciliIhbarId(null);
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
