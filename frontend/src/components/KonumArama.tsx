import { useEffect, useRef, useState } from "react";

import { IconSearch, IconX } from "./icons";

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
    <div ref={kutuRef} className="relative w-64">
      <div className="flex items-center border border-slate-300 bg-white px-2.5 focus-within:border-emerald-500">
        <IconSearch className="h-3.5 w-3.5 shrink-0 text-sky-500" />
        <input
          value={sorgu}
          onChange={(e) => setSorgu(e.target.value)}
          onFocus={() => sonuclar.length > 0 && setAciklarKutu(true)}
          placeholder="Konum ara (örn. Ayasofya)"
          className="w-full border-none px-2 py-1.5 text-sm focus:outline-none"
        />
        {sorgu && (
          <button
            onClick={() => {
              setSorgu("");
              setSonuclar([]);
            }}
            aria-label="Aramayı temizle"
            className="shrink-0 text-slate-400 hover:text-red-600"
          >
            <IconX className="h-3 w-3" />
          </button>
        )}
      </div>

      {aciklarKutu && (sonuclar.length > 0 || yukleniyor) && (
        <ul className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-y-auto border border-slate-300 bg-white shadow-lg">
          {yukleniyor && (
            <li className="px-3 py-2 text-xs text-slate-400">Aranıyor…</li>
          )}
          {sonuclar.map((sonuc, i) => (
            <li key={i}>
              <button
                onClick={() => sec(sonuc)}
                className="block w-full px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50"
              >
                {sonuc.display_name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
