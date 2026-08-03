import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { getAsset } from "./api/assets";
import { bolgeler as bolgeleriGetir } from "./api/bolgeler";
import { bolgeGuncelle } from "./api/bolgeler";
import { alanTamponu } from "./api/geo";
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
import type { Bolge, BolgeTipi, SekilDuzenleme } from "./types/bolge";
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
import {
  halkalariAc,
  mesafeEtiketi,
  poligonSinirKutusu,
} from "./utils/geo";
import { ISTANBUL_MERKEZI } from "./utils/istanbulMaskesi";

/** Katman filtresindeki tur rengi icin ortak palet kullanilir (types/asset.ts
 *  `TIP_RENGI`); durum renkleri asagida.
 *
 *  Haritada her iki durumdaki varlik da TUR (grup) rengiyle cizilir - tek bir
 *  "iyi rengi" ya da "bakim rengi" YOK. Bu yuzden iki swatch de grup
 *  renklerinden dilimlenir (`IYI_SWATCH_RENKLERI`); `renk` yalnizca kenarlik
 *  icin durur. "Bakım Lazım"in kenarligi amber cunku haritada durumu anlatan
 *  sey dolgu degil, dairenin cevresindeki amber UYARI HALKASI + "!" rozeti
 *  (MapView "assets-durum" / "assets-rozet") - ayni amber onaylanmis ihbar
 *  pininde de kullanilir, ikisi de acik is.
 *
 *  Onceden "Bakım Lazım" gercekten amber dolgu basiyordu ve o varligin
 *  kategorisi haritada tamamen kayboluyordu; "İyi" ise haritada hicbir
 *  katmanin basmadigi bir yesil (#10b981) gosteriyordu. */
const VARLIK_DURUM_RENGI: Record<AssetStatus, string> = {
  iyi: "#0f766e",
  bakim_lazim: "#f59e0b",
};

/** "İyi" swatch'inin dilimleri: "tur rengiyle cizilir" demek icin gruplarin
 *  gercek renkleri (bkz. types/asset.ts `GRUP_RENGI`). */
const IYI_SWATCH_RENKLERI = TIP_GRUPLARI.map((g) => GRUP_RENGI[g]);

/** Sekil duzenlemede kullanilacak nokta listesi: alanlarda backend'in KAPALI
 *  dondurdugu halkalarin son (tekrar eden) noktasi atilir - aksi halde ilk ve
 *  son kosede ust uste iki tutamak olur ve biri suruklenince sekil bozulur.
 *  Cizgilerde dokunulmaz (bir guzergahin ucu ucuna gelmesi mesru olabilir). */
function sekilNoktalari(
  tip: BolgeTipi,
  noktalar: [number, number][][]
): [number, number][][] {
  return tip === "cizgi" ? noktalar : halkalariAc(noktalar);
}

/** Acilis (ve "Temizle") degerleri tek yerde: hem useState baslangiclari hem
 *  sifirla() bunlari kullanir, boylece ikisi birbirinden ayrisamaz.
 *
 *  Not: KATMAN/lejant baslangiclari burada DEGIL, `hooks/useKatmanlar.ts`
 *  icindeki `KATMAN_BASLANGIC`'ta - o durumun tamami (state + yazicilar +
 *  sifirlama) tek modulde tutuluyor. */
const BASLANGIC = {
  filtreler: { source: "kayitli" } as AssetFilters,
  sekme: "liste" as Sekme,
  ihbarDurum: "onaylandi" as IhbarGorunumu,
  cizimRengi: "#059669",
  /** Harita acilis gorunumu (Istanbul merkezi + zoom 11). */
  zoom: 11,
} as const;

/** Sol paneldeki sekmeler. Ozet/Gecmis/Personel artik burada degil; ust
 *  bardaki butonlardan modal olarak aciliyor (bkz. UstModal). */
type Sekme = "liste" | "ekle" | "ihbarlar" | "bolgeler" | "guzergahlar";

/** Bolge sekmeleri <-> kaydedilmis kayit turu / harita katmani eslesmesi:
 *  "Bölgeler" alanlari (gorev bolgesi), "Güzergâhlar" cizgileri listeler. */
const BOLGE_SEKMELERI = {
  bolgeler: { tip: "alan", katman: "bolgeler" },
  guzergahlar: { tip: "cizgi", katman: "guzergahlar" },
} as const;

/** Bir sekme kaydedilmis bolge/guzergah paneli mi? */
function bolgeSekmesi(s: Sekme | null): s is keyof typeof BOLGE_SEKMELERI {
  return s === "bolgeler" || s === "guzergahlar";
}

/** Her sekmenin kendi ikonu ve rengi var, boyle sekmeler tek bakista
 *  birbirinden ayirt edilebiliyor (hepsi ayni emerald tonuydu). */
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
  // Varsayilan olarak "kayitli" varliklar gosterilir; ihbardan gelenler ayri
  // sekmede tutulur ki iki kaynak birbirine karismasin.
  const [filters, setFilters] = useState<AssetFilters>(BASLANGIC.filtreler);
  const [sekme, setSekme] = useState<Sekme>(BASLANGIC.sekme);
  const [ustModal, setUstModal] = useState<UstModal | null>(null);
  /** Her "Temizle"de artar; kendi ic durumu olan yuzen bilesenleri (lejant karti)
   *  key olarak yeniden kurup baslangica dondurmek icin. */
  const [sifirlamaNo, setSifirlamaNo] = useState(0);
  const [seciliId, setSeciliId] = useState<string | null>(null);
  // "İhbarlar" sekmesindeki ihbarlar haritada gosterilir (IhbarPaneli'den yukari
  // tasinir); secili ihbara tiklaninca harita oraya ucar.
  const [ihbarlar, setIhbarlar] = useState<ReportFeature[]>([]);
  const [seciliIhbarId, setSeciliIhbarId] = useState<string | null>(null);
  // Ihbarlar sekmesinin durum alt-sekmesi (Bekleyen İhbar/Onaylandı/Reddedildi).
  // Burada tutulur ki bir bakim bildirimine tiklaninca dogrudan "onaylandi"ya
  // gecilebilsin ve harita, o an ham ihbar noktalarini mi yoksa onaylanmis
  // ihbarlardan olusan varliklari mi gosterecegini bilsin.
  const [ihbarDurum, setIhbarDurum] = useState<IhbarGorunumu>(BASLANGIC.ihbarDurum);
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
  // Harita katmanlarinin gorunurlugu + varlik tur/durum ve ihbar durum
  // alt-filtreleri. Tamami `useKatmanlar`'da: hem sag-ustteki lejant hem sol
  // paneldeki acilirlar AYNI state'i yazar (bkz. hook'taki "tek kaynak"
  // notu). Sekmelerden bagimsizdir - kullanici istedigi kombinasyonu ayni
  // anda gorebilir.
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

  const [ucusHedefi, setUcusHedefi] = useState<UcusHedefi | null>(null);
  const [haritaGorunumu, setHaritaGorunumu] = useState<
    [[number, number], [number, number]] | null
  >(null);

  /** Harita uzerindeki alan secimi: cizim, olcum, secili alanlarin varlik
   *  sonuclari ve ilce/mahalle sinir secimi. Hepsi ayni `tamamlananAlanlar`
   *  listesini besledigi icin tek hook'ta duruyor (bkz. useAlanSecimi). */
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
    // Yeni bir alan cizilirken varlik secimi birakilir - secili isaretci
    // cizimin altinda kalmasin.
    onCizimBasladi: () => setSeciliId(null),
    // Alan bitince sonuclarin listelendigi sekmeye gec.
    onAlanTamamlandi: () => setSekme("liste"),
  });

  // "Temizle": tüm çalışma durumunu (seçimler, panel filtreleri, lejant/katman
  // seçimleri, çizim/ölçüm, ilçe/mahalle, açık panel ve modal) sitenin ilk
  // açıldığı hale döndürür ve haritayı İstanbul başlangıç görünümüne (merkez +
  // zoom 11) geri uçurur. Değerler BASLANGIC'tan okunur; useState başlangıçları
  // da aynı yerden geldiği için ikisi birbirinden ayrışamaz.
  //
  // Bilinçli olarak DOKUNULMAYANLAR: harita altlık stili ve sol kenar çubuğunun
  // açık/kapalı oluşu - bunlar çalışma durumu değil, kullanıcının görünüm tercihi.
  const sifirla = () => {
    // Lejant kartinin KENDI ic durumu (acik/kapali, hangi alt-filtre grubu
    // genisletilmis) App'te degil bilesenin icinde tutulur; bu sayaci key olarak
    // vererek bileseni yeniden kurar, o durumu da baslangica dondururuz.
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
    // Lejant (sag-ustteki katman filtresi): hicbir ANA katman secili kalmaz -
    // varlik, ihbar ve saha ekibi isaretcileri haritadan kalkar. ALT filtrelerin
    // ise hepsi isaretli birakilir (ihbar durumlari dahil): kullanici bir katmani
    // tekrar actiginda elenmis degil, toplam sayiyi/tam listeyi gorur.
    katmanlariSifirla();
    // Cizim/olcum kapanir, secili alanlar ve ilce/mahalle secimi sifirlanir.
    alanSeciminiSifirla();
    setBolgeTaslagi(null);
    setDetayBolge(null);
    setSeciliBolgeId(null);
    // Yarim kalan sekil duzenlemesi de birakilir (kaydedilmemis taslak gider).
    setSekilDuzenleme(null);
    setSekilHatasi(null);
    // Kaydedilmis bolgeler SILINMEZ (kalici kullanici verisi): BOS_KATMANLAR
    // zaten "Bölgeler" katmanini kapatiyor, yani haritadan kalkiyorlar.
    // Tek tek yapilmis gizlemeler ise varsayilana (hepsi gorunur) doner -
    // katman tekrar acildiginda kullanici eksik bir liste gormesin.
    setGizliBolgeler(new Set());
    setUcusHedefi({
      anahtar: crypto.randomUUID(),
      tip: "nokta",
      merkez: ISTANBUL_MERKEZI,
      zoom: BASLANGIC.zoom,
    });
  };

  // --- Kaydedilmis bolgeler (gorev bolgeleri / guzergahlar) ---------------
  // Haritada GIZLENMIS olanlarin id'leri; varsayilan olarak hepsi gorunur.
  const [gizliBolgeler, setGizliBolgeler] = useState<Set<string>>(new Set());
  // Kaydedilmek uzere olan cizim (alan/cizgi); modal bunun uzerinden acilir.
  const [bolgeTaslagi, setBolgeTaslagi] = useState<BolgeTaslagi | null>(null);
  // Haritada tiklanan bolgenin detay karti (varlik/ihbar detayiyla ayni desen).
  const [detayBolge, setDetayBolge] = useState<Bolge | null>(null);
  // Secili bolge/guzergah: haritada belirgin kenarlikla, panelde vurgulu kartla
  // gosterilir (varlik/ihbar secimiyle ayni dil).
  const [seciliBolgeId, setSeciliBolgeId] = useState<string | null>(null);
  // Sekli haritada duzenlenen kayit: taslak geometri burada tutulur, "Kaydet"e
  // basilana kadar backend'e yazilmaz.
  const [sekilDuzenleme, setSekilDuzenleme] = useState<SekilDuzenleme | null>(null);
  const [sekilHatasi, setSekilHatasi] = useState<string | null>(null);
  const [sekilKaydediliyor, setSekilKaydediliyor] = useState(false);
  const [sekilGenisletiliyor, setSekilGenisletiliyor] = useState(false);


  const sorgu = useAssets(filters);
  // Tamamlanmis alanlar varsa liste/ozet, birlestirilmis (tekilleştirilmiş) sonucu gosterir.
  const gosterilen = birlesikAlanSonucu ?? sorgu.data;

  // Yalniz admin/calisan ihbarlari yonetir; saha_calisani ihbar gormez.
  const personel = user?.role === "admin" || user?.role === "calisan";

  /** Ihbarlar ve GORUNUM turetmesi (onaylanmis bir ihbar, varligi tamir
   *  edilince "Tamir Edildi"ye duser). Secim callback'lerinden ONCE cagrilir:
   *  onlar `onayliEsleme`yi dogrudan okuyabilsin diye - eskiden sira tersti ve
   *  deger bir ref uzerinden tasiniyordu. */
  const {
    ihbarVarlikSorgu,
    bekleyenIhbarSorgu,
    bekleyenIhbarSayisi,
    onayliEsleme,
    gorunumler: ihbarGorunumleri,
  } = useIhbarGorunumleri({ personel });

  // NOT: Ihbar secimi sekme degisiminde BILINCLI olarak temizlenmez - haritada
  // secilen bir isaretci, panel kapaliyken de (ve baska bir sekmede de) secili
  // kalir; kullanici paneli sonradan actiginda hangisini sectigini gorur.
  // Haritadaki ihbar noktalarinin gorunurlugu zaten sag-ustteki katman
  // filtresine bagli, sekmeye degil.

  const haritaTiklandi = useCallback(
    (c: { longitude: number; latitude: number }) => {
      // Bos alana tiklamak (bir varlik/ihbar/bolge ustune degil) her zaman
      // secimi temizler - kullanici secili isaretciyi birakip haritayi sade
      // halde gormek isteyebilir.
      setSeciliId(null);
      setDetayAsset(null);
      setSeciliIhbarId(null);
      setDetayRapor(null);
      setSeciliBolgeId(null);
      // Bos harita tiklamasi "Ekle" formunu ARTIK ACMAZ: haritayi gezerken
      // istemeden forma dusmek rahatsiz ediciydi. Akis tersine cevrildi -
      // once "Ekle" sekmesi acilir, SONRA haritadan koordinat secilir.
      // Dolayisiyla koordinat yalnizca form zaten acikken doldurulur.
      if (aktifSekme !== "ekle") return;
      setKoordinat(c);
    },
    [aktifSekme]
  );

  // Hem listeden hem haritadan cagrilir; zaten secili olan bir varliga tekrar
  // tiklamak secimi iptal eder (toggle).
  //
  // Secim KAPALI PANELI ACMAZ: haritadan bir isaretci secmek yalnizca onu
  // isaretler, sol pencere kapali kalir (kullanici isterse sonradan acar ve
  // secili kaydi vurgulanmis halde bulur). Panel ACIKKEN ise secim panelde de
  // takip edilir: gerekiyorsa ilgili sekmeye gecilir. "İhbarlar > Onaylandı"
  // sekmesi zaten kendi varlik listesini (ihbardan olusanlar) gosterdiginden
  // orada sekme degistirilmez.
  const varlikSecildi = useCallback(
    (id: string) => {
      const kapaniyor = seciliId === id;
      setSeciliId(kapaniyor ? null : id);
      setDetayAsset(null);
      if (kapaniyor) {
        setSeciliIhbarId(null);
        return;
      }
      // Ihbardan olusan bir varlik secildiyse KAYNAK IHBAR da birlikte secilir
      // haritadaki isaretci ham ihbar noktasidir, panel ise ondan olusan
      // varligi listeler - iki taraf ayni secimi gostermeli.
      setSeciliIhbarId(onayliEsleme.varliktanRapora.get(id) ?? null);
      setDetayRapor(null);
      setSeciliBolgeId(null);
      // "İhbarlar > Onaylandı" ve "> Tamir Edildi" zaten ihbardan olusan
      // varliklari listeler; oradayken secim sekmeyi degistirmez.
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
      // Simetrik dal: onaylanmis ihbarin haritadaki noktasina tiklaninca
      // panelde ("İhbarlar > Onaylandı" listesi varliklardan olusur) hicbir
      // satir vurgulanmiyordu - "seciliyor ama secilmiyor" gorunumunun sebebi
      // buydu. Artik ondan olusan varlik da secili sayilir.
      setSeciliId(onayliEsleme.rapordanVarliga.get(id) ?? null);
      setDetayAsset(null);
      setSeciliBolgeId(null);
      if (panelAcik) setSekme("ihbarlar");
    },
    [seciliIhbarId, panelAcik, onayliEsleme]
  );

  // --- Bildirimler (header zili) ------------------------------------------
  // Bakim bekleyen varliklar (her iki kaynaktan) - ana listeden bagimsiz sorgu.
  const bakimSorgu = useAssets({ status: "bakim_lazim" });

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

  // Kaydedilmis gorev bolgeleri / guzergahlar - Bölgeler paneli ve haritadaki
  // kalici katman ayni sorguyu paylasir (panel kapaliyken de haritada durur).
  const bolgeSorgu = useQuery({
    queryKey: ["bolgeler"],
    queryFn: bolgeleriGetir,
    enabled: personel,
  });
  // Gorev bolgeleri (alan) ve guzergahlar (cizgi) haritada AYRI katmanlardir
  // (lejantta iki ayri satir, solda iki ayri sekme), bu yuzden gorunur listeler
  // de ayri hesaplanir; MapView'a yalnizca acik olanlarin birlesimi gider.
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
    // Iki katman da kapaliysa katmani tamamen kaldir (bos dizi yerine undefined).
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

  // "Tümünü göster/gizle" yalnizca panelin KENDI turunu (alanlar ya da
  // guzergahlar) etkiler; id'ler panelden gelir, diger turun gorunurlugune
  // dokunulmaz.
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

  // Kaydedilmis bolge/guzergah secimi - haritadan (alan/cizgi tiklamasi) ya da
  // paneldeki karttan gelir; varlik/ihbar secimiyle ayni kurallara uyar:
  // pencereyi ACMAZ, ama pencere acikken dogru sekmeye gecer.
  const bolgeSecildi = useCallback(
    (id: string) => {
      const kapaniyor = seciliBolgeId === id;
      setSeciliBolgeId(kapaniyor ? null : id);
      if (kapaniyor) return;
      // Tek secim: bolge secilince varlik/ihbar secimi birakilir.
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
    // "Git" ayni zamanda secim demektir: kayit haritada isaretlenmis kalir.
    setSeciliBolgeId(bolge.id);
    setUcusHedefi({
      anahtar: crypto.randomUUID(),
      tip: "sinir",
      bounds: poligonSinirKutusu(bolge.noktalar.flat()),
    });
    // Gizliyse gorunur yap - kullanici "git" dedigi seyi haritada gormeli
    // (hem kendi turunun katman anahtari hem o kaydin tekil gizlemesi acilir).
    const katman: KatmanAnahtari = bolge.tip === "cizgi" ? "guzergahlar" : "bolgeler";
    katmaniAc(katman);
    setGizliBolgeler((g) => {
      if (!g.has(bolge.id)) return g;
      const yeni = new Set(g);
      yeni.delete(bolge.id);
      return yeni;
    });
  }, []);

  /** Haritadaki etiket uzerinden yeniden adlandirma (paneldeki "Düzenle" ile
   *  ayni ucu kullanir). Hata MapView'de yakalanir: etiket eski ada doner. */
  const bolgeAdiDegistir = useCallback(
    async (id: string, ad: string) => {
      await bolgeGuncelle(id, { ad });
      queryClient.invalidateQueries({ queryKey: ["bolgeler"] });
    },
    [queryClient]
  );

  // --- Sekil (geometri) duzenleme ----------------------------------------
  // Kayit YERINDE guncellenir: id'si, atamasi ve gecmisi korunur - bir sinirin
  // birkac metre kaydirilmasi yeni bir bolge acmayi gerektirmesin.
  const sekilDuzenlemeBaslat = useCallback((bolge: Bolge) => {
    // Cizim/olcum ile ayni alt paneli ve ayni harita tiklamalarini paylasir;
    // ikisi ayni anda acik olamaz.
    cizimVeOlcumuKapat();
    setSekilHatasi(null);
    setSekilDuzenleme({
      id: bolge.id,
      ad: bolge.ad,
      tip: bolge.tip,
      renk: bolge.renk,
      noktalar: sekilNoktalari(bolge.tip, bolge.noktalar),
    });
    bolgeyeGit(bolge);
  }, [bolgeyeGit, cizimVeOlcumuKapat]);

  const sekilDegisti = useCallback((noktalar: [number, number][][]) => {
    setSekilDuzenleme((s) => (s ? { ...s, noktalar } : s));
  }, []);

  /** Taslagi kaydin son kaydedilmis geometrisine dondurur. */
  const sekilSifirla = () => {
    const kayitli = bolgeSorgu.data?.find((b) => b.id === sekilDuzenleme?.id);
    if (!kayitli) return;
    setSekilHatasi(null);
    setSekilDuzenleme((s) =>
      s ? { ...s, noktalar: sekilNoktalari(kayitli.tip, kayitli.noktalar) } : s
    );
  };

  const sekilKaydet = async () => {
    if (!sekilDuzenleme) return;
    setSekilKaydediliyor(true);
    setSekilHatasi(null);
    try {
      await bolgeGuncelle(sekilDuzenleme.id, { noktalar: sekilDuzenleme.noktalar });
      queryClient.invalidateQueries({ queryKey: ["bolgeler"] });
      setSekilDuzenleme(null);
    } catch (e) {
      setSekilHatasi((e as Error).message);
    } finally {
      setSekilKaydediliyor(false);
    }
  };

  /** Alani her yonunde `mesafeM` metre buyutur/kucultur (PostGIS ST_Buffer).
   *  Koseleri tek tek surukleyerek yapilamayacak olan "biraz genislet" istegi. */
  const sekilGenislet = async (mesafeM: number) => {
    if (!sekilDuzenleme || sekilDuzenleme.tip !== "alan") return;
    setSekilGenisletiliyor(true);
    setSekilHatasi(null);
    try {
      const sonuc = await alanTamponu(sekilDuzenleme.noktalar, mesafeM);
      setSekilDuzenleme((s) =>
        s ? { ...s, noktalar: sekilNoktalari("alan", sonuc.noktalar) } : s
      );
    } catch (e) {
      setSekilHatasi((e as Error).message);
    } finally {
      setSekilGenisletiliyor(false);
    }
  };

  /** Taslak, kaydedilmis geometriden farkli mi (Kaydet/Geri al icin). */
  const sekilDegismis = useMemo(() => {
    if (!sekilDuzenleme) return false;
    const kayitli = bolgeSorgu.data?.find((b) => b.id === sekilDuzenleme.id);
    if (!kayitli) return true;
    // Kayitli hali kapali halkalarla gelir; karsilastirma taslakla ayni
    // normalde (acik halka) yapilmali, yoksa hicbir sey degismeden "değişti"
    // gorunur ve Kaydet hep etkin kalir.
    return (
      JSON.stringify(sekilNoktalari(kayitli.tip, kayitli.noktalar)) !==
      JSON.stringify(sekilDuzenleme.noktalar)
    );
  }, [sekilDuzenleme, bolgeSorgu.data]);

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
  // Sekmelerden bagimsiz: kullanici varlik/ihbar/saha ekibi katmanlarini istedigi
  // kombinasyonda ayni anda haritada gorebilir.
  //
  // Varlik katmani (taban): HER ZAMAN mevcut (alan/filtre suzulmus) varlik
  // listesi. Ihbar sekmesinin/alt-sekmesinin bununla isi yoktur - eskiden
  // "Onaylandı" alt-sekmesinde taban ihbar kaynagi varliklara donuyor, lejanttaki
  // varlik sayaclari ihbar sekmesi degistikce oynuyordu.
  const varlikKatmanTaban = gosterilen;
  // Alt-filtre sayaclari: her kirilim, DIGER kirilimin secimi uygulanmis taban
  // uzerinden sayilir - yani "Bakım Lazım" secili iken tur sayilari yalnizca
  // bakim bekleyenleri gosterir (rakamlar haritadakiyle tutarli kalir).
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

  // Ihbar katmani: secili durumlarin (beklemede/onaylandi/reddedildi) ihbarlari
  // birlestirilir (id'ye gore tekillestirilir). Panel secim vurgusu, sekmedeki
  // durumun alt-filtresi otomatik acildigi icin dogal olarak calisir.
  const ihbarKatmanVeri = useMemo<ReportFeatureCollection>(() => {
    const gorulen = new Map<string, ReportFeature>();
    for (const gorunum of IHBAR_GORUNUMLERI) {
      if (!katmanDurumlari[gorunum]) continue;
      for (const f of ihbarGorunumleri[gorunum]) gorulen.set(f.properties.id, f);
    }
    return { type: "FeatureCollection", features: [...gorulen.values()] };
  }, [katmanDurumlari, ihbarGorunumleri]);

  // Haritadan secilen ihbar hangi durumdaysa panelin alt sekmesi de ona gecer -
  // yoksa kullanici paneli sonradan actiginda (orn. "Reddedildi" sekmesi acik
  // kalmisken bekleyen bir ihbari secmisse) secili kayit listede hic gorunmez.
  // "onaylandi"/"tamir" de dahil: o iki sekme ham ihbarlari degil onlardan
  // olusan varliklari listeler, ama secim artik ikisini birlikte isaretledigi
  // icin (bkz. onayliEslemeRef) dogru satir orada da vurgulanir. Ham durum
  // degil GORUNUM kullanilir, yoksa tamir edilmis bir ihbar secilince panel
  // "Onaylandı" sekmesine gecip bos kaliyordu.
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
      // Turler grup grup listelenir (13 tur duz bir liste olarak okunamiyor);
      // her grubun basligi ayni zamanda renk aciklamasidir - grup icindeki tum
      // turler haritada ayni renkle, farkli glifle cizilir.
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
          // Her iki durumda da dolgu TUR (grup) rengidir, o yuzden iki swatch
          // de grup renklerinden dilimlenir; farki kenarlik rengi tasir
          // (bakim = amber uyari halkasinin rengi).
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

  // --- Sol paneldeki SEKME -> sag-ustteki lejant (ana katmanlar) senkronu ---
  //
  // Not: bu senkron yalnizca ANA katmanlari (ve ihbar durum alt-filtresini)
  // kapsar. Varlik tur/durum alt-filtresi artik senkronlanmaz, cunku panel ile
  // lejant ayni state'i paylasir (bkz. `katmanTurleri`).
  //
  // Kural: lejant YALNIZCA panelde o an secili olani isaretler - Varliklar
  // sekmesinde sadece varlik katmani, İhbarlar sekmesinde sadece ihbar katmani
  // (ve o an bakilan durum). Kutucuklar her secimde YENIDEN KURULUR: alakasiz
  // olanlar acik birakilmaz. Eskiden efekt yalnizca "ac" yaptigi icin uc ihbar
  // alt-sekmesi gezilince harita her durumu birden gosteriyor, panelle celisiyordu.
  //
  // Uzerine ekleme kullanicinin: efektler yalnizca secim degisiminde calistigindan
  // lejanttan istenen katman/kutucuk (orn. İhbarlar'dayken Varliklar, ya da
  // Reddedildi'de iken Onaylandı) elle acilabilir ve bir sonraki sekme/filtre
  // degisimine kadar oyle kalir.
  //
  // "Saha Ekipleri" katmanina hicbir zaman dokunulmaz - o tamamen kullanicinin.

  // Aktif sekme -> hangi ana katman acik olacak + ihbar durum alt-filtresi.
  // `aktifSekme` (yani "panel ACIKKEN secili sekme") kullanilir: panel kapaliyken
  // lejant kullanicinin biraktigi gibi kalir. "Temizle" de paneli kapattigi icin
  // bu efekt onun bosalttigi katmanlari geri acmaz; kullanici bir sekme secince
  // lejant yeniden o sekmeye gore kurulur.
  useEffect(() => {
    if (aktifSekme === "ihbarlar") {
      yalnizVarlikVeyaIhbar("ihbarlar");
      ihbarDurumunuSec(ihbarDurum);
    } else if (aktifSekme === "liste") {
      yalnizVarlikVeyaIhbar("varliklar");
    } else if (bolgeSekmesi(aktifSekme)) {
      // Bölgeler/Güzergâhlar paneli acilinca YALNIZCA o sekmenin katmani acilir -
      // aksi halde panelde listelenenler haritada gorunmuyor gibi durur. Diger
      // katmanlara dokunulmaz: bunlar bir "genel bakis" degil, varliklarin
      // ustune binen baglam katmanlaridir.
      katmaniAc(BOLGE_SEKMELERI[aktifSekme].katman);
    }
    // "ekle" sekmesinde ve panel kapaliyken katmanlara dokunulmaz.
  }, [aktifSekme, ihbarDurum, yalnizVarlikVeyaIhbar, ihbarDurumunuSec, katmaniAc]);

  // (Panel tur/durum filtresi -> lejant senkronu KALDIRILDI: ikisi artik ayni
  //  state'i paylasiyor, senkronlanacak iki taraf yok. Bkz. `katmanTurleri`.)

  // Bir bildirime tiklaninca ilgili varliga git: kaynagina gore dogru sekmeye
  // gec (kayitli -> Varliklar, ihbardan gelen -> İhbarlar > Onaylandı), sec
  // ve haritayi oraya ucur.
  const bildirimVarligaGit = useCallback((asset: AssetFeature) => {
    alanlariTemizle();
    if (asset.properties.source === "ihbar") {
      setSekme("ihbarlar");
      // Tamir edilmis varlik artik "Onaylandı"da degil "Tamir Edildi"de listelenir.
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

  // Bir ihbar bildirimine tiklaninca İhbarlar sekmesini ac, ihbari sec, ucur.
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

  // Secili varlik (haritadaki popup'in "Detayları Gör" dugmesi icin) - o an
  // haritada gosterilen varlik koleksiyonundan aranir.
  const seciliVarlik = useMemo<AssetFeature | null>(
    () => gosterilen?.features.find((f) => f.properties.id === seciliId) ?? null,
    [gosterilen, seciliId]
  );
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

  /** Onaylanmis ihbardaki "Varlığı Yönet": ihbardan olusan varligin detay
   *  modalini acar - ekibe atama/atanan ekibi degistirme, tamir, duzenleme ve
   *  silme orada. Hem haritadaki ihbar popup'i hem ihbar detay modali bunu
   *  cagirir (tek islem, tek ad). Varlik bulunamazsa (orn. sonradan silinmisse)
   *  ihbar detayina duser. */
  const ihbarVarligiYonet = useCallback(
    (raporId: string) => {
      const varlikId = onayliEsleme.rapordanVarliga.get(raporId);
      const varlik = ihbarVarlikSorgu.data?.features.find(
        (f) => f.properties.id === varlikId
      );
      if (varlik) {
        // Iki modal ust uste binmesin: ihbar detayindan gelindiyse o kapanir.
        setDetayRapor(null);
        setDetayAsset(varlik);
      } else setDetayRapor(seciliRapor);
    },
    [ihbarVarlikSorgu.data, seciliRapor]
  );

  /** Detay modalindeki "Konuma Git": haritayi varligin konumuna ucurur.
   *  BILINCLI olarak `seciliId`'ye dokunmaz - secim efekti (MapView) yalnizca
   *  varlik o an haritadaki koleksiyonda VARSA uctugu icin, "Ihbar Edilen"
   *  sekmesi kapaliyken ihbardan dogan bir varlikta sessizce hicbir sey
   *  olmuyordu. Ucus artik koleksiyondan bagimsiz, tek ve acik bir yol. */
  const varligaGit = useCallback((asset: AssetFeature) => {
    setUcusHedefi({
      anahtar: crypto.randomUUID(),
      tip: "nokta",
      merkez: asset.geometry.coordinates,
      zoom: 16,
    });
  }, []);

  /** Haritadaki ekip popup'inda bir is satirina tiklanmasi: o varligin detay
   *  modali acilir - "Tamir Edildi", ekibe (yeniden) atama, duzenleme ve silme
   *  hepsi orada (bkz. AssetDetayModal). Varlik ekrandaki listelerde olmayabilir
   *  (baska sekme/filtre acik olabilir) ve durumu taze olmali, bu yuzden her
   *  zaman API'den cekilir. Varlik silinmisse (tamir sonrasi otomatik silme)
   *  kullaniciya sebebi soylenir.
   *  Harita OYNATILMAZ: modali acmak bir gezinme degildir; konuma gitmek
   *  isteyen kullanici modaldaki "Konuma Git" dugmesini kullanir. */
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

  /** Reddedilmis ihbar popup'undaki "Reddi Geri Al". Secim BIRAKILMAZ: ihbar
   *  "beklemede"ye dondugu icin alt-sekme senkronu (yukaridaki efekt) paneli
   *  Bekleyen'e alir ve kullanici kaydi orada secili bulur. */
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

          {/* Alan secim kontrolu - detaylar alt ortadaki arac panelinde.
              Alan(lar) secilmisken yanina bir "cikis" dugmesi eklenir: ana
              dugme yeni bir alan cizmeye baslatir, cikis ise secimi bitirip
              alanlari haritadan kaldirir. */}
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

      {/* Alt-ortadaki arac paneli tek olmali: sekil duzenlenirken cizim/olcum
          paneli yerine sekil paneli gorunur (ikisi ayni anda acilmaz). */}
      {sekilDuzenleme ? (
        <BolgeSekilPaneli
          duzenleme={sekilDuzenleme}
          degisti={sekilDegismis}
          onVazgec={() => {
            setSekilDuzenleme(null);
            setSekilHatasi(null);
          }}
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

      {/* Govde: tam ekran harita + uzerine binen sol kenar cubugu ve yuzen paneller.
          Kenar cubugu akisin disindadir (bkz. Kenarcubugu): akista olsaydi
          acilip kapanmasi harita kapsayicisini yeniden boyutlandirip goruntuyu
          yana kaydiriyordu. Genisligi `--kenar` olarak yayilir; harita
          uzerindeki sol hizali her sey (yuzen panel, MapLibre olcek kontrolu)
          bu degiskene gore kaydirilir. */}
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
          // Haritadaki isaretci uzerinden dogrudan duzenleme (yalniz personel);
          // silme/tamir/ekibe yonlendirme detay modalinin icinde.
          onVarlikDuzenle={personel ? () => setDuzenlenen(seciliVarlik) : undefined}
          onIhbarDetay={() => setDetayRapor(seciliRapor)}
          // Onaylanan ihbarin isaretcisinden dogrudan varlik yonetimi (ekibe
          // atama vb.), reddedilen ihbarinkinden reddi geri alma - yalniz personel.
          onIhbarVarlikYonet={personel ? ihbarVarligiYonet : undefined}
          onIhbarGeriAl={personel ? ihbarGeriAl : undefined}
          ekipler={katmanlar.ekipler ? ekipSorgu.data : undefined}
          // Ekip popup'indaki bir ise tiklaninca o varligin detay/islem modali.
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
          // Ad, panele girmeye gerek kalmadan haritadaki etiket uzerinden de
          // degistirilebilir (kalem / cift tiklama) - yalniz personel.
          onBolgeAdDegis={personel ? bolgeAdiDegistir : undefined}
          sekilDuzenleme={sekilDuzenleme}
          onSekilDegis={sekilDegisti}
          bolgeTiklanabilir={!(panelAcik && sekme === "ekle")}
        />

        {/* Sag-ustteki lejant + katman filtresi: varlik/ihbar/saha ekibi
            katmanlarini bagimsizca acip kapatir (genel bakis). */}
        <KatmanKontrolu
          key={sifirlamaNo}
          gorunur={katmanlar}
          onDegistir={katmanDegistir}
          sayilar={katmanSayilari}
          varlikAlt={varlikAltFiltre}
          ihbarAlt={ihbarAltFiltre}
        />

        <MapStilKontrolu aktifId={aktifStilId} onSec={setAktifStilId} />

        {/* Aktif sekmenin yuzen paneli - sol kenar cubugunun hemen sagindan
            acilir. Cubuk artik haritanin uzerine bindigi icin sol bosluk
            `--kenar` uzerinden verilir ve cubukla ayni surede kayar. */}
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
                  // Haritayla AYNI koleksiyon: liste, lejant sayaclari ve
                  // isaretciler tek filtre state'inden turedigi icin ayrisamaz.
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
                    // Onay yeni bir "bakim lazim" varlik olusturur ve onu en
                    // yakin uygun ekibe otomatik atar: hem varlik listeleri hem
                    // saha ekibi yuk/gorev sorgulari tazelenmeli.
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
        // Detay modali haritadaki popup'tan da acildigi icin duzenleme/silme
        // buradan yapilabilir: iki modal ust uste binmesin diye detay kapanir.
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
        // Onaylanmis ihbarda "Varlığı Yönet": haritadaki popup'in ayni adli
        // dugmesiyle tek islem - ihbar detayindan varlik yonetimine gecer.
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
        // Ekibe aktarma ve silme de haritadaki popup -> Detay yolundan
        // yapilabilsin (paneldeki kartla ayni islemler).
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
          // Kaydedilen cizim artik "Bölgeler" katmaninda duruyor; ayni sekil bir
          // de gecici cizim listesinde kalirsa iki kez gorunur (ve alan ozetinde
          // iki kez sayilir), o yuzden kaynagindan dusurulur.
          const kaynak = bolgeTaslagi?.kaynak;
          if (kaynak?.tip === "alan") alanKaldir(kaynak.id);
          else if (kaynak?.tip === "olcum") olcumTemizle();
          // Yeni kayit haritada gorunur olsun ve kullanici listeyi gorsun -
          // kaydin turune gore dogru sekme acilir (alan -> Bölgeler,
          // cizgi -> Güzergâhlar).
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
        {/* Ozet de listeyle/haritayla ayni suzulmus kumeyi ozetler. */}
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
