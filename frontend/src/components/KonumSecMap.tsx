import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";

import { ilSiniri } from "../api/sinirlar";
import { HARITA_STILLERI, VARSAYILAN_STIL } from "../data/mapStyles";
import { cizgiOrtaNoktasi, enBuyukHalkaMerkezi } from "../utils/geo";
import { BOS_GEOJSON } from "../utils/geojson";
import { haritayaKapaliAttributionEkle } from "../utils/haritaAttribution";
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
  /** Alanin ustunde gosterilecek etiket (orn. bolge adi). */
  etiket?: string;
  cizgi?: boolean;
}

const ALAN_SOURCE_ID = "salt-okunur-alanlar";

interface KonumSecMapProps {
  /** Secili konum ([lon, lat]) veya henuz secilmediyse null. */
  secili: [number, number] | null;
  onSec: (konum: [number, number]) => void;
  /** Harita bu hedefe ucar; `anahtar` her degistiginde tetiklenir. */
  ucus?: { anahtar: string; merkez: [number, number]; zoom?: number } | null;
  /** Salt-okunur isaretler (orn. saha calisaninin gorev pinleri). */
  isaretler?: HaritaIsaret[];
  /** Salt-okunur alanlar/cizgiler (orn. ekibe atanmis gorev bolgesi). */
  alanlar?: HaritaAlani[];
  /** Kullanicinin kendi (canli) konumu - ayirt edici mavi nokta. */
  benimKonumum?: [number, number] | null;
  /** false ise haritaya tiklayarak konum secme kapatilir (salt goruntuleme). */
  tiklanabilir?: boolean;
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
        properties: { renk: a.renk },
      })),
    });

    const guncel = new Set<string>();
    for (const a of liste) {
      if (!a.etiket) continue;
      guncel.add(a.id);
      // Guzergah etiketi hattin uzunlugunun ortasina konur: nokta ortalamasi
      // kavisli bir hatta cizginin hic gecmedigi bir yere duserdi.
      const merkez = a.cizgi
        ? cizgiOrtaNoktasi(a.noktalar[0])
        : enBuyukHalkaMerkezi(a.noktalar);
      let marker = alanEtiketleriRef.current.get(a.id);
      if (!marker) {
        const el = document.createElement("div");
        el.style.cssText =
          "pointer-events:none; background:rgba(15,23,42,0.85); color:#fff; " +
          "font:600 11px system-ui,-apple-system,sans-serif; padding:2px 7px; " +
          "border-radius:4px; white-space:nowrap;";
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
    map.addControl(new maplibregl.NavigationControl(), "bottom-right");
    haritayaKapaliAttributionEkle(map);

    // Il sinirini getirip maskeyi doldurur. Harita yuklenmesi ile sinir istegi
    // yarisabildigi icin iki taraf da hazir olunca ayni fonksiyon cagrilir.
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

      // Alan/cizgi katmani maskeden sonra eklenir ki maske onu ortmesin.
      if (!map.getSource(ALAN_SOURCE_ID)) {
        map.addSource(ALAN_SOURCE_ID, { type: "geojson", data: BOS_GEOJSON });
        map.addLayer({
          id: "salt-alan-fill",
          type: "fill",
          source: ALAN_SOURCE_ID,
          filter: ["!=", ["geometry-type"], "LineString"],
          paint: { "fill-color": ["get", "renk"], "fill-opacity": 0.14 },
        });
        map.addLayer({
          id: "salt-alan-yol",
          type: "line",
          source: ALAN_SOURCE_ID,
          paint: {
            "line-color": ["get", "renk"],
            "line-width": 2.5,
            "line-dasharray": [3, 2],
          },
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

    // Haritadaki konum butonu: bulunan konuma isaretci koyar.
    const geolocate = new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: false,
      showAccuracyCircle: false,
    });
    map.addControl(geolocate, "bottom-right");
    geolocate.on("geolocate", (e) => {
      const p = e as unknown as { coords: GeolocationCoordinates };
      onSecRef.current([
        Number(p.coords.longitude.toFixed(6)),
        Number(p.coords.latitude.toFixed(6)),
      ]);
    });

    // Acilista cihaz konumuna yalnizca merkezlenir, isaretci konmaz; izin
    // verilmezse Istanbul merkezinde kalir.
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

    // Temizlikte kullanilacak koleksiyon burada yakalanir (lint kurali).
    const alanEtiketleri = alanEtiketleriRef.current;
    return () => {
      markerRef.current?.remove();
      isaretMarkerRef.current.forEach((m) => m.remove());
      benimMarkerRef.current?.remove();
      for (const m of alanEtiketleri.values()) m.remove();
      alanEtiketleri.clear();
      map.remove();
      mapRef.current = null;
    };
    // Harita bir kez kurulur; degisen degerler ref'lerle yonetilir.
  }, []);

  // Salt-okunur alanlar degisince katmani guncelle.
  useEffect(() => {
    const map = mapRef.current;
    if (map) alanlariUygula(map);
  }, [alanlar]);

  // Salt-okunur isaretler (gorev pinleri) degisince yeniden kurulur.
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
          // Sabit anchor: harita kaydirilirken popup karsi tarafa atlamasin.
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

  // Kullanicinin kendi konumu: ayirt edici mavi nokta.
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

  // Secili konum degisince isaretciyi guncelle.
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

  // Disaridan gelen ucus hedefine git.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ucus) return;
    map.flyTo({ center: ucus.merkez, zoom: ucus.zoom ?? 16, duration: 900 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ucus?.anahtar]);

  return <div ref={containerRef} className="h-full w-full" />;
}
