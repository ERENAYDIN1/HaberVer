import type { ReactElement } from "react";

/** Soldaki dikey araç çubuğundaki tek bir kutucuğun tanımı. */
export interface SekmeKutucugu<T extends string> {
  id: T;
  etiket: string;
  ikon: (p: { className?: string }) => ReactElement;
  /** emerald | blue | amber — kutucuğun aktif rengi. */
  renk: string;
}

/** Tailwind JIT dinamik `bg-${renk}-500` gibi şablonları yakalayamadığından
 *  renk sınıfları burada tam metin olarak tutulur. */
const RENK_SINIF: Record<
  string,
  { aktif: string; ikonPasif: string; halka: string }
> = {
  emerald: {
    aktif: "border-emerald-400 bg-emerald-500 text-white shadow-emerald-500/40",
    ikonPasif: "text-emerald-600",
    halka: "group-hover:ring-emerald-300",
  },
  blue: {
    aktif: "border-blue-400 bg-blue-500 text-white shadow-blue-500/40",
    ikonPasif: "text-blue-600",
    halka: "group-hover:ring-blue-300",
  },
  amber: {
    aktif: "border-amber-400 bg-amber-500 text-white shadow-amber-500/40",
    ikonPasif: "text-amber-600",
    halka: "group-hover:ring-amber-300",
  },
};

/** Sekmelerin altında, ince bir ayraçla ayrılan nötr bir aksiyon kutucuğu
 *  (örn. "Temizle"). Bir sekme değil; aç/kapa durumu tutmaz. */
export interface AltAksiyon {
  etiket: string;
  ikon: (p: { className?: string }) => ReactElement;
  onClick: () => void;
}

interface SekmeCubuguProps<T extends string> {
  kutucuklar: SekmeKutucugu<T>[];
  /** Şu an açık olan panelin sekmesi; hiçbiri açık değilse null. */
  aktif: T | null;
  onSec: (id: T) => void;
  /** Üzerine gelince beliren etiket balonlarını göster (panel kapalıyken). */
  etiketleriGoster: boolean;
  /** Sekmelerin altına eklenen isteğe bağlı nötr aksiyon (örn. Temizle). */
  altAksiyon?: AltAksiyon;
}

/** Haritanın sol kenarında yüzen, İBB/İSKİ portalındaki gibi yumuşak dokulu
 *  küçük kutucuklardan oluşan dikey sekme çubuğu. Kutucuğun üzerine gelince
 *  animasyonlu bir etiket balonu sağa doğru açılır; tıklanınca ilgili panel
 *  açılır (aktif kutucuğa tekrar tıklamak paneli kapatır). */
export default function SekmeCubugu<T extends string>({
  kutucuklar,
  aktif,
  onSec,
  etiketleriGoster,
  altAksiyon,
}: SekmeCubuguProps<T>) {
  return (
    <div className="absolute left-4 top-4 z-30 flex flex-col gap-2.5">
      {kutucuklar.map(({ id, etiket, ikon: Ikon, renk }) => {
        const secili = aktif === id;
        const r = RENK_SINIF[renk] ?? RENK_SINIF.emerald;
        return (
          <button
            key={id}
            onClick={() => onSec(id)}
            aria-label={etiket}
            aria-pressed={secili}
            title={etiketleriGoster ? undefined : etiket}
            className={`group relative flex h-12 w-12 items-center justify-center rounded-2xl border shadow-lg ring-1 ring-transparent backdrop-blur transition duration-200 hover:scale-105 ${
              secili
                ? `${r.aktif} shadow-lg`
                : `border-white/70 bg-white/95 hover:bg-white ${r.halka}`
            }`}
          >
            <Ikon className={`h-5 w-5 ${secili ? "text-white" : r.ikonPasif}`} />

            {etiketleriGoster && (
              <span className="pointer-events-none absolute left-full top-1/2 ml-3 -translate-x-2 -translate-y-1/2 whitespace-nowrap rounded-xl bg-white px-3 py-1.5 text-sm font-medium text-slate-700 opacity-0 shadow-lg ring-1 ring-slate-200 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100">
                {etiket}
              </span>
            )}
          </button>
        );
      })}

      {altAksiyon && (
        <>
          {/* Sekmelerden ayıran ince ayraç */}
          <span className="mx-auto my-0.5 h-px w-7 bg-slate-300/70" />
          <button
            onClick={altAksiyon.onClick}
            aria-label={altAksiyon.etiket}
            title={etiketleriGoster ? undefined : altAksiyon.etiket}
            className="group relative flex h-12 w-12 items-center justify-center rounded-2xl border border-white/70 bg-white/95 text-slate-500 shadow-lg backdrop-blur transition duration-200 hover:scale-105 hover:bg-white hover:text-slate-700"
          >
            <altAksiyon.ikon className="h-5 w-5" />
            {etiketleriGoster && (
              <span className="pointer-events-none absolute left-full top-1/2 ml-3 -translate-x-2 -translate-y-1/2 whitespace-nowrap rounded-xl bg-white px-3 py-1.5 text-sm font-medium text-slate-700 opacity-0 shadow-lg ring-1 ring-slate-200 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100">
                {altAksiyon.etiket}
              </span>
            )}
          </button>
        </>
      )}
    </div>
  );
}
