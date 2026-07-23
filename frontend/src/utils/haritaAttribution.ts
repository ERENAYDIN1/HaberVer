import maplibregl from "maplibre-gl";

/** Haritaya kompakt (kucuk yuvarlak "i") bir attribution kontrolu ekler ve
 *  baslangicta KAPALI kalmasini saglar.
 *
 *  maplibre-gl'nin kendi `compact: true` secenegi tek basina yetmiyor:
 *  kontrol eklendiginde attribution metni henuz BOS oldugundan hicbir sey
 *  yapilmiyor; sonra tile/stil kaynaklari yuklenip metin ILK KEZ dolunca
 *  (bos -> dolu gecisi) `_updateCompact` kontrolu OTOMATIK olarak "acik"
 *  (maplibregl-compact-show sinifi + open ozniteligi) baslatiyor. Bu async
 *  acilma, acilista metnin ekrana yayilmasina yol aciyordu.
 *
 *  Cozum: bir MutationObserver ile bu otomatik acilmayi geri aliyoruz.
 *  Kullanici yuvarlak butona kendisi tiklayana kadar show sinifi her
 *  eklendiginde kaldiriliyor; ilk kullanici etkilesiminden sonra gozlemci
 *  birakiliyor ki panel normal sekilde acilip kapanabilsin. */
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

  // Kullanici butona tiklayinca (metni gormek isteyince) artik karisma;
  // tiklama, maplibre'nin toggle mantigini calistirir, biz de gozlemciyi
  // birakariz. (disconnect, bu tiklamada kuyruga girmis kayitlari da iptal
  // eder; boylece ayni tiklamada panel tekrar kapanmaz.)
  container.addEventListener("click", () => {
    kullaniciActi = true;
    gozlemci.disconnect();
  });

  // Ilk render bittiginde de bir kez kapat (gozlemci zaten yakalar ama
  // garanti olsun).
  map.once("idle", () => {
    if (!kullaniciActi) kapat();
  });
}
