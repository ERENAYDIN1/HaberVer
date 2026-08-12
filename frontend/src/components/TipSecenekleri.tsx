import { turAdi } from "../data/turSozlugu";
import {
  useDepartmanlar,
  useTurDepartmanEslemesi,
} from "../hooks/useDepartmanlar";
import {
  YONLENDIRILMEMIS_AD,
  departmanTurGruplari,
} from "../types/departman";
import type { AssetType } from "../types/asset";

interface TipSecenekleriProps {
  /** Gosterilecek turler; cagiranlar `turKodlari()` gecer (bkz.
   *  data/turSozlugu.ts). */
  turler: readonly AssetType[];
}

/**
 * Bir `<select>` icin gruplanmis tur `<option>`'lari.
 *
 * Gruplama MUDURLUGE goredir, turun renk grubuna degil (ayni kategorileme
 * lejantta ve yonetim ekraninda da kullanilir, `departmanTurGruplari`).
 * Sozluk henuz gelmediyse gruplama yapilmaz, turler duz listelenir.
 */
export default function TipSecenekleri({ turler }: TipSecenekleriProps) {
  const { data: departmanlar } = useDepartmanlar();
  const { data: esleme } = useTurDepartmanEslemesi();
  const gruplar = departmanTurGruplari(departmanlar, esleme, turler);

  if (!gruplar) {
    return (
      <>
        {turler.map((t) => (
          <option key={t} value={t}>
            {turAdi(t)}
          </option>
        ))}
      </>
    );
  }

  return (
    <>
      {gruplar.map((grup) => (
        <optgroup
          key={grup.departman?.kod ?? "__yonlendirilmemis"}
          label={grup.departman?.ad ?? YONLENDIRILMEMIS_AD}
        >
          {grup.turler.map((t) => (
            <option key={t} value={t}>
              {turAdi(t)}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}
