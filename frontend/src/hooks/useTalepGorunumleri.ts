import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { listReports } from "../api/reports";
import type { AssetFeature } from "../types/asset";
import {
  REPORT_STATUSES,
  talepGorunumu,
  type TalepGorunumu,
  type ReportFeature,
  type ReportStatus,
} from "../types/report";
import { useAssets } from "./useAssets";

/** Taleplerin cekilmesi ve gorunume gore gruplanmasi.
 *
 *  Backend'in uc durumu arayuzde dort gorunume ayrilir: onaylanmis bir talep,
 *  varligi tamir edilince "Tamir Edildi"ye duser. Ayrim tamamen frontend'de
 *  turetilir (bkz. types/report.ts::talepGorunumu).
 *
 *  Tek hesap noktasi olmasi onemli: panel sekmeleri, lejant sayaclari, harita
 *  katmani ve secim senkronu ayni gruplamayi okur. */

export interface OnayliEsleme {
  rapordanVarliga: Map<string, string>;
  varliktanRapora: Map<string, string>;
}

/** Onaylanmis talep <-> ondan olusan varlik eslesmesi (`created_asset_id`).
 *  Ikisi ayri id'ler oldugu icin secim callback'leri esi de birlikte secer;
 *  yoksa haritadan talep secmek panelde hicbir satiri vurgulamazdi. */
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

/** Talepleri gorunume gore gruplar ve her kayda `properties.gorunum` yazar.
 *  `taleptenDoganVarliklar` undefined ise (sorgu henuz yuklenmedi) siniflama
 *  yapilmaz, yoksa acilista her sey bir an "Tamir Edildi"ye duserdi.
 *
 *  Onaylanmis bir talebin KONUMU da olusan varliktan alinir: personel varligin
 *  koordinatini duzeltince (vatandas yanlis yere isaretlemis olabilir) harita
 *  isaretcisi de tasinmali. Ham talep noktasi veritabaninda oldugu gibi kalir,
 *  yalnizca gosterim isin guncel yerini izler. **Yalnizca `properties.nokta`
 *  (pinin oturdugu yer) degistirilir, `geometry` DEGIL** - `geometry`
 *  vatandasin gonderdigi kaydin kendisidir ve bir belge olarak durur. */
export function gorunumlereAyir(
  durumaGoreTalepler: Record<ReportStatus, readonly ReportFeature[] | undefined>,
  taleptenDoganVarliklar: readonly AssetFeature[] | undefined
): Record<TalepGorunumu, ReportFeature[]> {
  const varlikDurumu = new Map<string, "iyi" | "bakim_lazim">();
  const varlikKonumu = new Map<string, [number, number]>();
  for (const a of taleptenDoganVarliklar ?? []) {
    varlikDurumu.set(a.properties.id, a.properties.status);
    if (a.geometry.type === "Point") {
      varlikKonumu.set(a.properties.id, a.geometry.coordinates as [number, number]);
    }
  }
  const varlikBilgisiVar = taleptenDoganVarliklar !== undefined;
  const gruplar: Record<TalepGorunumu, ReportFeature[]> = {
    onaylandi: [],
    tamir: [],
    beklemede: [],
    reddedildi: [],
  };
  for (const durum of REPORT_STATUSES) {
    for (const f of durumaGoreTalepler[durum] ?? []) {
      const varlikId = f.properties.created_asset_id;
      const g = talepGorunumu(
        f.properties.status,
        varlikId ? varlikDurumu.get(varlikId) : undefined,
        varlikBilgisiVar
      );
      const konum = varlikId ? varlikKonumu.get(varlikId) : undefined;
      gruplar[g].push({
        ...f,
        properties: { ...f.properties, gorunum: g, nokta: konum ?? f.properties.nokta },
      });
    }
  }
  return gruplar;
}

export function useTalepGorunumleri({ personel }: { personel: boolean }) {
  /** Talepten olusan varliklar; gorunum turetmesi buna dayanir. Yalnizca talep
   *  paneline aittir, haritadaki varlik katmanini etkilemez. */
  const talepVarlikSorgu = useAssets({ source: "ihbar" });

  // Talep katmani kapaliyken de cekilir: lejant sayaclari katmanin acik olup
  // olmamasindan bagimsiz olarak gercek toplami gostermeli.
  const bekleyenTalepSorgu = useQuery({
    queryKey: ["reports", "beklemede"],
    queryFn: () => listReports("beklemede"),
    enabled: personel,
  });
  const onaylananTalepSorgu = useQuery({
    queryKey: ["reports", "onaylandi"],
    queryFn: () => listReports("onaylandi"),
    enabled: personel,
  });
  const reddedilenTalepSorgu = useQuery({
    queryKey: ["reports", "reddedildi"],
    queryFn: () => listReports("reddedildi"),
    enabled: personel,
  });

  const onayliEsleme = useMemo(
    () => onayliEslemeKur(onaylananTalepSorgu.data?.features ?? []),
    [onaylananTalepSorgu.data]
  );

  const gorunumler = useMemo(
    () =>
      gorunumlereAyir(
        {
          beklemede: bekleyenTalepSorgu.data?.features,
          onaylandi: onaylananTalepSorgu.data?.features,
          reddedildi: reddedilenTalepSorgu.data?.features,
        },
        talepVarlikSorgu.data?.features
      ),
    [
      bekleyenTalepSorgu.data,
      onaylananTalepSorgu.data,
      reddedilenTalepSorgu.data,
      talepVarlikSorgu.data,
    ]
  );

  return {
    talepVarlikSorgu,
    bekleyenTalepSorgu,
    onaylananTalepSorgu,
    reddedilenTalepSorgu,
    bekleyenTalepSayisi: bekleyenTalepSorgu.data?.features.length ?? 0,
    onayliEsleme,
    gorunumler,
  };
}
