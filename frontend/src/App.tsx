import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { assetsWithin } from "./api/assets";
import { bolgeler as bolgeleriGetir } from "./api/bolgeler";
import { bolgeGuncelle } from "./api/bolgeler";
import { alanOzeti, alanTamponu, type AlanOzeti } from "./api/geo";
import { listReports, reopenReport } from "./api/reports";
import { ekipGorevleri as ekipGorevleriGetir } from "./api/saha";
import { ilceSiniri, mahalleSiniri } from "./api/sinirlar";
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
  MultiPolygonGeometry,
  PolygonGeometry,
} from "./types/asset";
import type { TamamlananAlan } from "./types/alan";
import type { Bolge, BolgeTipi, SekilDuzenleme } from "./types/bolge";
import {
  IHBAR_DURUM_RENGI,
  IHBAR_GORUNUMLERI,
  REPORT_STATUS_LABELS,
  REPORT_STATUSES,
  ihbarGorunumu,
} from "./types/report";
import type {
  IhbarGorunumu,
  ReportFeature,
  ReportFeatureCollection,
  ReportStatus,
} from "./types/report";
import {
  halkalariAc,
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

/** Bir alt-filtrenin "hepsi acik" baslangici. Elle yazilan liste tur sozlugu
 *  buyudukce bayatliyordu (13 turden yalnizca 3'u isaretliydi); anahtarlar
 *  sozlugun kendisinden turetilince yeni tur eklemek yetiyor. */
function hepsi<K extends string>(anahtarlar: readonly K[]): Record<K, boolean> {
  return Object.fromEntries(anahtarlar.map((a) => [a, true])) as Record<K, boolean>;
}

/** Acilis (ve "Temizle") degerleri tek yerde: hem useState baslangiclari hem
 *  sifirla() bunlari kullanir, boylece ikisi birbirinden ayrisamaz. */
const BASLANGIC = {
  filtreler: { source: "kayitli" } as AssetFilters,
  sekme: "liste" as Sekme,
  ihbarDurum: "onaylandi" as IhbarGorunumu,
  /** Varsayilan olarak varliklar + ihbarlar + saha ekipleri gorunur; kayitli
   *  bolgeler/guzergahlar gizli (kullanici lejanttan veya Bolgeler sekmesinden
   *  acar). Panel acilista KAPALI oldugu icin (`panelAcik=false` -> `aktifSekme`
   *  null) sekme->katman efekti bu secimi ezmez; kullanici bir sekme secene
   *  kadar boyle kalir. */
  katmanlar: {
    varliklar: true,
    ihbarlar: true,
    bolgeler: false,
    guzergahlar: false,
    ekipler: true,
  } as Record<KatmanAnahtari, boolean>,
  katmanTurleri: hepsi(ASSET_TYPES),
  /** Acilista yalnizca "Bakim Lazim" isaretli: ilk bakista is bekleyen
   *  varliklar gorunur, saglam envanter haritayi doldurmaz. */
  katmanVarlikDurumlari: {
    iyi: false,
    bakim_lazim: true,
  } as Record<AssetStatus, boolean>,
  /** Ihbarlarda da ayni mantik: acilista onaylanmis (yani ise donusmus)
   *  ihbarlar isaretli gelir. */
  katmanDurumlari: {
    beklemede: false,
    onaylandi: true,
    reddedildi: false,
    tamir: false,
  } as Record<IhbarGorunumu, boolean>,
  cizimRengi: "#059669",
  /** Harita acilis gorunumu (Istanbul merkezi + zoom 11). */
  zoom: 11,
} as const;

/** "Temizle" sonrasi lejant: hicbir katman secili degil, yani harita bombos
 *  kalir. Acilistaki `BASLANGIC.katmanlar`'dan bilincli olarak farklidir:
 *  Temizle "her seyi kaldir" demektir, "varsayilana don" degil. Kullanici sol
 *  panelden bir sekme sectiginde lejant yine ona gore kurulur. */
const BOS_KATMANLAR: Record<KatmanAnahtari, boolean> = {
  varliklar: false,
  ihbarlar: false,
  bolgeler: false,
  guzergahlar: false,
  ekipler: false,
};

/** "Temizle" sonrasi ihbar durum alt-filtresi: UCU DE isaretli. Ana katman
 *  kapali oldugu icin haritaya bir sey dusmez; ama kullanici katmani actiginda
 *  (ya da rozete baktiginda) elenmis degil, TOPLAM ihbar sayisini gorur.
 *  Acilistaki `BASLANGIC.katmanDurumlari` yalnizca "onaylandi" isaretlidir. */
const TUM_IHBAR_DURUMLARI: Record<IhbarGorunumu, boolean> = {
  beklemede: true,
  onaylandi: true,
  reddedildi: true,
  tamir: true,
};

/** Alt-filtre kutucuklarini TEKIL bir secime gore kuran setState guncelleyicisi:
 *  bir secim varsa YALNIZCA onu isaretler, yoksa ("Tüm tipler" gibi) hepsini
 *  isaretler. Sol paneldeki acilirlar (tekil) ile lejant kutucuklari (coklu) ayni
 *  state'i paylastigi icin acilirin yazma yolu budur. Sonuc oncekiyle ayniysa
 *  ayni nesne dondurulur - gereksiz render (ve harita katman guncellemesi)
 *  tetiklenmez. */
function yalnizca<K extends string>(anahtarlar: readonly K[], secili: K | undefined | null) {
  return (onceki: Record<K, boolean>): Record<K, boolean> => {
    const yeni = Object.fromEntries(
      anahtarlar.map((a) => [a, secili ? a === secili : true])
    ) as Record<K, boolean>;
    return anahtarlar.every((a) => onceki[a] === yeni[a]) ? onceki : yeni;
  };
}

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
  // Haritadaki uc genel-bakis katmaninin (varlik/ihbar/saha ekibi) gorunurlugu -
  // sag-ustteki KatmanKontrolu'nden bagimsizca acilip kapatilir. Sekmelerden
  // bagimsizdir: kullanici istedigi kombinasyonu ayni anda gorebilir.
  const [katmanlar, setKatmanlar] = useState<Record<KatmanAnahtari, boolean>>(
    BASLANGIC.katmanlar
  );
  const katmanDegistir = useCallback((anahtar: KatmanAnahtari) => {
    setKatmanlar((k) => ({ ...k, [anahtar]: !k[anahtar] }));
  }, []);
  // Varlik tur/durum filtresi - TEK KAYNAK. Hem haritayi (lejant kutucuklari)
  // hem sol paneldeki listeyi/ozeti besler; sol paneldeki acilirlar da ayni
  // state'i yazar. Eskiden iki ayri filtre vardi: panel acilirlari SORGUYU
  // daraltiyor (`AssetFilters.type/status`), lejant ise gelen veriyi suzuyordu.
  // Tek yonlu senkronla panel her degisiminde lejant kutucuklari sifirdan
  // kuruluyor, ustelik daraltilmis sorgu yuzunden lejanttan yeni bir tur acmak
  // haritaya HICBIR SEY eklemiyordu (o kayitlar hic getirilmemisti). Artik
  // sorgu tur/durum bilmez, tum filtreleme burada yapilir; iki yuzey de ayni
  // durumun gorunumu oldugundan biri digerini ezemez.
  const [katmanTurleri, setKatmanTurleri] = useState<Record<AssetType, boolean>>(
    BASLANGIC.katmanTurleri
  );
  const katmanTuruDegistir = useCallback((anahtar: string) => {
    setKatmanTurleri((t) => ({ ...t, [anahtar]: !t[anahtar as AssetType] }));
  }, []);
  // Tur filtresiyle VE olarak uygulanir: "bakima muhtac agaclar" gibi.
  const [katmanVarlikDurumlari, setKatmanVarlikDurumlari] = useState<
    Record<AssetStatus, boolean>
  >(BASLANGIC.katmanVarlikDurumlari);
  const katmanVarlikDurumuDegistir = useCallback((anahtar: string) => {
    setKatmanVarlikDurumlari((d) => ({ ...d, [anahtar]: !d[anahtar as AssetStatus] }));
  }, []);
  // Sol paneldeki acilirlarin yazma yolu: tekil secim = yalnizca o kutucuk,
  // bos secim ("Tüm tipler") = hepsi.
  const panelTuruSec = useCallback((tur: AssetType | null) => {
    setKatmanTurleri(yalnizca(ASSET_TYPES, tur));
  }, []);
  const panelDurumuSec = useCallback((durum: AssetStatus | null) => {
    setKatmanVarlikDurumlari(yalnizca(ASSET_STATUSES, durum));
  }, []);
  // Ihbar katmaninin durum alt-filtresi - varsayilan yalniz onaylanmis ihbarlar
  // (bekleyen/reddedilen genel bakisi kalabalik yapmasin, istenirse acilir).
  const [katmanDurumlari, setKatmanDurumlari] = useState<Record<IhbarGorunumu, boolean>>(
    BASLANGIC.katmanDurumlari
  );
  const katmanDurumuDegistir = useCallback((anahtar: string) => {
    setKatmanDurumlari((d) => ({ ...d, [anahtar]: !d[anahtar as IhbarGorunumu] }));
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
    setKatmanlar(BOS_KATMANLAR);
    setKatmanTurleri(BASLANGIC.katmanTurleri);
    setKatmanVarlikDurumlari(hepsi(ASSET_STATUSES));
    setKatmanDurumlari(TUM_IHBAR_DURUMLARI);
    setCizimModu(false);
    setCizimNoktalari([]);
    setCizimRengi(BASLANGIC.cizimRengi);
    setAlanHatasi(null);
    setAlanYukleniyor(false);
    setOlcumModu(false);
    setOlcumNoktalari([]);
    setTamamlananAlanlar([]);
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
    setIlceKodu(null);
    setMahalleKodu(null);
    setIdariHatasi(null);
    setIdariSinirKutusu(null);
    setUcusHedefi({
      anahtar: crypto.randomUUID(),
      tip: "nokta",
      merkez: ISTANBUL_MERKEZI,
      zoom: BASLANGIC.zoom,
    });
  };

  // --- Alan (poligon) secimi - birden fazla alan ayni anda acik kalabilir ---
  const [cizimModu, setCizimModu] = useState(false);
  const [cizimNoktalari, setCizimNoktalari] = useState<[number, number][]>([]);
  const [cizimRengi, setCizimRengi] = useState<string>(BASLANGIC.cizimRengi);
  const [tamamlananAlanlar, setTamamlananAlanlar] = useState<TamamlananAlan[]>([]);
  const [alanHatasi, setAlanHatasi] = useState<string | null>(null);
  const [alanYukleniyor, setAlanYukleniyor] = useState(false);

  // --- Mesafe olcum araci ---
  const [olcumModu, setOlcumModu] = useState(false);
  const [olcumNoktalari, setOlcumNoktalari] = useState<[number, number][]>([]);

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
  // bunu kendi listesi olarak gosterir (bkz. IhbarPaneli). Yalnizca o panele
  // aittir: haritadaki VARLIK katmanini ve lejant sayaclarini ETKILEMEZ (ihbar
  // alt-sekmesi degistikce varlik sayilarinin oynamasina yol aciyordu).
  const ihbarVarlikSorgu = useAssets({ source: "ihbar" });

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
      // (bkz. onayliEslemeRef): haritadaki isaretci ham ihbar noktasidir, panel
      // ise ondan olusan varligi listeler - iki taraf ayni secimi gostermeli.
      setSeciliIhbarId(onayliEslemeRef.current.varliktanRapora.get(id) ?? null);
      setDetayRapor(null);
      setSeciliBolgeId(null);
      // "İhbarlar > Onaylandı" ve "> Tamir Edildi" zaten ihbardan olusan
      // varliklari listeler; oradayken secim sekmeyi degistirmez.
      const ihbarVarlikSekmesi =
        sekme === "ihbarlar" && (ihbarDurum === "onaylandi" || ihbarDurum === "tamir");
      if (panelAcik && !ihbarVarlikSekmesi) setSekme("liste");
    },
    [seciliId, panelAcik, sekme, ihbarDurum]
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
      setSeciliId(onayliEslemeRef.current.rapordanVarliga.get(id) ?? null);
      setDetayAsset(null);
      setSeciliBolgeId(null);
      if (panelAcik) setSekme("ihbarlar");
    },
    [seciliIhbarId, panelAcik]
  );

  /** Onaylanmis ihbar <-> ondan olusan varlik eslesmesi. Yukaridaki secim
   *  callback'leri bunu okur; kaynak sorgu (onaylananIhbarSorgu) hook sirasi
   *  geregi asagida tanimlandigi icin deger bir ref uzerinden tasinir. */
  const onayliEslemeRef = useRef({
    rapordanVarliga: new Map<string, string>(),
    varliktanRapora: new Map<string, string>(),
  });

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

  // --- Secili alanlarin cakismayi hesaba katan olcusu ---------------------
  // Yerel (shoelace) hesap TEK bir poligon icin dogru, ama iki alan ust uste
  // bindiginde ayni yeri iki kez sayar - "aynı alanın üstünden tekrar geçince
  // m² artmasın" istegi bu yuzden backend'de (PostGIS) cozuluyor: her alanin
  // kendisinden ONCEKILERLE cakismayan net katkisi ve bunlarin toplami
  // (= birlesim alani) donuyor.
  const [alanOzetiSonuc, setAlanOzetiSonuc] = useState<AlanOzeti | null>(null);
  const olcuIstekSirasiRef = useRef(0);
  /** Yalnizca GEOMETRI degisince yeniden olculsun: filtre degisince
   *  tamamlananAlanlar yeni nesnelerle degisiyor ama sekiller ayni kaliyor. */
  const alanGeometriImzasi = useMemo(
    () =>
      tamamlananAlanlar
        .map(
          (a) =>
            `${a.id}:${a.noktalar.length}:${a.noktalar[0]?.length ?? 0}:` +
            `${a.noktalar[0]?.[0]?.join(",") ?? ""}`
        )
        .join("|"),
    [tamamlananAlanlar]
  );
  useEffect(() => {
    if (tamamlananAlanlar.length === 0) {
      setAlanOzetiSonuc(null);
      return;
    }
    const siraNo = ++olcuIstekSirasiRef.current;
    alanOzeti(tamamlananAlanlar.map((a) => ({ id: a.id, noktalar: a.noktalar })))
      .then((ozet) => {
        if (olcuIstekSirasiRef.current === siraNo) setAlanOzetiSonuc(ozet);
      })
      .catch(() => {
        // Olcum alinamazsa panel yerel (cakismayi gormeyen) toplama duser -
        // alan secimi calismaya devam etsin.
        if (olcuIstekSirasiRef.current === siraNo) setAlanOzetiSonuc(null);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alanGeometriImzasi]);

  const alanOlculeri = useMemo(() => {
    if (!alanOzetiSonuc) return undefined;
    return Object.fromEntries(alanOzetiSonuc.alanlar.map((a) => [a.id, a]));
  }, [alanOzetiSonuc]);

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
    setKatmanlar((k) => (k[katman] ? k : { ...k, [katman]: true }));
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
    setCizimModu(false);
    setCizimNoktalari([]);
    setOlcumModu(false);
    setSekilHatasi(null);
    setSekilDuzenleme({
      id: bolge.id,
      ad: bolge.ad,
      tip: bolge.tip,
      renk: bolge.renk,
      noktalar: sekilNoktalari(bolge.tip, bolge.noktalar),
    });
    bolgeyeGit(bolge);
  }, [bolgeyeGit]);

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

  // Onaylanan/reddedilen ihbarlar. Ihbar katmani KAPALIYKEN de cekilir: lejanttaki
  // rozet/alt-filtre sayaclari katmanin acik olup olmamasindan bagimsiz olarak
  // gercek toplami gostermeli (eskiden katman kapaliyken bu ikisi hic cekilmedigi
  // icin toplam eksik gorunuyordu). Bekleyen ihbarlar zaten yukarida (bildirim
  // zili icin) cekiliyor.
  const onaylananIhbarSorgu = useQuery({
    queryKey: ["reports", "onaylandi"],
    queryFn: () => listReports("onaylandi"),
    enabled: personel,
  });
  const reddedilenIhbarSorgu = useQuery({
    queryKey: ["reports", "reddedildi"],
    queryFn: () => listReports("reddedildi"),
    enabled: personel,
  });
  // Onaylanmis ihbar <-> ondan olusan varlik eslesmesi (created_asset_id).
  const onayliEsleme = useMemo(() => {
    const rapordanVarliga = new Map<string, string>();
    const varliktanRapora = new Map<string, string>();
    for (const f of onaylananIhbarSorgu.data?.features ?? []) {
      const varlikId = f.properties.created_asset_id;
      if (!varlikId) continue;
      rapordanVarliga.set(f.properties.id, varlikId);
      varliktanRapora.set(varlikId, f.properties.id);
    }
    return { rapordanVarliga, varliktanRapora };
  }, [onaylananIhbarSorgu.data]);

  // Secim callback'leri (varlikSecildi/ihbarSecildi) yukarida, bu sorgudan once
  // tanimlandigi icin eslesmeye ref uzerinden erisir.
  useEffect(() => {
    onayliEslemeRef.current = onayliEsleme;
  }, [onayliEsleme]);

  const ihbarDurumSorgusu: Record<ReportStatus, typeof bekleyenIhbarSorgu> = {
    beklemede: bekleyenIhbarSorgu,
    onaylandi: onaylananIhbarSorgu,
    reddedildi: reddedilenIhbarSorgu,
  };

  /** Cekilen tum ihbarlar GORUNUME gore gruplanir: onaylanmislar, olusturduklari
   *  varlik hala bakim bekliyorsa "onaylandi" (acik is), tamir edildiyse (ya da
   *  varlik silindiyse) "tamir" olur. Hem harita katmani, hem lejant sayaclari,
   *  hem panelin alt-sekme senkronu tek bu kaynagi okur; ayrim uc yerde ayri
   *  ayri hesaplanmaz. Her ihbar nesnesine
   *  `properties.gorunum` yazilir (harita pin rengi bunu okur). */
  const ihbarGorunumleri = useMemo(() => {
    const varlikDurumu = new Map<string, "iyi" | "bakim_lazim">();
    for (const a of ihbarVarlikSorgu.data?.features ?? []) {
      varlikDurumu.set(a.properties.id, a.properties.status);
    }
    const varlikBilgisiVar = ihbarVarlikSorgu.data !== undefined;
    const gruplar = {
      onaylandi: [] as ReportFeature[],
      tamir: [] as ReportFeature[],
      beklemede: [] as ReportFeature[],
      reddedildi: [] as ReportFeature[],
    } satisfies Record<IhbarGorunumu, ReportFeature[]>;
    for (const durum of REPORT_STATUSES) {
      for (const f of ihbarDurumSorgusu[durum].data?.features ?? []) {
        const g = ihbarGorunumu(
          f.properties.status,
          f.properties.created_asset_id
            ? varlikDurumu.get(f.properties.created_asset_id)
            : undefined,
          varlikBilgisiVar
        );
        gruplar[g].push({
          ...f,
          properties: { ...f.properties, gorunum: g },
        });
      }
    }
    return gruplar;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    ihbarVarlikSorgu.data,
    bekleyenIhbarSorgu.data,
    onaylananIhbarSorgu.data,
    reddedilenIhbarSorgu.data,
  ]);

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
      setKatmanlar((k) =>
        !k.varliklar && k.ihbarlar ? k : { ...k, varliklar: false, ihbarlar: true }
      );
      setKatmanDurumlari(yalnizca(IHBAR_GORUNUMLERI, ihbarDurum));
    } else if (aktifSekme === "liste") {
      setKatmanlar((k) =>
        k.varliklar && !k.ihbarlar ? k : { ...k, varliklar: true, ihbarlar: false }
      );
    } else if (bolgeSekmesi(aktifSekme)) {
      // Bölgeler/Güzergâhlar paneli acilinca YALNIZCA o sekmenin katmani acilir -
      // aksi halde panelde listelenenler haritada gorunmuyor gibi durur. Diger
      // katmanlara dokunulmaz: bunlar bir "genel bakis" degil, varliklarin
      // ustune binen baglam katmanlaridir.
      const katman = BOLGE_SEKMELERI[aktifSekme].katman;
      setKatmanlar((k) => (k[katman] ? k : { ...k, [katman]: true }));
    }
    // "ekle" sekmesinde ve panel kapaliyken katmanlara dokunulmaz.
  }, [aktifSekme, ihbarDurum]);

  // (Panel tur/durum filtresi -> lejant senkronu KALDIRILDI: ikisi artik ayni
  //  state'i paylasiyor, senkronlanacak iki taraf yok. Bkz. `katmanTurleri`.)

  // Bir bildirime tiklaninca ilgili varliga git: kaynagina gore dogru sekmeye
  // gec (kayitli -> Varliklar, ihbardan gelen -> İhbarlar > Onaylandı), sec
  // ve haritayi oraya ucur.
  const bildirimVarligaGit = useCallback((asset: AssetFeature) => {
    setTamamlananAlanlar([]);
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
  }, []);

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
      const varlikId = onayliEslemeRef.current.rapordanVarliga.get(raporId);
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
                  onMahalleSec={setMahalleKodu}
                  idariHatasi={idariHatasi}
                  ekipler={ekipSorgu.data}
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
