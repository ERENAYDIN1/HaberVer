import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

/** Test ortaminin ortak kurulumu.
 *
 *  Buradaki mock'lar "testi gecirmek icin" degil, jsdom'un GERCEKTEN sahip
 *  olmadigi tarayici yetenekleri icindir: WebGL yok (MapLibre), geolocation
 *  yok, ResizeObserver yok. Uygulama mantigina ait hicbir sey burada taklit
 *  EDILMEZ - o testin kendi isidir. */

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// --- jsdom'da olmayan tarayici API'leri ---

class SahteResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", SahteResizeObserver);

Object.defineProperty(window.navigator, "geolocation", {
  configurable: true,
  value: {
    getCurrentPosition: vi.fn(),
    watchPosition: vi.fn(() => 1),
    clearWatch: vi.fn(),
  },
});

// jsdom URL.createObjectURL uygulamiyor (foto onizleme yollarinda kullaniliyor).
if (!URL.createObjectURL) {
  URL.createObjectURL = vi.fn(() => "blob:test");
  URL.revokeObjectURL = vi.fn();
}

// --- MapLibre ---
// Harita jsdom'da CIZILEMEZ (WebGL yok). Testlerin ilgilendigi sey zaten
// haritanin pikselleri degil, PANEL/LISTE davranisi; bu yuzden MapLibre
// bileseni butunuyle yerine konur. Gercek harita davranisi (katman sirasi,
// popup icerigi) bu testlerin kapsami disindadir - onlar elle dogrulanir.
vi.mock("maplibre-gl", () => {
  const olay: Record<string, ((e?: unknown) => void)[]> = {};
  const harita = {
    on: vi.fn((ad: string, ...rest: unknown[]) => {
      const cb = rest[rest.length - 1] as () => void;
      (olay[ad] ??= []).push(cb);
      if (ad === "load") cb();
    }),
    off: vi.fn(),
    once: vi.fn(),
    remove: vi.fn(),
    addSource: vi.fn(),
    removeSource: vi.fn(),
    getSource: vi.fn(() => ({ setData: vi.fn() })),
    addLayer: vi.fn(),
    removeLayer: vi.fn(),
    getLayer: vi.fn(),
    setFilter: vi.fn(),
    setPaintProperty: vi.fn(),
    setLayoutProperty: vi.fn(),
    addImage: vi.fn(),
    hasImage: vi.fn(() => true),
    addControl: vi.fn(),
    removeControl: vi.fn(),
    getStyle: vi.fn(() => ({ layers: [] })),
    setStyle: vi.fn(),
    isStyleLoaded: vi.fn(() => true),
    flyTo: vi.fn(),
    fitBounds: vi.fn(),
    getCanvas: vi.fn(() => ({ style: {} })),
    getContainer: vi.fn(() => document.createElement("div")),
    getZoom: vi.fn(() => 10),
    getCenter: vi.fn(() => ({ lng: 28.9784, lat: 41.0082 })),
    getBounds: vi.fn(() => ({
      getWest: () => 28.5,
      getSouth: () => 40.8,
      getEast: () => 29.4,
      getNorth: () => 41.3,
    })),
    project: vi.fn(() => ({ x: 0, y: 0 })),
    unproject: vi.fn(() => ({ lng: 0, lat: 0 })),
    queryRenderedFeatures: vi.fn(() => []),
    resize: vi.fn(),
  };
  const yapici = <T,>(): T => {
    const nesne = {
      setLngLat: vi.fn(() => nesne),
      setHTML: vi.fn(() => nesne),
      setDOMContent: vi.fn(() => nesne),
      setPopup: vi.fn(() => nesne),
      getPopup: vi.fn(() => nesne),
      addTo: vi.fn(() => nesne),
      remove: vi.fn(() => nesne),
      getElement: vi.fn(() => document.createElement("div")),
      on: vi.fn(() => nesne),
      isOpen: vi.fn(() => false),
      setOffset: vi.fn(() => nesne),
    };
    return nesne as T;
  };
  return {
    default: {
      Map: vi.fn(() => harita),
      Marker: vi.fn(yapici),
      Popup: vi.fn(yapici),
      NavigationControl: vi.fn(() => ({})),
      GeolocateControl: vi.fn(() => ({ on: vi.fn() })),
      ScaleControl: vi.fn(() => ({})),
      // `_container` GEREKLI: utils/haritaAttribution.ts kontrolun ic
      // elementini okuyup uzerine MutationObserver kuruyor. Bos nesne
      // dondurmek "MutationObserver: parameter 1 is not of type Node" ile
      // butun App testlerini dusuruyordu.
      AttributionControl: vi.fn(() => ({
        _container: document.createElement("div"),
      })),
      LngLatBounds: vi.fn(() => ({ extend: vi.fn(), isEmpty: () => false })),
    },
    Map: vi.fn(() => harita),
    Marker: vi.fn(yapici),
    Popup: vi.fn(yapici),
  };
});
