const DUNYA_YARICAPI_M = 6371000;

function radyan(derece: number): number {
  return (derece * Math.PI) / 180;
}

/** Iki koordinat (lon,lat) arasi kus ucusu mesafe (metre), haversine formulu. */
export function mesafeMetre(a: [number, number], b: [number, number]): number {
  const [lon1, lat1] = a;
  const [lon2, lat2] = b;
  const dLat = radyan(lat2 - lat1);
  const dLon = radyan(lon2 - lon1);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radyan(lat1)) * Math.cos(radyan(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * DUNYA_YARICAPI_M * Math.asin(Math.sqrt(h));
}

/** Bir nokta dizisindeki ardisik segmentlerin toplam uzunlugu (metre). */
export function toplamMesafeMetre(noktalar: [number, number][]): number {
  let toplam = 0;
  for (let i = 1; i < noktalar.length; i++) {
    toplam += mesafeMetre(noktalar[i - 1], noktalar[i]);
  }
  return toplam;
}

/** Poligon alani (m2): koordinatlar yerel bir metre duzlemine izdusurulup
 *  shoelace ile hesaplanir. Sehir olceginde yeterince dogru bir yaklastirma. */
export function poligonAlaniM2(noktalar: [number, number][]): number {
  if (noktalar.length < 3) return 0;

  const enlemOrt =
    radyan(noktalar.reduce((t, [, lat]) => t + lat, 0) / noktalar.length);
  const x = (lon: number) => radyan(lon) * DUNYA_YARICAPI_M * Math.cos(enlemOrt);
  const y = (lat: number) => radyan(lat) * DUNYA_YARICAPI_M;

  let alan = 0;
  for (let i = 0; i < noktalar.length; i++) {
    const [lon1, lat1] = noktalar[i];
    const [lon2, lat2] = noktalar[(i + 1) % noktalar.length];
    alan += x(lon1) * y(lat2) - x(lon2) * y(lat1);
  }
  return Math.abs(alan) / 2;
}

/** Nokta dizisinin ortalama merkezi (etiket yerlesimi icin yeterli, agirliksiz). */
export function poligonMerkezi(noktalar: [number, number][]): [number, number] {
  const lon = noktalar.reduce((t, [x]) => t + x, 0) / noktalar.length;
  const lat = noktalar.reduce((t, [, y]) => t + y, 0) / noktalar.length;
  return [lon, lat];
}

/** Bir cizginin uzunlugunun ortasindaki nokta (etiket yerlesimi icin).
 *  Cizgilerde `poligonMerkezi` kullanilmaz: nokta ortalamasi L seklindeki bir
 *  guzergahta hattin hic gecmedigi bir yere duser. */
export function cizgiOrtaNoktasi(noktalar: [number, number][]): [number, number] {
  if (noktalar.length === 0) return [0, 0];
  if (noktalar.length === 1) return noktalar[0];

  let kalan = toplamMesafeMetre(noktalar) / 2;
  for (let i = 1; i < noktalar.length; i++) {
    const [lon1, lat1] = noktalar[i - 1];
    const [lon2, lat2] = noktalar[i];
    const segment = mesafeMetre(noktalar[i - 1], noktalar[i]);
    if (segment === 0) continue;
    if (kalan <= segment) {
      const t = kalan / segment;
      return [lon1 + (lon2 - lon1) * t, lat1 + (lat2 - lat1) * t];
    }
    kalan -= segment;
  }
  return noktalar[noktalar.length - 1];
}

/** Cok parcali bir alanin (orn. adalardan olusan bir ilce) toplam alani.
 *  Tek halkada `poligonAlaniM2` ile ayni sonucu verir. */
export function cokHalkaliAlanM2(halkalar: [number, number][][]): number {
  return halkalar.reduce((toplam, halka) => toplam + poligonAlaniM2(halka), 0);
}

/** En genis halkanin merkezi: etiket en buyuk parcanin ustune konsun diye. */
export function enBuyukHalkaMerkezi(halkalar: [number, number][][]): [number, number] {
  const enBuyuk = halkalar.reduce((buyuk, halka) =>
    poligonAlaniM2(halka) > poligonAlaniM2(buyuk) ? halka : buyuk
  );
  return poligonMerkezi(enBuyuk);
}

/** Kapali halkalarin sondaki tekrar noktasini atar. Backend GeoJSON kuralinca
 *  kapali dondurur; sekil duzenlemede bu tekrar iki tutamagin ust uste
 *  binmesi demek olurdu. */
export function halkayiAc(halka: [number, number][]): [number, number][] {
  if (halka.length < 2) return halka;
  const ilk = halka[0];
  const son = halka[halka.length - 1];
  return ilk[0] === son[0] && ilk[1] === son[1] ? halka.slice(0, -1) : halka;
}

export function halkalariAc(halkalar: [number, number][][]): [number, number][][] {
  return halkalar.map(halkayiAc);
}

/** Nokta dizisinin sinir kutusu ([[minLon,minLat],[maxLon,maxLat]]). */
export function poligonSinirKutusu(
  noktalar: [number, number][]
): [[number, number], [number, number]] {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const [lon, lat] of noktalar) {
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return [
    [minLon, minLat],
    [maxLon, maxLat],
  ];
}

/** Ray-casting: nokta halkanin icinde mi? Halka kapali gelebilir (son nokta =
 *  ilk nokta); algoritma kenarlari cift saymadigi icin bu sorun degildir. */
export function noktaHalkadaMi(
  nokta: [number, number],
  halka: [number, number][]
): boolean {
  const [x, y] = nokta;
  let icinde = false;
  for (let i = 0, j = halka.length - 1; i < halka.length; j = i++) {
    const [xi, yi] = halka[i];
    const [xj, yj] = halka[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      icinde = !icinde;
    }
  }
  return icinde;
}

/** Halka listesi bu projede her zaman "ayri parcalar" demektir (delik degil):
 *  Adalar gibi cok parcali ilcelerde her halka bagimsiz bir poligondur. Bu
 *  yuzden nokta HERHANGI bir halkanin icindeyse alandadir. */
export function noktaAlandaMi(
  nokta: [number, number],
  halkalar: [number, number][][]
): boolean {
  return halkalar.some((halka) => noktaHalkadaMi(nokta, halka));
}

export function alanEtiketi(m2: number): string {
  if (m2 >= 1_000_000) return `${(m2 / 1_000_000).toFixed(2)} km²`;
  if (m2 >= 10_000) return `${(m2 / 10_000).toFixed(2)} ha`;
  return `${Math.round(m2)} m²`;
}

export function mesafeEtiketi(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(2)} km`;
  return `${Math.round(m)} m`;
}
