import maplibregl from "maplibre-gl";
import { useEffect, useRef, useState } from "react";

import {
  HARITA_STILLERI,
  ONIZLEME_MERKEZI,
  type HaritaStilId,
} from "../data/mapStyles";
import { IconLayers } from "./icons";

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
        className={`flex items-center gap-1.5 border px-3 py-1.5 text-sm font-medium transition ${
          acik
            ? "border-slate-400 bg-slate-100 text-slate-900"
            : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
        }`}
      >
        <IconLayers className="h-3.5 w-3.5" />
        {aktifStil?.etiket ?? "Harita"}
        <span aria-hidden className="text-[10px] text-slate-400">▾</span>
      </button>

      {acik && (
        <div className="absolute right-0 top-full z-20 mt-1 grid w-64 grid-cols-2 gap-1.5 border border-slate-300 bg-white p-2">
          {HARITA_STILLERI.map((stil) => (
            <button
              key={stil.id}
              onClick={() => {
                onSec(stil.id);
                setAcik(false);
              }}
              className={`flex flex-col gap-1 border p-1 text-xs transition ${
                stil.id === aktifId
                  ? "border-emerald-600 bg-emerald-50"
                  : "border-transparent hover:bg-slate-50"
              }`}
            >
              <div className="relative h-14 w-full overflow-hidden border border-slate-200 bg-slate-100">
                {stil.onizleme.tip === "raster" ? (
                  <img
                    src={stil.onizleme.url}
                    alt={stil.etiket}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : stil.onizleme.tip === "raster-yigin" ? (
                  stil.onizleme.urls.map((url, i) => (
                    <img
                      key={url}
                      src={url}
                      alt={i === 0 ? stil.etiket : ""}
                      className="absolute inset-0 h-full w-full object-cover"
                      loading="lazy"
                    />
                  ))
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
