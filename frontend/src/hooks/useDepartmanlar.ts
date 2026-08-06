import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createDepartman,
  deleteDepartman,
  getEsleme,
  listDepartmanlar,
  updateDepartman,
  updateEsleme,
} from "../api/departmanlar";
import type {
  DepartmanUpdateInput,
  TurDepartmanEslemesi,
} from "../types/departman";

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

/** Mudurluk/yonlendirme degisince kimin neyi gorebildigi de degisir: varlik,
 *  talep ve bolge listeleri tazelenmeli. */
function kapsamSonrasiTazele(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["departmanlar"] });
  qc.invalidateQueries({ queryKey: ["assets"] });
  qc.invalidateQueries({ queryKey: ["reports"] });
  qc.invalidateQueries({ queryKey: ["bolgeler"] });
}

export function useEslemeGuncelle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (esleme: TurDepartmanEslemesi) => updateEsleme(esleme),
    onSuccess: () => kapsamSonrasiTazele(qc),
  });
}

export function useDepartmanEkle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createDepartman,
    onSuccess: () => kapsamSonrasiTazele(qc),
  });
}

export function useDepartmanGuncelle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ kod, data }: { kod: string; data: DepartmanUpdateInput }) =>
      updateDepartman(kod, data),
    onSuccess: () => kapsamSonrasiTazele(qc),
  });
}

export function useDepartmanSil() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteDepartman,
    onSuccess: () => kapsamSonrasiTazele(qc),
  });
}
