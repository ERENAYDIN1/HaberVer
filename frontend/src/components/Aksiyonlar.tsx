import { useState, type ReactNode } from "react";

/** Detay modallerinin (varlik / talep / bolge) ortak islem dili: serit +
 *  buton + silme onayi.
 *
 *  Renk kodu: yesil = ilerleten ana islem, gri = ikincil, kirmizi = yikici,
 *  amber = geri alan/uyaran, mor = bolge islemleri, mavi = haritada gezinme. */

export type AksiyonTuru =
  | "birincil"
  | "ikincil"
  | "tehlike"
  | "tehlikeIkincil"
  | "uyari"
  | "mor"
  | "gezinme";

const TUR_SINIFLARI: Record<AksiyonTuru, string> = {
  birincil:
    "border border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700 disabled:border-slate-300 disabled:bg-slate-300",
  ikincil: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
  tehlike: "border border-red-600 bg-red-600 text-white hover:bg-red-700",
  tehlikeIkincil:
    "border border-red-300 bg-white text-red-600 hover:bg-red-50",
  uyari:
    "border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100",
  mor: "border border-violet-600 bg-violet-600 text-white hover:bg-violet-500",
  gezinme: "border border-sky-300 bg-sky-50 text-sky-700 hover:bg-sky-100",
};

const TEMEL_SINIF =
  "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition " +
  "disabled:cursor-not-allowed disabled:opacity-60";

interface AksiyonButonuProps {
  tur?: AksiyonTuru;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  children: ReactNode;
}

export function AksiyonButonu({
  tur = "ikincil",
  onClick,
  disabled,
  title,
  children,
}: AksiyonButonuProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`${TEMEL_SINIF} ${TUR_SINIFLARI[tur]}`}
    >
      {children}
    </button>
  );
}

/** Serit icinde iki islem kumesini ayiran bosluk. */
export function AksiyonAyraci() {
  return <span aria-hidden className="w-3" />;
}

/** Modal govdesinin altindaki islem seridi. */
export function AksiyonSeridi({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3">
      {children}
    </div>
  );
}

interface SilOnayiProps {
  ad?: string;
  siliniyor?: boolean;
  onSil: () => void;
  /** Islem gercekten silme DEGILSE (orn. talebi listeden kaldirma - kayit
   *  belediyede kalir) ne yaptigini dogru soyleyen bir metin verilmelidir. */
  etiket?: string;
  soru?: string;
  onayEtiketi?: string;
  calisiyorEtiketi?: string;
  satirIci?: boolean;
  /** Degisince acik onay kapanir (modal monte kalirken baska kayda gecilince). */
  sifirlaAnahtari?: string | null;
}

/** Silme her yerde ayni iki adimla yapilir: kirmizi "Sil" -> yerinde
 *  "Vazgeç / Evet, sil". */
export function SilOnayi({
  ad,
  siliniyor = false,
  onSil,
  etiket = "Sil",
  soru = "Silinsin mi?",
  onayEtiketi = "Evet, sil",
  calisiyorEtiketi = "Siliniyor…",
  satirIci = false,
  sifirlaAnahtari,
}: SilOnayiProps) {
  const [onayda, setOnayda] = useState(false);

  // Render sirasinda duzeltme (efekt olsa bir kare gecikir, yeni kayit bir
  // an onay sorusuyla acilirdi).
  const [oncekiAnahtar, setOncekiAnahtar] = useState(sifirlaAnahtari);
  if (oncekiAnahtar !== sifirlaAnahtari) {
    setOncekiAnahtar(sifirlaAnahtari);
    if (onayda) setOnayda(false);
  }

  if (!onayda) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOnayda(true);
        }}
        className={`text-xs font-medium text-red-600 hover:underline ${
          satirIci ? "" : "ml-auto"
        }`}
      >
        {etiket}
      </button>
    );
  }

  // Satir icinde liste satirinin sabit yuksekligini bozmasin diye metin-baglantisi; modallerde gercek buton.
  if (satirIci) {
    return (
      <span
        className="flex items-center gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-xs text-slate-500">{soru}</span>
        <button
          type="button"
          onClick={() => setOnayda(false)}
          className="text-xs font-medium text-slate-500 hover:underline"
        >
          Vazgeç
        </button>
        <button
          type="button"
          onClick={onSil}
          disabled={siliniyor}
          className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
        >
          {siliniyor ? calisiyorEtiketi : onayEtiketi}
        </button>
      </span>
    );
  }

  return (
    <span className="ml-auto flex items-center gap-1.5">
      {ad && (
        <span className="mr-1 text-[11px] text-slate-500">
          “{ad}” silinsin mi?
        </span>
      )}
      <button
        type="button"
        onClick={() => setOnayda(false)}
        className="border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-600 transition hover:bg-slate-50"
      >
        Vazgeç
      </button>
      <button
        type="button"
        onClick={onSil}
        disabled={siliniyor}
        className="border border-red-600 bg-red-600 px-2.5 py-1.5 text-[11px] font-medium text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {siliniyor ? calisiyorEtiketi : onayEtiketi}
      </button>
    </span>
  );
}
