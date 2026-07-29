/** MapLibre popup'lari HTML string'iyle kuruldugu icin (React degil), icine
 *  gomulen kullanici verisi elle kacisilmali - basit XSS korumasi. MapView ve
 *  SahaEkran ayni islevi ayri ayri tasiyordu, tek yerde toplandi. */
export function kacis(metin: string): string {
  return metin.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!
  );
}
