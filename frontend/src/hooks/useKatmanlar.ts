import { useCallback, useEffect, useMemo, useState } from "react";

import type { KatmanAnahtari } from "../components/KatmanKontrolu";
import { turKodlari, turSozluguSurumu } from "../data/turSozlugu";
import {
  ASSET_STATUSES,
  type AssetStatus,
  type AssetType,
} from "../types/asset";
import { TALEP_GORUNUMLERI, type TalepGorunumu } from "../types/report";

/** Haritanin katman gorunurlugu ve alt-filtreleri.
 *
 *  Tek kaynak kurali: tur/durum filtresi burada bir kez yasar, hem lejant
 *  kutucuklari hem panel acilirlari ayni state'i yazar.
 *
 *  Iki yazma bicimi:
 *    * `*Degistir(anahtar)` - lejant: tek kutucugu tersler (coklu secim).
 *    * `panel*Sec(deger)`   - acilir: yalnizca o degeri, `null` ise hepsini. */

export interface KatmanDurumu {
  katmanlar: Record<KatmanAnahtari, boolean>;
  katmanTurleri: Record<AssetType, boolean>;
  katmanVarlikDurumlari: Record<AssetStatus, boolean>;
  katmanDurumlari: Record<TalepGorunumu, boolean>;
}

/** Departmani olmayan kayitlarin alt-filtre anahtari (ekipte "Departmansız",
 *  bolge/guzergahta "Genel"). Gercek bir departman kodu olamayacagi icin
 *  cakismaz. */
export const DEPARTMANSIZ = "__departmansiz__";

/** Departman alt-filtresi olan katmanlar. */
export type BolgeKatmani = "bolgeler" | "guzergahlar";

export interface DepartmanFiltresi {
  secili: (kod: string | null) => boolean;
  degistir: (anahtar: string) => void;
}

/** Departman alt-filtresinin state'i. Diger alt-filtrelerden farkli olarak
 *  anahtarlar DERLEME ANINDA BILINMEZ (departman sozlugu backend'den gelir),
 *  bu yuzden tam bir kayit yerine "yalnizca kapatilanlar" tutulur: eksik
 *  anahtar = secili. Boylece yeni bir mudurluk eklendiginde kayitlari
 *  kendiliginden gorunur olur, sessizce gizlenmez. */
function useDepartmanFiltresi() {
  const [kapali, setKapali] = useState<Record<string, true>>({});

  const secili = useCallback(
    (kod: string | null) => !kapali[kod ?? DEPARTMANSIZ],
    [kapali]
  );
  const degistir = useCallback((anahtar: string) => {
    setKapali((k) => {
      const yeni = { ...k };
      if (yeni[anahtar]) delete yeni[anahtar];
      else yeni[anahtar] = true;
      return yeni;
    });
  }, []);
  const sifirla = useCallback(() => setKapali({}), []);

  return useMemo(() => ({ secili, degistir, sifirla }), [secili, degistir, sifirla]);
}

/** Tum anahtarlari `true` yapan kayit. Sabitler elle yazilmak yerine
 *  sozlukten turetilsin diye: elle yazilan listeler bayatliyor. */
export function hepsi<K extends string>(anahtarlar: readonly K[]): Record<K, boolean> {
  return Object.fromEntries(anahtarlar.map((a) => [a, true])) as Record<K, boolean>;
}

/** Kutucuklari tekil bir secime gore kurar: secim varsa yalnizca onu, yoksa
 *  hepsini. Sonuc degismediyse ayni nesne doner (gereksiz render olmasin). */
export function yalnizca<K extends string>(
  anahtarlar: readonly K[],
  secili: K | undefined | null
) {
  return (onceki: Record<K, boolean>): Record<K, boolean> => {
    const yeni = Object.fromEntries(
      anahtarlar.map((a) => [a, secili ? a === secili : true])
    ) as Record<K, boolean>;
    return anahtarlar.every((a) => onceki[a] === yeni[a]) ? onceki : yeni;
  };
}

/** Acilis durumu. `katmanTurleri` BURADA YOK: tur sozlugu backend'den gelir,
 *  yani modul yuklendiginde henuz bilinmez - hook mount aninda kurar. */
export const KATMAN_BASLANGIC: Omit<KatmanDurumu, "katmanTurleri"> = {
  /** Varliklar + talepler + ekipler gorunur; bolgeler/guzergahlar gizli
   *  (kullanici lejanttan ya da Bölgeler sekmesinden acar). */
  katmanlar: {
    varliklar: true,
    talepler: true,
    bolgeler: false,
    guzergahlar: false,
    ekipler: true,
  },
  /** Acilista yalnizca "Bakım Lazım": saglam envanter haritayi doldurmasin. */
  katmanVarlikDurumlari: { iyi: false, bakim_lazim: true },
  /** Ayni mantik: acilista ise donusmus (onaylanmis) talepler isaretli. */
  katmanDurumlari: {
    beklemede: false,
    onaylandi: true,
    reddedildi: false,
    tamir: false,
  },
};

/** "Temizle" sonrasi: hicbir ana katman secili degil. Acilistan bilincli
 *  olarak farkli - Temizle "her seyi kaldir" demek, "varsayilana don" degil. */
const BOS_KATMANLAR: Record<KatmanAnahtari, boolean> = {
  varliklar: false,
  talepler: false,
  bolgeler: false,
  guzergahlar: false,
  ekipler: false,
};

export function useKatmanlar() {
  const [katmanlar, setKatmanlar] = useState(KATMAN_BASLANGIC.katmanlar);
  // Tur sozlugu backend verisidir; korumali ekranlar o yuklenmeden cizilmedigi
  // icin (auth/RequireRole) mount aninda dolu okunur.
  const [katmanTurleri, setKatmanTurleri] = useState<Record<AssetType, boolean>>(
    () => hepsi(turKodlari())
  );
  // Admin calisirken yeni bir tur eklerse kutucugu ACIK baslar: eksik anahtar
  // sessizce "gizli" anlamina gelseydi yeni tur haritada hic gorunmezdi.
  const sozlukSurumu = turSozluguSurumu();
  useEffect(() => {
    setKatmanTurleri((onceki) => {
      const eksik = turKodlari().filter((t) => !(t in onceki));
      return eksik.length ? { ...onceki, ...hepsi(eksik) } : onceki;
    });
  }, [sozlukSurumu]);
  const [katmanVarlikDurumlari, setKatmanVarlikDurumlari] = useState(
    KATMAN_BASLANGIC.katmanVarlikDurumlari
  );
  const [katmanDurumlari, setKatmanDurumlari] = useState(
    KATMAN_BASLANGIC.katmanDurumlari
  );
  /** Saha ekibi katmaninin departman alt-filtresi. */
  const ekipDepartmani = useDepartmanFiltresi();
  /** Bolge ve guzergah katmanlarinin departman alt-filtresi. Ikisi AYRI
   *  state'tir: lejantta ayri katmanlar, sayaclari ayri - birinde bir
   *  mudurlugu kapatmak digerini de gizleseydi kutucuk yalan soylerdi. */
  const alanDepartmani = useDepartmanFiltresi();
  const cizgiDepartmani = useDepartmanFiltresi();
  const bolgeDepartmani = useMemo<Record<BolgeKatmani, DepartmanFiltresi>>(
    () => ({ bolgeler: alanDepartmani, guzergahlar: cizgiDepartmani }),
    [alanDepartmani, cizgiDepartmani]
  );
  /** Talepler katmaninin mudurluk alt-filtresi: yalnizca "Onaylandı" ve
   *  "Bekleyen" gorunumlerinde vardir, ikisi AYRI state'tir (bolge/guzergah
   *  ciftiyle ayni desen - "Onaylandı"da bir mudurlugu kapatmak "Bekleyen"i de
   *  gizleseydi kutucuk yalan soylerdi; sekmeler ayni is kuyrugunun farkli
   *  asamalari olsa da personel genelde birini kontrol ederken digerini
   *  degistirmez). Varlik katmanindaki tur filtresinden de AYRIdir: ikisi ayni
   *  `katmanTurleri`yi paylassaydi, varlik lejantindan bir tur kapatmak
   *  talepleri de gizlerdi. */
  const onaylandiDepartmani = useDepartmanFiltresi();
  const beklemedeDepartmani = useDepartmanFiltresi();
  const talepDepartmani = useMemo<
    Partial<Record<TalepGorunumu, DepartmanFiltresi>>
  >(
    () => ({ onaylandi: onaylandiDepartmani, beklemede: beklemedeDepartmani }),
    [onaylandiDepartmani, beklemedeDepartmani]
  );

  // --- Lejant kutucuklari (coklu secim) ---
  const katmanDegistir = useCallback((anahtar: KatmanAnahtari) => {
    setKatmanlar((k) => ({ ...k, [anahtar]: !k[anahtar] }));
  }, []);
  const katmanTuruDegistir = useCallback((anahtar: string) => {
    setKatmanTurleri((t) => ({ ...t, [anahtar]: !t[anahtar as AssetType] }));
  }, []);
  /** Lejantta bir mudurluk basligina tiklandiginda: o mudurlugun TUM turlerini
   *  birlikte acar/kapatir. Tek tur kutucuklariyla ayni state'e yazar - baslik
   *  bir katman degil, altindaki kutucuklarin toplu anahtaridir. */
  const katmanTurGrubuDegistir = useCallback(
    (turler: readonly AssetType[], secili: boolean) => {
      setKatmanTurleri((t) => ({
        ...t,
        ...Object.fromEntries(turler.map((x) => [x, secili])),
      }));
    },
    []
  );
  const katmanVarlikDurumuDegistir = useCallback((anahtar: string) => {
    setKatmanVarlikDurumlari((d) => ({ ...d, [anahtar]: !d[anahtar as AssetStatus] }));
  }, []);
  const katmanDurumuDegistir = useCallback((anahtar: string) => {
    setKatmanDurumlari((d) => ({ ...d, [anahtar]: !d[anahtar as TalepGorunumu] }));
  }, []);

  // --- Panel acilirlari (tekil secim) ---
  const panelDurumuSec = useCallback((durum: AssetStatus | null) => {
    setKatmanVarlikDurumlari(yalnizca(ASSET_STATUSES, durum));
  }, []);

  // --- Sekme -> katman senkronu icin gereken hedefli yazicilar ---
  /** Bir ana katmani acar; zaten acikken ayni nesneyi birakir. */
  const katmaniAc = useCallback((anahtar: KatmanAnahtari) => {
    setKatmanlar((k) => (k[anahtar] ? k : { ...k, [anahtar]: true }));
  }, []);
  /** Yalnizca varlik ya da yalnizca talep katmanini acik birakir; alakasiz
   *  katman acik kalirsa panel ile harita celisir. */
  const yalnizVarlikVeyaTalep = useCallback((hangisi: "varliklar" | "talepler") => {
    setKatmanlar((k) => {
      const varliklar = hangisi === "varliklar";
      return k.varliklar === varliklar && k.talepler === !varliklar
        ? k
        : { ...k, varliklar, talepler: !varliklar };
    });
  }, []);
  const talepDurumunuSec = useCallback((durum: TalepGorunumu) => {
    setKatmanDurumlari(yalnizca(TALEP_GORUNUMLERI, durum));
  }, []);

  /** "Temizle": ana katmanlar bosalir, alt filtrelerin hepsi isaretlenir -
   *  katman tekrar acildiginda kullanici toplam sayiyi gorur. */
  const sifirla = useCallback(() => {
    setKatmanlar(BOS_KATMANLAR);
    setKatmanTurleri(hepsi(turKodlari()));
    setKatmanVarlikDurumlari(hepsi(ASSET_STATUSES));
    setKatmanDurumlari(hepsi(TALEP_GORUNUMLERI));
    ekipDepartmani.sifirla();
    alanDepartmani.sifirla();
    cizgiDepartmani.sifirla();
    onaylandiDepartmani.sifirla();
    beklemedeDepartmani.sifirla();
  }, [
    ekipDepartmani,
    alanDepartmani,
    cizgiDepartmani,
    onaylandiDepartmani,
    beklemedeDepartmani,
  ]);

  return {
    katmanlar,
    katmanTurleri,
    katmanVarlikDurumlari,
    katmanDurumlari,
    ekipDepartmaniSecili: ekipDepartmani.secili,
    bolgeDepartmani,
    talepDepartmani,
    katmanDegistir,
    katmanTuruDegistir,
    katmanTurGrubuDegistir,
    katmanVarlikDurumuDegistir,
    katmanDurumuDegistir,
    ekipDepartmaniDegistir: ekipDepartmani.degistir,
    panelDurumuSec,
    katmaniAc,
    yalnizVarlikVeyaTalep,
    talepDurumunuSec,
    sifirla,
  };
}
