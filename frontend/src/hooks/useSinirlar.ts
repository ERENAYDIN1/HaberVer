import { useQuery } from "@tanstack/react-query";

import { ilceler, mahalleler } from "../api/sinirlar";

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
