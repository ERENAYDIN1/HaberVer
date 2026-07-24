import { useMemo, type ReactElement } from "react";

import { ASSET_TYPE_LABELS, ASSET_TYPES } from "../types/asset";
import type { AssetFeatureCollection, AssetType } from "../types/asset";
import { IconBench, IconLamp, IconTree, IconWarning } from "./icons";

/** Haritadaki isaretci renkleriyle birebir ayni palet (MapView TIP_RENGI_IFADESI). */
const TIP_RENGI: Record<AssetType, string> = {
  agac: "#059669",
  bank: "#d97706",
  direk: "#0284c7",
};

const TIP_IKONU: Record<AssetType, (p: { className?: string }) => ReactElement> = {
  agac: IconTree,
  bank: IconBench,
  direk: IconLamp,
};

interface HaritaLejantProps {
  /** O an haritada gosterilen varliklar; sayaclar bundan hesaplanir. */
  data?: AssetFeatureCollection;
}

/**
 * Haritanin ust-ortasinda yuzen kompakt aciklama seridi: her varlik turunun
 * rengi/ikonu + canli adedi, ayrica bakim bekleyen toplam. Marker renklerinin
 * ne anlama geldigini tek bakista okunur kilar (referans dashboard'daki ust serit).
 */
export default function HaritaLejant({ data }: HaritaLejantProps) {
  const { turSayilari, bakim, toplam } = useMemo(() => {
    const turSayilari: Record<string, number> = {};
    let bakim = 0;
    for (const f of data?.features ?? []) {
      const t = f.properties.type;
      turSayilari[t] = (turSayilari[t] ?? 0) + 1;
      if (f.properties.status === "bakim_lazim") bakim += 1;
    }
    return { turSayilari, bakim, toplam: data?.features.length ?? 0 };
  }, [data]);

  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center px-4">
      <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-slate-200/80 bg-white/90 px-2 py-1.5 shadow-lg shadow-slate-900/5 backdrop-blur-md">
        {ASSET_TYPES.map((tur) => {
          const Ikon = TIP_IKONU[tur];
          const renk = TIP_RENGI[tur];
          return (
            <div
              key={tur}
              className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-slate-700"
              title={ASSET_TYPE_LABELS[tur]}
            >
              <span
                className="flex h-5 w-5 items-center justify-center rounded-full ring-2 ring-white"
                style={{ backgroundColor: renk }}
              >
                <Ikon className="h-3 w-3 text-white" />
              </span>
              <span className="hidden sm:inline">{ASSET_TYPE_LABELS[tur]}</span>
              <span className="font-semibold tabular-nums text-slate-900">
                {(turSayilari[tur] ?? 0).toLocaleString("tr-TR")}
              </span>
            </div>
          );
        })}

        <span className="mx-0.5 h-5 w-px bg-slate-200" />

        <div
          className="flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700"
          title="Bakım bekleyen varlık"
        >
          <IconWarning className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Bakım</span>
          <span className="font-semibold tabular-nums">
            {bakim.toLocaleString("tr-TR")}
          </span>
        </div>

        <div className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-500">
          <span className="hidden md:inline">Toplam</span>
          <span className="font-semibold tabular-nums text-slate-900">
            {toplam.toLocaleString("tr-TR")}
          </span>
        </div>
      </div>
    </div>
  );
}
