import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { alanTamponu } from "../api/geo";
import { updateReportGeometry } from "../api/reports";
import type { BolgeTipi, SekilDuzenleme } from "../types/bolge";
import { TALEP_DURUM_RENGI } from "../types/report";
import type { ReportFeature, TalepGeometrisi } from "../types/report";
import { halkalariAc } from "../utils/geo";

/** Bekleyen/onaylanmis bir TALEBIN ham seklini (cizgi/alan) harita uzerinde
 *  duzenler - vatandas yanlis cizmis olabilir. Aynen kaydedilmis bolge/
 *  guzergah duzenlemesiyle ayni mekanizmayi (MapView'in `sekilDuzenleme`/
 *  `onSekilDegis` proplari, `BolgeSekilPaneli`) paylasir; taslak burada
 *  `SekilDuzenleme` sekline cevrilip "Kaydet"e kadar backend'e yazilmaz.
 *  Nokta (Point) talepler kapsam disidir - tek koordinati "sekil" olarak
 *  duzenlemenin bir anlami yok, konum vatandasin isaretledigi yerdir. */

function geojsonTipiBolgeTipine(tip: TalepGeometrisi["type"]): BolgeTipi {
  return tip === "LineString" ? "cizgi" : "alan";
}

function raporNoktalari(report: ReportFeature): [number, number][][] {
  const g = report.geometry;
  if (g.type === "LineString") return [g.coordinates];
  if (g.type === "Polygon") return halkalariAc(g.coordinates);
  return [];
}

function geometriUret(
  tip: TalepGeometrisi["type"],
  noktalar: [number, number][][]
): TalepGeometrisi {
  if (tip === "LineString") {
    return { type: "LineString", coordinates: noktalar[0] ?? [] };
  }
  return { type: "Polygon", coordinates: noktalar };
}

export function sekilDegistiMi(
  taslak: (SekilDuzenleme & { geojsonTipi: TalepGeometrisi["type"] }) | null,
  kayitli: ReportFeature | undefined
): boolean {
  if (!taslak) return false;
  if (!kayitli) return true;
  return (
    JSON.stringify(raporNoktalari(kayitli)) !== JSON.stringify(taslak.noktalar)
  );
}

export interface TalepSekilDuzenlemeSecenekleri {
  /** Su an haritada gosterilen talepler; "degisti mi" karsilastirmasi icin. */
  talepler: ReportFeature[];
  raporaGit: (report: ReportFeature) => void;
  /** Duzenleme baslarken cagrilir; cizim/olcum/bolge sekli ayni paneli paylasir. */
  onBaslarken: () => void;
  onKaydedildi?: () => void;
}

export function useTalepSekilDuzenleme({
  talepler,
  raporaGit,
  onBaslarken,
  onKaydedildi,
}: TalepSekilDuzenlemeSecenekleri) {
  const [duzenleme, setDuzenleme] = useState<
    (SekilDuzenleme & { geojsonTipi: TalepGeometrisi["type"] }) | null
  >(null);
  const [hata, setHata] = useState<string | null>(null);
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [genisletiliyor, setGenisletiliyor] = useState(false);
  const gecmisRef = useRef<[number, number][][][]>([]);
  const [gecmisUzunlugu, setGecmisUzunlugu] = useState(0);
  const duzenlemeRef = useRef(duzenleme);
  duzenlemeRef.current = duzenleme;

  const raporaGitRef = useRef(raporaGit);
  const onBaslarkenRef = useRef(onBaslarken);
  useEffect(() => {
    raporaGitRef.current = raporaGit;
    onBaslarkenRef.current = onBaslarken;
  });

  const baslat = useCallback((report: ReportFeature) => {
    onBaslarkenRef.current();
    setHata(null);
    gecmisRef.current = [];
    setGecmisUzunlugu(0);
    const geojsonTipi = report.geometry.type;
    setDuzenleme({
      id: report.properties.id,
      ad: report.properties.name,
      tip: geojsonTipiBolgeTipine(geojsonTipi),
      renk: TALEP_DURUM_RENGI[report.properties.gorunum ?? "beklemede"],
      noktalar: raporNoktalari(report),
      geojsonTipi,
    });
    raporaGitRef.current(report);
  }, []);

  const kapat = useCallback(() => {
    setDuzenleme(null);
    setHata(null);
    gecmisRef.current = [];
    setGecmisUzunlugu(0);
  }, []);

  const degisti = useCallback((noktalar: [number, number][][]) => {
    if (!duzenlemeRef.current) return;
    gecmisRef.current.push(duzenlemeRef.current.noktalar);
    setGecmisUzunlugu(gecmisRef.current.length);
    setDuzenleme((s) => (s ? { ...s, noktalar } : s));
  }, []);

  const kayitliTalep = useMemo(
    () => talepler.find((t) => t.properties.id === duzenleme?.id),
    [talepler, duzenleme?.id]
  );

  const geriAl = useCallback(() => {
    const onceki = gecmisRef.current.pop();
    if (!onceki) return;
    setGecmisUzunlugu(gecmisRef.current.length);
    setHata(null);
    setDuzenleme((s) => (s ? { ...s, noktalar: onceki } : s));
  }, []);

  const sekliSifirla = useCallback(() => {
    if (!kayitliTalep) return;
    setHata(null);
    gecmisRef.current = [];
    setGecmisUzunlugu(0);
    setDuzenleme((s) => (s ? { ...s, noktalar: raporNoktalari(kayitliTalep) } : s));
  }, [kayitliTalep]);

  const kaydet = useCallback(async () => {
    if (!duzenleme) return;
    setKaydediliyor(true);
    setHata(null);
    try {
      await updateReportGeometry(
        duzenleme.id,
        geometriUret(duzenleme.geojsonTipi, duzenleme.noktalar)
      );
      onKaydedildi?.();
      setDuzenleme(null);
    } catch (e) {
      setHata((e as Error).message);
    } finally {
      setKaydediliyor(false);
    }
  }, [duzenleme, onKaydedildi]);

  /** Yalnizca ALAN (Polygon) taleplerde anlamli; cizgide gosterilmez. */
  const genislet = useCallback(
    async (mesafeM: number) => {
      if (!duzenleme || duzenleme.tip !== "alan") return;
      setGenisletiliyor(true);
      setHata(null);
      try {
        const sonuc = await alanTamponu(duzenleme.noktalar, mesafeM);
        gecmisRef.current.push(duzenleme.noktalar);
        setGecmisUzunlugu(gecmisRef.current.length);
        setDuzenleme((s) =>
          s ? { ...s, noktalar: halkalariAc(sonuc.noktalar) } : s
        );
      } catch (e) {
        setHata((e as Error).message);
      } finally {
        setGenisletiliyor(false);
      }
    },
    [duzenleme]
  );

  const degismis = useMemo(
    () => sekilDegistiMi(duzenleme, kayitliTalep),
    [duzenleme, kayitliTalep]
  );

  return {
    duzenleme,
    hata,
    kaydediliyor,
    genisletiliyor,
    degismis,
    geriAlinabilir: gecmisUzunlugu > 0,
    baslat,
    kapat,
    degisti,
    geriAl,
    sekliSifirla,
    kaydet,
    genislet,
  };
}
