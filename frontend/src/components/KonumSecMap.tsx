import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";

import { ilSiniri } from "../api/sinirlar";
import { HARITA_STILLERI, VARSAYILAN_STIL } from "../data/mapStyles";
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
  /** Verilirse isaretciye tiklaninca gosterilecek MapLibre popup icerigi (HTML).
   *  Icerik bizim urettigimiz guvenli HTML olmali (kullanici metni kacislanir). */
  popupHtml?: string;
}

interface KonumSecMapProps {
  /** Secili konum ([lon, lat]) veya henuz secilmediyse null. */
  secili: [number, number] | null;
  onSec: (konum: [number, number]) => void;
  /** Disaridan (orn. "Konumumu kullan" butonu) harita bu hedefe ucar. `anahtar`
   *  her degistiginde tetiklenir. */
  ucus?: { anahtar: string; merkez: [number, number]; zoom?: number } | null;
  /** Salt-okunur isaretler (orn. saha calisaninin gorev pinleri). */
  isaretler?: HaritaIsaret[];
  /** Kullanicinin kendi (canli) konumu - ayirt edici mavi nokta. */
  benimKonumum?: [number, number] | null;
  /** false ise haritaya tiklayarak konum secme kapatilir (salt goruntuleme). */
  tiklanabilir?: boolean;
}

/** Vatandas ihbari icin basit bir harita: tiklanan noktaya (ya da cihaz
 *  konumuna) tek bir isaretci koyar ve koordinati bildirir. Saha ekraninda
 *  ayni harita salt-okunur gorev pinleriyle (isaretler) yeniden kullanilir. */
export default function KonumSecMap({
  secili,
  onSec,
  ucus,
  isaretler,
  benimKonumum,
  tiklanabilir = true,
}: KonumSecMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const isaretMarkerRef = useRef<maplibregl.Marker[]>([]);
  const benimMarkerRef = useRef<maplibregl.Marker | null>(null);
  const onSecRef = useRef(onSec);
  const tiklanabilirRef = useRef(tiklanabilir);
  useEffect(() => {
    onSecRef.current = onSec;
    tiklanabilirRef.current = tiklanabilir;
  });

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

    // Istanbul il sinirini getirip maske katmanini doldurur - bkz.
    // utils/istanbulMaskesi.ts. Harita yuklenmesi ile sinir istegi
    // yarisabilecegi icin (hangisi once biterse) her iki taraf da hazir
    // olduklarinda ayni "uygula" fonksiyonunu cagirir.
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
    });
    ilSiniri(ISTANBUL_IL_KODU)
      .then((sinir) => {
        sinirHalkalari = sinir.noktalar;
        maskeUygula();
      })
      .catch(() => {
        // Sinir getirilemezse maske sessizce bos kalir, harita yine calisir.
      });

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
      if (!tiklanabilirRef.current) return;
      onSecRef.current([
        Number(e.lngLat.lng.toFixed(6)),
        Number(e.lngLat.lat.toFixed(6)),
      ]);
    });

    return () => {
      markerRef.current?.remove();
      isaretMarkerRef.current.forEach((m) => m.remove());
      benimMarkerRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Salt-okunur isaretler (gorev pinleri) - degisince yeniden kur.
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
          // anchor sabit: harita kaydirilirken popup karsi tarafa "atlamasin".
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

  // Kullanicinin kendi konumu - ayirt edici mavi nokta.
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

  // Disaridan gelen ucus hedefine (orn. form butonu) haritayi ucur.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ucus) return;
    map.flyTo({ center: ucus.merkez, zoom: ucus.zoom ?? 16, duration: 900 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ucus?.anahtar]);

  return <div ref={containerRef} className="h-full w-full" />;
}
