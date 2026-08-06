/**
 * GLIF KITAPLIGI: secilebilir cizgi glifleri, ham SVG icerigi olarak - tek
 * kaynak. Ayni path'ler hem React ikonu olarak (icons.tsx `tipIkonu`) hem de
 * haritada raster'a cevrilen isaretci goruntusu olarak kullanilir; bu yuzden
 * veri bir React dosyasinda degil burada durur.
 *
 * Anahtarlar tur KODU DEGIL glif adidir: tur sozlugu backend'de yasar ve bir
 * tur kaydi buradaki bir anahtari SECER (`turler.glif`). Boylece admin yeni
 * bir tur eklerken SVG yazmak zorunda kalmaz, hazir bir glif secer; sozlukte
 * karsiligi olmayan tur `VARSAYILAN_GLIF`e duser.
 *
 * Glifler 24x24 viewBox'ta ve yalnizca kontur (dolgusuz) cizilmelidir -
 * haritada beyaz cizgi olarak basilirlar. Renk turun grubundan gelir.
 */
export const GLIF_KITAPLIGI: Record<string, string> = {
  // --- Yeşil alan ve park ---
  agac: '<path d="M12 3 6.5 11h2.7L5 18h6M12 3l5.5 8h-2.7L19 18h-6"/><path d="M12 14v7"/>',
  sulama:
    '<path d="M12 3s6 6.3 6 10.5a6 6 0 0 1-12 0C6 9.3 12 3 12 3z"/><path d="M9.5 13.5a2.5 2.5 0 0 0 2.5 2.5"/>',
  // Salincak (A ayakli)
  oyun_grubu: '<path d="M4 20 12 4l8 16"/><path d="M9 11h6"/><path d="M10.5 11v5h3v-5"/>',
  // Bank: sirtlik + iki oturma latasi + ayaklar
  bank: '<path d="M5 8h14"/><path d="M3 11h18M3 14h18"/><path d="M6 14v5M18 14v5"/>',
  cop_kutusu:
    '<path d="M4 7h16"/><path d="M10 4h4"/><path d="M6 7l1 13h10l1-13"/><path d="M10 11v5M14 11v5"/>',
  // --- Aydınlatma ve elektrik ---
  direk: '<path d="M12 2v3M8.5 5h7l-1.3 4.5h-4.4L8.5 5z"/><path d="M12 9.5V21M9 21h6"/>',
  // Pano govdesi + simsek
  elektrik_panosu:
    '<rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M13 7l-3 5h3l-2 5"/>',
  // --- Yol ve kaldırım ---
  // Daralan yol + kesikli orta seridi
  yol: '<path d="M8 3 5 21M16 3l3 18"/><path d="M12 4v3M12 11v3M12 18v3"/>',
  // Kaldirim profili (basamak) + zemin cizgisi
  kaldirim: '<path d="M3 17h7v-4h5V9h6"/><path d="M3 21h18"/>',
  // Rogar kapagi: daire + havalandirma yuvalari
  rogar: '<circle cx="12" cy="12" r="8"/><path d="M8 10h8M8 14h8"/>',
  trafik_levhasi:
    '<rect x="4" y="4" width="16" height="9" rx="1.5"/><path d="M8.5 8.5h7"/><path d="M12 13v8"/>',
  // --- Altyapı / su ---
  // Boru hatti + ortasinda vana
  su_hatti:
    '<path d="M3 12h6M15 12h6"/><rect x="9" y="9" width="6" height="6" rx="1"/><path d="M12 4v5"/>',
  // --- Diğer ---
  diger:
    '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7"/><path d="M12 17.5h.01"/>',
  // --- Yalnizca glif olarak var, karsiliginda hazir bir tur yok ---
  // Yeni tur eklenirken secilebilsinler diye: bir belediyenin ekleyebilecegi
  // ilk turler (kamera, yangin muslugu, otobus duragi, cesme) icin.
  kamera:
    '<path d="M3 8h11v8H3z"/><path d="M14 11l6-3v8l-6-3"/><circle cx="7" cy="12" r="2"/>',
  yangin_muslugu:
    '<path d="M9 8a3 3 0 0 1 6 0v9H9z"/><path d="M7 17h10"/><path d="M7 11H5M19 11h-2"/><path d="M12 3v2"/>',
  durak:
    '<path d="M5 6h14v8H5z"/><path d="M5 14v6M19 14v6"/><path d="M9 10h6"/>',
  cesme:
    '<path d="M12 4v8"/><path d="M9 4h6"/><path d="M6 12h12l-1.5 8h-9z"/>',
  bina: '<path d="M4 21V6l8-3 8 3v15"/><path d="M9 21v-6h6v6"/><path d="M8 10h.01M12 10h.01M16 10h.01"/>',
  uyari: '<path d="M12 4 2.5 20h19z"/><path d="M12 10v4"/><path d="M12 17h.01"/>',
};

/** Glifi secilmemis ya da bilinmeyen bir tur bu glife duser. */
export const VARSAYILAN_GLIF = "diger";

/** Admin ekranindaki glif secicisi bu listeden beslenir. */
export const GLIF_ANAHTARLARI = Object.keys(GLIF_KITAPLIGI);
