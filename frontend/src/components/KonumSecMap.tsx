import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";

import { ilSiniri } from "../api/sinirlar";
import { HARITA_STILLERI, VARSAYILAN_STIL } from "../data/mapStyles";
import { cizgiOrtaNoktasi, enBuyukHalkaMerkezi } from "../utils/geo";
import { BOS_GEOJSON } from "../utils/geojson";
import {
  ISTANBUL_IL_KODU,
  ISTANBUL_MERKEZI,
  ISTANBUL_SINIRLARI,
  istanbulMaskesiUygula,
  maskeKaynagiHazirla,
} from "../utils/istanbulMaskesi";

/** Haritada gosterilecek salt-okunur bir isaret (orn. saha gorev pini). */
export interface HaritaIsaret {
  id: string;
  lng: number;
  lat: number;
  renk: string;
  onClick?: () => void;
  /** Isaretciye tiklaninca acilacak popup icerigi; kullanici metni kacislanmis
   *  olmali (bkz. utils/html.ts). */
  popupHtml?: string;
}

/** Salt-okunur alan/cizgi (orn. ekibe atanmis gorev bolgesi). `noktalar`
 *  halka listesidir, cizgide tek elemanli. */
export interface HaritaAlani {
  id: string;
  noktalar: [number, number][][];
  renk: string;
  etiket?: string;
  cizgi?: boolean;
  /** Kenarlik kesikli mi cizilsin (varsayilan: evet): KESIKLI = ekibe atanmis
   *  gorev bolgesi, DUZ = isin kendi sekli. */
  kesikli?: boolean;
}

const ALAN_SOURCE_ID = "salt-okunur-alanlar";

/** Alan/guzergah etiketleri bu zoom'un altinda hic cizilmez (personel
 *  konsolundaki `MapView::BOLGE_ETIKET_MINZOOM` ile ayni kural). Esik orada
 *  13, burada bir tik daha erken: saha ekrani haritayi dar bir panelde ve
 *  daha uzaktan gosteriyor, ekip kendi bolgesinin adini once gormeli. */
const ALAN_ETIKET_MINZOOM = 12.5;

interface KonumSecMapProps {
  /** Secili konum ([lon, lat]) veya henuz secilmediyse null. */
  secili: [number, number] | null;
  onSec: (konum: [number, number]) => void;
  /** Harita bu hedefe ucar; `anahtar` her degistiginde tetiklenir. */
  ucus?: { anahtar: string; merkez: [number, number]; zoom?: number } | null;
  isaretler?: HaritaIsaret[];
  alanlar?: HaritaAlani[];
  /** Kullanicinin kendi (canli) konumu - ayirt edici mavi nokta. */
  benimKonumum?: [number, number] | null;
  /** false ise haritaya tiklayarak konum secme kapatilir (salt goruntuleme). */
  tiklanabilir?: boolean;
  /** "Konumumu goster" dugmesi haritanin kendi kosesinde mi dursun, yoksa
   *  gizlenip ebeveyn kendi dugmesini mi cizsin. Gizli kipte tetikleme
   *  `konumRef` ile yapilir. */
  konumDugmesi?: "harita" | "gizli";
  konumRef?: React.MutableRefObject<(() => void) | null>;
}

/** Basit harita: tiklanan noktaya tek bir isaretci koyup koordinati bildirir.
 *  Saha ekraninda ayni harita salt-okunur gorev pinleriyle kullanilir. */
export default function KonumSecMap({
  secili,
  onSec,
  ucus,
  isaretler,
  alanlar,
  benimKonumum,
  tiklanabilir = true,
  konumDugmesi = "harita",
  konumRef,
}: KonumSecMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const isaretMarkerRef = useRef<maplibregl.Marker[]>([]);
  const benimMarkerRef = useRef<maplibregl.Marker | null>(null);
  const alanEtiketleriRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const alanlarRef = useRef(alanlar);
  const onSecRef = useRef(onSec);
  const tiklanabilirRef = useRef(tiklanabilir);
  const konumDugmesiRef = useRef(konumDugmesi);
  useEffect(() => {
    onSecRef.current = onSec;
    tiklanabilirRef.current = tiklanabilir;
    alanlarRef.current = alanlar;
  });

  /** Salt-okunur alanlari/cizgileri haritaya uygular (kaynak hazirsa). */
  function alanlariUygula(map: maplibregl.Map) {
    const source = map.getSource(ALAN_SOURCE_ID) as
      | maplibregl.GeoJSONSource
      | undefined;
    if (!source) return;

    const liste = alanlarRef.current ?? [];
    source.setData({
      type: "FeatureCollection",
      features: liste.map((a) => ({
        type: "Feature",
        geometry: a.cizgi
          ? { type: "LineString", coordinates: a.noktalar[0] }
          : a.noktalar.length === 1
            ? { type: "Polygon", coordinates: [[...a.noktalar[0], a.noktalar[0][0]]] }
            : {
                type: "MultiPolygon",
                coordinates: a.noktalar.map((h) => [[...h, h[0]]]),
              },
        properties: { renk: a.renk, kesikli: a.kesikli !== false },
      })),
    });

    const guncel = new Set<string>();
    const etiketGorunur = map.getZoom() >= ALAN_ETIKET_MINZOOM;
    for (const a of liste) {
      if (!a.etiket || !etiketGorunur) continue;
      guncel.add(a.id);
      // Guzergah etiketi hattin uzunlugunun ortasina konur (nokta ortalamasi
      // kavisli hatta yanlis yere duserdi).
      const merkez = a.cizgi
        ? cizgiOrtaNoktasi(a.noktalar[0])
        : enBuyukHalkaMerkezi(a.noktalar);
      let marker = alanEtiketleriRef.current.get(a.id);
      if (!marker) {
        const el = document.createElement("div");
        el.className = "harita-etiket";
        marker = new maplibregl.Marker({
          element: el,
          anchor: a.cizgi ? "bottom" : "center",
          offset: a.cizgi ? [0, -5] : [0, 0],
        })
          .setLngLat(merkez)
          .addTo(map);
        alanEtiketleriRef.current.set(a.id, marker);
      } else {
        marker.setLngLat(merkez);
      }
      marker.getElement().style.borderLeft = `3px solid ${a.renk}`;
      marker.getElement().textContent = a.etiket;
    }
    for (const [id, marker] of alanEtiketleriRef.current) {
      if (!guncel.has(id)) {
        marker.remove();
        alanEtiketleriRef.current.delete(id);
      }
    }
  }

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const stil = HARITA_STILLERI.find((s) => s.id === VARSAYILAN_STIL)!.stil;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: stil,
      center: ISTANBUL_MERKEZI,
      zoom: 11,
      maxBounds: ISTANBUL_SINIRLARI,
      attributionControl: false,
    });
    mapRef.current = map;

    // Il sinirini getirip maskeyi doldurur; harita ve sinir istegi yarisabilir,
    // ikisi de hazir olunca ayni fonksiyon cagrilir.
    let sinirHalkalari: [number, number][][] | null = null;
    let stilYuklendi = false;
    const maskeUygula = () => {
      if (!stilYuklendi) return;
      istanbulMaskesiUygula(map, sinirHalkalari);
    };

    map.on("load", () => {
      maskeKaynagiHazirla(map);
      stilYuklendi = true;
      maskeUygula();

      // Maskeden sonra eklenir ki maske onu ortmesin.
      if (!map.getSource(ALAN_SOURCE_ID)) {
        map.addSource(ALAN_SOURCE_ID, { type: "geojson", data: BOS_GEOJSON });
        map.addLayer({
          id: "salt-alan-fill",
          type: "fill",
          source: ALAN_SOURCE_ID,
          filter: ["!=", ["geometry-type"], "LineString"],
          paint: { "fill-color": ["get", "renk"], "fill-opacity": 0.14 },
        });
        // Kesikli/duz iki ayri katman: `line-dasharray` veriye bagli ifade
        // kabul etmiyor.
        map.addLayer({
          id: "salt-alan-yol",
          type: "line",
          source: ALAN_SOURCE_ID,
          filter: ["to-boolean", ["get", "kesikli"]],
          paint: {
            "line-color": ["get", "renk"],
            "line-width": 2.5,
            "line-dasharray": [3, 2],
          },
        });
        map.addLayer({
          id: "salt-alan-yol-duz",
          type: "line",
          source: ALAN_SOURCE_ID,
          filter: ["!", ["to-boolean", ["get", "kesikli"]]],
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": ["get", "renk"], "line-width": 3.5 },
        });
      }

      alanlariUygula(map);
    });
    ilSiniri(ISTANBUL_IL_KODU)
      .then((sinir) => {
        sinirHalkalari = sinir.noktalar;
        maskeUygula();
      })
      .catch(() => {
        // Sinir gelmezse maske bos kalir, harita yine calisir.
      });

    // Gizli kipte kontrol yine kurulur ama haritanin kosesine eklenmez;
    // ebeveyn `konumRef` ile tetikler.
    const geolocate = new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: false,
      showAccuracyCircle: false,
    });
    map.addControl(geolocate, "bottom-right");
    if (konumDugmesiRef.current === "gizli") {
      map.getContainer()
        .querySelector(".maplibregl-ctrl-geolocate")
        ?.closest(".maplibregl-ctrl-group")
        ?.classList.add("hidden");
    }
    if (konumRef) konumRef.current = () => geolocate.trigger();

    map.on("zoomend", () => alanlariUygula(map));
    geolocate.on("geolocate", (e) => {
      const p = e as unknown as { coords: GeolocationCoordinates };
      const nokta: [number, number] = [
        Number(p.coords.longitude.toFixed(6)),
        Number(p.coords.latitude.toFixed(6)),
      ];
      // Salt-okunur haritada dugme yalnizca konuma ucar, isaretci koymaz.
      if (!tiklanabilirRef.current) return;
      onSecRef.current(nokta);
    });

    // Acilista cihaz konumuna yalnizca merkezlenir; izin verilmezse Istanbul
    // merkezinde kalir.
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          map.jumpTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 15 }),
        () => {},
        { enableHighAccuracy: true, timeout: 8000 }
      );
    }

    map.on("click", (e) => {
      if (!tiklanabilirRef.current) return;
      onSecRef.current([
        Number(e.lngLat.lng.toFixed(6)),
        Number(e.lngLat.lat.toFixed(6)),
      ]);
    });

    const alanEtiketleri = alanEtiketleriRef.current;
    return () => {
      markerRef.current?.remove();
      isaretMarkerRef.current.forEach((m) => m.remove());
      benimMarkerRef.current?.remove();
      for (const m of alanEtiketleri.values()) m.remove();
      alanEtiketleri.clear();
      map.remove();
      mapRef.current = null;
      if (konumRef) konumRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (map) alanlariUygula(map);
  }, [alanlar]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    isaretMarkerRef.current.forEach((m) => m.remove());
    isaretMarkerRef.current = (isaretler ?? []).map((i) => {
      const marker = new maplibregl.Marker({ color: i.renk })
        .setLngLat([i.lng, i.lat])
        .addTo(map);
      if (i.popupHtml) {
        marker.setPopup(
          new maplibregl.Popup({
            offset: 24,
            closeButton: true,
            anchor: "bottom",
          }).setHTML(i.popupHtml)
        );
        marker.getElement().style.cursor = "pointer";
      }
      if (i.onClick) {
        const el = marker.getElement();
        el.style.cursor = "pointer";
        el.addEventListener("click", (ev) => {
          ev.stopPropagation();
          i.onClick!();
        });
      }
      return marker;
    });
  }, [isaretler]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!benimKonumum) {
      benimMarkerRef.current?.remove();
      benimMarkerRef.current = null;
      return;
    }
    if (!benimMarkerRef.current) {
      const el = document.createElement("div");
      el.style.cssText =
        "width:16px;height:16px;border-radius:9999px;background:#2563eb;" +
        "border:3px solid #fff;box-shadow:0 0 0 2px rgba(37,99,235,.4)";
      el.title = "Konumunuz";
      benimMarkerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat(benimKonumum)
        .addTo(map);
    } else {
      benimMarkerRef.current.setLngLat(benimKonumum);
    }
  }, [benimKonumum]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!secili) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    if (!markerRef.current) {
      markerRef.current = new maplibregl.Marker({ color: "#059669" })
        .setLngLat(secili)
        .addTo(map);
    } else {
      markerRef.current.setLngLat(secili);
    }
  }, [secili]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ucus) return;
    map.flyTo({ center: ucus.merkez, zoom: ucus.zoom ?? 16, duration: 900 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ucus?.anahtar]);

  return <div ref={containerRef} className="konum-sec-harita h-full w-full" />;
}
