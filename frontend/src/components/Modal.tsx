import { useEffect, type ReactNode } from "react";

interface ModalProps {
  acik: boolean;
  baslik: string;
  onKapat: () => void;
  children: ReactNode;
  /** Genis icerik (dashboard, personel listesi, log) icin daha genis bir kutu. */
  genis?: boolean;
  /** Govde (icerik) sarmalayicisinin sinifi; kendi flex/yukseklik/padding'ini
   *  yoneten tam panel bilesenleri icin varsayilan "p-5" degistirilebilir. */
  icerikSinifi?: string;
}

export default function Modal({
  acik,
  baslik,
  onKapat,
  children,
  genis,
  icerikSinifi = "p-5",
}: ModalProps) {
  // ESC ile kapatma
  useEffect(() => {
    if (!acik) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onKapat();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [acik, onKapat]);

  if (!acik) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      {/* Arka plana tiklamak kapatmaz: modallerin cogu kaydedilmemis bir form ya da
       *  taslak tasiyor, yanlislikla disari tiklamak onlari yok ediyordu. */}
      <div
        className={`max-h-[90vh] w-full overflow-y-auto border border-slate-400 bg-white ${
          genis ? "max-w-2xl" : "max-w-lg"
        }`}
      >
        <div className="flex items-center justify-between border-b border-slate-300 bg-slate-50 px-5 py-3">
          <h3 className="text-sm font-semibold text-slate-800">{baslik}</h3>
          <button
            onClick={onKapat}
            aria-label="Kapat"
            className="flex h-6 w-6 items-center justify-center border border-transparent text-lg leading-none text-slate-400 transition hover:border-slate-300 hover:text-slate-600"
          >
            ×
          </button>
        </div>
        <div className={icerikSinifi}>{children}</div>
      </div>
    </div>
  );
}
