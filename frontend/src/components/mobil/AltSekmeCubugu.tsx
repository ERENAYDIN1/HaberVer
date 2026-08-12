import type { KenarOgesi } from "../Kenarcubugu";

/** Cubugun safe-area HARIC yuksekligi. Sheet'in alt boslugu bu degerden
 *  hesaplandigi icin tek yerde durur. */
export const ALT_CUBUK_YUKSEKLIGI = 58;

interface AltSekmeCubuguProps {
  /** Masaustu kenar cubugunun ana ogeleriyle ayni liste. */
  ogeler: KenarOgesi[];
}

/** Mobilde ana gezinme: ekranin dibinde, basparmak menzilinde sabit sekmeler.
 *  Kenar cubugunun aksine daraltilamaz. Yonetim ekranlari buraya girmez,
 *  header'daki menude durur. */
export default function AltSekmeCubugu({ ogeler }: AltSekmeCubuguProps) {
  return (
    <nav
      className="guvenli-alt fixed inset-x-0 bottom-0 z-40 flex border-t border-slate-200 bg-white"
      aria-label="Ana gezinme"
    >
      {ogeler.map((oge) => {
        const { etiket, ikon: Ikon, onClick, aktif, rozet } = oge;
        return (
          <button
            key={oge.id}
            onClick={onClick}
            aria-label={etiket}
            aria-pressed={aktif}
            className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 transition ${
              aktif ? "text-emerald-700" : "text-slate-500"
            }`}
            style={{ height: ALT_CUBUK_YUKSEKLIGI }}
          >
            {aktif && (
              <span className="absolute inset-x-3 top-0 h-0.5 rounded-b-full bg-emerald-600" />
            )}
            <span className="relative">
              <Ikon
                className={`h-5 w-5 ${aktif ? "text-emerald-600" : "text-slate-400"}`}
              />
              {rozet != null && rozet > 0 && (
                <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white">
                  {rozet > 99 ? "99+" : rozet}
                </span>
              )}
            </span>
            <span className="max-w-full truncate px-1 text-[10px] font-medium leading-tight">
              {etiket}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
