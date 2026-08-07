import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useYeniGorevler } from "./useYeniGorevler";

/** Test kaydi: hook'un tek varsayimi `cikar` ile id/ad/tur uretilebilmesi. */
interface Kayit {
  id: string;
  ad: string;
}

const cikar = (k: Kayit) => ({ id: k.id, ad: k.ad, tur: "bakım" });
const kayit = (id: string): Kayit => ({ id, ad: `İş ${id}` });

/** Hook'u verilen liste ile kurar; `rerender(liste)` yeni cekimi taklit eder. */
function kur(ilk: Kayit[] | undefined) {
  return renderHook(({ liste }) => useYeniGorevler(liste, cikar), {
    initialProps: { liste: ilk },
  });
}

describe("useYeniGorevler", () => {
  it("ilk cekimi duyurmaz - acilista mevcut isler 'yeni' degildir", () => {
    const { result } = kur([kayit("a"), kayit("b")]);
    expect(result.current.yeniler).toEqual([]);
  });

  it("sonraki cekimde eklenen isi duyurur", () => {
    const { result, rerender } = kur([kayit("a")]);
    rerender({ liste: [kayit("a"), kayit("b")] });
    expect(result.current.yeniler.map((y) => y.id)).toEqual(["b"]);
    expect(result.current.yeniler[0].ad).toBe("İş b");
    expect(result.current.yeniler[0].yon).toBe("atandi");
  });

  it("listeden DUSEN isi 'kaldirildi' olarak duyurur", () => {
    const { result, rerender } = kur([kayit("a"), kayit("b")]);
    rerender({ liste: [kayit("a")] });
    expect(result.current.yeniler.map((y) => y.id)).toEqual(["b"]);
    expect(result.current.yeniler[0].yon).toBe("kaldirildi");
    // Ad artik gelen veride yok; son gorulen halinden okunmali.
    expect(result.current.yeniler[0].ad).toBe("İş b");
  });

  it("ayni tazelemede hem alinan hem verilen is ayri ayri duyurulur", () => {
    const { result, rerender } = kur([kayit("a")]);
    rerender({ liste: [kayit("b")] });
    expect(
      result.current.yeniler.map((y) => [y.id, y.yon])
    ).toEqual([
      ["a", "kaldirildi"],
      ["b", "atandi"],
    ]);
  });

  it("kaldirilan is iki kez duyurulmaz", () => {
    const { result, rerender } = kur([kayit("a")]);
    rerender({ liste: [] });
    rerender({ liste: [] });
    expect(result.current.yeniler.map((y) => y.id)).toEqual(["a"]);
  });

  it("kendi tamamlamasiyla listeden dusen kayit duyurulmaz", () => {
    const { result, rerender } = kur([kayit("a")]);
    act(() => result.current.kendiIslemi("a"));
    rerender({ liste: [] });
    expect(result.current.yeniler).toEqual([]);
  });

  it("ayni isi iki kez duyurmaz", () => {
    const { result, rerender } = kur([kayit("a")]);
    rerender({ liste: [kayit("a"), kayit("b")] });
    rerender({ liste: [kayit("a"), kayit("b")] });
    expect(result.current.yeniler.map((y) => y.id)).toEqual(["b"]);
  });

  it("okunmamis duyurular birikir, ikinci yeni is oncekini silmez", () => {
    const { result, rerender } = kur([]);
    rerender({ liste: [kayit("a")] });
    rerender({ liste: [kayit("a"), kayit("b")] });
    expect(result.current.yeniler.map((y) => y.id)).toEqual(["a", "b"]);
  });

  it("temizle duyurulari kaldirir", () => {
    const { result, rerender } = kur([]);
    rerender({ liste: [kayit("a")] });
    act(() => result.current.temizle());
    expect(result.current.yeniler).toEqual([]);
  });

  it("listeden dusup tekrar atanan is YENIDEN duyurulur", () => {
    const { result, rerender } = kur([kayit("a")]);
    rerender({ liste: [] });
    act(() => result.current.temizle()); // dusme duyurusu okundu
    rerender({ liste: [kayit("a")] });
    expect(result.current.yeniler.map((y) => [y.id, y.yon])).toEqual([
      ["a", "atandi"],
    ]);
  });

  it("kendi islemiyle geri donen kayit duyurulmaz", () => {
    const { result, rerender } = kur([kayit("a")]);
    act(() => result.current.kendiIslemi("a")); // kendi tamamlamasi
    rerender({ liste: [] });
    act(() => result.current.kendiIslemi("a")); // kendi geri almasi
    rerender({ liste: [kayit("a")] });
    expect(result.current.yeniler).toEqual([]);
  });

  it("muafiyet TEK SEFERLIKTIR: ayni is sonradan gercekten atanirsa duyurulur", () => {
    const { result, rerender } = kur([kayit("a")]);
    act(() => result.current.kendiIslemi("a"));
    rerender({ liste: [] }); // kendi tamamlamasi - sessiz
    act(() => result.current.kendiIslemi("a"));
    rerender({ liste: [kayit("a")] }); // kendi geri almasi - sessiz
    expect(result.current.yeniler).toEqual([]);
    rerender({ liste: [] }); // personel isi aldi - duyurulur
    rerender({ liste: [kayit("a")] }); // bu sefer gercek atama
    expect(result.current.yeniler.map((y) => [y.id, y.yon])).toEqual([
      ["a", "kaldirildi"],
      ["a", "atandi"],
    ]);
  });

  it("veri henuz gelmemisken (undefined) baslangic kumesi kurulmaz", () => {
    const { result, rerender } = kur(undefined);
    // Ilk GERCEK yanit hala "ilk cekim"dir, duyurulmamali.
    rerender({ liste: [kayit("a")] });
    expect(result.current.yeniler).toEqual([]);
    rerender({ liste: [kayit("a"), kayit("b")] });
    expect(result.current.yeniler.map((y) => y.id)).toEqual(["b"]);
  });
});
