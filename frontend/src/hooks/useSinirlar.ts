import { useQuery } from "@tanstack/react-query";

import { ilceler } from "../api/sinirlar";

export function useIlceler(ilKodu: string | null) {
  return useQuery({
    queryKey: ["sinirlar", "ilceler", ilKodu],
    queryFn: () => ilceler(ilKodu!),
    enabled: ilKodu !== null,
    staleTime: Infinity,
  });
}
