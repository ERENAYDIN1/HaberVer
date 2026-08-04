import maplibregl from "maplibre-gl";

/** Haritaya kompakt ("i" dugmesi) attribution kontrolu ekler ve acilista
 *  kapali kalmasini saglar.
 *
 *  `compact: true` tek basina yetmiyor: kontrol eklendiginde metin bos oldugu
 *  icin bir sey yapilmiyor, sonra kaynaklar yuklenip metin dolunca maplibre
 *  paneli kendiliginden aciyor. MutationObserver bu otomatik acilmayi geri
 *  alir; kullanici dugmeye tiklayinca gozlemci birakilir. */
export function haritayaKapaliAttributionEkle(map: maplibregl.Map) {
  const kontrol = new maplibregl.AttributionControl({ compact: true });
  map.addControl(kontrol, "bottom-right");

  const container = (kontrol as unknown as { _container: HTMLElement })._container;

  let kullaniciActi = false;
  const kapat = () => {
    container.classList.remove("maplibregl-compact-show");
    container.removeAttribute("open");
  };

  const gozlemci = new MutationObserver(() => {
    if (kullaniciActi) return;
    if (container.classList.contains("maplibregl-compact-show")) kapat();
  });
  gozlemci.observe(container, { attributes: true, attributeFilter: ["class"] });

  // Kullanici actiginda karisilmaz. `disconnect` bu tiklamada kuyruga girmis
  // kayitlari da iptal eder, yoksa panel ayni tiklamada tekrar kapanirdi.
  container.addEventListener("click", () => {
    kullaniciActi = true;
    gozlemci.disconnect();
  });

  // Ilk render bitince bir kez daha kapat (guvence).
  map.once("idle", () => {
    if (!kullaniciActi) kapat();
  });
}
