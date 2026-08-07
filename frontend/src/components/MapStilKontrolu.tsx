import maplibregl from "maplibre-gl";
import { useEffect, useRef, useState } from "react";

import {
  HARITA_STILLERI,
  ONIZLEME_MERKEZI,
  ONIZLEME_ZOOM,
  onizlemeZoomu,
  type HaritaStilId,
  type HaritaStilTanimi,
} from "../data/mapStyles";
import { IconLayers } from "./icons";

interface MapStilKontroluProps {
  aktifId: HaritaStilId;
  onSec: (id: HaritaStilId) => void;
  /** Ana harita. Verilirse onizlemeler onun kadrajini canli takip eder. */
  harita?: maplibregl.Map | null;
  /** Mobil: sag-alttaki yuzen kart yerine yalnizca stil izgarasi cizilir
   *  (katman sheet'inin icinde durur). */
  gomulu?: boolean;
}

/** Haritanin sag-alt kosesinde, o an aktif stili kucuk bir onizlemeyle gosteren
 *  kare bir kart (Google Haritalar'daki harita turu kontrolune benzer). Tiklaninca
 *  butun stil secenekleri bir izgara halinde acilir; secim burada yapilir. */
export default function MapStilKontrolu({
  aktifId,
  onSec,
  harita,
  gomulu,
}: MapStilKontroluProps) {
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

  const izgara = (
    <div className="grid grid-cols-2 gap-2">
      {HARITA_STILLERI.map((stil) => (
        <button
          key={stil.id}
          onClick={() => {
            onSec(stil.id);
            setAcik(false);
          }}
          className="group text-left"
        >
          <div
            className={`relative h-20 w-full overflow-hidden rounded-lg bg-slate-100 ring-1 transition ${
              stil.id === aktifId
                ? "ring-2 ring-emerald-500"
                : "ring-slate-200 group-hover:ring-slate-400"
            }`}
          >
            <Onizleme stil={stil} harita={harita} />
          </div>
          <span
            className={`mt-1.5 block truncate text-xs transition ${
              stil.id === aktifId
                ? "font-semibold text-emerald-700"
                : "text-slate-600 group-hover:text-slate-900"
            }`}
          >
            {stil.etiket}
          </span>
        </button>
      ))}
    </div>
  );

  if (gomulu) return izgara;

  return (
    <div ref={kutuRef} className="absolute bottom-6 right-4 z-20">
      {acik && (
        <div className="absolute bottom-full right-0 z-20 mb-3 w-80 rounded-2xl border border-slate-200/80 bg-white/95 p-3 shadow-[0_12px_32px_-8px_rgba(15,23,42,0.35)] backdrop-blur">
          <p className="mb-2 px-0.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Harita çeşidi
          </p>
          {izgara}
        </div>
      )}

      <button
        onClick={() => setAcik((a) => !a)}
        title="Harita çeşidi"
        aria-expanded={acik}
        className="group block rounded-xl bg-white/90 p-1 shadow-[0_6px_20px_-6px_rgba(15,23,42,0.45)] ring-1 ring-slate-900/10 backdrop-blur transition hover:ring-slate-900/25"
      >
        <div className="relative h-20 w-20 overflow-hidden rounded-lg">
          {aktifStil && <Onizleme stil={aktifStil} harita={harita} />}
          <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-900/85 via-slate-900/45 to-transparent pt-3">
            <span className="flex items-center justify-center gap-1 pb-1 text-[10px] font-medium text-white">
              <IconLayers className="h-3 w-3" />
              <span className="truncate">{aktifStil?.etiket}</span>
            </span>
          </span>
        </div>
      </button>
    </div>
  );
}

/** Etkilesimsiz mini onizleme haritasi. Ana harita verilirse onun kadrajini
 *  canli takip eder (OSM'deki gibi: kullanici nereye bakiyorsa onizleme de
 *  orayi gosterir), yoksa sabit `ONIZLEME_MERKEZI`'ne duser.
 *
 *  Senkron `move` uzerinden ve dogrudan `jumpTo` ile yapilir: React state'e
 *  yazilsaydi surukleme boyunca her karede yeniden render tetiklenirdi.
 *  Bu bileşen yalnizca panel acikken bes kez, kapaliyken bir kez mount olur —
 *  yani kapali durumdaki surekli yuk tek bir 80x80 haritadir. */
function Onizleme({
  stil,
  harita,
}: {
  stil: HaritaStilTanimi;
  harita?: maplibregl.Map | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const mini = new maplibregl.Map({
      container: containerRef.current,
      style: stil.stil,
      center: harita ? harita.getCenter() : ONIZLEME_MERKEZI,
      zoom: harita ? onizlemeZoomu(harita.getZoom()) : ONIZLEME_ZOOM,
      interactive: false,
      attributionControl: false,
    });

    if (!harita) return () => mini.remove();

    // 80x80'lik kutuda ana haritanin zoom'u tek bir sokak parcasi gosterirdi;
    // birkac kademe geri cekilince onizleme "neresi" sorusunu cevaplar.
    const senkron = () => {
      mini.jumpTo({ center: harita.getCenter(), zoom: onizlemeZoomu(harita.getZoom()) });
    };
    harita.on("move", senkron);
    return () => {
      harita.off("move", senkron);
      mini.remove();
    };
  }, [stil, harita]);

  return <div ref={containerRef} className="h-full w-full" />;
}
