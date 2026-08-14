import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { bolgeler as bolgeleriGetir, bolgelerim } from "../api/bolgeler";
import {
  guzergahlar as guzergahlariGetir,
  guzergahlarim,
} from "../api/guzergahlar";
import type { Bolge, BolgeYanit } from "../types/bolge";
import type { GuzergahYanit } from "../types/guzergah";

/** Bolgeler ve guzergahlar iki ayri uctan gelir, ama paneller/harita ikisini
 *  tek listede gosterir. Birlestirme BURADA, tuketim noktasinda yapilir:
 *  react-query onbelleginde her anahtar HAM yaniti tutar, yoksa ayni anahtari
 *  paylasan iki bilesen farkli sekiller yazip birbirinin verisini bozardi. */

export function bolgeyeCevir(y: BolgeYanit): Bolge {
  return { ...y, tip: "alan", uzunluk_m: null };
}

export function guzergahaCevir(y: GuzergahYanit): Bolge {
  return { ...y, tip: "cizgi", alan_m2: null };
}

function birlestir(
  alanlar: BolgeYanit[] | undefined,
  cizgiler: GuzergahYanit[] | undefined
): Bolge[] | undefined {
  // Iki sorgudan biri henuz gelmemisse liste eksik gosterilmez: yarim liste
  // "bu kayitlar silinmis" gibi okunur.
  if (!alanlar || !cizgiler) return undefined;
  return [...alanlar.map(bolgeyeCevir), ...cizgiler.map(guzergahaCevir)];
}

/** Personel: kaydedilmis tum bolgeler + guzergahlar. */
export function useKayitliCizimler(etkin = true) {
  const bolgeSorgu = useQuery({
    queryKey: ["bolgeler"],
    queryFn: bolgeleriGetir,
    enabled: etkin,
  });
  const guzergahSorgu = useQuery({
    queryKey: ["guzergahlar"],
    queryFn: guzergahlariGetir,
    enabled: etkin,
  });
  const data = useMemo(
    () => birlestir(bolgeSorgu.data, guzergahSorgu.data),
    [bolgeSorgu.data, guzergahSorgu.data]
  );
  return {
    data,
    isLoading: bolgeSorgu.isLoading || guzergahSorgu.isLoading,
    isError: bolgeSorgu.isError || guzergahSorgu.isError,
    // Iki hatadan ilki gosterilir: kullanicinin yapacagi sey (yeniden dene)
    // ikisinde de ayni, iki mesaji birden gostermek bilgi eklemez.
    error: (bolgeSorgu.error ?? guzergahSorgu.error) as Error | null,
  };
}

/** Saha ekibi: yalnizca kendisine atanan bolgeler + guzergahlar.
 *
 *  Anahtarlar `["saha", ...]` altinda durur: saha ekraninin butun sorgulari o
 *  onekle tazeleniyor (bir atama/tamamlama hepsini birden etkiler), iki listeyi
 *  bunun disinda birakmak onlari bayat birakirdi. */
export function useKendiCizimlerim(secenekler?: {
  refetchInterval?: number;
  refetchOnWindowFocus?: boolean;
}) {
  const bolgeSorgu = useQuery({
    queryKey: ["saha", "bolgelerim"],
    queryFn: bolgelerim,
    ...secenekler,
  });
  const guzergahSorgu = useQuery({
    queryKey: ["saha", "guzergahlarim"],
    queryFn: guzergahlarim,
    ...secenekler,
  });
  const data = useMemo(
    () => birlestir(bolgeSorgu.data, guzergahSorgu.data),
    [bolgeSorgu.data, guzergahSorgu.data]
  );
  return {
    data,
    isLoading: bolgeSorgu.isLoading || guzergahSorgu.isLoading,
    isError: bolgeSorgu.isError || guzergahSorgu.isError,
    error: (bolgeSorgu.error ?? guzergahSorgu.error) as Error | null,
  };
}
