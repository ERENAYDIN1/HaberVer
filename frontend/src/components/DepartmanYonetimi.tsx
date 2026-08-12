import { useMemo, useState } from "react";

import { GLIF_ANAHTARLARI } from "../data/tipGlifleri";
import {
  useDepartmanEkle,
  useDepartmanGuncelle,
  useDepartmanSil,
  useDepartmanlar,
  useEslemeGuncelle,
  useTurDepartmanEslemesi,
} from "../hooks/useDepartmanlar";
import { useTurEkle, useTurGuncelle, useTurSil, useTurler } from "../hooks/useTurler";
import {
  GRUP_RENGI,
  TIP_GRUPLARI,
  TIP_GRUP_ETIKETLERI,
  type AssetType,
} from "../types/asset";
import {
  YONLENDIRILMEMIS_AD,
  departmanGrubu,
  grupUyumsuzlugu,
} from "../types/departman";
import type {
  Departman,
  DepartmanCreateInput,
  DepartmanUpdateInput,
  TurDepartmanEslemesi,
} from "../types/departman";
import type { Tur, TurCreateInput, TurUpdateInput } from "../types/tur";
import { AksiyonButonu } from "./Aksiyonlar";
import { GlifIkonu, IconPlus, IconTrash, IconX } from "./icons";

/** Müdürlük ve tür sözlüğünün yönetimi (yalnızca admin).
 *
 *  HER SEY TASLAKTIR, "Kaydet"e kadar hicbir sey yazilmaz: bu ekrandaki tek
 *  bir yanlis tiklama o an sistemi kullanan herkesin ne gorebildigini degistirir.
 *
 *  Grup rengi BU EKRANDA SORULMAZ, mudurlugun renginden turetilir ve
 *  yonlendirme degisince onu izler - lejantta baslik ve swatch ayni seyi
 *  soylemeli. Ayrisma yalnizca palette karsiligi olmayan ozel bir mudurluk
 *  renginde olusur ve uyari olarak gosterilir. */

type Sekme = "departmanlar" | "turler";

interface Taslak {
  yeniDepartmanlar: DepartmanCreateInput[];
  departmanDuzenleme: Record<string, DepartmanUpdateInput>;
  silinenDepartmanlar: string[];
  yeniTurler: TurCreateInput[];
  turDuzenleme: Record<string, TurUpdateInput>;
  silinenTurler: string[];
  esleme: TurDepartmanEslemesi;
}

const BOS_TASLAK: Taslak = {
  yeniDepartmanlar: [],
  departmanDuzenleme: {},
  silinenDepartmanlar: [],
  yeniTurler: [],
  turDuzenleme: {},
  silinenTurler: [],
  esleme: {},
};

const KOD_DESENI = /^[a-z][a-z0-9_]{1,31}$/;

// A -> B -> A yapip kaydetmeden geri donen bir degisiklik "bekleyen" gorunmesin diye
// orijinaliyle ayni kalan alanlar elenir.
function fark<T extends Record<string, unknown>>(
  orijinal: T | undefined,
  duzenleme: Partial<T>
): Partial<T> {
  const sonuc: Partial<T> = {};
  for (const k of Object.keys(duzenleme) as (keyof T)[]) {
    if (!orijinal || duzenleme[k] !== orijinal[k]) sonuc[k] = duzenleme[k];
  }
  return sonuc;
}

function haritayaYaz<U extends Record<string, unknown>, T extends { kod: string } & U>(
  harita: Record<string, Partial<U>>,
  kayitlar: T[] | undefined,
  kod: string,
  data: Partial<U>
): Record<string, Partial<U>> {
  const orijinal = kayitlar?.find((k) => k.kod === kod);
  const birlesik = fark<U>(orijinal, { ...(harita[kod] ?? {}), ...data });
  const yeni = { ...harita };
  if (Object.keys(birlesik).length === 0) delete yeni[kod];
  else yeni[kod] = birlesik;
  return yeni;
}

const inputClass =
  "w-full border border-slate-300 bg-white px-2 py-1 text-xs focus:border-emerald-500 focus:outline-none";
const etiketClass = "text-[11px] font-medium text-slate-500";

// Turkce bir addan kod uretir; admin elle de duzenleyebilir.
function koda(ad: string): string {
  const harita: Record<string, string> = {
    ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u",
  };
  return ad
    .toLocaleLowerCase("tr")
    .replace(/[çğıöşüâîû]/g, (h) => harita[h] ?? h)
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
}

export default function DepartmanYonetimi() {
  const { data: departmanlar } = useDepartmanlar();
  const { data: turler } = useTurler();
  const { data: kayitliEsleme } = useTurDepartmanEslemesi();

  const departmanEkle = useDepartmanEkle();
  const departmanGuncelle = useDepartmanGuncelle();
  const departmanSil = useDepartmanSil();
  const turEkle = useTurEkle();
  const turGuncelle = useTurGuncelle();
  const turSil = useTurSil();
  const eslemeGuncelle = useEslemeGuncelle();

  const [sekme, setSekme] = useState<Sekme>("turler");
  const [taslak, setTaslak] = useState<Taslak>(BOS_TASLAK);
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [basari, setBasari] = useState<string | null>(null);

  const yaz = (degisiklik: Partial<Taslak>) => {
    setBasari(null);
    setHata(null);
    setTaslak((t) => ({ ...t, ...degisiklik }));
  };

  // --- Taslak uygulanmis (ekranda gorunen) listeler ------------------------
  const etkinDepartmanlar = useMemo<Departman[]>(() => {
    const mevcut = (departmanlar ?? [])
      .filter((d) => !taslak.silinenDepartmanlar.includes(d.kod))
      .map((d) => ({ ...d, ...(taslak.departmanDuzenleme[d.kod] ?? {}) }));
    const yeniler: Departman[] = taslak.yeniDepartmanlar.map((d) => ({
      kod: d.kod,
      ad: d.ad,
      aciklama: d.aciklama,
      renk: d.renk,
      aktif: d.aktif,
      sira: d.sira,
    }));
    return [...mevcut, ...yeniler];
  }, [departmanlar, taslak]);

  const etkinTurler = useMemo<Tur[]>(() => {
    const mevcut = (turler ?? [])
      .filter((t) => !taslak.silinenTurler.includes(t.kod))
      .map((t) => ({ ...t, ...(taslak.turDuzenleme[t.kod] ?? {}) }));
    const yeniler: Tur[] = taslak.yeniTurler.map((t) => ({
      kod: t.kod,
      ad: t.ad,
      grup: t.grup,
      glif: t.glif,
    }));
    return [...mevcut, ...yeniler];
  }, [turler, taslak]);

  const turunDepartmani = (kod: AssetType): string => {
    const yeni = taslak.yeniTurler.find((t) => t.kod === kod);
    if (yeni) return yeni.departman;
    return taslak.esleme[kod] ?? kayitliEsleme?.[kod] ?? "";
  };

  const departmanAdlari = useMemo(
    () => new Map(etkinDepartmanlar.map((d) => [d.kod, d])),
    [etkinDepartmanlar]
  );

  // --- Degisiklik ozeti ----------------------------------------------------
  const degisiklikler = useMemo<string[]>(() => {
    const satirlar: string[] = [];
    for (const d of taslak.yeniDepartmanlar) satirlar.push(`Yeni müdürlük: ${d.ad}`);
    for (const [kod, veri] of Object.entries(taslak.departmanDuzenleme)) {
      const ad = departmanlar?.find((d) => d.kod === kod)?.ad ?? kod;
      satirlar.push(`Müdürlük güncellendi: ${ad} (${Object.keys(veri).join(", ")})`);
    }
    for (const kod of taslak.silinenDepartmanlar) {
      satirlar.push(`Müdürlük silinecek: ${departmanlar?.find((d) => d.kod === kod)?.ad ?? kod}`);
    }
    for (const t of taslak.yeniTurler) {
      satirlar.push(
        `Yeni tür: ${t.ad} → ${departmanAdlari.get(t.departman)?.ad ?? t.departman}`
      );
    }
    for (const [kod, veri] of Object.entries(taslak.turDuzenleme)) {
      const ad = turler?.find((t) => t.kod === kod)?.ad ?? kod;
      satirlar.push(`Tür güncellendi: ${ad} (${Object.keys(veri).join(", ")})`);
    }
    for (const [kod, hedef] of Object.entries(taslak.esleme)) {
      const ad = turler?.find((t) => t.kod === kod)?.ad ?? kod;
      const hedefAd = hedef ? departmanAdlari.get(hedef)?.ad ?? hedef : "—";
      satirlar.push(`Yönlendirme: ${ad} → ${hedefAd}`);
    }
    for (const kod of taslak.silinenTurler) {
      satirlar.push(`Tür silinecek: ${turler?.find((t) => t.kod === kod)?.ad ?? kod}`);
    }
    return satirlar;
  }, [taslak, departmanlar, turler, departmanAdlari]);

  // Kaydetmeyi engelleyen tutarsizliklar; sunucuya gitmeden once yakalanip
  // 409/422 yerine ilgili satirin yaninda okunur bir uyari olarak gosterilir.
  const engeller = useMemo<string[]>(() => {
    const liste: string[] = [];
    const kodlar = new Set<string>();
    for (const d of [...(departmanlar ?? []), ...taslak.yeniDepartmanlar]) {
      if (kodlar.has(d.kod)) liste.push(`Müdürlük kodu tekrar ediyor: ${d.kod}`);
      kodlar.add(d.kod);
    }
    for (const d of taslak.yeniDepartmanlar) {
      if (!d.ad.trim()) liste.push("Yeni müdürlüğün adı boş");
      if (!KOD_DESENI.test(d.kod)) liste.push(`Geçersiz müdürlük kodu: “${d.kod}”`);
    }
    const turKodlari = new Set<string>();
    for (const t of [...(turler ?? []), ...taslak.yeniTurler]) {
      if (turKodlari.has(t.kod)) liste.push(`Tür kodu tekrar ediyor: ${t.kod}`);
      turKodlari.add(t.kod);
    }
    for (const t of taslak.yeniTurler) {
      if (!t.ad.trim()) liste.push("Yeni türün adı boş");
      if (!KOD_DESENI.test(t.kod)) liste.push(`Geçersiz tür kodu: “${t.kod}”`);
      if (!t.departman) liste.push(`“${t.ad || t.kod}” için müdürlük seçilmedi`);
    }
    for (const t of etkinTurler) {
      const hedef = turunDepartmani(t.kod);
      if (hedef && !departmanAdlari.has(hedef)) {
        liste.push(`“${t.ad}” silinen bir müdürlüğe yönlendirilmiş durumda`);
      }
    }
    return [...new Set(liste)];
  }, [taslak, departmanlar, turler, etkinTurler, departmanAdlari]);

  const degisiklikVar = degisiklikler.length > 0;

  // --- Kaydetme ------------------------------------------------------------
  // Adimlar bagimliliga gore sirali: once eklemeler, sonra guncelleme/yonlendirme,
  // en sonda silmeler. Bir adim patlarsa devam edilmez, taslak temizlenmez.
  const kaydet = async () => {
    setKaydediliyor(true);
    setHata(null);
    setBasari(null);
    try {
      for (const d of taslak.yeniDepartmanlar) await departmanEkle.mutateAsync(d);
      for (const t of taslak.yeniTurler) await turEkle.mutateAsync(t);
      for (const [kod, data] of Object.entries(taslak.departmanDuzenleme)) {
        await departmanGuncelle.mutateAsync({ kod, data });
      }
      for (const [kod, data] of Object.entries(taslak.turDuzenleme)) {
        await turGuncelle.mutateAsync({ kod, data });
      }
      if (Object.keys(taslak.esleme).length) {
        await eslemeGuncelle.mutateAsync(taslak.esleme);
      }
      for (const kod of taslak.silinenTurler) await turSil.mutateAsync(kod);
      for (const kod of taslak.silinenDepartmanlar) await departmanSil.mutateAsync(kod);

      setTaslak(BOS_TASLAK);
      setBasari(`${degisiklikler.length} değişiklik kaydedildi`);
    } catch (e) {
      setHata(
        `${(e as Error).message} — bu adımdan sonrası uygulanmadı, ` +
          "düzeltip tekrar kaydedebilirsiniz."
      );
    } finally {
      setKaydediliyor(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-slate-200 px-4 pt-3">
        <h2 className="text-sm font-semibold text-slate-900">Müdürlük ve Tür Yönetimi</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Vatandaş bir talep gönderdiğinde seçtiği tür, talebin hangi müdürlüğe
          düşeceğini belirler. Personel yalnızca kendi müdürlüğünün türlerini
          görür; saha ekiplerine de yalnızca o türlerdeki işler otomatik atanır.
        </p>
        <div className="mt-3 flex gap-1">
          {(
            [
              ["turler", `Türler (${etkinTurler.length})`],
              ["departmanlar", `Müdürlükler (${etkinDepartmanlar.length})`],
            ] as [Sekme, string][]
          ).map(([anahtar, etiket]) => (
            <button
              key={anahtar}
              type="button"
              onClick={() => setSekme(anahtar)}
              className={`border-b-2 px-3 py-1.5 text-xs font-medium transition ${
                sekme === anahtar
                  ? "border-emerald-600 text-emerald-700"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {etiket}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {sekme === "turler" ? (
          <TurlerSekmesi
            turler={etkinTurler}
            departmanlar={etkinDepartmanlar}
            kayitliKodlar={new Set((turler ?? []).map((t) => t.kod))}
            turunDepartmani={turunDepartmani}
            onDuzenle={(kod, data) =>
              yaz({
                turDuzenleme: haritayaYaz(taslak.turDuzenleme, turler, kod, data),
              })
            }
            onYeniDuzenle={(kod, data) =>
              yaz({
                yeniTurler: taslak.yeniTurler.map((t) =>
                  t.kod === kod ? { ...t, ...data } : t
                ),
              })
            }
            onYonlendir={(kod, hedef) => {
              const yeniEsleme = { ...taslak.esleme };
              if ((kayitliEsleme?.[kod] ?? "") === hedef) delete yeniEsleme[kod];
              else yeniEsleme[kod] = hedef;
              yaz({ esleme: yeniEsleme });
            }}
            onSil={(kod) =>
              yaz(
                taslak.yeniTurler.some((t) => t.kod === kod)
                  ? { yeniTurler: taslak.yeniTurler.filter((t) => t.kod !== kod) }
                  : { silinenTurler: [...taslak.silinenTurler, kod] }
              )
            }
            onEkle={(tur) => yaz({ yeniTurler: [...taslak.yeniTurler, tur] })}
          />
        ) : (
          <DepartmanlarSekmesi
            departmanlar={etkinDepartmanlar}
            kayitliKodlar={new Set((departmanlar ?? []).map((d) => d.kod))}
            turSayilari={etkinTurler.reduce<Record<string, number>>((acc, t) => {
              const hedef = turunDepartmani(t.kod);
              if (hedef) acc[hedef] = (acc[hedef] ?? 0) + 1;
              return acc;
            }, {})}
            onDuzenle={(kod, data) =>
              yaz({
                departmanDuzenleme: haritayaYaz(
                  taslak.departmanDuzenleme,
                  departmanlar,
                  kod,
                  data
                ),
              })
            }
            onYeniDuzenle={(kod, data) =>
              yaz({
                yeniDepartmanlar: taslak.yeniDepartmanlar.map((d) =>
                  d.kod === kod ? { ...d, ...data } : d
                ),
              })
            }
            onSil={(kod) =>
              yaz(
                taslak.yeniDepartmanlar.some((d) => d.kod === kod)
                  ? {
                      yeniDepartmanlar: taslak.yeniDepartmanlar.filter(
                        (d) => d.kod !== kod
                      ),
                    }
                  : { silinenDepartmanlar: [...taslak.silinenDepartmanlar, kod] }
              )
            }
            onEkle={(departman) =>
              yaz({ yeniDepartmanlar: [...taslak.yeniDepartmanlar, departman] })
            }
          />
        )}
      </div>

      {(degisiklikVar || engeller.length > 0) && (
        <div className="max-h-40 overflow-y-auto border-t border-slate-200 bg-slate-50 px-4 py-2">
          {engeller.map((e) => (
            <p key={e} className="text-[11px] text-red-600">
              ⚠ {e}
            </p>
          ))}
          {degisiklikler.map((d) => (
            <p key={d} className="text-[11px] text-slate-600">
              · {d}
            </p>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3 border-t border-slate-200 p-3">
        <span className="text-xs text-slate-500">
          {degisiklikVar
            ? `${degisiklikler.length} değişiklik bekliyor`
            : "Kayıtlı sözlük geçerli"}
        </span>
        {hata && <span className="min-w-0 flex-1 truncate text-xs text-red-600">{hata}</span>}
        {basari && <span className="text-xs text-emerald-700">{basari}</span>}
        <span className="ml-auto flex gap-2">
          <AksiyonButonu
            tur="ikincil"
            onClick={() => {
              setTaslak(BOS_TASLAK);
              setHata(null);
            }}
            disabled={!degisiklikVar || kaydediliyor}
          >
            Vazgeç
          </AksiyonButonu>
          <AksiyonButonu
            tur="birincil"
            onClick={kaydet}
            disabled={!degisiklikVar || kaydediliyor || engeller.length > 0}
          >
            {kaydediliyor ? "Kaydediliyor…" : "Değişiklikleri Kaydet"}
          </AksiyonButonu>
        </span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Türler sekmesi
 * ---------------------------------------------------------------------- */

interface TurlerSekmesiProps {
  turler: Tur[];
  departmanlar: Departman[];
  kayitliKodlar: Set<string>;
  turunDepartmani: (kod: string) => string;
  onDuzenle: (kod: string, data: TurUpdateInput) => void;
  onYeniDuzenle: (kod: string, data: Partial<TurCreateInput>) => void;
  onYonlendir: (kod: string, hedef: string) => void;
  onSil: (kod: string) => void;
  onEkle: (tur: TurCreateInput) => void;
}

// Turler MUDURLUK MUDURLUK listelenir (renk grubuna gore degil): bu ekranin sorusu
// "hangi is kime gidiyor"dur. Ayni kategorileme lejantta da kullanilir (`departmanTurGruplari`).
function TurlerSekmesi({
  turler,
  departmanlar,
  kayitliKodlar,
  turunDepartmani,
  onDuzenle,
  onYeniDuzenle,
  onYonlendir,
  onSil,
  onEkle,
}: TurlerSekmesiProps) {
  const [formDepartmani, setFormDepartmani] = useState<string | null>(null);

  const bolumler = departmanlar.map((d) => ({
    departman: d,
    kapsam: turler.filter((t) => turunDepartmani(t.kod) === d.kod),
  }));
  const kodlar = new Set(departmanlar.map((d) => d.kod));
  const artan = turler.filter((t) => !kodlar.has(turunDepartmani(t.kod)));

  const satir = (tur: Tur) => (
    <TurSatiri
      key={tur.kod}
      tur={tur}
      yeni={!kayitliKodlar.has(tur.kod)}
      departmanlar={departmanlar}
      hedef={turunDepartmani(tur.kod)}
      onDegis={(data) =>
        kayitliKodlar.has(tur.kod)
          ? onDuzenle(tur.kod, data)
          : onYeniDuzenle(tur.kod, data)
      }
      // Renk grubu yonlendirmeyi izler: tur baska mudurluge tasininca rengi de gecer.
      onYonlendir={(hedef) => {
        const grup = departmanGrubu(departmanlar.find((d) => d.kod === hedef));
        if (kayitliKodlar.has(tur.kod)) {
          onYonlendir(tur.kod, hedef);
          if (grup && grup !== tur.grup) onDuzenle(tur.kod, { grup });
        } else {
          onYeniDuzenle(tur.kod, { departman: hedef, ...(grup ? { grup } : {}) });
        }
      }}
      onSil={() => onSil(tur.kod)}
    />
  );

  return (
    <>
      {bolumler.map(({ departman, kapsam }) => (
        <section
          key={departman.kod}
          className="mb-4 overflow-hidden rounded-lg border border-slate-200"
        >
          <header
            className="flex items-center gap-2 px-3 py-2"
            style={{
              backgroundColor: `${departman.renk}12`,
              boxShadow: `inset 3px 0 0 ${departman.renk}`,
            }}
          >
            <div className="min-w-0 flex-1">
              <h3
                className="truncate text-sm font-bold leading-tight"
                style={{ color: departman.renk }}
              >
                {departman.ad}
                {!departman.aktif && (
                  <span className="ml-1.5 text-[10px] font-medium text-slate-400">
                    · pasif
                  </span>
                )}
              </h3>
              {departman.aciklama && (
                <p className="truncate text-[11px] text-slate-500">
                  {departman.aciklama}
                </p>
              )}
            </div>
            <span
              className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums"
              style={{ backgroundColor: `${departman.renk}1f`, color: departman.renk }}
            >
              {kapsam.length} tür
            </span>
          </header>

          {kapsam.length > 0 && (
            <ul className="divide-y divide-slate-100">{kapsam.map(satir)}</ul>
          )}

          {formDepartmani === departman.kod ? (
            <YeniTurFormu
              departmanlar={departmanlar}
              sabitDepartman={departman}
              onVazgec={() => setFormDepartmani(null)}
              onEkle={(tur) => {
                onEkle(tur);
                setFormDepartmani(null);
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setFormDepartmani(departman.kod)}
              className="flex w-full items-center justify-center gap-1.5 border-t border-dashed border-slate-200 py-2 text-xs font-medium transition hover:bg-slate-50"
              style={{ color: departman.renk }}
            >
              <IconPlus className="h-3.5 w-3.5" />
              Bu müdürlüğe tür ekle
            </button>
          )}
        </section>
      ))}

      {artan.length > 0 && (
        <section className="mb-4 overflow-hidden rounded-lg border border-amber-300">
          <header className="bg-amber-50 px-3 py-2">
            <h3 className="text-sm font-bold text-amber-800">
              {YONLENDIRILMEMIS_AD}
            </h3>
            <p className="text-[11px] text-amber-700">
              Bu türlerdeki talepler hiçbir müdürlüğün kapsamına girmez; bir
              müdürlük seçilene kadar kimse göremez.
            </p>
          </header>
          <ul className="divide-y divide-slate-100">{artan.map(satir)}</ul>
        </section>
      )}
    </>
  );
}

interface TurSatiriProps {
  tur: Tur;
  yeni: boolean;
  departmanlar: Departman[];
  hedef: string;
  onDegis: (data: TurUpdateInput) => void;
  onYonlendir: (hedef: string) => void;
  onSil: () => void;
}

function TurSatiri({
  tur,
  yeni,
  departmanlar,
  hedef,
  onDegis,
  onYonlendir,
  onSil,
}: TurSatiriProps) {
  const [acik, setAcik] = useState(false);
  const hedefDepartman = departmanlar.find((d) => d.kod === hedef);
  const departmanRenk = hedefDepartman?.renk ?? "#94a3b8";
  const uyari = grupUyumsuzlugu(tur.grup, hedefDepartman);
  const onerilenGrup = departmanGrubu(hedefDepartman);

  return (
    <li
      className={`transition ${
        acik ? "bg-slate-50" : yeni ? "bg-emerald-50" : ""
      }`}
      style={acik ? { boxShadow: `inset 3px 0 0 ${departmanRenk}` } : undefined}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center border"
          style={{ borderColor: GRUP_RENGI[tur.grup], color: GRUP_RENGI[tur.grup] }}
        >
          <GlifIkonu anahtar={tur.glif ?? "diger"} className="h-3.5 w-3.5" />
        </span>
        <button
          type="button"
          onClick={() => setAcik((a) => !a)}
          className="min-w-0 flex-1 text-left"
          title="Ayrıntıları aç/kapat"
        >
          <span className="flex items-center gap-1.5 text-sm text-slate-800">
            <span className="min-w-0 truncate">{tur.ad}</span>
            {uyari && (
              <span title={uyari} className="shrink-0 text-xs text-amber-600">
                ⚠
              </span>
            )}
            <span
              className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold transition ${
                acik ? "text-white" : "bg-slate-100 text-slate-500"
              }`}
              style={acik ? { backgroundColor: departmanRenk } : undefined}
            >
              {acik ? "▴ kapat" : "▾ düzenle"}
            </span>
          </span>
          <span className="block truncate font-mono text-[10px] text-slate-400">
            {tur.kod}
          </span>
        </button>
        <select
          value={hedef}
          title="Türü başka bir müdürlüğe taşı"
          onChange={(e) => onYonlendir(e.target.value)}
          className="w-44 shrink-0 border bg-white px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
          style={{ borderColor: departmanRenk, color: departmanRenk }}
        >
          <option value="">— müdürlük seçin —</option>
          {departmanlar.map((d) => (
            <option key={d.kod} value={d.kod} className="text-slate-800">
              {d.ad}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onSil}
          title="Türü sil (kullanımdaysa kaydederken reddedilir)"
          className="shrink-0 p-1 text-slate-400 transition hover:text-red-600"
        >
          <IconTrash className="h-3.5 w-3.5" />
        </button>
      </div>

      {acik && (
        <div className="px-3 pb-3">
          <div
            className="overflow-hidden rounded-lg border bg-white shadow-sm"
            style={{ borderColor: `${departmanRenk}66` }}
          >
            <div
              className="flex items-center gap-2 px-2.5 py-1.5"
              style={{ backgroundColor: `${departmanRenk}12` }}
            >
              <span
                className="truncate text-[11px] font-bold uppercase tracking-wide"
                style={{ color: departmanRenk }}
              >
                {tur.ad || tur.kod} · ayrıntılar
              </span>
              <button
                type="button"
                onClick={() => setAcik(false)}
                title="Ayrıntıları kapat"
                className="ml-auto shrink-0 p-0.5 text-slate-400 transition hover:text-slate-700"
              >
                <IconX className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 p-2.5">
              {uyari && (
                <RenkUyarisi
                  mesaj={uyari}
                  onDuzelt={
                    onerilenGrup ? () => onDegis({ grup: onerilenGrup }) : undefined
                  }
                />
              )}
              <label className="col-span-2">
                <span className={etiketClass}>Ad</span>
                <input
                  className={inputClass}
                  value={tur.ad}
                  onChange={(e) => onDegis({ ad: e.target.value })}
                />
              </label>
              <div className="col-span-2">
                <span className={etiketClass}>Glif</span>
                <GlifSecici
                  secili={tur.glif}
                  onSec={(glif) => onDegis({ glif })}
                  renk={GRUP_RENGI[tur.grup]}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </li>
  );
}

function YeniTurFormu({
  departmanlar,
  sabitDepartman,
  onEkle,
  onVazgec,
}: {
  departmanlar: Departman[];
  sabitDepartman?: Departman;
  onEkle: (tur: TurCreateInput) => void;
  onVazgec: () => void;
}) {
  const [ad, setAd] = useState("");
  const [kod, setKod] = useState("");
  const [kodElle, setKodElle] = useState(false);
  const [glif, setGlif] = useState<string | null>(null);
  const [departman, setDepartman] = useState(sabitDepartman?.kod ?? "");

  const hedefDepartman =
    sabitDepartman ?? departmanlar.find((d) => d.kod === departman);
  // Grup hedef mudurlukten turetilir; mudurlugun rengi palette yoksa `diger`e duser.
  const etkinGrup = departmanGrubu(hedefDepartman) ?? "diger";
  const uyari = grupUyumsuzlugu(etkinGrup, hedefDepartman);

  const etkinKod = kodElle ? kod : koda(ad);
  const gecerli = KOD_DESENI.test(etkinKod) && ad.trim() !== "" && departman !== "";

  return (
    <div className="border-t border-emerald-300 bg-emerald-50/60 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-xs font-semibold text-slate-800">
          {sabitDepartman ? `Yeni tür · ${sabitDepartman.ad}` : "Yeni tür"}
        </h4>
        <button type="button" onClick={onVazgec} className="text-slate-400 hover:text-slate-700">
          <IconX className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label>
          <span className={etiketClass}>Ad</span>
          <input
            className={inputClass}
            value={ad}
            placeholder="ör. Güvenlik Kamerası"
            onChange={(e) => setAd(e.target.value)}
          />
        </label>
        <label>
          <span className={etiketClass}>Kod (sonradan değiştirilemez)</span>
          <input
            className={`${inputClass} font-mono`}
            value={etkinKod}
            onChange={(e) => {
              setKodElle(true);
              setKod(e.target.value);
            }}
          />
        </label>
        <label className="col-span-2">
          <span className={etiketClass}>Müdürlük</span>
          {sabitDepartman ? (
            <span
              className="mt-0.5 block truncate border border-transparent px-2 py-1 text-xs font-semibold"
              style={{
                backgroundColor: `${sabitDepartman.renk}14`,
                color: sabitDepartman.renk,
              }}
            >
              {sabitDepartman.ad}
            </span>
          ) : (
            <select
              className={inputClass}
              value={departman}
              onChange={(e) => setDepartman(e.target.value)}
            >
              <option value="">— seçin —</option>
              {departmanlar.map((d) => (
                <option key={d.kod} value={d.kod}>
                  {d.ad}
                </option>
              ))}
            </select>
          )}
        </label>
        {uyari && <RenkUyarisi mesaj={uyari} />}
        <div className="col-span-2">
          <span className={etiketClass}>Glif</span>
          <GlifSecici secili={glif} onSec={setGlif} renk={GRUP_RENGI[etkinGrup]} />
        </div>
      </div>
      <div className="mt-2 flex justify-end">
        <AksiyonButonu
          tur="birincil"
          disabled={!gecerli}
          onClick={() =>
            onEkle({
              kod: etkinKod,
              ad: ad.trim(),
              grup: etkinGrup,
              glif,
              departman,
            })
          }
        >
          Taslağa ekle
        </AksiyonButonu>
      </div>
    </div>
  );
}

// Grup rengi ile mudurluk rengi ayristiginda cikan amber uyari (kural zorlanmaz).
function RenkUyarisi({ mesaj, onDuzelt }: { mesaj: string; onDuzelt?: () => void }) {
  return (
    <p className="col-span-2 flex items-center gap-2 border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
      <span className="min-w-0 flex-1">⚠ {mesaj}</span>
      {onDuzelt && (
        <button
          type="button"
          onClick={onDuzelt}
          className="shrink-0 font-semibold underline hover:text-amber-950"
        >
          Müdürlüğün rengine getir
        </button>
      )}
    </p>
  );
}

// Glif kitapligindan secim (`data/tipGlifleri.ts`); yeni tur SVG yazmadan glif secer.
function GlifSecici({
  secili,
  onSec,
  renk,
}: {
  secili: string | null;
  onSec: (glif: string) => void;
  renk: string;
}) {
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {GLIF_ANAHTARLARI.map((anahtar) => (
        <button
          key={anahtar}
          type="button"
          title={anahtar}
          onClick={() => onSec(anahtar)}
          className={`flex h-7 w-7 items-center justify-center border ${
            secili === anahtar ? "ring-2 ring-emerald-500" : ""
          }`}
          style={{ borderColor: renk, color: renk }}
        >
          <GlifIkonu anahtar={anahtar} className="h-4 w-4" />
        </button>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Müdürlükler sekmesi
 * ---------------------------------------------------------------------- */

interface DepartmanlarSekmesiProps {
  departmanlar: Departman[];
  kayitliKodlar: Set<string>;
  turSayilari: Record<string, number>;
  onDuzenle: (kod: string, data: DepartmanUpdateInput) => void;
  onYeniDuzenle: (kod: string, data: Partial<DepartmanCreateInput>) => void;
  onSil: (kod: string) => void;
  onEkle: (departman: DepartmanCreateInput) => void;
}

function DepartmanlarSekmesi({
  departmanlar,
  kayitliKodlar,
  turSayilari,
  onDuzenle,
  onYeniDuzenle,
  onSil,
  onEkle,
}: DepartmanlarSekmesiProps) {
  const [formAcik, setFormAcik] = useState(false);

  return (
    <>
      <p className="mb-2 text-[11px] text-slate-500">
        Müdürlük adı ve rengi, lejantta ve tür açılırlarında <b>ana başlık</b>
        olarak görünür. “Sıra” bu başlıkların ekrandaki dizilişidir (küçük olan
        üstte).
      </p>
      <ul className="mb-4 space-y-2">
        {departmanlar.map((d) => {
          const yeni = !kayitliKodlar.has(d.kod);
          const degis = (data: Partial<DepartmanCreateInput>) =>
            yeni ? onYeniDuzenle(d.kod, data) : onDuzenle(d.kod, data);
          return (
            <li
              key={d.kod}
              className={`overflow-hidden rounded-lg border ${
                yeni ? "border-emerald-300 bg-emerald-50/60" : "border-slate-200"
              }`}
              style={{ boxShadow: `inset 3px 0 0 ${d.renk}` }}
            >
              <div className="flex items-center gap-2 px-3 py-2">
                <input
                  type="color"
                  value={d.renk}
                  onChange={(e) => degis({ renk: e.target.value })}
                  title="Başlık/rozet rengi (harita işaretçilerini etkilemez)"
                  className="h-7 w-7 shrink-0 cursor-pointer rounded border border-slate-300 bg-white p-0.5"
                />
                <div className="min-w-0 flex-1">
                  <input
                    className="w-full border-none bg-transparent p-0 text-sm font-bold focus:outline-none"
                    style={{ color: d.renk }}
                    value={d.ad}
                    onChange={(e) => degis({ ad: e.target.value })}
                  />
                  <span className="block truncate font-mono text-[10px] text-slate-400">
                    {d.kod} · {turSayilari[d.kod] ?? 0} tür
                    {!d.aktif && " · pasif"}
                  </span>
                </div>
                <label className="flex shrink-0 items-center gap-1 text-[11px] text-slate-500">
                  Sıra
                  <input
                    type="number"
                    className="w-14 border border-slate-300 bg-white px-1 py-0.5 text-xs focus:border-emerald-500 focus:outline-none"
                    value={d.sira}
                    onChange={(e) => degis({ sira: Number(e.target.value) })}
                  />
                </label>
                <label className="flex shrink-0 items-center gap-1 text-[11px] text-slate-500">
                  <input
                    type="checkbox"
                    checked={d.aktif}
                    onChange={(e) => degis({ aktif: e.target.checked })}
                  />
                  Aktif
                </label>
                <button
                  type="button"
                  onClick={() => onSil(d.kod)}
                  title="Müdürlüğü sil (bağlı kayıt varsa kaydederken reddedilir)"
                  className="shrink-0 p-1 text-slate-400 transition hover:text-red-600"
                >
                  <IconTrash className="h-3.5 w-3.5" />
                </button>
              </div>
              <input
                className="w-full border-none bg-transparent px-3 pb-2 pt-0 text-[11px] text-slate-500 focus:outline-none"
                placeholder="Açıklama"
                value={d.aciklama ?? ""}
                onChange={(e) => degis({ aciklama: e.target.value })}
              />
            </li>
          );
        })}
      </ul>

      {formAcik ? (
        <YeniDepartmanFormu
          onVazgec={() => setFormAcik(false)}
          onEkle={(departman) => {
            onEkle(departman);
            setFormAcik(false);
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setFormAcik(true)}
          className="flex w-full items-center justify-center gap-1.5 border border-dashed border-slate-300 py-2 text-xs font-medium text-slate-600 transition hover:border-emerald-500 hover:text-emerald-700"
        >
          <IconPlus className="h-3.5 w-3.5" />
          Yeni müdürlük ekle
        </button>
      )}
    </>
  );
}

function YeniDepartmanFormu({
  onEkle,
  onVazgec,
}: {
  onEkle: (departman: DepartmanCreateInput) => void;
  onVazgec: () => void;
}) {
  const [ad, setAd] = useState("");
  const [kod, setKod] = useState("");
  const [kodElle, setKodElle] = useState(false);
  const [aciklama, setAciklama] = useState("");
  const [renk, setRenk] = useState("#64748b");
  const [sira, setSira] = useState(100);

  const etkinKod = kodElle ? kod : koda(ad);
  const gecerli = KOD_DESENI.test(etkinKod) && ad.trim() !== "";

  return (
    <div className="border border-emerald-300 bg-emerald-50/60 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-xs font-semibold text-slate-800">Yeni müdürlük</h4>
        <button type="button" onClick={onVazgec} className="text-slate-400 hover:text-slate-700">
          <IconX className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label>
          <span className={etiketClass}>Ad</span>
          <input
            className={inputClass}
            value={ad}
            placeholder="ör. Zabıta Müdürlüğü"
            onChange={(e) => setAd(e.target.value)}
          />
        </label>
        <label>
          <span className={etiketClass}>Kod (sonradan değiştirilemez)</span>
          <input
            className={`${inputClass} font-mono`}
            value={etkinKod}
            onChange={(e) => {
              setKodElle(true);
              setKod(e.target.value);
            }}
          />
        </label>
        <label className="col-span-2">
          <span className={etiketClass}>Açıklama</span>
          <input
            className={inputClass}
            value={aciklama}
            onChange={(e) => setAciklama(e.target.value)}
          />
        </label>
        <label className="col-span-2">
          <span className={etiketClass}>Başlık rengi</span>
          {/* Paletten secilen renk, bu mudurluge eklenecek turlerin harita rengiyle
              birebir ayni olur; serbest renkte lejantta baslik/satir ayrisabilir. */}
          <div className="mt-0.5 flex flex-wrap items-center gap-1">
            {TIP_GRUPLARI.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setRenk(GRUP_RENGI[g])}
                title={`${TIP_GRUP_ETIKETLERI[g]} grubunun rengi`}
                className={`h-6 w-6 border-2 transition ${
                  renk.toLowerCase() === GRUP_RENGI[g].toLowerCase()
                    ? "border-slate-800"
                    : "border-transparent hover:border-slate-300"
                }`}
                style={{ backgroundColor: GRUP_RENGI[g] }}
              />
            ))}
            <input
              type="color"
              className="ml-1 h-6 w-12 cursor-pointer border border-slate-300 bg-white p-0.5"
              value={renk}
              title="Özel renk (paletle örtüşmezse türler haritada farklı renkte çizilir)"
              onChange={(e) => setRenk(e.target.value)}
            />
          </div>
        </label>
        <label>
          <span className={etiketClass}>Sıra (küçük olan üstte)</span>
          <input
            type="number"
            className={inputClass}
            value={sira}
            onChange={(e) => setSira(Number(e.target.value))}
          />
        </label>
      </div>
      <div className="mt-2 flex justify-end">
        <AksiyonButonu
          tur="birincil"
          disabled={!gecerli}
          onClick={() =>
            onEkle({
              kod: etkinKod,
              ad: ad.trim(),
              aciklama: aciklama.trim() || null,
              renk,
              aktif: true,
              sira,
            })
          }
        >
          Taslağa ekle
        </AksiyonButonu>
      </div>
    </div>
  );
}
