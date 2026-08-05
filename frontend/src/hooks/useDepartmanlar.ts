import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getEsleme, listDepartmanlar, updateEsleme } from "../api/departmanlar";
import type { TurDepartmanEslemesi } from "../types/departman";

/** Departman sozlugu ve tur -> departman eslemesi.
 *
 *  Ikisi de PRATIKTE DEGISMEZ veridir (bir belediye mudurluklerini gunde bir
 *  kez yeniden duzenlemez), bu yuzden uzun `staleTime` ile cekilir ve
 *  uygulamanin her yerinde ayni onbellekten okunur. Boylece hem vatandas
 *  formundaki "hangi mudurluge gidecek" ipucu hem personel rozetleri tek
 *  istekle beslenir.
 *
 *  Talebin/varligin departmani AYRI BIR ALAN DEGIL, turunden turetilir - iki
 *  yerde tutulan bilgi tutarsizlasirdi. */

const UZUN_SURE = 30 * 60 * 1000;

export function useDepartmanlar() {
  return useQuery({
    queryKey: ["departmanlar"],
    queryFn: listDepartmanlar,
    staleTime: UZUN_SURE,
  });
}

export function useTurDepartmanEslemesi() {
  return useQuery({
    queryKey: ["departmanlar", "esleme"],
    queryFn: getEsleme,
    staleTime: UZUN_SURE,
    select: (d) => d.esleme,
  });
}

export function useEslemeGuncelle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (esleme: TurDepartmanEslemesi) => updateEsleme(esleme),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["departmanlar"] });
      // Yonlendirme degisince kimin neyi gorebildigi de degisir: varlik ve
      // talep listeleri tazelenmeli.
      qc.invalidateQueries({ queryKey: ["assets"] });
      qc.invalidateQueries({ queryKey: ["reports"] });
    },
  });
}
