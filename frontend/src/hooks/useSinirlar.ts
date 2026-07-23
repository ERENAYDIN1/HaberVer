import { useQuery } from "@tanstack/react-query";

import { ilceler, konumCozumle, mahalleler } from "../api/sinirlar";

export function useIlceler(ilKodu: string | null) {
  return useQuery({
    queryKey: ["sinirlar", "ilceler", ilKodu],
    queryFn: () => ilceler(ilKodu!),
    enabled: ilKodu !== null,
    staleTime: Infinity,
  });
}

export function useMahalleler(ilceKodu: string | null) {
  return useQuery({
    queryKey: ["sinirlar", "mahalleler", ilceKodu],
    queryFn: () => mahalleler(ilceKodu!),
    enabled: ilceKodu !== null,
    staleTime: Infinity,
  });
}

/** Bir koordinatin dustugu ilce/mahalleyi cozumler (varlik detayi icin). */
export function useKonumCozumu(lat: number | null, lon: number | null) {
  return useQuery({
    queryKey: ["sinirlar", "konum", lat, lon],
    queryFn: () => konumCozumle(lat!, lon!),
    enabled: lat !== null && lon !== null,
    staleTime: Infinity,
  });
}
