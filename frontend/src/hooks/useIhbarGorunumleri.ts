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

/** Ihbarlarin cekilmesi ve gorunume gore gruplanmasi.
 *
 *  Backend'in uc durumu arayuzde dort gorunume ayrilir: onaylanmis bir ihbar,
 *  varligi tamir edilince "Tamir Edildi"ye duser. Ayrim tamamen frontend'de
 *  turetilir (bkz. types/report.ts::ihbarGorunumu).
 *
 *  Tek hesap noktasi olmasi onemli: panel sekmeleri, lejant sayaclari, harita
 *  katmani ve secim senkronu ayni gruplamayi okur. */

export interface OnayliEsleme {
  rapordanVarliga: Map<string, string>;
  varliktanRapora: Map<string, string>;
}

/** Onaylanmis ihbar <-> ondan olusan varlik eslesmesi (`created_asset_id`).
 *  Ikisi ayri id'ler oldugu icin secim callback'leri esi de birlikte secer;
 *  yoksa haritadan ihbar secmek panelde hicbir satiri vurgulamazdi. */
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

/** Ihbarlari gorunume gore gruplar ve her kayda `properties.gorunum` yazar.
 *  `ihbardanDoganVarliklar` undefined ise (sorgu henuz yuklenmedi) siniflama
 *  yapilmaz, yoksa acilista her sey bir an "Tamir Edildi"ye duserdi.
 *
 *  Onaylanmis bir ihbarin KONUMU da olusan varliktan alinir: personel varligin
 *  koordinatini duzeltince (vatandas yanlis yere isaretlemis olabilir) harita
 *  isaretcisi de tasinmali. Ham ihbar noktasi veritabaninda oldugu gibi kalir,
 *  yalnizca gosterim isin guncel yerini izler. */
export function gorunumlereAyir(
  durumaGoreIhbarlar: Record<ReportStatus, readonly ReportFeature[] | undefined>,
  ihbardanDoganVarliklar: readonly AssetFeature[] | undefined
): Record<IhbarGorunumu, ReportFeature[]> {
  const varlikDurumu = new Map<string, "iyi" | "bakim_lazim">();
  const varlikKonumu = new Map<string, AssetFeature["geometry"]>();
  for (const a of ihbardanDoganVarliklar ?? []) {
    varlikDurumu.set(a.properties.id, a.properties.status);
    varlikKonumu.set(a.properties.id, a.geometry);
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
      const varlikId = f.properties.created_asset_id;
      const g = ihbarGorunumu(
        f.properties.status,
        varlikId ? varlikDurumu.get(varlikId) : undefined,
        varlikBilgisiVar
      );
      const konum = varlikId ? varlikKonumu.get(varlikId) : undefined;
      gruplar[g].push({
        ...f,
        geometry: konum ?? f.geometry,
        properties: { ...f.properties, gorunum: g },
      });
    }
  }
  return gruplar;
}

export function useIhbarGorunumleri({ personel }: { personel: boolean }) {
  /** Ihbardan olusan varliklar; gorunum turetmesi buna dayanir. Yalnizca ihbar
   *  paneline aittir, haritadaki varlik katmanini etkilemez. */
  const ihbarVarlikSorgu = useAssets({ source: "ihbar" });

  // Ihbar katmani kapaliyken de cekilir: lejant sayaclari katmanin acik olup
  // olmamasindan bagimsiz olarak gercek toplami gostermeli.
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
