import maplibregl, { type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";

import {
  ASSET_STATUS_LABELS,
  ASSET_TYPE_LABELS,
} from "../types/asset";
import type { AssetFeature, AssetFeatureCollection } from "../types/asset";

/** API anahtari gerektirmeyen OpenStreetMap raster altligi. */
const OSM_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap katkıda bulunanlar",
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

const ANKARA: [number, number] = [32.8597, 39.9334];
const SOURCE_ID = "assets";

const BOS_KOLEKSIYON: AssetFeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

interface MapViewProps {
  assets?: AssetFeatureCollection;
  /** Panelde/haritada secili varligin id'si. */
  seciliId: string | null;
  /** Haritadaki bir noktaya tiklaninca. */
  onVarlikSec: (id: string) => void;
  /** Bos bir alana tiklaninca (koordinati forma doldurmak icin). */
  onHaritaTikla: (koordinat: { longitude: number; latitude: number }) => void;
}

export default function MapView({
  assets,
  seciliId,
  onVarlikSec,
  onHaritaTikla,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const hazirRef = useRef(false);

  // Callback'leri ref'te tutariz; boylece harita yalnizca bir kez kurulur.
  const onVarlikSecRef = useRef(onVarlikSec);
  const onHaritaTiklaRef = useRef(onHaritaTikla);
  useEffect(() => {
    onVarlikSecRef.current = onVarlikSec;
    onHaritaTiklaRef.current = onHaritaTikla;
  }, [onVarlikSec, onHaritaTikla]);

  // --- Haritayi bir kez kur ---
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_STYLE,
      center: ANKARA,
      zoom: 13,
    });
    mapRef.current = map;

    map.addControl(new maplibregl.NavigationControl(), "bottom-right");
    map.addControl(new maplibregl.ScaleControl(), "bottom-left");

    map.on("load", () => {
      map.addSource(SOURCE_ID, { type: "geojson", data: BOS_KOLEKSIYON });

      // Ana nokta katmani - renk duruma gore
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

      // Secili varligi vurgulayan halka
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

      hazirRef.current = true;

      // Nokta tiklamasi -> secim
      map.on("click", "assets-circle", (e) => {
        const feature = e.features?.[0];
        const id = feature?.properties?.id;
        if (typeof id === "string") {
          onVarlikSecRef.current(id);
        }
      });

      // Bos alana tiklama -> koordinati forma gonder
      map.on("click", (e) => {
        const uzerinde = map.queryRenderedFeatures(e.point, {
          layers: ["assets-circle"],
        });
        if (uzerinde.length === 0) {
          onHaritaTiklaRef.current({
            longitude: Number(e.lngLat.lng.toFixed(6)),
            latitude: Number(e.lngLat.lat.toFixed(6)),
          });
        }
      });

      map.on("mouseenter", "assets-circle", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "assets-circle", () => {
        map.getCanvas().style.cursor = "";
      });
    });

    return () => {
      popupRef.current?.remove();
      map.remove();
      mapRef.current = null;
      hazirRef.current = false;
    };
  }, []);

  // --- Veri degisince kaynagi guncelle ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !assets) return;

    const uygula = () => {
      const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
      source?.setData(assets as unknown as GeoJSON.FeatureCollection);
    };

    if (hazirRef.current) uygula();
    else map.once("load", uygula);
  }, [assets]);

  // --- Secim degisince: vurgula, ucur, popup ac ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const uygula = () => {
      map.setFilter("assets-selected", ["==", ["get", "id"], seciliId ?? ""]);

      popupRef.current?.remove();
      popupRef.current = null;

      if (!seciliId || !assets) return;

      const secili = assets.features.find((f) => f.properties.id === seciliId);
      if (!secili) return;

      map.flyTo({
        center: secili.geometry.coordinates,
        zoom: Math.max(map.getZoom(), 15),
        duration: 900,
      });

      popupRef.current = new maplibregl.Popup({
        offset: 14,
        closeButton: false,
      })
        .setLngLat(secili.geometry.coordinates)
        .setHTML(popupIcerigi(secili))
        .addTo(map);
    };

    if (hazirRef.current) uygula();
    else map.once("load", uygula);
  }, [seciliId, assets]);

  return <div ref={containerRef} className="h-full w-full" />;
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
