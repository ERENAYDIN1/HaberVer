import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useCanliGuncelleme } from "./useCanliGuncelleme";

/** Kanalin sozlesmesi: gelen sinyal ILGILI react-query anahtarini invalidate
 *  eder, veri TASIMAZ. Testler bu sozlesmeyi ve baglanti durumunu olcer. */

/** Uygulamanin kurdugu EventSource'u yakalayan sahte; testler olaylari elle
 *  tetikler (gercek ag yok). */
class SahteEventSource {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  static sonuncu: SahteEventSource | null = null;

  readyState = SahteEventSource.CONNECTING;
  kapatildi = false;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private dinleyiciler: Record<string, ((e: MessageEvent) => void)[]> = {};

  constructor(public url: string) {
    SahteEventSource.sonuncu = this;
  }

  addEventListener(ad: string, cb: (e: MessageEvent) => void) {
    (this.dinleyiciler[ad] ??= []).push(cb);
  }
  removeEventListener() {}
  close() {
    this.kapatildi = true;
    this.readyState = SahteEventSource.CLOSED;
  }

  // --- test tetikleyicileri ---
  ac() {
    this.readyState = SahteEventSource.OPEN;
    this.onopen?.();
  }
  olayGonder(anahtar: string) {
    const e = new MessageEvent("tazele", { data: JSON.stringify({ anahtar }) });
    for (const cb of this.dinleyiciler["tazele"] ?? []) cb(e);
  }
  bozukGonder(ham: string) {
    const e = new MessageEvent("tazele", { data: ham });
    for (const cb of this.dinleyiciler["tazele"] ?? []) cb(e);
  }
  hataVer(kapandi: boolean) {
    this.readyState = kapandi
      ? SahteEventSource.CLOSED
      : SahteEventSource.CONNECTING;
    this.onerror?.();
  }
}

function kur(etkin = true) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const sarmalayici = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const sonuc = renderHook(({ e }) => useCanliGuncelleme(e), {
    initialProps: { e: etkin },
    wrapper: sarmalayici,
  });
  return { ...sonuc, invalidate, kanal: () => SahteEventSource.sonuncu! };
}

beforeEach(() => {
  SahteEventSource.sonuncu = null;
  vi.stubGlobal("EventSource", SahteEventSource);
});

describe("useCanliGuncelleme", () => {
  it("etkinken kanali acar, durumu 'canli'ya cevirir", () => {
    const { result, kanal } = kur();
    expect(kanal().url).toContain("/api/olaylar");
    expect(result.current).toBe("baglaniyor");
    act(() => kanal().ac());
    expect(result.current).toBe("canli");
  });

  it("etkin degilken hic baglanmaz", () => {
    kur(false);
    expect(SahteEventSource.sonuncu).toBeNull();
  });

  it("gelen sinyal ILGILI anahtari invalidate eder", () => {
    const { invalidate, kanal } = kur();
    act(() => kanal().ac());
    act(() => kanal().olayGonder("saha"));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["saha"] });
    act(() => kanal().olayGonder("bolgeler"));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["bolgeler"] });
  });

  it("bozuk paket kanali dusurmez", () => {
    const { invalidate, kanal } = kur();
    act(() => kanal().ac());
    act(() => kanal().bozukGonder("{bu json degil"));
    expect(invalidate).not.toHaveBeenCalled();
    // Kanal calismaya devam etmeli.
    act(() => kanal().olayGonder("assets"));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["assets"] });
  });

  it("gecici hatada 'baglaniyor', tarayici pes edince 'kopuk' der", () => {
    const { result, kanal } = kur();
    act(() => kanal().ac());
    act(() => kanal().hataVer(false)); // yeniden baglanacak
    expect(result.current).toBe("baglaniyor");
    act(() => kanal().hataVer(true)); // CLOSED
    expect(result.current).toBe("kopuk");
  });

  it("bilesen kalkinca baglanti kapatilir", () => {
    const { unmount, kanal } = kur();
    const k = kanal();
    unmount();
    expect(k.kapatildi).toBe(true);
  });
});
