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

/** Poligon alani (m2). Enlem/boylam, poligon merkezinin enlemine gore
 *  yerel bir metre duzlemine izdusurulup shoelace formuluyle hesaplanir.
 *  Sehir olcegindeki alanlar icin yeterince dogru bir yaklastirmadir. */
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

/** Nokta dizisinin sinirlayici kutusu ([[minLon,minLat],[maxLon,maxLat]]),
 *  haritayi bir bolgeye ucururken (fitBounds) kullanilir. */
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

export function alanEtiketi(m2: number): string {
  if (m2 >= 1_000_000) return `${(m2 / 1_000_000).toFixed(2)} km²`;
  if (m2 >= 10_000) return `${(m2 / 10_000).toFixed(2)} ha`;
  return `${Math.round(m2)} m²`;
}

export function mesafeEtiketi(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(2)} km`;
  return `${Math.round(m)} m`;
}
