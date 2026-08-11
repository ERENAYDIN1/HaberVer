import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { bolgeGuncelle } from "../api/bolgeler";
import { alanTamponu } from "../api/geo";
import type { Bolge, BolgeTipi, SekilDuzenleme } from "../types/bolge";
import { halkalariAc } from "../utils/geo";

/** Bolge/guzergah geometrisinin harita uzerinde duzenlenmesi. Kayit yerinde
 *  guncellenir (id, atama ve tamamlanma durumu korunur); taslak burada tutulur
 *  ve "Kaydet"e basilana kadar backend'e yazilmaz. */

/** Duzenlemede kullanilacak nokta listesi: alanlarda backend'in kapali
 *  dondurdugu halkalarin tekrar eden son noktasi atilir, yoksa ilk kosede ust
 *  uste iki tutamak olusur. Cizgilere dokunulmaz. */
export function sekilNoktalari(
  tip: BolgeTipi,
  noktalar: [number, number][][]
): [number, number][][] {
  return tip === "cizgi" ? noktalar : halkalariAc(noktalar);
}

/** Taslak kaydedilmis geometriden farkli mi. Iki taraf da ayni normalde (acik
 *  halka) karsilastirilir, yoksa hicbir sey degismeden "değişti" derdi. */
export function sekilDegistiMi(
  taslak: SekilDuzenleme | null,
  kayitli: Bolge | undefined
): boolean {
  if (!taslak) return false;
  // Kayit listede yoksa taslak "degismis" sayilir: kaydetmeyi denemek,
  // kullaniciya kaydedilemez gostermekten iyi.
  if (!kayitli) return true;
  return (
    JSON.stringify(sekilNoktalari(kayitli.tip, kayitli.noktalar)) !==
    JSON.stringify(taslak.noktalar)
  );
}

export interface SekilDuzenlemeSecenekleri {
  /** Kayitli bolgeler; "degisti mi" karsilastirmasi ve "Geri al" icin. */
  bolgeler: Bolge[] | undefined;
  bolgeyeGit: (bolge: Bolge) => void;
  /** Duzenleme baslarken cagrilir; cizim/olcum ayni paneli paylasir. */
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
  // Her ayrik duzenleme (kose surukle/ekle/sil, genislet-daralt) bir onceki
  // nokta listesini buraya yigar; "Geri al" bastan degil SON adimdan geri
  // gider. Taslak `kapat`/`baslat`ta sifirlanir. Uzunluk ayrica state'te
  // tutulur (`gecmisUzunlugu`) ki "Geri al" dugmesi gecmis bosken devre disi
  // kalabilsin - ref'in kendisi render tetiklemez.
  const gecmisRef = useRef<[number, number][][][]>([]);
  const [gecmisUzunlugu, setGecmisUzunlugu] = useState(0);
  // `duzenleme` state'inin guncel yansimasi: `degisti` icinde YENI nokta
  // listesine gecmeden ONCEKI listeyi okumak icin (setState updater'i icinde
  // ref mutasyonu yapmamak adina render sirasinda senkron tutulur, bir efekte
  // birakilirsa bir kare gerideki degeri okurdu).
  const duzenlemeRef = useRef(duzenleme);
  duzenlemeRef.current = duzenleme;

  // Callback'ler ref'te: `baslat`in kimligi her render'da degismesin
  // (bkz. useAlanSecimi'ndeki ayni desen).
  const bolgeyeGitRef = useRef(bolgeyeGit);
  const onBaslarkenRef = useRef(onBaslarken);
  useEffect(() => {
    bolgeyeGitRef.current = bolgeyeGit;
    onBaslarkenRef.current = onBaslarken;
  });

  const baslat = useCallback((bolge: Bolge) => {
    onBaslarkenRef.current();
    setHata(null);
    gecmisRef.current = [];
    setGecmisUzunlugu(0);
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
    gecmisRef.current = [];
    setGecmisUzunlugu(0);
  }, []);

  /** Harita uzerindeki tutamaklardan gelen canli geometri. Onceki taslak
   *  gecmise yigilir ki "Geri al" tek adim geri gidebilsin.
   *
   *  Ref mutasyonu setState UPDATER'ININ DISINDA yapilir: StrictMode
   *  gelistirmede updater fonksiyonlarini iki kez cagirir (yan etki
   *  yakalamak icin), ref icerideyse her duzenleme sessizce IKI kez
   *  gecmise yigilirdi - "Geri al" ilk tikta hicbir sey yapmiyormus gibi
   *  gorunurdu (aslinda kopya kaydi siliyordu), gercek geri alma ikinci
   *  tikta gelirdi. */
  const degisti = useCallback((noktalar: [number, number][][]) => {
    if (!duzenlemeRef.current) return;
    gecmisRef.current.push(duzenlemeRef.current.noktalar);
    setGecmisUzunlugu(gecmisRef.current.length);
    setDuzenleme((s) => (s ? { ...s, noktalar } : s));
  }, []);

  const kayitliKayit = useMemo(
    () => bolgeler?.find((b) => b.id === duzenleme?.id),
    [bolgeler, duzenleme?.id]
  );

  /** Son adimi geri alir (kose surukle/ekle/sil, genislet-daralt); gecmis
   *  bossa (hic degisiklik yapilmamis) hicbir sey yapmaz. */
  const geriAl = useCallback(() => {
    const onceki = gecmisRef.current.pop();
    if (!onceki) return;
    setGecmisUzunlugu(gecmisRef.current.length);
    setHata(null);
    setDuzenleme((s) => (s ? { ...s, noktalar: onceki } : s));
  }, []);

  /** Taslagi kaydin son kaydedilmis geometrisine dondurur (tum gecmisi atar). */
  const sekliSifirla = useCallback(() => {
    if (!kayitliKayit) return;
    setHata(null);
    gecmisRef.current = [];
    setGecmisUzunlugu(0);
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
        gecmisRef.current.push(duzenleme.noktalar);
        setGecmisUzunlugu(gecmisRef.current.length);
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
    geriAlinabilir: gecmisUzunlugu > 0,
    baslat,
    kapat,
    degisti,
    geriAl,
    sekliSifirla,
    kaydet,
    genislet,
  };
}
