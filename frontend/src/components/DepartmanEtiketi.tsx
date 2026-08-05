import { useDepartmanlar } from "../hooks/useDepartmanlar";
import { departmanBul } from "../types/departman";

/** Giris yapmis personelin/saha ekibinin bagli oldugu mudurluk rozeti.
 *
 *  Kullanicinin kendi departmani, ekranindaki listelerin NEDEN dar oldugunu
 *  anlatan bilgidir (bkz. `security.py::Kapsam`) - bu yuzden her zaman gorunen
 *  bir yerde, header'daki kimlik blogunda durur. Admin'in departmani yoktur
 *  (tumunu gorur), vatandasin da; ikisinde de hicbir sey cizilmez.
 *
 *  Renk `departmanlar.renk`ten gelir: bu rozet rengi, harita isaretcilerinin
 *  tur/grup renginden bilincli olarak ayri bir sistemdir. */
export default function DepartmanEtiketi({
  kod,
  className = "",
}: {
  kod: string | null | undefined;
  className?: string;
}) {
  const { data: departmanlar } = useDepartmanlar();
  if (!kod) return null;
  const departman = departmanBul(departmanlar, kod);
  // Sozluk henuz gelmediyse kodu yazmak yerine bekle: bir an "park_bahceler"
  // gorunup sonra adin gelmesi, adin biraz gec gelmesinden kotu.
  if (!departman) return null;

  return (
    <span
      className={`inline-flex max-w-[13rem] items-center gap-1.5 truncate rounded-full px-2 py-0.5 text-[11px] font-semibold ${className}`}
      style={{ backgroundColor: `${departman.renk}1a`, color: departman.renk }}
      title={departman.aciklama ?? departman.ad}
    >
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: departman.renk }}
      />
      <span className="truncate">{departman.ad}</span>
    </span>
  );
}
