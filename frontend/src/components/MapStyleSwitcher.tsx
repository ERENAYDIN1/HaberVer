import maplibregl from "maplibre-gl";
import { useEffect, useRef, useState } from "react";

import {
  HARITA_STILLERI,
  ONIZLEME_MERKEZI,
  type HaritaStilId,
} from "../data/mapStyles";

interface MapStyleSwitcherProps {
  aktifId: HaritaStilId;
  onSec: (id: HaritaStilId) => void;
}

export default function MapStyleSwitcher({
  aktifId,
  onSec,
}: MapStyleSwitcherProps) {
  const [acik, setAcik] = useState(false);
  const kutuRef = useRef<HTMLDivElement>(null);

  // Disariya tiklayinca kapat.
  useEffect(() => {
    if (!acik) return;
    const disariTikla = (e: MouseEvent) => {
      if (kutuRef.current && !kutuRef.current.contains(e.target as Node)) {
        setAcik(false);
      }
    };
    document.addEventListener("mousedown", disariTikla);
    return () => document.removeEventListener("mousedown", disariTikla);
  }, [acik]);

  const aktifStil = HARITA_STILLERI.find((s) => s.id === aktifId);

  return (
    <div ref={kutuRef} className="relative">
      <button
        onClick={() => setAcik((a) => !a)}
        title="Harita çeşidi"
        className="flex items-center gap-2 rounded-lg bg-white px-3 py-2.5 text-sm font-medium text-slate-700 shadow-lg ring-1 ring-black/5 transition hover:bg-slate-50"
      >
        <span aria-hidden>🗺️</span>
        {aktifStil?.etiket ?? "Harita"}
      </button>

      {acik && (
        <div className="absolute right-0 top-full mt-2 grid w-64 grid-cols-2 gap-2 rounded-lg bg-white p-3 shadow-xl ring-1 ring-black/5">
          {HARITA_STILLERI.map((stil) => (
            <button
              key={stil.id}
              onClick={() => {
                onSec(stil.id);
                setAcik(false);
              }}
              className={`flex flex-col items-center gap-1 rounded-md p-1.5 text-xs transition ${
                stil.id === aktifId
                  ? "bg-emerald-50 ring-2 ring-emerald-500"
                  : "hover:bg-slate-50"
              }`}
            >
              <div className="h-14 w-full overflow-hidden rounded border border-slate-200 bg-slate-100">
                {stil.onizleme.tip === "raster" ? (
                  <img
                    src={stil.onizleme.url}
                    alt={stil.etiket}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <MiniOnizleme stil={stil.stil} />
                )}
              </div>
              <span
                className={
                  stil.id === aktifId
                    ? "font-medium text-emerald-800"
                    : "text-slate-600"
                }
              >
                {stil.etiket}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Vektor stiller icin gercek, kucuk ve etkilesimsiz bir onizleme haritasi. */
function MiniOnizleme({ stil }: { stil: string | maplibregl.StyleSpecification }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const mini = new maplibregl.Map({
      container: containerRef.current,
      style: stil,
      center: ONIZLEME_MERKEZI,
      zoom: 12,
      interactive: false,
      attributionControl: false,
    });

    return () => mini.remove();
  }, [stil]);

  return <div ref={containerRef} className="h-full w-full" />;
}
