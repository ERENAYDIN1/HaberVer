import { useQuery } from "@tanstack/react-query";

import { ilceler, iller } from "../api/sinirlar";

export function useIller() {
  return useQuery({
    queryKey: ["sinirlar", "iller"],
    queryFn: iller,
    staleTime: Infinity,
  });
}

export function useIlceler(ilKodu: string | null) {
  return useQuery({
    queryKey: ["sinirlar", "ilceler", ilKodu],
    queryFn: () => ilceler(ilKodu!),
    enabled: ilKodu !== null,
    staleTime: Infinity,
  });
}
