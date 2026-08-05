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

/** Haritadaki alan secimi: cizim, mesafe olcumu, secilen alanlarin varlik
 *  sonuclari, cakismasiz alan ozeti ve ilce/mahalle sinir secimi.
 *
 *  Hepsi tek hook'ta cunku hepsi ayni listeyi (`tamamlananAlanlar`) besler:
 *  kullanicinin cizdigi alan da secilen ilce siniri da ayni sekilde cizilir,
 *  ayni sekilde sorgulanir ve ayni panelde listelenir. */

/** Ilce/mahalle secimi de bir "tamamlanan alan"dir; sabit id sayesinde yeni
 *  bir sinir secilince oncekinin yerine gecer. */
export const IDARI_ALAN_ID = "idari-sinir";
export const IDARI_ALAN_RENK = "#0891b2";

/** Halka listesinden backend'e gonderilecek GeoJSON geometrisi: tek halkada
 *  Polygon, cok halkada (orn. Adalar ilcesi) MultiPolygon. */
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
  /** Alan sorgularina eklenen aktif filtreler; degisince tamamlanmis
   *  alanlarin sonuclari yeniden getirilir. */
  filters: AssetFilters;
  /** Baslangic cizim rengi ("Temizle" bunu geri yukler). */
  varsayilanRenk: string;
  /** Haritayi bir hedefe ucurur (idari sinir secilince kullanilir). */
  ucur: (hedef: UcusHedefi) => void;
  onCizimBasladi?: () => void;
  onAlanTamamlandi?: () => void;
}

export function useAlanSecimi({
  filters,
  varsayilanRenk,
  ucur,
  onCizimBasladi,
  onAlanTamamlandi,
}: AlanSecimiSecenekleri) {
  // --- Alan (poligon) secimi; birden fazla alan acik kalabilir ---
  const [cizimModu, setCizimModu] = useState(false);
  const [cizimNoktalari, setCizimNoktalari] = useState<[number, number][]>([]);
  const [cizimRengi, setCizimRengi] = useState<string>(varsayilanRenk);
  const [tamamlananAlanlar, setTamamlananAlanlar] = useState<TamamlananAlan[]>([]);
  const [alanHatasi, setAlanHatasi] = useState<string | null>(null);
  const [alanYukleniyor, setAlanYukleniyor] = useState(false);

  // --- Mesafe olcum araci ---
  const [olcumModu, setOlcumModu] = useState(false);
  const [olcumNoktalari, setOlcumNoktalari] = useState<[number, number][]>([]);

  // --- Ilce/mahalle sinirina gore filtreleme (kapsam Istanbul oldugundan il
  //     secimi yok; ilce secilince kademeli olarak mahalle gelir) ---
  const [ilceKodu, setIlceKodu] = useState<string | null>(null);
  const [mahalleKodu, setMahalleKodu] = useState<string | null>(null);
  const [idariHatasi, setIdariHatasi] = useState<string | null>(null);
  /** Secili sinirin sinir kutusu; konum aramasi bu bolgeyle sinirlanir
   *  (onceliklendirme degil, sert kisit). */
  const [idariSinirKutusu, setIdariSinirKutusu] = useState<
    [[number, number], [number, number]] | null
  >(null);

  // Callback ve filtreler ref'te tutulur ki efektlerin kimligi cagiranin her
  // render'da yeni fonksiyon vermesine bagli olmasin. Atama render sirasinda
  // degil efekt icinde yapilir (concurrent render'da iki kez calisabilir).
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

  /** Tamamlanmis alanlarin sonuclarinin birlesimi; ust uste binen alanlarda
   *  ayni varlik iki kez sayilmasin diye id'ye gore tekillestirilir. */
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

  // Son konan koseyi geri alir. Yanlis konan tek bir kose yuzunden butun
  // cizimi bastan yapmak gerekmemeli; "Iptal"in yumusak karsiligidir.
  const cizimGeriAl = useCallback(() => {
    setCizimNoktalari((n) => n.slice(0, -1));
  }, []);

  const olcumGeriAl = useCallback(() => {
    setOlcumNoktalari((n) => n.slice(0, -1));
  }, []);

  const alanSecimiIptal = useCallback(() => {
    setCizimModu(false);
    setCizimNoktalari([]);
  }, []);

  const olcumIptal = useCallback(() => {
    setOlcumModu(false);
    setOlcumNoktalari([]);
  }, []);

  // Cizim ve olcum ayni harita tiklamalarini paylasir, ikisi birlikte acilamaz.
  // Kosul gereksiz gorunse de gerekli: `olcumIptal` her cagrildiginda yeni bir
  // bos dizi yazar, yani mod kapaliyken bile render tetiklerdi.
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

  /** Sekil duzenleme baslarken cagrilir; o da ayni paneli/tiklamalari kullanir. */
  const cizimVeOlcumuKapat = useCallback(() => {
    setCizimModu(false);
    setCizimNoktalari([]);
    setOlcumModu(false);
  }, []);

  const alanKaldir = useCallback((id: string) => {
    setTamamlananAlanlar((a) => a.filter((alan) => alan.id !== id));
    // Idari sinir kaldirilinca acilirlar da bosalir, yoksa panel haritada
    // olmayan bir ilceyi secili gosterirdi.
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

  /** Yalnizca cizilen alanlari birakir, ilce/mahalle secimine dokunmaz.
   *  Bildirimden varliga giderken kullanilir. */
  const alanlariTemizle = useCallback(() => {
    setTamamlananAlanlar([]);
  }, []);

  // Ilce degisince mahalle secimi sifirlanir.
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
      // Cizim sifirlanir ki kullanici hemen bir sonraki alana baslayabilsin.
      setCizimModu(false);
      setCizimNoktalari([]);
      onAlanTamamlandiRef.current?.();
    } catch (e) {
      setAlanHatasi((e as Error).message);
    } finally {
      setAlanYukleniyor(false);
    }
  }, [cizimNoktalari, cizimRengi]);

  // Filtre degisince tamamlanmis alanlarin sonuclari da yeniden getirilir,
  // yoksa panel alanin tamamlandigi andaki donmus sonuclara bakmaya devam eder.
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
        // Arada yeni bir istek baslamissa eski sonucu yoksay.
        if (filtreIstekSirasiRef.current === siraNo)
          setTamamlananAlanlar(guncellenmis);
      })
      .catch((e) => {
        if (filtreIstekSirasiRef.current === siraNo)
          setAlanHatasi((e as Error).message);
      });
    // tamamlananAlanlar kasitli olarak bagimlilik disi: yeni alan zaten guncel
    // filtreyle sorgulaniyor, burasi yalnizca filtre degisince calismali.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  // --- Secili alanlarin cakismayi hesaba katan olcusu ---------------------
  // Yerel (shoelace) hesap tek poligon icin dogru ama ust uste binen alanlarda
  // ayni yeri iki kez sayar; bu yuzden olcu backend'de (PostGIS) hesaplanir:
  // her alanin oncekilerle cakismayan net katkisi ve toplami doner.
  const [alanOzetiSonuc, setAlanOzetiSonuc] = useState<AlanOzeti | null>(null);
  const olcuIstekSirasiRef = useRef(0);
  /** Yalnizca geometri degisince yeniden olculsun: filtre degisince
   *  `tamamlananAlanlar` yeni nesnelerle gelir ama sekiller aynidir. */
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
        // Olcum alinamazsa panel yerel toplama duser, alan secimi calismaya
        // devam eder.
        if (olcuIstekSirasiRef.current === siraNo) setAlanOzetiSonuc(null);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alanGeometriImzasi]);

  const alanOlculeri = useMemo(() => {
    if (!alanOzetiSonuc) return undefined;
    return Object.fromEntries(alanOzetiSonuc.alanlar.map((a) => [a.id, a]));
  }, [alanOzetiSonuc]);

  // Ilce/mahalle secimi degisince sinir geometrisini getirir, listeye sabit
  // id'yle ekler ve haritayi o bolgeye ucurur. Aktif sinir: mahalle secildiyse
  // mahalle, yoksa ilce. Filtre degisiminde yukaridaki efekt bunu da sorgular.
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
    cizimGeriAl,
    alanSecimiBaslat,
    alanSecimiIptal,
    alanSecimiTamamla,
    // olcum
    olcumModu,
    olcumNoktalari,
    olcumMesafeM,
    olcumNoktaEkle,
    olcumGeriAl,
    olcumBaslat,
    olcumIptal,
    olcumBitir,
    olcumTemizle,
    // secili alanlar
    tamamlananAlanlar,
    birlesikAlanSonucu,
    alanOlculeri,
    /** Cakismasiz olcum sonucu; panelin toplam satirini besler. */
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
