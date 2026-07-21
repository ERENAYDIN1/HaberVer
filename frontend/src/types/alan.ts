import type { AssetFeatureCollection } from "./asset";

/** Haritada cizilip sorgusu tamamlanmis, uzerinde durmaya devam eden bir alan secimi. */
export interface TamamlananAlan {
  id: string;
  noktalar: [number, number][];
  renk: string;
  sonuc: AssetFeatureCollection;
  /** Verilirse listede "Alan N" yerine bu gosterilir (orn. il/ilce siniri secimi). */
  etiket?: string;
}
