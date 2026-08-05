import { useEffect, useState } from "react";

import {
  createUser,
  listUsers,
  updateUserAktif,
  updateUserDepartman,
  updateUserYaka,
} from "../api/auth";
import { useAuth } from "../auth/AuthContext";
import { useDepartmanlar } from "../hooks/useDepartmanlar";
import { departmanBul } from "../types/departman";
import {
  USER_ROLE_LABELS,
  type User,
  type UserRole,
} from "../types/auth";
import { YAKALAR, YAKA_ETIKETLERI, type Yaka } from "../types/saha";
import { inputClass, labelClass } from "../utils/formSiniflari";


// Admin bu ekrandan personel (calisan), saha calisani veya baska admin olusturabilir.
const OLUSTURULABILIR_ROLLER: UserRole[] = ["calisan", "saha_calisani", "admin"];

/** Departmani ZORUNLU olan roller. Admin tum mudurlukleri gorur, vatandasin
 *  departmani yoktur; ikisinde de alan gosterilmez. Departmansiz bir personelin
 *  kapsami BOS olur - hesap acilir ama kullanici hicbir sey goremez, bu yuzden
 *  backend de (routers/users.py) ayni kurali uygular. */
const DEPARTMANLI_ROLLER: UserRole[] = ["calisan", "saha_calisani"];

export default function PersonelYonetimi() {
  const { user: benim } = useAuth();
  const { data: departmanlar } = useDepartmanlar();
  const [kullanicilar, setKullanicilar] = useState<User[]>([]);
  const [ad, setAd] = useState("");
  const [email, setEmail] = useState("");
  const [parola, setParola] = useState("");
  const [rol, setRol] = useState<UserRole>("calisan");
  // Yalnizca saha ekipleri icin: kadro yakasi ("" = konumdan turet).
  const [yaka, setYaka] = useState<Yaka | "">("");
  // Yeni hesabin mudurlugu; departmanli rollerde zorunlu.
  const [departman, setDepartman] = useState("");
  const [hata, setHata] = useState<string | null>(null);
  const [basari, setBasari] = useState<string | null>(null);
  const [gonderiliyor, setGonderiliyor] = useState(false);
  // Yakasi su an guncellenen kullanicinin id'si (select'i kilitlemek icin).
  const [yakaDegisen, setYakaDegisen] = useState<string | null>(null);
  // Departmani su an guncellenen kullanicinin id'si.
  const [departmanDegisen, setDepartmanDegisen] = useState<string | null>(null);
  // Aktifligi su an degisen kullanici + kapatma onayi bekleyen kullanici.
  // Kapatma iki adimli: hesabi kesmek acik oturumlari da dusurur, geri
  // alinabilir ama kullanici o an disari atilir - tek tikla olmamali.
  const [aktifDegisen, setAktifDegisen] = useState<string | null>(null);
  const [kapatmaOnayi, setKapatmaOnayi] = useState<string | null>(null);

  const yukle = () => {
    listUsers()
      .then(setKullanicilar)
      .catch((e) => setHata((e as Error).message));
  };
  useEffect(yukle, []);

  /** Mevcut bir saha ekibinin kadro yakasini degistirir ("" = konumdan turet). */
  const yakaDegistir = async (u: User, yeni: Yaka | "") => {
    setYakaDegisen(u.id);
    setHata(null);
    setBasari(null);
    try {
      const guncel = await updateUserYaka(u.id, yeni || null);
      setKullanicilar((onceki) =>
        onceki.map((x) => (x.id === guncel.id ? guncel : x)),
      );
      setBasari(
        `${u.full_name || u.email}: ${
          yeni ? YAKA_ETIKETLERI[yeni] : "yaka konumdan türetilecek"
        }`,
      );
    } catch (err) {
      setHata((err as Error).message);
    } finally {
      setYakaDegisen(null);
    }
  };

  /** Mevcut bir personelin mudurlugunu degistirir. Acik oturumlari duser
   *  (backend'de): kapsam degisince kullanicinin ekraninda duran eski listeler
   *  bir sonraki tiklamada 404'lerle karsilasirdi. */
  const departmanDegistir = async (u: User, yeni: string) => {
    if (!yeni || yeni === u.departman) return;
    setDepartmanDegisen(u.id);
    setHata(null);
    setBasari(null);
    try {
      const guncel = await updateUserDepartman(u.id, yeni);
      setKullanicilar((onceki) =>
        onceki.map((x) => (x.id === guncel.id ? guncel : x)),
      );
      setBasari(
        `${u.full_name || u.email}: ${
          departmanBul(departmanlar, yeni)?.ad ?? yeni
        } (oturumları kapatıldı, yeniden giriş yapmalı)`,
      );
    } catch (err) {
      setHata((err as Error).message);
    } finally {
      setDepartmanDegisen(null);
    }
  };

  /** Hesabi acar/kapatir. Kapatma acik oturumlari da dusurdugu icin onaydan
   *  gecer; acmak geri donusu olmayan bir sey yapmadigindan dogrudan calisir. */
  const aktifDegistir = async (u: User, aktif: boolean) => {
    setAktifDegisen(u.id);
    setHata(null);
    setBasari(null);
    try {
      const guncel = await updateUserAktif(u.id, aktif);
      setKullanicilar((onceki) =>
        onceki.map((x) => (x.id === guncel.id ? guncel : x)),
      );
      setBasari(
        `${u.full_name || u.email}: ${
          aktif ? "hesap yeniden açıldı" : "hesap devre dışı bırakıldı, oturumları kapatıldı"
        }`,
      );
    } catch (err) {
      setHata((err as Error).message);
    } finally {
      setAktifDegisen(null);
      setKapatmaOnayi(null);
    }
  };

  const gonder = async (e: React.FormEvent) => {
    e.preventDefault();
    setHata(null);
    setBasari(null);
    if (parola.length < 6) return setHata("Parola en az 6 karakter olmalı");
    if (DEPARTMANLI_ROLLER.includes(rol) && !departman) {
      return setHata("Personel ve saha ekipleri için departman seçin");
    }
    setGonderiliyor(true);
    try {
      const u = await createUser({
        email: email.trim(),
        password: parola,
        full_name: ad.trim() || undefined,
        role: rol,
        yaka: rol === "saha_calisani" && yaka ? yaka : null,
        departman: DEPARTMANLI_ROLLER.includes(rol) ? departman : null,
      });
      setBasari(`${u.email} (${USER_ROLE_LABELS[u.role]}) oluşturuldu`);
      setAd("");
      setEmail("");
      setParola("");
      setRol("calisan");
      setYaka("");
      setDepartman("");
      yukle();
    } catch (err) {
      setHata((err as Error).message);
    } finally {
      setGonderiliyor(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <form onSubmit={gonder} className="space-y-3 border-b border-slate-200 p-4" noValidate>
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Yeni Hesap</h2>
          <p className="text-xs text-slate-500">
            Personel veya yönetici hesabı oluşturun.
          </p>
        </div>

        <div>
          <label className={labelClass} htmlFor="p-ad">
            Ad Soyad <span className="text-slate-400">(opsiyonel)</span>
          </label>
          <input
            id="p-ad"
            className={inputClass}
            value={ad}
            onChange={(e) => setAd(e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="p-email">
            E-posta
          </label>
          <input
            id="p-email"
            type="email"
            className={inputClass}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass} htmlFor="p-parola">
              Parola
            </label>
            <input
              id="p-parola"
              type="password"
              className={inputClass}
              value={parola}
              onChange={(e) => setParola(e.target.value)}
              required
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="p-rol">
              Rol
            </label>
            <select
              id="p-rol"
              className={inputClass}
              value={rol}
              onChange={(e) => setRol(e.target.value as UserRole)}
            >
              {OLUSTURULABILIR_ROLLER.map((r) => (
                <option key={r} value={r}>
                  {USER_ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Departman: kullanicinin gorebilecegi/yonetebilecegi tur kumesini
            belirler ve otomatik atamada isin gidecegi ekibi suzer. */}
        {DEPARTMANLI_ROLLER.includes(rol) && (
          <div>
            <label className={labelClass} htmlFor="p-departman">
              Departman
            </label>
            <select
              id="p-departman"
              className={inputClass}
              value={departman}
              onChange={(e) => setDepartman(e.target.value)}
              required
            >
              <option value="">Seçiniz…</option>
              {(departmanlar ?? []).map((d) => (
                <option key={d.kod} value={d.kod}>
                  {d.ad}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">
              {rol === "saha_calisani"
                ? "Ekibe yalnızca bu müdürlüğün türlerindeki işler otomatik atanır."
                : "Personel yalnızca bu müdürlüğün türlerindeki talepleri ve varlıkları görür."}
            </p>
          </div>
        )}

        {/* Yaka yalnizca saha ekipleri icin anlamli: otomatik atamada ekip ile
            isin yakasi ayni olmak zorunda (Bogaz'i gecen atama yapilmaz). */}
        {rol === "saha_calisani" && (
          <div>
            <label className={labelClass} htmlFor="p-yaka">
              Sorumlu Yaka <span className="text-slate-400">(opsiyonel)</span>
            </label>
            <select
              id="p-yaka"
              className={inputClass}
              value={yaka}
              onChange={(e) => setYaka(e.target.value as Yaka | "")}
            >
              <option value="">Konumdan türet (otomatik)</option>
              {YAKALAR.map((y) => (
                <option key={y} value={y}>
                  {YAKA_ETIKETLERI[y]}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">
              Ekibe yalnızca bu yakadaki işler otomatik atanır. Boş bırakılırsa
              ekibin yakası son bildirdiği konumdan hesaplanır.
            </p>
          </div>
        )}

        {hata && (
          <p className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {hata}
          </p>
        )}
        {basari && (
          <p className="border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {basari}
          </p>
        )}

        <button
          type="submit"
          disabled={gonderiliyor}
          className="w-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {gonderiliyor ? "Oluşturuluyor…" : "Hesap Oluştur"}
        </button>
      </form>

      <div className="p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-900">
          Kullanıcılar{" "}
          <span className="text-xs font-normal text-slate-400">
            ({kullanicilar.length})
          </span>
        </h2>
        <ul className="divide-y divide-slate-100 border border-slate-200">
          {kullanicilar.map((u) => (
            <li key={u.id} className={`px-3 py-2 ${u.is_active ? "" : "bg-slate-50"}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p
                    className={`truncate text-sm ${
                      u.is_active ? "text-slate-800" : "text-slate-400 line-through"
                    }`}
                  >
                    {u.full_name || u.email}
                  </p>
                  {u.full_name && (
                    <p className="truncate text-xs text-slate-400">{u.email}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {!u.is_active && (
                    <span className="border border-red-200 bg-red-50 px-1.5 py-0.5 text-[11px] font-medium text-red-700">
                      Kapalı
                    </span>
                  )}
                  {u.departman && (
                    <DepartmanRozeti
                      ad={departmanBul(departmanlar, u.departman)?.ad ?? u.departman}
                      renk={departmanBul(departmanlar, u.departman)?.renk}
                    />
                  )}
                  <span className="border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
                    {USER_ROLE_LABELS[u.role]}
                  </span>
                </div>
              </div>
              {/* Personelin mudurlugu buradan degistirilir. Bosaltilamaz:
                  departmansiz bir personel hicbir sey goremezdi. */}
              {DEPARTMANLI_ROLLER.includes(u.role) && (
                <div className="mt-1.5 flex items-center gap-2">
                  <label
                    className="shrink-0 text-[11px] text-slate-500"
                    htmlFor={`dep-${u.id}`}
                  >
                    Departman
                  </label>
                  <select
                    id={`dep-${u.id}`}
                    value={u.departman ?? ""}
                    disabled={departmanDegisen === u.id}
                    onChange={(e) => departmanDegistir(u, e.target.value)}
                    className="min-w-0 flex-1 border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-700 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
                  >
                    {!u.departman && <option value="">Seçiniz…</option>}
                    {(departmanlar ?? []).map((d) => (
                      <option key={d.kod} value={d.kod}>
                        {d.ad}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Saha ekiplerinin kadro yakasi buradan degistirilir; otomatik
                  atama yalnizca ayni yakadaki isleri yonlendirir. */}
              {u.role === "saha_calisani" && (
                <div className="mt-1.5 flex items-center gap-2">
                  <label
                    className="shrink-0 text-[11px] text-slate-500"
                    htmlFor={`yaka-${u.id}`}
                  >
                    Sorumlu yaka
                  </label>
                  <select
                    id={`yaka-${u.id}`}
                    value={u.yaka ?? ""}
                    disabled={yakaDegisen === u.id}
                    onChange={(e) => yakaDegistir(u, e.target.value as Yaka | "")}
                    className="min-w-0 flex-1 border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-700 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
                  >
                    <option value="">Konumdan türet (otomatik)</option>
                    {YAKALAR.map((y) => (
                      <option key={y} value={y}>
                        {YAKA_ETIKETLERI[y]}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Hesabi ac/kapat. Kendi hesabini kapatmak backend'de de
                  engelli (kendini disari kilitleme); dugme o yuzden hic
                  gosterilmez - reddedilecek bir islem sunmanin anlami yok. */}
              {benim?.id !== u.id && (
                <div className="mt-1.5 flex items-center gap-2">
                  {!u.is_active ? (
                    <button
                      type="button"
                      disabled={aktifDegisen === u.id}
                      onClick={() => aktifDegistir(u, true)}
                      className="border border-emerald-300 px-2 py-0.5 text-[11px] font-medium text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-50"
                    >
                      {aktifDegisen === u.id ? "Açılıyor…" : "Hesabı Aç"}
                    </button>
                  ) : kapatmaOnayi === u.id ? (
                    <>
                      <span className="text-[11px] text-slate-500">
                        Oturumları kapatılsın mı?
                      </span>
                      <button
                        type="button"
                        onClick={() => setKapatmaOnayi(null)}
                        className="border border-slate-300 px-2 py-0.5 text-[11px] text-slate-600 transition hover:bg-slate-50"
                      >
                        Vazgeç
                      </button>
                      <button
                        type="button"
                        disabled={aktifDegisen === u.id}
                        onClick={() => aktifDegistir(u, false)}
                        className="border border-red-300 bg-red-600 px-2 py-0.5 text-[11px] font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
                      >
                        {aktifDegisen === u.id ? "Kapatılıyor…" : "Evet, kapat"}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setKapatmaOnayi(u.id)}
                      className="border border-red-300 px-2 py-0.5 text-[11px] font-medium text-red-700 transition hover:bg-red-50"
                    >
                      Devre Dışı Bırak
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Departman rozeti: mudurlugun kendi rengini tasir. Renk YALNIZCA burada ve
 *  panellerde kullanilir - haritadaki isaretcilerin rengi tur grubundan gelir,
 *  iki renk sistemi bilincli olarak ayridir. */
export function DepartmanRozeti({ ad, renk }: { ad: string; renk?: string }) {
  return (
    <span
      className="border bg-white px-1.5 py-0.5 text-[11px] font-medium"
      style={{ borderColor: renk ?? "#cbd5e1", color: renk ?? "#475569" }}
      title={ad}
    >
      {ad}
    </span>
  );
}
