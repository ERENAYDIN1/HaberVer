import maplibregl from "maplibre-gl";
import { useEffect, useRef, useState } from "react";

import {
  HARITA_STILLERI,
  ONIZLEME_MERKEZI,
  type HaritaStilId,
  type HaritaStilTanimi,
} from "../data/mapStyles";
import { IconLayers } from "./icons";

interface MapStilKontroluProps {
  aktifId: HaritaStilId;
  onSec: (id: HaritaStilId) => void;
}

/** Haritanin sag-alt kosesinde, o an aktif stili kucuk bir onizlemeyle gosteren
 *  kare bir kart (Google Haritalar'daki harita turu kontrolune benzer). Tiklaninca
 *  butun stil secenekleri bir izgara halinde acilir; secim burada yapilir. */
export default function MapStilKontrolu({ aktifId, onSec }: MapStilKontroluProps) {
  const [acik, setAcik] = useState(false);
  const kutuRef = useRef<HTMLDivElement>(null);

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
    <div ref={kutuRef} className="absolute bottom-6 right-4 z-20">
      {acik && (
        <div className="absolute bottom-full right-0 z-20 mb-2 grid w-64 grid-cols-2 gap-1.5 rounded-xl border border-slate-300 bg-white p-2 shadow-xl">
          {HARITA_STILLERI.map((stil) => (
            <button
              key={stil.id}
              onClick={() => {
                onSec(stil.id);
                setAcik(false);
              }}
              className={`flex flex-col gap-1 rounded-lg border p-1 text-xs transition ${
                stil.id === aktifId
                  ? "border-emerald-600 bg-emerald-50"
                  : "border-transparent hover:bg-slate-50"
              }`}
            >
              <div className="relative h-14 w-full overflow-hidden rounded-md border border-slate-200 bg-slate-100">
                <Onizleme stil={stil} />
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

      <button
        onClick={() => setAcik((a) => !a)}
        title="Harita çeşidi"
        className="group relative block rounded-2xl bg-white p-1.5 shadow-[0_4px_16px_rgba(0,0,0,0.35)] ring-2 ring-emerald-500 transition hover:scale-105"
      >
        <div className="relative h-14 w-14 overflow-hidden rounded-lg">
          {aktifStil && <Onizleme stil={aktifStil} />}
          <span className="absolute inset-x-0 bottom-0 bg-black/60 py-0.5 text-[10px] font-medium text-white">
            {aktifStil?.etiket}
          </span>
        </div>

        <span className="absolute -left-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-white shadow-md ring-2 ring-white">
          <IconLayers className="h-3.5 w-3.5" />
        </span>
      </button>
    </div>
  );
}

/** Stil tanimina gore uygun onizlemeyi (statik gorsel ya da mini canli harita) gosterir. */
function Onizleme({ stil }: { stil: HaritaStilTanimi }) {
  if (stil.onizleme.tip === "raster") {
    return (
      <img
        src={stil.onizleme.url}
        alt={stil.etiket}
        className="h-full w-full object-cover"
        loading="lazy"
      />
    );
  }
  if (stil.onizleme.tip === "raster-yigin") {
    return (
      <>
        {stil.onizleme.urls.map((url, i) => (
          <img
            key={url}
            src={url}
            alt={i === 0 ? stil.etiket : ""}
            className="absolute inset-0 h-full w-full object-cover"
            loading="lazy"
          />
        ))}
      </>
    );
  }
  return <MiniOnizleme stil={stil.stil} />;
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
