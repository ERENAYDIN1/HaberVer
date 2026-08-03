import { useCallback, useState } from "react";

import type { KatmanAnahtari } from "../components/KatmanKontrolu";
import {
  ASSET_STATUSES,
  ASSET_TYPES,
  type AssetStatus,
  type AssetType,
} from "../types/asset";
import { IHBAR_GORUNUMLERI, type IhbarGorunumu } from "../types/report";

/** Haritanin katman gorunurlugu ve alt-filtreleri.
 *
 *  **Tek kaynak kurali.** Varlik tur/durum filtresi burada YALNIZCA BIR KEZ
 *  yasar: hem sag-ustteki lejant kutucuklari hem sol paneldeki acilirlar ayni
 *  state'i yazar/okur. Eskiden iki ayri filtre vardi - panel acilirlari BACKEND
 *  SORGUSUNU daraltiyor, lejant ise gelen veriyi suzuyordu - ve tek yonlu
 *  senkron yuzunden panelde bir tur secmek kullanicinin lejant secimini
 *  siliyordu; dahasi daraltilmis sorgu yuzunden lejanttan baska bir tur acmak
 *  haritaya HICBIR SEY eklemiyordu (o kayitlar hic getirilmemisti). Bu iki
 *  yuzeyi tekrar ayirmayin.
 *
 *  Iki yazma bicimi vardir ve ikisi de aynidir:
 *    * `*Degistir(anahtar)` - lejant kutucugu: TEKIL kutucugu tersler (coklu secim).
 *    * `panel*Sec(deger)`   - panel acilir: yalnizca o degeri isaretler,
 *                             `null` ("Tüm tipler") hepsini isaretler.
 */

export interface KatmanDurumu {
  katmanlar: Record<KatmanAnahtari, boolean>;
  katmanTurleri: Record<AssetType, boolean>;
  katmanVarlikDurumlari: Record<AssetStatus, boolean>;
  katmanDurumlari: Record<IhbarGorunumu, boolean>;
}

/** Tum anahtarlari `true` yapan bir kayit uretir - sabitler sozlukten
 *  TURETILSIN diye. Elle yazilan listeler bayatliyor: `katmanTurleri` bir
 *  donem 3 turle (`agac/direk/sulama`) sabitlenmisti ve tur sozlugu 13'e
 *  cikinca 10 tur ilk render'da haritadan dusuyordu. */
export function hepsi<K extends string>(anahtarlar: readonly K[]): Record<K, boolean> {
  return Object.fromEntries(anahtarlar.map((a) => [a, true])) as Record<K, boolean>;
}

/** Alt-filtre kutucuklarini TEKIL bir secime gore kurar: bir secim varsa
 *  yalnizca onu, yoksa hepsini isaretler. Sonuc oncekiyle ayniysa AYNI NESNE
 *  dondurulur - gereksiz render (ve harita katman guncellemesi) olmasin. */
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

/** Acilis durumu. `katmanTurleri` sozlukten turetilir (bkz. `hepsi`). */
export const KATMAN_BASLANGIC: KatmanDurumu = {
  /** Varsayilan olarak varliklar + ihbarlar + saha ekipleri gorunur; kayitli
   *  bolgeler/guzergahlar gizli (kullanici lejanttan veya Bolgeler sekmesinden
   *  acar). Panel acilista KAPALI oldugu icin (`panelAcik=false` -> `aktifSekme`
   *  null) sekme->katman efekti bu secimi ezmez. */
  katmanlar: {
    varliklar: true,
    ihbarlar: true,
    bolgeler: false,
    guzergahlar: false,
    ekipler: true,
  },
  katmanTurleri: hepsi(ASSET_TYPES),
  /** Acilista yalnizca "Bakim Lazim" isaretli: ilk bakista is bekleyen
   *  varliklar gorunur, saglam envanter haritayi doldurmaz. */
  katmanVarlikDurumlari: { iyi: false, bakim_lazim: true },
  /** Ihbarlarda da ayni mantik: acilista onaylanmis (yani ise donusmus)
   *  ihbarlar isaretli gelir. */
  katmanDurumlari: {
    beklemede: false,
    onaylandi: true,
    reddedildi: false,
    tamir: false,
  },
};

/** "Temizle" sonrasi lejant: hicbir ANA katman secili degil, yani harita bombos
 *  kalir. Acilistaki `KATMAN_BASLANGIC.katmanlar`'dan bilincli olarak farklidir:
 *  Temizle "her seyi kaldir" demektir, "varsayilana don" degil. */
const BOS_KATMANLAR: Record<KatmanAnahtari, boolean> = {
  varliklar: false,
  ihbarlar: false,
  bolgeler: false,
  guzergahlar: false,
  ekipler: false,
};

export function useKatmanlar() {
  const [katmanlar, setKatmanlar] = useState(KATMAN_BASLANGIC.katmanlar);
  const [katmanTurleri, setKatmanTurleri] = useState(KATMAN_BASLANGIC.katmanTurleri);
  const [katmanVarlikDurumlari, setKatmanVarlikDurumlari] = useState(
    KATMAN_BASLANGIC.katmanVarlikDurumlari
  );
  const [katmanDurumlari, setKatmanDurumlari] = useState(
    KATMAN_BASLANGIC.katmanDurumlari
  );

  // --- Lejant kutucuklari (coklu secim) ---
  const katmanDegistir = useCallback((anahtar: KatmanAnahtari) => {
    setKatmanlar((k) => ({ ...k, [anahtar]: !k[anahtar] }));
  }, []);
  const katmanTuruDegistir = useCallback((anahtar: string) => {
    setKatmanTurleri((t) => ({ ...t, [anahtar]: !t[anahtar as AssetType] }));
  }, []);
  const katmanVarlikDurumuDegistir = useCallback((anahtar: string) => {
    setKatmanVarlikDurumlari((d) => ({ ...d, [anahtar]: !d[anahtar as AssetStatus] }));
  }, []);
  const katmanDurumuDegistir = useCallback((anahtar: string) => {
    setKatmanDurumlari((d) => ({ ...d, [anahtar]: !d[anahtar as IhbarGorunumu] }));
  }, []);

  // --- Panel acilirlari (tekil secim) ---
  const panelTuruSec = useCallback((tur: AssetType | null) => {
    setKatmanTurleri(yalnizca(ASSET_TYPES, tur));
  }, []);
  const panelDurumuSec = useCallback((durum: AssetStatus | null) => {
    setKatmanVarlikDurumlari(yalnizca(ASSET_STATUSES, durum));
  }, []);

  // --- Sekme -> katman senkronu icin gereken hedefli yazicilar ---
  /** Bir ana katmani acar (zaten acikken AYNI nesneyi birakir). */
  const katmaniAc = useCallback((anahtar: KatmanAnahtari) => {
    setKatmanlar((k) => (k[anahtar] ? k : { ...k, [anahtar]: true }));
  }, []);
  /** Yalnizca varlik ya da yalnizca ihbar katmanini acik birakir (sekme
   *  senkronu): lejant her secimde YENIDEN KURULUR, alakasiz katman acik
   *  kalmaz - yoksa panel ile harita celisir. */
  const yalnizVarlikVeyaIhbar = useCallback((hangisi: "varliklar" | "ihbarlar") => {
    setKatmanlar((k) => {
      const varliklar = hangisi === "varliklar";
      return k.varliklar === varliklar && k.ihbarlar === !varliklar
        ? k
        : { ...k, varliklar, ihbarlar: !varliklar };
    });
  }, []);
  const ihbarDurumunuSec = useCallback((durum: IhbarGorunumu) => {
    setKatmanDurumlari(yalnizca(IHBAR_GORUNUMLERI, durum));
  }, []);

  /** "Temizle": ANA katmanlar bosalir, ALT filtrelerin hepsi isaretlenir -
   *  kullanici bir katmani tekrar actiginda elenmis degil, TOPLAM sayiyi
   *  gorur. */
  const sifirla = useCallback(() => {
    setKatmanlar(BOS_KATMANLAR);
    setKatmanTurleri(KATMAN_BASLANGIC.katmanTurleri);
    setKatmanVarlikDurumlari(hepsi(ASSET_STATUSES));
    setKatmanDurumlari(hepsi(IHBAR_GORUNUMLERI));
  }, []);

  return {
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
    sifirla,
  };
}
