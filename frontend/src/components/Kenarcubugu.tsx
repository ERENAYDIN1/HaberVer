import type { ReactElement } from "react";

import { IconMarkaLogo } from "./icons";

/** Sol kenar cubugundaki tek bir gezinme ogesi. */
export interface KenarOgesi {
  id: string;
  etiket: string;
  ikon: (p: { className?: string }) => ReactElement;
  onClick: () => void;
  /** Ogeye ait panel/modal acikken vurgulanir. */
  aktif?: boolean;
  /** Sag tarafta gosterilen kucuk sayac (orn. bekleyen talep adedi). */
  rozet?: number;
}

interface KenarcubuguProps {
  genis: boolean;
  ogeler: KenarOgesi[];
  yonetimOgeleri: KenarOgesi[];
  altOgeler: KenarOgesi[];
}

/** Acilir/kapanir sol kenar cubugu: genis modda etiketler, dar modda yalnizca
 *  ikonlar (tooltip'li) gorunur. Akisin disinda (absolute) durup haritanin
 *  uzerine biner; akista olsa acilip kapanmasi haritayi yeniden boyutlandirirdi. */
export default function Kenarcubugu({
  genis,
  ogeler,
  yonetimOgeleri,
  altOgeler,
}: KenarcubuguProps) {
  return (
    <aside
      className={`absolute inset-y-0 left-0 z-30 flex flex-col border-r border-slate-200 bg-white transition-[width] duration-200 ease-out ${
        genis ? "w-60" : "w-[68px]"
      }`}
    >
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <div className="space-y-1">
          {ogeler.map((oge) => (
            <KenarButonu key={oge.id} oge={oge} genis={genis} />
          ))}
        </div>

        {yonetimOgeleri.length > 0 && (
          <>
            <Ayrac genis={genis} etiket="Yönetim" />
            <div className="space-y-1">
              {yonetimOgeleri.map((oge) => (
                <KenarButonu key={oge.id} oge={oge} genis={genis} />
              ))}
            </div>
          </>
        )}

        {altOgeler.length > 0 && (
          <>
            <div className="my-3 h-px bg-slate-100" />
            <div className="space-y-1">
              {altOgeler.map((oge) => (
                <KenarButonu key={oge.id} oge={oge} genis={genis} />
              ))}
            </div>
          </>
        )}
      </nav>

      {genis && (
        <div className="p-3">
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500 to-green-700 p-4 text-white shadow-sm">
            <IconMarkaLogo className="mb-2 h-7 w-7 text-white/90" />
            <p className="text-sm font-semibold leading-snug">
              Daha yeşil bir şehir
            </p>
            <p className="text-xs text-white/80">için birlikte.</p>
            <div className="pointer-events-none absolute -bottom-6 -right-4 h-20 w-20 rounded-full bg-white/10" />
          </div>
        </div>
      )}
    </aside>
  );
}

function KenarButonu({ oge, genis }: { oge: KenarOgesi; genis: boolean }) {
  const { etiket, ikon: Ikon, onClick, aktif, rozet } = oge;
  return (
    <button
      onClick={onClick}
      aria-label={etiket}
      aria-pressed={aktif}
      title={genis ? undefined : etiket}
      className={`group relative flex w-full items-center rounded-xl text-sm font-medium transition ${
        genis ? "gap-3 px-3 py-2.5" : "justify-center px-0 py-2.5"
      } ${
        aktif
          ? "bg-emerald-50 text-emerald-700"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      }`}
    >
      {aktif && (
        <span className="absolute left-0 top-1/2 h-6 -translate-y-1/2 rounded-r-full bg-emerald-600" style={{ width: 3 }} />
      )}

      <span className="relative shrink-0">
        <Ikon className={`h-5 w-5 ${aktif ? "text-emerald-600" : "text-slate-400 group-hover:text-slate-600"}`} />
        {!genis && rozet != null && rozet > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white">
            {rozet > 99 ? "99+" : rozet}
          </span>
        )}
      </span>

      {genis && (
        <>
          <span className="flex-1 truncate text-left">{etiket}</span>
          {rozet != null && rozet > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-100 px-1.5 text-xs font-semibold text-amber-700">
              {rozet > 99 ? "99+" : rozet}
            </span>
          )}
        </>
      )}

      {!genis && (
        <span className="pointer-events-none absolute left-full top-1/2 z-20 ml-3 -translate-y-1/2 -translate-x-1 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-medium text-white opacity-0 shadow-lg transition-all duration-150 group-hover:translate-x-0 group-hover:opacity-100">
          {etiket}
        </span>
      )}
    </button>
  );
}

function Ayrac({ genis, etiket }: { genis: boolean; etiket: string }) {
  if (!genis) return <div className="my-3 h-px bg-slate-100" />;
  return (
    <p className="mb-1 mt-4 px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
      {etiket}
    </p>
  );
}
