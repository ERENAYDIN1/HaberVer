import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { listReports } from "../api/reports";
import type { AssetFeature } from "../types/asset";
import {
  REPORT_STATUSES,
  ihbarGorunumu,
  type IhbarGorunumu,
  type ReportFeature,
  type ReportStatus,
} from "../types/report";
import { useAssets } from "./useAssets";

/** Ihbarlarin cekilmesi ve GORUNUME gore gruplanmasi.
 *
 *  Backend'in uc durumu (`beklemede`/`onaylandi`/`reddedildi`) arayuzde DORT
 *  gorunume ayrilir: onaylanmis bir ihbar, olusturdugu varlik tamir edilince
 *  "Tamir Edildi"ye duser. Bu ayrim tamamen frontend'de turetilir - ne yeni bir
 *  enum ne migration var (bkz. types/report.ts::ihbarGorunumu).
 *
 *  Tek hesap noktasi olmasi kritik: panel alt-sekmeleri, lejant alt-filtresi +
 *  sayaclari, harita katmani ve secim->sekme senkronu ayni gruplamayi okur. Uc
 *  yerde ayri ayri hesaplanirsa biri digerinden kayar. */

export interface OnayliEsleme {
  rapordanVarliga: Map<string, string>;
  varliktanRapora: Map<string, string>;
}

/** Onaylanmis ihbar <-> ondan olusan varlik eslesmesi (`created_asset_id`).
 *
 *  Ikisi AYRI id'lerdir, bu yuzden "İhbarlar > Onaylandı" sekmesinde haritadan
 *  bir ihbar secmek panelde hicbir satiri vurgulamiyordu (ve tersi) - harita
 *  ham ihbar noktasini, panel ondan olusan varligi gosteriyor. Secim
 *  callback'leri bu iki yonlu haritayla esi de birlikte secer. */
export function onayliEslemeKur(onaylananlar: readonly ReportFeature[]): OnayliEsleme {
  const rapordanVarliga = new Map<string, string>();
  const varliktanRapora = new Map<string, string>();
  for (const f of onaylananlar) {
    const varlikId = f.properties.created_asset_id;
    if (!varlikId) continue;
    rapordanVarliga.set(f.properties.id, varlikId);
    varliktanRapora.set(varlikId, f.properties.id);
  }
  return { rapordanVarliga, varliktanRapora };
}

/** Ihbarlari gorunume gore gruplar ve her kayda `properties.gorunum` yazar
 *  (harita pin rengi bunu okur).
 *
 *  `ihbardanDoganVarliklar` **undefined** ise varlik sorgusu henuz yuklenmemis
 *  demektir ve siniflama YAPILMAZ - aksi halde acilista her sey bir an "Tamir
 *  Edildi"ye dusup geri ziplıyordu. */
export function gorunumlereAyir(
  durumaGoreIhbarlar: Record<ReportStatus, readonly ReportFeature[] | undefined>,
  ihbardanDoganVarliklar: readonly AssetFeature[] | undefined
): Record<IhbarGorunumu, ReportFeature[]> {
  const varlikDurumu = new Map<string, "iyi" | "bakim_lazim">();
  for (const a of ihbardanDoganVarliklar ?? []) {
    varlikDurumu.set(a.properties.id, a.properties.status);
  }
  const varlikBilgisiVar = ihbardanDoganVarliklar !== undefined;
  const gruplar: Record<IhbarGorunumu, ReportFeature[]> = {
    onaylandi: [],
    tamir: [],
    beklemede: [],
    reddedildi: [],
  };
  for (const durum of REPORT_STATUSES) {
    for (const f of durumaGoreIhbarlar[durum] ?? []) {
      const g = ihbarGorunumu(
        f.properties.status,
        f.properties.created_asset_id
          ? varlikDurumu.get(f.properties.created_asset_id)
          : undefined,
        varlikBilgisiVar
      );
      gruplar[g].push({ ...f, properties: { ...f.properties, gorunum: g } });
    }
  }
  return gruplar;
}

export function useIhbarGorunumleri({ personel }: { personel: boolean }) {
  /** Onaylanmis ihbarlardan olusan varliklar. "İhbarlar > Onaylandı" sekmesi
   *  bunu kendi listesi olarak gosterir ve gorunum turetmesi de buna dayanir.
   *  Yalnizca o panele aittir: haritadaki VARLIK katmanini ve lejant
   *  sayaclarini ETKILEMEZ (ihbar alt-sekmesi degistikce varlik sayilarinin
   *  oynamasina yol aciyordu). */
  const ihbarVarlikSorgu = useAssets({ source: "ihbar" });

  // Ihbar katmani KAPALIYKEN de cekilir: lejanttaki rozet/alt-filtre sayaclari
  // katmanin acik olup olmamasindan bagimsiz olarak gercek toplami gostermeli
  // (eskiden katman kapaliyken bu ikisi hic cekilmedigi icin toplam eksik
  // gorunuyordu).
  const bekleyenIhbarSorgu = useQuery({
    queryKey: ["reports", "beklemede"],
    queryFn: () => listReports("beklemede"),
    enabled: personel,
  });
  const onaylananIhbarSorgu = useQuery({
    queryKey: ["reports", "onaylandi"],
    queryFn: () => listReports("onaylandi"),
    enabled: personel,
  });
  const reddedilenIhbarSorgu = useQuery({
    queryKey: ["reports", "reddedildi"],
    queryFn: () => listReports("reddedildi"),
    enabled: personel,
  });

  const onayliEsleme = useMemo(
    () => onayliEslemeKur(onaylananIhbarSorgu.data?.features ?? []),
    [onaylananIhbarSorgu.data]
  );

  const gorunumler = useMemo(
    () =>
      gorunumlereAyir(
        {
          beklemede: bekleyenIhbarSorgu.data?.features,
          onaylandi: onaylananIhbarSorgu.data?.features,
          reddedildi: reddedilenIhbarSorgu.data?.features,
        },
        ihbarVarlikSorgu.data?.features
      ),
    [
      bekleyenIhbarSorgu.data,
      onaylananIhbarSorgu.data,
      reddedilenIhbarSorgu.data,
      ihbarVarlikSorgu.data,
    ]
  );

  return {
    ihbarVarlikSorgu,
    bekleyenIhbarSorgu,
    onaylananIhbarSorgu,
    reddedilenIhbarSorgu,
    bekleyenIhbarSayisi: bekleyenIhbarSorgu.data?.features.length ?? 0,
    onayliEsleme,
    gorunumler,
  };
}
