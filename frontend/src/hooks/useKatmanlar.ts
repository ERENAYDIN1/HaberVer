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
 *  Tek kaynak kurali: tur/durum filtresi burada bir kez yasar, hem lejant
 *  kutucuklari hem panel acilirlari ayni state'i yazar. Bu iki yuzey tekrar
 *  ayrilmamali - eskiden panel backend sorgusunu daraltiyordu ve lejanttan
 *  baska bir tur acmak haritaya hicbir sey eklemiyordu (veri hic gelmemisti).
 *
 *  Iki yazma bicimi:
 *    * `*Degistir(anahtar)` - lejant: tek kutucugu tersler (coklu secim).
 *    * `panel*Sec(deger)`   - acilir: yalnizca o degeri, `null` ise hepsini. */

export interface KatmanDurumu {
  katmanlar: Record<KatmanAnahtari, boolean>;
  katmanTurleri: Record<AssetType, boolean>;
  katmanVarlikDurumlari: Record<AssetStatus, boolean>;
  katmanDurumlari: Record<IhbarGorunumu, boolean>;
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

/** Acilis durumu. `katmanTurleri` sozlukten turetilir (bkz. `hepsi`). */
export const KATMAN_BASLANGIC: KatmanDurumu = {
  /** Varliklar + ihbarlar + ekipler gorunur; bolgeler/guzergahlar gizli
   *  (kullanici lejanttan ya da Bölgeler sekmesinden acar). */
  katmanlar: {
    varliklar: true,
    ihbarlar: true,
    bolgeler: false,
    guzergahlar: false,
    ekipler: true,
  },
  katmanTurleri: hepsi(ASSET_TYPES),
  /** Acilista yalnizca "Bakım Lazım": saglam envanter haritayi doldurmasin. */
  katmanVarlikDurumlari: { iyi: false, bakim_lazim: true },
  /** Ayni mantik: acilista ise donusmus (onaylanmis) ihbarlar isaretli. */
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
  /** Bir ana katmani acar; zaten acikken ayni nesneyi birakir. */
  const katmaniAc = useCallback((anahtar: KatmanAnahtari) => {
    setKatmanlar((k) => (k[anahtar] ? k : { ...k, [anahtar]: true }));
  }, []);
  /** Yalnizca varlik ya da yalnizca ihbar katmanini acik birakir; alakasiz
   *  katman acik kalirsa panel ile harita celisir. */
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

  /** "Temizle": ana katmanlar bosalir, alt filtrelerin hepsi isaretlenir -
   *  katman tekrar acildiginda kullanici toplam sayiyi gorur. */
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
