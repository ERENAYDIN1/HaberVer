import { useDepartmanlar } from "../hooks/useDepartmanlar";
import { departmanBul } from "../types/departman";

// Giris yapmis personelin/saha ekibinin bagli oldugu mudurluk rozeti; admin ve
// vatandasin departmani olmadigindan hicbir sey cizilmez.
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
  // Sozluk gelmeden kodu (or. "park_bahceler") gostermemek icin bekle.
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
