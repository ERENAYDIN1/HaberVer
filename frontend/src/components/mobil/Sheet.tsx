import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

/** Sheet'in oturabilecegi kademeler: gorunur yuksekligin oranlari.
 *
 *  Iki kademe var cunku mobilde asil soru "panel mi harita mi" degil "ikisini
 *  nasil paylastiririm": yarim kademede kullanici listeyi okurken haritanin
 *  ust yarisini gormeye devam eder, tam kademede formu doldurur. Uc kademe
 *  denendiginde surukleme hedefleri birbirine cok yaklasiyordu. */
const KADEMELER = [0.5, 0.92] as const;

/** Bu esigin altina surukleyip birakmak sheet'i kapatir. En dusuk kademenin
 *  biraz altinda: kullanici kapatmak icin ekranin dibine kadar inmek zorunda
 *  kalmasin, ama listeyi kucultmek isterken yanlislikla da kapatmasin. */
const KAPATMA_ESIGI = 0.32;

export interface SheetProps {
  acik: boolean;
  baslik: string;
  onKapat: () => void;
  children: ReactNode;
  /** Baslikta adin solunda duran kucuk ikon rozeti. */
  ikon?: ReactNode;
  /** Baslik seridinin sinifi (panelin kendi rengini tasimasi icin). */
  baslikSinifi?: string;
  /** Baslikta, kapatma dugmesinin solunda duran ek kontroller. */
  baslikSagi?: ReactNode;
  /** Acilista oturulacak kademe. Kisa listeler icin "yarim", formlar icin "tam". */
  baslangic?: "yarim" | "tam";
  /** Govdenin sinifi; varsayilan dikey kaydirmadir. Kendi flex duzenini
   *  yoneten tam panel bilesenleri icin degistirilebilir. */
  govdeSinifi?: string;
  /** Sheet'in altinda kalmasi gereken bosluk (px) - alt sekme cubugu gibi.
   *  Kademe oranlari bu bosluk dusuldukten SONRAKI alana gore hesaplanir. */
  altBosluk?: number;
  /** Acik bir panelin UZERINE binen sheet (katman, menu). Kapatilinca alttaki
   *  panel yerinde durmaya devam eder - kullanicinin acik listesi kaybolmaz. */
  ustte?: boolean;
}

/** Alttan cikan, kademeli ve suruklenebilir panel: mobilde haritanin yerini
 *  almaz, uzerine biner ve kullanici istedigi kadarini acar.
 *
 *  Kapaliyken hic monte edilmez; boylece her acilis kademe durumunu sifirdan
 *  kurar (bir onceki kullanimda tam acilmis olmasi, bir sonraki - belki cok
 *  kisa - icerik icin dogru kademe oldugu anlamina gelmez). */
export default function Sheet({ acik, ...props }: SheetProps) {
  if (!acik) return null;
  return <SheetGovde {...props} />;
}

function SheetGovde({
  baslik,
  onKapat,
  children,
  ikon,
  baslikSinifi = "border-slate-200 bg-white",
  baslikSagi,
  baslangic = "yarim",
  govdeSinifi = "flex-1 overflow-y-auto overscroll-contain",
  altBosluk = 0,
  ustte,
}: Omit<SheetProps, "acik">) {
  const [kademe, setKademe] = useState(baslangic === "tam" ? 1 : 0);
  const kutuRef = useRef<HTMLDivElement>(null);
  // Surukleme durumu ref'te tutulur: cizim sirasinda React state'ine
  // DOKUNULMAZ (`useSekilDuzenleme`'deki taslak deseniyle ayni), yoksa her
  // karede tum panel agaci - orn. 300 satirlik varlik listesi - yeniden
  // cizilirdi. Kademe yalnizca birakma aninda islenir.
  const surukleRef = useRef<{ baslangicY: number; baslangicPx: number } | null>(
    null
  );

  /** Bir kademenin piksel karsiligi. Yuzde yerine piksel yazilir: yuzde degeri
   *  mobil tarayicilarda adres cubugu gizlenip acildikca degisiyor ve panel
   *  kullanici kaydirdikca "nefes aliyordu". */
  const kademePx = useCallback(
    (i: number) => (window.innerHeight - altBosluk) * KADEMELER[i],
    [altBosluk]
  );

  // Cihaz donunce / klavye acilinca yukseklik yeniden hesaplanmali.
  useEffect(() => {
    const yenile = () => {
      if (kutuRef.current && !surukleRef.current) {
        kutuRef.current.style.height = `${kademePx(kademe)}px`;
      }
    };
    window.addEventListener("resize", yenile);
    return () => window.removeEventListener("resize", yenile);
  }, [kademe, kademePx]);

  const kademeyeOtur = (i: number) => {
    setKademe(i);
    if (kutuRef.current) kutuRef.current.style.height = `${kademePx(i)}px`;
  };

  const surukleBasla = (e: React.PointerEvent) => {
    if (!kutuRef.current) return;
    surukleRef.current = {
      baslangicY: e.clientY,
      baslangicPx: kutuRef.current.getBoundingClientRect().height,
    };
    kutuRef.current.style.transition = "none";
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const suruklerken = (e: React.PointerEvent) => {
    const s = surukleRef.current;
    if (!s || !kutuRef.current) return;
    const kullanilabilir = window.innerHeight - altBosluk;
    // Asagi surukleme yuksekligi azaltir; ust sinir en genis kademedir.
    const yeni = Math.min(
      kademePx(KADEMELER.length - 1),
      Math.max(0, s.baslangicPx - (e.clientY - s.baslangicY))
    );
    kutuRef.current.style.height = `${yeni}px`;
    // Kapatma esigine inildiginde panel soluklasir: birakinca ne olacagini
    // birakmadan once gostermek gerekiyor.
    kutuRef.current.style.opacity =
      yeni < kullanilabilir * KAPATMA_ESIGI ? "0.6" : "1";
  };

  const surukleBitir = (e: React.PointerEvent) => {
    const s = surukleRef.current;
    if (!s || !kutuRef.current) return;
    surukleRef.current = null;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);

    const kutu = kutuRef.current;
    kutu.style.transition = "";
    kutu.style.opacity = "1";

    const yukseklik = kutu.getBoundingClientRect().height;
    if (yukseklik < (window.innerHeight - altBosluk) * KAPATMA_ESIGI) {
      kutu.style.height = "";
      onKapat();
      return;
    }

    let enYakin = 0;
    let enKucukFark = Infinity;
    KADEMELER.forEach((_, i) => {
      const fark = Math.abs(kademePx(i) - yukseklik);
      if (fark < enKucukFark) {
        enKucukFark = fark;
        enYakin = i;
      }
    });
    kademeyeOtur(enYakin);
  };

  return (
    <div
      ref={kutuRef}
      // Haritanin uzerine biner ama onu KAPATMAZ: ustte kalan bosluktan harita
      // gorunur ve dokunulabilir kalir - mobilde panelin tam ekran olmamasinin
      // butun sebebi bu.
      className={`fixed inset-x-0 ${
        ustte ? "z-50" : "z-40"
      } flex flex-col overflow-hidden rounded-t-2xl border-t border-slate-200 bg-white shadow-[0_-8px_28px_-8px_rgba(15,23,42,0.35)] transition-[height] duration-200 ease-out`}
      // Safe-area yalnizca konumda hesaba katilir; kademe oranlarindaki ~34px
      // fark oturma noktasini gozle secilir olcude kaydirmiyor.
      style={{
        bottom: `calc(${altBosluk}px + env(safe-area-inset-bottom, 0px))`,
        height: kademePx(kademe),
      }}
      role="dialog"
      aria-label={baslik}
    >
      {/* Surukleme bolgesi: tutamak + baslik seridi. Govde degil BURASI
          suruklenir - govde kaydirilabilir bir liste ve iki jest ayni yerde
          olsaydi kullanici listeyi kaydirmaya calisirken paneli kapatirdi. */}
      <div
        onPointerDown={surukleBasla}
        onPointerMove={suruklerken}
        onPointerUp={surukleBitir}
        onPointerCancel={surukleBitir}
        className={`shrink-0 touch-none border-b ${baslikSinifi}`}
      >
        <button
          type="button"
          onClick={() => kademeyeOtur(kademe === 0 ? 1 : 0)}
          aria-label={kademe === 0 ? "Paneli büyüt" : "Paneli küçült"}
          className="flex w-full justify-center py-2.5"
        >
          <span className="h-1 w-10 rounded-full bg-slate-300" />
        </button>

        <div className="flex items-center gap-2 px-4 pb-2.5">
          {ikon}
          <h2 className="truncate text-sm font-semibold">{baslik}</h2>
          <div className="ml-auto flex shrink-0 items-center gap-1">
            {baslikSagi}
            <button
              type="button"
              onClick={onKapat}
              aria-label="Paneli kapat"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M6 6 L18 18 M18 6 L6 18" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <div className={govdeSinifi}>{children}</div>
    </div>
  );
}
