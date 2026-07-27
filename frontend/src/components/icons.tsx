interface IconProps {
  className?: string;
}

const temelOzellikler = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function IconTree({ className }: IconProps) {
  return (
    <svg {...temelOzellikler} className={className}>
      <path d="M12 3 6.5 11h2.7L5 18h6M12 3l5.5 8h-2.7L19 18h-6" />
      <path d="M12 14v7" />
    </svg>
  );
}

/**
 * Marka logosu: sehir silueti (skyline) + tabanda iki yaprak. "Akilli sehir" +
 * "yesil/green" fikrini tek isarette birlestirir. Tum parcalar currentColor ile
 * dolu; yaprak damarlari koyu yesil ince cizgiyle vurgulanir.
 */
export function IconMarkaLogo({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      {/* Sehir silueti (artan yukseklikte binalar) */}
      <g fill="currentColor">
        <rect x="4.4" y="9.5" width="2.7" height="9" rx="0.5" />
        <rect x="7.7" y="5.8" width="2.7" height="12.7" rx="0.5" />
        <rect x="11" y="8" width="2.7" height="10.5" rx="0.5" />
        <rect x="14.3" y="4" width="2.9" height="14.5" rx="0.5" />
      </g>
      {/* Bina pencereleri (arka plani gosteren bosluklar) */}
      <g fill="#059669" fillOpacity="0.9">
        <rect x="15.3" y="6.4" width="0.9" height="0.9" rx="0.2" />
        <rect x="8.7" y="8.2" width="0.9" height="0.9" rx="0.2" />
      </g>
      {/* Yapraklar (tabanda, saga ve sola acilan) */}
      <path
        d="M11.4 18.7c2.1.1 3.9 1.4 4.4 3.4.1.3-.2.6-.5.5-2-.5-3.6-1.9-3.9-3.9Z"
        fill="currentColor"
      />
      <path
        d="M11.4 18.7c-2.1.1-3.9 1.4-4.4 3.4-.1.3.2.6.5.5 2-.5 3.6-1.9 3.9-3.9Z"
        fill="currentColor"
      />
      <path
        d="M12.7 20.1c.9.3 1.6.9 2.1 1.7M10.1 20.1c-.9.3-1.6.9-2.1 1.7"
        stroke="#047857"
        strokeWidth="0.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconBench({ className }: IconProps) {
  return (
    <svg {...temelOzellikler} className={className}>
      <path d="M3 9h18M3 12h18M5 12v7M19 12v7M3 19h4M17 19h4" />
    </svg>
  );
}

export function IconLamp({ className }: IconProps) {
  return (
    <svg {...temelOzellikler} className={className}>
      <path d="M12 2v3M8.5 5h7l-1.3 4.5h-4.4L8.5 5z" />
      <path d="M12 9.5V21M9 21h6" />
    </svg>
  );
}

/** Yol tarifi / navigasyon - yonlu ok. */
export function IconRoute({ className }: IconProps) {
  return (
    <svg {...temelOzellikler} className={className}>
      <path d="M3 11l18-8-8 18-2-8-8-2z" />
    </svg>
  );
}

/** Sulama sistemi - su damlasi. */
export function IconDrop({ className }: IconProps) {
  return (
    <svg {...temelOzellikler} className={className}>
      <path d="M12 3s6 6.3 6 10.5a6 6 0 0 1-12 0C6 9.3 12 3 12 3z" />
      <path d="M9.5 13.5a2.5 2.5 0 0 0 2.5 2.5" />
    </svg>
  );
}

export function IconPin({ className }: IconProps) {
  return (
    <svg {...temelOzellikler} className={className}>
      <path d="M12 21s6.5-6.1 6.5-11a6.5 6.5 0 0 0-13 0C5.5 14.9 12 21 12 21z" />
      <circle cx="12" cy="10" r="2" />
    </svg>
  );
}

export function IconLayers({ className }: IconProps) {
  return (
    <svg {...temelOzellikler} className={className}>
      <path d="M12 3 3 8l9 5 9-5-9-5z" />
      <path d="M3 12.5 12 17.5l9-5" />
      <path d="M3 16.5 12 21.5l9-5" />
    </svg>
  );
}

export function IconLasso({ className }: IconProps) {
  return (
    <svg {...temelOzellikler} className={className}>
      <rect x="4" y="4" width="16" height="16" strokeDasharray="3.2 3.2" />
    </svg>
  );
}

export function IconRuler({ className }: IconProps) {
  return (
    <svg {...temelOzellikler} className={className}>
      <path d="M4 15 15 4l5 5-11 11-5-5z" />
      <path d="M8 11l1.5 1.5M11 8l1.5 1.5M14 5l1.5 1.5" />
    </svg>
  );
}

export function IconChevronLeft({ className }: IconProps) {
  return (
    <svg {...temelOzellikler} strokeWidth={2} className={className}>
      <path d="M14 6l-6 6 6 6" />
    </svg>
  );
}

export function IconChevronRight({ className }: IconProps) {
  return (
    <svg {...temelOzellikler} strokeWidth={2} className={className}>
      <path d="M10 6l6 6-6 6" />
    </svg>
  );
}

export function IconX({ className }: IconProps) {
  return (
    <svg {...temelOzellikler} strokeWidth={2} className={className}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function IconSearch({ className }: IconProps) {
  return (
    <svg {...temelOzellikler} className={className}>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}

export function IconLogout({ className }: IconProps) {
  return (
    <svg {...temelOzellikler} className={className}>
      <path d="M15 4h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3" />
      <path d="M10 17l-5-5 5-5M4 12h11" />
    </svg>
  );
}

export function IconCamera({ className }: IconProps) {
  return (
    <svg {...temelOzellikler} className={className}>
      <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="13" r="3.2" />
    </svg>
  );
}

export function IconCheck({ className }: IconProps) {
  return (
    <svg {...temelOzellikler} strokeWidth={2} className={className}>
      <path d="M5 12l5 5 9-10" />
    </svg>
  );
}

export function IconUsers({ className }: IconProps) {
  return (
    <svg {...temelOzellikler} className={className}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <path d="M16 5.2a3.2 3.2 0 0 1 0 5.6M17.5 19a5.5 5.5 0 0 0-3-4.9" />
    </svg>
  );
}

export function IconInbox({ className }: IconProps) {
  return (
    <svg {...temelOzellikler} className={className}>
      <path d="M4 13l2.5-7h11L20 13v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-5z" />
      <path d="M4 13h4l1.5 2.5h5L16 13h4" />
    </svg>
  );
}

export function IconPlus({ className }: IconProps) {
  return (
    <svg {...temelOzellikler} strokeWidth={2} className={className}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function IconChartBar({ className }: IconProps) {
  return (
    <svg {...temelOzellikler} className={className}>
      <path d="M4 20V11M10 20V6M16 20v-9" />
      <path d="M3 20h18" />
    </svg>
  );
}

export function IconHistory({ className }: IconProps) {
  return (
    <svg {...temelOzellikler} className={className}>
      <path d="M3 12a9 9 0 1 0 2.6-6.3" />
      <path d="M3 4v4.5h4.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

export function IconRefresh({ className }: IconProps) {
  return (
    <svg {...temelOzellikler} className={className}>
      <path d="M20 11a8 8 0 0 0-14.3-4.5M4 5v3.5h3.5" />
      <path d="M4 13a8 8 0 0 0 14.3 4.5M20 19v-3.5h-3.5" />
    </svg>
  );
}

export function IconBox({ className }: IconProps) {
  return (
    <svg {...temelOzellikler} className={className}>
      <path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5v-9z" />
      <path d="M3.5 7.5 12 12l8.5-4.5M12 12v9" />
    </svg>
  );
}

export function IconWarning({ className }: IconProps) {
  return (
    <svg {...temelOzellikler} className={className}>
      <path d="M10.3 3.9 2.4 17.4a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  );
}

/**
 * GreenAsset marka amblemi (renkli, seffaf zeminli, olceklenebilir SVG).
 * Kullanicinin urettigi logonun vektorel karsiligi: yesil halka + tepede
 * cozulen noktalar, ic kisimda sehir silueti (pencereli binalar), onunde
 * buyuk bir yaprak, tabanda kucuk agaclar ve yesil bir zemin egrisi.
 * Yalniz amblem; "GreenAsset" yazisi canli metin olarak ayri durur.
 */
export function LogoAmblem({ className }: IconProps) {
  return (
    <svg viewBox="0 0 100 100" fill="none" className={className}>
      <defs>
        <linearGradient id="ga-halka" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7cc242" />
          <stop offset="1" stopColor="#1c7d3f" />
        </linearGradient>
        <linearGradient id="ga-bina" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#66bd4a" />
          <stop offset="1" stopColor="#2f8f43" />
        </linearGradient>
        <linearGradient id="ga-yaprak" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8ed94f" />
          <stop offset="1" stopColor="#3aa03d" />
        </linearGradient>
        <linearGradient id="ga-zemin" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#329045" />
          <stop offset="1" stopColor="#1c7d3f" />
        </linearGradient>
      </defs>

      {/* Halka - tepe sagda acik birakilir, orada noktalar devam eder */}
      <path
        d="M59.8 13.3 A38 38 0 1 0 85.7 37"
        stroke="url(#ga-halka)"
        strokeWidth="5"
        strokeLinecap="round"
      />
      {/* Halkadan cozulen noktalar (buyukten kucuge, tepe saga dogru) */}
      <circle cx="78.2" cy="24.6" r="2.6" fill="url(#ga-halka)" />
      <circle cx="70.1" cy="17.8" r="1.9" fill="url(#ga-halka)" />
      <circle cx="61.7" cy="13.9" r="1.3" fill="url(#ga-halka)" />

      {/* Zemin egrisi (binalarin oturdugu yesil taban) */}
      <path
        d="M20 64 C34 74 66 74 80 64 C79 71 69 79 50 79 C31 79 21 71 20 64 Z"
        fill="url(#ga-zemin)"
      />

      {/* Sehir silueti - artan/degisken yukseklikte binalar */}
      <g fill="url(#ga-bina)">
        <rect x="28" y="42" width="8" height="23" rx="1" />
        <rect x="37" y="29" width="9" height="36" rx="1" />
        <rect x="47.5" y="37" width="7.5" height="28" rx="1" />
        <rect x="56" y="46" width="7" height="19" rx="1" />
      </g>
      {/* Pencereler */}
      <g fill="#eaf7dd" fillOpacity="0.92">
        <rect x="30" y="46" width="1.6" height="1.6" />
        <rect x="33" y="46" width="1.6" height="1.6" />
        <rect x="30" y="50" width="1.6" height="1.6" />
        <rect x="33" y="50" width="1.6" height="1.6" />
        <rect x="39.5" y="33" width="1.8" height="1.8" />
        <rect x="42.5" y="33" width="1.8" height="1.8" />
        <rect x="39.5" y="38" width="1.8" height="1.8" />
        <rect x="42.5" y="38" width="1.8" height="1.8" />
        <rect x="39.5" y="43" width="1.8" height="1.8" />
        <rect x="42.5" y="43" width="1.8" height="1.8" />
        <rect x="49.5" y="41" width="1.6" height="1.6" />
        <rect x="52" y="41" width="1.6" height="1.6" />
        <rect x="49.5" y="45" width="1.6" height="1.6" />
        <rect x="52" y="45" width="1.6" height="1.6" />
      </g>

      {/* Kucuk agaclar (bina onunde, sol tabanda) */}
      <g>
        <rect x="23.2" y="58" width="1.6" height="6" fill="#2f8f43" />
        <circle cx="24" cy="56" r="4.2" fill="#4aa845" />
        <rect x="29.2" y="60" width="1.4" height="5" fill="#2f8f43" />
        <circle cx="29.9" cy="58.5" r="3.4" fill="#5bb64a" />
      </g>

      {/* Buyuk yaprak (on planda, tabanda, saga dogru) + damar */}
      <path
        d="M37 58 C42 49 59 47 71 54 C73 63 60 71 47 68 C41 66 37 63 37 58 Z"
        fill="url(#ga-yaprak)"
      />
      <path
        d="M41 61 C51 60 62 58 70 55"
        stroke="#e7f7d8"
        strokeWidth="1.1"
        strokeLinecap="round"
        opacity="0.85"
      />
      <path
        d="M48 63 C50 61 53 59 55 58 M55 64 C57 62 60 60 62 59"
        stroke="#e7f7d8"
        strokeWidth="0.8"
        strokeLinecap="round"
        opacity="0.6"
      />
    </svg>
  );
}

export function IconBell({ className }: IconProps) {
  return (
    <svg {...temelOzellikler} className={className}>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </svg>
  );
}

export function IconMenu({ className }: IconProps) {
  return (
    <svg {...temelOzellikler} className={className}>
      <path d="M3 6h18M3 12h18M3 18h18" />
    </svg>
  );
}
