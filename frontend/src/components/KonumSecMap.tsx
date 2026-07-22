import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";

import { HARITA_STILLERI, VARSAYILAN_STIL } from "../data/mapStyles";

const ISTANBUL: [number, number] = [28.9784, 41.0082];

interface KonumSecMapProps {
  /** Secili konum ([lon, lat]) veya henuz secilmediyse null. */
  secili: [number, number] | null;
  onSec: (konum: [number, number]) => void;
  /** Disaridan (orn. "Konumumu kullan" butonu) harita bu hedefe ucar. `anahtar`
   *  her degistiginde tetiklenir. */
  ucus?: { anahtar: string; merkez: [number, number]; zoom?: number } | null;
}

/** Vatandas ihbari icin basit bir harita: tiklanan noktaya (ya da cihaz
 *  konumuna) tek bir isaretci koyar ve koordinati bildirir. */
export default function KonumSecMap({ secili, onSec, ucus }: KonumSecMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const onSecRef = useRef(onSec);
  useEffect(() => {
    onSecRef.current = onSec;
  });

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const stil = HARITA_STILLERI.find((s) => s.id === VARSAYILAN_STIL)!.stil;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: stil,
      center: ISTANBUL,
      zoom: 11,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl(), "bottom-right");

    // Cihaz konumu kontrolu (haritadaki buton): tiklanip konum bulundugunda
    // isaretciyi oraya koyar ve harita oraya merkezlenir.
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

    // Harita acilirken cihaz konumuna SADECE merkezlen (isaretci koyma); izin
    // verilmezse Istanbul'da kal. Boylece harita kullanicinin oldugu yerde acilir
    // ama konum secimini yine kullanici yapar.
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          map.jumpTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 15 }),
        () => {},
        { enableHighAccuracy: true, timeout: 8000 }
      );
    }

    map.on("click", (e) => {
      onSecRef.current([
        Number(e.lngLat.lng.toFixed(6)),
        Number(e.lngLat.lat.toFixed(6)),
      ]);
    });

    return () => {
      markerRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
  }, []);

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

  // Disaridan gelen ucus hedefine (orn. form butonu) haritayi ucur.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ucus) return;
    map.flyTo({ center: ucus.merkez, zoom: ucus.zoom ?? 16, duration: 900 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ucus?.anahtar]);

  return <div ref={containerRef} className="h-full w-full" />;
}
