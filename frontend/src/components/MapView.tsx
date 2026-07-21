import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";

import { HARITA_STILLERI, type HaritaStilId } from "../data/mapStyles";
import { ASSET_STATUS_LABELS, ASSET_TYPE_LABELS } from "../types/asset";
import type { AssetFeature, AssetFeatureCollection } from "../types/asset";
import MapStyleSwitcher from "./MapStyleSwitcher";

const ANKARA: [number, number] = [32.8597, 39.9334];
const SOURCE_ID = "assets";
const CIZIM_SOURCE_ID = "cizim";
const VARSAYILAN_STIL: HaritaStilId = "yol";

const BOS_KOLEKSIYON: AssetFeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

const BOS_GEOJSON = {
  type: "FeatureCollection",
  features: [],
} as unknown as GeoJSON.FeatureCollection;

interface MapViewProps {
  assets?: AssetFeatureCollection;
  /** Panelde/haritada secili varligin id'si. */
  seciliId: string | null;
  /** Haritadaki bir noktaya tiklaninca. */
  onVarlikSec: (id: string) => void;
  /** Bos bir alana tiklaninca (koordinati forma doldurmak icin). */
  onHaritaTikla: (koordinat: { longitude: number; latitude: number }) => void;
  /** Alan secim modu acikken tiklamalar poligon kosesi olarak toplanir. */
  cizimModu: boolean;
  cizimNoktalari: [number, number][];
  onCizimNokta: (nokta: [number, number]) => void;
}

export default function MapView({
  assets,
  seciliId,
  onVarlikSec,
  onHaritaTikla,
  cizimModu,
  cizimNoktalari,
  onCizimNokta,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const hazirRef = useRef(false);

  const [aktifStilId, setAktifStilId] = useState<HaritaStilId>(VARSAYILAN_STIL);

  // Callback'leri ve degisen degerleri ref'te tutariz; boylece harita bir kez
  // kurulur ve harita stili degistiginde de en guncel veriyi yeniden uygulayabiliriz.
  const onVarlikSecRef = useRef(onVarlikSec);
  const onHaritaTiklaRef = useRef(onHaritaTikla);
  const onCizimNoktaRef = useRef(onCizimNokta);
  const cizimModuRef = useRef(cizimModu);
  const assetsRef = useRef(assets);
  const cizimNoktalariRef = useRef(cizimNoktalari);
  const seciliIdRef = useRef(seciliId);
  useEffect(() => {
    onVarlikSecRef.current = onVarlikSec;
    onHaritaTiklaRef.current = onHaritaTikla;
    onCizimNoktaRef.current = onCizimNokta;
    cizimModuRef.current = cizimModu;
    assetsRef.current = assets;
    cizimNoktalariRef.current = cizimNoktalari;
    seciliIdRef.current = seciliId;
  });

  // Layer-scoped click/hover callback'leri sabit referans olarak tutulur ki
  // stil degisiminde map.off/map.on ile guvenle yeniden baglanabilsin.
  const assetsTiklandiRef = useRef((e: maplibregl.MapLayerMouseEvent) => {
    if (cizimModuRef.current) return;
    const id = e.features?.[0]?.properties?.id;
    if (typeof id === "string") onVarlikSecRef.current(id);
  });
  const fareGirdiRef = useRef(() => {
    const map = mapRef.current;
    if (map) map.getCanvas().style.cursor = "pointer";
  });
  const fareCiktiRef = useRef(() => {
    const map = mapRef.current;
    if (map) map.getCanvas().style.cursor = "";
  });
  const haritaTiklandiRef = useRef((e: maplibregl.MapMouseEvent) => {
    const map = mapRef.current;
    if (!map) return;
    const koordinat: [number, number] = [
      Number(e.lngLat.lng.toFixed(6)),
      Number(e.lngLat.lat.toFixed(6)),
    ];

    if (cizimModuRef.current) {
      onCizimNoktaRef.current(koordinat);
      return;
    }

    const uzerinde = map.queryRenderedFeatures(e.point, {
      layers: ["assets-circle"],
    });
    if (uzerinde.length === 0) {
      onHaritaTiklaRef.current({ longitude: koordinat[0], latitude: koordinat[1] });
    }
  });

  // --- Veriyi haritadaki kaynaga uygular (guncel ref degerlerinden okur) ---
  function veriUygula(map: maplibregl.Map) {
    const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    source?.setData(
      (assetsRef.current ?? BOS_KOLEKSIYON) as unknown as GeoJSON.FeatureCollection
    );
  }

  function cizimUygula(map: maplibregl.Map) {
    const source = map.getSource(CIZIM_SOURCE_ID) as
      | maplibregl.GeoJSONSource
      | undefined;
    if (!source) return;

    const noktalar = cizimNoktalariRef.current;
    const features: GeoJSON.Feature[] = noktalar.map((nokta) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: nokta },
      properties: {},
    }));

    if (noktalar.length >= 3) {
      features.push({
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [[...noktalar, noktalar[0]]] },
        properties: {},
      });
    } else if (noktalar.length === 2) {
      features.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates: noktalar },
        properties: {},
      });
    }

    source.setData({ type: "FeatureCollection", features });
  }

  function secimUygula(map: maplibregl.Map) {
    const id = seciliIdRef.current;
    map.setFilter("assets-selected", ["==", ["get", "id"], id ?? ""]);

    popupRef.current?.remove();
    popupRef.current = null;

    if (!id || !assetsRef.current) return;
    const secili = assetsRef.current.features.find((f) => f.properties.id === id);
    if (!secili) return;

    popupRef.current = new maplibregl.Popup({ offset: 14, closeButton: false })
      .setLngLat(secili.geometry.coordinates)
      .setHTML(popupIcerigi(secili))
      .addTo(map);
  }

  /** Kaynaklar/katmanlar yoksa (ilk yukleme ya da stil degisimi sonrasi) yeniden kurar. */
  function kaynaklariHazirla(map: maplibregl.Map) {
    if (!map.getSource(SOURCE_ID)) {
      map.addSource(SOURCE_ID, { type: "geojson", data: BOS_KOLEKSIYON });

      map.addLayer({
        id: "assets-circle",
        type: "circle",
        source: SOURCE_ID,
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 5, 16, 10],
          "circle-color": [
            "match",
            ["get", "status"],
            "bakim_lazim",
            "#d97706",
            "#059669",
          ],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });

      map.addLayer({
        id: "assets-selected",
        type: "circle",
        source: SOURCE_ID,
        filter: ["==", ["get", "id"], ""],
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 11, 16, 18],
          "circle-color": "transparent",
          "circle-stroke-width": 3,
          "circle-stroke-color": "#0f766e",
        },
      });
    }

    if (!map.getSource(CIZIM_SOURCE_ID)) {
      map.addSource(CIZIM_SOURCE_ID, { type: "geojson", data: BOS_GEOJSON });

      map.addLayer({
        id: "cizim-fill",
        type: "fill",
        source: CIZIM_SOURCE_ID,
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: { "fill-color": "#0f766e", "fill-opacity": 0.12 },
      });
      map.addLayer({
        id: "cizim-line",
        type: "line",
        source: CIZIM_SOURCE_ID,
        paint: { "line-color": "#0f766e", "line-width": 2 },
      });
      map.addLayer({
        id: "cizim-nokta",
        type: "circle",
        source: CIZIM_SOURCE_ID,
        filter: ["==", ["geometry-type"], "Point"],
        paint: {
          "circle-radius": 5,
          "circle-color": "#0f766e",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });
    }

    // Idempotent baglama: once cikar, sonra ekle - stil degisiminde çift kayit olmasin.
    map.off("click", "assets-circle", assetsTiklandiRef.current);
    map.on("click", "assets-circle", assetsTiklandiRef.current);
    map.off("mouseenter", "assets-circle", fareGirdiRef.current);
    map.on("mouseenter", "assets-circle", fareGirdiRef.current);
    map.off("mouseleave", "assets-circle", fareCiktiRef.current);
    map.on("mouseleave", "assets-circle", fareCiktiRef.current);
    map.off("click", haritaTiklandiRef.current);
    map.on("click", haritaTiklandiRef.current);

    hazirRef.current = true;
    veriUygula(map);
    cizimUygula(map);
    secimUygula(map);
  }

  // --- Haritayi bir kez kur ---
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const ilkStil = HARITA_STILLERI.find((s) => s.id === VARSAYILAN_STIL)!.stil;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: ilkStil,
      center: ANKARA,
      zoom: 15,
    });
    mapRef.current = map;

    map.addControl(new maplibregl.NavigationControl(), "bottom-right");
    map.addControl(new maplibregl.ScaleControl(), "bottom-left");

    map.on("load", () => kaynaklariHazirla(map));

    return () => {
      popupRef.current?.remove();
      map.remove();
      mapRef.current = null;
      hazirRef.current = false;
    };
  }, []);

  // --- Harita stili degisince: yeni stili yukle, kaynaklari yeniden kur ---
  function stilDegistir(id: HaritaStilId) {
    const map = mapRef.current;
    const tanim = HARITA_STILLERI.find((s) => s.id === id);
    if (!map || !tanim) return;

    hazirRef.current = false;
    map.once("style.load", () => kaynaklariHazirla(map));
    map.setStyle(tanim.stil);
    setAktifStilId(id);
  }

  // --- Veri degisince kaynagi guncelle ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (hazirRef.current) veriUygula(map);
  }, [assets]);

  // --- Cizim noktalarini haritada goster ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (hazirRef.current) cizimUygula(map);
  }, [cizimNoktalari]);

  // --- Cizim modunda imleci artiya cevir ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getCanvas().style.cursor = cizimModu ? "crosshair" : "";
  }, [cizimModu]);

  // --- Secim degisince: vurgula, ucur, popup ac ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !hazirRef.current) return;

    secimUygula(map);

    if (seciliId && assets) {
      const secili = assets.features.find((f) => f.properties.id === seciliId);
      if (secili) {
        map.flyTo({
          center: secili.geometry.coordinates,
          zoom: Math.max(map.getZoom(), 15),
          duration: 900,
        });
      }
    }
  }, [seciliId, assets]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      {/* Alan secimi kontrolleri (App.tsx) top-4'te; bosluk birakip altina yerlesir. */}
      <div className="absolute right-4 top-40 z-10">
        <MapStyleSwitcher aktifId={aktifStilId} onSec={stilDegistir} />
      </div>
    </div>
  );
}

function popupIcerigi(asset: AssetFeature): string {
  const { name, type, status, brand_model, install_date } = asset.properties;
  const bakim = status === "bakim_lazim";
  const satirlar = [
    brand_model ? `<div>${kacis(brand_model)}</div>` : "",
    install_date ? `<div>Kurulum: ${kacis(install_date)}</div>` : "",
  ].join("");

  return `
    <div style="font-family: system-ui, sans-serif; min-width: 150px">
      <div style="font-weight: 600; margin-bottom: 4px">${kacis(name)}</div>
      <div style="color:#475569; font-size:12px">${ASSET_TYPE_LABELS[type]}</div>
      <div style="margin-top:6px">
        <span style="
          display:inline-block; padding:2px 8px; border-radius:9999px;
          font-size:11px; font-weight:500;
          background:${bakim ? "#fef3c7" : "#d1fae5"};
          color:${bakim ? "#92400e" : "#065f46"}">
          ${ASSET_STATUS_LABELS[status]}
        </span>
      </div>
      <div style="color:#64748b; font-size:11px; margin-top:6px">${satirlar}</div>
    </div>
  `;
}

/** Kullanici verisini HTML'e gomerken kacis uygular. */
function kacis(metin: string): string {
  return metin
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
