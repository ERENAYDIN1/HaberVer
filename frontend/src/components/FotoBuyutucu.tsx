import { useEffect } from "react";

import { IconX } from "./icons";

interface FotoBuyutucuProps {
  src: string;
  onKapat: () => void;
}

/** Kucuk bir foto thumbnail'ine tiklaninca acilan, fotografi buyuk halde
 *  gosteren lightbox. Arka plana ya da X'e tiklayinca kapanir, ESC de calisir. */
export default function FotoBuyutucu({ src, onKapat }: FotoBuyutucuProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onKapat();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onKapat]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/80 p-6"
      onClick={onKapat}
    >
      <button
        onClick={onKapat}
        aria-label="Kapat"
        title="Kapat"
        className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
      >
        <IconX className="h-5 w-5" />
      </button>
      <img
        src={src}
        alt=""
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] max-w-full rounded-lg object-contain shadow-2xl"
      />
    </div>
  );
}
