import type { ReactNode } from "react";

import { IconLasso, IconPin, IconRoute, IconX } from "./icons";

/** "Ekle" panelinin ilk adimi: ne eklenecegi secilir. */

export type EkleKipi = "varlik" | "alan" | "cizgi";

interface SecenekTanimi {
  kip: EkleKipi;
  etiket: string;
  aciklama: string;
  ikon: (p: { className?: string }) => ReactNode;
  renk: {
    kenar: string;
    zemin: string;
    metin: string;
    rozet: string;
  };
}

const SECENEKLER: SecenekTanimi[] = [
  {
    kip: "varlik",
    etiket: "Varlık",
    aciklama: "Tek bir nokta — ağaç, direk, bank…",
    ikon: IconPin,
    renk: {
      kenar: "hover:border-emerald-300",
      zemin: "hover:bg-emerald-50/60",
      metin: "group-hover:text-emerald-800",
      rozet: "bg-emerald-100 text-emerald-700",
    },
  },
  {
    kip: "alan",
    etiket: "Görev Bölgesi",
    aciklama: "Bir alan çiz — ekibe bölge olarak atanır.",
    ikon: IconLasso,
    renk: {
      kenar: "hover:border-violet-300",
      zemin: "hover:bg-violet-50/60",
      metin: "group-hover:text-violet-800",
      rozet: "bg-violet-100 text-violet-700",
    },
  },
  {
    kip: "cizgi",
    etiket: "Güzergâh",
    aciklama: "Bir hat çiz — uzunluğuyla birlikte kaydedilir.",
    ikon: IconRoute,
    renk: {
      kenar: "hover:border-blue-300",
      zemin: "hover:bg-blue-50/60",
      metin: "group-hover:text-blue-800",
      rozet: "bg-blue-100 text-blue-700",
    },
  },
];

interface Props {
  kip: EkleKipi | null;
  onKipSec: (kip: EkleKipi) => void;
  onGeri: () => void;
  mobil: boolean;
  form: ReactNode;
}

export function EklePaneli({ kip, onKipSec, onGeri, mobil, form }: Props) {
  if (kip === null) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <p className="mb-3 text-xs text-slate-500">Ne eklemek istiyorsun?</p>
        <div className="flex flex-col gap-2">
          {SECENEKLER.map((s) => (
            <button
              key={s.kip}
              onClick={() => onKipSec(s.kip)}
              className={`group flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition ${s.renk.kenar} ${s.renk.zemin} hover:shadow-md`}
            >
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${s.renk.rozet}`}
              >
                <s.ikon className="h-[18px] w-[18px]" />
              </span>
              <span className="min-w-0">
                <span
                  className={`block text-sm font-semibold text-slate-800 transition ${s.renk.metin}`}
                >
                  {s.etiket}
                </span>
                <span className="mt-0.5 block text-xs leading-snug text-slate-500">
                  {s.aciklama}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const secili = SECENEKLER.find((s) => s.kip === kip)!;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded ${secili.renk.rozet}`}
        >
          <secili.ikon className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-700">
          {secili.etiket} ekleniyor
        </span>
        <button
          onClick={onGeri}
          title="Vazgeç"
          aria-label="Vazgeç"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-slate-500 transition hover:bg-white hover:text-slate-700"
        >
          <IconX className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {kip === "varlik" ? (
          <>
            <p className="mb-3 border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Haritada boş bir nokta
              {mobil ? "ya dokunarak" : "ya tıklayarak"} koordinatı otomatik
              doldurabilirsin.
            </p>
            {form}
          </>
        ) : (
          // Cizim haritada yapilir; nokta sayisi/olcu/geri al/tamamla alt-ortadaki cizim panelindedir.
          <p className="border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">
            Haritada{" "}
            {kip === "alan"
              ? "alanın köşelerini"
              : "hattın kırılım noktalarını"}{" "}
            {mobil ? "dokunarak" : "tıklayarak"} işaretle. Ölçü ve
            &ldquo;Tamamla&rdquo; haritanın altındaki çizim panelinde.
          </p>
        )}
      </div>
    </div>
  );
}
