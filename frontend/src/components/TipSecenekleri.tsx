import {
  ASSET_TYPE_LABELS,
  GRUP_TURLERI,
  TIP_GRUPLARI,
  TIP_GRUP_ETIKETLERI,
  type AssetType,
} from "../types/asset";

interface TipSecenekleriProps {
  /** Gosterilecek turler. Vatandas ihbar formu tumunu (`ASSET_TYPES`),
   *  personelin envanter formu `KAYITLI_ASSET_TYPES`'i gecer. */
  turler: readonly AssetType[];
}

/**
 * Bir `<select>` icin gruplanmis tur `<option>`'lari.
 *
 * 13 tur duz bir listede okunamiyor; turler `<optgroup>`'larla 5 gruba
 * ayrilir (Yeşil Alan ve Park / Aydınlatma ve Elektrik / Yol ve Kaldırım /
 * Altyapı-Su / Diğer) - haritadaki renk gruplariyla BIREBIR ayni ayrim, bkz.
 * types/asset.ts `TIP_GRUBU`. Ayni gruplama uc ayri secicide (vatandas ihbar
 * formu, varlik ekleme formu, varlik listesi filtresi) gerektiginden tek
 * bilesende toplandi. Bos/"Seçiniz" secenegini cagiran ekler.
 */
export default function TipSecenekleri({ turler }: TipSecenekleriProps) {
  return (
    <>
      {TIP_GRUPLARI.map((grup) => {
        const grupTurleri = GRUP_TURLERI[grup].filter((t) => turler.includes(t));
        if (grupTurleri.length === 0) return null;
        return (
          <optgroup key={grup} label={TIP_GRUP_ETIKETLERI[grup]}>
            {grupTurleri.map((t) => (
              <option key={t} value={t}>
                {ASSET_TYPE_LABELS[t]}
              </option>
            ))}
          </optgroup>
        );
      })}
    </>
  );
}
