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
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onClick={onKapat}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto border border-slate-400 bg-white"
        onClick={(e) => e.stopPropagation()}
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
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
