import { useState, type ReactNode } from "react";

/** Detay modallerinin (varlik / ihbar / gorev bolgesi) ORTAK islem dili.
 *
 *  Ayni is - "bu kaydi yonet" - uc ayri ekranda uc ayri gorunumdeydi: bir yerde
 *  tam genislikte dolu butonlar, bir yerde dar butonlar, bir yerde metin
 *  baglantisi; silme kimi yerde `window.confirm`, kimi yerde satir ici onaydi.
 *  Buradaki uc parca (serit + buton + silme onayi) o farklari tek yerde toplar:
 *  bakim bekleyen bir varlik ile onaylanmis bir ihbardan olusan varlik, hangi
 *  panelden acilirsa acilsin ayni yerlesimi ve ayni renk kodunu gosterir.
 *
 *  Renk kodu (her yerde ayni anlam): yesil = ilerleten/onaylayan ana islem,
 *  gri = notr/ikincil, kirmizi = yikici, amber = geri alan/uyaran, mor =
 *  bolge/guzergah islemleri (bolge katmaninin rengi). */

export type AksiyonTuru =
  | "birincil"
  | "ikincil"
  | "tehlike"
  | "tehlikeIkincil"
  | "uyari"
  | "mor";

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

/** Modal govdesinin altindaki islem seridi: ust cizgiyle icerikten ayrilir,
 *  butonlar soldan dizilir (yikici olan `SilOnayi` ile saga itilir). */
export function AksiyonSeridi({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3">
      {children}
    </div>
  );
}

interface SilOnayiProps {
  /** Onay sorusunda gecen kayit adi (verilmezse genel bir soru sorulur). */
  ad?: string;
  siliniyor?: boolean;
  onSil: () => void;
  /** Liste satirlarinda kullanilan kucuk, metin-baglantisi olcusu. */
  satirIci?: boolean;
  /** Bu deger degisince acik onay kapanir - modal monte kalip baska bir kayda
   *  gecince onceki kaydin "Evet, sil" sorusu tasinmasin diye. */
  sifirlaAnahtari?: string | null;
}

/** Silme her yerde AYNI iki adimla yapilir: kirmizi "Sil" baglantisi -> yerinde
 *  "Vazgeç / Evet, sil". Eskiden liste satirlari tarayicinin `window.confirm`
 *  kutusunu aciyor, modaller ise satir ici onay gosteriyordu. */
export function SilOnayi({
  ad,
  siliniyor = false,
  onSil,
  satirIci = false,
  sifirlaAnahtari,
}: SilOnayiProps) {
  const [onayda, setOnayda] = useState(false);

  // Kayit degisince acik onayi birak. Efekt yerine render sirasinda ayarlama
  // (React'in "prop degisince state'i duzelt" deseni): modaller monte kaldigi
  // icin efekt bir kare gecikir ve yeni kayit bir an "Evet, sil" sorusuyla
  // acilirdi.
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
        Sil
      </button>
    );
  }

  // Satir icinde butonlar KOMSU kisayollarla ayni metin-baglantisi olcusunde
  // kalir (liste satirlarinin sabit yuksekligini bozmasin); modallerde ise
  // gercek butonlardir - islem seridinin dilini korur.
  if (satirIci) {
    return (
      <span
        className="flex items-center gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-xs text-slate-500">Silinsin mi?</span>
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
          {siliniyor ? "Siliniyor…" : "Evet, sil"}
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
        {siliniyor ? "Siliniyor…" : "Evet, sil"}
      </button>
    </span>
  );
}
