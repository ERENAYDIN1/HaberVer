import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { assetsWithin } from "../api/assets";
import { alanOzeti, type AlanOzeti } from "../api/geo";
import { ilceSiniri, mahalleSiniri } from "../api/sinirlar";
import type { UcusHedefi } from "../components/MapView";
import type { TamamlananAlan } from "../types/alan";
import type {
  AssetFeature,
  AssetFeatureCollection,
  AssetFilters,
  MultiPolygonGeometry,
  PolygonGeometry,
} from "../types/asset";
import {
  poligonAlaniM2,
  poligonSinirKutusu,
  toplamMesafeMetre,
} from "../utils/geo";

/** Haritadaki ALAN SECIMI: cizim, mesafe olcumu, secilen alanlarin varlik
 *  sonuclari, cakismasiz alan ozeti ve ilce/mahalle sinir secimi.
 *
 *  Bunlar tek bir hook'ta, cunku hepsi AYNI listeyi (`tamamlananAlanlar`)
 *  besliyor: kullanicinin cizdigi alan da, secilen ilce siniri da haritada ayni
 *  sekilde cizilir, ayni sekilde `assetsWithin` ile sorgulanir ve ayni panelde
 *  listelenir. Idari sinir bilincli olarak ayri bir mekanizma DEGIL, sabit
 *  id'li (`IDARI_ALAN_ID`) bir alandir - boylece render/etiket/yeniden-sorgulama
 *  mantigi tek kere yazilmis olur. */

/** Ilce/mahalle sinir secimi de bir "tamamlanan alan" olarak temsil edilir; bu
 *  sabit id sayesinde yeni bir sinir secilince oncekinin YERINE gecer. */
export const IDARI_ALAN_ID = "idari-sinir";
export const IDARI_ALAN_RENK = "#0891b2";

/** Halka listesinden (MultiPolygon parcalari) backend'e gonderilecek GeoJSON
 *  geometrisini uretir. Tek halkalı alanlarda (kullanicinin cizdigi alanlar)
 *  duz bir Polygon, birden fazla halkalı alanlarda (orn. adalardan olusan
 *  Adalar ilcesi) bir MultiPolygon dondurur. */
export function halkalarGeometrisi(
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

export interface AlanSecimiSecenekleri {
  /** Alan sorgularina eklenen aktif filtreler (`source` + ...). Degisince
   *  tamamlanmis alanlarin sonuclari yeniden getirilir. */
  filters: AssetFilters;
  /** Baslangic cizim rengi ("Temizle" bunu geri yukler). */
  varsayilanRenk: string;
  /** Haritayi bir hedefe ucurur (idari sinir secilince kullanilir). */
  ucur: (hedef: UcusHedefi) => void;
  /** Yeni bir alan cizimi baslarken - varlik secimini birakmak icin. */
  onCizimBasladi?: () => void;
  /** Bir alan tamamlandiginda - sonuclari gostermek uzere listeye gecmek icin. */
  onAlanTamamlandi?: () => void;
}

export function useAlanSecimi({
  filters,
  varsayilanRenk,
  ucur,
  onCizimBasladi,
  onAlanTamamlandi,
}: AlanSecimiSecenekleri) {
  // --- Alan (poligon) secimi - birden fazla alan ayni anda acik kalabilir ---
  const [cizimModu, setCizimModu] = useState(false);
  const [cizimNoktalari, setCizimNoktalari] = useState<[number, number][]>([]);
  const [cizimRengi, setCizimRengi] = useState<string>(varsayilanRenk);
  const [tamamlananAlanlar, setTamamlananAlanlar] = useState<TamamlananAlan[]>([]);
  const [alanHatasi, setAlanHatasi] = useState<string | null>(null);
  const [alanYukleniyor, setAlanYukleniyor] = useState(false);

  // --- Mesafe olcum araci ---
  const [olcumModu, setOlcumModu] = useState(false);
  const [olcumNoktalari, setOlcumNoktalari] = useState<[number, number][]>([]);

  // --- Ilce/mahalle sinirina gore filtreleme (proje kapsami Istanbul ile
  //     sinirli oldugundan il secimi yok; once ilceye, ilce secilince kademeli
  //     olarak mahalleye kadar filtrelenebilir) ---
  const [ilceKodu, setIlceKodu] = useState<string | null>(null);
  const [mahalleKodu, setMahalleKodu] = useState<string | null>(null);
  const [idariHatasi, setIdariHatasi] = useState<string | null>(null);
  /** Secili sinirin sinir kutusu; verilince konum aramasi bu bolgeyle
   *  SINIRLANIR (sadece oncelik degil) - "GOP secip Kucukkoy aradiginda
   *  Besiktas cikmasin". */
  const [idariSinirKutusu, setIdariSinirKutusu] = useState<
    [[number, number], [number, number]] | null
  >(null);

  // Callback'ler ve filtreler ref'te tutulur: efektlerin/callback'lerin kimligi
  // cagiranin her render'da yeni fonksiyon vermesine bagli olmasin. Atama
  // RENDER SIRASINDA degil bir efektte yapilir (MapView'daki ayni desen) -
  // render'da ref'e yazmak React'in eszamanli (concurrent) render'inda iki kez
  // calisabilir ve derleyici de bunu hata olarak isaretliyor.
  const ucurRef = useRef(ucur);
  const onCizimBasladiRef = useRef(onCizimBasladi);
  const onAlanTamamlandiRef = useRef(onAlanTamamlandi);
  const filtersRef = useRef(filters);
  useEffect(() => {
    ucurRef.current = ucur;
    onCizimBasladiRef.current = onCizimBasladi;
    onAlanTamamlandiRef.current = onAlanTamamlandi;
    filtersRef.current = filters;
  });

  const alanM2 = useMemo(() => poligonAlaniM2(cizimNoktalari), [cizimNoktalari]);
  const olcumMesafeM = useMemo(
    () => toplamMesafeMetre(olcumNoktalari),
    [olcumNoktalari]
  );

  /** Tamamlanmis alanlarin varlik sonuclarinin birlesimi (ust uste binen
   *  alanlarda ayni varlik iki kez sayilmasin diye id'ye gore tekillestirilir). */
  const birlesikAlanSonucu = useMemo<AssetFeatureCollection | null>(() => {
    if (tamamlananAlanlar.length === 0) return null;
    const gorulen = new Map<string, AssetFeature>();
    for (const alan of tamamlananAlanlar) {
      for (const f of alan.sonuc.features) gorulen.set(f.properties.id, f);
    }
    return { type: "FeatureCollection", features: [...gorulen.values()] };
  }, [tamamlananAlanlar]);

  const cizimNoktaEkle = useCallback((nokta: [number, number]) => {
    setCizimNoktalari((n) => [...n, nokta]);
  }, []);

  const olcumNoktaEkle = useCallback((nokta: [number, number]) => {
    setOlcumNoktalari((n) => [...n, nokta]);
  }, []);

  const alanSecimiIptal = useCallback(() => {
    setCizimModu(false);
    setCizimNoktalari([]);
  }, []);

  const olcumIptal = useCallback(() => {
    setOlcumModu(false);
    setOlcumNoktalari([]);
  }, []);

  // Cizim ve olcum ayni harita tiklamalarini paylasir; ikisi ayni anda acik
  // olamaz, bu yuzden her biri digerini kapatarak baslar. Kosul gereksiz
  // gorunuyor ama degil: `olcumIptal` her cagrildiginda YENI bir bos dizi
  // yazar, yani mod zaten kapaliyken de bir render tetiklerdi.
  const alanSecimiBaslat = useCallback(() => {
    if (olcumModu) olcumIptal();
    setCizimModu(true);
    setCizimNoktalari([]);
    setAlanHatasi(null);
    onCizimBasladiRef.current?.();
  }, [olcumModu, olcumIptal]);

  const olcumBaslat = useCallback(() => {
    if (cizimModu) alanSecimiIptal();
    setOlcumModu(true);
    setOlcumNoktalari([]);
  }, [cizimModu, alanSecimiIptal]);

  const olcumBitir = useCallback(() => {
    if (olcumNoktalari.length < 2) return;
    setOlcumModu(false);
  }, [olcumNoktalari]);

  const olcumTemizle = useCallback(() => {
    setOlcumModu(false);
    setOlcumNoktalari([]);
  }, []);

  /** Sekil duzenleme baslarken cagrilir: o da ayni alt paneli ve ayni harita
   *  tiklamalarini kullanir, ucu birden acik olamaz. */
  const cizimVeOlcumuKapat = useCallback(() => {
    setCizimModu(false);
    setCizimNoktalari([]);
    setOlcumModu(false);
  }, []);

  const alanKaldir = useCallback((id: string) => {
    setTamamlananAlanlar((a) => a.filter((alan) => alan.id !== id));
    // Idari sinir alani kaldirilinca acilir kutulari da bosalt, yoksa panel
    // haritada olmayan bir ilceyi secili gosterirdi.
    if (id === IDARI_ALAN_ID) {
      setIlceKodu(null);
      setMahalleKodu(null);
    }
  }, []);

  /** Secimden tamamen cikis: alanlar da ilce/mahalle secimi de sifirlanir. */
  const tumAlanlariTemizle = useCallback(() => {
    setTamamlananAlanlar([]);
    setIlceKodu(null);
    setMahalleKodu(null);
  }, []);

  /** Yalnizca cizilen/secilen alanlari birakir, ilce/mahalle secimine
   *  DOKUNMAZ. Bildirimden bir varliga gidilirken kullanilir: oraya odaklanmak
   *  icin alan secimi kalkar ama panel filtresi kullanicinin biraktigi gibi
   *  kalir. */
  const alanlariTemizle = useCallback(() => {
    setTamamlananAlanlar([]);
  }, []);

  // Ilce degisince mahalle secimini sifirla (eski mahalle baska ilceden kalmasin).
  const ilceSec = useCallback((kod: string | null) => {
    setIlceKodu(kod);
    setMahalleKodu(null);
  }, []);

  const alanSecimiTamamla = useCallback(async () => {
    if (cizimNoktalari.length < 3) return;
    setAlanYukleniyor(true);
    setAlanHatasi(null);
    try {
      const sonuc = await assetsWithin({
        polygon: halkalarGeometrisi([cizimNoktalari]),
        ...filtersRef.current,
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
      onAlanTamamlandiRef.current?.();
    } catch (e) {
      setAlanHatasi((e as Error).message);
    } finally {
      setAlanYukleniyor(false);
    }
  }, [cizimNoktalari, cizimRengi]);

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
        if (filtreIstekSirasiRef.current === siraNo)
          setTamamlananAlanlar(guncellenmis);
      })
      .catch((e) => {
        if (filtreIstekSirasiRef.current === siraNo)
          setAlanHatasi((e as Error).message);
      });
    // tamamlananAlanlar kasitli olarak bagimlilik disi: yeni alan eklendiginde
    // zaten guncel filtreyle sorgulaniyor, burada sadece filtre degisince
    // tetiklenmeli.
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
  // tamamlanan alanlar listesine sabit id'yle ekler/degistirir ve haritayi o
  // bolgeye ucurur. Aktif sinir: bir mahalle secildiyse mahalle (daha ince),
  // yoksa ilce, yoksa hicbiri. Filtreler degisince zaten yukaridaki efekt bu
  // girdiyi de yeniden sorgular (noktalar uzerinden).
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
          ...filtersRef.current,
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
        ucurRef.current({
          anahtar: crypto.randomUUID(),
          tip: "sinir",
          bounds: kutu,
        });
      } catch (e) {
        if (!iptal) setIdariHatasi((e as Error).message);
      }
    })();

    return () => {
      iptal = true;
    };
  }, [ilceKodu, mahalleKodu]);

  /** "Temizle": cizim/olcum kapanir, secili alanlar ve idari sinir secimi
   *  sifirlanir, cizim rengi varsayilana doner. */
  const sifirla = useCallback(() => {
    setCizimModu(false);
    setCizimNoktalari([]);
    setCizimRengi(varsayilanRenk);
    setAlanHatasi(null);
    setAlanYukleniyor(false);
    setOlcumModu(false);
    setOlcumNoktalari([]);
    setTamamlananAlanlar([]);
    setIlceKodu(null);
    setMahalleKodu(null);
    setIdariHatasi(null);
    setIdariSinirKutusu(null);
  }, [varsayilanRenk]);

  return {
    // cizim
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
    // olcum
    olcumModu,
    olcumNoktalari,
    olcumMesafeM,
    olcumNoktaEkle,
    olcumBaslat,
    olcumIptal,
    olcumBitir,
    olcumTemizle,
    // secili alanlar
    tamamlananAlanlar,
    birlesikAlanSonucu,
    alanOlculeri,
    /** Cakismasiz olcum sonucu; panel "Toplam (cakismasiz)" satirini ve
     *  "uzerinde binen X dusuldu" notunu bundan yazar. */
    alanOzetiSonuc,
    alanKaldir,
    alanlariTemizle,
    tumAlanlariTemizle,
    // idari sinir
    ilceKodu,
    mahalleKodu,
    ilceSec,
    mahalleSec: setMahalleKodu,
    idariHatasi,
    idariSinirKutusu,
    // ortak
    cizimVeOlcumuKapat,
    sifirla,
  };
}
