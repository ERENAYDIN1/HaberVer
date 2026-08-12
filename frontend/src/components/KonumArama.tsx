import { useEffect, useRef, useState } from "react";

import { IconPin, IconSearch, IconX } from "./icons";

interface NominatimSonuc {
  display_name: string;
  lat: string;
  lon: string;
}

interface KonumAramaProps {
  /** Bir sonuc secildiginde [longitude, latitude] ile cagrilir. */
  onSecildi: (konum: [number, number]) => void;
  /** Gorunen alan; sonuclar bu bolgeye onceliklendirilir (Nominatim viewbox). */
  gorunenAlan?: [[number, number], [number, number]] | null;
  /** Verilirse arama yalnizca bu alanla sinirlanir (bounded=1). */
  zorunluAlan?: [[number, number], [number, number]] | null;
  yerTutucu?: string;
  genislikSinifi?: string;
  /** Dar (mobil) yerlesim: sonuc listesi kutudan tasarak acilir. */
  dar?: boolean;
}

/** Nominatim uzerinden Turkiye'ye odakli konum arama kutusu. */
export default function KonumArama({
  onSecildi,
  gorunenAlan,
  zorunluAlan,
  yerTutucu = "Haritada ara (örn. Ayasofya)",
  genislikSinifi = "w-72",
  dar = false,
}: KonumAramaProps) {
  const [sorgu, setSorgu] = useState("");
  const [sonuclar, setSonuclar] = useState<NominatimSonuc[]>([]);
  const [aciklarKutu, setAciklarKutu] = useState(false);
  const [yukleniyor, setYukleniyor] = useState(false);
  const kutuRef = useRef<HTMLDivElement>(null);
  // Ref'te tutulur ki her harita hareketi aramayi yeniden tetiklemesin.
  const gorunenAlanRef = useRef(gorunenAlan);
  const zorunluAlanRef = useRef(zorunluAlan);
  useEffect(() => {
    gorunenAlanRef.current = gorunenAlan;
  }, [gorunenAlan]);
  useEffect(() => {
    zorunluAlanRef.current = zorunluAlan;
  }, [zorunluAlan]);

  useEffect(() => {
    const disariTikla = (e: MouseEvent) => {
      if (kutuRef.current && !kutuRef.current.contains(e.target as Node)) {
        setAciklarKutu(false);
      }
    };
    document.addEventListener("mousedown", disariTikla);
    return () => document.removeEventListener("mousedown", disariTikla);
  }, []);

  useEffect(() => {
    if (sorgu.trim().length < 3) {
      setSonuclar([]);
      return;
    }
    const denetleyici = new AbortController();
    setYukleniyor(true);
    const zamanlayici = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          format: "json",
          q: sorgu,
          countrycodes: "tr",
          limit: "6",
        });
        const zorunlu = zorunluAlanRef.current;
        const alan = zorunlu ?? gorunenAlanRef.current;
        if (alan) {
          // Sadelestirilmis sinir gercek sinirdan biraz icerde kalabildigi
          // icin kutuya kucuk bir pay eklenir.
          const pay = 0.01;
          const [[minLon, minLat], [maxLon, maxLat]] = alan;
          // Nominatim viewbox sirasi: sol,ust,sag,alt.
          params.set(
            "viewbox",
            `${minLon - pay},${maxLat + pay},${maxLon + pay},${minLat - pay}`
          );
          params.set("bounded", zorunlu ? "1" : "0");
        }
        const yanit = await fetch(
          `https://nominatim.openstreetmap.org/search?${params}`,
          { signal: denetleyici.signal }
        );
        const veri = (await yanit.json()) as NominatimSonuc[];
        setSonuclar(veri);
        setAciklarKutu(true);
      } catch {
        // Istek iptal edildiyse sessizce yoksay.
      } finally {
        setYukleniyor(false);
      }
    }, 400);

    return () => {
      clearTimeout(zamanlayici);
      denetleyici.abort();
    };
  }, [sorgu]);

  const sec = (sonuc: NominatimSonuc) => {
    onSecildi([Number(sonuc.lon), Number(sonuc.lat)]);
    setSorgu(sonuc.display_name.split(",")[0]);
    setAciklarKutu(false);
  };

  return (
    <div ref={kutuRef} className={`relative ${genislikSinifi}`}>
      <div
        className={`flex items-center rounded-full border bg-white/95 shadow-sm backdrop-blur transition-all ${
          dar ? "gap-1.5 pl-3 pr-1.5" : "gap-2 pl-4 pr-2"
        } ${
          aciklarKutu && (sonuclar.length > 0 || yukleniyor)
            ? "rounded-b-none border-slate-200 shadow-md"
            : "border-slate-200 hover:shadow-md focus-within:border-emerald-400 focus-within:shadow-md focus-within:ring-2 focus-within:ring-emerald-100"
        }`}
      >
        <IconSearch className="h-4 w-4 shrink-0 text-slate-400" />
        <input
          value={sorgu}
          onChange={(e) => setSorgu(e.target.value)}
          onFocus={() => sonuclar.length > 0 && setAciklarKutu(true)}
          placeholder={yerTutucu}
          className={`w-full min-w-0 border-none bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none ${
            dar ? "py-2" : "py-2.5"
          }`}
        />
        {sorgu ? (
          <button
            onClick={() => {
              setSorgu("");
              setSonuclar([]);
            }}
            aria-label="Aramayı temizle"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-red-500"
          >
            <IconX className="h-3.5 w-3.5" />
          </button>
        ) : (
          !dar && <span className="h-7 w-7 shrink-0" aria-hidden />
        )}
      </div>

      {aciklarKutu && (sonuclar.length > 0 || yukleniyor) && (
        <ul
          className={`absolute right-0 top-full z-30 max-h-80 overflow-y-auto border border-slate-200 bg-white py-1 shadow-xl ${
            dar
              ? "w-[76vw] max-w-xs rounded-2xl rounded-tr-none"
              : "left-0 rounded-b-2xl border-t-0"
          }`}
        >
          {yukleniyor && (
            <li className="flex items-center gap-2 px-4 py-3 text-xs text-slate-400">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-200 border-t-emerald-500" />
              Aranıyor…
            </li>
          )}
          {sonuclar.map((sonuc, i) => {
            const parcalar = sonuc.display_name.split(",");
            const baslik = parcalar[0].trim();
            const altBilgi = parcalar.slice(1).join(",").trim();
            return (
              <li key={i}>
                <button
                  onClick={() => sec(sonuc)}
                  className="flex w-full items-start gap-2.5 px-3 py-2 text-left transition hover:bg-emerald-50"
                >
                  <IconPin className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-700">
                      {baslik}
                    </span>
                    {altBilgi && (
                      <span className="block truncate text-xs text-slate-400">
                        {altBilgi}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
