import type { ReactElement } from "react";

import { GLIF_KITAPLIGI } from "../data/tipGlifleri";
import { turGlifi } from "../data/turSozlugu";
import type { AssetType } from "../types/asset";

interface IconProps {
  className?: string;
}

export type TipIkonu = (props: IconProps) => ReactElement;

const temelOzellikler = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/** Bir turun ham glif dizgisini (data/tipGlifleri.ts) cizen ic bilesen.
 *  Dizgiler derleme zamani sabitleri oldugundan enjeksiyon yuzeyi yok. */
function TipGlifi({ ic, className }: IconProps & { ic: string }) {
  return (
    <svg
      {...temelOzellikler}
      className={className}
      dangerouslySetInnerHTML={{ __html: ic }}
    />
  );
}

export function IconTree({ className }: IconProps) {
  return <TipGlifi ic={GLIF_KITAPLIGI.agac} className={className} />;
}

/** Marka logosu: sehir silueti + tabanda iki yaprak; parcalar currentColor. */
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

/** Yol tarifi / navigasyon - yonlu ok. */
export function IconRoute({ className }: IconProps) {
  return (
    <svg {...temelOzellikler} className={className}>
      <path d="M3 11l18-8-8 18-2-8-8-2z" />
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

/** Katlanmis harita paftasi. `IconPin`'den bilincli olarak ayridir: pin
 *  "su nokta", bu ise "haritanin kendisi" demektir - konum secme akisinda
 *  "haritayi ac, kendin isaretle" ile "GPS'imi kullan" ayni ikonu tasimamali. */
export function IconHarita({ className }: IconProps) {
  return (
    <svg {...temelOzellikler} className={className}>
      <path d="M9 4 3 6.5v13L9 17l6 3 6-2.5v-13L15 7 9 4z" />
      <path d="M9 4v13M15 7v13" />
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

/** Harita lejanti ikonu (katman kartinin basligi). IconLayers'tan bilincli
 *  olarak farklidir: o, harita cesidi seciciye ait. */
export function IconLegend({ className }: IconProps) {
  return (
    <svg {...temelOzellikler} className={className}>
      <circle cx="5" cy="6.5" r="1.75" />
      <circle cx="5" cy="12" r="1.75" />
      <circle cx="5" cy="17.5" r="1.75" />
      <path d="M10 6.5h10M10 12h8M10 17.5h9" />
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

export function IconPencil({ className }: IconProps) {
  return (
    <svg {...temelOzellikler} className={className}>
      <path d="m14.5 3.5 6 6L8 22H2v-6z" />
      <path d="m12.5 5.5 6 6" />
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

export function IconTrash({ className }: IconProps) {
  return (
    <svg {...temelOzellikler} className={className}>
      <path d="M4 7h16" />
      <path d="M10 4h4" />
      <path d="M6 7l1 13h10l1-13" />
      <path d="M10 11v5M14 11v5" />
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

/** "Konumumu goster" - artinin ustundeki yuvarlak dugme. */
export function IconKonum({ className }: IconProps) {
  return (
    <svg {...temelOzellikler} className={className}>
      <circle cx="12" cy="12" r="3.5" />
      <circle cx="12" cy="12" r="8" />
      <path d="M12 1.5v3M12 19.5v3M22.5 12h-3M4.5 12h-3" />
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

/** Kelime markasi: "haber" / "ver +" iki satir. Harfler PATH'tir, font
 *  bagimliligi yoktur - kullanicida font olmasa da logo birebir ayni cizilir.
 *  Kaynak cizimin (620x300) koordinat sistemi korunur; disaridan
 *  translate/scale ile yerlestirilir. Ustteki satir koyu, alttaki yesil.
 *
 *  Kaynak cizimdeki ucuncu satir ("Akilli Sehir - Hizli Cozum") bilincli
 *  olarak ALINMADI: yatay kilitlenmede logo 8-14 px yuksekliginde kullaniliyor
 *  ve o olcekte 6 birimlik slogan satiri okunmayan bir lekeye donusuyor.
 *  Slogan gerekirse logonun yaninda gercek metin olarak yazilmali. */
function KelimeMarkasi({ ustRenk, altRenk }: { ustRenk: string; altRenk: string }) {
  return (
    <>
      {/* haber */}
      <path
        fill={ustRenk}
        d="M197.873 135V73.1818H210.943V98.6879H237.475V73.1818H250.515V135H237.475V109.464H210.943V135H197.873ZM274.27 135.875C271.312 135.875 268.676 135.362 266.362 134.336C264.048 133.29 262.217 131.75 260.868 129.718C259.54 127.665 258.876 125.109 258.876 122.051C258.876 119.475 259.349 117.312 260.295 115.561C261.241 113.81 262.528 112.402 264.158 111.335C265.788 110.269 267.64 109.464 269.712 108.92C271.805 108.377 273.999 107.995 276.293 107.773C278.989 107.492 281.162 107.23 282.812 106.989C284.463 106.727 285.66 106.345 286.404 105.842C287.149 105.339 287.521 104.594 287.521 103.608V103.427C287.521 101.515 286.918 100.036 285.71 98.9897C284.523 97.9433 282.833 97.4201 280.639 97.4201C278.325 97.4201 276.484 97.9332 275.115 98.9595C273.747 99.9657 272.842 101.233 272.399 102.763L260.506 101.797C261.11 98.9796 262.297 96.5447 264.068 94.4922C265.839 92.4195 268.123 90.8298 270.92 89.723C273.737 88.5961 276.997 88.0327 280.7 88.0327C283.275 88.0327 285.74 88.3345 288.095 88.9382C290.469 89.5419 292.572 90.4776 294.403 91.7454C296.255 93.0131 297.714 94.6431 298.78 96.6353C299.847 98.6074 300.38 100.972 300.38 103.729V135H288.185V128.571H287.823C287.079 130.02 286.083 131.297 284.835 132.404C283.587 133.491 282.088 134.346 280.337 134.97C278.587 135.574 276.564 135.875 274.27 135.875ZM277.953 127.001C279.844 127.001 281.515 126.629 282.963 125.884C284.412 125.12 285.549 124.093 286.374 122.805C287.199 121.518 287.612 120.059 287.612 118.429V113.509C287.209 113.77 286.656 114.012 285.952 114.233C285.268 114.434 284.493 114.625 283.627 114.806C282.762 114.967 281.897 115.118 281.032 115.259C280.166 115.38 279.382 115.491 278.677 115.591C277.168 115.813 275.85 116.165 274.723 116.648C273.596 117.131 272.721 117.785 272.097 118.61C271.473 119.415 271.161 120.421 271.161 121.628C271.161 123.379 271.795 124.717 273.063 125.643C274.351 126.548 275.981 127.001 277.953 127.001ZM310.597 135V73.1818H323.456V96.424H323.849C324.412 95.1764 325.227 93.9086 326.294 92.6207C327.38 91.3127 328.789 90.2261 330.519 89.3608C332.27 88.4754 334.443 88.0327 337.039 88.0327C340.42 88.0327 343.539 88.9181 346.396 90.6889C349.254 92.4396 351.538 95.0858 353.248 98.6275C354.959 102.149 355.814 106.566 355.814 111.879C355.814 117.05 354.979 121.417 353.309 124.979C351.659 128.52 349.405 131.207 346.547 133.038C343.71 134.849 340.531 135.755 337.009 135.755C334.514 135.755 332.391 135.342 330.64 134.517C328.91 133.692 327.491 132.656 326.384 131.408C325.277 130.14 324.432 128.862 323.849 127.575H323.275V135H310.597ZM323.184 111.818C323.184 114.575 323.567 116.98 324.331 119.032C325.096 121.085 326.203 122.685 327.652 123.832C329.101 124.959 330.861 125.522 332.934 125.522C335.027 125.522 336.798 124.949 338.247 123.801C339.695 122.634 340.792 121.025 341.537 118.972C342.301 116.899 342.684 114.515 342.684 111.818C342.684 109.142 342.311 106.787 341.567 104.755C340.822 102.723 339.726 101.133 338.277 99.9858C336.828 98.8388 335.047 98.2653 332.934 98.2653C330.841 98.2653 329.07 98.8187 327.622 99.9254C326.193 101.032 325.096 102.602 324.331 104.634C323.567 106.667 323.184 109.061 323.184 111.818ZM385.523 135.906C380.754 135.906 376.649 134.94 373.208 133.008C369.787 131.056 367.151 128.299 365.3 124.737C363.448 121.155 362.523 116.919 362.523 112.029C362.523 107.26 363.448 103.075 365.3 99.4727C367.151 95.8706 369.757 93.0634 373.117 91.0511C376.498 89.0388 380.462 88.0327 385.01 88.0327C388.069 88.0327 390.916 88.5257 393.552 89.5117C396.209 90.4776 398.523 91.9366 400.495 93.8885C402.487 95.8404 404.037 98.2955 405.143 101.254C406.25 104.192 406.804 107.633 406.804 111.577V115.108H367.654V107.14H394.699C394.699 105.288 394.297 103.648 393.492 102.219C392.687 100.791 391.57 99.6739 390.142 98.869C388.733 98.0439 387.093 97.6314 385.222 97.6314C383.27 97.6314 381.539 98.0842 380.03 98.9897C378.541 99.8751 377.373 101.072 376.528 102.582C375.683 104.071 375.251 105.731 375.23 107.562V115.138C375.23 117.433 375.653 119.415 376.498 121.085C377.363 122.755 378.581 124.043 380.15 124.949C381.72 125.854 383.581 126.307 385.735 126.307C387.163 126.307 388.471 126.106 389.659 125.703C390.846 125.301 391.862 124.697 392.707 123.892C393.552 123.087 394.196 122.101 394.639 120.934L406.532 121.719C405.928 124.576 404.691 127.071 402.819 129.205C400.968 131.317 398.573 132.968 395.635 134.155C392.717 135.322 389.347 135.906 385.523 135.906ZM415.195 135V88.6364H427.661V96.7259H428.144C428.989 93.8482 430.408 91.675 432.4 90.206C434.392 88.7169 436.686 87.9723 439.282 87.9723C439.926 87.9723 440.62 88.0125 441.365 88.093C442.11 88.1735 442.764 88.2842 443.327 88.4251V99.8349C442.723 99.6538 441.888 99.4928 440.822 99.3519C439.755 99.2111 438.779 99.1406 437.894 99.1406C436.002 99.1406 434.312 99.5531 432.823 100.378C431.354 101.183 430.187 102.31 429.321 103.759C428.476 105.208 428.054 106.878 428.054 108.77V135H415.195Z"
      />
      {/* ver */}
      <path
        fill={altRenk}
        d="M209.541 148.182L224.483 195.149H225.056L240.028 148.182H254.516L233.206 210H216.363L195.022 148.182H209.541ZM277.615 210.906C272.846 210.906 268.741 209.94 265.3 208.008C261.879 206.056 259.243 203.299 257.391 199.737C255.54 196.155 254.614 191.919 254.614 187.029C254.614 182.26 255.54 178.075 257.391 174.473C259.243 170.871 261.849 168.063 265.209 166.051C268.59 164.039 272.554 163.033 277.102 163.033C280.161 163.033 283.008 163.526 285.644 164.512C288.301 165.478 290.615 166.937 292.587 168.888C294.579 170.84 296.128 173.295 297.235 176.254C298.342 179.192 298.895 182.633 298.895 186.577V190.108H259.746V182.14H286.791C286.791 180.288 286.389 178.648 285.584 177.219C284.779 175.791 283.662 174.674 282.233 173.869C280.825 173.044 279.185 172.631 277.313 172.631C275.361 172.631 273.631 173.084 272.122 173.99C270.632 174.875 269.465 176.072 268.62 177.582C267.775 179.071 267.342 180.731 267.322 182.562V190.138C267.322 192.433 267.745 194.415 268.59 196.085C269.455 197.755 270.673 199.043 272.242 199.949C273.812 200.854 275.673 201.307 277.826 201.307C279.255 201.307 280.563 201.106 281.75 200.703C282.938 200.301 283.954 199.697 284.799 198.892C285.644 198.087 286.288 197.101 286.731 195.934L298.624 196.719C298.02 199.576 296.782 202.071 294.911 204.205C293.06 206.317 290.665 207.968 287.727 209.155C284.809 210.322 281.439 210.906 277.615 210.906ZM307.287 210V163.636H319.753V171.726H320.236C321.081 168.848 322.5 166.675 324.492 165.206C326.484 163.717 328.778 162.972 331.374 162.972C332.018 162.972 332.712 163.013 333.457 163.093C334.201 163.174 334.855 163.284 335.419 163.425V174.835C334.815 174.654 333.98 174.493 332.913 174.352C331.847 174.211 330.871 174.141 329.986 174.141C328.094 174.141 326.404 174.553 324.915 175.378C323.446 176.183 322.278 177.31 321.413 178.759C320.568 180.208 320.145 181.878 320.145 183.77V210H307.287Z"
      />
      {/* Arti: "ver"e bitisik (marka adi "haber ver +", ayri bir isaret degil) */}
      <path
        fill={altRenk}
        d="M357.366 182.95V156.803H363.977V182.95H357.366ZM347.598 173.182V166.571H373.746V173.182H347.598Z"
      />
    </>
  );
}

/** Amblemin ic cizimi: harita pini (konum/ihbar) + icinde sehir silueti
 *  (varlik) + tabanda filizlenen fidan (yesil alan) + sag ustte sinyal
 *  yaylari (haber verme). Kaynak cizimin (620x300) koordinat sisteminde
 *  durur; disaridan translate/scale ile yerlestirilir.
 *  Hem tek basina (LogoAmblem) hem tam logo icinde (HaberVerLogo) kullanilir. */
function AmblemIci() {
  return (
    <>
      <defs>
        <linearGradient
          id="hv-filiz-govde"
          x1="64.99"
          y1="164"
          x2="64.99"
          y2="172"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#865B50" />
          <stop offset="1" stopColor="#307E38" />
        </linearGradient>
        <linearGradient
          id="hv-zemin"
          x1="108.44"
          y1="167"
          x2="108.44"
          y2="172"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#ffffff" />
          <stop offset="0.413" stopColor="#98BF9C" />
          <stop offset="1" stopColor="#307E38" />
        </linearGradient>
      </defs>

      {/* Pin govdesi */}
      <path
        d="M96 221C96 221 176 155 176 113C176 91.7827 167.571 71.4344 152.569 56.4315C137.566 41.4285 117.217 33 96 33C74.7827 33 54.4344 41.4285 39.4315 56.4315C24.4285 71.4344 16 91.7827 16 113C16 155 96 221 96 221Z"
        fill="#35953F"
      />

      {/* Sehir: iki bina (pinin icinde beyaz oyuk) */}
      <path
        d="M117 167.977V82.0233L89 88.5L89 167.977C89 168.542 89.4323 169 89.9655 169H116.034C116.568 169 117 168.542 117 167.977Z"
        fill="white"
      />
      <path
        d="M146 168.245V109.5L120 101.5V168.245C120 168.798 120.529 169.245 121.182 169.245H144.818C145.471 169.245 146 168.798 146 168.245Z"
        fill="white"
      />

      {/* Bina pencereleri */}
      <g fill="#2F7D4F">
        <path d="M101 95H94V104H101V95Z" />
        <path d="M112 95H105V104H112V95Z" />
        <path d="M101 112H94V121H101V112Z" />
        <path d="M112 112H105V121H112V112Z" />
        <path d="M101 129H94V138H101V129Z" />
        <path d="M112 129H105V138H112V129Z" />
        <path d="M101 146H94V155H101V146Z" />
        <path d="M112 146H105V155H112V146Z" />
        <path d="M132 115H126V123H132V115Z" />
        <path d="M141 115H135V123H141V115Z" />
        <path d="M132 131H126V139H132V131Z" />
        <path d="M141 131H135V139H141V131Z" />
        <path d="M132 147H126V155H132V147Z" />
        <path d="M141 147H135V155H141V147Z" />
      </g>

      {/* Filiz: yapraklar + govde */}
      <path
        d="M48 114.101C48 114.101 49.2909 110.222 52.335 107.789C55.3791 105.356 83.5991 115.779 83.5991 115.779C83.5991 115.779 88.5291 117.538 91.4456 122.197C93.4059 125.331 94.5003 129.964 92.4231 135.558C87.4719 148.882 74.6262 147.341 71.2794 146.581C69.7069 146.225 65.8766 145.211 65.8766 145.211C65.8766 145.211 57.1269 152.436 46.5975 146.895C38.5809 142.677 39.5744 136.371 39.5744 136.371C39.5744 136.371 34.1769 130.973 36.5144 123.456C39.33 114.403 48 114.101 48 114.101Z"
        fill="#5B9821"
      />
      <path
        d="M66.2591 130.224C73.5637 129.007 75.8428 125.889 77.8244 122.999C80.0078 119.812 79.4234 117.139 80.9428 117.065C82.4622 116.991 83.6734 119.732 82.0053 124.518C79.6466 131.287 74.7962 132.28 74.7006 134.102C74.6262 135.547 79.8644 135.648 84.5925 133.343C91.4403 129.996 91.4403 122.16 91.4403 122.16C91.4403 122.16 90.2237 119.647 87.865 117.899C85.5062 116.151 83.7531 115.237 83.7531 115.237C83.7531 115.237 80.9375 104.666 68.1609 102.913C55.3844 101.159 50.1303 110.068 50.1303 110.068C50.1303 110.068 50.5872 112.958 52.7919 116.305C54.5503 118.977 56.3672 118.893 56.2131 120.412C56.1122 121.4 52.9406 121.703 49.5937 120.258C46.5444 118.94 45.79 117.139 44.9559 117.139C44.1219 117.139 37.205 120.991 40.0897 129.156C42.3741 135.622 49.9231 136.833 51.2725 137.067C55.2303 137.752 57.5094 135.165 54.6937 133.109C51.8781 131.053 48.7597 129.836 49.445 127.786C50.1834 125.565 52.8184 127.881 55.9847 129.252C59.1137 130.607 62.9016 130.787 66.2591 130.224Z"
        fill="#8BC02B"
      />
      <path
        d="M51.7347 138.703C51.7347 138.703 53.4878 138.602 54.2103 138.395C54.9328 138.188 55.9103 137.571 55.9103 137.571C55.9103 137.571 62.6837 144.658 63.385 145.253C64.0703 145.832 64.8778 137.003 64.8778 137.003C64.8778 137.003 66.4237 137.242 67.8687 137.013C69.7706 136.711 71.0669 136.105 71.0669 136.105C71.0669 136.105 70.1425 141.54 69.7812 143.601C69.5528 144.924 69.4731 148.6 69.4731 148.6L64.5219 152.723L60.7553 150.194C60.7553 150.194 60.7447 149.2 60.1869 148.526C58.455 146.433 51.7347 138.703 51.7347 138.703ZM69.0056 150.821L72.7722 146.284C72.7722 146.284 74.1109 146.385 75.0937 146.385C76.0712 146.385 77.7766 146.178 77.7766 146.178C77.7766 146.178 74.6847 150.353 73.0325 152.414C71.3803 154.476 69.2181 157.057 69.2181 157.057L67.1569 151.076L69.0056 150.821Z"
        fill="#6D4B41"
      />
      <path
        d="M66.3281 147.208C64.7875 147.346 60.7606 150.199 60.7606 150.199C60.7606 150.199 60.9678 155.044 60.8138 157.78C60.6597 160.516 59.5812 164.984 60.5747 166.115C61.4353 167.093 68.6709 167.279 69.7494 166.142C70.8331 165.005 69.7813 160.309 69.7813 157.265C69.7813 154.221 69.4731 148.6 69.4731 148.6C69.4731 148.6 68.0813 147.054 66.3281 147.208Z"
        fill="#865B50"
      />
      <path
        d="M64.0329 172.064C65.574 172.008 69.602 170.852 69.602 170.852C69.602 170.852 69.3948 168.887 69.5489 167.777C69.703 166.667 70.5 165.5 69.788 164.397C68.9271 164 61.6894 163.925 60.6106 164.386C60.2004 165.069 60.5787 166.751 60.5787 167.986C60.5787 169.221 60.8869 171.5 60.8869 171.5C60.8869 171.5 62.2792 172.127 64.0329 172.064Z"
        fill="url(#hv-filiz-govde)"
      />

      {/* Zemin: sehir ve filiz ayni yere basar */}
      <path
        d="M69.7148 167H146V167.528C146 168.837 145.829 170.141 145.49 171.405L145.465 171.5C145.246 171.813 144.889 172 144.507 172H70L69.5 170.5V169.5V168.5V167.5L69.7148 167Z"
        fill="url(#hv-zemin)"
      />

      {/* Sinyal yaylari: "haber verme" hareketi */}
      <path
        d="M149.209 34.8025C157.045 36.1841 164.011 40.6219 168.575 47.1394C173.138 53.657 174.926 61.7206 173.544 69.5562"
        fill="none"
        stroke="#8DC63F"
        strokeWidth="7"
        strokeLinecap="round"
      />
      <path
        d="M151.467 22C162.698 23.9803 172.682 30.3411 179.224 39.6829C185.765 49.0248 188.327 60.5826 186.347 71.8136"
        fill="none"
        stroke="#8DC63F"
        strokeWidth="7"
        strokeLinecap="round"
      />
    </>
  );
}

/** Amblemin cizim kutusu (kaynak 620x300 icindeki gercek sinirlar) — 64x64'e
 *  oturtan donusum bundan turetilir: olcek 64/202.5, x ortalanir.
 *  Kutu x:16-189.85, y:18.5-221. Sinyal yaylari stroke oldugu icin sinira
 *  stroke-width'in yarisi (3.5) eklenir; aksi halde yayin ucu kirpilir. */
const AMBLEM_DONUSUMU = "translate(4.53 0) scale(0.316) translate(-16 -18.5)";

export function LogoAmblem({ className }: IconProps) {
  return (
    <svg viewBox="0 0 64 64" fill="none" className={className}>
      <g transform={AMBLEM_DONUSUMU}>
        <AmblemIci />
      </g>
    </svg>
  );
}

/** Amblemin tek renk surumu: gradyansiz, currentColor. Fotograf uzerinde,
 *  koyu zeminli simgede ve baskida kullanilir. Ince ayrintilar (pencere
 *  izgarasi, filizin govdesi) tek renkte lekeye dondugu icin sadelestirilir:
 *  pin + iki bina oyugu + filiz + sinyal yaylari. */
export function LogoAmblemTek({ className }: IconProps) {
  return (
    <svg viewBox="0 0 64 64" fill="none" className={className}>
      <g transform={AMBLEM_DONUSUMU} fill="currentColor">
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M96 221C96 221 176 155 176 113C176 91.7827 167.571 71.4344 152.569 56.4315C137.566 41.4285 117.217 33 96 33C74.7827 33 54.4344 41.4285 39.4315 56.4315C24.4285 71.4344 16 91.7827 16 113C16 155 96 221 96 221ZM117 82.0233V167.977C117 168.542 116.568 169 116.034 169H89.9655C89.4323 169 89 168.542 89 167.977V88.5L117 82.0233ZM146 109.5V168.245C146 168.798 145.471 169.245 144.818 169.245H121.182C120.529 169.245 120 168.798 120 168.245V101.5L146 109.5Z"
        />
        <path d="M48 114.101C48 114.101 49.2909 110.222 52.335 107.789C55.3791 105.356 83.5991 115.779 83.5991 115.779C83.5991 115.779 88.5291 117.538 91.4456 122.197C93.4059 125.331 94.5003 129.964 92.4231 135.558C87.4719 148.882 74.6262 147.341 71.2794 146.581C69.7069 146.225 65.8766 145.211 65.8766 145.211C65.8766 145.211 57.1269 152.436 46.5975 146.895C38.5809 142.677 39.5744 136.371 39.5744 136.371C39.5744 136.371 34.1769 130.973 36.5144 123.456C39.33 114.403 48 114.101 48 114.101Z" />
        <path d="M60.7606 150.199C60.7606 150.199 64.7875 147.346 66.3281 147.208C68.0813 147.054 69.4731 148.6 69.4731 148.6C69.4731 148.6 69.7813 154.221 69.7813 157.265C69.7813 160.309 70.8331 165.005 69.7494 166.142C68.6709 167.279 61.4353 167.093 60.5747 166.115C59.5812 164.984 60.6597 160.516 60.8138 157.78C60.9678 155.044 60.7606 150.199 60.7606 150.199Z" />
      </g>
      <g
        transform={AMBLEM_DONUSUMU}
        fill="none"
        stroke="currentColor"
        strokeWidth="7"
        strokeLinecap="round"
      >
        <path d="M149.209 34.8025C157.045 36.1841 164.011 40.6219 168.575 47.1394C173.138 53.657 174.926 61.7206 173.544 69.5562" />
        <path d="M151.467 22C162.698 23.9803 172.682 30.3411 179.224 39.6829C185.765 49.0248 188.327 60.5826 186.347 71.8136" />
      </g>
    </svg>
  );
}

/** Tam logo (yatay kilitlenme): amblem + kelime markasi yan yana. Harfler
 *  path'tir, font bagimliligi yoktur. `koyu` koyu zeminler icindir: "haber"
 *  satiri beyaza doner. */
export function HaberVerLogo({
  className,
  koyu = false,
}: IconProps & { koyu?: boolean }) {
  return (
    <svg
      viewBox="0 0 168 64"
      fill="none"
      className={className}
      role="img"
      aria-label="haber ver +"
    >
      <g transform={AMBLEM_DONUSUMU}>
        <AmblemIci />
      </g>
      {/* Kelime markasi kaynak cizimin kendi koordinatlarinda; amblemin sagina
          yerlestirilir. Yazi kutusu x:195-443.3 (248.3), y:73.2-210.9 (137.7);
          0.378 olcekle 93.9x52 olur ve 64 birimlik kutuda dikey ortalanir. */}
      <g transform="translate(66 6) scale(0.378) translate(-195 -73.2)">
        <KelimeMarkasi
          ustRenk={koyu ? "#ffffff" : "#1C2B21"}
          altRenk={koyu ? "#8DC63F" : "#307E38"}
        />
      </g>
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

/** Tur -> ikon. Sozluk calisma zamaninda geldigi icin bu bir tablo degil
 *  FONKSIYONDUR; sonuclar kod basina onbelleklenir ki her render'da yeni bir
 *  bilesen tipi uretilip agac gereksiz yere yeniden monte edilmesin.
 *
 *  Renk icin data/turSozlugu.ts `turRengi`, ham glif icin `turGlifi`. */
const IKON_ONBELLEGI = new Map<string, TipIkonu>();

export function tipIkonu(tur: AssetType): TipIkonu {
  const hazir = IKON_ONBELLEGI.get(tur);
  if (hazir) return hazir;
  const ic = turGlifi(tur);
  const ikon: TipIkonu = ({ className }: IconProps) => (
    <TipGlifi ic={ic} className={className} />
  );
  IKON_ONBELLEGI.set(tur, ikon);
  return ikon;
}

/** Sozluk degistiginde (admin bir turun glifini degistirdi) onbellek bayat
 *  kalir; `useTurler` yeni veriyi yazdiktan sonra burayi bosaltir. */
export function tipIkonlariniSifirla(): void {
  IKON_ONBELLEGI.clear();
}

/** Glif kitapligindan tek bir anahtarin onizlemesi; admin'in tur ekranindaki
 *  glif secicisi bunu kullanir (henuz bir ture bagli olmayan glifi cizmek
 *  gerekir, `tipIkonu` ise tur kodu bekler). */
export function GlifIkonu({
  anahtar,
  className,
}: IconProps & { anahtar: string }) {
  return <TipGlifi ic={GLIF_KITAPLIGI[anahtar] ?? ""} className={className} />;
}
