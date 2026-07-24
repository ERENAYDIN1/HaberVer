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
  /** Haritada o an gorunen alan ([[minLon,minLat],[maxLon,maxLat]]); verilirse
   *  arama sonuclari bu bolgeye onceliklendirilir (Nominatim viewbox). Bu olmadan
   *  "cami"/"camii" gibi genel kelimeler Turkiye'nin herhangi bir yerinden,
   *  ekranda gorunenle hicbir ilgisi olmayan sonuclar dondurebiliyor. */
  gorunenAlan?: [[number, number], [number, number]] | null;
  /** Verilirse arama SADECE bu alanla sinirlanir (sert kisitlama, Nominatim
   *  bounded=1) - orn. secili il/ilce siniri. gorunenAlan'dan onceliklidir. */
  zorunluAlan?: [[number, number], [number, number]] | null;
}

/** OpenStreetMap Nominatim'in ucretsiz, API anahtari gerektirmeyen genel arama
 *  ucu uzerinden Turkiye'ye odakli konum arama kutusu. */
export default function KonumArama({
  onSecildi,
  gorunenAlan,
  zorunluAlan,
}: KonumAramaProps) {
  const [sorgu, setSorgu] = useState("");
  const [sonuclar, setSonuclar] = useState<NominatimSonuc[]>([]);
  const [aciklarKutu, setAciklarKutu] = useState(false);
  const [yukleniyor, setYukleniyor] = useState(false);
  const kutuRef = useRef<HTMLDivElement>(null);
  // Aramanin kendisini her harita hareketinde yeniden tetiklememesi icin ref'te
  // tutulur; sadece bir sonraki arama isteginde okunur.
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
          // Sinir kutusuna kucuk bir pay eklenir: sadelestirilmis sinir verisi
          // gercek sinirdan biraz icerde kalabiliyor, kenardaki yerler kaybolmasin.
          const pay = 0.01;
          const [[minLon, minLat], [maxLon, maxLat]] = alan;
          // Nominatim viewbox sirasi: sol,ust,sag,alt (minLon,maxLat,maxLon,minLat).
          params.set(
            "viewbox",
            `${minLon - pay},${maxLat + pay},${maxLon + pay},${minLat - pay}`
          );
          // Zorunlu (il/ilce secili) alanlarda sert kisitlama (bounded=1);
          // sadece haritanin gorunen alanina gore ise yumusak oncelik (bounded=0).
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
        // Istek iptal edildiyse (yeni yazim) sessizce yoksay.
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
    <div ref={kutuRef} className="relative w-72">
      <div
        className={`flex items-center gap-2 rounded-full border bg-white/95 pl-4 pr-2 shadow-sm backdrop-blur transition-all ${
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
          placeholder="Haritada ara (örn. Ayasofya)"
          className="w-full border-none bg-transparent py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none"
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
          <span className="h-7 w-7 shrink-0" aria-hidden />
        )}
      </div>

      {aciklarKutu && (sonuclar.length > 0 || yukleniyor) && (
        <ul className="absolute left-0 right-0 top-full z-30 max-h-80 overflow-y-auto rounded-b-2xl border border-t-0 border-slate-200 bg-white py-1 shadow-xl">
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
