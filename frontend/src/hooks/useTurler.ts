import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { createTur, deleteTur, listTurler, updateTur } from "../api/turler";
import { tipIkonlariniSifirla } from "../components/icons";
import { setTurSozlugu } from "../data/turSozlugu";
import type { TurUpdateInput } from "../types/tur";

/** Tur sozlugu.
 *
 *  Ikili beslenme bilincli: React tarafi bu hook'un verisini kullanir, React
 *  DISI tuketiciler (harita katmanlari, popup HTML'leri, CSV disa aktarma)
 *  `data/turSozlugu.ts`'teki senkron fonksiyonlari cagirir. Bu yuzden veri
 *  geldigi anda modul kaydi da yazilir - ve korumali ekranlar sozluk yuklenene
 *  kadar cizilmez (auth/RequireRole), boylece senkron okuyanlar hicbir zaman
 *  bos sozluk gormez.
 *
 *  Sozluk PRATIKTE DEGISMEZ veridir (bir belediye tur listesini gunde bir kez
 *  yeniden duzenlemez), uzun `staleTime` ile cekilir. */

const UZUN_SURE = 30 * 60 * 1000;

async function turleriGetirVeYaz() {
  const turler = await listTurler();
  setTurSozlugu(turler);
  // Bir turun glifi degismis olabilir; ikon onbellegi bayat kalmasin.
  tipIkonlariniSifirla();
  return turler;
}

export function useTurler() {
  return useQuery({
    queryKey: ["turler"],
    queryFn: turleriGetirVeYaz,
    staleTime: UZUN_SURE,
  });
}

/** Sozluk degisince kimin neyi gorebildigi ve haritanin nasil cizildigi
 *  degisir: varlik/talep listeleri ve departman eslemesi de tazelenir. */
function sozlukSonrasiTazele(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["turler"] });
  qc.invalidateQueries({ queryKey: ["departmanlar"] });
  qc.invalidateQueries({ queryKey: ["assets"] });
  qc.invalidateQueries({ queryKey: ["reports"] });
}

export function useTurEkle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createTur,
    onSuccess: () => sozlukSonrasiTazele(qc),
  });
}

export function useTurGuncelle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ kod, data }: { kod: string; data: TurUpdateInput }) =>
      updateTur(kod, data),
    onSuccess: () => sozlukSonrasiTazele(qc),
  });
}

export function useTurSil() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteTur,
    onSuccess: () => sozlukSonrasiTazele(qc),
  });
}
