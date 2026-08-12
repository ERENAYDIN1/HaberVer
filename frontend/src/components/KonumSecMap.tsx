import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";

import { ilSiniri } from "../api/sinirlar";
import { HARITA_STILLERI, VARSAYILAN_STIL } from "../data/mapStyles";
import {
  alanEtiketi,
  cizgiOrtaNoktasi,
  enBuyukHalkaMerkezi,
  mesafeEtiketi,
  poligonAlaniM2,
  poligonMerkezi,
  toplamMesafeMetre,
} from "../utils/geo";
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
const CIZIM_SOURCE_ID = "talep-cizimi";

/** Alan/guzergah etiketleri bu zoom'un altinda hic cizilmez (personel
 *  konsolundaki `MapView::BOLGE_ETIKET_MINZOOM` ile ayni kural). Esik orada
 *  13, burada bir tik daha erken: saha ekrani haritayi dar bir panelde ve
 *  daha uzaktan gosteriyor, ekip kendi bolgesinin adini once gormeli. */
const ALAN_ETIKET_MINZOOM = 12.5;

/** Vatandasin elle cizdigi cizgi/alan. `CizimPaneli`'nin tam arac setinden
 *  bilincli olarak AYRI (renk paleti, cok alanli secim, olcum modu yok) -
 *  ortak olan yalnizca `utils/geo.ts`'teki hesaplardir. */
export interface CizimAyari {
  tip: "LineString" | "Polygon";
  noktalar: [number, number][];
  onDegis: (noktalar: [number, number][]) => void;
  /** Cizim rengi (vatandas ekraninda tur grubunun rengi). */
  renk: string;
  /** Kullanici "Tamamla" dedi: sekil dondurulur, tiklama artik kose eklemez. */
  tamamlandi?: boolean;
}

interface KonumSecMapProps {
  /** Secili konum ([lon, lat]) veya henuz secilmediyse null. */
  secili: [number, number] | null;
  onSec: (konum: [number, number]) => void;
  /** Verilirse harita NOKTA SECME yerine cizim kipine gecer. */
  cizim?: CizimAyari | null;
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
  cizim,
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
  /** Cizim sirasinda son bilinen fare konumu: elastik cizgi ve anlik olcu
   *  bundan hesaplanir. */
  const sonFareRef = useRef<[number, number] | null>(null);
  /** Cizimin anlik olcusunu (m / m²) haritada gosteren DOM marker. */
  const olcuEtiketiRef = useRef<maplibregl.Marker | null>(null);
  const alanlarRef = useRef(alanlar);
  const onSecRef = useRef(onSec);
  const cizimRef = useRef(cizim);
  const tiklanabilirRef = useRef(tiklanabilir);
  const konumDugmesiRef = useRef(konumDugmesi);
  useEffect(() => {
    onSecRef.current = onSec;
    tiklanabilirRef.current = tiklanabilir;
    alanlarRef.current = alanlar;
    cizimRef.current = cizim;
  });

  /** Cizim taslagini haritaya yazar: son koseden fareye uzanan elastik
   *  cizgi, alanlarda imleci de iceren canli dolgu onizlemesi. Elastik parca
   *  hicbir zaman gonderilecek veriye karismaz. */
  function cizimiUygula(map: maplibregl.Map) {
    const source = map.getSource(CIZIM_SOURCE_ID) as
      | maplibregl.GeoJSONSource
      | undefined;
    if (!source) return;

    const c = cizimRef.current;
    const noktalar = c?.noktalar ?? [];
    const renk = c?.renk ?? "#059669";
    const tamam = !!c?.tamamlandi;
    // Elastik uc yalnizca en az bir kose konduktan sonra ve tamamlanmamis
    // sekilde cizilir.
    const fare = c && !tamam && noktalar.length > 0 ? sonFareRef.current : null;
    const ozellik = { renk };
    const features: GeoJSON.Feature[] = [];

    // Tamamlanan alanin kapanis kenari duz hatta doner.
    const hat =
      tamam && c?.tip === "Polygon" && noktalar.length >= 3
        ? [...noktalar, noktalar[0]]
        : noktalar;
    if (hat.length >= 2) {
      features.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates: hat },
        properties: ozellik,
      });
    }
    if (fare) {
      features.push({
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: [noktalar[noktalar.length - 1], fare],
        },
        properties: { ...ozellik, elastik: true },
      });
    }

    if (c?.tip === "Polygon") {
      // Dolgu ve kapanis kenari fareyi de sayar.
      const halka = fare ? [...noktalar, fare] : noktalar;
      if (halka.length >= 3) {
        features.push({
          type: "Feature",
          geometry: { type: "Polygon", coordinates: [[...halka, halka[0]]] },
          properties: ozellik,
        });
      }
      // Tamamlanan alanda kapanis kenari gercek hattin parcasi olarak
      // yukarida zaten cizildi.
      if (!tamam && halka.length >= 2) {
        features.push({
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: [halka[halka.length - 1], halka[0]],
          },
          properties: { ...ozellik, kapanis: true },
        });
      }
    }

    for (const [i, n] of noktalar.entries()) {
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: n },
        properties: { ...ozellik, sira: i + 1 },
      });
    }
    source.setData({ type: "FeatureCollection", features });
    olcuEtiketiUygula(map);
  }

  /** Cizimin anlik olcusunu (cizgide uzunluk, alanda yuzolcum) haritanin
   *  uzerinde gosterir; kullanicinin gozu cizerken haritada kalsin diye. */
  function olcuEtiketiUygula(map: maplibregl.Map) {
    const c = cizimRef.current;
    const noktalar = c?.noktalar ?? [];
    const fare =
      c && !c.tamamlandi && noktalar.length > 0 ? sonFareRef.current : null;
    const izlenen = fare ? [...noktalar, fare] : noktalar;

    const cizgi = c?.tip === "LineString";
    const yeter = cizgi ? izlenen.length >= 2 : izlenen.length >= 3;
    if (!c || !yeter) {
      olcuEtiketiRef.current?.remove();
      olcuEtiketiRef.current = null;
      return;
    }

    const metin = cizgi
      ? mesafeEtiketi(toplamMesafeMetre(izlenen))
      : alanEtiketi(poligonAlaniM2(izlenen));

    // Cizerken etiket imleci izler (uzun hatta orta nokta cok geride
    // kalirdi); cizim bitince sekle geri oturur.
    const kip = fare ? "imlec" : cizgi ? "cizgi" : "alan";
    const konum = fare
      ? fare
      : cizgi
        ? cizgiOrtaNoktasi(izlenen)
        : poligonMerkezi(izlenen);

    // Anchor/offset marker'a kurulusta verilir; kip degisince yeniden kurulur.
    if (olcuEtiketiRef.current?.getElement().dataset.kip !== kip) {
      olcuEtiketiRef.current?.remove();
      const el = document.createElement("div");
      el.dataset.kip = kip;
      // Ana haritadaki etiketlerle ayni sinif (bkz. index.css `.harita-etiket`).
      el.className = "harita-etiket";
      olcuEtiketiRef.current = new maplibregl.Marker({
        element: el,
        // Imleci izlerken sag-altta durur ki artının ucunu kapatmasin.
        anchor: kip === "imlec" ? "top-left" : cizgi ? "bottom" : "center",
        offset: kip === "imlec" ? [14, 12] : cizgi ? [0, -6] : [0, 0],
      })
        .setLngLat(konum)
        .addTo(map);
    } else {
      olcuEtiketiRef.current.setLngLat(konum);
    }
    olcuEtiketiRef.current.getElement().textContent = metin;
  }

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

      // Cizim katmani en ustte.
      if (!map.getSource(CIZIM_SOURCE_ID)) {
        map.addSource(CIZIM_SOURCE_ID, { type: "geojson", data: BOS_GEOJSON });
        map.addLayer({
          id: "cizim-fill",
          type: "fill",
          source: CIZIM_SOURCE_ID,
          filter: ["==", ["geometry-type"], "Polygon"],
          paint: { "fill-color": ["get", "renk"], "fill-opacity": 0.18 },
        });
        // Gercek hat: yalnizca tiklanmis koseler (elastik/kapanis onizlemesi
        // disarida, kalinlik farkiyla ayrisir).
        map.addLayer({
          id: "cizim-yol",
          type: "line",
          source: CIZIM_SOURCE_ID,
          filter: [
            "all",
            ["==", ["geometry-type"], "LineString"],
            ["!", ["to-boolean", ["get", "kapanis"]]],
            ["!", ["to-boolean", ["get", "elastik"]]],
          ],
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": ["get", "renk"], "line-width": 3 },
        });
        map.addLayer({
          id: "cizim-elastik",
          type: "line",
          source: CIZIM_SOURCE_ID,
          filter: ["to-boolean", ["get", "elastik"]],
          layout: { "line-cap": "round" },
          paint: {
            "line-color": ["get", "renk"],
            "line-width": 2,
            "line-opacity": 0.85,
          },
        });
        map.addLayer({
          id: "cizim-kapanis",
          type: "line",
          source: CIZIM_SOURCE_ID,
          filter: ["to-boolean", ["get", "kapanis"]],
          paint: {
            "line-color": ["get", "renk"],
            "line-width": 2,
            "line-dasharray": [2, 2],
            "line-opacity": 0.7,
          },
        });
        map.addLayer({
          id: "cizim-nokta",
          type: "circle",
          source: CIZIM_SOURCE_ID,
          filter: ["==", ["geometry-type"], "Point"],
          // Personel konsoluyla ayni tutamak dili (haritaKatmanlari.ts::cizimKatmanlari).
          paint: {
            "circle-radius": 5,
            "circle-color": ["get", "renk"],
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 2,
          },
        });
      }

      alanlariUygula(map);
      cizimiUygula(map);
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
      // Cizim kipinde "konumum" bir kose ekler.
      const c = cizimRef.current;
      if (c?.tamamlandi) return;
      if (c) {
        c.onDegis([...c.noktalar, nokta]);
        return;
      }
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

    // React state'e dokunulmaz; her piksel hareketinde render tetiklenmesin.
    map.on("mousemove", (e) => {
      if (!cizimRef.current) return;
      sonFareRef.current = [
        Number(e.lngLat.lng.toFixed(6)),
        Number(e.lngLat.lat.toFixed(6)),
      ];
      cizimiUygula(map);
    });
    map.on("mouseout", () => {
      if (!sonFareRef.current) return;
      sonFareRef.current = null;
      cizimiUygula(map);
    });

    map.on("click", (e) => {
      if (!tiklanabilirRef.current) return;
      const nokta: [number, number] = [
        Number(e.lngLat.lng.toFixed(6)),
        Number(e.lngLat.lat.toFixed(6)),
      ];
      // Cizim kipindeyken tiklama kose ekler; tamamlanmis sekilde hicbir
      // sey yapmaz.
      const c = cizimRef.current;
      if (c?.tamamlandi) return;
      if (c) {
        c.onDegis([...c.noktalar, nokta]);
        return;
      }
      onSecRef.current(nokta);
    });

    const alanEtiketleri = alanEtiketleriRef.current;
    return () => {
      markerRef.current?.remove();
      isaretMarkerRef.current.forEach((m) => m.remove());
      benimMarkerRef.current?.remove();
      olcuEtiketiRef.current?.remove();
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
    if (map) cizimiUygula(map);
  }, [cizim]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getCanvas().style.cursor = cizim && !cizim.tamamlandi ? "crosshair" : "";
  }, [cizim]);

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

  // Cizim kipinde tek nokta isaretcisi gizlenir: sekil zaten cizim
  // katmaninda gorunuyor.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!secili || cizim) {
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
  }, [secili, cizim]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ucus) return;
    map.flyTo({ center: ucus.merkez, zoom: ucus.zoom ?? 16, duration: 900 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ucus?.anahtar]);

  return <div ref={containerRef} className="konum-sec-harita h-full w-full" />;
}
