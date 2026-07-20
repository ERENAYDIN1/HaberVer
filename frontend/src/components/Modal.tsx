import { useEffect, type ReactNode } from "react";

interface ModalProps {
  acik: boolean;
  baslik: string;
  onKapat: () => void;
  children: ReactNode;
}

export default function Modal({ acik, baslik, onKapat, children }: ModalProps) {
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onKapat}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-800">{baslik}</h3>
          <button
            onClick={onKapat}
            aria-label="Kapat"
            className="text-2xl leading-none text-slate-400 transition hover:text-slate-600"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
