import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useListeAraci } from "./useListeAraci";

/** Arama ile siralamanin kapsam (sekme) degisiminde FARKLI davranmasi bu
 *  hook'un tek sozlesmesi: arama sifirlanir (listeyi gizler), siralama kapsam
 *  basina hatirlanir (hicbir sey gizlemez). */

describe("useListeAraci - kapsam basina siralama", () => {
  it("siralama kapsam basina AYRI tutulur", () => {
    const { result, rerender } = renderHook(
      ({ kapsam }) => useListeAraci("yeni", kapsam),
      { initialProps: { kapsam: "alan" } }
    );

    act(() => result.current.setSira("ad"));
    expect(result.current.sira).toBe("ad");

    // Diger kapsam kendi varsayilaniyla acilir: secim SIZMAZ.
    rerender({ kapsam: "cizgi" });
    expect(result.current.sira).toBe("yeni");

    act(() => result.current.setSira("atanmamis"));
    expect(result.current.sira).toBe("atanmamis");

    // Ilk kapsama donunce kendi secimi yerinde: UNUTULMAZ.
    rerender({ kapsam: "alan" });
    expect(result.current.sira).toBe("ad");

    rerender({ kapsam: "cizgi" });
    expect(result.current.sira).toBe("atanmamis");
  });

  it("ziyaret edilmemis kapsam varsayilana duser", () => {
    const { result, rerender } = renderHook(
      ({ kapsam }) => useListeAraci("yeni", kapsam),
      { initialProps: { kapsam: "alan" } }
    );
    rerender({ kapsam: "hic-gorulmemis" });
    expect(result.current.sira).toBe("yeni");
  });
});

describe("useListeAraci - kapsam degisince arama sifirlanir", () => {
  it("kapsam degisince arama bosalir", () => {
    const { result, rerender } = renderHook(
      ({ kapsam }) => useListeAraci("yeni", kapsam),
      { initialProps: { kapsam: "alan" } }
    );

    act(() => result.current.setArama("cinar"));
    expect(result.current.arama).toBe("cinar");

    rerender({ kapsam: "cizgi" });
    // Asili kalan bir arama, sekmeye donen kullaniciya bos liste gosterirdi.
    expect(result.current.arama).toBe("");
  });

  it("ayni kapsamda yeniden cizim aramayi BOZMAZ", () => {
    // Panel her veri tazelemesinde yeniden ciziliyor; arama metni her
    // render'da silinseydi kullanici yazarken kutu bosalirdi.
    const { result, rerender } = renderHook(
      ({ kapsam }) => useListeAraci("yeni", kapsam),
      { initialProps: { kapsam: "alan" } }
    );

    act(() => result.current.setArama("cinar"));
    rerender({ kapsam: "alan" });
    rerender({ kapsam: "alan" });
    expect(result.current.arama).toBe("cinar");
  });

  it("kapsamsiz kullanimda (tek listeli panel) arama korunur", () => {
    const { result, rerender } = renderHook(() => useListeAraci("yeni"));
    act(() => result.current.setArama("bank"));
    rerender();
    expect(result.current.arama).toBe("bank");
    expect(result.current.sira).toBe("yeni");
  });
});
