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
  /** Kenarlik kesikli mi cizilsin (varsayilan: evet).
   *
   *  Iki ayri sey ayni haritada duruyor: KESIKLI = ekibe atanmis gorev bolgesi
   *  ("burayi tara"), DUZ = isin kendisinin sekli ("catlak bu hat boyunca").
   *  Ayrimi renk tasiyamaz - bolgenin rengini personel seciyor. */
  kesikli?: boolean;
}

const ALAN_SOURCE_ID = "salt-okunur-alanlar";
const CIZIM_SOURCE_ID = "talep-cizimi";

/** Vatandasin elle cizdigi cizgi/alan.
 *
 *  Bilincli olarak `CizimPaneli`'nin tam arac setinden AYRI: orada renk paleti,
 *  cok alanli secim ve olcum modu var; vatandas formunda bunlarin hepsi
 *  gurultudur. Buradaki etkilesim tek cumleyle anlatilabilir - "tikladikca
 *  kose ekle". Ortak olan yalnizca `utils/geo.ts`'teki hesaplardir. */
export interface CizimAyari {
  tip: "LineString" | "Polygon";
  noktalar: [number, number][];
  onDegis: (noktalar: [number, number][]) => void;
  /** Cizim rengi (vatandas ekraninda tur grubunun rengi). */
  renk: string;
  /** Kullanici "Tamamla" dedi: sekil dondurulur - tiklama artik kose EKLEMEZ,
   *  fareyi izleyen onizleme parcalari cizilmez, alan kapali gosterilir.
   *  Cizimin bittigi bir an olmali; aksi halde formu doldururken haritaya
   *  degen her tiklama sekli sessizce buyutuyordu. */
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
  cizim,
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
  /** Cizim sirasinda son bilinen fare konumu: elastik cizgi ve anlik olcu
   *  bunun uzerinden hesaplanir. Fare haritadan cikinca null'a doner. */
  const sonFareRef = useRef<[number, number] | null>(null);
  /** Cizimin anlik olcusunu (m / m²) haritada gosteren DOM marker. */
  const olcuEtiketiRef = useRef<maplibregl.Marker | null>(null);
  const alanlarRef = useRef(alanlar);
  const onSecRef = useRef(onSec);
  const cizimRef = useRef(cizim);
  const tiklanabilirRef = useRef(tiklanabilir);
  useEffect(() => {
    onSecRef.current = onSec;
    tiklanabilirRef.current = tiklanabilir;
    alanlarRef.current = alanlar;
    cizimRef.current = cizim;
  });

  /** Cizim taslagini haritaya yazar.
   *
   *  Sekil, imlecin O ANDA durdugu yere kadar cizilmis gibi gosterilir
   *  (`CizimPaneli`'ndeki personel cizimiyle ayni dil): son koseden fareye
   *  uzanan elastik bir cizgi, alanlarda imlecten ilk koseye kesikli kapanis
   *  kenari ve fareyi de iceren canli dolgu onizlemesi. Halka KAPATILMAZ;
   *  "burasi henuz kapanmadi ama kapanacak" bilgisi duz bir kenarla
   *  anlatilamaz.
   *
   *  Fare bilinmiyorsa (dokunmatik cihaz, imlec haritanin disinda) sekil
   *  yalnizca gercek koselerden cizilir - elastik parca hicbir zaman
   *  gonderilecek veriye karismaz. */
  function cizimiUygula(map: maplibregl.Map) {
    const source = map.getSource(CIZIM_SOURCE_ID) as
      | maplibregl.GeoJSONSource
      | undefined;
    if (!source) return;

    const c = cizimRef.current;
    const noktalar = c?.noktalar ?? [];
    const renk = c?.renk ?? "#059669";
    const tamam = !!c?.tamamlandi;
    // Elastik uc yalnizca cizim baslamissa anlamlidir: tek nokta bile
    // konmadan fareyi izleyen bir cizgi "cizim basladi" yanilgisi verirdi.
    // Tamamlanmis sekilde hic cizilmez - artik eklenecek bir kose yok.
    const fare = c && !tamam && noktalar.length > 0 ? sonFareRef.current : null;
    const ozellik = { renk };
    const features: GeoJSON.Feature[] = [];

    // Tamamlanan alanin kapanis kenari da gercek kenardir: kesikli onizleme
    // yerine duz hatta doner.
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
      // Dolgu ve kapanis kenari fareyi de sayar: alanin nereye varacagi
      // tiklamadan once gorunur.
      const halka = fare ? [...noktalar, fare] : noktalar;
      if (halka.length >= 3) {
        features.push({
          type: "Feature",
          geometry: { type: "Polygon", coordinates: [[...halka, halka[0]]] },
          properties: ozellik,
        });
      }
      // Kapanis kenari yalnizca cizim SURERKEN kesikli bir onizlemedir;
      // tamamlanan alanda gercek hattin parcasi olarak yukarida cizildi.
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

  /** Cizimin anlik olcusu (cizgide uzunluk, alanda yuzolcum) haritanin
   *  uzerinde, seklin ustunde durur. Yan paneldeki sayiyla ayni degerdir ama
   *  kullanicinin gozu cizerken haritada: olcuyu okumak icin bakisini
   *  bolmemeli. */
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

    // CIZERKEN etiket IMLECI izler: uzun bir hatta orta nokta imlecin cok
    // gerisinde kalir ve buyuyen sayiyi okumak icin goz geriye kaymak zorunda
    // kalirdi. Cizim bitince (fare yok / tamamlandi) sekle geri oturur:
    // cizgide hattin ortasina, alanda agirlik merkezine.
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
      el.style.cssText =
        "pointer-events:none; background:rgba(15,23,42,0.85); color:#fff; " +
        "font:600 11px system-ui,-apple-system,sans-serif; padding:2px 7px; " +
        "border-radius:4px; white-space:nowrap;";
      olcuEtiketiRef.current = new maplibregl.Marker({
        element: el,
        // Imleci izlerken etiket imlecin sag-altinda durur: artı imlecin
        // ucunu ve bir sonraki tiklanacak yeri kapatmasin.
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
        // Kesikli ve duz kenarlik iki ayri katman: `line-dasharray` veriye
        // bagli bir ifade kabul etmiyor, ayrimi filtre tasiyor.
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

      // Cizim katmani en ustte: kullanicinin o an cizdigi sey, altindaki her
      // seyden once okunmali.
      if (!map.getSource(CIZIM_SOURCE_ID)) {
        map.addSource(CIZIM_SOURCE_ID, { type: "geojson", data: BOS_GEOJSON });
        map.addLayer({
          id: "cizim-fill",
          type: "fill",
          source: CIZIM_SOURCE_ID,
          filter: ["==", ["geometry-type"], "Polygon"],
          paint: { "fill-color": ["get", "renk"], "fill-opacity": 0.18 },
        });
        // Gercek hat: yalnizca kullanicinin tikladigi koseler. Onizleme
        // parcalari (elastik/kapanis) bilincli olarak DISARIDA - kalinlik ve
        // opaklik farki "bu kismi henuz onaylamadin"i anlatan tek isaret.
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
        // Son koseden fare imlecine uzanan elastik cizgi.
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
          // Personel konsoluyla ayni tutamak dili (`utils/haritaKatmanlari.ts`
          // ::cizimKatmanlari): kucuk, ici cizim rengiyle DOLU, ince beyaz
          // cerceveli. Iki ekranda ayni sey ayni gorunmeli.
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

    // Haritadaki konum butonu: bulunan konuma isaretci koyar.
    const geolocate = new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: false,
      showAccuracyCircle: false,
    });
    map.addControl(geolocate, "bottom-right");
    geolocate.on("geolocate", (e) => {
      const p = e as unknown as { coords: GeolocationCoordinates };
      const nokta: [number, number] = [
        Number(p.coords.longitude.toFixed(6)),
        Number(p.coords.latitude.toFixed(6)),
      ];
      // Cizim kipinde "konumum" bir kose ekler: kullanici cizgiyi/alani
      // durdugu yerden baslatabilsin.
      const c = cizimRef.current;
      if (c?.tamamlandi) return;
      if (c) {
        c.onDegis([...c.noktalar, nokta]);
        return;
      }
      onSecRef.current(nokta);
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

    // Fare hareketi cizimi canli tutar: React state'e dokunulmaz, yalnizca
    // kaynak yeniden yazilir (her piksel hareketinde render tetiklenmesin).
    map.on("mousemove", (e) => {
      if (!cizimRef.current) return;
      sonFareRef.current = [
        Number(e.lngLat.lng.toFixed(6)),
        Number(e.lngLat.lat.toFixed(6)),
      ];
      cizimiUygula(map);
    });
    // Imlec haritadan cikinca onizleme donar kalmasin.
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
      // Cizim kipindeyken tiklama kose EKLER; nokta secimi devre disidir.
      // Tamamlanmis sekilde tiklama hicbir sey yapmaz: sekil dondu, nokta
      // secimine de dusmemeli (talebin geometrisi cizim olarak kalir).
      const c = cizimRef.current;
      if (c?.tamamlandi) return;
      if (c) {
        c.onDegis([...c.noktalar, nokta]);
        return;
      }
      onSecRef.current(nokta);
    });

    // Temizlikte kullanilacak koleksiyon burada yakalanir (lint kurali).
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
    };
    // Harita bir kez kurulur; degisen degerler ref'lerle yonetilir.
  }, []);

  // Salt-okunur alanlar degisince katmani guncelle.
  useEffect(() => {
    const map = mapRef.current;
    if (map) alanlariUygula(map);
  }, [alanlar]);

  // Cizim taslagi degisince (kose eklendi/geri alindi/mod degisti) yeniden ciz.
  useEffect(() => {
    const map = mapRef.current;
    if (map) cizimiUygula(map);
  }, [cizim]);

  // Cizim kipinde imlec artiya doner: haritanin "simdi tiklanacak" oldugunu
  // metin okumadan anlatan tek isaret.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getCanvas().style.cursor = cizim && !cizim.tamamlandi ? "crosshair" : "";
  }, [cizim]);

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

  // Secili konum degisince isaretciyi guncelle. Cizim kipinde tek nokta
  // isaretcisi gizlenir: sekil zaten cizim katmaninda gorunuyor, iki ayri
  // "secili yer" gostergesi karisiklik yaratirdi.
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

  // Disaridan gelen ucus hedefine git.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ucus) return;
    map.flyTo({ center: ucus.merkez, zoom: ucus.zoom ?? 16, duration: 900 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ucus?.anahtar]);

  return <div ref={containerRef} className="h-full w-full" />;
}
