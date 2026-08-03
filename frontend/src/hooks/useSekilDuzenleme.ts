import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { bolgeGuncelle } from "../api/bolgeler";
import { alanTamponu } from "../api/geo";
import type { Bolge, BolgeTipi, SekilDuzenleme } from "../types/bolge";
import { halkalariAc } from "../utils/geo";

/** Kaydedilmis bir bolgenin/guzergahin GEOMETRISINI harita uzerinde duzenleme.
 *
 *  Kayit YERINDE guncellenir: id'si, atamasi ve tamamlanma durumu korunur - bir
 *  sinirin birkac metre kaydirilmasi yeni bir bolge acmayi (ve gecmisi
 *  kaybetmeyi) gerektirmesin. Taslak burada tutulur, "Kaydet"e basilana kadar
 *  backend'e yazilmaz. */

/** Sekil duzenlemede kullanilacak nokta listesi: alanlarda backend'in KAPALI
 *  dondurdugu halkalarin son (tekrar eden) noktasi atilir - aksi halde ilk ve
 *  son kosede ust uste iki tutamak olur ve biri suruklenince sekil bozulur.
 *  Cizgilerde dokunulmaz (bir guzergahin ucu ucuna gelmesi mesru olabilir). */
export function sekilNoktalari(
  tip: BolgeTipi,
  noktalar: [number, number][][]
): [number, number][][] {
  return tip === "cizgi" ? noktalar : halkalariAc(noktalar);
}

/** Taslak, kaydedilmis geometriden farkli mi ("Kaydet"/"Geri al" icin).
 *
 *  Karsilastirma iki tarafi da AYNI normalde (acik halka) yapmali: kayitli hali
 *  kapali halkalarla gelir, taslak acik tutulur - ham karsilastirma hicbir sey
 *  degismeden "değişti" der ve Kaydet hep etkin kalirdi. */
export function sekilDegistiMi(
  taslak: SekilDuzenleme | null,
  kayitli: Bolge | undefined
): boolean {
  if (!taslak) return false;
  // Kayit listede yoksa (henuz gelmedi ya da silindi) taslak "degismis" sayilir
  // - kullanicinin emegini kaydedilemez gostermektense kaydetmeyi denemek daha
  // iyi.
  if (!kayitli) return true;
  return (
    JSON.stringify(sekilNoktalari(kayitli.tip, kayitli.noktalar)) !==
    JSON.stringify(taslak.noktalar)
  );
}

export interface SekilDuzenlemeSecenekleri {
  /** Kayitli bolgeler; taslagin "degisti mi" karsilastirmasi ve "Geri al" icin. */
  bolgeler: Bolge[] | undefined;
  /** Duzenlenen kayda haritayi ucurur. */
  bolgeyeGit: (bolge: Bolge) => void;
  /** Duzenleme baslarken cagrilir: cizim/olcum ayni alt paneli paylasir, ucu
   *  birden acik olamaz. */
  onBaslarken: () => void;
}

export function useSekilDuzenleme({
  bolgeler,
  bolgeyeGit,
  onBaslarken,
}: SekilDuzenlemeSecenekleri) {
  const queryClient = useQueryClient();
  const [duzenleme, setDuzenleme] = useState<SekilDuzenleme | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [genisletiliyor, setGenisletiliyor] = useState(false);

  // Callback'ler ref'te: `baslat`in kimligi cagiranin her render'da yeni
  // fonksiyon vermesine bagli olmasin (atama render'da degil efektte - bkz.
  // useAlanSecimi'ndeki ayni not).
  const bolgeyeGitRef = useRef(bolgeyeGit);
  const onBaslarkenRef = useRef(onBaslarken);
  useEffect(() => {
    bolgeyeGitRef.current = bolgeyeGit;
    onBaslarkenRef.current = onBaslarken;
  });

  const baslat = useCallback((bolge: Bolge) => {
    onBaslarkenRef.current();
    setHata(null);
    setDuzenleme({
      id: bolge.id,
      ad: bolge.ad,
      tip: bolge.tip,
      renk: bolge.renk,
      noktalar: sekilNoktalari(bolge.tip, bolge.noktalar),
    });
    bolgeyeGitRef.current(bolge);
  }, []);

  const kapat = useCallback(() => {
    setDuzenleme(null);
    setHata(null);
  }, []);

  /** Harita uzerindeki tutamaklardan gelen canli geometri. */
  const degisti = useCallback((noktalar: [number, number][][]) => {
    setDuzenleme((s) => (s ? { ...s, noktalar } : s));
  }, []);

  const kayitliKayit = useMemo(
    () => bolgeler?.find((b) => b.id === duzenleme?.id),
    [bolgeler, duzenleme?.id]
  );

  /** Taslagi kaydin son kaydedilmis geometrisine dondurur. */
  const sekliSifirla = useCallback(() => {
    if (!kayitliKayit) return;
    setHata(null);
    setDuzenleme((s) =>
      s
        ? { ...s, noktalar: sekilNoktalari(kayitliKayit.tip, kayitliKayit.noktalar) }
        : s
    );
  }, [kayitliKayit]);

  const kaydet = useCallback(async () => {
    if (!duzenleme) return;
    setKaydediliyor(true);
    setHata(null);
    try {
      await bolgeGuncelle(duzenleme.id, { noktalar: duzenleme.noktalar });
      queryClient.invalidateQueries({ queryKey: ["bolgeler"] });
      setDuzenleme(null);
    } catch (e) {
      setHata((e as Error).message);
    } finally {
      setKaydediliyor(false);
    }
  }, [duzenleme, queryClient]);

  /** Alani her yonunde `mesafeM` metre buyutur/kucultur (PostGIS ST_Buffer).
   *  Koseleri tek tek surukleyerek yapilamayacak olan "biraz genislet" istegi.
   *  Yalnizca alanlarda anlamli: bir guzergahin "genisletilmesi" onu poligona
   *  cevirirdi. */
  const genislet = useCallback(
    async (mesafeM: number) => {
      if (!duzenleme || duzenleme.tip !== "alan") return;
      setGenisletiliyor(true);
      setHata(null);
      try {
        const sonuc = await alanTamponu(duzenleme.noktalar, mesafeM);
        setDuzenleme((s) =>
          s ? { ...s, noktalar: sekilNoktalari("alan", sonuc.noktalar) } : s
        );
      } catch (e) {
        setHata((e as Error).message);
      } finally {
        setGenisletiliyor(false);
      }
    },
    [duzenleme]
  );

  const degismis = useMemo(
    () => sekilDegistiMi(duzenleme, kayitliKayit),
    [duzenleme, kayitliKayit]
  );

  return {
    duzenleme,
    hata,
    kaydediliyor,
    genisletiliyor,
    degismis,
    baslat,
    kapat,
    degisti,
    sekliSifirla,
    kaydet,
    genislet,
  };
}
