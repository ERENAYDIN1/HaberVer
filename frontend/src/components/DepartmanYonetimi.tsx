import { useMemo, useState } from "react";

import {
  useDepartmanlar,
  useEslemeGuncelle,
  useTurDepartmanEslemesi,
} from "../hooks/useDepartmanlar";
import {
  ASSET_TYPES,
  ASSET_TYPE_LABELS,
  GRUP_RENGI,
  TIP_GRUBU,
  TIP_GRUP_ETIKETLERI,
  TIP_GRUPLARI,
  type AssetType,
} from "../types/asset";
import type { TurDepartmanEslemesi } from "../types/departman";
import { TIP_IKONU } from "./icons";

/** Tur -> departman yonlendirmesinin yonetimi (yalnizca admin).
 *
 *  Yonlendirme kodda sabit degil veritabaninda durur: bir belediye
 *  orgutlenmesini degistirdiginde migration yazilmasin, burada bir satir
 *  degissin diye. Degisiklik ANINDA gecerlidir - kimin neyi gorebildigi her
 *  istekte bu tablodan hesaplanir.
 *
 *  Turler renk GRUPLARINA gore bolunerek listelenir (haritadaki gruplama ile
 *  ayni): bir mudurluk secerken "bu tur haritada hangi renkle cizilecek"
 *  bilgisi de gorunur kalsin. Gruplama ile departman AYNI SEY DEGILDIR - grup
 *  gorsel dil, departman is akisidir; bu ekran ikisinin ortusmedigi yerleri
 *  (orn. cop kutusu yesil grupta ama Temizlik Isleri'nde) acikca gosterir. */
export default function DepartmanYonetimi() {
  const { data: departmanlar } = useDepartmanlar();
  const { data: kayitli } = useTurDepartmanEslemesi();
  const guncelle = useEslemeGuncelle();

  // Taslak yalnizca DEGISEN turleri tutar; kaydetmeden once ne degistigi
  // ekranda gorunur ve istek kismi gonderilir.
  const [taslak, setTaslak] = useState<TurDepartmanEslemesi>({});
  const [basari, setBasari] = useState<string | null>(null);

  const etkin = useMemo<TurDepartmanEslemesi>(
    () => ({ ...(kayitli ?? {}), ...taslak }),
    [kayitli, taslak]
  );
  const degisenler = useMemo(
    () => (Object.keys(taslak) as AssetType[]).filter((t) => taslak[t] !== kayitli?.[t]),
    [taslak, kayitli]
  );

  const sec = (tur: AssetType, kod: string) => {
    setBasari(null);
    setTaslak((t) => {
      const yeni = { ...t };
      // Kayitli degere geri donuldiyse taslaktan tumden dusur, yoksa
      // "1 değişiklik" sayaci ileri geri gidince yanlis gosterirdi.
      if (kayitli?.[tur] === kod) delete yeni[tur];
      else yeni[tur] = kod;
      return yeni;
    });
  };

  const kaydet = async () => {
    const gonderilecek: TurDepartmanEslemesi = {};
    for (const t of degisenler) gonderilecek[t] = taslak[t];
    try {
      await guncelle.mutateAsync(gonderilecek);
      setTaslak({});
      setBasari(`${degisenler.length} tür yeniden yönlendirildi`);
    } catch {
      // Hata mutasyonun kendi durumundan okunur.
    }
  };

  const departmanRengi = (kod: string | undefined) =>
    departmanlar?.find((d) => d.kod === kod)?.renk ?? "#94a3b8";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-slate-200 p-4">
        <h2 className="text-sm font-semibold text-slate-900">
          Tür → Departman Yönlendirmesi
        </h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Vatandaş bir talep gönderdiğinde seçtiği tür, talebin hangi müdürlüğe
          düşeceğini belirler. Personel yalnızca kendi müdürlüğünün türlerini
          görür; saha ekiplerine de yalnızca o türlerdeki işler otomatik atanır.
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {TIP_GRUPLARI.map((grup) => {
          const turler = ASSET_TYPES.filter((t) => TIP_GRUBU[t] === grup);
          if (!turler.length) return null;
          return (
            <section key={grup} className="mb-5 last:mb-0">
              <h3
                className="mb-1.5 flex items-center gap-1.5 border-b pb-1 text-xs font-semibold uppercase tracking-wide text-slate-500"
                style={{ borderColor: GRUP_RENGI[grup] }}
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: GRUP_RENGI[grup] }}
                />
                {TIP_GRUP_ETIKETLERI[grup]}
              </h3>
              <ul className="divide-y divide-slate-100 border border-slate-200">
                {turler.map((tur) => {
                  const Ikon = TIP_IKONU[tur];
                  const secili = etkin[tur] ?? "";
                  const degisti = degisenler.includes(tur);
                  return (
                    <li
                      key={tur}
                      className={`flex items-center gap-2 px-3 py-2 ${
                        degisti ? "bg-amber-50" : ""
                      }`}
                    >
                      <span
                        className="flex h-6 w-6 shrink-0 items-center justify-center border"
                        style={{
                          borderColor: GRUP_RENGI[grup],
                          color: GRUP_RENGI[grup],
                        }}
                      >
                        {Ikon && <Ikon className="h-3.5 w-3.5" />}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm text-slate-800">
                        {ASSET_TYPE_LABELS[tur]}
                      </span>
                      {degisti && (
                        <span className="shrink-0 text-[11px] font-medium text-amber-700">
                          değişti
                        </span>
                      )}
                      <select
                        value={secili}
                        onChange={(e) => sec(tur, e.target.value)}
                        className="w-56 shrink-0 border bg-white px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        style={{
                          borderColor: departmanRengi(secili),
                          color: departmanRengi(secili),
                        }}
                      >
                        {(departmanlar ?? []).map((d) => (
                          <option key={d.kod} value={d.kod} className="text-slate-800">
                            {d.ad}
                          </option>
                        ))}
                      </select>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>

      <div className="flex items-center gap-3 border-t border-slate-200 p-3">
        <span className="text-xs text-slate-500">
          {degisenler.length
            ? `${degisenler.length} değişiklik bekliyor`
            : "Kayıtlı yönlendirme geçerli"}
        </span>
        {guncelle.isError && (
          <span className="text-xs text-red-600">
            {(guncelle.error as Error).message}
          </span>
        )}
        {basari && <span className="text-xs text-emerald-700">{basari}</span>}
        <span className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={() => setTaslak({})}
            disabled={!degisenler.length || guncelle.isPending}
            className="border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Vazgeç
          </button>
          <button
            type="button"
            onClick={kaydet}
            disabled={!degisenler.length || guncelle.isPending}
            className="border border-emerald-600 bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-300"
          >
            {guncelle.isPending ? "Kaydediliyor…" : "Kaydet"}
          </button>
        </span>
      </div>
    </div>
  );
}
