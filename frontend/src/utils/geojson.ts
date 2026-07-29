/** MapLibre kaynaklari veri gelmeden once bos bir koleksiyonla kurulur; ayni
 *  sabit uc ayri dosyada tekrarlaniyordu, tek yerde toplandi. */
export const BOS_GEOJSON = {
  type: "FeatureCollection",
  features: [],
} as unknown as GeoJSON.FeatureCollection;
